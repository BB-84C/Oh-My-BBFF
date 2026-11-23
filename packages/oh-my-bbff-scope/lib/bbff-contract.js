/**
 * Oh-My-BBFF family contract — runtime v1.
 *
 * Zero dependencies. First-party bundles vendor this exact file as
 * `lib/bbff-contract.js` (byte-identical, checked by their tests); external
 * modules may import it from the published `oh-my-bbff-sdk` package.
 *
 * The contract has two service surfaces, both provided by the
 * `oh-my-bbff-widgets` root plugin:
 *
 * - Host: `bbffFamily` — module descriptor registry.
 * - Client: `bbffUi` — card and settings-section registration for the status
 *   panel and the BBFF settings seat.
 *
 * Modules register through Cordis scope injection so activation order and HMR
 * never matter: if the root is missing the injection waits, and the module
 * stays fully functional on its own.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { TOOL_NAME_PATTERN, msg, isMessageRef, SDK_NAMESPACE } from './dsh-adapter.js'
export { TOOL_NAME_PATTERN, msg, isMessageRef, SDK_NAMESPACE }

export const CONTRACT_VERSION = 1
export const AGENT_ANNOTATOR_TIMEOUT_MS = 800
export const EXPOSURE_ANNOTATOR_TIMEOUT_MS = 500
export const EXPOSURE_CONTRIBUTOR_TIMEOUT_MS = 500
export const AGENT_ANNOTATIONS_PER_ID_MAX = 4
export const EXPOSURE_TEXT_MAX_LENGTH = 300
export const REASON_LOCALES_MAX_ENTRIES = 16
export const REASON_LOCALE_KEY_MAX_LENGTH = 32
export const ROOT_RESOLVE_MAX_DEPTH = 64
export const CATALOG_ROWS_MAX = 20000
export const CATALOG_BYTES_MAX = 8388608
export const CATALOG_SOURCES_PER_ROW_MAX = 64
export const CATALOG_PROJECT_PATHS_PER_SKILL_MAX = 64
export const CATALOG_IMPORT_RECORDS_MAX = 10000
export const CATALOG_WRITE_DEBOUNCE_MS = 1000
export const CATALOG_RECONCILE_MS = 30000

/** Default directory holding a package's `locale/<language>.json` dictionaries. */
export const DEFAULT_LOCALE_DIR = 'locale'
/** Package-relative locale directory: one or two plain path segments, no traversal. */
export const LOCALE_DIR_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,31}(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,31})?$/
/** Directory, relative to `$DSH_HOME`, holding user language files. */
export const USER_LOCALE_DIR = 'oh-my-bbff/locale'
/** File name of the exported translation template inside {@link USER_LOCALE_DIR}. */
export const LOCALE_TEMPLATE_FILE = 'template.en.json'
/** Language id accepted in dictionary file names and user language files. */
export const LANGUAGE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/

/** Cordis service key of the host-side family registry. */
export const FAMILY_SERVICE = 'bbffFamily'
/** Cordis service key of the client-side UI registration service. */
export const UI_SERVICE = 'bbffUi'

export const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
export const CARD_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,47}$/

/** v1.3 optional ownership declaration; invalid lists are dropped, not fatal. */
export function validateModuleTools(tools) {
  const errors = []
  if (!Array.isArray(tools) || Array.from(tools).some((name) => typeof name !== 'string' || !TOOL_NAME_PATTERN.test(name))) {
    errors.push('descriptor.tools must be exact tool names matching ' + TOOL_NAME_PATTERN)
  }
  if (Array.isArray(tools) && new Set(tools).size !== tools.length) errors.push('descriptor.tools contains duplicates')
  return { ok: errors.length === 0, errors }
}
/** v1.5 static session ownership; invalid declarations are dropped atomically. */
export function validateModuleExclusiveTools(value, tools) {
  const errors = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('descriptor.exclusiveTools must be an object')
  } else {
    if (!validateModuleTools(value.tools).ok || value.tools.length === 0) errors.push('descriptor.exclusiveTools.tools must be non-empty unique exact tool names')
    if (!isTextOrRef(value.reason, EXPOSURE_TEXT_MAX_LENGTH)) errors.push('descriptor.exclusiveTools.reason must be a message reference or nonblank text of at most 300 characters')
    if (value.reasonLocales !== undefined) {
      const locales = value.reasonLocales
      if (!locales || typeof locales !== 'object' || Array.isArray(locales)
        || Object.entries(locales).length > 16
        || Object.entries(locales).some(([locale, reason]) => !locale.trim() || locale.length > 32
          || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 300)) {
        errors.push('descriptor.exclusiveTools.reasonLocales must map at most 16 nonempty locale keys (at most 32 characters) to nonblank strings (at most 300 characters)')
      }
    }
  }
  if (!validateModuleTools(tools).ok || !Array.isArray(value?.tools)
    || value.tools.some((name) => !tools.includes(name))) errors.push('descriptor.exclusiveTools.tools is not a subset of declared tools')
  return { ok: errors.length === 0, errors }
}

/** Host text: a message reference, or plain text bounded by maxLength. */
function isTextOrRef(value, maxLength) {
  if (isMessageRef(value)) return true
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
}

function validLocales(value, maxLength = EXPOSURE_TEXT_MAX_LENGTH) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).length <= REASON_LOCALES_MAX_ENTRIES
    && Object.entries(value).every(([locale, text]) => locale.trim() && locale.length <= REASON_LOCALE_KEY_MAX_LENGTH
      && typeof text === 'string' && text.trim() && text.trim().length <= maxLength)
}
function optionalFieldErrors(descriptor) {
  const errors = [], ownToolsValid = validateModuleTools(descriptor.tools).ok
  if (descriptor.toolTraits !== undefined) {
    const traits = descriptor.toolTraits
    if (!traits || typeof traits !== 'object' || Array.isArray(traits)
      || Object.entries(traits).some(([name, trait]) => !ownToolsValid || !descriptor.tools.includes(name)
        || !trait || typeof trait !== 'object' || Array.isArray(trait) || !['read','write','delegate'].includes(trait.effect))) {
      errors.push('descriptor.toolTraits must map a subset of declared tools to read/write/delegate effects')
    }
  }
  if (descriptor.requiredTools !== undefined) {
    const value = descriptor.requiredTools
    if (!value || typeof value !== 'object' || Array.isArray(value) || !validateModuleTools(value.tools).ok || !value.tools.length
      || !isTextOrRef(value.reason, EXPOSURE_TEXT_MAX_LENGTH)
      || (value.reasonLocales !== undefined && !validLocales(value.reasonLocales))) {
      errors.push('descriptor.requiredTools must contain non-empty unique exact tools, a bounded reason (message reference or text) and valid reasonLocales')
    }
  }
  if (descriptor.skillMaskProviders !== undefined) {
    const value = descriptor.skillMaskProviders
    if (!Array.isArray(value) || Array.from(value).some(name => typeof name !== 'string' || !name.trim() || name !== name.trim()) || new Set(value).size !== value.length) {
      errors.push('descriptor.skillMaskProviders must be unique nonblank exact provider ids')
    }
  }
  if (descriptor.permissionLayer !== undefined) {
    const value = descriptor.permissionLayer
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isTextOrRef(value.title, MODULE_TITLE_MAX_LENGTH)
      || (value.titleLocales !== undefined && !validLocales(value.titleLocales, MODULE_TITLE_MAX_LENGTH))
      || (value.settingsSectionId !== undefined && !isCardId(value.settingsSectionId))) {
      errors.push('descriptor.permissionLayer must contain a bounded title (message reference or text), valid locales and optional settings section id')
    }
  }
  return errors
}

/** v1.4 session-only tools; malformed contributor results are ignored atomically. */
export function validateExposureContribution(value) {
  const errors = []
  if (value === null) return { ok: true, errors }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['contribution must be an object or null'] }
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools) || Array.from(value.tools).some((tool) => !tool || typeof tool.name !== 'string'
      || !TOOL_NAME_PATTERN.test(tool.name) || typeof tool.description !== 'string')) errors.push('contribution.tools must contain exact names and string descriptions')
    if (Array.isArray(value.tools) && new Set(value.tools.map((tool) => tool?.name)).size !== value.tools.length) errors.push('contribution.tools contains duplicates')
  }
  for (const key of ['exclusive', 'toggleable']) if (value[key] !== undefined && typeof value[key] !== 'boolean') errors.push('contribution.' + key + ' must be boolean')
  if (value.reason !== undefined && typeof value.reason !== 'string') errors.push('contribution.reason must be string')
  if (value.reasonLocales !== undefined && (!value.reasonLocales || typeof value.reasonLocales !== 'object' || Array.isArray(value.reasonLocales)
    || Object.values(value.reasonLocales).some((text) => typeof text !== 'string'))) errors.push('contribution.reasonLocales must map locales to strings')
  return { ok: errors.length === 0, errors }
}
export const MODULE_TITLE_MAX_LENGTH = 60
export const MODULE_DESCRIPTION_MAX_LENGTH = 240
export const CARD_TITLE_MAX_LENGTH = 60
export const CARD_HEIGHT_MIN = 80
export const CARD_HEIGHT_MAX = 900

export const CORE_CARD_ORDER = 0
export const MODULE_CARD_ORDER_DEFAULT = 100

export function isModuleId(value) {
  return typeof value === 'string' && MODULE_ID_PATTERN.test(value)
}

export function isCardId(value) {
  return typeof value === 'string' && CARD_ID_PATTERN.test(value)
}

/** Root-side namespace for persisted card ids: `<moduleId>/<cardId>`. */
export function namespacedCardId(moduleId, cardId) {
  return `${moduleId}/${cardId}`
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** A localized title is `{ zh, en }` with both strings non-empty. */
export function isLocalizedText(value) {
  return !!value && typeof value === 'object'
    && typeof value.zh === 'string' && value.zh.trim().length > 0
    && typeof value.en === 'string' && value.en.trim().length > 0
}

/**
 * Resolve host-produced text to the active language.
 *
 * Host code emits locale message references (`msg(key, params)`), never text.
 * Plain strings pass through verbatim, message references resolve through the
 * owning namespace's bound translate function, and a legacy `{ en, zh, … }` map
 * (third-party modules only) resolves through the caller's legacy resolver.
 *
 * @param value - string, message reference or legacy localized map.
 * @param options.t - translate function bound to the default namespace.
 * @param options.bind - `(ns) => translate` for references carrying their own namespace.
 * @param options.legacy - resolver for legacy `{ en, … }` maps (e.g. `ctx.locale.resolveText`).
 * @returns the resolved text, or an empty string for unusable input.
 */
export function resolveMessage(value, options = {}) {
  if (typeof value === 'string') return value
  if (isMessageRef(value)) {
    const translate = typeof options.bind === 'function' && value.ns ? options.bind(value.ns) : options.t
    if (typeof translate !== 'function') return value.key
    return String(translate(value.key, resolveParams(value.params, options)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.en === 'string') {
    return typeof options.legacy === 'function' ? String(options.legacy(value)) : String(value.en)
  }
  return ''
}

function validateLocaleDeclaration(value, errors) {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('descriptor.locale must be an object')
    return
  }
  const extra = Object.keys(value).filter((key) => key !== 'dir')
  if (extra.length > 0) errors.push('descriptor.locale has unsupported fields: ' + extra.join(', '))
  if (value.dir !== undefined && (typeof value.dir !== 'string' || !LOCALE_DIR_PATTERN.test(value.dir))) {
    errors.push('descriptor.locale.dir must be a package-relative directory such as "locale"')
  }
}

function validateTitle(target, kind, allowLocalized, errors) {
  if (isMessageRef(target.title)) return
  if (allowLocalized && isLocalizedText(target.title)) {
    if (target.title.zh.trim().length > CARD_TITLE_MAX_LENGTH || target.title.en.trim().length > CARD_TITLE_MAX_LENGTH) {
      errors.push(`${kind} title is longer than ${CARD_TITLE_MAX_LENGTH} characters`)
    }
    return
  }
  const title = text(target.title)
  if (title.length === 0) errors.push(`${kind} title is required`)
  else if (title.length > MODULE_TITLE_MAX_LENGTH) errors.push(`${kind} title is longer than ${MODULE_TITLE_MAX_LENGTH} characters`)
}

function validateTitleAndDescription(target, kind, errors, allowLocalized = false) {
  validateTitle(target, kind, allowLocalized, errors)
  if (target.description !== undefined) {
    if (isMessageRef(target.description)) return
    if (text(target.description).length === 0) errors.push(`${kind} description is empty`)
    else if (text(target.description).length > MODULE_DESCRIPTION_MAX_LENGTH) errors.push(`${kind} description is longer than ${MODULE_DESCRIPTION_MAX_LENGTH} characters`)
  }
}

/**
 * Interpolation parameters may themselves be host text: a nested message
 * reference or legacy localized map is resolved to a string first, so one
 * module can embed another module's text in its own template.
 */
function resolveParams(params, options) {
  if (!params || typeof params !== 'object') return undefined
  const resolved = {}
  for (const [name, item] of Object.entries(params)) {
    resolved[name] = isMessageRef(item) || (item && typeof item === 'object' && typeof item.en === 'string')
      ? resolveMessage(item, options)
      : item
  }
  return resolved
}

/**
 * Validate a host-side module descriptor. Returns `{ ok, errors }`; the root
 * applies the same rules. Registration helpers never throw on invalid input.
 */
export function validateModuleDescriptor(descriptor) {
  const errors = []
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return { ok: false, errors: ['descriptor must be an object'] }
  if (descriptor.contract !== CONTRACT_VERSION) errors.push(`descriptor.contract must be ${CONTRACT_VERSION}`)
  if (!isModuleId(descriptor.id)) errors.push('descriptor.id must match /^[a-z][a-z0-9-]{0,31}$/')
  validateTitleAndDescription(descriptor, 'module', errors)
  if (typeof descriptor.version !== 'string' || descriptor.version.length === 0) errors.push('descriptor.version is required')
  if (typeof descriptor.packageName !== 'string' || descriptor.packageName.length === 0) errors.push('descriptor.packageName is required')
  if (typeof descriptor.packageName === 'string' && descriptor.packageName && !descriptor.packageName.startsWith('oh-my-bbff-')) errors.push('descriptor.packageName should use the oh-my-bbff- prefix')
  validateLocaleDeclaration(descriptor.locale, errors)
  if (descriptor.apiBase !== undefined && (typeof descriptor.apiBase !== 'string' || !descriptor.apiBase.startsWith('/'))) errors.push('descriptor.apiBase must be an absolute path when present')
  if (descriptor.ui !== undefined) {
    if (typeof descriptor.ui !== 'object' || descriptor.ui === null) errors.push('descriptor.ui must be an object when present')
    else {
      const cards = descriptor.ui.cards
      if (cards !== undefined) {
        if (!Array.isArray(cards) || cards.some((card) => !isCardId(card))) errors.push('descriptor.ui.cards must be card ids')
        if (Array.isArray(cards) && new Set(cards).size !== cards.length) errors.push('descriptor.ui.cards contains duplicates')
      }
      if (descriptor.ui.settings !== undefined && typeof descriptor.ui.settings !== 'boolean') errors.push('descriptor.ui.settings must be a boolean')
    }
  }
  const warnings = descriptor.tools === undefined ? [] : validateModuleTools(descriptor.tools).errors
  if (descriptor.exclusiveTools !== undefined) warnings.push(...validateModuleExclusiveTools(descriptor.exclusiveTools, descriptor.tools).errors)
  warnings.push(...optionalFieldErrors(descriptor))
  return { ok: errors.length === 0, errors, ...(warnings.length ? { warnings } : {}) }
}

/**
 * Validate a client-side card definition. `component` must be a function
 * (React component); the root renders it as the card body.
 */
export function validateCard(card) {
  const errors = []
  if (!card || typeof card !== 'object') return { ok: false, errors: ['card must be an object'] }
  if (!isCardId(card.id)) errors.push('card.id must match /^[a-z0-9][a-z0-9._-]{0,47}$/')
  validateTitleAndDescription(card, 'card', errors, true)
  if (typeof card.component !== 'function') errors.push('card.component must be a function')
  if (card.order !== undefined && (!Number.isFinite(card.order) || card.order < 0)) errors.push('card.order must be a non-negative number')
  if (card.defaultHeight !== undefined && (!Number.isFinite(card.defaultHeight) || card.defaultHeight < CARD_HEIGHT_MIN || card.defaultHeight > CARD_HEIGHT_MAX)) {
    errors.push(`card.defaultHeight must be ${CARD_HEIGHT_MIN}...${CARD_HEIGHT_MAX} px`)
  }
  if (card.legacyIds !== undefined) {
    if (!Array.isArray(card.legacyIds) || card.legacyIds.some((id) => typeof id !== 'string' || id.length === 0)) errors.push('card.legacyIds must be non-empty strings')
  }
  return { ok: errors.length === 0, errors }
}

/** Validate a client-side settings-section definition. */
export function validateSettingsSection(section) {
  const errors = []
  if (!section || typeof section !== 'object') return { ok: false, errors: ['section must be an object'] }
  if (!isCardId(section.id)) errors.push('section.id must match /^[a-z0-9][a-z0-9._-]{0,47}$/')
  if (section.moduleId !== undefined && !isModuleId(section.moduleId)) errors.push('section.moduleId must be a valid module id')
  validateTitleAndDescription(section, 'section', errors, true)
  if (typeof section.component !== 'function') errors.push('section.component must be a function')
  if (section.order !== undefined && (!Number.isFinite(section.order) || section.order < 0)) errors.push('section.order must be a non-negative number')
  return { ok: errors.length === 0, errors }
}

function warn(ctx, errors) {
  try { ctx.logger?.warn?.(`oh-my-bbff-sdk: ${errors.join('; ')}`) } catch {}
}

function registerWith(ctx, serviceKey, callback) {
  if (!ctx || typeof ctx.inject !== 'function') {
    warn(ctx, [`ctx.inject is required to register with ${serviceKey}`])
    return () => {}
  }
  return ctx.inject([serviceKey], (scope) => {
    const service = scope.get(serviceKey)
    if (!service || service.contract !== CONTRACT_VERSION) return
    callback(scope, service)
  })
}

/**
 * Register a host-side module descriptor with the family root.
 *
 * @param {object} ctx Cordis context (host or client plugin context).
 * @param {object} descriptor FamilyModuleDescriptor.
 * @returns {() => void} disposer of the `ctx.inject` effect.
 */
export function registerFamilyModule(ctx, descriptor) {
  const { ok, errors, warnings = [] } = validateModuleDescriptor(descriptor)
  if (!ok) warn(ctx, errors)
  if (warnings.length) warn(ctx, warnings)
  // The root validates independently, drops only invalid optional fields and
  // retains their warnings in diagnostics. Do not erase that evidence here.
  return registerWith(ctx, FAMILY_SERVICE, (scope, family) => {
    const id = descriptor && typeof descriptor.id === 'string' ? descriptor.id : 'rejected'
    scope.effect(() => family.register(descriptor), `bbff:${id}:family`)
  })
}

/**
 * Register client-side cards and settings sections with the family root.
 *
 * @param {object} ctx Cordis client context.
 * @param {{cards?: object[], sections?: object[]}} additions
 * @returns {() => void} disposer of the `ctx.inject` effect.
 */
export function registerUiAdditions(ctx, additions = {}) {
  const cards = Array.isArray(additions.cards) ? additions.cards : []
  const sections = Array.isArray(additions.sections) ? additions.sections : []
  const errors = []
  for (const card of cards) errors.push(...validateCard(card).errors)
  for (const section of sections) errors.push(...validateSettingsSection(section).errors)
  if (errors.length > 0) {
    warn(ctx, errors)
    return () => {}
  }
  return registerWith(ctx, UI_SERVICE, (scope, ui) => {
    for (const card of cards) scope.effect(() => ui.registerCard(card), `bbff:${card.id}:card`)
    for (const section of sections) scope.effect(() => ui.registerSettingsSection(section), `bbff:${section.id}:section`)
  })
}

// ---------------------------------------------------------------------------
// Session-read budget (owner decision, 2026-11-22): a session log larger than
// 30 MB that has not been written for 7 days is never decoded by a first-party
// plugin. DSH decompresses a whole compressed log even for a logical
// `read(offset)`, so decoding historical logs saturates the host; skipping is
// cheap (one `stat`) and the partial coverage is reported as a diagnostic with
// the session id, its size and its age — never a silent gap.
//
// The thresholds are settings values with these defaults, not call-site
// literals. A first-party plugin creates ONE budget per read surface with its
// own settings resolver and asks it before opening a log.
// ---------------------------------------------------------------------------
/** Diagnostic code a consumer records instead of decoding a log. */
export const SESSION_READ_SKIP_CODE = 'session-read-skipped'
/** Dictionary key (in the consumer's namespace) for the diagnostic reason. */
export const SESSION_READ_SKIP_REASON_KEY = 'diag.sessionReadSkipped'
/** Owner defaults: > 30 MiB AND untouched for 7 days. */
export const SESSION_READ_LIMIT_DEFAULTS = Object.freeze({ maxSizeMb: 30, maxAgeDays: 7 })
/** Settings bounds for the two thresholds. */
export const SESSION_READ_LIMIT_RANGES = Object.freeze({ maxSizeMb: Object.freeze({ min: 1, max: 4096 }), maxAgeDays: Object.freeze({ min: 1, max: 3650 }) })
/** Persisted session log filenames, newest first. */
export const SESSION_LOG_FILENAMES = Object.freeze(['session.v4.jsonl.zstd', 'session.v4.jsonl'])
const SESSION_MIB = 1024 * 1024
const SESSION_DAY_MS = 24 * 60 * 60 * 1000
/** Resolve the two thresholds from settings, clamped into their ranges. */
export function sessionReadLimits(settings = {}) {
  // Accept both the bare contract keys and the settings names a package exposes.
  const pick = (key, settingKey) => {
    const source = settings || {}
    const raw = Object.hasOwn(source, key) ? source[key] : Object.hasOwn(source, settingKey) ? source[settingKey] : NaN
    const value = Number(raw), range = SESSION_READ_LIMIT_RANGES[key]
    return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : SESSION_READ_LIMIT_DEFAULTS[key]
  }
  const maxSizeMb = pick('maxSizeMb', 'sessionReadMaxSizeMb'), maxAgeDays = pick('maxAgeDays', 'sessionReadMaxAgeDays')
  return Object.freeze({ maxSizeMb, maxAgeDays, maxSizeBytes: Math.round(maxSizeMb * SESSION_MIB), maxAgeMs: Math.round(maxAgeDays * SESSION_DAY_MS) })
}
/** Owner rule: skip only when BOTH hold — larger than the size limit AND older than the age limit. */
export function skippableSessionLog(stats = {}, now = Date.now(), limits = sessionReadLimits()) {
  const sizeBytes = stats && stats.sizeBytes, mtimeMs = stats && stats.mtimeMs
  return Number.isFinite(sizeBytes) && Number.isFinite(mtimeMs) && sizeBytes > limits.maxSizeBytes && now - mtimeMs > limits.maxAgeMs
}
/** Interpolation params for SESSION_READ_SKIP_REASON_KEY. */
export function sessionReadSkipParams(verdict = {}) {
  const stats = verdict.stats || {}, limits = verdict.limits || sessionReadLimits()
  return {
    sessionId: String(verdict.sessionId || ''),
    sizeMb: Math.round(Number(stats.sizeBytes || 0) / SESSION_MIB),
    ageDays: Math.floor(Math.max(0, Number(verdict.ageMs || 0)) / SESSION_DAY_MS),
    maxSizeMb: limits.maxSizeMb,
    maxAgeDays: limits.maxAgeDays,
  }
}
/**
 * Stat a persisted session log without opening it: `$DSH_HOME/sessions/<bucket>/<id>/<file>`.
 * Returns `null` when the session is not stored (a live session has no cold log).
 */
export async function statSessionLog(sessionsRoot, sessionId) {
  if (typeof sessionsRoot !== 'string' || !sessionsRoot) return null
  if (typeof sessionId !== 'string' || !sessionId || sessionId.includes('/') || sessionId.includes('\\') || sessionId.includes('..')) return null
  let buckets
  try { buckets = await fs.readdir(sessionsRoot, { withFileTypes: true }) } catch { return null }
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue
    for (const filename of SESSION_LOG_FILENAMES) {
      const file = path.join(sessionsRoot, bucket.name, sessionId, filename)
      try {
        const info = await fs.stat(file)
        if (info.isFile()) return { sizeBytes: info.size, mtimeMs: info.mtimeMs, path: file }
      } catch {}
    }
  }
  return null
}
/**
 * One read-surface budget: stat each session at most once per `cacheMs`, never
 * decode. `exempt` covers the session the agent runs in and explicit user actions.
 */
export function createSessionReadBudget({ sessionsRoot, getSettings = () => ({}), now = Date.now, cacheMs = 30000, stat = statSessionLog } = {}) {
  const cache = new Map()
  const settingsOf = () => (typeof getSettings === 'function' ? getSettings() || {} : {})
  async function check(sessionId, { exempt = false } = {}) {
    const limits = sessionReadLimits(settingsOf())
    if (exempt) return { skipped: false, exempt: true, sessionId, limits }
    const id = String(sessionId || '')
    const cached = cache.get(id)
    if (cached && now() - cached.at < cacheMs) return { ...cached.verdict, limits, cached: true }
    const stats = await stat(sessionsRoot, id)
    const ageMs = stats ? Math.max(0, now() - stats.mtimeMs) : 0
    const skipped = !!stats && skippableSessionLog(stats, now(), limits)
    const verdict = Object.freeze({ skipped, stats, sessionId: id, ageMs, limits, ...(skipped ? { code: SESSION_READ_SKIP_CODE, reasonKey: SESSION_READ_SKIP_REASON_KEY } : {}) })
    cache.set(id, { at: now(), verdict })
    while (cache.size > 4096) cache.delete(cache.keys().next().value)
    return verdict
  }
  return Object.freeze({
    check,
    limits: () => sessionReadLimits(settingsOf()),
    /** Drop cached stats (tests, settings changes); never touches session logs. */
    reset: () => cache.clear(),
  })
}

