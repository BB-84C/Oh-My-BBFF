/** Bounded private last-live inventories. Caps are visible Root settings; no Agent loading. */
import {mkdirSync,readFileSync,renameSync,statSync,writeFileSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {ROOT_SETTINGS_DEFAULTS} from './settings.js'
import {EXPOSURE_TEXT_MAX_LENGTH} from './bbff-contract.js'
import pkg from '../package.json' with {type:'json'}
export function createExposureSnapshots({home,logger,getSettings}={}){
 const file=join(home,pkg.name,'exposure-snapshots.json'),issues=new Map()
 let records=new Map(),loaded=false,evictedRoots=0,evictedTools=0
 const limits=()=>{const value=getSettings?.()||ROOT_SETTINGS_DEFAULTS;return {maxRoots:value.snapshotMaxRoots,maxTools:value.snapshotMaxTools,maxBytes:value.snapshotMaxBytes}}
 const report=(code,reason)=>issues.set(code,{code,inference:'exposure-snapshots',severity:'warning',reason})
 const eviction=()=>{if(evictedRoots||evictedTools)report('snapshot-evicted','Private exposure snapshot limits evicted '+evictedRoots+' cached sessions and omitted '+evictedTools+' tool records. Limits are editable in Widgets general settings.')}
 const warn=()=>{report('snapshot-storage-error','Private exposure snapshot storage is unavailable; no durable success is claimed.');try{logger?.warn?.('widgets exposure snapshot storage unavailable')}catch{}}
 function clean(value){
  if(!value||!Number.isFinite(value.at)||!Array.isArray(value.tools))return null
  const valid=value.tools.filter(tool=>tool&&typeof tool.name==='string'&&tool.name&&tool.name.length<=256),{maxTools}=limits()
  if(valid.length>maxTools)evictedTools+=valid.length-maxTools
  return {at:value.at,preset:typeof value.preset==='string'?value.preset:'',tools:valid.slice(0,maxTools).map(tool=>({name:tool.name,description:String(tool.description||'').slice(0,EXPOSURE_TEXT_MAX_LENGTH),origin:['global','preset','agent'].includes(tool.origin)?tool.origin:'agent'}))}
 }
 function load(){
  if(loaded)return
  loaded=true
  try{
   if(statSync(file).size>limits().maxBytes){report('snapshot-evicted','Existing private snapshot file exceeds the configured byte cap and was not loaded; its bytes were preserved.');return}
   const doc=JSON.parse(readFileSync(file,'utf8'))
   if(doc.version!==1||!doc.sessions||typeof doc.sessions!=='object'||Array.isArray(doc.sessions))throw new Error('Invalid snapshot document')
   const rows=Object.entries(doc.sessions).sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0))
   evictedRoots+=Math.max(0,rows.length-limits().maxRoots)
   for(const [id,value]of rows.slice(0,limits().maxRoots)){const row=clean(value);if(row&&id.length<=256)records.set(id,row)}
   eviction()
  }catch(error){if(error.code!=='ENOENT')warn()}
 }
 function get(id){load();const row=records.get(id);return row?{...row,tools:row.tools.map(tool=>({...tool}))}:undefined}
 function put(id,{preset,tools}){
  load();const beforeOmitted=evictedTools,row=clean({at:Date.now(),preset,tools})
  if(!row||typeof id!=='string'||!id||id.length>256)return
  const prior=records.get(id)
  if(prior&&prior.preset===row.preset&&JSON.stringify(prior.tools)===JSON.stringify(row.tools)){evictedTools=beforeOmitted;eviction();return}
  records.delete(id);records.set(id,row)
  const {maxRoots,maxBytes}=limits(),all=[...records].reverse().sort((a,b)=>b[1].at-a[1].at),ordered=all.slice(0,maxRoots)
  evictedRoots+=all.length-ordered.length
  let text
  while(true){text=JSON.stringify({version:1,sessions:Object.fromEntries(ordered)});if(Buffer.byteLength(text)<=maxBytes||!ordered.length)break;ordered.pop();evictedRoots++}
  records=new Map(ordered);eviction()
  const temporary=file+'.'+randomUUID()+'.tmp'
  try{mkdirSync(dirname(file),{recursive:true});writeFileSync(temporary,text,'utf8');renameSync(temporary,file);issues.delete('snapshot-storage-error')}catch{warn()}
 }
 return Object.freeze({file,get,put,diagnostics:()=>[...issues.values()]})
}
