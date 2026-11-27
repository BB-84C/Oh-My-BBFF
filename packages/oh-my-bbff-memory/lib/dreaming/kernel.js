/** One durable review kernel. Limits/settings are resolved at operation boundaries. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { initialState, loadState, markCommit, markWake, recordError, saveState, stateSnapshot, wakeDecision } from './state.js'
import { commitStage, describeStage, discardStage, listMemoryFiles, readMemoryFile, stageChange, runStageDir, listStagedRuns } from './changes.js'
import { computeDelta, deltaManifest, pageDelta } from './sessions.js'
import { candidateInventory, readCandidate, recordCandidateDecision } from './candidates.js'
import { historyPage, previewRevert, applyRevert } from './history.js'
import { normalizeSettings, legacySettings } from '../settings.js'
import { reviewInventoryBudget } from '../defaults.js'
import { msg } from '../host-ref.js'

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });const temporary = path + '.' + process.pid + '.' + randomUUID() + '.tmp'
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');renameSync(temporary, path)
}
function readJson(path) { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
const identity = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function mergeRanges(ranges) {
  const merged = []
  for (const range of ranges.sort((left, right) => left[0] - right[0])) {
    const prior = merged.at(-1)
    if (prior && range[0] <= prior[1]) prior[1] = Math.max(prior[1], range[1])
    else merged.push([...range])
  }
  return merged
}
function coverageKey(sessionId, message) { return JSON.stringify([sessionId, message.index]) }

export function createDreamingKernel({ paths, config = {}, getSettings, now = () => Date.now(), logger, source, getArchivedSessionIds }) {
  const settings = () => normalizeSettings({ ...legacySettings({ dream: config }), ...legacySettings(config), ...(getSettings?.() || {}) })
  const intervalMs = () => Math.round(settings().wakeIntervalHours * 3600000)
  const limits = () => { const value = settings();return { maxSessions: value.deltaMaxSessions, maxMessagesPerSession: value.deltaMaxMessagesPerSession, maxBytesPerSession: value.deltaMaxBytesPerSession, maxBytesTotal: value.deltaMaxBytesTotal } }
  // Sessions the user archived are hidden from the host's session groupings and are not reviewed. The workspace registry owns
  // that set; a registry that is missing, not started yet or failing excludes nothing extra, as before.
  const archivedSessionIds = () => {
    try { const ids = getArchivedSessionIds?.();return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [] }
    catch { return [] }
  }
  const readState = () => loadState({ statePath: paths.statePath, now: now(), errorHistoryLimit: settings().errorHistoryLimit })
  const write = state => { if (state.stateUnavailable) throw new Error('Unverified dreaming state cannot overwrite preserved recovery evidence.');saveState({ statePath: paths.statePath, state });return state }
  function ensureInitialised() { const loaded = readState();if (!loaded.exists) write(loaded.state);return loaded }
  const cachedDelta = () => { const value = readJson(paths.deltaPath);return value && Array.isArray(value.entries) ? value : null }
  function activeRunId(explicit) {
    const active = readState().state.activeRun?.runId || null
    if (explicit && explicit !== active) throw new Error('Run id does not match the active review.')
    return active
  }
  function ensureRun(explicit) {
    const active = readState().state.activeRun?.runId || null
    if (active) return activeRunId(explicit)
    const runId = explicit || ('dream-' + new Date(now()).toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8))
    runStageDir({ paths, runId })
    const state = readState().state, delta = cachedDelta()
    write({ ...state, activeRun: { runId, deltaId: delta?.checkpointIdentity === identity(state.checkpoint) ? delta.deltaId : null, startedAt: now(), kind: 'manual' } })
    return runId
  }
  async function ensureDelta({ force = false, newReview = false } = {}) {
    const state = readState().state
    if (state.stateUnavailable) throw new Error('Dreaming state is unavailable; no new review evidence window may be created.')
    const existing = cachedDelta(), value = settings(), key = identity(state.checkpoint), inputKey = identity({ limits: limits(), includeSubagents: value.includeSubagentSessions })
    if (!newReview && state.activeRun?.deltaId && existing?.deltaId === state.activeRun.deltaId) {
      if (force) throw new Error('An active review is bound to its delta; refresh cannot replace its evidence.')
      return existing
    }
    if (!newReview && state.activeRun?.deltaId) throw new Error('Active review delta is missing/mismatched; preserved stage/checkpoint require recovery or the next normal review.')
    if (!force && existing?.checkpointIdentity === key && existing?.inputIdentity === inputKey) return existing
    let delta
    if (!source?.available?.()) delta = { version: 2, deltaId: 'delta-' + randomUUID(), createdAt: now(), checkpointAt: state.checkpoint.at, checkpointBefore: state.checkpoint, entries: [], nextCheckpoint: state.checkpoint, stats: { sessionsListed: 0, sessionsRead: 0, messages: 0, bytes: 0, truncated: false, unavailable: true } }
    else delta = await computeDelta({ source, checkpoint: state.checkpoint, now: now(), limits: limits(), includeSubagents: value.includeSubagentSessions, exclude: { sessionIds: [...(state.residentSessionId ? [state.residentSessionId] : []), ...(state.previousResidentSessionIds || []), ...archivedSessionIds()], cwdPrefixes: [paths.residentWorkspace] }, logger })
    Object.assign(delta, { checkpointIdentity: key, inputIdentity: inputKey, readCoverage: {} })
    writeJsonAtomic(paths.deltaPath, delta);return delta
  }
  async function prepareWakeDelta({ retry = false } = {}) {
    if (retry) {
      const active = readState().state.activeRun, delta = cachedDelta()
      if (!active || delta?.deltaId !== active.deltaId) throw new Error('Failed review no longer has its bound delta.')
      return delta
    }
    return ensureDelta({ force: true, newReview: true })
  }
  function reviewedCheckpoint(delta, before) {
    const checkpoint = structuredClone(delta.nextCheckpoint || before), coverage = delta.readCoverage || {}
    let unreviewedSessions = 0
    for (const entry of delta.entries) {
      for (const message of entry.messages) {
        const from = message.startOffset || 0, to = message.endOffset ?? message.bytes, ranges = mergeRanges(coverage[coverageKey(entry.sessionId, message)] || [])
        let prefix = from
        for (const range of ranges) { if (range[0] > prefix) break;if (range[1] > prefix) prefix = range[1] }
        if (prefix < to) {
          checkpoint.sessions[entry.sessionId] = { revision: delta.nextCheckpoint.sessions[entry.sessionId]?.revision ?? null, cursor: message.index, byteOffset: prefix, complete: false, ...(prefix ? { partialDigest: message.sourceDigest } : {}) }
          unreviewedSessions++;break
        }
      }
    }
    return { checkpoint, unreviewedSessions }
  }
  function inventory({ scope = 'global', workspaceDir } = {}) { return listMemoryFiles({ paths, scope, workspaceDir, workspaceDirs: settings().workspaceMemoryDirs }) }
  function reviewInventory(delta = cachedDelta()) {
    const files = [...inventory()], diagnostics = [], seenPaths = new Set(files.map(file => file.path))
    const unknownRoots = (delta?.entries || []).filter(entry => !entry.cwd).length
    if (unknownRoots) diagnostics.push({ reason: msg('diag.kernel.unknownRoots', { count: unknownRoots }) })
    for (const workspaceDir of new Set((delta?.entries || []).map(entry => entry.cwd).filter(Boolean))) {
      try { for (const file of inventory({ scope: 'workspace', workspaceDir })) if (!seenPaths.has(file.path)) { seenPaths.add(file.path);files.push(file) } }
      catch (error) { diagnostics.push({ reason: msg('diag.kernel.workspaceInventory', { error: String(error?.message || error) }) }) }
    }
    return { files, diagnostics, budget: reviewInventoryBudget(settings(), files) }
  }
  function statusSync({ lease } = {}) {
    const { state, warnings } = readState(), value = settings(), runId = state.activeRun?.runId || null, candidates = candidateInventory({ paths, limit: value.candidatePageSize }), review = reviewInventory()
    return { ...stateSnapshot(state, { now: now(), intervalMs: intervalMs(), lease: lease || null, staging: describeStage({ paths, runId }) }), statePath: paths.statePath, lockPath: paths.lockPath, deltaPath: paths.deltaPath, enabled: value.dreamEnabled, autoWake: value.dreamAutoWake, wakeIntervalHours: value.wakeIntervalHours, settings: value, candidates: { total: candidates.total, pending: candidates.pending, reviewed: candidates.reviewed }, paths, budget: review.budget, inventoryDiagnostics: review.diagnostics, warnings, stagedRuns: listStagedRuns({ paths, limit: value.changelogPageSize }) }
  }
  const api = {
    paths, now, settings,
    get intervalMs() { return intervalMs() },
    get pageBytes() { return settings().dreamPageBytes },
    ensureInitialised, readState, write, ensureDelta, prepareWakeDelta, cachedDelta, activeRunId, ensureRun, inventory, reviewInventory, statusSync,
    decide() { const loaded = readState();return { ...loaded, decision: wakeDecision({ state: loaded.state, now: now(), intervalMs: intervalMs() }) } },
    async status(options = {}) { return statusSync(options) },
    async delta({ force = false, maxEntries, cursor = 0 } = {}) { const maximum = settings().deltaManifestPageSize, count = Number.isSafeInteger(maxEntries) && maxEntries > 0 ? Math.min(maxEntries, maximum) : maximum;return deltaManifest(await ensureDelta({ force }), { maxEntries: count, cursor }) },
    async page({ sessionId, cursor, byteOffset, maxBytes } = {}) {
      const delta = await ensureDelta({}), maximum = settings().dreamPageBytes, budget = Number.isSafeInteger(maxBytes) && maxBytes > 0 ? Math.min(maxBytes, maximum) : maximum
      const page = await pageDelta({ source, delta, sessionId, cursor, byteOffset, maxBytes: budget })
      const fresh = cachedDelta()
      if (fresh?.deltaId !== delta.deltaId) throw new Error('Delta changed before page delivery; no checkpoint coverage recorded.')
      const coverage = fresh.readCoverage || {}
      for (const part of page.parts) {
        const key = coverageKey(page.sessionId, part)
        coverage[key] = mergeRanges([...(coverage[key] || []), [part.fromOffset, part.toOffset]])
      }
      fresh.readCoverage = coverage;writeJsonAtomic(paths.deltaPath, fresh)
      return page
    },
    read({ scope = 'global', file, workspaceDir, directory, candidateId }) {
      if (candidateId) { const result = readCandidate({ paths, id: candidateId, maxBytes: settings().toolReadMaxBytes });return { ...result, scope: 'candidate' } }
      const result = readMemoryFile({ paths, scope, file, workspaceDir, directory, workspaceDirs: settings().workspaceMemoryDirs, maxBytes: settings().toolReadMaxBytes })
      return { scope: result.scope, file: result.file, directory: result.directory, path: result.path, exists: result.exists, bytes: result.bytes, content: result.content, includedBytes: result.includedBytes, truncated: result.truncated, validUtf8: result.validUtf8, archived: result.archived, status: result.status, ...(result.readError ? { readError: result.readError } : {}) }
    },
    candidates({ cursor, limit, includeReviewed } = {}) { return candidateInventory({ paths, cursor, limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, settings().candidatePageSize) : settings().candidatePageSize, includeReviewed }) },
    decideCandidate({ ids, status = 'reviewed', reason, runId }) { return recordCandidateDecision({ paths, ids, status, reason, runId: activeRunId(runId), now: now() }) },
    stage({ scope, file, content, remove, reason, evidence, workspaceDir, directory, runId, actor }) {
      if (remove !== true && typeof content !== 'string') throw new Error('content text is required unless remove is explicitly true.')
      ensureInitialised();const active = ensureRun(runId)
      const result = stageChange({ paths, runId: active, now: now(), scope, file, content: remove ? null : content, reason, evidence, workspaceDir, directory, workspaceDirs: settings().workspaceMemoryDirs, settings: settings(), actor: actor || readState().state.residentSessionId || 'BBFF Dreaming Resident' })
      return { ...result, staged: describeStage({ paths, runId: active }) }
    },
    discard({ runId, opId }) { const active = activeRunId(runId);return active ? discardStage({ paths, runId: active, opId }) : { runId: null, discarded: [], remaining: 0 } },
    async commit({ runId, note, verifyLease } = {}) {
      const state = readState().state, active = activeRunId(runId)
      if (!active) throw new Error('There is no active review to commit.')
      const delta = await ensureDelta({})
      if (state.activeRun.deltaId && state.activeRun.deltaId !== delta.deltaId) throw new Error('Review and delta identities do not match.')
      verifyLease?.()
      const result = commitStage({ paths, runId: active, now: now(), workspaceDirs: settings().workspaceMemoryDirs, settings: settings(), verifyLease, extra: { note: typeof note === 'string' ? note : undefined, wakeAt: state.lastWakeAt } })
      const progress = reviewedCheckpoint(delta, state.checkpoint)
      verifyLease?.();const next = markCommit(readState().state, { now: now(), checkpoint: progress.checkpoint });write(next)
      return { runId: active, ...result, checkpointAt: progress.checkpoint.at ?? null, lastWakeAt: next.lastWakeAt, nextDueAt: next.lastWakeAt + intervalMs(), intervalMs: intervalMs(), unreviewedSessions: progress.unreviewedSessions }
    },
    history(options = {}) { const value = settings();return historyPage({ paths, settings: value, workspaceDirs: value.workspaceMemoryDirs, cursor: options.cursor, limit: Number.isSafeInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, value.changelogPageSize) : value.changelogPageSize }) },
    previewRevert({ id }) { return previewRevert({ paths, id, settings: settings(), workspaceDirs: settings().workspaceMemoryDirs }) },
    revert({ id, expectedCurrentSha, expectedRestoreSha, verifyLease }) { return applyRevert({ paths, id, expectedCurrentSha, expectedRestoreSha, settings: settings(), workspaceDirs: settings().workspaceMemoryDirs, now: now(), verifyLease }) },
    recordWake({ kind = 'interval', runId, deltaId }) {
      const state = readState().state, next = markWake(state, { now: now(), kind, runId, deltaId });write(next)
      const delta = cachedDelta();if (delta?.deltaId === deltaId) { delta.runId = runId;writeJsonAtomic(paths.deltaPath, delta) }
      return next
    },
    bindRunDelta({ runId, deltaId }) {
      const state = readState().state, delta = cachedDelta()
      if (state.activeRun?.runId !== runId || delta?.deltaId !== deltaId) throw new Error('Cannot bind mismatched review evidence.')
      delta.runId = runId;writeJsonAtomic(paths.deltaPath, delta)
      return write({ ...state, activeRun: { ...state.activeRun, deltaId } })
    },
    recordOutcome({ status, phase, lastError = undefined, retry = undefined }) {
      if (!['running', 'idle', 'failed'].includes(status)) throw new Error('Unknown resident execution status.')
      const state = readState().state
      return write({ ...state, execution: { ...state.execution, status, phase, updatedAt: now(), ...(lastError !== undefined ? { lastError } : {}), ...(retry !== undefined ? { retry } : {}) } })
    },
    recordFailure({ scope, message }) { const value = settings();return write(recordError(readState().state, { now: now(), scope, message, historyLimit: value.errorHistoryLimit, messageLimit: value.errorMessageMaxChars })) },
    resetState() { return write(initialState(now())) },
  }
  return api
}
export { existsSync }
