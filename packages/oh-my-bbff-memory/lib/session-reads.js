/** ONE public nondeprecated seam. Append mutations + bounded persisted polled view. */
import { createHash } from 'node:crypto'
import { sessionEventFacts, sessionHeaderFacts } from './dsh-adapter.js'
import { DEFAULT_DATA } from './defaults.js'
import { createSessionCheckpointStore } from './session-checkpoints.js'
import { SESSION_READ_SKIP_CODE } from './bbff-contract.js'
import { sessionReadSkipFacts, sessionReadSkipReason } from './session-budget.js'
const bytes = text => Buffer.byteLength(text, 'utf8'), sha = text => createHash('sha256').update(text).digest('hex'), turns = DEFAULT_DATA.fields.routeWindowTurns.max
const fresh = (start, poll = false) => ({ start, cursor: start, human: new Map(), invalid: new Map(), owned: new Map(), ownedList: [], ownedComplete: true, recent: [], polledOnly: poll, bytes: 0, at: -Infinity, savedCursor: -1, lastSavedAt: -Infinity })
const settingsOf = getSettings => getSettings?.() || Object.fromEntries(Object.entries(DEFAULT_DATA.fields).map(([key, value]) => [key, value.default]))
function producerFrame(event, fact) {
  if (fact?.kind !== 'user-message' || fact.source !== DEFAULT_DATA.contract.sourceKind) return null
  // Canonical classification first; ONLY this producer's public extension schema follows.
  const source = event.data?.source
  if (source?.kind !== DEFAULT_DATA.contract.sourceKind || !['full', 'routed'].includes(source.memoryMode)) return null
  const frame = { seq: event.seq, bytes: bytes(fact.text), mode: source.memoryMode, component: ['full','index','route'].includes(source.memoryComponent) ? source.memoryComponent : null, identity: typeof source.memoryIdentity === 'string' ? source.memoryIdentity : null, variant: { replacement: source.memoryVariant?.replacement === true, transition: source.memoryVariant?.transition === true }, hint: source.memoryHint === true, trace: null }
  const trace = source.memoryTrace
  if (trace && trace.signature === frame.identity && trace.usedBytes === frame.bytes && trace.mode === frame.mode && Array.isArray(trace.files)) {
    const files = []
    for (const file of trace.files) {
      if (!file || typeof file.key !== 'string' || typeof file.path !== 'string' || !Number.isSafeInteger(file.includedBytes) || file.includedBytes < 0 || !Number.isSafeInteger(file.originalBytes) || file.originalBytes < file.includedBytes || !['loaded','truncated'].includes(file.status)) return frame
      files.push({ key: file.key, path: file.path, includedBytes: file.includedBytes, originalBytes: file.originalBytes, status: file.status, sourceSha1: typeof file.sourceSha1 === 'string' ? file.sourceSha1 : null, admittedSha1: typeof file.admittedSha1 === 'string' ? file.admittedSha1 : null })
    }
    frame.trace = { component: frame.component, signature: frame.identity, mode: frame.mode, files, usedBytes: frame.bytes, budgetBytes: Number.isSafeInteger(trace.budgetBytes) ? trace.budgetBytes : null }
  }
  return frame
}
function rememberHuman(state, seq, value) {
  state.human.set(seq, value);state.bytes += bytes(value.value.text);state.recent.push(value)
  if (state.recent.length > turns) { const removed = state.recent.shift();if (state.polledOnly) { state.human.delete(removed.value.seq);state.bytes -= bytes(removed.value.text) } }
}
function fold(state, events, metrics) {
  // Validate sequence before ANY accumulated map mutation. No accumulated copies.
  for (let index = 0; index < events.length; index++) if (events[index].seq !== state.cursor + index) throw new Error('Noncontiguous public session read; no prefix was guessed.')
  for (const event of events) {
    state.cursor++;metrics.foldedEvents++
    const decoded = sessionEventFacts(event), fact = decoded.value
    if (!decoded.complete) { state.invalid.set(event.seq, { complete: false, human: false, diagnostics: decoded.diagnostics });if (state.polledOnly && state.invalid.size > turns) state.invalid.delete(state.invalid.keys().next().value);continue }
    if (fact?.kind !== 'user-message') continue
    if (fact.isHuman && fact.text.length) rememberHuman(state, event.seq, { complete: true, human: true, value: { ...fact, seq: event.seq }, sourceDigest: sha(fact.text) })
    const frame = producerFrame(event, fact)
    if (frame) { state.owned.set(event.seq, frame);state.ownedList.push(frame);state.bytes += bytes(JSON.stringify(frame));if (state.polledOnly && state.ownedList.length > DEFAULT_DATA.policies.sessionCheckpointOwnedFrames) { const removed = state.ownedList.shift();state.owned.delete(removed.seq);state.bytes -= bytes(JSON.stringify(removed));state.ownedComplete = false } }
  }
  return state
}
export function createSessionReadCache(ctx, { getSettings, now = Date.now, checkpointDirectory, sessionBudget } = {}) {
  let disposed = false
  const stop = () => { if (disposed) throw new Error('Session read cache is disposed.') }
  const rows = new Map(), inflight = new Map(), pending = new Map(), checkpoints = createSessionCheckpointStore({ directory: checkpointDirectory, getSettings: () => settingsOf(getSettings), now }), metrics = { observations: 0, opens: 0, reads: 0, foldedEvents: 0, hits: 0, evictions: 0, mapCopies: 0, checkpointLoads: 0, checkpointWrites: 0, checkpointErrors: 0, restoredEventLookups: 0 }, get = name => { try { return ctx.get(name) } catch { return undefined } }, keyOf = (id, purpose) => JSON.stringify([id,purpose])
  const view = state => ({ start: state.start, totalEvents: state.cursor, human: state.human, invalid: state.invalid, owned: state.ownedList, ownedComplete: state.ownedComplete, recent: state.recent, at: state.at, source: state.live ? 'live' : 'persisted', revision: state.revision, checkpoint: { loaded: !!state.restored, cursor: state.savedCursor, error: state.checkpointError || null } })
  function persist(id, state, force = false) {
    if (disposed) return
    if (!checkpoints || !state.polledOnly || state.cursor === state.savedCursor || !force && now() - state.lastSavedAt < settingsOf(getSettings).sessionReadReuseMs) return
    try { checkpoints.save(id, state);state.savedCursor = state.cursor;state.lastSavedAt = now();state.checkpointError = null;metrics.checkpointWrites++ } catch (error) { state.checkpointError = String(error.message);metrics.checkpointErrors++ }
  }
  function store(id, purpose, state) {
    if (disposed) return view(state)
    const key = keyOf(id,purpose), settings = settingsOf(getSettings)
    if (state.bytes > settings.sessionReadMaxBytes) { rows.delete(key);throw new Error('Derived session input exceeds its visible cache limit; input/checkpoint preserved.') }
    state.id = id;rows.delete(key);rows.set(key,state);persist(id,state)
    let total = [...rows.values()].reduce((sum,row)=>sum+row.bytes,0)
    while (rows.size > settings.sessionReadMaxRoots || total > settings.sessionReadMaxBytes) { const oldest = rows.keys().next().value, removed = rows.get(oldest);persist(removed.id,removed,true);rows.delete(oldest);total -= removed.bytes;metrics.evictions++ }
    return view(state)
  }
  function restore(id) {
    const saved = checkpoints?.load(id);if (!saved) return null
    const state = fresh(0,true);state.cursor = saved.cursor;state.revision = saved.revision;state.restored = true;state.bound = false;state.savedCursor = saved.cursor;state.lastSavedAt = saved.updatedAt;state.ownedComplete = saved.ownedComplete !== false;state.missingRecent = []
    for (const item of saved.recent) {
      if (item.text === undefined) { state.missingRecent.push(item);continue }
      rememberHuman(state,item.seq,{complete:true,human:true,value:{kind:'user-message',isHuman:true,source:'user',seq:item.seq,time:item.time,text:item.text},sourceDigest:item.digest})
    }
    for (const frame of saved.owned) { state.owned.set(frame.seq,frame);state.ownedList.push(frame);state.bytes += bytes(JSON.stringify(frame)) }
    metrics.checkpointLoads++;return state
  }
  async function fillRecent(id,state,live,persistence,signal) {
    if (!state.missingRecent?.length) return
    let observation,handle
    try {
      if (live) { observation = await get('sessionQuery')?.observeSession?.(id,{projectionMode:'none',signal});metrics.observations++;if (observation?.source !== 'live') throw new Error('Recent checkpoint text observation unavailable.') }
      else { handle = await persistence.open(id,'read',{signal});metrics.opens++ }
      const facts = [...state.recent]
      for (const item of state.missingRecent) {
        const event = observation ? observation.events[item.seq] : (await handle.read(item.seq,1)).events[0];if(handle)metrics.reads++;metrics.restoredEventLookups++
        const decoded = sessionEventFacts(event), fact = decoded.value
        if (!decoded.complete || fact?.kind !== 'user-message' || !fact.isHuman || sha(fact.text) !== item.digest) throw new Error('Persisted recent source identity changed; no historical refold fallback.')
        facts.push({complete:true,human:true,value:{...fact,seq:item.seq},sourceDigest:item.digest})
      }
      state.bytes -= [...state.human.values()].reduce((sum,value)=>sum+bytes(value.value.text),0);state.human.clear();state.recent = []
      for (const fact of facts.sort((a,b)=>a.value.seq-b.value.seq)) { if (!state.human.has(fact.value.seq)) rememberHuman(state,fact.value.seq,fact) }
      state.missingRecent = []
    } finally { observation?.[Symbol.dispose]?.();await handle?.close?.() }
  }
  async function readUncached(id, from, signal, minimumCursor, expectedRevision, purpose) {
    signal?.throwIfAborted?.();stop();const key=keyOf(id,purpose), poll=purpose==='poll', agent=get('agents')?.get?.(id), live=agent?.session||get('sessions')?.get?.(id), persistence=get('sessionPersistence'), identity=persistence?.identity??persistence, settings=settingsOf(getSettings)
    let old=rows.get(key),snapshot
    if (!old && poll && checkpoints) { try { old=restore(id) } catch(error) { metrics.checkpointErrors++;throw error } }
    if (old?.restored && !old.bound) {
      snapshot = live ? null : await persistence?.stat?.(id)
      stop()
      const header = live?.header || snapshot?.header, count = live?.seq ?? snapshot?.eventCount
      if (sessionHeaderFacts(header).value.sessionId !== id || !Number.isSafeInteger(count) || count < old.cursor) throw new Error('Persisted polled checkpoint cannot be verified; no refold from zero.')
      old.live=live;old.identity=identity;old.bound=true;if(!live&&snapshot.eventCount===old.cursor)old.revision=snapshot.revision;await fillRecent(id,old,live,persistence,signal);stop();rows.set(key,old)
    }
    if(poll&&old&&live&&old.live!==live){if(sessionHeaderFacts(live.header).value.sessionId!==id||!Number.isSafeInteger(live.seq)||live.seq<old.cursor)throw new Error('Polled carrier continuity cannot be verified; no historical refold.');old.live=live;old.at=-Infinity}
    const covers=old&&old.start<=from
    if (covers&&(live?old.live===live&&(!Number.isSafeInteger(live.seq)||old.cursor>=live.seq):!old.live&&old.identity===identity)&&(!Number.isSafeInteger(minimumCursor)||old.cursor>=minimumCursor)&&(expectedRevision===undefined||!!live||String(old.revision)===String(expectedRevision))&&now()-old.at<settings.sessionReadReuseMs){metrics.hits++;return store(id,purpose,old)}
    if(live){
      if(covers&&old.live===live&&Number.isSafeInteger(live.seq)&&old.cursor===live.seq){metrics.hits++;old.at=now();return store(id,purpose,old)}
      const observation=await get('sessionQuery')?.observeSession?.(id,{projectionMode:'none',signal});metrics.observations++;stop()
      if(!observation||observation.source!=='live'){observation?.[Symbol.dispose]?.();throw new Error('Attached projection-free observation unavailable; no prepared replay fallback.')}
      try{
        if(poll&&old&&observation.cursor+1<old.cursor)throw new Error('Polled source shrank; explicit recovery required, not a full historical refold.')
        const base=covers&&old.live===live&&old.cursor<=observation.cursor+1?old:fresh(Math.min(from,observation.cursor+1),poll)
        fold(base,observation.events.slice(base.cursor),metrics);for(const event of pending.get(key)||[])if(event.seq>=base.cursor)fold(base,[event],metrics)
        base.live=live;base.at=now();return store(id,purpose,base)
      }finally{observation[Symbol.dispose]?.()}
    }
    if(!persistence?.open)throw new Error('Public readonly persistence unavailable; no full-query fallback.')
    snapshot ||= await persistence.stat?.(id)
    stop()
    const reusable=covers&&!old.live&&old.identity===identity
    if(reusable&&snapshot?.revision!==undefined&&String(old.revision)===String(snapshot.revision)){metrics.hits++;old.at=now();return store(id,purpose,old)}
    let base=reusable?old:fresh(from,poll)
    if(Number.isSafeInteger(snapshot?.eventCount)&&snapshot.eventCount<base.cursor){if(poll&&old)throw new Error('Polled source shrank; preserved checkpoint needs recovery.');base=fresh(Math.min(from,snapshot.eventCount),poll)}
    const handle=await persistence.open(id,'read',{signal});metrics.opens++
    try { stop() } catch (error) { await handle.close();throw error }
    try{
      let events=(await handle.read(base.cursor)).events;metrics.reads++;stop()
      if(base.cursor&&!events.length&&snapshot?.revision!==old?.revision){const anchor=(await handle.read(base.cursor-1,1)).events;metrics.reads++;if(anchor.length!==1||anchor[0].seq!==base.cursor-1){if(poll)throw new Error('Persisted source anchor missing; no full-log fallback.');base=fresh(0);events=(await handle.read(0)).events;metrics.reads++}}
      fold(base,events,metrics);base.live=undefined;base.identity=identity;base.revision=snapshot?.revision;base.at=now();return store(id,purpose,base)
    }finally{await handle.close()}
  }
  async function read(id,{from=0,signal,minimumCursor,expectedRevision,purpose='delta',allowSkipped=false}={}){
    signal?.throwIfAborted?.();stop();if(!Number.isSafeInteger(from)||from<0)throw new Error('Session cursor must be a nonnegative integer.')
    // Session-read budget: a cold log that is too large AND too old is never opened. A targeted,
    // explicit read (the review's own page requests) may opt out with allowSkipped.
    const budget = sessionBudget?.check ? await sessionBudget.check(id, { exempt: allowSkipped === true }) : null
    if (budget?.skipped) { const skipped = new Error(sessionReadSkipReason(budget));skipped.code = SESSION_READ_SKIP_CODE;skipped.sessionRead = sessionReadSkipFacts(budget);throw skipped }
    const key=keyOf(id,purpose);if(inflight.has(key)){await inflight.get(key);return read(id,{from,signal,minimumCursor,expectedRevision,purpose})}
    const job=readUncached(id,from,signal,minimumCursor,expectedRevision,purpose).finally(()=>{inflight.delete(key);pending.delete(key)});inflight.set(key,job);return job
  }
  function observe(session,event){
    if(disposed)return
    for(const purpose of ['poll','delta']){const key=keyOf(session.id,purpose),row=rows.get(key)
      if(inflight.has(key)){const list=pending.get(key)||[];list.push(event);pending.set(key,list);continue}
      if(!row||row.live!==session||event.seq<row.cursor)continue
      if(event.seq!==row.cursor){row.at=-Infinity;continue}
      try{fold(row,[event],metrics);row.at=now();store(session.id,purpose,row)}catch{rows.delete(key)}
    }
  }
  return Object.freeze({read,observe,peek(id,{purpose='delta'}={}){const row=rows.get(keyOf(id,purpose));return row?view(row):null},invalidate(id){for(const row of rows.values())if(row.id===id)row.at=-Infinity},drop(id){for(const[key,row]of rows)if(row.id===id){persist(id,row,true);rows.delete(key);pending.delete(key)}},clear(){for(const row of rows.values())persist(row.id,row,true);rows.clear();pending.clear()},dispose(){for(const row of rows.values())persist(row.id,row,true);rows.clear();pending.clear();disposed=true},metrics:()=>({...metrics,cachedRoots:rows.size,cachedBytes:[...rows.values()].reduce((sum,row)=>sum+row.bytes,0)})})
}
