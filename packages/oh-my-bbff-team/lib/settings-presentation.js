// Team-owned data consumed by the Widgets v2 SettingsLayout/SettingHelp renderer. All text lives in
// locale/<lang>.json; this module emits message references (msg) that the kit resolves.
import { msg } from './bbff-contract.js'
const GROUPS_BASIC = ['work', 'capacity', 'naming']
const GROUPS_ADVANCED = ['roles', 'discipline', 'fragments', 'positions', 'organization', 'runtime', 'appearance']
const LAYOUT_LABELS = ['basicsTitle', 'advancedTitle', 'advancedChanged', 'advancedCount', 'helpLabel', 'defaultPrefix', 'valueOn', 'valueOff', 'contractDefault', 'missingValue', 'missingEffectNotice', 'invalidGroupsNotice']
export const TEAM_SETTINGS_PRESENTATION = Object.freeze({
  version: 2,
  basicGroups: GROUPS_BASIC.map(id => ({ id, title: msg('settings.group.' + id) })),
  advancedGroups: GROUPS_ADVANCED.map(id => ({ id, title: msg('settings.group.' + id) })),
  // advancedChanged / advancedCount take {count} at render time (kit.resolveText(label, { count })).
  labels: Object.fromEntries(LAYOUT_LABELS.map(key => [key, msg('settings.' + key)])),
})
/** setting.<path>.effect for every schema and logical setting (locale/<lang>.json). */
const EFFECT_KEYS = ['nestingMode', 'memberCap', 'memberNaming', 'helpersPerMember', 'superagentYield', 'maxDepth', 'unknownToolEffect', 'cardRefreshMs', 'pendingRefreshMs', 'rosterWaitMs', 'rosterOutsourcedLimit', 'historyInitialLimit', 'historyPageSize', 'reportExcerptChars', 'reportCacheEntries', 'activityDefaultLimit', 'activityMaxLimit', 'activityPreviewChars', 'modelCacheMs', 'bindingLimit', 'sessionModeLimit', 'doctrineTemplates', 'displayLabels', 'roles', 'doctrineRules', 'doctrineFragments', 'doctrinePositions', 'formations', 'workspaceRoles', 'permissionLayers', 'history']
export const TEAM_SETTING_EFFECTS = Object.freeze(Object.fromEntries(EFFECT_KEYS.map(key => [key, msg('setting.' + key + '.effect')])))
export const TEAM_LOGICAL_SETTINGS = Object.freeze([
  { path: 'roles', displayLabel: msg('setting.roles.label'), control: 'roles', importance: 'advanced', advancedGroup: 'roles', default: [] },
  { path: 'workspaceRoles', displayLabel: msg('setting.workspaceRoles.label'), control: 'workspaceRoles', importance: 'advanced', advancedGroup: 'roles', default: null },
  { path: 'permissionLayers', displayLabel: msg('setting.permissionLayers.label'), control: 'permissionLayers', importance: 'advanced', advancedGroup: 'roles', default: null },
  { path: 'doctrineRules', displayLabel: msg('setting.doctrineRules.label'), control: 'doctrine', importance: 'advanced', advancedGroup: 'discipline', default: {} },
  { path: 'doctrineFragments', displayLabel: msg('setting.doctrineFragments.label'), control: 'doctrine', importance: 'advanced', advancedGroup: 'fragments', default: {} },
  { path: 'doctrinePositions', displayLabel: msg('setting.doctrinePositions.label'), control: 'doctrine', importance: 'advanced', advancedGroup: 'positions', default: {} },
  { path: 'formations', displayLabel: msg('setting.formations.label'), control: 'formations', importance: 'advanced', advancedGroup: 'organization', default: null },
  { path: 'history', displayLabel: msg('setting.history.label'), control: 'history', importance: 'advanced', advancedGroup: 'appearance', default: null },
])
export function teamFieldPresentation(key) {
  if (key === 'nestingMode') return { importance: 'basic', basicGroup: 'work', basicOrder: 1 }
  if (key === 'memberCap') return { importance: 'basic', basicGroup: 'capacity', basicOrder: 2 }
  if (key === 'memberNaming') return { importance: 'basic', basicGroup: 'naming', basicOrder: 3 }
  return { importance: 'advanced', advancedGroup: ['helpersPerMember','superagentYield','maxDepth','unknownToolEffect'].includes(key) ? 'organization' : key === 'displayLabels' ? 'appearance' : 'runtime' }
}
