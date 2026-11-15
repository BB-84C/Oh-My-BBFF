/** Shared root identity consumer. No second ancestry walker or child-cwd fallback. */
import { FAMILY_SERVICE, ROOT_RESOLVE_MAX_DEPTH } from './bbff-contract.js'
import { sessionHeaderFacts } from './dsh-adapter.js'
export const MAX_PARENT_DEPTH = ROOT_RESOLVE_MAX_DEPTH
export { authorizeRootAgent } from './root-access.js'

export function createRootResolver({ getFamily, getSessionQuery, getPersistence, getAgents, logger } = {}) {
  const cachedRoots = new WeakMap(), disposedAgents = new WeakSet()
  async function headerOf(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId) return null
    const candidates = [
      () => getAgents?.()?.get?.(sessionId)?.session?.header,
      async () => (await getPersistence?.()?.stat?.(sessionId))?.header,
      async () => (await getSessionQuery?.()?.filterSessions?.([{ kind: 'id', values: [sessionId] }]))?.[0]?.header,
    ]
    for (const read of candidates) {
      try { const header = await read();if (sessionHeaderFacts(header).value.sessionId === sessionId) return header } catch {}
    }
    return null
  }
  async function resolve(sessionId, hint = {}) {
    const own = typeof sessionId === 'string' && sessionId ? sessionId : null
    if (!own) return { sessionId: null, rootSessionId: null, cwd: null, resolved: false, reason: 'No session identity is available.', header: null }
    let attached = hint.agent
    try { attached ||= getAgents?.()?.get?.(own) } catch {}
    const header = hint.header || attached?.session?.header || await headerOf(own)
    if (attached?.id !== own || disposedAgents.has(attached)) attached = null
    let result
    try {
      const family = getFamily?.()
      if (family?.contract === 1 && typeof family.resolveRoot === 'function') result = await family.resolveRoot(own)
    } catch (error) { try { logger?.warn?.('Memory shared root resolution failed: ' + String(error?.message || error)) } catch {} }
    if (!result || result.resolved !== true || typeof result.rootSessionId !== 'string') {
      const unavailable = { sessionId: own, rootSessionId: own, cwd: null, resolved: false, reason: result?.reason || 'Shared root resolver unavailable.', header }
      const cached = attached && cachedRoots.get(attached)
      return cached ? { ...cached.result, header, cached: true, cachedAt: cached.at, availabilityReason: unavailable.reason } : unavailable
    }
    const resolved = { sessionId: own, rootSessionId: result.rootSessionId, cwd: typeof result.cwd === 'string' ? result.cwd : null, resolved: true, reason: result.reason, header }
    if (attached && !disposedAgents.has(attached)) cachedRoots.set(attached, { result: resolved, at: new Date().toISOString() })
    return resolved
  }
  function dispose(agent) { if (agent && typeof agent === 'object') { cachedRoots.delete(agent);disposedAgents.add(agent) } }
  return { resolve, headerOf, dispose, serviceKey: FAMILY_SERVICE }
}
