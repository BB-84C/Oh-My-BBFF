// Team metadata ledger (Team 0.11.0): a derived, rebuildable SQLite store of what Team knows about
// every agent of its trees, so repeated reads (roster, team view, card, activity window, name
// resolution) never decode a session log. It is fed from live events Team already observes and,
// only when a session was never seen or changed outside this process, from one background decode
// per persistence revision (tree.js syncSession).
//
// Storage: built-in node:sqlite (DatabaseSync), WAL, short busy timeout. A missing, corrupt or
// unknown-version file is rebuilt (it is derived data). Writes are queued and committed in one
// transaction per LEDGER_POLICY.flushMs, never on the event path; a busy database keeps the queue
// and retries. Reads merge the committed rows with the not yet flushed queue.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

export const LEDGER_POLICY = Object.freeze({ schemaVersion: 2, applicationId: 0x42424654, flushMs: 250, busyTimeoutMs: 50, minRing: 50, maxRing: 500 })

// camelCase field -> [column, json]
const FIELDS = Object.freeze({
  rootId: ['root_id', false], parentId: ['parent_id', false], name: ['name', false], label: ['label', false], mode: ['mode', false], createdAt: ['created_at', false],
  status: ['status', false], statusAt: ['status_at', false], runningSince: ['running_since', false], lastEventAt: ['last_event_at', false], lastSeq: ['last_seq', false],
  turnStartedAt: ['turn_started_at', false], turnEndedAt: ['turn_ended_at', false], lastTurn: ['last_turn', true], route: ['route', true],
  reportText: ['report_text', false], reportAt: ['report_at', false], context: ['context', true], error: ['error', true], revision: ['revision', false], syncedAt: ['synced_at', false], syncError: ['sync_error', false], skipped: ['skipped', true],
})
const SCHEMA = `
CREATE TABLE agents (id TEXT PRIMARY KEY, ${Object.values(FIELDS).map(([column]) => column + (/(_at|_since|_seq)$/.test(column) ? ' INTEGER' : ' TEXT')).join(', ')}) WITHOUT ROWID;
CREATE INDEX agents_parent ON agents(parent_id);
CREATE INDEX agents_root_active ON agents(root_id, last_event_at);
CREATE TABLE events (session_id TEXT NOT NULL, seq INTEGER NOT NULL, time INTEGER, entry TEXT NOT NULL, PRIMARY KEY (session_id, seq)) WITHOUT ROWID;`

const rowToAgent = row => {
  if (!row) return null
  const out = { id: row.id }
  for (const [field, [column, json]] of Object.entries(FIELDS)) {
    const value = row[column]
    if (value === null || value === undefined) continue
    if (json) { try { out[field] = JSON.parse(value) } catch {} } else out[field] = typeof value === 'bigint' ? Number(value) : value
  }
  return out
}

export function createLedger({ file = null, ringSize = LEDGER_POLICY.minRing } = {}) {
  let db = null, closed = false, timer = null
  const pending = new Map()      // id -> patch (undefined = untouched, null = clear)
  const ringPending = new Map()  // id -> { reset, entries }
  const stats = { flushes: 0, busy: 0, errors: 0, rebuilds: 0, lastRebuild: null, lastError: null, written: 0 }
  const ring = () => Math.min(LEDGER_POLICY.maxRing, Math.max(LEDGER_POLICY.minRing, ringSize))

  function configure() {
    db.exec(`PRAGMA busy_timeout = ${LEDGER_POLICY.busyTimeoutMs}`)
    if (file) { db.exec('PRAGMA journal_mode = WAL'); db.exec('PRAGMA synchronous = NORMAL') }
  }
  function init() {
    db.exec(SCHEMA)
    db.exec(`PRAGMA application_id = ${LEDGER_POLICY.applicationId}`)
    db.exec(`PRAGMA user_version = ${LEDGER_POLICY.schemaVersion}`)
  }
  function verify() {
    const application = Number(db.prepare('PRAGMA application_id').get().application_id)
    const version = Number(db.prepare('PRAGMA user_version').get().user_version)
    const tables = Number(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get().n)
    if (application === 0 && version === 0 && tables === 0) return init()
    if (application !== LEDGER_POLICY.applicationId || version !== LEDGER_POLICY.schemaVersion) throw new Error(`unknown ledger identity or schema (application ${application}, version ${version})`)
    const check = Object.values(db.prepare('PRAGMA quick_check').get())[0]
    if (check !== 'ok') throw new Error('ledger quick_check failed: ' + check)
  }
  function rebuild(reason) {
    try { db?.close() } catch {}
    for (const path of [file, file + '-wal', file + '-shm']) rmSync(path, { force: true })
    db = new DatabaseSync(file); configure(); init()
    stats.rebuilds += 1; stats.lastRebuild = { reason, at: Date.now() }
  }
  function open() {
    if (!file) { db = new DatabaseSync(':memory:'); configure(); init(); return }
    mkdirSync(dirname(file), { recursive: true })
    try { db = new DatabaseSync(file); configure(); verify() } catch (error) { rebuild(String(error?.message || error)) }
  }
  // Opened on first use: a loaded but unused Team holds no database handle.
  const ready = () => { if (!db && !closed) open(); return !!db }

  function schedule() {
    if (closed || timer) return
    timer = setTimeout(() => { timer = null; flush() }, LEDGER_POLICY.flushMs)
    timer.unref?.()
  }
  /** Queue a field patch for one agent. Never touches the database. */
  function note(id, patch) {
    if (closed || !id) return
    const key = String(id), current = pending.get(key) || {}
    for (const [field, value] of Object.entries(patch)) if (value !== undefined && Object.hasOwn(FIELDS, field)) current[field] = value
    pending.set(key, current)
    schedule()
  }
  /** Queue ring entries ({seq, time, ...}); `reset` replaces the stored ring (backfill). */
  function noteEvents(id, entries, { reset = false } = {}) {
    if (closed || !id) return
    const key = String(id), current = ringPending.get(key) || { reset: false, entries: [] }
    if (reset) { current.reset = true; current.entries = [] }
    current.entries.push(...entries.filter(entry => Number.isSafeInteger(entry?.seq)))
    if (current.entries.length > ring()) current.entries = current.entries.slice(-ring())
    ringPending.set(key, current)
    schedule()
  }
  const upserts = new Map()
  function upsert(id, patch) {
    const fields = Object.keys(patch), key = fields.join(',')
    let statement = upserts.get(key)
    if (!statement) {
      const columns = fields.map(field => FIELDS[field][0])
      statement = db.prepare(`INSERT INTO agents (id, ${columns.join(', ')}) VALUES (?${', ?'.repeat(columns.length)}) ON CONFLICT(id) DO UPDATE SET ${columns.map(column => `${column} = excluded.${column}`).join(', ')}`)
      upserts.set(key, statement)
    }
    statement.run(id, ...fields.map(field => { const value = patch[field]; return value === null ? null : FIELDS[field][1] ? JSON.stringify(value) : value }))
  }
  /** Commit the queue in one transaction. A busy or failed write keeps the queue for the next try. */
  function flush() {
    if (!pending.size && !ringPending.size) return true
    if (!ready()) return false
    if (timer) { clearTimeout(timer); timer = null }
    try {
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const [id, patch] of pending) if (Object.keys(patch).length) upsert(id, patch)
        const insert = db.prepare('INSERT OR REPLACE INTO events (session_id, seq, time, entry) VALUES (?, ?, ?, ?)')
        const trim = db.prepare('DELETE FROM events WHERE session_id = ? AND seq <= (SELECT seq FROM events WHERE session_id = ? ORDER BY seq DESC LIMIT 1 OFFSET ?)')
        const clear = db.prepare('DELETE FROM events WHERE session_id = ?')
        for (const [id, { reset, entries }] of ringPending) {
          if (reset) clear.run(id)
          for (const entry of entries) insert.run(id, entry.seq, Number.isSafeInteger(entry.time) ? entry.time : null, JSON.stringify(entry))
          trim.run(id, id, ring())
        }
        db.exec('COMMIT')
      } catch (error) { try { db.exec('ROLLBACK') } catch {} throw error }
      stats.written += pending.size; stats.flushes += 1
      pending.clear(); ringPending.clear()
      return true
    } catch (error) {
      const message = String(error?.message || error)
      if (/busy|locked/i.test(message)) stats.busy += 1; else { stats.errors += 1; stats.lastError = message }
      if (!closed) schedule()
      return false
    }
  }
  const select = sql => { try { return db.prepare(sql) } catch { return null } }
  function agent(id) {
    if (!ready()) return null
    const key = String(id), base = rowToAgent(select('SELECT * FROM agents WHERE id = ?')?.get(key)), patch = pending.get(key)
    if (!base && !patch) return null
    const merged = { ...(base || { id: key }) }
    for (const [field, value] of Object.entries(patch || {})) { if (value === null) delete merged[field]; else merged[field] = value }
    return merged
  }
  /** Direct children recorded for a parent (committed rows merged with the queue). */
  function children(parentId) {
    if (!ready()) return []
    const key = String(parentId), rows = new Map()
    for (const row of select('SELECT * FROM agents WHERE parent_id = ?')?.all(key) || []) rows.set(row.id, rowToAgent(row))
    for (const [id, patch] of pending) {
      if (patch.parentId === key || rows.has(id)) rows.set(id, { ...(rows.get(id) || { id }), ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null)) })
    }
    return [...rows.values()].filter(row => row.parentId === key)
  }
  /** The stored ring of one agent, oldest first (committed rows merged with the queue). */
  function events(id) {
    if (!ready()) return []
    const key = String(id), queued = ringPending.get(key), out = new Map()
    if (!queued?.reset) for (const row of select('SELECT entry FROM events WHERE session_id = ? ORDER BY seq')?.all(key) || []) { try { const entry = JSON.parse(row.entry); out.set(entry.seq, entry) } catch {} }
    for (const entry of queued?.entries || []) out.set(entry.seq, entry)
    return [...out.values()].sort((a, b) => a.seq - b.seq).slice(-ring())
  }
  function close() {
    if (closed) return
    if (timer) { clearTimeout(timer); timer = null }
    flush()
    closed = true
    pending.clear(); ringPending.clear()
    try { db?.close() } catch {}
    db = null
  }
  return {
    note, noteEvents, agent, children, events, flush, close,
    setRingSize(value) { if (Number.isSafeInteger(value)) ringSize = value },
    get closed() { return closed },
    diagnostics() {
      ready()
      let agents = null, rows = null
      try { agents = Number(db?.prepare('SELECT count(*) AS n FROM agents').get().n); rows = Number(db?.prepare('SELECT count(*) AS n FROM events').get().n) } catch {}
      return { file, closed, agents, ringRows: rows, ring: ring(), queued: pending.size + ringPending.size, ...stats, policy: LEDGER_POLICY }
    },
  }
}
