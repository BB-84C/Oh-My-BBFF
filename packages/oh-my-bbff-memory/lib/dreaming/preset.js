/** Retained fail-closed boundary; lives as long as an Agent retains this preset revision. */
import { DREAM_TOOL_NAMES } from '../dream-tools.js'
export const name = 'bbff-dreaming-boundary'
export const inject = ['tools']
export function apply(ctx) {
  const allowed = new Set(DREAM_TOOL_NAMES)
  // No executor: inherited globals are hidden here, scoped dream tools stay visible only
  // while Memory registers them, and the guard denies every non-dream execution.
  ctx.tools.restrict({ allow: [] })
  ctx.tools.guard(exec => allowed.has(exec.name) ? undefined : 'Dreaming Resident is confined to its seven private dream_* tools.')
}
