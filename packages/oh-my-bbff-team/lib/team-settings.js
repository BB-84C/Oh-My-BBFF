// One Team-owned settings schema, defaults and read normalization. Never writes profile or user data.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { validateDoctrineTemplates } from './doctrine-templates.js'
import { validateTeamDisplayLabels, teamSettingDescriptors } from './settings-metadata.js'
const integer = (value,min=0,max=Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max
// Display text of every setting lives in locale/<lang>.json (ui keys setting.<key>.label, .unit, .option.<value>, .effect);
// the schema keeps only wire facts. `unit: true` marks a setting whose value is shown with setting.<key>.unit.
export const TEAM_SETTINGS_SCHEMA = Object.freeze({
  nestingMode: { type:'enum', default:'nested', options:['nested','helpers'] },
  helpersPerMember: { type:'integer', default:2, min:0 },
  memberCap: { type:'nullable-integer', default:null, min:1 },
  superagentYield: { type:'enum', default:'own-sessions', options:['own-sessions','all'] },
  memberNaming: { type:'enum', default:'function', options:['function','seat'] },
  maxDepth: { type:'integer', default:2, min:0 },
  unknownToolEffect: { type:'enum', default:'allow', options:['allow','deny'] },
  cardRefreshMs: { type:'integer', default:10000, min:1, max:2147483647 },
  pendingRefreshMs: { type:'integer', default:500, min:1, max:2147483647 },
  rosterWaitMs: { type:'integer', default:1000, min:0, max:1000, unit:true },
  rosterOutsourcedLimit: { type:'integer', default:20, min:0, max:500 },
  historyInitialLimit: { type:'integer', default:6, min:1 },
  historyPageSize: { type:'integer', default:10, min:1 },
  reportExcerptChars: { type:'integer', default:400, min:1 },
  reportCacheEntries: { type:'integer', default:256, min:1 },
  activityDefaultLimit: { type:'integer', default:10, min:1, max:200 },
  activityMaxLimit: { type:'integer', default:50, min:1, max:500 },
  activityPreviewChars: { type:'integer', default:400, min:40, max:4000 },
  modelCacheMs: { type:'integer', default:60000, min:0 },
  bindingLimit: { type:'integer', default:4000, min:1 },
  sessionModeLimit: { type:'integer', default:2000, min:1 },
  doctrineTemplates: { type:'templates', default:{} },
  displayLabels: { type:'display-labels', default:{} },
})
/** Keys of removed settings: accepted and ignored so an existing settings.json stays valid. */
export const RETIRED_TEAM_SETTINGS = Object.freeze(['listAgentsColdReadMs', 'rosterUnboundLimit'])
export const DEFAULT_TEAM_SETTINGS = Object.freeze(Object.fromEntries(Object.entries(TEAM_SETTINGS_SCHEMA).map(([key,schema])=>[key,schema.default])))
function valid(value,schema) {
  if(schema.type==='enum')return schema.options.includes(value)
  if(schema.type==='templates') { try { validateDoctrineTemplates(value);return true } catch { return false } }
  if(schema.type==='display-labels') { try { validateTeamDisplayLabels(value,Object.keys(TEAM_SETTINGS_SCHEMA));return true } catch { return false } }
  if(schema.type==='nullable-integer' && value===null)return true
  return integer(value,schema.min,schema.max)
}
export function validateTeamSettingsPatch(patch) {
  if(!patch || typeof patch!=='object' || Array.isArray(patch))throw new Error('settings patch must be an object')
  for(const [key,value] of Object.entries(patch)) {
    const schema=TEAM_SETTINGS_SCHEMA[key]
    if(!schema && RETIRED_TEAM_SETTINGS.includes(key))continue
    if(!schema)throw new Error('unknown settings key: '+key)
    if(schema.type==='templates') { validateDoctrineTemplates(value);continue }
    if(schema.type==='display-labels') { validateTeamDisplayLabels(value,Object.keys(TEAM_SETTINGS_SCHEMA));continue }
    if(!valid(value,schema)) {
      if(schema.type==='enum')throw new Error(key+' must be '+schema.options.join('|'))
      if(schema.type==='nullable-integer')throw new Error(key+' must be null or a positive safe integer')
      if(schema.max===undefined && schema.min===0)throw new Error(key+' must be a nonnegative safe integer')
      if(schema.max===undefined && schema.min===1)throw new Error(key+' must be a positive safe integer')
      throw new Error(key+' must be an integer in '+schema.min+'..'+schema.max)
    }
  }
  return patch
}
export function normalizeTeamSettings(value) {
  const source=value && typeof value==='object' && !Array.isArray(value)?value:{}
  return Object.fromEntries(Object.entries(TEAM_SETTINGS_SCHEMA).map(([key,schema])=>{
    const supplied=Object.hasOwn(source,key) && valid(source[key],schema)
    const field=supplied?source[key]:schema.default
    return [key,field && typeof field==='object'?JSON.parse(JSON.stringify(field)):field]
  }))
}
export function teamSettingsState({home}) {
  const path=join(home,'oh-my-bbff-team','settings.json')
  let value={},diagnostics=[]
  try { value=JSON.parse(readFileSync(path,'utf8'));validateTeamSettingsPatch(value) }
  catch(error) { if(error?.code!=='ENOENT')diagnostics.push({code:'team-settings',reason:String(error?.message||error)}) }
  const sources=Object.fromEntries(Object.entries(TEAM_SETTINGS_SCHEMA).map(([key,schema])=>[key,{source:Object.hasOwn(value || {},key)&&valid(value[key],schema)?'global':'default',settingPath:'settings.'+key,default:JSON.stringify(schema.default)}]))
  const settings=normalizeTeamSettings(value),defaults=JSON.parse(JSON.stringify(DEFAULT_TEAM_SETTINGS))
  return {settings,defaults,schema:TEAM_SETTINGS_SCHEMA,sources,path,diagnostics,settingDescriptors:teamSettingDescriptors(settings,defaults,TEAM_SETTINGS_SCHEMA)}
}
// Hot paths (roster, team view, activity) read settings many times per request. Re-parse
// settings.json only when its file identity changes (atomic writes replace it); one statSync
// per call instead of a read + parse + validate. Each caller gets its own copy.
const settingsMemo = new Map()
export function readTeamSettings({home}) {
  const path=join(home,'oh-my-bbff-team','settings.json')
  let identity='missing'
  try { const stat=statSync(path,{bigint:true}); identity=String(stat.ino)+':'+String(stat.size)+':'+String(stat.mtimeNs) } catch (error) { if(error?.code!=='ENOENT') identity='error:'+String(error?.code||error) }
  const cached=settingsMemo.get(path)
  if(cached?.identity!==identity){ settingsMemo.set(path,{identity,settings:teamSettingsState({home}).settings}); if(settingsMemo.size>8)settingsMemo.delete(settingsMemo.keys().next().value) }
  return JSON.parse(JSON.stringify(settingsMemo.get(path).settings))
}

/**
 * DSH 0.2.2 has no member-count cap: Team members are subagents, live concurrency is bounded per
 * tree by the subagent service (maxActiveSubagents), which exposes no public reader. No private
 * field is read and no deployment default is invented, so the native member cap is always unknown.
 */
export const DSH_MEMBER_CAP_REASON = 'DSH 0.2.2 has no member-count cap; live members per tree are limited by the native maxActiveSubagents setting, which plugins cannot read. Only the BBFF soft cap applies.'
export function readDshMemberCap() { return null }
export function teamDepthCapacity(get,settings) {
  const configuredDepth=normalizeTeamSettings(settings).maxDepth
  let nativeDepth=null,depthReason='The native depth resolver is unavailable; no limit is invented.'
  try { const value=get('subagents')?.resolveMaxDepth?.();if(Number.isSafeInteger(value)&&value>=0){nativeDepth=value;depthReason='Native subagents.resolveMaxDepth() bounds the configured Team depth.'} }
  catch(error) { depthReason=String(error?.message||error) }
  return {configuredDepth,nativeDepth,effectiveDepth:nativeDepth===null?null:Math.min(configuredDepth,nativeDepth),depthReason}
}
export function teamCapacity(get,settings) {
  const normalized=normalizeTeamSettings(settings),dshCap=readDshMemberCap(get),configuredCap=normalized.memberCap
  return {dshCap,bbffCap:configuredCap===null?dshCap:dshCap===null?configuredCap:Math.min(configuredCap,dshCap),configuredCap,memberCapEditable:true,
    reason:dshCap===null?DSH_MEMBER_CAP_REASON+(configuredCap===null?' No BBFF soft cap is set.':' BBFF soft cap: '+configuredCap+'.'):'BBFF soft cap only; the DSH cap is read-only.'}
}
