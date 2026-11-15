import { wmsg as msg } from './locale-keys.js'
/** Incremental Root-owned session views. Live: committed events only. Cold:
 * cheap stat, one suffix fold per revision, with >=historyReuseInterval coalescing.
 * Native JSONL may fully decode physically; that limitation is never hidden.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {emptySessionView,restoreSessionView,foldSessionEvent,sessionViewData,SESSION_VIEW_SCHEMA} from './session-view.js'
import {ROOT_SETTINGS_DEFAULTS} from './settings.js'
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex')
const problem=(code,reason)=>({key:code,level:'warning',section:'session-view',code,reason})
export const NATIVE_COLD_LIMITATION=Object.freeze({code:'native-cold-full-decode',reason:msg('diag.views.cold-limitation')})
export function createIncrementalViews(ctx,{dir,getSettings=()=>ROOT_SETTINGS_DEFAULTS,now=Date.now,readRuntime,onChange=()=>{},readConcurrency=2}={}){
 if(!dir||!path.isAbsolute(dir)||path.resolve(dir)===path.parse(dir).root)throw new Error('View directory must be owned and absolute')
 const root=path.resolve(dir),records=new Map(),epochs=new Map(),pinned=new Set(),disposers=[],readQueue=[];let disposed=false,closing=false,runningReads=0,timer
 // One lifecycle signal per generation: every in-flight stat/open/read is
 // aborted on dispose so an unloaded plugin generation cannot keep reading.
 const lifecycle=new AbortController()
 const alive=()=>!disposed&&!closing
 const get=name=>{try{return ctx.get(name)}catch{return undefined}},session=id=>get('agents')?.get?.(id)?.session||get('sessions')?.get?.(id),settings=()=>({...ROOT_SETTINGS_DEFAULTS,...getSettings()}),epoch=p=>{const id=p?.identity??p;if(!epochs.has(id))epochs.set(id,randomUUID());return epochs.get(id)}
 function trim(exempt){const limit=settings().stateRouteMaxEntries;for(const [id,r]of records){if(records.size<=limit)break;if(id===exempt||pinned.has(id)||session(id)||!r.initialized||r.sync||r.write||r.dirtyCheckpoint||r.buffer.size)continue;if(r.wakeup)clearTimeout(r.wakeup);r.closed=true;records.delete(id)}}
 const counts={stats:0,readOpens:0,readEvents:0,foldedEvents:0,liveEvents:0,checkpointLoads:0,checkpointWrites:0,rebuilds:0}
 const filename=id=>path.join(root,digest(id)+'.json')
 const notify=r=>{try{onChange(r.id)}catch{}}
 function record(id){
  if(typeof id!=='string'||!id)throw new Error('Invalid session identity')
  let r=records.get(id);if(r)return r
  r={id,state:emptySessionView(),offset:0,header:null,headerHash:null,inheritedEventCount:0,anchor:null,revision:null,identity:undefined,ready:false,initialized:false,validate:false,buffer:new Map(),diagnostics:new Map(),lastReadAt:null,lastAttemptRevision:null,sync:null,load:null,write:null,writeScheduled:null,dirtyCheckpoint:false,wakeup:null,viewRevision:0,runtime:null,closed:false};records.set(id,r);trim(id)
  return r
 }
 const issue=(r,code,reason)=>{r.diagnostics.set(code,problem(code,reason));notify(r)}
 function updateRuntime(r){if(!readRuntime)return;try{const value=readRuntime(r.id);if(value!==undefined&&canonical(value)!==canonical(r.runtime)){r.runtime=value;r.viewRevision++;if(value&&Object.hasOwn(value,'team'))r.state.team=value.team;if(value?.cwd)r.state.cwd=value.cwd;if(value?.presetId)r.state.presetId=value.presetId;if(value?.goal?.id){const {activation,...durable}=value.goal;const previous=r.state.goals[durable.id],merged={...(previous||{}),...durable};if(durable.phase!=='complete'||previous?.phase!=='complete'){delete merged.completedAt;delete merged.completionBasis}r.state.goals[durable.id]=merged;r.state.currentGoalId=durable.id}else if(value&&Object.hasOwn(value,'goal')&&!value.goal)r.state.currentGoalId=null;scheduleCheckpoint(r)}}catch(error){issue(r,'runtime-read',String(error?.message||error))}}
 function scheduleCheckpoint(r){
  r.dirtyCheckpoint=true;if(r.writeScheduled||disposed||r.closed)return
  r.writeScheduled=setImmediate(()=>{r.writeScheduled=null;void persist(r)});r.writeScheduled.unref?.()
 }
 async function persist(r){
  if(r.write)return r.write
  if(!r.dirtyCheckpoint||!r.ready||disposed||r.closed)return
  r.dirtyCheckpoint=false
  const checkpoint={schemaVersion:SESSION_VIEW_SCHEMA,sessionId:r.id,header:r.header,headerHash:r.headerHash,identity:{runtimeEpoch:r.identity===undefined?null:epoch({identity:r.identity})},revision:r.revision,offset:r.offset,eventCount:r.offset,inheritedEventCount:r.inheritedEventCount,anchor:r.anchor,state:r.state,stateHash:digest(r.state),viewRevision:r.viewRevision,lastReadAt:r.lastReadAt,updatedAt:now()}
  // Serialize the exact cut synchronously, before any subsequent live append.
  const text=JSON.stringify(checkpoint),file=filename(r.id),temporary=file+'.'+randomUUID()+'.tmp'
  r.write=(async()=>{try{await fs.mkdir(root,{recursive:true});await fs.writeFile(temporary,text,{encoding:'utf8',flag:'wx'});await fs.rename(temporary,file);counts.checkpointWrites++;r.diagnostics.delete('checkpoint-write')}catch(error){try{await fs.unlink(temporary)}catch{};r.dirtyCheckpoint=true;issue(r,'checkpoint-write',msg('diag.views.checkpoint-write-failed',{detail:String(error?.message||error)}))}})().finally(()=>{r.write=null;if(r.dirtyCheckpoint&&!r.diagnostics.has('checkpoint-write'))scheduleCheckpoint(r);trim(r.id)})
  return r.write
 }
 async function initialize(r){
  if(r.initialized)return;if(r.load)return r.load
  r.load=(async()=>{try{
   const value=JSON.parse(await fs.readFile(filename(r.id),'utf8'))
   if(value.sessionId!==r.id||!Number.isSafeInteger(value.schemaVersion)||!Number.isSafeInteger(value.offset)||value.offset<0||!Number.isSafeInteger(value.inheritedEventCount)||value.inheritedEventCount<0||value.inheritedEventCount>value.offset||!value.header||digest(value.header)!==value.headerHash)throw new Error('Invalid checkpoint header/schema/watermark')
   if(!value.stateHash||digest(value.state)!==value.stateHash)throw new Error('Checkpoint state checksum mismatch')
    if(value.schemaVersion!==SESSION_VIEW_SCHEMA){
     const previous=restoreSessionView(value.state);r.state.team=previous.team;r.state.cwd=previous.cwd;r.state.presetId=previous.presetId;r.header=value.header;r.headerHash=value.headerHash
     r.migration={fromSchema:value.schemaVersion,toSchema:SESSION_VIEW_SCHEMA,status:'pending',reason:msg('diag.views.migration-reason')};counts.rebuilds++
     issue(r,'checkpoint-schema-migration',msg('diag.views.migration-started',{from:value.schemaVersion,to:SESSION_VIEW_SCHEMA}))
    }else{r.state=restoreSessionView(value.state);r.offset=value.offset;r.header=value.header;r.headerHash=value.headerHash;r.inheritedEventCount=value.inheritedEventCount;r.anchor=value.anchor;r.viewRevision=Number(value.viewRevision)||0;r.validate=true;counts.checkpointLoads++}
   // Persisted revision/epoch are evidence, not a cross-process equality proof.
  }catch(error){if(error.code!=='ENOENT')issue(r,'checkpoint-invalid',msg('diag.views.checkpoint-invalid'))}
  r.initialized=true;r.load=null})()
  return r.load
 }
 function reset(r,reason){r.state=emptySessionView();r.offset=0;r.anchor=null;r.ready=false;r.validate=false;counts.rebuilds++;issue(r,'session-rebuild',reason)}
 function apply(r,event,{live=false,anchor=true}={}){
  if(!Number.isSafeInteger(event?.seq)||event.seq<0)throw new Error('Invalid public event sequence')
  if(event.seq<r.offset)return
  if(event.seq!==r.offset)throw new Error('Session event gap: expected '+r.offset+', got '+event.seq)
  const result=foldSessionEvent(r.state,event,{inheritedEventCount:r.inheritedEventCount});r.offset++;if(anchor)r.anchor={seq:event.seq,eventHash:digest(event)};counts.foldedEvents++;if(live)counts.liveEvents++
  if(result.changed)r.viewRevision++
  for(const row of result.diagnostics||[])issue(r,row.code||'event-decode',row.reason||msg('diag.views.event-decode'))
  if(result.discovered&&!['external','unknown'].includes(result.discovered.mode)){const child=record(result.discovered.id);if(!child.initialized)void refresh(child.id).catch(error=>issue(child,'source-read',String(error?.message||error)))}
 }
 function drain(r){for(const [seq,event]of [...r.buffer].sort((a,b)=>a[0]-b[0])){if(seq<r.offset){r.buffer.delete(seq);continue}if(seq!==r.offset)break;apply(r,event,{live:true});r.buffer.delete(seq)}}
 function ingest(current,event){
   if(!alive())return
  const r=record(String(current.id));if(!r.header){r.header=current.header;r.headerHash=digest(current.header);r.inheritedEventCount=Number(current.inheritedEventCount)||0}
  if(!r.ready||r.sync){r.buffer.set(event.seq,event);if(!r.initialized)void refresh(r.id).catch(error=>issue(r,'source-read',String(error?.message||error)));return}
  try{apply(r,event,{live:true});drain(r);updateRuntime(r);scheduleCheckpoint(r);notify(r)}catch(error){r.buffer.set(event.seq,event);issue(r,'event-gap',String(error.message));void refresh(r.id).catch(error=>issue(r,'source-read',String(error?.message||error)))}
 }
 function pump(){while(!disposed&&runningReads<readConcurrency&&readQueue.length){const job=readQueue.shift();runningReads++;Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{runningReads--;pump()})}}
 const readSlot=run=>new Promise((resolve,reject)=>{readQueue.push({run,resolve,reject});pump()})
 async function synchronize(r,p,snapshot){
  if(r.sync)return r.sync
  const cold=!session(r.id),reuse=settings().historyReuseIntervalMs,elapsed=r.lastReadAt===null?Infinity:now()-r.lastReadAt
  if(cold&&elapsed<reuse){
   if(!r.wakeup){r.wakeup=setTimeout(()=>{r.wakeup=null;void refresh(r.id).catch(error=>issue(r,'source-read',String(error?.message||error)))},Math.max(0,reuse-elapsed));r.wakeup.unref?.()}
   return
  }
  if(r.lastAttemptRevision===snapshot.revision&&r.identity===(p.identity??p)&&r.diagnostics.has('source-read'))return
  r.sync=readSlot(async()=>{
   if(!alive()||r.closed)return
   // Re-stat at the coalesced read moment: do not decode an obsolete queued revision.
   const latest=await p.stat(r.id,{signal:lifecycle.signal});counts.stats++;if(!latest||!alive())return
   if(!r.validate&&r.ready&&r.identity===(p.identity??p)&&r.revision===latest.revision)return
   r.lastReadAt=now();r.lastAttemptRevision=latest.revision;r.identity=p.identity??p
   const started=performance.now();let handle
   try{
    if(!alive())return
    if(r.headerHash&&r.headerHash!==digest(latest.header))reset(r,msg('diag.views.header-changed'))
    if(Number.isSafeInteger(latest.eventCount)&&latest.eventCount<r.offset)reset(r,msg('diag.views.source-missing'))
    handle=await p.open(r.id,'read',{signal:lifecycle.signal});counts.readOpens++;if(!alive())return
    r.header=handle.header;r.headerHash=digest(handle.header);r.inheritedEventCount=handle.inheritedEventCount
    const start=r.validate&&r.offset>0?r.offset-1:r.offset;let events=(await handle.read(start,undefined,{signal:lifecycle.signal})).events;counts.readEvents+=events.length
    if(!alive())return
    if(r.validate&&r.offset>0){const anchor=events[0];if(!anchor||anchor.seq!==r.offset-1||!r.anchor||digest(anchor)!==r.anchor.eventHash){reset(r,msg('diag.views.anchor-mismatch'));events=(await handle.read(0,undefined,{signal:lifecycle.signal})).events;counts.readEvents+=events.length}else events=events.slice(1)}
    for(let i=0;i<events.length;i++)apply(r,events[i],{anchor:i===events.length-1})
    drain(r);r.ready=true;r.validate=false;r.identity=p.identity??p;r.revision=latest.revision;
     if(r.migration?.status==='pending'){r.migration={...r.migration,status:'complete',eventCount:r.offset,durationMs:performance.now()-started};issue(r,'checkpoint-schema-migration',msg('diag.views.migration-complete',{from:r.migration.fromSchema,to:SESSION_VIEW_SCHEMA,events:r.offset,ms:Math.round(r.migration.durationMs)}))}
     r.diagnostics.delete('source-read');r.diagnostics.delete('event-gap');updateRuntime(r);scheduleCheckpoint(r);notify(r)
   }catch(error){issue(r,'source-read',String(error?.message||error));throw error}finally{if(handle)await handle.close();r.lastReadMs=performance.now()-started}
  }).finally(()=>{r.sync=null})
  return r.sync
 }
 async function refresh(id,{wait=false}={}){
  if(!alive())return snapshot(id)
  const r=record(id);await initialize(r);if(!alive()||r.closed)return snapshot(id)
  const p=get('sessionPersistence');if(!p?.stat)throw new Error('Session persistence stat unavailable')
  const started=performance.now(),source=await p.stat(id,{signal:lifecycle.signal});counts.stats++;r.lastStatMs=performance.now()-started
  if(!alive())return snapshot(id)
  if(!source){issue(r,'source-missing',msg('diag.views.source-missing'));return snapshot(id)}
  const sameIdentity=r.identity===(p.identity??p),live=session(id)
  if(r.identity!==undefined&&!sameIdentity){r.validate=true;r.ready=false}
  if(live&&!r.runtime)updateRuntime(r)
  if(r.ready&&!r.validate&&sameIdentity&&live&&r.offset===live.seq&&r.headerHash===digest(source.header)){
   const changed=r.revision!==source.revision;r.revision=source.revision;if(changed)scheduleCheckpoint(r);return snapshot(id)
  }
  if(r.ready&&!r.validate&&sameIdentity&&r.revision===source.revision&&!r.buffer.size)return snapshot(id)
  const job=synchronize(r,p,source);if(wait)await job;else void Promise.resolve(job).catch(()=>{})
  return snapshot(id)
 }
 function snapshot(id){const r=record(id);return {sessionId:id,ready:r.ready,revision:r.viewRevision,offset:r.offset,header:r.header,data:sessionViewData(r.state),runtime:r.runtime,loading:!!r.sync||!r.ready,diagnostics:{entries:[...r.diagnostics.values()],nativeBackendLimitation:NATIVE_COLD_LIMITATION,migration:r.migration?{...r.migration}:null,lastReadMs:r.lastReadMs??null,lastStatMs:r.lastStatMs??null,sourceRevision:r.revision,checkpointPending:r.dirtyCheckpoint||!!r.write}}}
 function request(id,{pin=true}={}){if(pin){pinned.delete(id);pinned.add(id);while(pinned.size>settings().stateMaxSessions)pinned.delete(pinned.values().next().value)}const r=record(id);if(!r.initialized)void refresh(id).catch(error=>issue(r,'source-read',String(error?.message||error)));return snapshot(id)}
 async function maintain(){if(!alive())return;await Promise.all([...records.keys()].map(id=>refresh(id).catch(()=>{})))}
 for(const [name,handler]of [['session/event',ingest],['goal/changed',({agent})=>{if(agent&&records.has(agent.id)){const r=records.get(agent.id);updateRuntime(r);notify(r)}}],['agent/status',({agent})=>{if(agent&&records.has(agent.id)){const r=records.get(agent.id);updateRuntime(r);notify(r)}}]]){const dispose=ctx.on?.(name,handler);if(typeof dispose==='function')disposers.push(dispose)}
 return Object.freeze({request,track:id=>request(id,{pin:false}),snapshot,refresh,ingest,maintain,counts,
  start(){if(!timer){timer=setInterval(()=>{void maintain()},settings().refreshIntervalMs);timer.unref?.()}},
  async idle(){for(let i=0;i<3;i++)await Promise.all([...records.values()].flatMap(r=>[r.load,r.sync,r.write].filter(Boolean)))},
  async flush(){for(const r of records.values()){if(r.writeScheduled){clearImmediate(r.writeScheduled);r.writeScheduled=null}await persist(r);if(r.dirtyCheckpoint)await persist(r)}},
  async dispose(){
   if(disposed)return
   closing=true
   if(timer)clearInterval(timer);timer=null
   for(const dispose of disposers.splice(0))dispose()
   for(const r of records.values())if(r.wakeup){clearTimeout(r.wakeup);r.wakeup=null}
   for(const job of readQueue.splice(0))job.reject(new Error('View store disposed'))
   lifecycle.abort()
   try{await this.flush()}catch{}
   await Promise.allSettled([...records.values()].flatMap(r=>[r.load,r.sync,r.write].filter(Boolean)))
   disposed=true
  }
 })
}
