/**
 * Machine-wide dreaming lease.
 *
 * Several DSH processes can run on one machine against the same `$DSH_HOME`. Only
 * one of them may dream. The lease is a single JSON file guarded by three rules:
 *
 * 1. acquisition uses `O_EXCL` (`flag: 'wx'`), so the create is atomic;
 * 2. a *stale* lease (heartbeat older than `staleMs`) may be taken over, and the
 *    takeover is a temp-file + rename followed by a read-back token check, so two
 *    racing processes cannot both conclude they won;
 * 3. the holder refreshes `heartbeatAt` every heartbeat, and anything it does after
 *    losing the lease is refused by the caller.
 *
 * @module oh-my-bbff-memory/dreaming/lease
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export const LEASE_VERSION = 1

function buildLock({ pid, host, now, token, previous }) {
  return {
    version: LEASE_VERSION,
    pid,
    host,
    token,
    startedAt: previous && Number.isFinite(previous.startedAt) ? previous.startedAt : now,
    acquiredAt: now,
    heartbeatAt: now,
    previousHolder: previous && previous.pid !== undefined
      ? { pid: previous.pid, host: previous.host, heartbeatAt: previous.heartbeatAt }
      : null,
  }
}

function writeExclusive(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if (error && error.code === 'EEXIST') return false
    throw error
  }
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`)
  } finally {
    closeSync(fd)
  }
  return true
}

function writeReplacing(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'w')
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
}

/**
 * Read the lease without taking it.
 * @returns {{present: boolean, holder: object|null, corrupt: boolean, stale: boolean, heartbeatAgeMs: number|null}}
 */
export function readLease({ lockPath, now, staleMs }) {
  if (!existsSync(lockPath)) return { present: false, holder: null, corrupt: false, stale: false, heartbeatAgeMs: null }
  let holder
  try {
    holder = JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch {
    return { present: true, holder: null, corrupt: true, stale: true, heartbeatAgeMs: null }
  }
  const heartbeatAt = holder && Number.isFinite(holder.heartbeatAt) ? holder.heartbeatAt : null
  const heartbeatAgeMs = heartbeatAt === null ? null : Math.max(0, now - heartbeatAt)
  const stale = heartbeatAgeMs === null || heartbeatAgeMs > staleMs
  return { present: true, holder, corrupt: false, stale, heartbeatAgeMs }
}

/**
 * Try to take the lease.
 * @param {{lockPath: string, now: number, staleMs: number, pid?: number, host?: string, token?: string}} input
 * @returns {{acquired: boolean, reason: string, token: string, holder: object|null, takeover: boolean}}
 */
export function acquireLease({ lockPath, now, staleMs, pid = process.pid, host = hostname(), token = randomUUID() }) {
  const fresh = buildLock({ pid, host, now, token, previous: null })
  if (writeExclusive(lockPath, fresh)) {
    return { acquired: true, reason: 'created', token, holder: fresh, takeover: false }
  }

  const current = readLease({ lockPath, now, staleMs })
  if (current.present && !current.stale && current.holder && current.holder.pid !== pid) {
    return { acquired: false, reason: 'held', token, holder: current.holder, takeover: false }
  }
  if (current.present && !current.stale && current.holder && current.holder.pid === pid && current.holder.token === token) {
    return { acquired: true, reason: 'already-held', token, holder: current.holder, takeover: false }
  }
  if (current.present && !current.stale && current.holder && current.holder.pid === pid) {
    // Same PID, different token: the previous lease of this process is still fresh.
    return { acquired: false, reason: 'held-by-same-pid', token, holder: current.holder, takeover: false }
  }

  // Stale or corrupt: replace it, then verify the rename actually published our token.
  const replacement = buildLock({ pid, host, now, token, previous: current.holder })
  try {
    writeReplacing(lockPath, replacement)
  } catch (error) {
    return { acquired: false, reason: `replace-failed:${error && error.message ? error.message : String(error)}`, token, holder: current.holder, takeover: false }
  }
  const after = readLease({ lockPath, now, staleMs })
  if (after.holder && after.holder.token === token) {
    return { acquired: true, reason: 'stale-takeover', token, holder: after.holder, takeover: true }
  }
  return { acquired: false, reason: 'lost-takeover-race', token, holder: after.holder, takeover: false }
}

/**
 * Refresh `heartbeatAt` if (and only if) this process still holds the lease.
 * @returns {boolean} whether the lease was still ours
 */
export function heartbeatLease({ lockPath, token, now, staleMs }) {
  const current = readLease({ lockPath, now, staleMs })
  if (!current.holder || current.holder.token !== token) return false
  const next = { ...current.holder, heartbeatAt: now }
  try {
    writeReplacing(lockPath, next)
    return true
  } catch {
    return false
  }
}

/** Release the lease when this process still owns it. */
export function releaseLease({ lockPath, token, now, staleMs, reason = 'release' }) {
  const current = readLease({ lockPath, now, staleMs })
  if (!current.holder || current.holder.token !== token) return { released: false, reason: 'not-holder' }
  try {
    unlinkSync(lockPath)
    return { released: true, reason }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { released: true, reason: 'already-absent' }
    return { released: false, reason: `unlink-failed:${error && error.message ? error.message : String(error)}` }
  }
}

/**
 * Own one in-process lease handle: acquire on demand, heartbeat on a timer, release
 * on dispose. The handle never re-acquires silently after losing the lease.
 */
export function createLeaseHandle({ lockPath, staleMs, heartbeatMs, now = () => Date.now(), pid, host, logger }) {
  let token = null
  let acquiredAt = null
  let heartbeatTimer = null
  let lost = false
  let lastHeartbeatAt = null
  let takeover = false

  const warn = (message) => {
    try {
      logger?.warn?.(`oh-my-bbff-memory: ${message}`)
    } catch {}
  }

  function isHolder() {
    if (token === null || lost) return false
    const current = readLease({ lockPath, now: now(), staleMs })
    return !!(current.holder && current.holder.token === token)
  }

  function startHeartbeat() {
    if (heartbeatTimer !== null) return
    heartbeatTimer = setInterval(() => {
      try {
        const at = now()
        const ok = heartbeatLease({ lockPath, token, now: at, staleMs })
        if (!ok) {
          lost = true
          warn('dreaming lease lost; no further wake will be attempted by this process')
          stopHeartbeat()
          return
        }
        lastHeartbeatAt = at
      } catch (error) {
        warn(`lease heartbeat failed: ${error && error.message ? error.message : String(error)}`)
      }
    }, heartbeatMs)
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref()
  }

  function stopHeartbeat() {
    if (heartbeatTimer === null) return
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  return {
    get token() { return token },
    get acquiredAt() { return acquiredAt },
    get lost() { return lost },
    get lastHeartbeatAt() { return lastHeartbeatAt },
    get takeover() { return takeover },
    isHolder,
    acquire() {
      if (token !== null && isHolder()) {
        return { acquired: true, reason: 'held', token, takeover }
      }
      const result = acquireLease({ lockPath, now: now(), staleMs, ...(pid === undefined ? {} : { pid }), ...(host === undefined ? {} : { host }) })
      token = result.acquired ? result.token : null
      if (!result.acquired) stopHeartbeat()
      if (result.acquired) {
        acquiredAt = now()
        lost = false
        takeover = result.takeover
        lastHeartbeatAt = acquiredAt
        startHeartbeat()
      }
      return result
    },
    release() {
      stopHeartbeat()
      if (token === null) return { released: false, reason: 'no-token' }
      const result = releaseLease({ lockPath, token, now: now(), staleMs })
      token = null
      acquiredAt = null
      return result
    },
    configure(next) {
      if (!Number.isFinite(next.staleMs) || !Number.isFinite(next.heartbeatMs) || next.heartbeatMs <= 0 || next.staleMs <= next.heartbeatMs) throw new Error('Invalid lease timing configuration.')
      const changed = next.heartbeatMs !== heartbeatMs
      staleMs = next.staleMs;heartbeatMs = next.heartbeatMs
      if (changed) { stopHeartbeat();if (isHolder()) startHeartbeat() }
    },
    describe() {
      const current = readLease({ lockPath, now: now(), staleMs })
      return {
        holder: token !== null && !lost && current.holder?.token === token,
        lost,
        token: token === null ? null : token.slice(0, 8),
        acquiredAt,
        heartbeatAt: lastHeartbeatAt,
        takeover,
        observed: {
          present: current.present,
          stale: current.stale,
          corrupt: current.corrupt,
          heartbeatAgeMs: current.heartbeatAgeMs,
          pid: current.holder ? current.holder.pid : null,
          host: current.holder ? current.holder.host : null,
        },
      }
    },
  }
}
