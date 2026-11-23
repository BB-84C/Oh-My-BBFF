// Team operations use exact live caller authority; observations never cold-resume.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { classify, assertPosition, positionRemedy, TREE_ROOT_POSITIONS } from './classify.js'
import { routeText } from './catalog.js'
import { routeForBinding, resolveBindingModel } from './models.js'
import { createReportCheckpoints, REPORT_PLACEHOLDER } from './report-checkpoints.js'
import { createReportImport } from './report-import.js'
import { createReportTimeBackfill } from './report-time-backfill.js'
import { teamCapacity, normalizeTeamSettings, DEFAULT_TEAM_SETTINGS } from './team-settings.js'
import { contextPressureFacts, projectionKey, assistantMessageFacts, nativeCompactCommand, isNativeCompactCommand, sessionHeaderFacts } from './dsh-adapter.js'
import { createActivity } from './activity.js'
import { createTree } from './tree.js'
import { createLedgerFeed } from './ledger-feed.js'
import { createLedger } from './ledger.js'

const blocks = (message) => [{ type: 'text', text: message }]
const CATALOG_MODES = new Set(['continuable', 'one-shot', 'external'])

/** The caller identifies host state versus query wire; native decoding belongs to the adapter. */
export function contextUsage(projection, source = 'live', view = 'state') {
  const facts = contextPressureFacts(projection, { view })
  return { ...facts.value, source, ...(facts.diagnostics.length ? { diagnostics: facts.diagnostics } : {}) }
}

export function lastReportFacts(messages, { view = 'message', limit = DEFAULT_TEAM_SETTINGS.reportExcerptChars } = {}) {
  for (let index = (messages || []).length - 1; index >= 0; index--) {
    const facts = assistantMessageFacts(messages[index], { view })
    if (facts.value?.text) return { text: facts.value.text.slice(0, limit), truncated: facts.value.text.length > limit, totalChars: facts.value.text.length, limit }
  }
  return { text: '', truncated: false, totalChars: 0, limit }
}
export function lastReport(messages, options) { return lastReportFacts(messages, options).text }

export function createTeamOps(ctx, { bindings, getCatalog, getTeamSettings = () => ({}), getEnforcementStatus = null, pendingFile = null, reportFile = null, reportImportFile = null, sessionRoot = null, memberFactsFile = null, tree = null }) {
  const get = (name) => { try { return ctx.get(name) } catch { return undefined } }
  // Without an injected tree, ops owns one; its ledger persists next to the former member-facts file when one is named.
  const ownsTree = !tree
  const nativeTree = tree || createTree(get, { bindings, getSettings: getTeamSettings, ...(memberFactsFile ? { ledger: createLedger({ file: join(dirname(memberFactsFile), 'ledger.sqlite') }) } : {}) })
  // The Team ledger (lib/ledger.js) and its live feed: every repeated read below answers from it.
  const ledger = nativeTree.ledger
  const feed = createLedgerFeed({ ledger, get, getSettings: getTeamSettings, tree: nativeTree })
  let state = { version: 1, pending: {}, results: {} }
  if (pendingFile && existsSync(pendingFile)) {
    try {
      const saved = JSON.parse(readFileSync(pendingFile, 'utf8'))
      if (!saved || typeof saved.pending !== 'object' || !saved.pending || typeof saved.results !== 'object' || !saved.results) throw new Error('invalid state shape')
      state = { version: 1, pending: saved.pending, results: saved.results }
    } catch (error) { throw new Error('pending compaction state is invalid: ' + String(error?.message || error)) }
  }
  const jobs = new Map()
  const lifecycle = new AbortController()
  const persist = () => {
    const results = Object.entries(state.results).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 256)
    state.results = Object.fromEntries(results)
    if (!pendingFile) return
    mkdirSync(dirname(pendingFile), { recursive: true })
    const temporary = pendingFile + '.' + randomUUID() + '.tmp'
    writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8')
    renameSync(temporary, pendingFile)
  }
  const liveAgent = (id) => get('agents')?.get?.(String(id))
  // One shared, memoized stat per cold session (tree.statSession); never a log read.
  const statOf = (id, signal) => typeof nativeTree.statSession === 'function' ? nativeTree.statSession(String(id), signal) : get('sessionPersistence')?.stat?.(String(id), signal ? { signal } : {})
  const compactionFor = (agent) => {
    // Agent presets may isolate compaction from the Host root. Prefer the target
    // session's own implementation and fall back only when no scoped one exists.
    try { const scoped = agent?.ctx?.get?.('compaction'); if (scoped?.compactNow) return { kind: 'service', service: scoped } } catch {}
    const service = get('compaction')
    if (service?.compactNow) return { kind: 'service', service }
    // A preset can isolate the service below agent.ctx itself. Its native command
    // captures that exact service; use the public command runtime rather than
    // traversing Cordis internals or mutating the preset. Accept ONLY DSH's native
    // definition, never an unrelated custom command that happens to be /compact.
    let commands
    try { commands = agent?.ctx?.get?.('commands') || get('commands') } catch { commands = get('commands') }
    const command = nativeCompactCommand()
    if (commands?.find && commands?.execute && isNativeCompactCommand(commands.find(agent, command.name)).value) return { kind: 'command', commands }
    return null
  }
  // Lead row first, then every direct child of the Lead with its tier (core | outsourced).
  const membersOf = (caller) => {
    const members = nativeTree.membersOf(caller)
    if (!members.length) throw new Error('this conversation is not in a live subagent tree')
    return members
  }
  // A Team member is a direct child of a tree root that is not a one-shot role dispatch.
  const isMemberSession = (session) => { const header = sessionHeaderFacts(session?.header).value; return header.isSubagent === true && header.depth === 1 && bindings.get(String(session.id))?.kind !== 'oneshot' }
  const idle = (member, agent) => member.status !== 'running' && agent?.status !== 'running'
  const assertActive = (caller) => {
    if (!caller) throw new Error('a calling agent is required')
    const cls = classify(caller, get, getTeamSettings())
    if (cls.position === 'foreign') throw new Error(positionRemedy(cls))
  }
  // Lead-only actions; tree-root actions (activity, job kill) also allow an Orchestrator root (TREE_ROOT_POSITIONS).
  const assertLead = (caller) => assertPosition(caller, get, getTeamSettings(), 'compact members')
  const assertLeadAction = (caller, action, options) => assertPosition(caller, get, getTeamSettings(), action, options)
  const activity = createActivity({ get, getSettings: getTeamSettings, logger: ctx.logger, now: Date.now, ledger, statOf })
  const bindingDiagnostics = new Map()
  function recordBindingDiagnostic(sessionId, issue) {
    const id=String(sessionId),signature=JSON.stringify(issue),previous=bindingDiagnostics.get(id)
    if(previous?.signature===signature)return previous.value
    const limit=normalizeTeamSettings(getTeamSettings()).activityPreviewChars,value={source:'team-diagnostic',kind:'binding-fallback',time:Date.now(),...issue,reason:String(issue.reason).slice(0,limit),reasonLength:String(issue.reason).length,reasonTruncated:String(issue.reason).length>limit}
    bindingDiagnostics.delete(id);bindingDiagnostics.set(id,{signature,value})
    while(bindingDiagnostics.size>normalizeTeamSettings(getTeamSettings()).reportCacheEntries)bindingDiagnostics.delete(bindingDiagnostics.keys().next().value)
    return value
  }

  const reports = createReportCheckpoints(reportFile)
  const reportImport=createReportImport({file:reportImportFile,reports,logger:ctx.logger,getLimit:()=>normalizeTeamSettings(getTeamSettings()).reportExcerptChars,signal:lifecycle.signal,headerFor:async(id,signal)=>{
    const live=liveAgent(id)
    if(live)return live.session.header
    const snapshot=await statOf(id,signal)
    return snapshot?.header
  }})
  const reportTimeBackfill = createReportTimeBackfill({ reports, sessionRoot, logger: ctx.logger, getSettings: getTeamSettings })
  const reportValue = (row, stale) => {
    if(!row)return {lastReport:null,reportExcerpt:null,reportStatus:'none',reportPlaceholder:REPORT_PLACEHOLDER.ui,reportAt:null,reportStale:false}
    const limit=normalizeTeamSettings(getTeamSettings()).reportExcerptChars,report={...row.report,text:row.report.text.slice(0,limit),limit,truncated:row.report.truncated||row.report.totalChars>limit}
    const retained=stale||row.source?.kind==='legacy-roster'
    return {lastReport:report.text,reportExcerpt:report,reportStatus:retained?'stale':'ready',reportAt:row.timestamp??null,reportTimeSource:row.source?.timeSource||null,reportStale:retained,reportSource:row.source||{kind:'live-event'}}
  }
  // Report area: the Lead and its core members (member bindings). Outsourced agents (one-shot
  // dispatches, unbound native subagents, agents started by members) are listed by teamView.
  function reportRows(caller) {
    let members
    try { members = membersOf(caller).filter(member => member.role === 'lead' || member.tier === 'core') } catch { return null }
    const catalog = getCatalog(caller)
    return members.map(member => {
      const id=String(member.id),binding=bindings.get(id),role=binding?catalog.byId.get(binding.role):null,live=liveAgent(id),row=live?reports.get(live.session.header):reports.getById(id)
      return {
        sessionId:id,name:String(member.name),nativeRole:String(member.role||'teammate'),isLead:member.role==='lead',
        bound:!!binding,role:binding?.role||null,roleTitle:role?.title||null,seat:binding?.seat||null,
        status:String(member.status||'inactive'),live:!!live,
        ...reportValue(row,!live),
      }
    })
  }
  /** Route label for one team row: the bound role route, a dispatch's frozen route, or a live agent's own selection. */
  function routeLabelOf(member, catalog) {
    const binding = bindings.get(String(member.id))
    try {
      if (binding?.kind === 'member') return routeText(routeForBinding(binding, catalog, get))
      if (binding?.route) return routeText(binding.route)
      const selection = liveAgent(member.id)?.model?.current?.()
      if (selection?.provider && selection?.model) return routeText({ provider: selection.provider, model: selection.model, effort: selection.reasoningEffort })
    } catch {}
    return null
  }
  // ---- Recency: lastActiveAt from the Team ledger and live state only (no log read) ----
  /** Latest of: last recorded event, turn end, report and createdAt. Null when none is known. */
  function lastActiveAtOf(id, createdAt) {
    const key = String(id), live = liveAgent(key), facts = ledger.agent(key), times = [createdAt, facts?.lastEventAt, facts?.turnEndedAt, facts?.reportAt]
    times.push(activity.peekTurnSummary(key).value?.time)
    const row = live ? reports.get(live.session.header) : reports.getById(key)
    if (row?.timestamp) times.push(Date.parse(row.timestamp))
    const known = times.filter(value => Number.isFinite(value) && value > 0)
    return known.length ? Math.max(...known) : null
  }
  /** When the current run started: the recorded running transition, else the open turn's start. */
  const runningSinceOf = id => { const facts = ledger.agent(String(id)); return facts?.runningSince ?? facts?.turnStartedAt ?? null }
  /** Native running state of the live Agent right now: running | idle (resident) | inactive (not loaded). */
  const liveStatus = id => { const agent = liveAgent(id); return agent ? (agent.status === 'running' ? 'running' : 'idle') : 'inactive' }
  /**
   * Per-agent outsourced counts over every tree row: `outsourcedCount` = outsourced agents whose
   * creator is that agent; `outsourcedDescendants` = outsourced agents anywhere below it.
   * @returns a lookup id -> { outsourcedCount, outsourcedDescendants }.
   */
  function tallyOutsourced(rows) {
    const parentOf = new Map(rows.map(row => [String(row.id), row.parentId ? String(row.parentId) : null]))
    const direct = new Map(), below = new Map()
    for (const row of rows) {
      if (row.tier !== 'outsourced') continue
      const parent = parentOf.get(String(row.id))
      if (parent) direct.set(parent, (direct.get(parent) || 0) + 1)
      for (let up = parent, hops = 0; up && hops <= rows.length; up = parentOf.get(up), hops++) below.set(up, (below.get(up) || 0) + 1)
    }
    return id => ({ outsourcedCount: direct.get(String(id)) || 0, outsourcedDescendants: below.get(String(id)) || 0 })
  }
  /** Running first, then most recently active first; unknown recency last. */
  const byRecency = (a, b) => (b.status === 'running') - (a.status === 'running') || (b.lastActiveAt ?? -Infinity) - (a.lastActiveAt ?? -Infinity)

  /**
   * Public two-tier team view (Team API `?action=team` and the `bbffTeam.members(rootAgent)`
   * service): every agent of the Lead's native tree. Core members (member bindings) first, then
   * outsourced agents newest first, bounded by settings.rosterOutsourcedLimit with the omitted count.
   * No cold resume; deeper agents come from the tree's revision-keyed walk (a cold catalog is decoded once per revision).
   */
  async function teamView(caller, signal) {
    let tree
    try { if (!membersOf(caller).length) throw new Error('no tree'); tree = await nativeTree.teamTree(caller, signal) }
    catch (error) { signal?.throwIfAborted?.(); return { available: false, version: 1, reason: 'This conversation is not in a live subagent tree', counts: { core: 0, outsourced: 0, outsourcedOmitted: 0 }, members: [] } }
    const rows = tree.rows, lead = rows[0], catalog = getCatalog(caller), limit = normalizeTeamSettings(getTeamSettings()).rosterOutsourcedLimit
    // Status is read from the native live Agent at this moment, never from a cached row.
    for (const member of rows) { member.status = liveStatus(member.id); member.lastActiveAt = lastActiveAtOf(member.id, member.createdAt); member.runningSince = member.status === 'running' ? runningSinceOf(member.id) : null }
    const core = rows.filter(member => member.tier === 'core')
    const outsourced = rows.filter(member => member.tier === 'outsourced').sort(byRecency)
    const shown = outsourced.slice(0, limit)
    // Outsourced counts per agent from the FULL tree (not the bounded list): direct children and the
    // whole subtree, so badges stay right however many outsourced rows are omitted.
    const outsourcedTally = tallyOutsourced(rows)
    const row = member => {
      const binding = bindings.get(String(member.id))
      const base = {
        sessionId: String(member.id), name: String(member.name), ...(member.nameSource === 'bbff-binding' ? { alias: String(member.name) } : {}),
        tier: member.tier, kind: member.kind, role: binding?.role || null, routeLabel: routeLabelOf(member, catalog),
        status: member.status, lastActiveAt: member.lastActiveAt, ...(member.status === 'running' ? { runningSince: member.runningSince } : {}), createdAt: member.createdAt ?? null, description: String(member.description || ''),
        dispatchedBy: String(member.dispatchedBy || lead.name),
        // Native subagentchat address parts (sidebar navigation): the creating session and the catalog mode.
        parentId: String(member.parentId || lead.id), mode: CATALOG_MODES.has(member.mode) ? member.mode : 'unknown',
      }
      if (member.tier !== 'core') return base
      const live = liveAgent(member.id), report = reportValue(live ? reports.get(live.session.header) : reports.getById(String(member.id)), !live)
      return { ...base, seat: binding?.seat || null, reportExcerpt: report.lastReport || null, reportAt: report.reportAt, ...outsourcedTally(member.id) }
    }
    let enabled = null
    try { enabled = classify(nativeTree.leadOf(caller), get, getTeamSettings()).position === 'lead' } catch {}
    return {
      available: true, version: 1, enabled, lead: { sessionId: String(lead.id), name: String(lead.name), status: lead.status, lastActiveAt: lead.lastActiveAt, ...(lead.status === 'running' ? { runningSince: lead.runningSince } : {}), ...outsourcedTally(lead.id) },
      counts: { core: core.length, outsourced: outsourced.length, outsourcedOmitted: outsourced.length - shown.length },
      ...(tree.partial ? { partial: tree.partial } : {}),
      // Running agents first (core or outsourced), then by most recent activity.
      members: [...core, ...shown].sort(byRecency).map(row),
    }
  }  const unwatchReports = typeof ctx.on === 'function' ? ctx.on('session/event', (session, event) => {
    feed.observe(session, event)
    activity.observe(session, event)
    const facts=assistantMessageFacts(event,{view:'event'})
    if(!facts.value?.text)return
    const agent=liveAgent(session.id)
    if(!agent || !isMemberSession(session))return
    reports.record(session.header,event.seq,facts.value.text,normalizeTeamSettings(getTeamSettings()).reportExcerptChars)

    const persistence=get('sessionPersistence')
    if(persistence?.stat)Promise.resolve(persistence.stat(String(session.id),{signal:lifecycle.signal})).then(snapshot=>{if(snapshot)reports.revision(session.id,event.seq,snapshot.revision,persistence.identity)}).catch(()=>{})
  }) : null
  const pressureReads = new WeakMap()
  function liveObservation(agent, fresh = false) {
    const session=agent.session,seq=session.seq,key=projectionKey('context-pressure')
    let projections
    try { projections=agent.ctx?.get?.('sessionProjections') } catch {}
    projections ||= get('sessionProjections')
    const previous=pressureReads.get(session)
    let context=Number.isSafeInteger(seq)&&previous?.seq===seq&&previous.service===projections&&!fresh?previous.context:null
    if(!context){
      const started=performance.now();let pressure,error=null
      // Public synchronous snapshot of the client-visible wire view (projectedTokens included).
      try { pressure=projections?.snapshot?.(session,[key])?.values?.[key] } catch(reason){error=String(reason?.message||reason)}
      const facts=contextUsage(pressure,'live','wire'),measuredAt=new Date().toISOString()
      if(facts.usedTokens!==null)context={...facts,asOfSeq:Number.isSafeInteger(session.seq)?session.seq-1:null,sessionSeq:session.seq??null,measuredAt,stale:false,readMs:performance.now()-started}
      else {
        let checkpoint
        try { checkpoint=projections?.cachedSnapshot?.(session,[key])||get('sessionProjectionCache')?.cachedSnapshot?.(session.header,[key]) } catch {}
        context={...contextUsage(checkpoint?.values?.[key],checkpoint?'cached-checkpoint':'unavailable','wire'),asOfSeq:checkpoint?.asOfSeq??null,sessionSeq:null,measuredAt:null,stale:true,readMs:performance.now()-started,reason:error||'Current native context pressure is unavailable; a cached value is only a hint'}
      }
      if(Number.isSafeInteger(session.seq)&&!context.stale)pressureReads.set(session,{seq:session.seq,service:projections,context})
    }
    return {context,...reportValue(reports.get(session.header),false),asOfSeq:session.seq}
  }
  function turnEndPart(id,expectedKey,fallback) {
    const summary=activity.peekTurnSummary(id,expectedKey)
    const pending=()=>({value:{state:'pending',reason:'Last turn summary is queued or loading in the background'},part:{status:'pending',pending:true,asOf:null,reason:'This read never waits for the last turn summary'}})
    if(summary.status==='ready'){
      const value=summary.value?{...summary.value,state:'ok'}:{state:'unavailable',reason:summary.reason||'No committed turn-end fact was found in this session'}
      return{value,part:{status:value.state==='ok'?'ready':'unavailable',pending:false,asOf:summary.asOf?new Date(summary.asOf).toISOString():null,reason:value.reason||'Cached committed native turn-end fact'}}
    }
    if(summary.status==='unavailable'||summary.status==='partial')return{value:{state:'unavailable',reason:summary.reason||'Bounded summary lookup could not retrieve a committed turn-end'},part:{status:'unavailable',pending:false,asOf:summary.asOf?new Date(summary.asOf).toISOString():null,reason:summary.reason||'Bounded summary lookup did not return a turn-end'}}
    if(fallback?.value?.state==='unavailable')return{value:fallback.value,part:{status:'unavailable',pending:false,asOf:Number.isFinite(fallback.asOf)?new Date(fallback.asOf).toISOString():null,reason:fallback.value.reason}}
    if(fallback?.value)return{value:{...fallback.value,state:'ok'},part:{status:'stale',pending:false,asOf:Number.isFinite(fallback.asOf)?new Date(fallback.asOf).toISOString():null,reason:'Cached committed turn-end fact; background validation may be queued'}}
    // 0.8.3 cached null/unavailable summaries are not authoritative: an omitted native
    // eventCount caused false negatives. Leave them pending until 0.8.4 revalidates.
    return pending()
  }
  // ---- Member facts (Team 0.11.0): the Team ledger, never a log read on this path ----
  // A cold member's context estimate, last report and last turn end come from its ledger row. A
  // member the ledger never recorded is queued for the tree's background sync (one decode per
  // revision) and reads as pending until then; a recorded one is answered at once and re-checked
  // in the background when its revision check is due.
  const ledgerTurnEnd = facts => facts?.lastTurn ? { ...facts.lastTurn, state: 'ok' } : { state: 'unavailable', reason: facts?.syncError ? 'Session log unavailable: ' + facts.syncError : 'No committed turn-end fact was found in this session' }
  function observeMember(id) {
    const key = String(id), agent = liveAgent(key)
    if (agent) {
      const live = liveObservation(agent), asOf = null
      let summary = turnEndPart(key, 'live')
      if (summary.part.pending) {
        const facts = ledger.agent(key)
        if (facts?.lastTurn) summary = { value: ledgerTurnEnd(facts), part: { status: 'ready', pending: false, asOf: Number.isFinite(facts.turnEndedAt) ? new Date(facts.turnEndedAt).toISOString() : null, reason: 'Team ledger turn-end fact' } }
        else void activity.warmTurnSummary(key, { signal: lifecycle.signal })
      }
      return { ...live, lastTurnEnd: summary.value, lastTurnEndPending: summary.part.pending, parts: { report: { status: 'ready', reason: 'Live member report facts', asOf }, context: { status: live.context?.percent === null ? 'unavailable' : 'ready', reason: 'Live Agent-own context pressure', asOf }, turnEnd: summary.part }, pending: false, cached: false, asOf: null }
    }
    const facts = ledger.agent(key)
    if (!facts?.revision) {
      nativeTree.requestSync(key)
      const pendingPart = { status: 'pending', reason: 'This member is queued for a one-time background ledger sync', asOf: null }
      return { context: { ...contextUsage(null, 'pending'), reason: 'Member facts are not in the Team ledger yet; background sync queued' }, lastReport: null, reportExcerpt: null, lastTurnEnd: { state: 'pending', reason: 'Last turn summary is queued or loading in the background' }, lastTurnEndPending: true, parts: { report: pendingPart, context: pendingPart, turnEnd: { ...pendingPart, pending: true } }, pending: true, cached: false, asOf: null }
    }
    const current = nativeTree.isCurrent(key)
    if (!current) nativeTree.requestSync(key)
    const asOf = Number.isFinite(facts.syncedAt) ? new Date(facts.syncedAt).toISOString() : null, reason = current ? 'Team ledger (current revision)' : 'Team ledger; background revision check queued'
    // Context: the native projection checkpoint for the last stat-ed header (cheap, no log read), else the ledger's turn-end estimate.
    let checkpoint
    try { const snapshot = nativeTree.peekStat?.(key); if (snapshot?.header) checkpoint = get('sessionProjectionCache')?.cachedSnapshot?.(snapshot.header, [projectionKey('context-pressure')]) } catch {}
    const context = checkpoint ? { ...contextUsage(checkpoint.values?.[projectionKey('context-pressure')], 'cached-checkpoint', 'wire'), asOfSeq: checkpoint.asOfSeq ?? null, stale: true } : { ...contextUsage(facts.context ?? null, facts.context ? 'ledger' : 'unavailable', 'wire'), asOfSeq: facts.lastSeq ?? null, stale: true }
    const report = reportValue(reports.getById(key), true), lastReport = report.lastReport ?? (facts.reportText || null)
    const lastTurnEnd = ledgerTurnEnd(facts)
    if (facts.lastTurn) activity.seedTurnSummary(key, facts.lastTurn, 'ledger:' + facts.revision)
    return { context, ...report, lastReport, ...(report.lastReport ? {} : facts.reportText ? { reportExcerpt: { text: facts.reportText, limit: normalizeTeamSettings(getTeamSettings()).reportExcerptChars, truncated: false, totalChars: facts.reportText.length }, reportStatus: 'stale', reportAt: Number.isFinite(facts.reportAt) ? new Date(facts.reportAt).toISOString() : null } : {}), lastTurnEnd, lastTurnEndPending: false, parts: { report: { status: current ? 'ready' : 'stale', reason, asOf }, context: { status: context.percent === null ? 'unavailable' : 'stale', reason, asOf }, turnEnd: { status: facts.lastTurn ? 'ready' : 'unavailable', pending: false, asOf: Number.isFinite(facts.turnEndedAt) ? new Date(facts.turnEndedAt).toISOString() : null, reason: facts.lastTurn ? 'Team ledger turn-end fact' : lastTurnEnd.reason } }, pending: false, cached: true, asOf }
  }  function peekContext(id) { const key = String(id), agent = liveAgent(key); if (agent) return liveObservation(agent, true).context; const facts = ledger.agent(key); return facts?.context ? { ...contextUsage(facts.context, 'ledger', 'wire'), stale: true } : null }
  function peekReport(id) { const live = liveAgent(id), row = live ? reports.get(live.session.header) : reports.getById(id); return reportValue(row, !live) }

  async function roster(caller, signal) {
    signal?.throwIfAborted()
    const started=performance.now()
    assertActive(caller)
    const capacity = teamCapacity(get, getTeamSettings())
    const lead = nativeTree.leadOf(caller)
    if (!lead) return { team: false, members: [], idleByRole: {}, reason: 'This conversation is not in a live subagent tree', ...capacity }
    const rootClass = classify(lead, get, getTeamSettings()), teamMode = rootClass.position === 'lead'
    // Why Team mode is off, so an agent can tell the user what to do (e.g. turn on Use Agent Teams).
    const teamState = teamMode ? { position: 'lead' } : { position: rootClass.position, reason: rootClass.reason, remedy: positionRemedy(rootClass) }
    const catalog = getCatalog(caller), currentSettings = normalizeTeamSettings(getTeamSettings())
    // Core members (member bindings) get full rows; outsourced agents (one-shot dispatches, unbound
    // native subagents, agents started by members) get one bounded compact row each, newest first.
    const view = await teamView(caller, signal)
    const viewRows = new Map(view.members.map(row => [row.sessionId, row])), viewRow = id => viewRows.get(String(id))
    const members = membersOf(caller).filter((member) => member.tier === 'core')
    const outsourced = view.members.filter((member) => member.tier === 'outsourced').map((member) => ({ name: member.name, role: member.role || 'unbound', kind: member.kind, ...(member.routeLabel ? { model: member.routeLabel } : {}), status: member.status, lastActiveAt: member.lastActiveAt, description: member.description, dispatchedBy: member.dispatchedBy, parentId: member.parentId, mode: member.mode }))
    const waitMs=currentSettings.rosterWaitMs
    for(const member of members)observeMember(member.id)
    const refreshWait={hadFlight:false,budgetMs:waitMs,elapsedMs:0,queued:nativeTree.diagnostics().background.queued,hydrating:null,settingPath:'settings.rosterWaitMs',reason:'Roster reads only the Team ledger; sessions it never recorded are synced once in a serial background queue'}
    const rows = await Promise.all(members.map(async (member) => {
      const binding = bindings.get(String(member.id))
      const role = binding ? catalog.byId.get(binding.role) : null
      let route = null, routeError = null, bindingInvalid = null, displayModel = binding?.model ?? null
      if (binding) {
        try { const resolved=resolveBindingModel(binding,catalog,get);route=resolved.route;displayModel=resolved.selection;bindingInvalid=resolved.bindingInvalid||null } catch (error) { route=null;routeError = String(error?.message || error) }
      }
      const observed = observeMember(member.id)
      const agent = liveAgent(member.id)
      let compactAvailable = false, compactDiagnostic = null
      try { compactAvailable = !!(agent && compactionFor(agent)) }
      catch (error) { compactDiagnostic = String(error?.message || error) }
      return {
        id: String(member.id), name: String(member.name), tier: 'core', outsourcedCount: viewRow(member.id)?.outsourcedCount ?? 0, outsourcedDescendants: viewRow(member.id)?.outsourcedDescendants ?? 0, parentId: String(member.parentId || lead.id), mode: CATALOG_MODES.has(member.mode) ? member.mode : 'unknown', ...(member.nameSource && member.nameSource !== 'native' ? { nameSource: member.nameSource, address: String(member.address) } : {}), ...(member.aliasConflict ? { aliasConflict: member.aliasConflict } : {}), role: binding?.role || null,
        purpose: role?.leaderBrief?.summary || '', description: String(member.description || ''),
        seat: binding?.seat || String(member.name), function: binding?.function || String(member.description || ''), formation: binding?.formation || null,
        route: route ? routeText(route) : null, model: displayModel,
        ...(bindingInvalid ? { bindingInvalid } : {}),
        ...(routeError ? { routeError } : {}), status: liveStatus(member.id), lastActiveAt: lastActiveAtOf(member.id, member.createdAt),
        busy: liveStatus(member.id) === 'running', live: !!agent,
        enforcement: getEnforcementStatus ? getEnforcementStatus(String(member.id),agent) : {state:binding?'missing':'unbound',reason:binding?'Team policy observer is unavailable':'No BBFF role is bound; native subagent policy applies'},
        compactAvailable, ...(compactDiagnostic ? { compactDiagnostic } : {}),
        compactPending: state.pending[String(member.id)] || null,
        lastCompaction: state.results[String(member.id)] || null,
        assist: binding?.assist || null, ...observed,
      }
    }))
    const idleByRole = {}
    for (const row of rows) {
      row.helpers = rows.filter((candidate) => candidate.assist === row.name).map((candidate) => candidate.name)
      if (row.role && row.status !== 'running') (idleByRole[row.role] ||= []).push(row.name)
    }
    // Off-request-path summary warm is now covered by the same serial facts queue.
    const turnEndPending = rows.filter(row => row.lastTurnEndPending === true).length
    const turnEndOk = rows.filter(row => row.lastTurnEnd?.state === 'ok').length
    const turnEndUnavailable = rows.filter(row => row.lastTurnEnd?.state === 'unavailable').length
    const turnEndPartSummary = { status: turnEndPending ? 'pending' : turnEndUnavailable ? 'partial' : 'ready', durationMs: performance.now()-started, pendingMembers: turnEndPending, okMembers: turnEndOk, unavailableMembers: turnEndUnavailable, reason: turnEndPending ? 'Last turn summaries are queued or loading in the background' : turnEndUnavailable ? 'Some summaries are unavailable; see each lastTurnEnd.reason' : 'Every member has a recorded native turn-end fact' }
    const hydrationPart = { status: rows.some(row=>row.pending) ? 'pending' : 'ready', queued: nativeTree.diagnostics().background.queued, hydrating: null, reason: rows.some(row=>row.pending) ? 'Cold members are being hydrated by the serial background queue' : 'Every member fact is cached' }
    return { team: teamMode, teamState, lead: { name: nativeTree.nameOf(lead) || String(lead.id), sessionId: String(lead.id), outsourcedCount: view.lead?.outsourcedCount ?? 0, outsourcedDescendants: view.lead?.outsourcedDescendants ?? 0 }, members: rows, idleByRole, memberCount: rows.length, outsourced, outsourcedCount: view.counts.outsourced, outsourcedOmitted: view.counts.outsourcedOmitted, ...(view.partial ? { outsourcedPartial: view.partial } : {}), refreshWait, parts: { roster: { status: 'ready', durationMs: performance.now()-started, reason: 'Native subagent catalog of the Lead plus cached role bindings: core members as full rows; outsourced agents of the whole tree compactly (settings.rosterOutsourcedLimit)' }, sessions: { status: rows.some(row=>row.pending) ? 'pending' : 'ready', durationMs: performance.now()-started, reason: rows.some(row=>row.pending) ? 'Session facts are loading in background; pending is not empty' : 'Per-member normalized facts have settled' }, turnEnd: turnEndPartSummary, hydration: hydrationPart }, bindingRetention: bindings.diagnostics?.() || null, activeFormation: bindings.getActiveFormation?.(String(lead.id)) || null, ...capacity }
  }

  /** Steer by native name: a teammate of the caller's Lead (or the Lead itself) or the caller's own direct child. */
  async function steer(caller, target, message, signal) {
    assertActive(caller)
    if (typeof target !== 'string' || !target.trim() || typeof message !== 'string' || !message.trim()) throw new Error('target and message must be non-empty strings')
    const text = target.trim()
    const subagents = get('subagents')
    if (typeof subagents?.sendMessage !== 'function') throw new Error('Subagent messaging unavailable: subagents.sendMessage is not provided')
    const match = (rows) => rows.find((entry) => String(entry.name) === text || String(entry.id) === text)
    // The Lead and its direct children first, then the caller's own children, then any deeper
    // agent of the team tree (outsourced agents started by members), by name, path or id.
    const teammate = match(nativeTree.membersOf(caller))
    const own = teammate ? null : match(nativeTree.childrenOf(caller))
    const deeper = teammate || own ? null : match((await nativeTree.teamTree(caller, signal, { complete: true })).rows)
    const found = teammate || own || deeper
    if (!found) throw new Error(`target "${text}" is not an agent of this team (bbff_team_roster shows names)`)
    if (String(found.id) === String(caller.id)) throw new Error('cannot steer yourself')
    if (found.mode && found.mode !== 'continuable') throw new Error(`"${text}" has catalog mode ${found.mode}, not continuable; steering requires a continuable agent`)
    const messageId = await subagents.sendMessage(caller, String(found.id), blocks(message), { signal: signal || new AbortController().signal })
    return { accepted: true, target: String(found.name), sessionId: String(found.id), kind: found.role === 'lead' ? 'lead' : bindings.get(String(found.id))?.kind === 'member' ? 'teammate' : 'outsourced', messageId }
  }

  function scheduleCompact(caller, name) {
    assertLead(caller)
    const member = membersOf(caller).find(entry => entry.role !== 'lead' && String(entry.name) === String(name))
    if (!member || !idle(member, liveAgent(member.id))) throw new Error(`teammate "${name}" is no longer idle; compaction not scheduled`)
    const id = String(member.id)
    if (!state.pending[id]) state.pending[id] = { sessionId: id, name: String(name), requestedBy: String(caller.id), requestedAt: Date.now(), before: liveAgent(id) ? liveObservation(liveAgent(id)).context : contextUsage(null, 'unavailable') }
    persist()
    const loaded = liveAgent(id)
    if (loaded) onCreated(loaded)
    return { memberId: id, scheduled: true }
  }

  async function compact(caller, name, signal) {
    assertLead(caller)
    const member = membersOf(caller).find((entry) => entry.role !== 'lead' && String(entry.name) === String(name))
    if (!member) throw new Error(`no teammate named "${name}"`)
    if (member.status === 'running') throw new Error(`teammate "${name}" is running; compact only an idle member`)
    const agent = liveAgent(member.id)
    if (agent?.status === 'running') throw new Error(`teammate "${name}" became busy; compact only an idle member`)
    if (!agent) {
      const observed = observeMember(member.id) // ledger facts; never a log read
      const id = String(member.id)
      if (!state.pending[id]) state.pending[id] = { sessionId: id, name: String(name), requestedBy: String(caller.id), requestedAt: Date.now(), before: observed.context }
      persist()
      return { name: String(name), memberId: id, scheduled: true, compacted: false, before: observed.context, message: 'Compaction scheduled; will compact before its next turn. The member was not cold-resumed.' }
    }
    const result = await performCompact(agent, name, signal)
    state.results[String(member.id)] = { ...result, at: Date.now() }
    delete state.pending[String(member.id)]
    persist()
    return result
  }
  async function performCompact(agent, name, signal) {
    if (liveAgent(agent.id) !== agent || agent.status === 'running') throw new Error(`teammate "${name}" is no longer idle and loaded; compaction not started`)
    const capability = compactionFor(agent)
    if (!capability) throw new Error('DSH compaction service is unavailable in the target member preset and Host scope (no native compact command bridge either)')
    const before = liveObservation(agent, true).context
    // DSH compactNow synchronously reserves idle maintenance; it owns race/cancellation handling.
    // The native command calls this same seam inside its isolated preset scope.
    let result, receipt
    if (capability.kind === 'service') result = await capability.service.compactNow(agent, signal)
    else {
      receipt = await capability.commands.execute(agent, '/' + nativeCompactCommand().name, [], signal)
      if (!receipt || receipt.result?.kind !== 'success') throw new Error(receipt?.result?.text || 'native compact command did not accept the operation')
    }
    const after = liveObservation(agent, true).context
    return {
      name: String(name), memberId: String(agent.id),
      compacted: receipt ? receipt.result.sourceEventSeq !== undefined : result !== null,
      before, after, compactionId: result?.compactionId || null, via: capability.kind,
      ...(receipt ? { commandId: receipt.commandId, summarySeq: receipt.result.sourceEventSeq ?? null, message: receipt.result.text || '' } : {}),
    }
  }

  /**
   * agent/created is serial but runs INSIDE initialization runMaintenance. Never
   * return/await whenIdle here (deadlock), and never compact from pre-step (the
   * turn is already running). Register a continuation on initialization's idle
   * settlement instead. It reserves compaction maintenance before the manager's
   * resumed prompt is admitted; waking input then latches behind maintenance.
   */
  /** Native agent/status (emit): the ledger records running/idle transitions with their time. */
  function onStatus(agent, status) { feed.status(agent, status) }
  function onCreated(agent, signal) {
    feed.created(agent)
    const id = String(agent.id)
    if (!state.pending[id] || jobs.has(id) || typeof agent.whenIdle !== 'function') return
    const controller = new AbortController()
    const operationSignal = AbortSignal.any([lifecycle.signal, controller.signal, ...(signal ? [signal] : [])])
    const job = { agent, controller, promise: null }
    jobs.set(id, job)
    job.promise = (async () => {
      await new Promise((resolve, reject) => {
        const cancelled = () => reject(operationSignal.reason)
        if (operationSignal.aborted) { cancelled(); return }
        operationSignal.addEventListener('abort', cancelled, { once: true })
        Promise.resolve(agent.whenIdle()).then(resolve, reject).finally(() => operationSignal.removeEventListener('abort', cancelled))
      })
      operationSignal.throwIfAborted()
      const request = state.pending[id]
      if (!request) return
      if (sessionHeaderFacts(agent.session?.header).value.parentId !== request.requestedBy) throw new Error('deferred compaction owner no longer matches the manager-owned parent')
      if (classify(agent, get, getTeamSettings()).position === 'foreign') throw new Error('deferred compaction postponed: this session is yielded')
      // If a host version admits a turn before this continuation, NEVER compact
      // that running turn. Keep the pending flag with a visible diagnostic.
      if (liveAgent(id) !== agent || agent.status === 'running') throw new Error('deferred compaction missed the pre-turn idle window; request retained')
      const result = await performCompact(agent, request.name, operationSignal)
      state.results[id] = { ...result, deferred: true, requestedAt: request.requestedAt, at: Date.now() }
      delete state.pending[id]
      persist()
    })().catch((error) => {
      if (state.pending[id]) {
        state.pending[id] = { ...state.pending[id], lastError: String(error?.message || error), lastAttemptAt: Date.now() }
        try { persist() } catch (storageError) { try { ctx.logger?.warn?.('Team pending compaction persistence failed', storageError) } catch {} }
      }
      try { ctx.logger?.warn?.('Team deferred compaction retained for next wake: ' + String(error?.message || error)) } catch {}
    }).finally(() => { if (jobs.get(id) === job) jobs.delete(id) })
    // Deliberately return undefined to agent/created's awaited serial dispatcher.
  }

  /** Resolve a Lead query target: teammate name/id, or any descendant of the Lead's tree by native name/path or session id. */
  async function resolveActivityTarget(caller, target, signal) {
    const text = typeof target === 'string' ? target.trim() : ''
    if (!text) throw new Error('target must be a teammate name, a descendant name/path, or a session id')
    let members = []
    try { members = membersOf(caller) } catch { members = [] }
    const member = members.find(entry => String(entry.name) === text || String(entry.id) === text)
    if (member) {
      const id = String(member.id)
      // Core members are 'member'; an outsourced direct child of the Lead is the caller's 'child' (or a 'descendant').
      const kind = member.role === 'lead' ? 'lead' : member.tier === 'core' ? 'member' : String(member.parentId) === String(caller.id) ? 'child' : 'descendant'
      return { sessionId: id, name: String(member.name), kind, nativeRole: member.role, ...(kind === 'child' || kind === 'descendant' ? { parentSessionId: String(member.parentId) } : {}), live: !!liveAgent(id) }
    }
    // Prove a supplied descendant id from public header lineage, without reading its log body.
    const ancestors=new Set([String(caller.id),...members.map(entry=>String(entry.id))]),seen=new Set()
    let current=text
    for(let hop=0;hop<=normalizeTeamSettings(getTeamSettings()).maxDepth+1;hop++){
      if(seen.has(current))break
      seen.add(current)
      let header=liveAgent(current)?.session?.header
      if(!header){try{header=(await statOf(current,signal))?.header}catch{signal?.throwIfAborted()}}
      const lineage=sessionHeaderFacts(header)
      const parent=lineage.complete?lineage.value.parentId:null
      if(!parent)break
      if(ancestors.has(String(parent)))return{sessionId:text,name:text,kind:'descendant',parentSessionId:String(parent),live:!!liveAgent(text)}
      current=String(parent)
    }
    // Native names: a full slash path from the Lead, or a direct child of the caller.
    const lead = nativeTree.leadOf(caller)
    let rows = []
    try { rows = lead ? await nativeTree.descendants(lead, signal) : [] } catch { signal?.throwIfAborted?.() }
    const found = rows.find(row => row.kind === 'child' && (row.path === text || String(row.id) === text || (String(row.parentId) === String(caller.id) && row.name === text)))
    if (found) return { sessionId: String(found.id), name: found.path || found.name || String(found.id), kind: String(found.parentId) === String(caller.id) ? 'child' : 'descendant', parentSessionId: String(found.parentId), mode: found.mode, live: !!liveAgent(found.id) }
    throw new Error('target "' + text + '" is not a teammate name, a descendant name/path in this tree, or a known descendant session id')
  }  /** Tree-root raw activity window (Lead or Orchestrator root). Recorded fields only; no verdict or health classification. */
  async function activityWindow(caller, args = {}, signal) {
    // Reading one's own tree is orchestration work: the Lead and an Orchestrator root (Agent Teams off) may.
    assertLeadAction(caller, 'read member or child activity', { allowed: TREE_ROOT_POSITIONS })
    const target = await resolveActivityTarget(caller, args.target, signal)
    const window = await activity.window(target.sessionId, { limit: args.limit, before: args.before, kinds: args.kinds, outcome: args.outcome, signal })
    const settings = normalizeTeamSettings(getTeamSettings())
    return {
      hostNow: { epochMs: window.hostNow, iso: new Date(window.hostNow).toISOString() },
      target: { requested: String(args.target), ...target, sessionId: target.sessionId },
      settings: { defaultLimit: settings.activityDefaultLimit, maxLimit: settings.activityMaxLimit, previewChars: settings.activityPreviewChars },
      window: { limit: window.limit, before: window.before, returned: window.events.length, nextBefore: window.nextBefore, source: window.source, total: window.total, ...(window.filters?{filters:window.filters}:{}) },
      events: window.events,
      ...(bindingDiagnostics.has(target.sessionId)?{teamDiagnostics:[bindingDiagnostics.get(target.sessionId).value]}:{}),
    }
  }
  /** Tree-root cross-owner job kill (Lead or Orchestrator root): the recorded job/registered owner is the required evidence. */
  async function killDescendantJob(caller, args = {}, signal) {
    assertLeadAction(caller, 'kill a descendant-owned background job', { allowed: TREE_ROOT_POSITIONS })
    const jobId = typeof args.jobId === 'string' ? args.jobId.trim() : ''
    if (!jobId) throw new Error('jobId must be a non-empty string')
    const reason = typeof args.reason === 'string' && args.reason.trim() ? args.reason.trim() : undefined
    const registry = get('jobs')
    if (!registry || typeof registry.kill !== 'function') throw new Error('The native jobs service is unavailable; a descendant job cannot be killed from here.')
    const candidates = []
    let target = null
    if (args.target !== undefined) {
      target = await resolveActivityTarget(caller, args.target, signal)
      candidates.push(target.sessionId)
    }
    if (!target) {
      // The caller, every member and every catalogued descendant of the Lead's tree.
      let members = []
      try { members = membersOf(caller) } catch { members = [] }
      candidates.push(String(caller.id), ...members.map(entry => String(entry.id)))
      const lead = nativeTree.leadOf(caller)
      try { if (lead) for (const row of await nativeTree.descendants(lead, signal)) if (row.kind === 'child') candidates.push(String(row.id)) } catch { signal?.throwIfAborted?.() }
    }
    // Prefer the authoritative owner-fenced registry: registration can have aged out of a bounded tail.
    let ownerSessionId=null,evidence=null
    if (typeof registry.get === 'function') {
      for (const id of [...new Set(candidates)]) {
        try { const job=registry.get(jobId,id);if(job&&job.owner===id){ownerSessionId=id;evidence='native-jobs-registry';break} } catch { signal?.throwIfAborted() }
      }
    } else {
      const found=await activity.findRegisteredJob(candidates,jobId,{signal})
      if(found&&found.fact.owner===found.sessionId){ownerSessionId=found.sessionId;evidence=found.source}
    }
    if(!ownerSessionId)throw new Error('no owned job "'+jobId+'" found in the permitted target sessions; refusing a blind cross-session kill')
    signal?.throwIfAborted()
    const outcome = registry.kill(jobId, ownerSessionId, reason)
    if (outcome !== 'requested' && outcome !== 'already-finished') throw new Error('native jobs.kill returned an unrecognized outcome: ' + String(outcome))
    return { jobId, ownerSessionId, foundIn:ownerSessionId, evidence, outcome, ...(reason !== undefined ? { reason } : {}), ...(target ? { target: target.sessionId } : {}) }
  }

  function onDisposed(agent) {
    feed.disposed(agent)
    const job = jobs.get(String(agent.id))
    if (job?.agent === agent) job.controller.abort(new Error('member disposed before deferred compaction settled'))
  }

  async function dispose() {
    lifecycle.abort(new Error('Team ops disposed'))
    if(typeof unwatchReports==='function')unwatchReports()
    feed.dispose()
    if (ownsTree) { nativeTree.dispose(); ledger.close() }
    await Promise.allSettled([reportImport.flight])
    bindingDiagnostics.clear()
    for (const job of jobs.values()) job.controller.abort(lifecycle.signal.reason)
    await Promise.allSettled([...jobs.values()].map((job) => job.promise))
  }

  return { roster, steer, compact, scheduleCompact, activityWindow, recordBindingDiagnostic, killDescendantJob, onCreated, onDisposed, onStatus, seed: agent => feed.created(agent), dispose, ledgerDiagnostics: () => ({ ...ledger.diagnostics(), feed: feed.diagnostics() }), peekContext, peekReport, reportRows, teamView, reportImportDiagnostics:reportImport.diagnostics, whenReportImportSettled:()=>reportImport.flight.then(()=>reportImport.diagnostics()), reportTimeFixDiagnostics:reportTimeBackfill.diagnostics, whenReportTimeBackfillSettled:()=>reportTimeBackfill.flight.then(()=>reportTimeBackfill.diagnostics()) }
}
