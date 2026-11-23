/**
 * Session-read budget for Memory's readers and the Dreaming Resident.
 *
 * DSH decompresses a whole compressed session log even for a logical `read(offset)`, so a review
 * that hydrates many historical logs saturates the host (owner incident 2026-11-22). The policy —
 * skip only when the log is **> 30 MiB AND untouched for 7 days** — lives once in the family
 * contract (`bbff-contract.js`); this module only resolves the two thresholds from the family
 * settings store and binds one budget per read surface. Thresholds are never copied as literals.
 *
 * Memory never deletes, moves or archives a session log; a skipped log is reported with its id,
 * size and age so a review knows its coverage is partial.
 * @module oh-my-bbff-memory/session-budget
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { SESSION_READ_SKIP_REASON_KEY, SESSION_READ_SKIP_CODE, createSessionReadBudget, sessionReadLimits, sessionReadSkipParams } from './bbff-contract.js'
import { msg } from './host-ref.js'

/** `$DSH_HOME/sessions` — where a persisted session log can live. */
export function sessionsRoot(home) {
  return join(home || process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions')
}

/** The BBFF root settings file is the family single source for the two thresholds (read-only here). */
export function familySettingsFile(home) {
  return join(home || process.env.DSH_HOME || join(homedir(), '.dsh'), 'oh-my-bbff-widgets', 'settings.json')
}

/**
 * Resolve the family limits. A missing/unreadable family store is reported as
 * `source: 'contract-default'` (and a diagnostic), never as an invented number.
 */
export function resolveReadLimits({ home, now = Date.now, cacheMs = 30000 } = {}) {
  const file = familySettingsFile(home), settings = readFamilySettings({ file, now, cacheMs })
  const limits = sessionReadLimits(settings.settings)
  return { limits, source: settings.found ? 'family-settings' : 'contract-default', file, error: settings.error || null }
}

const familyCache = new Map()
function readFamilySettings({ file, now, cacheMs }) {
  const cached = familyCache.get(file)
  if (cached && now() - cached.at < cacheMs) return cached.value
  let value
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')), root = parsed?.root?.settings && typeof parsed.root.settings === 'object' ? parsed.root.settings : parsed?.settings && typeof parsed.settings === 'object' ? parsed.settings : parsed
    value = { found: true, settings: root && typeof root === 'object' ? root : {}, error: null }
  } catch (error) { value = { found: false, settings: {}, error: error?.code === 'ENOENT' ? null : String(error?.message || error) } }
  familyCache.set(file, { at: now(), value })
  while (familyCache.size > 8) familyCache.delete(familyCache.keys().next().value)
  return value
}

/**
 * One budget for one read surface. `getSettings` may still carry Memory-local overrides; the
 * family store supplies the two thresholds (`sessionReadMaxSizeMb` / `sessionReadMaxAgeDays`).
 */
export function createMemorySessionBudget({ home, getSettings = () => ({}), now = Date.now, cacheMs = 30000, stat } = {}) {
  let resolved = resolveReadLimits({ home, now, cacheMs })
  let resolvedAt = now()
  const settingsOf = () => {
    if (now() - resolvedAt >= cacheMs) { resolved = resolveReadLimits({ home, now, cacheMs });resolvedAt = now() }
    return { ...resolved.limits.settings, maxSizeMb: resolved.limits.maxSizeMb, maxAgeDays: resolved.limits.maxAgeDays, ...(typeof getSettings === 'function' ? getSettings() || {} : {}) }
  }
  const budget = createSessionReadBudget({ sessionsRoot: sessionsRoot(home), getSettings: settingsOf, now, cacheMs, ...(stat ? { stat } : {}) })
  return Object.freeze({
    check: (sessionId, options) => budget.check(sessionId, options),
    limits: () => budget.limits(),
    reset: () => budget.reset(),
    describe: () => ({ ...resolved, limits: budget.limits(), root: sessionsRoot(home) }),
  })
}

/** Plain diagnostic reason for a skipped log (id, size and age are always included). */
export function sessionReadSkipReason(verdict) {
  const params = sessionReadSkipParams(verdict)
  return `${params.sessionId}: ${params.sizeMb} MB, ${params.ageDays} days old (over ${params.maxSizeMb} MB and ${params.maxAgeDays} days); not decoded`
}

/** Localized message reference for the same skip, for API/UI consumers. */
export function sessionReadSkipReference(verdict) {
  return msg((verdict && verdict.reasonKey) || SESSION_READ_SKIP_REASON_KEY, sessionReadSkipParams(verdict))
}

/** The first-class skip diagnostic a review records instead of decoding. */
export function sessionReadSkipFacts(verdict) {
  const stats = verdict?.stats || {}, limits = verdict?.limits || sessionReadLimits()
  return {
    code: SESSION_READ_SKIP_CODE,
    sessionId: String(verdict?.sessionId || ''),
    sizeBytes: Number.isFinite(stats.sizeBytes) ? stats.sizeBytes : null,
    ageMs: Number.isFinite(verdict?.ageMs) ? verdict.ageMs : null,
    maxSizeMb: limits.maxSizeMb,
    maxAgeDays: limits.maxAgeDays,
    reason: sessionReadSkipReason(verdict),
    reasonRef: sessionReadSkipReference(verdict),
  }
}
