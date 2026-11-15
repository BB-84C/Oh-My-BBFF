/** Versioned Memory settings. One data source supplies effective values, defaults and limits. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_DATA, PROMPT_DEFAULTS, SETTINGS_DEFINITIONS, SETTING_KEYS, cloneData, shippedSettings } from './defaults.js'
import { validWorkspaceMemoryDirectory } from './directories.js'
import { MODULE_ID } from './identity.js'
import { msg } from './host-ref.js'
import { localeError, messageOf } from './locale-message.js'
import { failedSettingDescriptors, memorySettingDescriptors } from './settings-metadata.js'

export const READONLY_PROMPTS = Object.freeze(['skill'])
export const SETTINGS_VERSION = DEFAULT_DATA.settingsVersion
export const SETTINGS_KEYS = SETTING_KEYS
export const MODES = SETTINGS_DEFINITIONS.defaultMode.options
export const ROUTE_LIMITS = Object.fromEntries(['routeWindowTurns', 'routeTopK', 'routeMaxBytes'].map(key => [key, { min: SETTINGS_DEFINITIONS[key].min, max: SETTINGS_DEFINITIONS[key].max }]))
export const defaultSettings = shippedSettings
export const normalizeSettings = input => normalize(input)
export function settingsPaths({ home }) {
  const root = join(home, DEFAULT_DATA.storage.settingsDirectory)
  return { root, file: join(root, 'settings.json') }
}

function decode(value, field, strict) {
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw localeError(msg('validate.boolean'))
    return value
  }
  if (field.type === 'enum') {
    if (!field.options.includes(value)) throw localeError(msg('validate.enum', { options: field.options.join(', ') }))
    return value
  }
  if (field.type === 'string-list') {
    if (!Array.isArray(value) || value.some(item => !validWorkspaceMemoryDirectory(item))) throw localeError(msg('validate.directories'))
    return [...new Set(value.map(item => item.trim().replace(/\\/g, '/').replace(/\/+$/, '') || '.'))]
  }
  if (field.type === 'string') {
    if (typeof value !== 'string') throw localeError(msg('validate.text'))
    if (value.length > field.maxLength) throw localeError(msg('validate.maxChars', { count: field.maxLength }))
    return value.trim()
  }
  if (field.type === 'nullable-integer' && value === null) return null
  const number = strict ? value : Number(value)
  if (typeof number !== 'number' || !Number.isFinite(number)) throw localeError(msg('validate.finite'))
  const integer = field.type !== 'number'
  if (strict && integer && !Number.isInteger(number)) throw localeError(msg('validate.integer'))
  const rounded = integer ? Math.round(number) : number
  if (strict && (rounded < field.min || rounded > field.max)) throw localeError(msg('validate.between', { min: field.min, max: field.max }))
  return Math.max(field.min, Math.min(field.max, rounded))
}
function decodePrompts(value, strict, diagnostics) {
  const result = cloneData(PROMPT_DEFAULTS)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw localeError(msg('validate.promptsObject'))
  for (const [key, text] of Object.entries(value)) {
    if (!Object.hasOwn(PROMPT_DEFAULTS, key)) {
      if (strict) throw localeError(msg('validate.unknownPrompt', { key }))
      diagnostics.push({ key: 'prompts.' + key, reason: msg('diag.settings.unknownPrompt') });continue
    }
    if (key === 'skill') { if (text !== PROMPT_DEFAULTS.skill) diagnostics.push({ key: 'prompts.skill', reason: msg('diag.settings.skillManaged') });continue }
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > DEFAULT_DATA.promptTextMaxBytes) {
      if (strict) throw localeError(msg('validate.promptText', { key, bytes: DEFAULT_DATA.promptTextMaxBytes }))
      diagnostics.push({ key: 'prompts.' + key, reason: msg('diag.settings.invalidPrompt') });continue
    }
    result[key] = text
  }
  return result
}
function consistency(settings) {
  if (settings.budgetMode === 'fixed' && (!Number.isSafeInteger(settings.budgetFixedBytes) || settings.budgetFixedBytes <= 0)) return { key: 'budgetMode', reason: msg('validate.fixedBudget') }
  if (settings.residentModelMode === 'fixed' && (!settings.residentProvider || !settings.residentModel)) return { key: 'residentModelMode', reason: msg('validate.fixedModel') }
  if (settings.leaseStaleMs <= settings.leaseHeartbeatMs) return { key: 'leaseStaleMs', reason: msg('validate.leaseStale') }
  return null
}
function normalize(input = {}, diagnostics = []) {
  const result = defaultSettings()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result
  for (const [key, field] of Object.entries(SETTINGS_DEFINITIONS)) {
    if (input[key] === undefined) continue
    try {
      result[key] = decode(input[key], field, false)
      if (JSON.stringify(result[key]) !== JSON.stringify(input[key])) diagnostics.push({ key, reason: msg('diag.settings.normalized') })
    } catch (error) { diagnostics.push({ key, reason: msg('diag.settings.invalidValue', { error: messageOf(error) }) }) }
  }
  if (input.prompts !== undefined) {
    try { result.prompts = decodePrompts(input.prompts, false, diagnostics) }
    catch (error) { diagnostics.push({ key: 'prompts', reason: msg('diag.settings.promptsInvalid', { error: messageOf(error) }) }) }
  }
  for (let issue; (issue = consistency(result));) {
    diagnostics.push(issue)
    if (issue.key === 'leaseStaleMs') {
      result.leaseHeartbeatMs = SETTINGS_DEFINITIONS.leaseHeartbeatMs.default
      result.leaseStaleMs = SETTINGS_DEFINITIONS.leaseStaleMs.default
    } else result[issue.key] = SETTINGS_DEFINITIONS[issue.key].default
  }
  return result
}

/** Old explicit plugin config is migration input, never a second hidden effective authority. */
export function legacySettings(config = {}) {
  const result = {}
  for (const key of Object.keys(SETTINGS_DEFINITIONS)) if (config[key] !== undefined) result[key] = config[key]
  if (Number.isFinite(config.injectBudgetBytes) && config.injectBudgetBytes > 0) { result.budgetMode = 'fixed';result.budgetFixedBytes = config.injectBudgetBytes }
  if (config.dream === false) result.dreamEnabled = false
  const dream = config.dream && typeof config.dream === 'object' ? config.dream : {}
  for (const [old, current] of Object.entries({ enabled: 'dreamEnabled', autoWake: 'dreamAutoWake', wakeIntervalHours: 'wakeIntervalHours', tickMs: 'schedulerTickMs', bootDelayMs: 'schedulerBootDelayMs', heartbeatMs: 'leaseHeartbeatMs', leaseStaleMs: 'leaseStaleMs', pageBytes: 'dreamPageBytes' })) if (dream[old] !== undefined) result[current] = dream[old]
  for (const [old, current] of Object.entries({ maxSessions: 'deltaMaxSessions', maxMessagesPerSession: 'deltaMaxMessagesPerSession', maxBytesPerSession: 'deltaMaxBytesPerSession', maxBytesTotal: 'deltaMaxBytesTotal' })) if (dream.deltaLimits?.[old] !== undefined) result[current] = dream.deltaLimits[old]
  if (config.wakeIntervalHours !== undefined) result.wakeIntervalHours = config.wakeIntervalHours
  return result
}
export function settingsSnapshot({ file, legacy = {} }) {
  const diagnostics = [], defaults = defaultSettings(), migrated = legacySettings(legacy)
  let saved = {}
  if (existsSync(file)) {
    try {
      saved = JSON.parse(readFileSync(file, 'utf8'))
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('settings document is not an object')
    } catch (error) { saved = {};diagnostics.push({ key: 'settings', reason: msg('diag.settings.unreadable', { error: String(error.message) }) }) }
  }
  const merged = { ...migrated, ...saved, prompts: { ...PROMPT_DEFAULTS, ...(migrated.prompts || {}), ...(saved.prompts || {}) } }
  const settings = normalize(merged, diagnostics)
  // `budgetMode: auto` changed meaning in 0.7.2: it now caps at a share of the session
  // model's context window instead of multiplying the discovered file total. An
  // explicitly saved auto value therefore gets a visible migration note; nothing is
  // rewritten, and the operator can choose fixed bytes instead.
  if (settings.budgetMode === 'auto' && (Object.hasOwn(saved, 'budgetMode') && !(Number(saved.version) >= DEFAULT_DATA.settingsVersion) || Object.hasOwn(migrated, 'budgetMode') && !Object.hasOwn(saved, 'budgetMode'))) diagnostics.push({ code: 'budget-auto-semantics-changed', key: 'budgetMode', reason: msg('diag.settings.budgetAutoChanged') })
  const sources = Object.fromEntries(SETTINGS_KEYS.map(key => [key, Object.hasOwn(saved, key) ? 'saved' : Object.hasOwn(migrated, key) ? 'legacy-config' : 'default']))
  for (const key of Object.keys(PROMPT_DEFAULTS)) sources['prompts.' + key] = key === 'skill' ? 'packaged-readonly' : Object.hasOwn(saved.prompts || {}, key) ? 'saved' : 'default'
  const fields = Object.fromEntries(Object.entries(SETTINGS_DEFINITIONS).map(([key, field]) => [key, { ...cloneData(field), label: msg('setting.' + key + '.label'), source: msg('source.shippedDefaults'), settingPath: MODULE_ID + '.' + key }]))
  const limits = Object.fromEntries(Object.entries(SETTINGS_DEFINITIONS).filter(([, field]) => field.min !== undefined || field.maxLength !== undefined).map(([key, field]) => [key, { ...(field.min !== undefined ? { min: field.min, max: field.max } : {}), ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}) }]))
  limits.prompts = { maxBytes: DEFAULT_DATA.promptTextMaxBytes }
  limits.structural = cloneData(DEFAULT_DATA.structuralLimits)
  let settingDescriptors
  try { settingDescriptors = memorySettingDescriptors({ defaults: publicSettings(defaults), readonlyPrompts: READONLY_PROMPTS }) } catch (error) { settingDescriptors = failedSettingDescriptors(error) }
  return { settings, defaults: publicSettings(defaults), readonlyPrompts: READONLY_PROMPTS, fields, limits, sources, diagnostics, groups: Object.fromEntries([...new Set(Object.values(SETTINGS_DEFINITIONS).map(field => field.group))].map(id => [id, msg('settings.group.' + id)])), policies: cloneData(DEFAULT_DATA.policies), storage: cloneData(DEFAULT_DATA.storage), source: msg('source.shippedDefaults'), settingDescriptors }
}
export function loadSettings({ file, legacy }) { return settingsSnapshot({ file, legacy }).settings }
/** Persist only explicitly changed keys; one save must not freeze every shipped default. */
export function saveSettingsPatch({ file, patch, settings }) {
  let document = {}
  if (existsSync(file)) {
    document = JSON.parse(readFileSync(file, 'utf8'))
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw localeError(msg('error.repairRequired'))
  }
  document = { ...document, version: SETTINGS_VERSION }
  for (const key of Object.keys(patch)) {
    if (key === 'prompts') document.prompts = { ...(document.prompts || {}), ...cloneData(patch.prompts) }
    else document[key] = cloneData(settings[key])
  }
  mkdirSync(dirname(file), { recursive: true });const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');renameSync(temporary, file)
}
export function saveSettings({ file, settings }) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(normalize(settings), null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}
export function publicSettings(settings) {
  return Object.fromEntries(SETTINGS_KEYS.map(key => [key, cloneData(settings[key] ?? defaultSettings()[key])]))
}
export function validateSettingsPatch(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: msg('error.settingsMustBeObject') }
  const keys = Object.keys(patch)
  if (!keys.length || keys.some(key => !SETTINGS_KEYS.includes(key))) return { ok: false, error: msg('error.settingsUnknownFields', { fields: SETTINGS_KEYS.join(', ') }) }
  const next = normalize(current)
  try {
    for (const key of keys) {
      try {
        if (key === 'prompts') {
          if (!patch.prompts || typeof patch.prompts !== 'object' || Array.isArray(patch.prompts)) throw localeError(msg('error.promptsMustBeObject'))
          if (Object.hasOwn(patch.prompts, 'skill')) throw localeError(msg('error.skillNotWritable'))
          next.prompts = decodePrompts({ ...next.prompts, ...patch.prompts }, true, [])
        } else next[key] = decode(patch[key], SETTINGS_DEFINITIONS[key], true)
      } catch (error) { throw localeError(msg('validate.field', { field: key, error: messageOf(error) })) }
    }
    const issue = consistency(next)
    if (issue) throw localeError(issue.reason)
    return { ok: true, settings: next }
  } catch (error) { return { ok: false, error: messageOf(error) } }
}
