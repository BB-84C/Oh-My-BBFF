/**
 * Dreaming Resident state: paths, durable state file, and the wake-decision math.
 *
 * The decision is a pure function of the persisted state and one clock reading, so
 * the rolling wall-clock rule (`now - lastWakeAt >= intervalMs`) is testable without
 * a scheduler. Nothing here starts a timer or talks to the harness.
 *
 * @module oh-my-bbff-memory/dreaming/state
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, isAbsolute, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from '../defaults.js'

/** Fixed resident session title (locked decision D9). */
export const RESIDENT_TITLE = 'BBFF Dreaming Resident 🌙'

/** Rolling wake interval in hours (locked decision D10). */
export const DEFAULT_WAKE_INTERVAL_HOURS = DEFAULT_DATA.fields.wakeIntervalHours.default

/** A lease older than this heartbeat is stale and may be taken over. */
export const DEFAULT_LEASE_STALE_MS = DEFAULT_DATA.fields.leaseStaleMs.default

/** Lease heartbeat cadence. */
export const DEFAULT_HEARTBEAT_MS = DEFAULT_DATA.fields.leaseHeartbeatMs.default

/** Scheduler tick cadence. */
export const DEFAULT_TICK_MS = DEFAULT_DATA.fields.schedulerTickMs.default

export const STATE_VERSION = 1

/**
 * Resolve every path the dreaming subsystem owns.
 * @param {{home: string}} input
 */
export function dreamingPaths({ home }) {
  if (typeof home !== 'string' || !isAbsolute(home) || resolve(home) === parse(resolve(home)).root) throw new Error('Memory home must be an absolute non-drive-root directory.')
  const memoryRoot = join(home, DEFAULT_DATA.storage.globalMemoryDirectory)
  const dreamingRoot = join(memoryRoot, DEFAULT_DATA.storage.dreamingDirectory)
  return {
    home,
    memoryRoot,
    globalAgentsMd: join(home, DEFAULT_DATA.storage.globalInstructionFile),
    dreamingRoot,
    statePath: join(dreamingRoot, 'state.json'),
    lockPath: join(dreamingRoot, 'lock.json'),
    changelogPath: join(dreamingRoot, 'changelog.jsonl'),
    stageRoot: join(dreamingRoot, 'stage'),
    deltaPath: join(dreamingRoot, 'delta.json'),
    historyRoot: join(memoryRoot, DEFAULT_DATA.storage.historyDirectory),
    archiveRoot: join(memoryRoot, DEFAULT_DATA.storage.archiveDirectory),
    candidateRoot: join(memoryRoot, DEFAULT_DATA.storage.candidatesDirectory),
    residentWorkspace: join(home, DEFAULT_DATA.storage.residentWorkspaceDirectory),
  }
}

/** `{version, lastWakeAt, checkpoint, residentSessionId, activeRun, ...}`. */
export function initialState(now) {
  return {
    version: STATE_VERSION,
    // A missing state file means "this installation has never reviewed": arm the
    // clock at activation time instead of waking on the first boot. An *existing*
    // state with an old lastWakeAt still wakes immediately (boot catch-up).
    lastWakeAt: now,
    bootstrappedAt: now,
    bootstrapped: true,
    wakeCount: 0,
    lastWakeKind: null,
    lastCheckedAt: now,
    lastCommitAt: null,
    residentSessionId: null,
    activeRun: null,
    execution: { status: 'idle', phase: null, lastError: null, retry: null, updatedAt: now },
    checkpoint: { at: now, sessions: {} },
    errors: [],
  }
}

/**
 * Read the durable state, tolerating a missing or corrupt file.
 * @returns {{state: object, exists: boolean, created: boolean, warnings: string[]}}
 */
export function loadState({ statePath, now, errorHistoryLimit = DEFAULT_DATA.fields.errorHistoryLimit.default }) {
  const warnings = []
  if (!existsSync(statePath)) {
    return { state: initialState(now), exists: false, created: true, warnings }
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'))
    const state = normalizeState(parsed, now, errorHistoryLimit)
    return { state, exists: true, created: false, warnings }
  } catch (error) {
    warnings.push('Dreaming state is unreadable; the original file was preserved and automatic review is disabled until recovery.')
    const state = initialState(now)
    state.stateUnavailable = true
    state.execution = { status: 'failed', phase: 'state-read', lastError: { at: now, scope: 'state-read', message: warnings[0] }, retry: null, updatedAt: now }
    return { state, exists: true, created: false, corrupt: true, warnings }
  }
}

function normalizeState(parsed, now, errorHistoryLimit) {
  const base = initialState(now)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Dreaming state must be a record.')
  if (Object.hasOwn(parsed, 'residentSessionId') && parsed.residentSessionId !== null && (typeof parsed.residentSessionId !== 'string' || !parsed.residentSessionId.trim())) throw new Error('Resident identity is invalid; never substitute a new dedicated session.')
  if (Object.hasOwn(parsed, 'wakeCount') && (!Number.isSafeInteger(parsed.wakeCount) || parsed.wakeCount < 0)) throw new Error('Durable wake counter is invalid; do not guess a replacement.')
  if (parsed.activeRun !== undefined && parsed.activeRun !== null && (typeof parsed.activeRun !== 'object' || Array.isArray(parsed.activeRun) || typeof parsed.activeRun.runId !== 'string' || !parsed.activeRun.runId.trim())) throw new Error('Active review identity is invalid; recovery is required.')
  const state = { ...base, ...parsed }
  state.bootstrapped = parsed.bootstrapped === true
  state.lastWakeAt = Number.isFinite(parsed.lastWakeAt) ? parsed.lastWakeAt : now
  if (parsed.checkpoint === null || typeof parsed.checkpoint !== 'object') {
    state.checkpoint = { at: now, sessions: {} }
  } else {
    const sessions = parsed.checkpoint.sessions
    state.checkpoint = {
      at: Number.isFinite(parsed.checkpoint.at) ? parsed.checkpoint.at : now,
      sessions: sessions !== null && typeof sessions === 'object' ? { ...sessions } : {},
    }
  }
  state.errors = Array.isArray(parsed.errors) ? parsed.errors.slice(-errorHistoryLimit) : []
  state.execution = parsed.execution && typeof parsed.execution === 'object' ? { ...base.execution, ...parsed.execution } : { ...base.execution, lastError: state.errors.at(-1) || null, status: state.errors.length ? 'failed' : 'idle' }
  return state
}

/** Atomically persist the state (temp file + rename). */
export function saveState({ statePath, state }) {
  mkdirSync(dirname(statePath), { recursive: true })
  const temporary = `${statePath}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(temporary, statePath)
}

/** Remove a partially written state file that was never renamed into place. */
export function removeIfPresent(path) {
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {}
}

/**
 * Rolling wall-clock wake decision.
 *
 * `due` is true exactly when a previous wake is recorded and the interval has fully
 * elapsed. A never-woken state is not due: activation already armed the clock.
 * @param {{state: object, now: number, intervalMs: number}} input
 */
export function wakeDecision({ state, now, intervalMs }) {
  const interval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_WAKE_INTERVAL_HOURS * 3600_000
  const lastWakeAt = Number.isFinite(state && state.lastWakeAt) ? state.lastWakeAt : null
  if (lastWakeAt === null) {
    return { due: false, reason: 'never-woken', lastWakeAt: null, elapsedMs: null, nextDueAt: null, intervalMs: interval }
  }
  const elapsedMs = Math.max(0, now - lastWakeAt)
  const due = elapsedMs >= interval
  return {
    due,
    reason: due ? 'interval-elapsed' : 'interval-not-elapsed',
    lastWakeAt,
    elapsedMs,
    nextDueAt: lastWakeAt + interval,
    intervalMs: interval,
  }
}

/** Record that a wake was dispatched (the review happened even if it wrote nothing). */
export function markWake(state, { now, kind, runId, deltaId }) {
  return {
    ...state,
    lastWakeAt: now,
    lastWakeKind: kind,
    wakeCount: (Number.isFinite(state.wakeCount) ? state.wakeCount : 0) + 1,
    activeRun: { runId, deltaId, startedAt: now, kind },
    execution: { ...(state.execution || {}), status: 'idle', phase: 'delivery', updatedAt: now, retry: null },
  }
}

/** Record a finished review: advance the checkpoint and close the active run. */
export function markCommit(state, { now, checkpoint }) {
  return {
    ...state,
    lastCommitAt: now,
    checkpoint: checkpoint !== undefined ? checkpoint : state.checkpoint,
    activeRun: null,
    execution: { status: 'idle', phase: 'committed', lastError: null, retry: null, updatedAt: now },
  }
}

/** Append a bounded error line to the state's rolling log. */
export function recordError(state, { now, scope, message, historyLimit = DEFAULT_DATA.fields.errorHistoryLimit.default, messageLimit = DEFAULT_DATA.fields.errorMessageMaxChars.default }) {
  const errors = Array.isArray(state.errors) && historyLimit > 1 ? state.errors.slice(-(historyLimit - 1)) : []
  const lastError = { at: now, scope, message: String(message).slice(0, messageLimit) }
  errors.push(lastError)
  return { ...state, errors, execution: { ...(state.execution || {}), status: 'failed', phase: scope, lastError, updatedAt: now } }
}

/** Compact status view for `dream_status` and the HTTP route. */
export function stateSnapshot(state, { now, intervalMs, lease, staging }) {
  const decision = wakeDecision({ state, now, intervalMs })
  const checkpoint = state.checkpoint || { at: null, sessions: {} }
  return {
    ok: true,
    lastWakeAt: state.lastWakeAt,
    lastWakeKind: state.lastWakeKind || null,
    lastCommitAt: state.lastCommitAt || null,
    wakeCount: state.wakeCount || 0,
    intervalMs: decision.intervalMs,
    due: decision.due,
    elapsedMs: decision.elapsedMs,
    nextDueAt: decision.nextDueAt,
    residentSessionId: state.residentSessionId || null,
    checkpoint: {
      at: checkpoint.at ?? null,
      sessions: Object.keys(checkpoint.sessions || {}).length,
    },
    activeRun: state.activeRun || null,
    stateUnavailable: state.stateUnavailable === true,
    residentStatus: state.execution?.status || 'idle',
    lastError: state.execution?.lastError || null,
    execution: state.execution || null,
    lease: lease || null,
    staging: staging || null,
    errors: state.errors || [],
  }
}
