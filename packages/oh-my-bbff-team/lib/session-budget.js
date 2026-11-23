/** Session-read budget for Team's cold-session readers.
 *
 * DSH decompresses a whole compressed session log even for a logical `read(offset)`,
 * so hydrating historical logs saturates the host. The policy (owner decision:
 * > 30 MB AND untouched for 7 days) lives once in the family contract; Team resolves
 * the `$DSH_HOME/sessions` root and binds its own settings, so the two thresholds stay
 * settings values rather than call-site literals.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SESSION_READ_SKIP_REASON_KEY, createSessionReadBudget, sessionReadSkipParams, msg } from './bbff-contract.js'

/** `$DSH_HOME/sessions` — where a persisted session log can live. */
export function sessionsRoot() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions')
}

/** One budget per read surface, resolved against Team's settings. */
export function createTeamSessionBudget(getSettings = () => ({}), options = {}) {
  return createSessionReadBudget({ sessionsRoot: sessionsRoot(), getSettings, ...options })
}

/** Localized diagnostic reason for a skipped log (id, size and age are always included). */
export function sessionReadSkipReason(verdict) {
  return msg(verdict && verdict.reasonKey ? verdict.reasonKey : SESSION_READ_SKIP_REASON_KEY, sessionReadSkipParams(verdict))
}
