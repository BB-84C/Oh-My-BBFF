/** Bounded, read-only activity view. Native payload decoding lives only in the SDK.
 * The same committed-event/watermark strategy as the Widgets incremental view is used,
 * but raw activity has its own bounded RAM tail instead of Widgets' goals/todos state.
 * Native JSONL/zstd may decode internally on a memo miss; consumers never replay/fold the full log.
 */
import { activityEventFacts } from './dsh-adapter.js'
import { DEFAULT_TEAM_SETTINGS, normalizeTeamSettings } from './team-settings.js'
export const ACTIVITY_READ_POLICY = Object.freeze({ retainedEvents:160, retainedSessions:64, countProbeSteps:48, maxEventOffset:2**24 })
/** Background turn-summary scan: small batches separated by a macrotask yield, so one
 * member's native memo-miss read is the only long task and never lands on a request path. */
const SUMMARY_SCAN = Object.freeze({ batchEvents:64, ttlMs:30000, startDelayMs:250 })
const keyOfSnapshot = snapshot => snapshot ? String(snapshot.revision ?? '') + ':' + String(snapshot.sizeBytes ?? '') + ':' + String(snapshot.eventCount ?? '') : 'not-stored'
const yieldTick = () => new Promise(resolve => { setTimeout(resolve, 0) })
const textual = new Set(['arguments','text','reasoning','label','detail','message','reason','objective','content'])
const activityKinds = new Set(['tool-call','tool-result','job-registered','job-settled','assistant-message','assistant-attempt','turn-end','llm-retry','llm-retry-started'])
const keyOf = snapshot => String(snapshot?.revision ?? '') + ':' + String(snapshot?.sizeBytes ?? '')
function bounded(value, chars, arrayLimit) {
  if (Array.isArray(value)) return value.slice(0,arrayLimit).map(row=>bounded(row,chars,arrayLimit))
  if (!value || typeof value!=='object') return value
  const out={}
  for (const [key,item] of Object.entries(value)) {
    if (textual.has(key) && typeof item==='string') {
      const originalLength=Number.isSafeInteger(value[key+'Length'])?value[key+'Length']:item.length
      out[key]=item.slice(0,chars);out[key+'Length']=originalLength;out[key+'Bytes']=Number.isSafeInteger(value[key+'Bytes'])?value[key+'Bytes']:Buffer.byteLength(item,'utf8');out[key+'Truncated']=originalLength>chars || value[key+'Truncated']===true
    } else if (!key.endsWith('Length') && !key.endsWith('Bytes') && !key.endsWith('Truncated') || !Object.hasOwn(out,key)) out[key]=bounded(item,chars,arrayLimit)
    if (Array.isArray(item) && item.length>arrayLimit) { out[key+'Length']=item.length;out[key+'Truncated']=true }
  }
  return out
}
export function decodeEntry(event,settings) {
  const decoded=activityEventFacts(event),fact=decoded.value
  return {seq:event.seq,time:event.time,eventType:event.type,fact:fact?(activityKinds.has(fact.kind)?bounded(fact,settings.activityPreviewChars,settings.activityMaxLimit):{kind:fact.kind}):null,diagnostics:(decoded.diagnostics||[]).map(row=>row.code||row.inference)}
}
/** The committed turn-end summary of one decoded turn-end entry (shared with the ledger fold). */
export function turnSummaryOf(entry) {
  const fact=entry.fact??entry,failure=fact.reason?.failure
  return{time:entry.time??null,turn:fact.turn,reasonKind:fact.reason.kind,...(failure?{failureMessage:failure.message,failureMessageLength:failure.messageLength??failure.message.length,failureMessageTruncated:failure.messageTruncated===true}: {})}
}
const merge=(left,right)=>[...new Map([...left,...right].map(row=>[row.seq,row])).values()].sort((a,b)=>a.seq-b.seq)
export function createActivity({get,getSettings=()=>DEFAULT_TEAM_SETTINGS,logger=null,now=Date.now,ledger=null,statOf=null}={}) {
  const records=new Map(),pending=new Map(),warmers=new Map()
  const config=()=>normalizeTeamSettings(getSettings())
  const session=id=>{try{return get('agents')?.get?.(id)?.session||get('sessions')?.get?.(id)}catch{return undefined}}
  const capacity=s=>Math.max(ACTIVITY_READ_POLICY.retainedEvents,s.activityMaxLimit)
  function record(id) {
    let r=records.get(id)
    if (!r) r={tail:[],end:0,revision:null,identity:null,count:null,countKey:null,chars:config().activityPreviewChars,turnSummary:null,turnChars:config().activityPreviewChars}
    records.delete(id);records.set(id,r)
    while(records.size>ACTIVITY_READ_POLICY.retainedSessions)records.delete(records.keys().next().value)
    return r
  }
  function retain(r,entries,end,settings) { r.tail=merge(r.tail,entries).slice(-capacity(settings));r.end=Math.max(r.end,end);r.chars=settings.activityPreviewChars }
  function watch(id){id=String(id);record(id);return id}
  function observe(current,event) {
    const r=records.get(String(current?.id));if(!r||!Number.isSafeInteger(event?.seq))return
    const settings=config()
    if(r.chars!==settings.activityPreviewChars){r.tail=[];r.end=0;r.chars=settings.activityPreviewChars}
    if(r.tail.some(row=>row.seq===event.seq))return
    // A discontinuity drops the obsolete tail rather than claiming continuity through a gap.
    if(r.tail.length&&event.seq!==r.end){r.tail=[];r.end=0}
    const entry=decodeEntry(event,settings)
    retain(r,[entry],event.seq+1,settings)
    // Live turn ends are already decoded for the activity tail; reuse that fact instead
    // of making any reader decode (or re-read) the log later.
    if(entry.fact?.kind==='turn-end')noteSummary(r,turnSummary(entry),'live',settings)
  }
  // `shared`: an already open read handle of this revision. Opening a cold log decodes it, so one
  // read path opens it once for both the count and the slice (Team 0.10.4).
  async function count(id,snapshot,p,signal,r,shared=null) {
    if(Number.isSafeInteger(snapshot.eventCount)&&snapshot.eventCount>=0)return snapshot.eventCount
    const key=keyOf(snapshot)
    if(r.countKey===key&&Number.isSafeInteger(r.count))return r.count
    // No linear scan: point probes establish an upper bound, then binary-search the end.
    // Each probe requests exactly ONE event from the already decoded log.
    const handle=shared||await p.open(id,'read',{signal});let probes=0
    const exists=async offset=>{signal?.throwIfAborted();if(++probes>ACTIVITY_READ_POLICY.countProbeSteps)throw new Error('Activity count probe budget exhausted; no full-log replay was attempted.');return (await handle.read(offset,1,{signal})).events.length===1}
    try {
      let low=0,high=16
      while(await exists(high)){low=high+1;high*=2;if(high>ACTIVITY_READ_POLICY.maxEventOffset)throw new Error('Activity event offset exceeds the bounded probe policy; no full-log replay was attempted.')}
      while(low<high){const mid=Math.floor((low+high)/2);if(await exists(mid))low=mid+1;else high=mid}
      r.count=low;r.countKey=key;return low
    } finally {if(!shared)await handle.close()}
  }
  const covers=(tail,start,end)=>end===start || tail.length>0&&tail[0].seq<=start&&tail.at(-1).seq>=end-1&&tail.filter(row=>row.seq>=start&&row.seq<end).length===end-start
  async function readEntries(id,limit,before,signal,snapshotHint) {
    const r=record(id),settings=config(),live=session(id),p=get('sessionPersistence')
    if(r.chars!==settings.activityPreviewChars){r.tail=[];r.end=0;r.chars=settings.activityPreviewChars}
    let total=Number.isSafeInteger(live?.seq)?live.seq:null,snapshot=null
    if(total!==null){const end=Math.min(before??total,total),start=Math.max(0,end-limit);if(covers(r.tail,start,end))return{entries:r.tail.filter(row=>row.seq>=start&&row.seq<end),knowledge:r.tail,total,end,source:'live-cache'}}
    // Team ledger ring (0.11.0): the recent events of any agent, recorded live or by its one-time
    // sync, answer a window inside the ring without reading the log.
    if(ledger){
      const ring=ledger.events(id),facts=ledger.agent(id)
      let ringTotal=total
      if(ringTotal===null&&facts?.revision&&Number.isSafeInteger(facts.lastSeq)){const current=snapshotHint?.persistence===p?snapshotHint.snapshot:statOf?await statOf(id,signal):await p?.stat?.(id,{signal});if(current&&String(current.revision)===facts.revision)ringTotal=facts.lastSeq+1}
      if(ringTotal!==null){const end=Math.min(before??ringTotal,ringTotal),start=Math.max(0,end-limit);if(covers(ring,start,end))return{entries:ring.filter(row=>row.seq>=start&&row.seq<end),knowledge:ring,total:ringTotal,end,source:'ledger-ring'}}
    }
    if(!p?.stat||!p?.open)throw new Error('Session persistence is unavailable for the missing activity tail.')
    snapshot=snapshotHint?.persistence===p?snapshotHint.snapshot:statOf?await statOf(id,signal):await p.stat(id,{signal})
    if(!snapshot)return{entries:[],knowledge:[],total:total??0,end:0,source:'not-stored'}
    if(r.identity!==null&&r.identity!==(p.identity??p)){r.tail=[];r.count=null;r.countKey=null}
    r.identity=p.identity??p
    const key=keyOf(snapshot)
    // A cold log is opened (decoded) at most once here, for both the count and the slice.
    let handle=null
    try {
      if(total===null){
        if(!(Number.isSafeInteger(snapshot.eventCount)&&snapshot.eventCount>=0)&&!(r.countKey===key&&Number.isSafeInteger(r.count)))handle=await p.open(id,'read',{signal})
        total=await count(id,snapshot,p,signal,r,handle)
      }
      const end=Math.min(before??total,total),start=Math.max(0,end-limit)
      if(r.revision===key&&covers(r.tail,start,end))return{entries:r.tail.filter(row=>row.seq>=start&&row.seq<end),knowledge:r.tail,total,end,source:'revision-cache'}
      if(end===0)return{entries:[],knowledge:r.tail,total,end,source:'persisted'}
      const readStart=Math.max(0,end-Math.max(capacity(settings),limit))
      handle||=await p.open(id,'read',{signal})
      const slice=await handle.read(readStart,end-readStart,{signal}),entries=slice.events.map(event=>decodeEntry(event,settings))
      const oldest=r.tail[0]?.seq??Infinity
      if(readStart<=r.end&&end>=oldest)retain(r,entries,end,settings)
      else if(before===null){r.tail=entries.slice(-capacity(settings));r.end=end}
      if(before===null||end===total){r.revision=key;r.count=total;r.countKey=key}
      return{entries:entries.filter(row=>row.seq>=start&&row.seq<end),knowledge:merge(entries,r.tail),total,end,source:'persisted'}
    }finally{if(handle)await handle.close()}
  }
  async function filteredWindow(sessionId,{limit,before,kinds,outcome,signal,snapshotHint}={}) {
    const settings=config(),cap=Math.min(limit??settings.activityDefaultLimit,settings.activityMaxLimit),wanted=kinds?.length?new Set(kinds):null,maxScannedEvents=ACTIVITY_READ_POLICY.retainedEvents*ACTIVITY_READ_POLICY.countProbeSteps
    const error=fact=>fact.kind==='turn-end'?fact.reason?.kind==='error':fact.kind==='tool-result'?fact.isError===true:fact.kind==='llm-retry'
    const matches=[],results=new Set();let cursor=before??null,total=0,source='not-stored',scanned=0,first=true,exhausted=false
    while(scanned<maxScannedEvents&&matches.length<cap){
      signal?.throwIfAborted()
      const page=await window(sessionId,{limit:Math.min(ACTIVITY_READ_POLICY.retainedEvents,maxScannedEvents-scanned),before:cursor,signal,snapshotHint,rawBatch:true})
      if(first){total=page.total;source=page.source;first=false}
      if(!page.events.length){exhausted=true;cursor=0;break}
      for(const event of [...page.events].reverse()){
        scanned++;cursor=event.seq
        if(event.kind==='tool-result')results.add(event.callId)
        if((!wanted||wanted.has(event.kind))&&(outcome!=='error'||error(event)))matches.push(event)
        if(matches.length===cap||scanned===maxScannedEvents)break
      }
      if(cursor===0){exhausted=true;break}
    }
    const hostNow=now(),events=matches.reverse().map(event=>({...event,...(Number.isSafeInteger(event.time)?{ageMs:hostNow-event.time}:{}),...(event.kind==='tool-call'&&results.has(event.callId)?{hasResult:true}:{})}))
    return{hostNow,limit:cap,before:before??null,source,total,nextBefore:cursor>0?cursor:null,events,readPolicy:ACTIVITY_READ_POLICY,filters:{...(wanted?{kinds:[...wanted]}:{}),outcome:outcome??'any',scannedEvents:scanned,maxScannedEvents,scanLimitReached:matches.length<cap&&!exhausted&&scanned===maxScannedEvents,exhausted}}
  }
  async function window(sessionId,{limit,before,kinds,outcome,signal,snapshotHint,rawBatch=false}={}) {
    const id=watch(sessionId),settings=config()
    if(limit!==undefined&&(!Number.isSafeInteger(limit)||limit<1))throw new Error('limit must be a positive safe integer')
    if(before!==undefined&&before!==null&&(!Number.isSafeInteger(before)||before<0))throw new Error('before must be a nonnegative exclusive seq cursor')
    if(kinds!==undefined&&(!Array.isArray(kinds)||kinds.some(kind=>typeof kind!=='string'||!kind.trim())))throw new Error('kinds must be an array of non-empty recorded kind names')
    if(outcome!==undefined&&!['any','error'].includes(outcome))throw new Error('outcome must be any|error')
    if(kinds?.length||outcome==='error')return filteredWindow(id,{limit,before,kinds,outcome,signal,snapshotHint})
    const cap=Math.min(limit??settings.activityDefaultLimit,rawBatch?capacity(settings):settings.activityMaxLimit),cursor=before??null,key=id+':'+cursor+':'+cap
    // Concurrent identical reads share one tail fill; hostNow is sampled separately per response.
    let flight=pending.get(key)
    if(!flight){flight=readEntries(id,cap,cursor,signal,snapshotHint);pending.set(key,flight)}
    let cut
    try{cut=await flight}finally{if(pending.get(key)===flight)pending.delete(key)}
    const hostNow=now(),resultIds=new Set(cut.knowledge.filter(row=>row.fact?.kind==='tool-result').map(row=>row.fact.callId))
    const events=cut.entries.map(entry=>{
      const base={seq:entry.seq,eventType:entry.eventType,...(Number.isSafeInteger(entry.time)?{time:entry.time,timeIso:new Date(entry.time).toISOString(),ageMs:hostNow-entry.time}:{})}
      if(!entry.fact)return{...base,kind:'undecodable',decodeDiagnostics:entry.diagnostics}
      const fact=bounded(entry.fact,settings.activityPreviewChars,settings.activityMaxLimit)
      if(fact.kind==='tool-call'){
        const completeAfter=covers(cut.knowledge,entry.seq,cut.total)
        fact.hasResult=resultIds.has(fact.callId)?true:completeAfter?false:null
        fact.resultObservedThroughSeq=cut.knowledge.at(-1)?.seq??null
      }
      return{...fact,...base}
    })
    return{hostNow,limit:cap,before:cursor,source:cut.source,total:cut.total,nextBefore:events.length&&events[0].seq>0?events[0].seq:null,events,readPolicy:ACTIVITY_READ_POLICY}
  }
  const turnSummary=turnSummaryOf
  /** Store one summary. `scope` is 'live' (valid for the live session's lifetime) or a
   * persistence revision key (valid only while that revision is unchanged). */
  function noteSummary(r,value,scope,settings) {
    r.turnSummary={value,scope,status:'ready',asOf:Date.now(),previewChars:settings.activityPreviewChars}
    r.turnChars=settings.activityPreviewChars
  }
  /** Synchronous cache read for request paths (roster). Never decodes, reads or awaits. */
  function peekTurnSummary(sessionId,expectedKey) {
    const r=records.get(String(sessionId)),settings=config(),cached=r?.turnSummary
    if(!cached)return{value:null,status:'pending',pending:true,asOf:null}
    if(cached.previewChars!==settings.activityPreviewChars){r.turnSummary=null;return{value:null,status:'pending',pending:true,asOf:null}}
    if(cached.scope==='live'){const live=session(sessionId);if(!live||(expectedKey!==undefined&&expectedKey!=='live'))return{value:null,status:'pending',pending:true,asOf:null}}
    else if(expectedKey!==undefined&&cached.scope!==expectedKey)return{value:null,status:'pending',pending:true,asOf:null}
    return{value:cached.value,status:cached.status,reason:cached.reason,pending:false,asOf:cached.asOf}
  }
  /** Prefill the in-memory summary from the persistent member-fact cache (no native read). */
  function seedTurnSummary(sessionId,value,scope) {
    if(!value||value.state==='unavailable'||value.state==='pending')return false
    const r=record(sessionId),settings=config()
    if(r.turnSummary&&r.turnSummary.previewChars===settings.activityPreviewChars&&(r.turnSummary.scope==='live'||r.turnSummary.scope===scope))return false
    noteSummary(r,value,scope,settings)
    return true
  }
  /** Bounded backward scan that decodes ONLY turn/end events (no per-event SDK decode)
   * and yields a macrotask between small batches so background work cannot monopolise
   * the event loop. Native memo-miss reads stay the only unavoidable long task. */
  async function scanTurnEnd(id,{signal,settings,maxScan,previous,snapshotHint}={}) {
    const live=session(id)
    if(live){
      if(typeof live.eventAt!=='function'||!Number.isSafeInteger(live.seq))return{value:null,status:'unavailable',reason:'Current native event access is unavailable'}
      const lower=Math.max(0,live.seq-maxScan),scanned=live.seq-lower
      for(let seq=live.seq-1;seq>=lower;seq--){
        signal?.throwIfAborted()
        const event=live.eventAt(seq)
        if(event?.type!=='turn/end')continue
        return{value:turnSummary(decodeEntry(event,settings)),status:'ready',reason:'Committed native turn-end fact',scanned}
      }
      if(lower===0)return{value:previous?.value??null,status:'ready',reason:'No later committed turn-end fact',scanned}
      return{value:null,status:'partial',nextBefore:lower,reason:'Bounded turn-end lookback exhausted; query activity before this cursor',scanned}
    }
    const p=get('sessionPersistence')
    if(!p?.stat||!p?.open)return{value:null,status:'unavailable',reason:'Session persistence is unavailable for the bounded summary scan'}
    const snapshot=snapshotHint?.persistence===p&&snapshotHint?.snapshot?snapshotHint.snapshot:await p.stat(id,{signal})
    if(!snapshot)return{value:null,status:'ready',reason:'No committed turn-end fact',scanned:0,key:'not-stored',persistence:p}
    // eventCount is OPTIONAL in the native contract. Reuse the same bounded point-probe
    // counter as activity.window; never treat an absent optimization as missing history.
    const r=record(id),identity=p.identity??p
    if(r.identity!==null&&r.identity!==identity){r.count=null;r.countKey=null}
    r.identity=identity
    const key=keyOfSnapshot(snapshot)
    if(snapshot.eventCount===0)return{value:null,status:'ready',reason:'No committed turn-end fact',scanned:0,key,persistence:p}
    // One open (one decode of a cold log) serves both the count and the backward scan.
    const handle=await p.open(id,'read',{signal})
    let scanned=0,lower=0
    try {
      const total=await count(id,snapshot,p,signal,r,handle)
      if(total===0)return{value:null,status:'ready',reason:'No committed turn-end fact',scanned:0,key,persistence:p}
      lower=Math.max(0,total-maxScan)
      for(let end=total;end>lower;){
        signal?.throwIfAborted()
        const start=Math.max(lower,end-SUMMARY_SCAN.batchEvents),slice=await handle.read(start,end-start,{signal})
        for(let index=slice.events.length-1;index>=0;index--){
          const event=slice.events[index];scanned++
          if(event?.type!=='turn/end')continue
          return{value:turnSummary(decodeEntry(event,settings)),status:'ready',reason:'Committed native turn-end fact',scanned,key,persistence:p}
        }
        end=start
        // Macrotask boundary: a queued request/timer runs between batches.
        await yieldTick()
      }
    }finally{await handle.close()}
    if(lower===0)return{value:null,status:'ready',reason:'No committed turn-end fact',scanned,key,persistence:p}
    return{value:null,status:'partial',nextBefore:lower,reason:'Bounded turn-end lookback exhausted; query activity before this cursor',scanned,key,persistence:p}
  }
  /** One background refresh per session; never awaited by a request path. */
  function warmTurnSummary(sessionId,{signal,snapshotHint,expectedKey}={}) {
    const id=String(sessionId),existing=warmers.get(id)
    if(existing)return existing
    const flight=(async()=>{
      const r=record(id),settings=config(),maxScan=ACTIVITY_READ_POLICY.retainedEvents*ACTIVITY_READ_POLICY.countProbeSteps
      if(r.turnSummary&&r.turnSummary.previewChars===settings.activityPreviewChars&&(r.turnSummary.scope==='live'||expectedKey===undefined||r.turnSummary.scope===expectedKey))return r.turnSummary
      const result=await scanTurnEnd(id,{signal,settings,maxScan,snapshotHint,previous:r.turnSummary?.value?{value:r.turnSummary.value}:null})
      if(result.status==='ready'&&result.value)noteSummary(r,result.value,result.key??(session(id)?'live':keyOfSnapshot(snapshotHint?.snapshot)),settings)
      else if(result.status==='ready'){r.turnSummary={value:null,scope:result.key??(session(id)?'live':keyOfSnapshot(snapshotHint?.snapshot)),status:'ready',reason:result.reason,asOf:Date.now(),previewChars:settings.activityPreviewChars};r.turnChars=settings.activityPreviewChars}
      else r.turnSummary={value:null,scope:result.key??(session(id)?'live':keyOfSnapshot(snapshotHint?.snapshot)),status:result.status,reason:result.reason,asOf:Date.now(),previewChars:settings.activityPreviewChars}
      return{...result,...(r.turnSummary?{asOf:r.turnSummary.asOf}:{})}
    })().catch(error=>{signal?.throwIfAborted();logger?.warn?.('activity: bounded turn summary unavailable: '+String(error?.message||error));return{value:null,status:'unavailable',reason:String(error?.message||error)}}).finally(()=>{if(warmers.get(id)===flight)warmers.delete(id)})
    warmers.set(id,flight)
    return flight
  }
  /** Compatibility wrapper: blocking only when explicitly awaited by a test/diagnostic. */
  async function lastTurnEnd(sessionId,{signal,snapshotHint}={}) {
    const id=watch(sessionId),p=get('sessionPersistence'),live=session(id),snapshot=live?null:snapshotHint?.persistence===p?snapshotHint.snapshot:await p?.stat?.(id,{signal}),expectedKey=live?'live':snapshotHint?.persistence===p&&snapshotHint?.snapshot?keyOfSnapshot(snapshotHint.snapshot):undefined
    const cached=peekTurnSummary(id,expectedKey)
    if(cached.status==='ready')return cached
    const result=await warmTurnSummary(id,{signal,snapshotHint,expectedKey})
    return{...(result.value!==undefined?{value:result.value}:{value:null}),status:result.status,reason:result.reason,...(result.nextBefore?{nextBefore:result.nextBefore}:{})}
  }
  async function findRegisteredJob(sessionIds,jobId,{signal,limit=80}={}) {
    for(const id of [...new Set(sessionIds.map(String))]){
      try {
        const cut=await readEntries(id,limit,null,signal)
        const entry=cut.knowledge.find(row=>row.fact?.kind==='job-registered'&&row.fact.jobId===jobId&&row.fact.owner===id)
        if(entry)return{sessionId:id,fact:entry.fact,source:cut.source}
      }catch(error){signal?.throwIfAborted();logger?.warn?.('activity: bounded registration lookup unavailable: '+String(error?.message||error))}
    }
    return null
  }
  return{observe,watch,window,lastTurnEnd,peekTurnSummary,warmTurnSummary,seedTurnSummary,summaryKey:keyOfSnapshot,findRegisteredJob,counts:()=>({rings:records.size,pendingReads:pending.size,warmers:warmers.size})}
}
