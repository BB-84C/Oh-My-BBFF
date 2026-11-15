/** Scope-owned settings presentation contract v1, following the Widgets pattern.
 * Display names and consequence sentences are editable Host settings/data; the
 * Client has no kind/name/effect map. `presentation` uses the additive Widgets
 * metadata v2 shape so the family root's shared SettingsLayout can render it.
 * Every host-produced string here is a locale message ref (`msg`), never text.
 */
import { msg } from './bbff-contract.js'
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value) } return value }
const fail = key => { const error = new Error(key); error.bbffRef = msg(key); throw error }
/** Default display labels are refs; a user-edited label replaces its ref with text. */
export const SCOPE_DISPLAY_LABEL_DEFAULTS = freeze({
  unknownCwd: msg('label.unknownCwd'), rulesEntry: msg('label.rulesEntry'), showDiagnostics: msg('label.showDiagnostics'), displayLabels: msg('label.displayLabels'),
  kind_mcp: msg('label.kind_mcp'), kind_tool: msg('label.kind_tool'), kind_skill: msg('label.kind_skill'),
  rules: msg('label.rules'), sessions: msg('label.sessions'), catalog: msg('label.catalog'), preview: msg('label.preview'), history: msg('label.history'),
  diagnosticPanel: msg('label.diagnosticPanel'), rawData: msg('label.rawData'), factoryDefault: msg('label.factoryDefault'),
})
export const SCOPE_DISPLAY_LABEL_LIMITS = freeze({ maxLength: 80 })
/** Consequence sentences: what changes for the user, never how it is implemented. */
const SCOPE_EFFECTS = freeze({
  unknownCwd: msg('settings.unknownCwd.effect'),
  rulesEntry: msg('settings.rulesEntry.effect'),
  showDiagnostics: msg('settings.showDiagnostics.effect'),
  displayLabels: msg('settings.displayLabels.effect'),
})
/** Group titles and the small set of labels the shared Widgets renderer reads. */
export const SCOPE_PRESENTATION = freeze({
  version: 2,
  basicGroups: [
    { id: 'unknown-workspace', title: msg('presentation.group.unknownWorkspace') },
    { id: 'rules-entry', title: msg('presentation.group.rulesEntry') },
    { id: 'diagnostics', title: msg('presentation.group.diagnostics') },
  ],
  advancedGroups: [
    { id: 'labels', title: msg('presentation.group.labels') },
  ],
  labels: {
    basicsTitle: msg('presentation.basicsTitle'),
    advancedTitle: msg('presentation.advancedTitle'),
    advancedChanged: msg('presentation.advancedChanged'),
    advancedCount: msg('presentation.advancedCount'),
    helpLabel: msg('presentation.helpLabel'),
    defaultPrefix: msg('presentation.defaultPrefix'),
    valueOn: msg('presentation.valueOn'),
    valueOff: msg('presentation.valueOff'),
    automatic: msg('presentation.automatic'),
    contractDefault: msg('presentation.contractDefault'),
    missingValue: msg('presentation.missingValue'),
    missingEffectNotice: msg('presentation.missingEffectNotice'),
    invalidGroupsNotice: msg('presentation.invalidGroupsNotice'),
  },
})
/** No persisted setting is invented for the rules entry: it is a navigation/action card. */
const SETTING_FIELDS = freeze([
  {
    path: 'unknownCwd', field: 'unknown-cwd', control: 'select', importance: 'basic', basicGroup: 'unknown-workspace', basicOrder: 1,
    effect: SCOPE_EFFECTS.unknownCwd,
    description: msg('settings.unknownCwd.description'),
    options: [{ value: 'open', displayLabel: msg('settings.unknownCwd.option.open') }, { value: 'hide-all', displayLabel: msg('settings.unknownCwd.option.hideAll') }],
  },
  {
    path: 'rulesEntry', field: 'rules-entry', control: 'entry', importance: 'basic', basicGroup: 'rules-entry', basicOrder: 2,
    effect: SCOPE_EFFECTS.rulesEntry,
    description: msg('settings.rulesEntry.description'),
  },
  {
    path: 'showDiagnostics', field: 'show-diagnostics', control: 'checkbox', importance: 'basic', basicGroup: 'diagnostics', basicOrder: 3,
    effect: SCOPE_EFFECTS.showDiagnostics,
    description: msg('settings.showDiagnostics.description'),
    options: [{ value: false, displayLabel: msg('settings.showDiagnostics.option.off') }, { value: true, displayLabel: msg('settings.showDiagnostics.option.on') }],
  },
  {
    path: 'displayLabels', field: 'display-labels', control: 'display-labels', importance: 'advanced', advancedGroup: 'labels',
    effect: SCOPE_EFFECTS.displayLabels,
    description: msg('settings.displayLabels.description'),
  },
])
export function scopeSettingsDescriptors(settings, defaults) {
  const labels = { ...SCOPE_DISPLAY_LABEL_DEFAULTS, ...settings.displayLabels }
  const displayLabelDefaults = defaults.displayLabels || SCOPE_DISPLAY_LABEL_DEFAULTS
  return freeze({
    version: 1, source: msg('source.contract.presentation'), labelLimits: SCOPE_DISPLAY_LABEL_LIMITS, presentation: SCOPE_PRESENTATION,
    settings: SETTING_FIELDS.map(field => ({
      ...field,
      displayLabel: labels[field.path] ?? SCOPE_DISPLAY_LABEL_DEFAULTS[field.path],
      default: field.path === 'displayLabels' ? displayLabelDefaults : field.control === 'entry' ? undefined : defaults[field.path],
      source: { contract: msg('source.contract.settings'), settingPath: field.path, defaultPath: 'settingDefaults.' + field.path, labelPath: 'displayLabels.' + field.path },
    })),
    kinds: ['mcp', 'tool', 'skill'].map(value => ({ value, displayLabel: labels['kind_' + value], source: { contract: msg('source.contract.kindRules'), labelPath: 'displayLabels.kind_' + value } })),
    displayLabels: Object.entries(SCOPE_DISPLAY_LABEL_DEFAULTS).map(([key, value]) => ({
      path: key, effect: SCOPE_EFFECTS.displayLabels, displayLabel: labels[key], default: value,
      source: { contract: msg('source.contract.presentation'), settingPath: 'displayLabels.' + key, defaultPath: 'settingDefaults.displayLabels.' + key },
    })),
  })
}
export function normalizeDisplayLabels(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('error.displayLabelsInvalid')
  const next = {}
  for (const [key, label] of Object.entries(value)) {
    if (!Object.hasOwn(SCOPE_DISPLAY_LABEL_DEFAULTS, key) || typeof label !== 'string' || !label.trim() || label.length > SCOPE_DISPLAY_LABEL_LIMITS.maxLength || /[\r\n\x00-\x1f]/.test(label)) fail('error.displayLabelInvalid')
    next[key] = label.trim()
  }
  return next
}
