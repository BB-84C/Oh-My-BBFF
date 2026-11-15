/** Team-owned presentation contract. Keys remain wire identities; every shipped text is a message
 * reference into locale/<lang>.json (namespace oh-my-bbff-team). A user display-label override
 * (settings.displayLabels) is the user's own text and is passed through as a plain string. */
import { TEAM_SETTINGS_PRESENTATION, TEAM_SETTING_EFFECTS, TEAM_LOGICAL_SETTINGS, teamFieldPresentation } from './settings-presentation.js'
import { DOCTRINE_CATALOG } from './doctrine-metadata.js'
import { msg } from './bbff-contract.js'
export const TEAM_LABEL_LIMIT = 80
/** Editable presentation labels: key -> locale ui key (same key). */
export const TEAM_PRESENTATION_KEYS = Object.freeze([
  'factoryDefault','displayLabels','settingDetails','defaultContent','valueOn','valueOff',
  'roleTitle','roleKind','purpose','prompt','permissionReadOnly','delegation',
  'currentDoctrine','currentDoctrineHint','requiredFields','leaderBrief','identityPrompt','leaderBrief_summary','leaderBrief_whenToUse','leaderBrief_whenNotToUse','leaderBrief_deliverable','leaderBrief_boundaries','contextEnglish',
  'capabilityBlacklist','capability_write','capability_execute','capability_delegate','capability_web','nativeBlacklistHint','legacyAllow','removeLegacyAllow','audience','trigger','effect','presetRequirement',
  'filter_tools','filter_skills','filter_mcp','doctrineVariables','doctrineInfo','unknownRole',
])
/** Doctrine templates with an editable display label (locale key doctrine.<key>.label). */
export const TEAM_DOCTRINE_KEYS = Object.freeze(Object.keys(DOCTRINE_CATALOG))
export function validateTeamDisplayLabels(value,settingKeys) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('displayLabels must be an object')
  const allowed=new Set([...settingKeys,...TEAM_PRESENTATION_KEYS,...TEAM_DOCTRINE_KEYS.map(key=>'doctrine_'+key)])
  for(const [key,label] of Object.entries(value))if(!allowed.has(key)||typeof label!=='string'||!label.trim()||label.length>TEAM_LABEL_LIMIT||/[\r\n\x00-\x1f]/.test(label))throw new Error('Invalid Team display label: '+key)
  return value
}
export function teamSettingDescriptors(settings,defaults,schema) {
  // Shipped label of each editable label path, as a message reference.
  const shipped={...Object.fromEntries(Object.keys(schema).map(key=>[key,msg('setting.'+key+'.label')])),...Object.fromEntries(TEAM_PRESENTATION_KEYS.map(key=>[key,msg(key)])),...Object.fromEntries(TEAM_DOCTRINE_KEYS.map(key=>['doctrine_'+key,msg('doctrine.'+key+'.label')]))}
  const labels={...shipped,...settings.displayLabels}
  const displayValue=(key,value)=>typeof value==='number'&&schema[key]?.unit?msg('value.withUnit',{value,unit:msg('setting.'+key+'.unit')}):value===null?msg('value.noCap'):typeof value==='boolean'?msg(value?'valueOn':'valueOff'):typeof value==='object'?msg('value.noOverride'):schema[key]?.options?.includes(value)?msg('setting.'+key+'.option.'+value):String(value)
  return {version:2,source:msg('source.presentationContract'),labelLimit:TEAM_LABEL_LIMIT,labels,presentation:TEAM_SETTINGS_PRESENTATION,
    settings:[...Object.entries(schema).map(([key,spec])=>({path:key,control:spec.type,displayLabel:labels[key],default:defaults[key],defaultLabel:displayValue(key,defaults[key]),...teamFieldPresentation(key),effect:TEAM_SETTING_EFFECTS[key],...(spec.options?{options:spec.options.map(value=>({value,displayLabel:displayValue(key,value)}))}:{}),source:{contract:msg('source.settingsContract'),settingPath:'settings.'+key,labelPath:'settings.displayLabels.'+key,defaultPath:'defaults.'+key},...(spec.min!==undefined?{min:spec.min}:{}),...(spec.max!==undefined?{max:spec.max}:{})})),...TEAM_LOGICAL_SETTINGS.map(field=>({...field,effect:TEAM_SETTING_EFFECTS[field.path]}))],
    doctrineTemplates:TEAM_DOCTRINE_KEYS.map(value=>({value,displayLabel:labels['doctrine_'+value],...DOCTRINE_CATALOG[value],path:'doctrineTemplates.'+value,source:{settingPath:'settings.doctrineTemplates.'+value,labelPath:'settings.displayLabels.doctrine_'+value}})),
    displayLabels:Object.entries(shipped).map(([key,value])=>({path:key,displayLabel:labels[key],default:value,source:{settingPath:'settings.displayLabels.'+key,defaultPath:'settingDescriptors.labels.'+key}})),
  }
}
