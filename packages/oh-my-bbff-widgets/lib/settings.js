/** Root-owned human preferences. Defaults/limits are returned as data, never hidden UI policy. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {MODULE_ID_PATTERN,CARD_ID_PATTERN} from './bbff-contract.js'
import { wmsg as msg } from './locale-keys.js'
import {ROOT_DISPLAY_LABEL_DEFAULTS,ROOT_DISPLAY_LABEL_LIMITS,rootSettingsDescriptors,normalizeDisplayLabels,mergeDisplayLabels,isShippedDisplayLabel} from './settings-metadata.js'
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
const clone=value=>JSON.parse(JSON.stringify(value))
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)
export const ROOT_SETTINGS_DEFAULTS=freeze({refreshIntervalMs:5000,historyReuseIntervalMs:15000,stateMaxSessions:64,stateRouteMaxEntries:512,showDiagnostics:false,autoOpenOnGoal:true,noteMaxLength:500,notesMaxItems:200,goalObjectiveMaxLength:4000,snapshotMaxRoots:64,snapshotMaxTools:512,snapshotMaxBytes:4194304,sessionReadMaxSizeMb:30,sessionReadMaxAgeDays:7,cardPreferences:{},settingsSectionOrder:[],displayLabels:{}})
export const ROOT_SETTINGS_LIMITS=freeze({refreshIntervalMs:{min:1000,max:60000},historyReuseIntervalMs:{min:15000,max:60000},stateMaxSessions:{min:1,max:4096},stateRouteMaxEntries:{min:1,max:20000},noteMaxLength:{min:1,max:20000},notesMaxItems:{min:1,max:20000},goalObjectiveMaxLength:{min:1,max:200000},snapshotMaxRoots:{min:1,max:4096},snapshotMaxTools:{min:1,max:20000},snapshotMaxBytes:{min:65536,max:33554432},sessionReadMaxSizeMb:{min:1,max:4096},sessionReadMaxAgeDays:{min:1,max:3650},cards:{heightMin:80,heightMax:900,orderMin:0,orderMax:10000}})
export const ROOT_CARD_DEFAULTS=freeze(Object.fromEntries([['skills',220],['tools',220],['mcp',200],['goal',260],['history',220],['team',220],['teamTasks',180],['todos',180]].map(([name,height],order)=>[name,{visible:true,order,defaultHeight:height}])))
export const ROOT_CARD_PREFERENCE_DEFAULTS=freeze({visible:true,order:100,defaultHeight:220})
const id=value=>{if(typeof value!=='string')return false;const parts=value.split('/');return parts.length===1?CARD_ID_PATTERN.test(parts[0]):parts.length===2&&MODULE_ID_PATTERN.test(parts[0])&&CARD_ID_PATTERN.test(parts[1])}
function normalizePatch(patch){
 if(!object(patch)||Object.keys(patch).some(key=>!Object.hasOwn(ROOT_SETTINGS_DEFAULTS,key)))throw new Error('Unknown settings field')
 const next={}
 for(const [key,value]of Object.entries(patch)){
  if(key==='autoOpenOnGoal'||key==='showDiagnostics'){if(typeof value!=='boolean')throw new Error(key+' must be boolean');next[key]=value}
  else if(key==='displayLabels'){next[key]=normalizeDisplayLabels(value)}
   else if(key==='cardPreferences'){
   if(!object(value))throw new Error('cardPreferences must be an object')
   const cards=[]
   for(const [name,raw]of Object.entries(value)){
    if(!id(name)||!object(raw)||Object.keys(raw).some(key=>!['visible','order','defaultHeight'].includes(key)))throw new Error('Invalid card preference')
    const card={}
    if(raw.visible!==undefined){if(typeof raw.visible!=='boolean')throw new Error('Invalid card visibility');card.visible=raw.visible}
    if(raw.order!==undefined){if(!Number.isFinite(raw.order)||raw.order<ROOT_SETTINGS_LIMITS.cards.orderMin||raw.order>ROOT_SETTINGS_LIMITS.cards.orderMax)throw new Error('Invalid card order');card.order=raw.order}
    if(raw.defaultHeight!==undefined){if(!Number.isSafeInteger(raw.defaultHeight)||raw.defaultHeight<ROOT_SETTINGS_LIMITS.cards.heightMin||raw.defaultHeight>ROOT_SETTINGS_LIMITS.cards.heightMax)throw new Error('Invalid card height');card.defaultHeight=raw.defaultHeight}
    cards.push([name,card])
   }
   next[key]=Object.fromEntries(cards)
  }else if(key==='settingsSectionOrder'){
   if(!Array.isArray(value)||value.some(name=>!id(name)||!name.includes('/'))||new Set(value).size!==value.length)throw new Error('Invalid qualified settings section order')
   next[key]=value.slice()
  }else{
   const limits=ROOT_SETTINGS_LIMITS[key]
   if(!limits||!Number.isSafeInteger(value)||value<limits.min||value>limits.max)throw new Error('Invalid '+key+' range')
   next[key]=value
  }
 }
 return next
}
export function createRootSettingsStore({dir,root={},onChange=()=>{}}={}){
 if(typeof dir!=='string'||!path.isAbsolute(dir)||path.resolve(dir)===path.parse(path.resolve(dir)).root)throw new Error('Settings directory must be an owned absolute path')
 const file=path.join(dir,'settings.json')
 let settings=clone(ROOT_SETTINGS_DEFAULTS),revision=0,loaded=false,loading,issue,queue=Promise.resolve()
 const signal=()=>{try{onChange(settings)}catch{}}
 const diagnostic=reason=>({code:'settings-storage-error',inference:'settings',severity:'warning',reason})
 function payload(){return freeze({ok:true,root:{...root},revision,settings:clone(settings),defaults:clone(ROOT_SETTINGS_DEFAULTS),limits:{...ROOT_SETTINGS_LIMITS,displayLabels:ROOT_DISPLAY_LABEL_LIMITS},descriptors:rootSettingsDescriptors(settings,ROOT_SETTINGS_DEFAULTS,ROOT_SETTINGS_LIMITS),cardDefaults:ROOT_CARD_DEFAULTS,cardPreferenceDefaults:ROOT_CARD_PREFERENCE_DEFAULTS,settingsSectionRule:{source:msg('settings.rule.source'),default:msg('settings.rule.description'),settingPath:'settingsSectionOrder'},fixedContracts:[{id:'read-user-notes',title:'read_user_notes',source:msg('settings.fixed.source'),description:msg('settings.fixed.description')}],diagnostics:issue?[diagnostic(issue)]:[]})}
 async function initialize(){
  if(loaded)return payload()
  if(loading)return loading
  loading=(async()=>{
   try{
    const doc=JSON.parse(await fs.readFile(file,'utf8'))
    if(!object(doc)||doc.version!==1||!Number.isSafeInteger(doc.revision)||doc.revision<0||!object(doc.settings)||Object.keys(doc).some(key=>!['version','revision','settings'].includes(key)))throw new Error('Invalid settings document')
    settings={...clone(ROOT_SETTINGS_DEFAULTS),...normalizePatch(doc.settings),displayLabels:Object.fromEntries(Object.entries(normalizeDisplayLabels(doc.settings.displayLabels||{})).filter(([path,value])=>!isShippedDisplayLabel(path,value)))};revision=doc.revision;issue=undefined
   }catch(error){if(error.code!=='ENOENT')issue=msg('diag.settings.read-failed')}
   loaded=true;loading=undefined;signal();return payload()
  })()
  return loading
 }
 const failure=(status,code,error)=>({...payload(),ok:false,status,code,error})
 async function commit(patch,expectedRevision,{reset=false}={}){
  const run=queue.then(async()=>{
   await initialize()
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)return failure(400,'invalid-settings-revision',msg('error.settings-revision-required'))
   if(expectedRevision!==revision)return failure(409,'stale-settings',msg('error.settings-stale'))
   let proposed
   try{const normalized=reset?null:normalizePatch(patch);proposed=reset?clone(ROOT_SETTINGS_DEFAULTS):{...settings,...normalized,displayLabels:mergeDisplayLabels(settings.displayLabels,normalized.displayLabels)}}catch(error){return failure(400,'invalid-settings',msg('error.settings-invalid',{detail:error.message}))}
   if(issue&&!reset)return failure(500,'storage-error',msg('error.settings-need-reset'))
   const temp=file+'.'+randomUUID()+'.tmp'
   try{
    await fs.mkdir(dir,{recursive:true})
    if(issue&&reset)try{await fs.copyFile(file,file+'.corrupt-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID())}catch(error){if(error.code!=='ENOENT')throw error}
    await fs.writeFile(temp,JSON.stringify({version:1,revision:revision+1,settings:proposed},null,2)+'\n',{encoding:'utf8',flag:'wx'})
    await fs.rename(temp,file)
    settings=clone(proposed);revision++;issue=undefined;signal();return payload()
   }catch{try{await fs.unlink(temp)}catch{};issue=msg('diag.settings.write-failed');return failure(500,'storage-error',issue)}
  })
  queue=run.catch(()=>{});return run
 }
 return Object.freeze({file,read:initialize,peek:payload,isLoaded:()=>loaded,current:()=>freeze(clone(settings)),update:(patch,expectedRevision)=>commit(patch,expectedRevision),reset:expectedRevision=>commit({},expectedRevision,{reset:true}),flush:()=>queue})
}
