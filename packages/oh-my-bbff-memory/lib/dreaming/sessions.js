/** Lossless bounded human-input manifests and UTF-8 multipart pages. Native decoding is SDK-owned. */
import { randomUUID, createHash } from 'node:crypto'
import { sessionEventFacts, sessionHeaderFacts } from '../dsh-adapter.js'
import { sessionReadSkipFacts, sessionReadSkipReason } from '../session-budget.js'
import { DEFAULT_DATA } from '../defaults.js'
import { truncateUtf8 } from '../store.js'
import { createSessionReadCache } from '../session-reads.js'
import { msg } from '../host-ref.js'

export const DELTA_VERSION = 2
const byteLength = text => Buffer.byteLength(text, 'utf8')
const digest = text => createHash('sha256').update(text).digest('hex')
const defaultLimit = key => DEFAULT_DATA.fields[key].default
export const DEFAULT_LIMITS = Object.freeze({ maxSessions: defaultLimit('deltaMaxSessions'), maxMessagesPerSession: defaultLimit('deltaMaxMessagesPerSession'), maxBytesPerSession: defaultLimit('deltaMaxBytesPerSession'), maxBytesTotal: defaultLimit('deltaMaxBytesTotal') })
function userFacts(event) {
  const facts = sessionEventFacts(event)
  return { ...facts, human: facts.complete && facts.value?.kind === 'user-message' && facts.value.isHuman === true && facts.value.text.length > 0 }
}
export function userTextOf(event) { const facts = userFacts(event);return facts.human ? facts.value.text : null }
export function createSessionSource({ getPersistence, getQuery, getAgents, getRoot, getSettings, readCache, logger, sessionBudget }) {
  const bridge = { get: name => name === 'sessionPersistence' ? getPersistence?.() : name === 'sessionQuery' ? getQuery?.() : name === 'agents' ? getAgents?.() : undefined }, reader = readCache || createSessionReadCache(bridge, { getSettings, sessionBudget })
  // One decoded log per review: pages of the same review reuse a single snapshot, and the decode
  // cost is reported with the page so a review can see what it paid.
  const pageSnapshots = new Map(), reviewCost = new Map()
  async function pageFact(id, index, reviewId = '') {
    const key = String(id) + '|' + String(reviewId), current = pageSnapshots.get(key)
    let row = current
    if (!row) {
      const startedAt = Date.now(), verdict = await sessionBudget?.check?.(id, {}), model = await reader.read(id, { from: 0, purpose: 'page', allowSkipped: true })
      row = { model, ms: Date.now() - startedAt, skipped: !!verdict?.skipped }
      pageSnapshots.set(key, row)
      const cost = reviewCost.get(String(reviewId)) || { decodes: 0, ms: 0 };cost.decodes++;cost.ms += row.ms;reviewCost.set(String(reviewId), cost)
      while (pageSnapshots.size > 8) pageSnapshots.delete(pageSnapshots.keys().next().value)
      while (reviewCost.size > 8) reviewCost.delete(reviewCost.keys().next().value)
    }
    return row.model.human.get(index) || row.model.invalid.get(index) || { complete: true, human: false }
  }
  return {
    available: () => !!(getPersistence?.()?.open || getQuery?.()?.observeSession),
    async list() {
      const persistence = getPersistence?.(), query = getQuery?.(), records = persistence?.list ? await persistence.list() : query?.listSessions ? await query.listSessions() : [], rows = []
      for (const record of records) {
        const decoded = sessionHeaderFacts(record?.header)
        if (!decoded.complete || !decoded.value.sessionId) continue
        const facts = decoded.value
        rows.push({ id: facts.sessionId, cwd: null, sourceCwd: facts.cwd || null, isSubagent: facts.isSubagent || !!facts.parentId || Number(facts.depth) > 0, revision: record.revision === undefined ? null : String(record.revision), eventCount: Number.isSafeInteger(record.eventCount) ? record.eventCount : null, createdAt: null })
      }
      return rows
    },
    root: id => getRoot?.(id),
    readFacts: (id, options) => reader.read(id, options),
    async factAt(id, index, reviewId) { return pageFact(id, index, reviewId) },
    pageCost: (reviewId = '') => ({ ...(reviewCost.get(String(reviewId)) || { decodes: 0, ms: 0 }) }),
    /** Budget verdict for one session id; null when no budget is bound (documented fallback). */
    async sessionCheck(id) { return sessionBudget?.check ? sessionBudget.check(id, {}) : null },
    budgetDescribe: () => sessionBudget?.describe?.() || null,
    reader,
  }
}
function excluded(row, exclude, includeSubagents) {
  if (!includeSubagents && row.isSubagent === true) return true
  if (exclude?.sessionIds?.includes(row.id)) return true
  if ((row.sourceCwd || row.cwd) && Array.isArray(exclude?.cwdPrefixes)) {
    const normalize = value => { const path = String(value).replace(/\\/g, '/').replace(/\/+$/, '');return process.platform === 'win32' ? path.toLowerCase() : path }
    const path = normalize(row.sourceCwd || row.cwd)
    if (exclude.cwdPrefixes.some(prefix => { const wanted = normalize(prefix);return wanted && (path === wanted || path.startsWith(wanted + '/')) })) return true
  }
  return false
}
function checkedLimits(input) {
  const limits = { ...DEFAULT_LIMITS, ...input }
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Delta limit ' + key + ' must be a positive finite integer.')
  return limits
}
export async function computeDelta({ source, checkpoint, now, limits, exclude, includeSubagents = DEFAULT_DATA.fields.includeSubagentSessions.default, logger }) {
  const effective = checkedLimits(limits), previous = checkpoint && typeof checkpoint === 'object' ? checkpoint : { at: null, sessions: {} }, previousSessions = previous.sessions || {}, nextSessions = Object.assign(Object.create(null), previousSessions), entries = []
  const stats = { sessionsListed: 0, sessionsConsidered: 0, sessionsRead: 0, sessionsChanged: 0, sessionsSkippedUnchanged: 0, sessionsSkipped: 0, skippedSessions: [], sessionsFailed: 0, messages: 0, bytes: 0, truncated: false, skips: [], blocked: [], diagnostics: [], unscannedSessions: 0 }
  let rows
  try { rows = await source.list() }
  catch (error) { stats.failedReason = 'Session listing failed: ' + String(error?.message || error);return finish() }
  stats.sessionsListed = rows.length
  // Provider order is retained unless a source supplies genuine creation facts; no native header layout is guessed.
  const candidates = rows.filter(row => !excluded(row, exclude, includeSubagents)).sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0))
  for (let rowIndex = 0; rowIndex < candidates.length; rowIndex++) {
    const row = candidates[rowIndex], prior = previousSessions[row.id], priorCursor = Number.isSafeInteger(prior?.cursor) ? prior.cursor : 0
    stats.sessionsConsidered++
    const completeBefore = prior?.complete === true || (prior?.complete !== false && Number.isSafeInteger(row.eventCount) && priorCursor >= row.eventCount && !prior?.byteOffset)
    if (prior && completeBefore && row.revision !== null && prior.revision === row.revision) { stats.sessionsSkippedUnchanged++;continue }
    if (stats.sessionsRead >= effective.maxSessions || stats.bytes >= effective.maxBytesTotal) { stats.truncated = true;stats.unscannedSessions = candidates.length - rowIndex;break }
    // Owner session-read budget: never open a log that is too large AND too old. A skipped session
    // is a first-class diagnostic (id/size/age) and its checkpoint is left untouched — never a
    // fabricated empty fold.
    let verdict = null
    try { verdict = await source.sessionCheck?.(row.id) } catch (error) { stats.diagnostics.push({ reason: String(error?.message || error), sessionId: row.id }) }
    if (verdict?.skipped) { stats.sessionsSkipped++;stats.skippedSessions.push(sessionReadSkipFacts(verdict));continue }
    let snapshot
    try { snapshot = source.readFacts ? await source.readFacts(row.id, { from: priorCursor, minimumCursor: row.eventCount, expectedRevision: row.revision === null ? undefined : row.revision }) : await source.read(row.id);stats.sessionsRead++ }
    catch (error) { stats.sessionsFailed++;stats.skips.push({ sessionId: row.id, reason: String(error?.message || error) });continue }
    let events = snapshot.events || [], totalEvents = snapshot.totalEvents ?? events.length
    const rebased = priorCursor > totalEvents
    if (rebased && source.readFacts) { snapshot = await source.readFacts(row.id, { from: 0 });totalEvents = snapshot.totalEvents }
    let cursor = rebased ? 0 : priorCursor, byteOffset = rebased ? 0 : Math.max(0, prior?.byteOffset || 0), sessionBytes = 0
    const fromIndex = cursor, fromOffset = byteOffset, messages = []
    while (cursor < totalEvents) {
      const decoded = snapshot.human ? snapshot.human.get(cursor) || snapshot.invalid.get(cursor) || { complete: true, human: false } : userFacts(events[cursor])
      if (!decoded.complete) { stats.truncated = true;stats.blocked.push({ sessionId: row.id, index: cursor, reason: msg('diag.sessions.invalidEvent') });stats.diagnostics.push(...decoded.diagnostics);break }
      if (!decoded.human) { cursor++;byteOffset = 0;continue }
      if (messages.length >= effective.maxMessagesPerSession) { stats.truncated = true;break }
      const text = decoded.value.text, sourceBytes = byteLength(text), sourceDigest = decoded.sourceDigest || digest(text)
      if (byteOffset > sourceBytes || (byteOffset < sourceBytes && (Buffer.from(text, 'utf8')[byteOffset] & 192) === 128) || (byteOffset && prior?.partialDigest && prior.partialDigest !== sourceDigest && cursor === fromIndex)) { byteOffset = 0;stats.diagnostics.push({ reason: msg('diag.sessions.partialChanged') }) }
      const available = Math.min(effective.maxBytesPerSession - sessionBytes, effective.maxBytesTotal - stats.bytes - sessionBytes)
      if (available <= 0) { stats.truncated = true;break }
      const remaining = Buffer.from(text, 'utf8').subarray(byteOffset).toString('utf8'), part = truncateUtf8(remaining, available), bytes = byteLength(part)
      if (!bytes && remaining.length) { stats.truncated = true;stats.blocked.push({ sessionId: row.id, index: cursor, byteOffset, reason: msg('diag.sessions.byteLimit') });break }
      const endOffset = byteOffset + bytes
      messages.push({ seq: decoded.value.seq ?? cursor, index: cursor, time: decoded.value.time ?? null, bytes, startOffset: byteOffset, endOffset, sourceBytes, sourceDigest, partial: endOffset < sourceBytes })
      sessionBytes += bytes
      if (endOffset < sourceBytes) { byteOffset = endOffset;stats.truncated = true;break }
      cursor++;byteOffset = 0
    }
    const complete = cursor >= totalEvents && (!Number.isSafeInteger(row.eventCount) || cursor >= row.eventCount) && byteOffset === 0
    nextSessions[row.id] = { revision: snapshot.revision === undefined ? row.revision : String(snapshot.revision), cursor, byteOffset, complete, ...(byteOffset && messages.length ? { partialDigest: messages.at(-1).sourceDigest } : prior?.partialDigest && byteOffset ? { partialDigest: prior.partialDigest } : {}) }
    if (!messages.length) continue
    stats.sessionsChanged++;stats.messages += messages.length;stats.bytes += sessionBytes
    let root = null
    if (source.root) { try { root = await source.root(row.id) } catch {} }
    entries.push({ sessionId: row.id, cwd: source.root ? root?.resolved ? root.cwd : null : row.cwd || null, createdAt: row.createdAt || null, eventCount: totalEvents, fromIndex, fromOffset, toIndex: cursor, toOffset: byteOffset, messageCount: messages.length, bytes: sessionBytes, firstTime: messages[0].time, lastTime: messages.at(-1).time, partial: !complete, messages })
  }
  return finish()
  function finish() {
    const budget = source.budgetDescribe?.() || null
    stats.coverage = stats.sessionsSkipped || stats.sessionsFailed || stats.truncated ? 'partial' : 'complete'
    if (budget) { stats.sessionReadLimits = budget.limits;stats.sessionReadLimitsSource = budget.source;if (budget.source === 'contract-default') stats.diagnostics.push({ reason: msg('diag.sessionReadLimitsFallback') }) }
    return { version: DELTA_VERSION, deltaId: 'delta-' + randomUUID(), createdAt: now, checkpointAt: Number.isFinite(previous.at) ? previous.at : null, checkpointBefore: previous, entries, nextCheckpoint: { at: stats.failedReason ? previous.at : now, sessions: nextSessions }, stats } }
}
export function deltaManifest(delta, { maxEntries = defaultLimit('deltaManifestPageSize'), cursor = 0 } = {}) {
  const all = delta.entries || [], start = Math.max(0, Math.min(Number.isSafeInteger(cursor) ? cursor : 0, all.length)), count = Number.isSafeInteger(maxEntries) && maxEntries > 0 ? maxEntries : defaultLimit('deltaManifestPageSize'), end = Math.min(all.length, start + count)
  return { deltaId: delta.deltaId, createdAt: delta.createdAt, checkpointAt: delta.checkpointAt, sessions: all.length, messages: delta.stats?.messages ?? all.reduce((sum, entry) => sum + entry.messageCount, 0), bytes: delta.stats?.bytes ?? all.reduce((sum, entry) => sum + entry.bytes, 0), truncated: !!delta.stats?.truncated, entries: all.slice(start, end).map(({ messages, ...entry }) => entry), cursor: start, nextCursor: end < all.length ? end : null, omittedSessions: all.length - end, stats: delta.stats }
}

/** Body bytes are bounded; source/fragment metadata is separate and never duplicates the body. */
export async function pageDelta({ source, delta, sessionId, cursor = 0, byteOffset = 0, maxBytes = defaultLimit('dreamPageBytes') }) {
  const entries = delta?.entries || []
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Page byte budget must be a positive finite integer.')
  if (!entries.length) return { sessionId: null, fromCursor: 0, fromByteOffset: 0, nextCursor: null, nextByteOffset: 0, done: true, messageCount: 0, totalMessages: 0, entries: 0, bytes: 0, text: '', parts: [] }
  const entry = sessionId ? entries.find(item => item.sessionId === sessionId) : entries.length === 1 ? entries[0] : null
  if (!entry) throw new Error('Choose a sessionId from the current delta manifest.')
  let nextCursor = Math.max(0, Math.min(Number.isSafeInteger(cursor) ? cursor : 0, entry.messages.length)), nextByteOffset = Math.max(0, Number.isSafeInteger(byteOffset) ? byteOffset : 0)
  const start = nextCursor, fromByteOffset = nextByteOffset, snapshot = source.factAt ? null : await source.read(entry.sessionId), parts = []
  let text = '', blocked = null
  while (nextCursor < entry.messages.length) {
    const meta = entry.messages[nextCursor], fact = source.factAt ? await source.factAt(entry.sessionId, meta.index, delta?.deltaId) : null, raw = fact ? fact.human ? fact.value.text : null : userTextOf(snapshot.events[meta.index]), sourceDigest = fact?.sourceDigest || (raw === null ? null : digest(raw))
    if (raw === null || (meta.sourceDigest && meta.sourceDigest !== sourceDigest)) throw new Error('Delta source changed or is unavailable; it must not be silently consumed.')
    const full = Buffer.from(raw, 'utf8'), from = meta.startOffset || 0, to = meta.endOffset ?? full.length, body = full.subarray(from, to).toString('utf8'), bodyBytes = byteLength(body)
    if (nextByteOffset > bodyBytes) throw new Error('Page byte offset exceeds its recorded source fragment.')
    if (nextByteOffset < bodyBytes && (Buffer.from(body, 'utf8')[nextByteOffset] & 192) === 128) throw new Error('Page byte offset must be a UTF-8 boundary.')
    const separator = parts.length ? '\n\n' : '', available = maxBytes - byteLength(text) - byteLength(separator)
    if (available <= 0) break
    const fragment = truncateUtf8(Buffer.from(body, 'utf8').subarray(nextByteOffset).toString('utf8'), available), bytes = byteLength(fragment)
    if (!bytes && nextByteOffset < bodyBytes) { if (!parts.length) blocked = 'Page byte budget cannot hold the next UTF-8 scalar.';break }
    const textStart = text.length + separator.length
    text += separator + fragment
    parts.push({ seq: meta.seq, index: meta.index, time: meta.time, fromOffset: from + nextByteOffset, toOffset: from + nextByteOffset + bytes, sourceBytes: meta.sourceBytes ?? full.length, textStart, textEnd: text.length, bytes })
    nextByteOffset += bytes
    if (nextByteOffset >= bodyBytes) { nextCursor++;nextByteOffset = 0 } else break
  }
  const done = nextCursor >= entry.messages.length
  return { sessionId: entry.sessionId, fromCursor: start, fromByteOffset, nextCursor: done ? null : nextCursor, nextByteOffset: done ? 0 : nextByteOffset, done, messageCount: parts.length, totalMessages: entry.messages.length, bytes: byteLength(text), entries: entries.length, ...(source.pageCost ? { decode: { ...source.pageCost(delta?.deltaId), reviewId: delta?.deltaId || null } } : {}), text, parts, ...(blocked ? { blocked } : {}) }
}
