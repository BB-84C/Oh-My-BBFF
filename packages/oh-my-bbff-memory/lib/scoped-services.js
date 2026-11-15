/** Operational service selection must match the native loop/Agent realm.
 * serviceFor can intentionally read another retained composition; it must never
 * blindly replace a present operational Agent getter. Every mutation is traced.
 */
export function readAgentService(agent, name) { return agent?.ctx?.get?.(name) }
export function traceAgentService(agent, name) {
  const service = readAgentService(agent, name)
  if (!service) throw new Error('Operational Agent service is unavailable: ' + name)
  if (typeof agent?.ctx?.reflect?.trace !== 'function') throw new Error('Agent-owned service mutation requires public agent.ctx.reflect.trace().')
  return agent.ctx.reflect.trace(service)
}
