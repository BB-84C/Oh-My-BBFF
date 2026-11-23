/** Session-read budget for the Widgets read surfaces.
 *
 * DSH decompresses a whole compressed session log even for a logical `read(offset)`,
 * so decoding historical logs saturates the host. The policy itself (owner decision:
 * > 30 MB AND untouched for 7 days) lives once in the family contract; this module
 * only resolves the `$DSH_HOME/sessions` root and binds the package's settings.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SESSION_READ_SKIP_REASON_KEY, createSessionReadBudget, sessionReadSkipParams } from './bbff-contract.js'
import { wmsg as msg } from './locale-keys.js'

/** `$DSH_HOME/sessions` — where a persisted session log can live. */
export function sessionsRoot() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions')
}

/** One budget per read surface, resolved against this package's settings. */
export function createWidgetsSessionBudget(getSettings = () => ({}), options = {}) {
  return createSessionReadBudget({ sessionsRoot: sessionsRoot(), getSettings, ...options })
}

/** Localized diagnostic reason for a skipped log (id, size and age are always included). */
export function sessionReadSkipReason(verdict) {
  return msg(verdict && verdict.reasonKey ? verdict.reasonKey : SESSION_READ_SKIP_REASON_KEY, sessionReadSkipParams(verdict))
}
