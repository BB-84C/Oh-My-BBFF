/** Root-only Memory writes require fresh shared ancestry + adapter-decoded own position. */
import { sessionHeaderFacts } from './dsh-adapter.js'
export function authorizeRootAgent(agent, resolution) {
  const decoded = sessionHeaderFacts(agent?.session?.header), own = decoded.value
  let reason = null
  if (!decoded.complete || typeof agent?.id !== 'string' || own.sessionId !== agent.id) reason = 'Memory writes require a verified own session header and identity.'
  else if (own.isSubagent || own.parentId || Number(own.depth) > 0) reason = 'Subagent sessions cannot write accepted memory; use memory_candidate.'
  else if (resolution?.resolved !== true || resolution.cached) reason = 'A fresh shared root resolution is required for writes: ' + (resolution?.reason || 'unavailable')
  else if (resolution.rootSessionId !== agent.id) reason = 'This session is not the resolved root; use memory_candidate.'
  return { allowed: reason === null, reason: reason || 'Verified root session.', rootSessionId: resolution?.rootSessionId || agent?.id || null, cwd: resolution?.resolved === true ? resolution.cwd : null }
}
