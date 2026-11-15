// Native subagent tree facts for Team (DSH >= 0.2.2). Team members are named, continuable
// subagents of the Lead (the tree root); names, roots and catalogs come only from the public
// subagent service and the public projection snapshot. No private fields, no cold resume.
//
// Catalog rows written before DSH 0.2.2 carry no native name (0.2.1 teammates). For those rows the
// BBFF binding's name (else its seat) is a Team alias: unique among the creator's children, never
// shadowing a native name. The native address of an aliased row stays its session id.
//
// Cold sessions (Team 0.11.0): what Team knows about a session that is not live comes from the
// Team ledger (ledger.js), fed from live events. A cold log is decoded only by syncSession, in the
// background, once per persistence revision the ledger has not recorded: a session the ledger never
// saw, or one changed outside this process (or while Team was unloaded). A cold session's revision
// is re-checked with one cheap persistence.stat after it was live here (invalidate) or after
// TREE_READ_POLICY.coldRevalidateMs. Native listDescendants is not used: it reads every descendant.
import { sessionHeaderFacts } from './dsh-adapter.js'
import { EXISTING_MEMBER_NAME_RE } from './member-names.js'
import { createLedger } from './ledger.js'
import { createFold, foldEvent, FED_REVISION_PREFIX } from './ledger-feed.js'
import { normalizeTeamSettings } from './team-settings.js'

const CATALOG_KEY = 'subagentCatalog'
// Every catalog child of the Lead belongs to its team (DSH 0.2.2 has no separate membership).
const CHILD_MODES = new Set(['continuable', 'one-shot', 'external'])

export const TREE_READ_POLICY = Object.freeze({ coldRevalidateMs: 30_000, statConcurrency: 8, validatedEntries: 4096, readBatchEvents: 64, yieldAfterMs: 8 })

export function createTree(get, { bindings = null, ledger = null, getSettings = () => ({}), now = Date.now, coldRevalidateMs = TREE_READ_POLICY.coldRevalidateMs } = {}) {
  const service = () => get('subagents')
  const store = ledger || createLedger()
  const ownsLedger = !ledger
  let disposed = false
  // sessionId -> { revision, at } of the last stat; reset by invalidate().
  const validated = new Map(), walks = new Map(), statFlights = new Map()
  const reads = { stats: 0, decodes: 0 }
  const liveAgent = id => { try { return get('agents')?.get?.(String(id)) } catch { return undefined } }
  /** The live tree root, or null when the agent is not (yet) published in a tree. */
  function rootOf(agent) {
    if (!agent) return null
    try { return service()?.rootOf?.(agent) ?? null } catch { return null }
  }
  /** Model-facing name: the root's native name, a slash path, or the Session id. */
  function nameOf(agent) {
    try { return service()?.namesOf?.(agent)?.self ?? null } catch { return null }
  }
  /** Direct children from the live agent's own catalog projection (synchronous, no log read). */
  function catalogOf(agent) {
    if (!agent?.session) return null
    let projections
    try { projections = agent.ctx?.get?.('sessionProjections') } catch {}
    projections ||= get('sessionProjections')
    try {
      const rows = projections?.snapshot?.(agent.session, [CATALOG_KEY])?.values?.[CATALOG_KEY]
      return Array.isArray(rows) ? rows : null
    } catch { return null }
  }
  function statusOf(id) {
    const live = liveAgent(id)
    return live ? (live.status === 'running' ? 'running' : 'idle') : 'inactive'
  }
  /** The Lead of the agent's tree: the published root, or the agent itself when it is a root. */
  function leadOf(agent) {
    const root = rootOf(agent)
    if (root) return root
    const header = sessionHeaderFacts(agent?.session?.header).value
    return agent && !header.parentId && !header.isSubagent ? agent : null
  }
  /** Local direct children: id, model-facing name (native, Team alias or id), address, label and live state. */
  function childrenOf(agent) {
    const rows = (catalogOf(agent) || []).filter(entry => CHILD_MODES.has(entry.mode))
    const lead = leadOf(agent), isRoot = !!lead && lead === agent
    const reserved = new Set(rows.filter(entry => typeof entry.name === 'string').map(entry => entry.name))
    const rootName = lead ? nameOf(lead) : null
    if (rootName) reserved.add(rootName)
    const proposed = new Map(), uses = new Map()
    for (const entry of rows) {
      if (typeof entry.name === 'string') continue
      const binding = bindings?.get?.(String(entry.id))
      const alias = [binding?.name, binding?.seat].find(value => typeof value === 'string' && EXISTING_MEMBER_NAME_RE.test(value) && value !== String(entry.id))
      if (!alias) continue
      proposed.set(String(entry.id), alias)
      uses.set(alias, (uses.get(alias) || 0) + 1)
    }
    return rows.map(entry => {
      const id = String(entry.id), nativeName = typeof entry.name === 'string' ? entry.name : null
      const candidate = proposed.get(id)
      const alias = !nativeName && candidate && uses.get(candidate) === 1 && !reserved.has(candidate) ? candidate : null
      return {
        id, name: nativeName || alias || id, named: !!nativeName,
        nameSource: nativeName ? 'native' : alias ? 'bbff-binding' : 'session-id',
        // What native send_message accepts: the name for a direct child of the root, else the id.
        address: nativeName && isRoot ? nativeName : id,
        ...(candidate && !alias ? { aliasConflict: candidate } : {}),
        description: typeof entry.label === 'string' ? entry.label : '', mode: entry.mode, createdAt: entry.createdAt ?? null, status: statusOf(entry.id),
      }
    })
  }
  /** BBFF tier of one tree agent: `core` = a member binding (hired, or bound with bbff_team_assign); `outsourced` = every other agent. */
  function tierOf(id) {
    const binding = bindings?.get?.(String(id))
    const kind = binding?.kind === 'member' ? 'member' : binding?.kind === 'oneshot' ? 'oneshot' : 'unbound'
    return { tier: kind === 'member' ? 'core' : 'outsourced', kind, roleId: typeof binding?.role === 'string' ? binding.role : null }
  }
  /**
   * The Lead (role 'lead') and its direct children (role 'teammate'), each with its BBFF tier.
   * Every agent of the native tree belongs to the team; deeper descendants come from teamTree.
   */
  function membersOf(agent) {
    const lead = leadOf(agent)
    if (!lead) return []
    const leadName = nameOf(lead) || String(lead.id)
    return [{ id: String(lead.id), name: leadName, address: leadName, role: 'lead', tier: 'lead', kind: 'lead', status: statusOf(lead.id), description: '' },
      ...childrenOf(lead).map(row => ({ ...row, role: 'teammate', ...tierOf(row.id), depth: 1, parentId: String(lead.id), dispatchedBy: leadName }))]
  }
  /** Await a shared promise while honouring only this caller's cancellation. */
  const raced = (promise, signal) => !signal ? promise : new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
  // Cold decodes run one at a time (stats stay concurrent): a first pass over a large tree never holds
  // several decoded logs at once.
  let decodeChain = Promise.resolve()
  const syncFlights = new Map()
  /**
   * One shared persistence.stat of a cold session: concurrent callers share one call, and the
   * snapshot is reused until the session may have changed (invalidate) or COLD revalidation is due.
   * Team's other cold readers (member facts, activity) use it too.
   * @returns the snapshot, or undefined when the session is not stored or persistence is unavailable.
   */
  function statSession(id, signal) {
    const key = String(id), persistence = get('sessionPersistence')
    if (disposed || typeof persistence?.stat !== 'function') return Promise.resolve(undefined)
    const known = validated.get(key)
    if (known && known.persistence === persistence && now() - known.at < coldRevalidateMs) return Promise.resolve(known.snapshot)
    let flight = statFlights.get(key)
    if (!flight) {
      reads.stats += 1
      flight = Promise.resolve().then(() => persistence.stat(key, {})).then(snapshot => {
        if (disposed) return undefined
        const revision = typeof snapshot?.revision === 'string' && snapshot.revision ? snapshot.revision : null
        if (snapshot && revision) validated.set(key, { revision, snapshot, persistence, at: now() })
        else validated.delete(key)
        while (validated.size > TREE_READ_POLICY.validatedEntries) validated.delete(validated.keys().next().value)
        return snapshot || undefined
      }).finally(() => { if (statFlights.get(key) === flight) statFlights.delete(key) })
      statFlights.set(key, flight)
    }
    return raced(flight, signal)
  }
  /**
   * Bring the ledger up to date for one cold session: nothing when it already records the session's
   * current revision; otherwise ONE decode (serial, background) folds the whole log into the ledger.
   * @returns 'live' | 'current' | 'synced' | 'not-stored' | 'unavailable'
   */
  function syncSession(id, signal) {
    const key = String(id)
    if (disposed) return Promise.resolve('unavailable')
    if (liveAgent(key)) return Promise.resolve('live')
    let flight = syncFlights.get(key)
    if (!flight) {
      flight = (async () => {
        const snapshot = await statSession(key)
        if (disposed) return 'unavailable'
        if (!snapshot) return typeof get('sessionPersistence')?.stat === 'function' ? 'not-stored' : 'unavailable'
        const revision = String(snapshot.revision || '')
        if (!revision) return 'unavailable'
        const recorded = store.agent(key)?.revision
        if (recorded === revision) return 'current'
        // Every event of it was observed live here: record the persistence revision, no decode.
        if (recorded?.startsWith(FED_REVISION_PREFIX)) { store.note(key, { revision, syncedAt: Date.now() }); return 'current' }
        const run = decodeChain.then(() => backfill(key, revision))
        decodeChain = run.catch(() => {})
        return await run
      })().finally(() => { if (syncFlights.get(key) === flight) syncFlights.delete(key) })
      syncFlights.set(key, flight)
    }
    return raced(flight, signal)
  }
  /** The one decode: open the cold log once, fold every event, record the revision. */
  async function backfill(id, revision) {
    if (disposed || liveAgent(id)) return disposed ? 'unavailable' : 'live'
    if (store.agent(id)?.revision === revision) return 'current'
    const persistence = get('sessionPersistence')
    // A log that cannot be opened is recorded with its reason for this revision (no retry until it changes).
    if (typeof persistence?.open !== 'function') { store.note(id, { revision, syncedAt: Date.now(), syncError: 'Session persistence cannot open logs' }); return 'synced' }
    reads.decodes += 1
    const settings = normalizeTeamSettings(getSettings()), acc = createFold(Math.max(50, settings.activityMaxLimit))
    let handle
    try {
      handle = await persistence.open(id, 'read', {})
      let lastYield = performance.now()
      for (let offset = 0; !disposed;) {
        const slice = await handle.read(offset, TREE_READ_POLICY.readBatchEvents, {})
        const events = slice?.events || []
        for (const event of events) foldEvent(acc, event, settings)
        if (events.length < TREE_READ_POLICY.readBatchEvents) break
        offset += events.length
        // Macrotask boundary whenever the fold has run for a few ms: it never monopolises the event loop.
        if (performance.now() - lastYield >= TREE_READ_POLICY.yieldAfterMs) { await new Promise(resolve => { const tick = setTimeout(resolve, 0); tick.unref?.() }); lastYield = performance.now() }
      }
    } catch (error) {
      if (disposed || store.closed) return 'unavailable'
      store.note(id, { revision, syncedAt: Date.now(), syncError: String(error?.message || error) })
      return 'synced'
    } finally { try { await handle?.close?.() } catch {} }
    if (disposed || store.closed) return 'unavailable'
    commitFold(id, acc, revision)
    return 'synced'
  }
  /** Written by the tree itself (not the feed): children rows, facts, the replaced ring, the revision. */
  function commitFold(id, acc, revision) {
    if (acc.children.size) {
      const rootId = store.agent(id)?.rootId || id
      for (const [childId, row] of acc.children) store.note(childId, { parentId: id, rootId, ...row })
    }
    store.note(id, { ...acc.patch, status: 'inactive', runningSince: null, revision, syncedAt: Date.now(), syncError: null })
    store.noteEvents(id, acc.ring, { reset: true })
  }
  const rowsOfLedger = id => store.children(id).map(row => ({ id: row.id, mode: row.mode, ...(typeof row.label === 'string' ? { label: row.label } : {}), ...(typeof row.name === 'string' ? { name: row.name } : {}), createdAt: Number.isFinite(row.createdAt) ? row.createdAt : null }))
  /** Catalog rows of one session for a complete walk: live snapshot, or the ledger after syncSession. */
  async function catalogRows(id, signal) {
    const key = String(id), live = liveAgent(key)
    if (live) return catalogOf(live) || []
    const state = await syncSession(key, signal)
    if (state === 'unavailable') return store.agent(key)?.revision ? rowsOfLedger(key) : null
    return rowsOfLedger(key)
  }
  /** A session's catalog may have changed in this process (it was live): re-check it on the next walk. */
  function invalidate(id) { validated.delete(String(id)) }

  // ---- Non-blocking reads for repeated paths (roster, team view, card refresh) ----
  // They never await a stat or a decode: live catalogs and the ledger answer at once, and sessions
  // the ledger never recorded (or whose revision is due a re-check) are queued for ONE serial
  // background pass, which also follows newly discovered children. The next read sees them.
  const refresh = { queue: new Set(), running: false, errors: 0, runs: 0 }
  /** Is the ledger row of a cold session known current (recorded revision checked within the window)? */
  const current = key => { const known = validated.get(key), row = store.agent(key); return !!(known && row?.revision === known.revision && now() - known.at < coldRevalidateMs) }
  /** Synchronous rows of one session: live, ledger (possibly stale, then queued), or undefined (never recorded, queued). */
  function peekRows(id) {
    const key = String(id), live = liveAgent(key)
    if (live) return catalogOf(live) || []
    const row = store.agent(key)
    if (!current(key)) enqueue(key)
    return row?.revision ? rowsOfLedger(key) : undefined
  }
  function enqueue(id) {
    if (disposed) return
    refresh.queue.add(String(id))
    if (refresh.running) return
    refresh.running = true
    const timer = setTimeout(() => { void drain() }, 0)
    timer.unref?.()
  }
  async function drain() {
    try {
      while (refresh.queue.size && !disposed) {
        const batch = [...refresh.queue].slice(0, TREE_READ_POLICY.statConcurrency)
        for (const id of batch) refresh.queue.delete(id)
        await Promise.all(batch.map(async id => {
          try { await syncSession(id) } catch { refresh.errors += 1; return }
          // Follow children the refreshed ledger revealed, so one pass fills the whole branch.
          for (const row of store.children(id)) {
            const child = String(row.id)
            if (!CHILD_MODES.has(row.mode) || row.mode === 'external' || liveAgent(child)) continue
            if (!current(child)) refresh.queue.add(child)
          }
        }))
        // Macrotask boundary between batches: requests are served first.
        await new Promise(resolve => { const tick = setTimeout(resolve, 0); tick.unref?.() })
      }
    } finally { refresh.running = false; refresh.runs += 1; if (refresh.queue.size && !disposed) enqueue([...refresh.queue][0]) }
  }  /**
   * Every descendant of the root in the native listDescendants shape
   * ({kind:'child', id, parentId, depth, path?, name?, mode, label?, activity}) plus createdAt from
   * its creator's catalog; unreadable branches become {kind:'diagnostic', reason:'unavailable'}.
   * Breadth-first with bounded concurrency; concurrent walks of one root share one flight. Awaits cold reads:
   * for tools that need the complete tree (steer by path, activity, job kill), never for repeated paths.
   */
  function walk(root, signal) {
    const rootId = String(root.id)
    let flight = walks.get(rootId)
    if (!flight) {
      flight = (async () => {
        const entries = [], visited = new Set([rootId])
        const childrenOfRows = (rows, parentId, depth, parentPath) => (rows || []).filter(row => CHILD_MODES.has(row.mode) && !visited.has(String(row.id))).map(row => {
          visited.add(String(row.id))
          const path = parentPath === undefined || typeof row.name !== 'string' ? undefined : parentPath ? parentPath + '/' + row.name : row.name
          return { kind: 'child', id: String(row.id), parentId: String(parentId), depth, ...(path === undefined ? {} : { path }), ...(typeof row.name === 'string' ? { name: row.name } : {}), mode: row.mode, ...(typeof row.label === 'string' ? { label: row.label } : {}), createdAt: Number.isFinite(row.createdAt) ? row.createdAt : null, activity: liveAgent(row.id) ? 'running' : 'inactive' }
        })
        let level = childrenOfRows(catalogOf(root) || [], rootId, 1, '')
        while (level.length) {
          entries.push(...level)
          const next = []
          const expandable = level.filter(entry => entry.mode !== 'external')
          for (let index = 0; index < expandable.length; index += TREE_READ_POLICY.statConcurrency) {
            const batch = expandable.slice(index, index + TREE_READ_POLICY.statConcurrency)
            const results = await Promise.all(batch.map(entry => catalogRows(entry.id).catch(() => null)))
            batch.forEach((entry, at) => {
              if (results[at] === null) { entries.push({ kind: 'diagnostic', id: entry.id, parentId: entry.parentId, depth: entry.depth, reason: 'unavailable' }); return }
              next.push(...childrenOfRows(results[at], entry.id, entry.depth + 1, entry.path))
            })
          }
          level = next
        }
        return entries
      })().finally(() => { if (walks.get(rootId) === flight) walks.delete(rootId) })
      walks.set(rootId, flight)
    }
    return raced(flight, signal)
  }
  /**
   * The whole team tree: membersOf plus every deeper descendant (agents started by members or
   * other descendants), each with tier, kind, role id, status, createdAt (from its creator's
   * catalog) and dispatchedBy (the creating agent's display name). A child without a native path
   * is shown under its creator's display name, else by Session id.
   * @returns {{ rows, partial }} partial names why deeper rows are missing or incomplete, else null.
   */
  /** The cached-only counterpart of walk: synchronous, never reads a log; counts what is still loading. */
  function snapshotWalk(root) {
    const rootId = String(root.id), entries = [], visited = new Set([rootId])
    let loading = 0
    let level = [{ id: rootId, rows: catalogOf(root) || [], depth: 0, path: '' }]
    while (level.length) {
      const next = []
      for (const parent of level) for (const row of parent.rows) {
        const id = String(row.id)
        if (!CHILD_MODES.has(row.mode) || visited.has(id)) continue
        visited.add(id)
        const path = parent.path === undefined || typeof row.name !== 'string' ? undefined : parent.path ? parent.path + '/' + row.name : row.name
        const entry = { kind: 'child', id, parentId: parent.id, depth: parent.depth + 1, ...(path === undefined ? {} : { path }), ...(typeof row.name === 'string' ? { name: row.name } : {}), mode: row.mode, ...(typeof row.label === 'string' ? { label: row.label } : {}), createdAt: Number.isFinite(row.createdAt) ? row.createdAt : null, activity: liveAgent(id) ? 'running' : 'inactive' }
        entries.push(entry)
        if (row.mode === 'external') continue
        const rows = peekRows(id)
        if (rows === undefined) { loading += 1; continue }
        next.push({ id, rows, depth: entry.depth, path })
      }
      level = next
    }
    return { entries, loading }
  }
  /**
   * @param options.complete await every cold catalog (tools); default: cached-only, never blocking.
   */
  async function teamTree(agent, signal, { complete = false } = {}) {
    const direct = membersOf(agent)
    if (!direct.length) return { rows: [], partial: null }
    const lead = leadOf(agent), display = new Map(direct.map(row => [String(row.id), String(row.name)]))
    const rows = direct.slice()
    let entries, loading = 0
    try { if (complete) entries = await walk(lead, signal); else ({ entries, loading } = snapshotWalk(lead)) }
    catch (error) { signal?.throwIfAborted?.(); return { rows, partial: 'Agents below the Lead\'s direct children are unavailable: ' + String(error?.message || error) } }
    // Breadth-first: a creator's display name is known before its children.
    for (const entry of entries.filter(item => item.kind === 'child' && item.depth > 1)) {
      const id = entry.id, parent = entry.parentId, creator = display.get(parent) || parent
      const own = typeof entry.name === 'string' ? entry.name : null
      const name = typeof entry.path === 'string' ? entry.path : own ? creator + '/' + own : id
      display.set(id, name)
      rows.push({ id, name, named: !!own, nameSource: typeof entry.path === 'string' ? 'native' : own ? 'bbff-binding' : 'session-id', address: typeof entry.path === 'string' ? entry.path : id,
        description: entry.label || '', mode: entry.mode, createdAt: entry.createdAt, status: statusOf(id), role: 'teammate', ...tierOf(id), depth: entry.depth, parentId: parent, dispatchedBy: creator })
    }
    const unreadable = entries.filter(entry => entry.kind === 'diagnostic').length
    const notes = [...(unreadable ? [unreadable + ' catalog branch(es) could not be read'] : []), ...(loading ? [loading + ' cold catalog(s) are loading in the background; the next read includes them'] : [])]
    return { rows, partial: notes.length ? notes.join('; ') : null }
  }
  /** Native-shaped descendants of the root from the same revision-keyed walk (activity, job-kill, steer). */
  async function descendants(root, signal) { return walk(root, signal) }
  function diagnostics() { return { ...reads, validated: validated.size, walksInFlight: walks.size, syncsInFlight: syncFlights.size, disposed, background: { queued: refresh.queue.size, running: refresh.running, runs: refresh.runs, errors: refresh.errors }, ledger: store.diagnostics(), policy: { ...TREE_READ_POLICY, coldRevalidateMs } } }  /** Stop every background pass and in-flight read; later calls are no-ops. Closes an owned ledger. */
  function dispose() { disposed = true; refresh.queue.clear(); validated.clear(); if (ownsLedger) store.close() }
  return { rootOf, nameOf, catalogOf, childrenOf, leadOf, membersOf, teamTree, descendants, statusOf, statSession, syncSession, requestSync: id => enqueue(String(id)), peekStat: id => validated.get(String(id))?.snapshot, invalidate, diagnostics, dispose, ledger: store, isCurrent: id => current(String(id)) }
}
