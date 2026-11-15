/** Nonblocking per-endpoint read models: one flight, exact key, observable parts/timing. */
import { performance } from 'node:perf_hooks'
import { msg } from './host-ref.js'
/** Aborts carry the locale reference so a displayed read reason stays translatable. */
const abortError = reference => Object.assign(new Error(reference.key), { reference })
export function createReadPartCache({ getSettings, now = Date.now } = {}) {
  const entries = new Map();let disposed = false
  function start(entry, key, build) {
    if (disposed || entry.flight) return
    const generation = (entry.generation || 0) + 1;entry.generation = generation
    entry.parts = {};entry.startedTick = performance.now();entry.startedAt = now();entry.lastAttemptAt = now();entry.error = null;entry.controller = new AbortController();entry.queued = true
    entry.flight = new Promise(resolve => setImmediate(resolve)).then(async () => {
      entry.queued = false
      if (disposed || entry.controller.signal.aborted) return
      const measure = async (name, fn) => {
        const part = entry.parts[name] = { status: 'running', startedAt: now(), ms: null }, begin = performance.now()
        try { const value = await fn(entry.controller.signal);part.status = 'ready';return value }
        catch (error) { part.status = 'error';part.reason = error?.reference || String(error?.message || error);throw error }
        finally { part.ms = performance.now() - begin;part.finishedAt = now() }
      }
      const timeout = setTimeout(() => { if (entry.generation !== generation) return;entry.timedOut = true;entry.error = msg('read.timeout');entry.controller.abort(abortError(msg('read.timeout'))) }, getSettings().apiReadBackgroundTimeoutMs);timeout.unref?.()
      try {
        const value = await build(measure, entry.controller.signal)
        if (!disposed && entry.generation === generation && !entry.controller.signal.aborted) { entry.value = value;entry.key = key;entry.updatedAt = now();entry.error = null }
      } catch (error) { if (entry.generation === generation) entry.error = error?.reference || String(error?.message || error) }
      finally { clearTimeout(timeout);entry.finishedAt = now();entry.elapsedMs = performance.now() - entry.startedTick }
    }).finally(() => { entry.flight = null;entry.controller = null })
  }
  function read(name, id, key, build, seed) {
    const token = JSON.stringify([name,id || null]);let entry = entries.get(token)
    if (!entry) { entry = { value: null, key: null, updatedAt: null, lastAttemptAt: -Infinity, parts: {}, flight: null };entries.set(token, entry) }
    entries.delete(token);entries.set(token, entry)
    const settings = getSettings()
    for (const [oldKey, oldEntry] of entries) { if (entries.size <= settings.sessionReadMaxRoots) break;if (oldKey !== token && !oldEntry.flight) entries.delete(oldKey) }
    const changed = entry.key !== key, stale = entry.updatedAt === null || now() - entry.updatedAt >= settings.sessionReadReuseMs
    if (!entry.flight && (changed || stale) && (changed && entry.value !== null || now() - entry.lastAttemptAt >= settings.sessionReadReuseMs)) start(entry, key, build)
    const pending = !!entry.flight, status = pending ? 'pending' : entry.error ? 'error' : entry.value ? 'ready' : 'pending', reason = entry.error || (entry.queued ? msg('read.queued') : pending ? msg('read.pending') : null)
    return { ...(entry.value || seed()), pending, pendingReason: reason, read: { name, status, cached: !!entry.value, stale: changed || stale, requestedKey: key, capturedKey: entry.key, updatedAt: entry.updatedAt, startedAt: entry.startedAt || null, finishedAt: entry.finishedAt || null, elapsedMs: entry.elapsedMs ?? null, reason, parts: Object.fromEntries(Object.entries(entry.parts).map(([part,value]) => [part,{...value}])) }, readPolicy: { reuseMs: settings.sessionReadReuseMs, pendingPollMs: settings.apiPendingPollMs, backgroundTimeoutMs: settings.apiReadBackgroundTimeoutMs } }
  }
  return { read, publish(name, id, key, value) { const token = JSON.stringify([name,id || null]), old = entries.get(token), entry = old || { parts: {}, flight: null };entry.generation = (entry.generation || 0) + 1;entry.controller?.abort(abortError(msg('read.superseded')));entry.value = value;entry.key = key;entry.updatedAt = now();entry.lastAttemptAt = now();entry.error = null;entries.set(token, entry) }, invalidate() { for (const entry of entries.values()) { entry.updatedAt = null;entry.lastAttemptAt = -Infinity } }, dispose() { disposed = true;for (const entry of entries.values()) entry.controller?.abort(abortError(msg('read.disposed')));entries.clear() } }
}
