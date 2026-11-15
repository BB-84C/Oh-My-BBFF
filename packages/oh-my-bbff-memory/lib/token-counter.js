/** Cached counts of actual framed Memory text. Heavy BPE work is isolated from the Host event loop. */
import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { msg } from './host-ref.js'
import registry from './tokenizer-assets/registry.json' with { type: 'json' }
const base=path.dirname(fileURLToPath(import.meta.url))
export const TOKENIZER_REGISTRY=Object.freeze(registry)
export function tokenizerBasis(model, degradedReason=null){
 const record=registry.tokenizers.find(row=>row.key===registry.defaultTokenizer)
 const matched=record.modelIds.includes(model?.model)||record.modelNames.includes(model?.name),fallback=registry.failureEstimator
 const name=degradedReason?fallback.name:record.name,version=degradedReason?fallback.version:record.revision
 return {name,version,revision:degradedReason?null:record.revision,runtime:record.runtime.name+'@'+record.runtime.version,matchedModel:!!matched,available:!degradedReason,estimated:true,method:degradedReason?'heuristic':'tokenizer',reason:degradedReason?String(degradedReason):(!matched?msg('diag.tokenizer.noMatch'):null),record:record.key,basisLine:msg('diag.tokenizer.basis',{name,version:String(version).slice(0,12),degraded:degradedReason?msg('diag.tokenizer.degraded'):''})}
}
export function createTokenCounter({assetsDirectory,runtimeDirectory,workerMemoryMb=registry.workerMemoryMb,timeoutMs=registry.requestTimeoutMs,workerFactory=(url,opts)=>new Worker(url,opts)}={}){
 const record=registry.tokenizers.find(row=>row.key===registry.defaultTokenizer),cache=new Map(),inflight=new Map(),pending=new Map(),stats={hits:0,misses:0,encodes:0,initMs:null,encodeMs:0,hashMs:0};let worker,loading,failed=null,disposed=false,serial=0
 const fail=reason=>{if(!failed){failed=String(reason?.message||reason);cache.clear();worker?.terminate()}for(const job of pending.values()){clearTimeout(job.timer);job.resolve({error:failed})}pending.clear();return failed}
 async function ensure(){
  if(disposed||failed)return false
  if(loading)return loading
  loading=new Promise(resolve=>{
   try{
    worker=workerFactory(new URL('./tokenizer-worker.js',import.meta.url),{workerData:{record,assets:assetsDirectory||path.join(base,'tokenizer-assets',record.directory),runtime:runtimeDirectory||path.join(base,record.runtime.directory)},resourceLimits:{maxOldGenerationSizeMb:workerMemoryMb},execArgv:[]})
    const timer=setTimeout(()=>{fail('Tokenizer initialization timeout');worker?.terminate();resolve(false)},timeoutMs);timer.unref?.()
    worker.on('message',message=>{if(message.kind==='ready'){clearTimeout(timer);stats.initMs=message.initMs;resolve(true);return}if(message.kind==='unavailable'){clearTimeout(timer);fail(message.reason);resolve(false);return}const job=pending.get(message.id);if(job){clearTimeout(job.timer);pending.delete(message.id);if(!message.error){stats.encodes++;stats.encodeMs+=message.encodeMs||0}job.resolve(message)}})
    worker.on('error',error=>{clearTimeout(timer);fail(error);resolve(false)})
    worker.on('exit',code=>{clearTimeout(timer);if(!disposed&&!failed)fail('Tokenizer worker exited ('+code+')');resolve(false)})
   }catch(error){fail(error);resolve(false)}
  });return loading
 }
 const fallback=text=>({tokens:Math.ceil(Buffer.byteLength(text,'utf8')/registry.failureEstimator.bytesPerToken),method:'heuristic',reason:failed||'Tokenizer unavailable'})
 async function encode(text){
  if(!await ensure())return fallback(text)
  const id=++serial,result=await new Promise(resolve=>{const timer=setTimeout(()=>{pending.delete(id);fail('Tokenizer count timeout');worker?.terminate();resolve({error:failed})},timeoutMs);timer.unref?.();pending.set(id,{resolve,timer});try{worker.postMessage({id,text})}catch(error){clearTimeout(timer);pending.delete(id);resolve({error:fail(error)})}})
  if(result.error){fail(result.error);return fallback(text)}
  return {tokens:result.tokens,method:'tokenizer',encodeMs:result.encodeMs}
 }
 async function count(text,{signal}={}){
  if(signal?.aborted)throw signal.reason||new Error('Aborted')
  text=String(text??'');const start=performance.now(),hashStart=performance.now(),key=createHash('sha256').update(record.id+'@'+record.revision+'|'+record.runtime.version+'\0').update(text).digest('hex');stats.hashMs+=performance.now()-hashStart
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);stats.hits++;return {...value,cached:true,elapsedMs:performance.now()-start}}
  if(inflight.has(key)){stats.hits++;return inflight.get(key)}
  stats.misses++
  const promise=encode(text).then(value=>{if(!Number.isSafeInteger(value.tokens)||value.tokens<0)throw new Error('Invalid token count');cache.set(key,value);while(cache.size>registry.cacheEntries)cache.delete(cache.keys().next().value);return {...value,cached:false,elapsedMs:performance.now()-start}}).finally(()=>inflight.delete(key))
  inflight.set(key,promise);const value=await promise;if(signal?.aborted)throw signal.reason||new Error('Aborted');return value
 }
 async function countBatch(texts,options){const input=texts.filter(Boolean),counts=await Promise.all(input.map(text=>count(text,options))),degraded=counts.find(value=>value.method==='heuristic'),estimated=!!degraded||!!failed;return {tokens:estimated?input.reduce((n,text)=>n+fallback(text).tokens,0):counts.reduce((n,row)=>n+row.tokens,0),method:estimated?'heuristic':'tokenizer',reason:failed||degraded?.reason||null,cached:counts.every(row=>row.cached),elapsedMs:counts.reduce((n,row)=>n+row.elapsedMs,0)}}
 return {count,countBatch,basis:model=>tokenizerBasis(model,failed),metrics:()=>({...stats,cacheEntries:cache.size,unavailable:failed}),async dispose(){disposed=true;fail('Tokenizer counter disposed');cache.clear();if(worker)await worker.terminate()}}
}
