/**
 * Memory settings presentation contract v1.
 *
 * Same family shape as the Scope and Widgets `lib/settings-metadata.js`:
 * `displayLabel / options[{value,displayLabel}] / default / description / limits / source`.
 * This module is the Memory instance of settings-metadata v1; a later SDK upgrade merges the
 * three instances into one shared contract.
 *
 * Everything here is derived from shipped default data. There is no persisted key, no second
 * copy of a default value and no client-owned label map: the Host owns the descriptors and the
 * Client only renders what it receives.
 *
 * All readable text is a locale message reference (`msg(key)`), never a literal: the package's
 * `locale/{en,zh}.json` dictionaries are the only place UI text lives. References carry no
 * namespace, so they resolve in this package's own dictionary.
 */
import { DEFAULT_DATA, PROMPT_DEFAULTS, SETTINGS_DEFINITIONS, cloneData, promptVariables } from './defaults.js'
import { MODULE_ID } from './identity.js'
import { msg } from './host-ref.js'
import presentationData from './settings-presentation.json' with { type: 'json' }

export const SETTINGS_METADATA_VERSION = 1

/** Group order follows the shipped field order; group titles are dictionary keys. */
const GROUP_ORDER = Object.freeze([...new Set(Object.values(SETTINGS_DEFINITIONS).map(field => field.group))])
/** Enum values are data; their readable labels live in the dictionary as `option.<value>`. */
const OPTION_VALUES = Object.freeze(new Set(['full', 'routed', 'auto', 'fixed', 'default']))
/** Unit codes are data; their readable labels live in the dictionary as `unit.<code>`. */
const UNIT_CODES = Object.freeze(new Set(['hours', 'bytes', 'ms', 'percent']))
/** Presentation label slots consumed by the settings layout; text lives in `settings.<slot>`. */
const PRESENTATION_LABELS = Object.freeze(['advancedTitle', 'advancedChanged', 'advancedCount', 'helpLabel', 'missingEffectNotice', 'invalidGroupsNotice'])

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function slugOf(key) {
  return key.replace(/[A-Z]/g, match => '-' + match.toLowerCase())
}

function controlOf(type) {
  if (type === 'boolean') return 'checkbox'
  if (type === 'enum') return 'select'
  if (type === 'string-list') return 'list'
  if (type === 'string') return 'text'
  return 'number'
}

function optionEntry(value) {
  if (!OPTION_VALUES.has(value)) throw new Error('Missing presentation label for enum option: ' + value)
  return { value, displayLabel: msg('option.' + value) }
}

function unitEntry(unit) {
  if (!UNIT_CODES.has(unit)) throw new Error('Missing presentation label for unit: ' + unit)
  return { code: unit, displayLabel: msg('unit.' + unit) }
}

function limitsOf(field) {
  const limits = {}
  if (field.min !== undefined) { limits.min = field.min; limits.max = field.max }
  if (field.maxLength !== undefined) limits.maxLength = field.maxLength
  return Object.keys(limits).length ? limits : null
}

function tooltipOf(entry) {
  const range = entry.limits
    ? (entry.limits.maxLength !== undefined
      ? msg('tooltip.rangeMaxLength', { count: entry.limits.maxLength })
      : msg('tooltip.rangeMinMax', { min: entry.limits.min, max: entry.limits.max }))
    : ''
  return msg('tooltip.item', {
    label: entry.displayLabel,
    key: entry.path,
    range,
    source: entry.source.contract,
  })
}

/**
 * Build the Memory instance of settings-metadata v1.
 *
 * @param {{defaults?: object, readonlyPrompts?: string[]}} input `defaults` is the shipped
 *   settings document the Host already publishes, so default rows always show real values.
 */
export function memorySettingDescriptors({ defaults, readonlyPrompts = [] } = {}) {
  const shipped = defaults && typeof defaults === 'object' ? defaults : {}
  const readonly = new Set((readonlyPrompts || []).filter(key => Object.hasOwn(PROMPT_DEFAULTS, key)))
  const settings = Object.entries(SETTINGS_DEFINITIONS).map(([key, field]) => {
    const limits = limitsOf(field), options = field.type === 'enum' ? field.options.map(optionEntry) : null
    const entry = {
      path: key,
      field: slugOf(key),
      group: field.group,
      effect: msg('setting.' + key + '.effect'),
      ...(presentationData.fields[key] || { importance: presentationData.defaultImportance, advancedGroup: field.group }),
      control: controlOf(field.type),
      displayLabel: msg('setting.' + key + '.label'),
      description: msg('setting.' + key + '.description'),
      default: cloneData(Object.hasOwn(shipped, key) ? shipped[key] : field.default),
      nullable: field.type === 'nullable-integer',
      step: field.type === 'number' ? 'any' : 1,
      source: { contract: msg('source.settingsContract'), settingPath: MODULE_ID + '.' + key, defaultPath: 'settingDefaults.' + key },
    }
    if (options) entry.options = options
    if (field.unit) entry.unit = unitEntry(field.unit)
    if (limits) entry.limits = limits
    entry.tooltip = tooltipOf(entry)
    return entry
  })
  const groups = GROUP_ORDER.map((id, order) => ({
    id,
    order,
    displayLabel: msg('settings.group.' + id),
    fieldCount: settings.filter(entry => entry.group === id).length,
  }))
  const prompts = Object.keys(PROMPT_DEFAULTS).map(key => {
    const isReadonly = readonly.has(key)
    return {
      path: key,
      field: 'prompt-' + slugOf(key),
      group: 'prompts',
      control: 'textarea',
      displayLabel: msg('prompt.' + key + '.label'),
      description: msg('prompt.' + key + '.description'),
      placeholders: promptVariables(PROMPT_DEFAULTS[key]),
      readonly: isReadonly,
      source: { contract: msg('source.settingsContract'), settingPath: MODULE_ID + '.prompts.' + key, defaultPath: 'promptDefaults.' + key },
    }
  })
  const readonlyItems = prompts.filter(entry => entry.readonly).map(entry => ({
    path: 'prompts.' + entry.path,
    displayLabel: entry.displayLabel,
    note: msg('prompt.' + entry.path + '.note'),
    source: entry.source,
  }))
  return deepFreeze({
    version: SETTINGS_METADATA_VERSION,
    source: msg('source.settingsContract'),
    status: 'ready',
    presentation: {
      version: presentationData.version,
      basicGroups: cloneData(presentationData.basicGroups).map(group => ({ ...group, title: msg('settings.basicGroup.' + group.id) })),
      advancedGroups: GROUP_ORDER.map(id => ({ id, title: msg('settings.group.' + id) })),
      labels: Object.fromEntries(PRESENTATION_LABELS.map(slot => [slot, msg('settings.' + slot)])),
    },
    settings,
    groups,
    prompts,
    readonlyItems,
    diagnosticsNotes: msg('settings.readonlyNotice'),
    counts: { settings: settings.length, groups: groups.length, prompts: prompts.length, editablePrompts: prompts.length - readonlyItems.length, readonlyItems: readonlyItems.length },
  })
}

/** All-or-nothing failure view: the Client shows a loading state and the reason stays in diagnostics. */
export function failedSettingDescriptors(error) {
  return deepFreeze({ version: SETTINGS_METADATA_VERSION, source: msg('source.settingsContract'), status: 'error', reason: String(error && error.message ? error.message : error) })
}
