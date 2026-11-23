/**
 * Dreaming Resident rotation: the arithmetic that bounds one session's context.
 *
 * The Resident runs one long-lived session and DSH never compacts it past the request budget:
 * compaction's threshold is capped at `contextWindow − reservedCompletion` (and `/compact`
 * reserves the same completion), so a session whose prompt plus completion exceeds the window
 * fails with CONTEXT_WINDOW exactly at the line compaction would have used. Rotation is therefore
 * decided against the *next request's* prompt cost, with the route's reserved completion
 * subtracted, and never against the raw window.
 *
 * Pure functions only: no harness, no clock, no I/O.
 * @module oh-my-bbff-memory/dreaming/rotation
 */

/** Safety margin kept below `window − reservedCompletion`; a request dies strictly above it. */
export const ROTATION_SAFETY_MARGIN = 0.05

/** Floor, so an unusually large completion reservation cannot drive the threshold to zero. */
export const ROTATION_MIN_RATIO = 0.05

/** Ceiling used when the route's completion reservation is unknown. */
export const ROTATION_MAX_RATIO = 0.9

const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0
const isNonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0

/**
 * Effective rotation threshold from the route's capacity and the configured share.
 * `ratio + reservedCompletion/window < 1` is the hard bound; the margin keeps one whole
 * request inside it. The configured value is clamped, never silently ignored.
 */
export function rotationBudget({ contextWindow, reservedCompletionTokens = null, configuredRatio, safetyMargin = ROTATION_SAFETY_MARGIN, minRatio = ROTATION_MIN_RATIO, maxRatio = ROTATION_MAX_RATIO } = {}) {
  const window = isPositiveInteger(contextWindow) ? contextWindow : null
  const reserved = isNonNegativeInteger(reservedCompletionTokens) ? reservedCompletionTokens : null
  const requested = Number.isFinite(configuredRatio) ? configuredRatio : null
  const common = { contextWindow: window, reservedCompletionTokens: reserved, configuredRatio: requested, safetyMargin, minRatio, maxRatio }
  if (window === null || requested === null) return { available: false, reason: window === null ? 'context-window-unavailable' : 'rotation-ratio-unavailable', ...common }
  const reservedFraction = reserved === null ? null : reserved / window
  const safeCeilingRatio = reserved === null ? maxRatio : Math.max(minRatio, Math.min(maxRatio, 1 - reservedFraction - safetyMargin))
  const effectiveRatio = Math.min(Math.max(minRatio, requested), safeCeilingRatio)
  return {
    available: true,
    ...common,
    reservedFraction,
    reservedSource: reserved === null ? 'unavailable' : 'adapter-default-max-tokens',
    safeCeilingRatio,
    effectiveRatio,
    thresholdTokens: Math.floor(window * effectiveRatio),
    /** The message budget DSH's own compaction is capped at; rotation must stay below it. */
    messageBudgetTokens: reserved === null ? null : window - reserved,
    clamped: effectiveRatio < requested,
  }
}

/** Rotate only when enabled, the budget is known, and the measured prompt exceeds the threshold. */
export function rotationDecision({ enabled = false, usedTokens = null, budget = null } = {}) {
  if (!enabled) return { rotate: false, reason: 'rotation-disabled' }
  if (!budget?.available) return { rotate: false, reason: budget?.reason || 'rotation-budget-unavailable' }
  if (!isNonNegativeInteger(usedTokens)) return { rotate: false, reason: 'context-pressure-unavailable' }
  const rotate = usedTokens > budget.thresholdTokens
  return {
    rotate,
    reason: rotate ? 'context-pressure-over-threshold' : 'context-pressure-below-threshold',
    usedTokens,
    ratio: Math.round((usedTokens / budget.contextWindow) * 10000) / 100,
    thresholdTokens: budget.thresholdTokens,
    contextWindow: budget.contextWindow,
    effectiveRatio: budget.effectiveRatio,
  }
}

/**
 * Can the next request still be sent? A wake adds its own prompt to the measured pressure, and the
 * route reserves its completion, so the request fits only below `window − reserved − prompt`.
 * Over the rotation threshold is NOT the same as not fitting: bounding must never cost a wake.
 */
export function rotationCapacity({ budget = null, usedTokens = null, promptAllowanceTokens = 0 } = {}) {
  if (!budget?.available) return { available: false, reason: budget?.reason || 'rotation-budget-unavailable' }
  if (!isNonNegativeInteger(usedTokens)) return { available: false, reason: 'context-pressure-unavailable' }
  const allowance = isNonNegativeInteger(promptAllowanceTokens) ? promptAllowanceTokens : 0
  const messageBudgetTokens = budget.messageBudgetTokens ?? budget.contextWindow
  const headroomTokens = messageBudgetTokens - usedTokens - allowance
  return { available: true, fits: headroomTokens > 0, headroomTokens, messageBudgetTokens, promptAllowanceTokens: allowance, usedTokens }
}

const stamp = value => Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : 'unknown'
const percentOf = (used, window) => isNonNegativeInteger(used) && isPositiveInteger(window) ? Math.round((used / window) * 10000) / 100 + '%' : 'unknown'

/**
 * The note that carries continuity across a rotation: which session was retired, where the
 * checkpoint stood, what a review had in flight, and why the rotation happened.
 */
export function rotationHandoff({ from = null, to = null, at = null, trigger = 'manual', reason = null, checkpoint = null, inFlight = null, pressure = null, route = null, routeUnavailable = null, staleRunning = null } = {}) {
  const sessions = checkpoint?.sessions && typeof checkpoint.sessions === 'object' ? Object.keys(checkpoint.sessions).length : null
  const lines = [
    `Previous Resident session: ${from || 'none'}.`,
    `Rotated at ${stamp(at)} (${trigger}${reason ? ': ' + reason : ''}); new session: ${to || 'this one'}.`,
    `Checkpoint position: ${stamp(checkpoint?.at)}${sessions === null ? '' : `; ${sessions} session(s) covered`}.`,
    `In flight at rotation: ${inFlight?.runId ? `review ${inFlight.runId}${inFlight.deltaId ? ' (delta ' + inFlight.deltaId + ')' : ''} — unresolved, re-check it` : 'no review'}.`,
  ]
  if (staleRunning) lines.push(`Rotation reason: stale-running — the Agent still reported "running" but the session's durable turn boundary says no turn was open (last turn ${staleRunning.lastTurn ?? 'unknown'}); no review was interrupted.`)
  // The route is the owner's pin: the replacement must run what the retired session ran, and when
  // that cannot be read the note says so instead of presenting the DSH default as continuity.
  const routeText = route?.provider && route?.model ? [route.provider, route.model, route.reasoningEffort].filter(Boolean).join(' / ') : null
  if (routeText && route.source === 'carried-from-retired-session') lines.push(`Model route: ${routeText} (carried from the retired session).`)
  else if (routeText) lines.push(`Model route: ${routeText} (source: ${route.source || 'unknown'}). This is not the retired session's selection${routeUnavailable ? ' (' + routeUnavailable + ')' : ''}; an operator should restore the owner's Resident route.`)
  else lines.push(`Model route: unavailable${routeUnavailable ? ' (' + routeUnavailable + ')' : ''}; the replacement runs whatever DSH seeds. An operator must set the owner's Resident route.`)
  if (pressure && isNonNegativeInteger(pressure.usedTokens) && isPositiveInteger(pressure.windowTokens)) lines.push(`Context pressure that triggered rotation: ${pressure.usedTokens} / ${pressure.windowTokens} tokens (${percentOf(pressure.usedTokens, pressure.windowTokens)}).`)
  lines.push('The durable memory store and the checkpoint carry the state; call dream_status and dream_delta before acting, and do not assume the previous session\'s reasoning is available.')
  return lines.join('\n')
}

/** Retired session titles stay distinguishable from the live Resident title. */
export function retiredResidentTitle(at, liveTitle = 'BBFF Dreaming Resident 🌙') {
  const date = Number.isFinite(at) && at > 0 ? new Date(at).toISOString().slice(0, 10) : 'unknown'
  return `${liveTitle} (retired ${date})`
}
