/** Widgets-owned settings presentation contract v1 (additive; not the family SDK).
 * Labels are editable settings data; the client never owns a key-to-label map.
 */
import { wmsg as msg } from './locale-keys.js'
import enLocale from '../locale/en.json' with {type:'json'}
import zhLocale from '../locale/zh.json' with {type:'json'}
import presentationData from './settings-presentation.json' with {type:'json'}
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
export const ROOT_DISPLAY_LABEL_DEFAULTS=freeze({
 refreshIntervalMs:msg('settings.label.refreshIntervalMs'),
 historyReuseIntervalMs:msg('settings.label.historyReuseIntervalMs'),
 stateMaxSessions:msg('settings.label.stateMaxSessions'),
 stateRouteMaxEntries:msg('settings.label.stateRouteMaxEntries'),
 showDiagnostics:msg('settings.label.showDiagnostics'),
 autoOpenOnGoal:msg('settings.label.autoOpenOnGoal'),
 noteMaxLength:msg('settings.label.noteMaxLength'),
 notesMaxItems:msg('settings.label.notesMaxItems'),
 goalObjectiveMaxLength:msg('settings.label.goalObjectiveMaxLength'),
 snapshotMaxRoots:msg('settings.label.snapshotMaxRoots'),
 snapshotMaxTools:msg('settings.label.snapshotMaxTools'),
 snapshotMaxBytes:msg('settings.label.snapshotMaxBytes'),
 sessionReadMaxSizeMb:msg('settings.label.sessionReadMaxSizeMb'),
 sessionReadMaxAgeDays:msg('settings.label.sessionReadMaxAgeDays'),
 cardPreferences:msg('settings.label.cardPreferences'),
 settingsSectionOrder:msg('settings.label.settingsSectionOrder'),
 displayLabels:msg('settings.label.displayLabels'),
 "card.visible":msg('settings.label.card.visible'),
 "card.order":msg('settings.label.card.order'),
 "card.defaultHeight":msg('settings.label.card.defaultHeight'),
})
export const ROOT_DISPLAY_LABEL_LIMITS=freeze({maxLength:80})
/** Shipped text of a label key in every shipped language. */
export function shippedDisplayLabelValues(path) {
  const key = 'settings.label.' + path
  return [enLocale.ui && enLocale.ui[key], zhLocale.ui && zhLocale.ui[key]].filter((value) => typeof value === 'string' && value)
}
/** A stored label equal to a shipped value (any shipped language) is the default, not an override. */
export function isShippedDisplayLabel(path, value) {
  return typeof value === 'string' && shippedDisplayLabelValues(path).includes(value.trim())
}
const SETTING_FIELDS=freeze([
 {path:'refreshIntervalMs',control:'number',description:msg('settings.description.refreshIntervalMs')},
 {path:'historyReuseIntervalMs',control:'number',description:msg('settings.description.historyReuseIntervalMs')},
 {path:'stateMaxSessions',control:'number'},
 {path:'stateRouteMaxEntries',control:'number'},
 {path:'showDiagnostics',control:'checkbox'},
 {path:'autoOpenOnGoal',control:'checkbox'},
 {path:'noteMaxLength',control:'number'},
 {path:'notesMaxItems',control:'number'},
 {path:'goalObjectiveMaxLength',control:'number'},
 {path:'snapshotMaxRoots',control:'number'},
 {path:'snapshotMaxTools',control:'number'},
 {path:'snapshotMaxBytes',control:'number'},
 {path:'sessionReadMaxSizeMb',control:'number',description:msg('settings.description.sessionReadMaxSizeMb')},
 {path:'sessionReadMaxAgeDays',control:'number',description:msg('settings.description.sessionReadMaxAgeDays')},
 {path:'cardPreferences',control:'cards'},
 {path:'settingsSectionOrder',control:'section-order',description:msg('settings.description.settingsSectionOrder')},
 {path:'displayLabels',control:'display-labels',description:msg('settings.description.displayLabels')},
])
const CARD_FIELDS=freeze([
 {path:'visible',labelPath:'card.visible',control:'checkbox'},
 {path:'order',labelPath:'card.order',control:'number',minKey:'orderMin',maxKey:'orderMax'},
 {path:'defaultHeight',labelPath:'card.defaultHeight',control:'number',minKey:'heightMin',maxKey:'heightMax'},
])
// Core card group display names mirror the LocalizedText shape already used by module card descriptors.
// This is presentation data only: no new persisted setting keys or card identity/order policy.
export const ROOT_CARD_GROUP_DESCRIPTORS=freeze(['skills','tools','mcp','goal','history','team','teamTasks','todos'].map(id=>({id,title:msg('settings.group.'+id),source:{contract:msg('settings.source.card-group'),keyPath:'ui.settings.group.'+id}})))
export const ROOT_CARD_GROUP_FALLBACK=freeze({title:msg('settings.groupFallback'),source:{contract:msg('settings.source.card-group'),keyPath:'ui.settings.groupFallback'}})
export function rootSettingsDescriptors(settings,defaults,limits){
 const labels=settings.displayLabels||ROOT_DISPLAY_LABEL_DEFAULTS
 const label=key=>{const stored=labels[key];return typeof stored==='string'&&stored&&!isShippedDisplayLabel(key,stored)?stored:ROOT_DISPLAY_LABEL_DEFAULTS[key]}
 return freeze({version:1,source:msg('settings.source.presentation'),labelLimits:ROOT_DISPLAY_LABEL_LIMITS,listOrdering:Object.fromEntries(['creation-order','createdAt','unknown-time','completedAt','updated-fallback','created-fallback','goal-unknown-time','goal-history'].map(key=>[key,msg('listOrdering.'+key)])),cardGroups:ROOT_CARD_GROUP_DESCRIPTORS,cardGroupFallback:ROOT_CARD_GROUP_FALLBACK,presentation:{version:presentationData.version,basicGroups:presentationData.basicGroups.map(group=>({...group,title:msg(group.title)})),advancedGroups:presentationData.advancedGroups.map(group=>({...group,title:msg(group.title)})),labels:Object.fromEntries(Object.entries(presentationData.labels).map(([key,value])=>[key,msg(value)]))},
  settings:SETTING_FIELDS.map(field=>({...field,...presentationData.fields[field.path],effect:msg(presentationData.effects[field.path]),displayLabel:label(field.path),default:defaults[field.path],limits:limits[field.path],source:{contract:msg('settings.source.settings'),settingPath:field.path,defaultPath:'defaults.'+field.path,labelPath:'displayLabels.'+field.path}})),
  cardFields:CARD_FIELDS.map(({minKey,maxKey,labelPath,...field})=>({...field,effect:msg(presentationData.cardEffects[field.path]),displayLabel:label(labelPath),limits:minKey?{min:limits.cards[minKey],max:limits.cards[maxKey]}:undefined,source:{contract:msg('settings.source.cards'),settingPath:'cardPreferences.<cardId>.'+field.path,labelPath:'displayLabels.'+labelPath}})),
  displayLabels:Object.entries(ROOT_DISPLAY_LABEL_DEFAULTS).map(([key,value])=>({path:key,effect:msg(presentationData.labels.editLabelEffect),displayLabel:label(key),default:value,source:{contract:msg('settings.source.presentation'),settingPath:'displayLabels.'+key,defaultPath:'defaults.displayLabels.'+key}})),
 })
}
export function normalizeDisplayLabels(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid display labels')
 const next={}
 for(const [key,label]of Object.entries(value)){
  if(!Object.hasOwn(ROOT_DISPLAY_LABEL_DEFAULTS,key)||typeof label!=='string'||!label.trim()||label.length>ROOT_DISPLAY_LABEL_LIMITS.maxLength||/[\r\n\x00-\x1f]/.test(label))throw new Error('Invalid display label')
  next[key]=label.trim()
 }
 return next
}
export function mergeDisplayLabels(defaults,values){return {...defaults,...values}}
