import { wmsg as msg } from './locale-keys.js'
/** Cache-only state read boundary. Work starts on a later event-loop turn,
 * never in request()/peek(). Each session/part has one owned background job,
 * an observed revision, explicit pending/error reasons, and a last-good value.
 */
import {ROOT_SETTINGS_DEFAULTS} from './settings.js'
export function createStateParts({now=Date.now,maxEntries=()=>ROOT_SETTINGS_DEFAULTS.stateMaxSessions,schedule=run=>{const timer=setImmediate(run);timer.unref?.();return()=>clearImmediate(timer)}}={}){
 const entries=new Map();let disposed=false
 const blank=reason=>({state:'pending',reason,hasValue:false,stale:false,cached:false,startedAt:null,completedAt:null,durationMs:null,workMs:null,waitMs:0,elapsedMs:0,revision:null})
 function view(row){if(!row)return {value:undefined,part:blank(msg('diag.session-part-unread'))};const active=row.state==='pending'||row.state==='running';return {value:row.hasValue?row.value:undefined,part:{state:row.state,reason:row.reason,hasValue:row.hasValue,stale:row.hasValue&&(active||row.invalidated||row.state==='error'||row.requestedRevision!==row.revision),cached:row.hasValue,startedAt:row.startedAt,completedAt:row.completedAt,durationMs:row.durationMs,workMs:row.workMs,waitMs:row.waitMs,elapsedMs:row.startedAt===null?0:active?Math.max(0,now()-row.startedAt):row.durationMs||0,revision:row.revision}}}
 function drop(entry){entry.disposed=true;for(const row of entry.parts.values()){row.cancel?.();row.controller?.abort();row.start=null}}
 function entryFor(id){let entry=entries.get(id);if(!entry){entry={id,parts:new Map(),disposed:false,startedAt:now(),completedAt:null};entries.set(id,entry)}else{entries.delete(id);entries.set(id,entry)}while(entries.size>Math.max(1,maxEntries())){const oldest=entries.keys().next().value;drop(entries.get(oldest));entries.delete(oldest)}return entry}
 function queue(entry,row,spec){
  if(entry.completedAt!==null){entry.startedAt=now();entry.completedAt=null}
  row.state='pending';row.reason=spec.reason;row.requestedRevision=spec.revision;row.queued=true;row.invalidated=false
  row.start=()=>{
   row.cancel=null;row.queued=false;if(disposed||entry.disposed)return
   row.controller=new AbortController();row.state='running';row.startedAt=now();row.workStartedAt=row.startedAt;row.reason=spec.reason
   // load is deferred through a promise as well: synchronous native work must
   // not execute inside request() even with a deterministic test scheduler.
   row.promise=Promise.resolve().then(()=>spec.load(row.controller.signal,()=>{row.workStartedAt=now()})).then(value=>{
    if(disposed||entry.disposed)return
    row.value=value;row.hasValue=true;row.revision=spec.revision;row.state='ready';row.reason=''
   },error=>{if(disposed||entry.disposed)return;row.state='error';row.reason=error?.bbffRef||msg('diag.session-part-read-failed',{detail:String(error?.message||error)})}).finally(()=>{
    row.completedAt=now();row.durationMs=Math.max(0,row.completedAt-row.startedAt);row.workMs=Math.max(0,row.completedAt-row.workStartedAt);row.waitMs=Math.max(0,row.workStartedAt-row.startedAt);row.promise=null;row.controller=null;row.start=null
   })
  }
  row.cancel=schedule(row.start)
 }
 function request(id,key,spec){
  const entry=entryFor(id);let row=entry.parts.get(key)
  if(!row){row={...blank(spec.reason),value:undefined,queued:false,promise:null,requestedRevision:spec.revision};entry.parts.set(key,row)}
  row.requestedRevision=spec.revision
  if(!disposed&&!row.queued&&!row.promise){
   const age=row.completedAt===null?Infinity:now()-row.completedAt
   if(!row.hasValue||row.invalidated||age>=spec.reuseMs){
    if(row.state==='error'&&!row.invalidated&&age<spec.reuseMs)return view(row)
    // Equal revision is a known unchanged read model. Callers whose source has
    // no cheap revision provide a time-bucket/public-service change token.
    if(!row.hasValue||row.revision!==spec.revision||row.invalidated)queue(entry,row,spec)
   }
  }
  return view(row)
 }
 return Object.freeze({request,peek:(id,key)=>view(entries.get(id)?.parts.get(key)),size:()=>entries.size,
  background(id,complete){const entry=entries.get(id);if(!entry)return {startedAt:null,completedAt:null,elapsedMs:0,complete:false};if(complete&&entry.completedAt===null)entry.completedAt=now();else if(!complete&&entry.completedAt!==null){entry.startedAt=now();entry.completedAt=null}return {startedAt:entry.startedAt,completedAt:entry.completedAt,elapsedMs:Math.max(0,(entry.completedAt??now())-entry.startedAt),complete}},
  invalidate(id,keys){const entry=entries.get(id);if(!entry)return;for(const [key,row]of entry.parts)if(!keys||keys.includes(key)){row.invalidated=true}},
  async ensure(id,key,spec){request(id,key,spec);let row=entries.get(id)?.parts.get(key);if(row?.queued){row.cancel?.();row.cancel=null;row.start()}row=entries.get(id)?.parts.get(key);if(row?.promise)await row.promise;const result=view(row);if(result.part.state==='error')throw new Error(result.part.reason);return result.value},
  async settled(id){await new Promise(resolve=>setImmediate(resolve));const entry=entries.get(id);if(entry)await Promise.all([...entry.parts.values()].map(row=>row.promise).filter(Boolean))},
  dispose(){disposed=true;for(const entry of entries.values())drop(entry);entries.clear()}
 })
}
