/** Existing committed visible text via the attached, projection-free PUBLIC observation port. */
import { createHash } from 'node:crypto'
import { sessionEventFacts } from './dsh-adapter.js'
import { msg } from './host-ref.js'
export function createVisibleReceiptReader(counter, { getSessionQuery } = {}) {
  const sessions = new WeakMap()
  return async function read(agent, { kind, form, signal, selectionKey = '', matches, selectTexts } = {}) {
    const session = agent?.session, surface = session?.surface, query = getSessionQuery?.()
    if (!surface?.nodes || typeof session.deriveEventMessage !== 'function' || !query?.observeSession) return { available: false, reason: msg('native.receipt.noPort') }
    let byKind = sessions.get(session);if (!byKind) { byKind = new Map();sessions.set(session, byKind) }
    const generation = String(surface.replaceGeneration) + '/' + String(surface.contentGeneration)
    const key = kind + '/' + (form || '') + '/' + selectionKey, old = byKind.get(key), reusable = old && old.generation === generation && old.length <= surface.nodes.length
    const floor = reusable ? old.length : 0, cutLength = surface.nodes.length, cutGeneration = generation
    if (reusable && floor === cutLength) return old.value
    let observation, found = null
    try {
      // This is the same canonical nondeprecated live port used by Memory suffix
      // reads. No prepared replay, synchronous Session event accessor or full query.
      observation = await query.observeSession(agent.id || session.id, { projectionMode: 'none', signal })
      if (observation?.source !== 'live' || observation.header?.id !== session.id) return { available: false, reason: msg('native.receipt.noObservation') }
      const events = observation.events
      for (let index = cutLength - 1; index >= floor; index--) {
        const seq = surface.nodes[index], event = events[seq], decoded = sessionEventFacts(event)
        if (!decoded.complete || decoded.value?.kind !== 'user-message' || decoded.value.source !== kind) continue
        // The independent public Message API applies committed projections; this
        // consumer never decodes a producer's private serialized payload layout.
        const message = session.deriveEventMessage(event)
        if (message?.role !== 'user' || message.source?.kind !== kind || form && message.source?.form !== form) continue
        if (matches && !matches(message)) continue
        const rawTexts = message.content.filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text)
        const texts = selectTexts ? selectTexts(message, rawTexts) : rawTexts
        const count = await counter.countBatch(texts, { signal })
        found = { available: true, selection: selectionKey || null, seq, time: Number.isFinite(event.time) ? event.time : null, tokens: count.tokens, bytes: texts.reduce((sum,text)=>sum+Buffer.byteLength(text,'utf8'),0), countMethod: count.method, estimated: true, textSha256: createHash('sha256').update(JSON.stringify(texts)).digest('hex'), basis: msg('native.receipt.basis') }
        break
      }
    } finally { observation?.[Symbol.dispose]?.() }
    const result = found || (reusable ? old.value : null) || { available: false, reason: msg('native.receipt.unavailable') }
    if (String(session.surface.replaceGeneration) + '/' + String(session.surface.contentGeneration) !== cutGeneration) { byKind.delete(key);return { available: false, reason: msg('native.receipt.changed') } }
    byKind.set(key, { generation: cutGeneration, length: cutLength, value: result })
    return result
  }
}
