// Feeds the Team ledger (ledger.js). One fold (foldEvent) turns committed session events into
// agent facts, catalog children and activity-ring entries; it is used for live events (cheap,
// queued writes) and for the rare background backfill of a session the ledger never saw.
// Native payloads are decoded only through the DSH adapter (SDK).
import { sessionEventFacts, projectionKey } from './dsh-adapter.js'
import { decodeEntry, turnSummaryOf } from './activity.js'
import { normalizeTeamSettings } from './team-settings.js'

/** Ledger revision of a session whose every event was observed live; the real revision is recorded at the next stat. */
export const FED_REVISION_PREFIX = 'fed:'
/** A fresh fold accumulator: facts patch, catalog children by id, last ring entries. */
export function createFold(ringSize) { return { patch: {}, children: new Map(), ring: [], ringSize } }

/** Fold one committed event into the accumulator. Pure; no I/O. */
export function foldEvent(acc, event, settings) {
  if (!event || typeof event !== 'object') return acc
  const time = Number.isSafeInteger(event.time) ? event.time : null
  if (time !== null) acc.patch.lastEventAt = time
  if (Number.isSafeInteger(event.seq)) acc.patch.lastSeq = event.seq
  const facts = sessionEventFacts(event).value
  if (facts?.kind === 'subagent-catalog') {
    const child = facts.child, known = acc.children.get(child.sessionId)
    acc.children.set(child.sessionId, { ...(known || {}), createdAt: known?.createdAt ?? child.createdAt, mode: child.mode, ...(child.label !== undefined ? { label: child.label } : {}), ...(child.name !== undefined ? { name: child.name } : {}) })
  } else if (facts?.kind === 'turn-start') acc.patch.turnStartedAt = time
  else if (facts?.kind === 'model-selection' || facts?.kind === 'request-header') acc.patch.route = facts.route
  else if (facts?.kind === 'assistant-message' && typeof facts.message?.text === 'string' && facts.message.text) {
    acc.patch.reportText = facts.message.text.slice(0, settings.reportExcerptChars); acc.patch.reportAt = time
  }
  const entry = decodeEntry(event, settings)
  acc.ring.push(entry)
  if (acc.ring.length > acc.ringSize) acc.ring.splice(0, acc.ring.length - acc.ringSize)
  if (entry.fact?.kind === 'turn-end') {
    acc.patch.lastTurn = turnSummaryOf(entry); acc.patch.turnEndedAt = time
    if (entry.fact.reason?.kind === 'error') acc.patch.error = { kind: 'turn-error', time, message: String(entry.fact.reason?.failure?.message || entry.fact.reason?.error?.message || '').slice(0, settings.activityPreviewChars) }
  } else if (entry.fact?.kind === 'llm-retry') acc.patch.error = { kind: 'llm-retry', time, message: String(entry.fact.message || entry.fact.reason || '').slice(0, settings.activityPreviewChars) }
  return acc
}

export function createLedgerFeed({ ledger, get, getSettings = () => ({}), tree = null }) {
  const settings = () => normalizeTeamSettings(getSettings())
  const ringSize = () => Math.max(50, settings().activityMaxLimit)
  const liveAgent = id => { try { return get('agents')?.get?.(String(id)) } catch { return undefined } }
  // Sessions whose every event since the ledger's last record was observed here (contiguous).
  const contiguous = new Set()
  const timers = new Set()
  let disposed = false
  const rootIdOf = parentId => {
    const live = liveAgent(parentId)
    if (live && tree) { const root = tree.rootOf(live); if (root) return String(root.id) }
    return ledger.agent(parentId)?.rootId || String(parentId)
  }
  /** Write one fold result for a session (children rows, facts, ring). */
  function commit(id, acc, { resetRing = false, extra = {} } = {}) {
    const key = String(id)
    if (acc.children.size) {
      const rootId = rootIdOf(key)
      for (const [childId, row] of acc.children) ledger.note(childId, { parentId: key, rootId, ...row })
    }
    ledger.note(key, { ...acc.patch, ...extra })
    if (acc.ring.length || resetRing) ledger.noteEvents(key, acc.ring, { reset: resetRing })
  }
  function contextOf(agent) {
    const key = projectionKey('context-pressure')
    let projections
    try { projections = agent.ctx?.get?.('sessionProjections') } catch {}
    projections ||= get('sessionProjections')
    try { return projections?.snapshot?.(agent.session, [key])?.values?.[key] ?? undefined } catch { return undefined }
  }
  /** A committed live event (session/event). Queues writes; never awaits or reads a log. */
  function observe(session, event) {
    if (disposed || ledger.closed) return
    const id = String(session?.id ?? session?.header?.id ?? '')
    if (!id) return
    const current = settings(), acc = foldEvent(createFold(ringSize()), event, current)
    if (acc.patch.lastTurn) { const live = liveAgent(id); const context = live ? contextOf(live) : undefined; if (context) acc.patch.context = context }
    commit(id, acc)
  }
  /** Native agent/status: running | idle, with the transition time. */
  function status(agent, value) {
    if (disposed || ledger.closed || !agent) return
    const now = Date.now()
    ledger.note(agent.id, { status: value === 'running' ? 'running' : 'idle', statusAt: now, runningSince: value === 'running' ? now : null })
  }
  /** agent/created (or a live agent at load): status, parent, route, live catalog; contiguity check. */
  function created(agent) {
    if (disposed || ledger.closed || !agent) return
    const id = String(agent.id), row = ledger.agent(id), seq = agent.session?.seq
    // The ledger saw everything before this instance when its last recorded seq is the end of the log.
    if (Number.isSafeInteger(seq) && (seq === 0 || row?.lastSeq === seq - 1)) contiguous.add(id); else contiguous.delete(id)
    const header = agent.session?.header || {}
    let route
    try { const selection = agent.model?.current?.(); if (selection?.provider && selection?.model) route = { provider: selection.provider, model: selection.model, ...(selection.reasoningEffort ? { effort: selection.reasoningEffort } : {}) } } catch {}
    ledger.note(id, { status: agent.status === 'running' ? 'running' : 'idle', statusAt: Date.now(), ...(typeof header.parentSession === 'string' && !row?.parentId ? { parentId: header.parentSession } : {}), ...(route ? { route } : {}) })
    // The live catalog snapshot is authoritative and cheap: record every child it lists.
    const rows = tree?.catalogOf?.(agent) || []
    if (rows.length) {
      const rootId = rootIdOf(id)
      for (const child of rows) if (child?.id) ledger.note(child.id, { parentId: id, rootId, mode: child.mode, ...(typeof child.label === 'string' ? { label: child.label } : {}), ...(typeof child.name === 'string' ? { name: child.name } : {}), ...(Number.isFinite(child.createdAt) ? { createdAt: child.createdAt } : {}) })
    }
  }
  /**
   * agent/disposed: the session is cold now. When every event of it was observed here, record its
   * current persistence revision (after the final writes settle) so it is never decoded for this.
   */
  function disposedAgent(agent) {
    if (disposed || ledger.closed || !agent) return
    const id = String(agent.id), complete = contiguous.delete(id)
    // FED_REVISION marks "the ledger holds every event of this session": the next stat records the
    // persistence revision without decoding (tree.syncSession), instead of treating it as unseen.
    ledger.note(id, { status: 'inactive', statusAt: Date.now(), runningSince: null, ...(complete ? { revision: FED_REVISION_PREFIX + String(ledger.agent(id)?.lastSeq ?? -1) } : {}) })
    if (!complete || !tree?.statSession) return
    const timer = setTimeout(async () => {
      timers.delete(timer)
      if (disposed || ledger.closed) return
      tree.invalidate?.(id)
      try { const snapshot = await tree.statSession(id); const row = ledger.agent(id); if (!disposed && !ledger.closed && snapshot?.revision && !liveAgent(id) && (!row?.revision || row.revision.startsWith(FED_REVISION_PREFIX) || row.syncedAt >= Date.now() - 5000)) ledger.note(id, { revision: String(snapshot.revision), syncedAt: Date.now() }) } catch {}
    }, 1500)
    timer.unref?.()
    timers.add(timer)
  }
  function dispose() {
    disposed = true
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  }
  return { observe, status, created, disposed: disposedAgent, commit, dispose, ringSize, diagnostics: () => ({ contiguous: contiguous.size, timers: timers.size, disposed }) }
}
