/** Memory-owned policy/default data. Clients receive these facts, never copied numbers. */
import { readFileSync } from 'node:fs'

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
export const DEFAULT_DATA = freeze(JSON.parse(readFileSync(new URL('./defaults.json', import.meta.url), 'utf8')))
export const PROMPT_DEFAULTS = freeze(JSON.parse(readFileSync(new URL('./prompt-defaults.json', import.meta.url), 'utf8')))
export const cloneData = value => structuredClone(value)
export const SETTINGS_DEFINITIONS = DEFAULT_DATA.fields
export const SETTING_KEYS = Object.freeze([...Object.keys(SETTINGS_DEFINITIONS), 'prompts'])

export function shippedSettings() {
  return { version: DEFAULT_DATA.settingsVersion, ...Object.fromEntries(Object.entries(SETTINGS_DEFINITIONS).map(([key, definition]) => [key, cloneData(definition.default)])), prompts: cloneData(PROMPT_DEFAULTS) }
}

/** Plain substitution only; no code execution and no silent deletion of unknown variables. */
export function renderPrompt(template, variables = {}) {
  return String(template ?? '').replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (token, key) => Object.hasOwn(variables, key) ? String(variables[key] ?? '') : token)
}
export function promptVariables(template) {
  return [...new Set([...String(template ?? '').matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map(match => match[1]))]
}

/** Discovered memory bytes: the demand side of the budget, never the cap. */
export function memoryDemandBytes(files = []) {
  return files.reduce((sum, file) => sum + (typeof file.content === 'string' ? Buffer.byteLength(file.content, 'utf8') : Math.max(0, Number(file.bytes) || 0)), 0)
}

function safeBytes(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

/**
 * Dreaming review-listing size. This is not the injection cap: the review prompt
 * enumerates candidate memory files for the Resident, so it keeps its own
 * growth-relative factor and must not inherit the session-window ratio.
 */
export function reviewInventoryBudget(settings, files = []) {
  const totalBytes = memoryDemandBytes(files), mode = settings.budgetMode
  const budgetBytes = mode === 'fixed' ? settings.budgetFixedBytes : Math.ceil(totalBytes * DEFAULT_DATA.policies.reviewInventoryFactor)
  return { mode, totalBytes, budgetBytes: safeBytes(budgetBytes), autoFactor: DEFAULT_DATA.policies.reviewInventoryFactor, source: mode === 'fixed' ? 'settings.budgetFixedBytes' : 'contract:memory:reviewInventoryFactor' }
}

/**
 * Injection cap. A visible estimate of the session's model context window supplies
 * the ceiling in TOKENS: `window tokens × budget ratio`. Framed text is counted
 * with the declared offline tokenizer, never equating tokens and bytes. Fixed
 * mode retains its explicit byte cap.
 * When no window could be resolved the caller passes none and this function falls
 * back to the shipped safe window, marking the result as a fallback so the reason
 * becomes visible in diagnostics instead of silently using a wrong value.
 */
export function effectiveBudget(settings, files = [], resolved = null) {
  const totalBytes = memoryDemandBytes(files), ratio = settings.budgetWindowRatio
  if (settings.budgetMode === 'fixed') return { mode: 'fixed', totalBytes, budgetBytes: safeBytes(settings.budgetFixedBytes), capTokens: null, unit: 'bytes', ratio, windowTokens: null, source: 'settings.budgetFixedBytes', windowSource: null, model: null, fallback: false, diagnostics: [] }
  const hasWindow = Number.isSafeInteger(resolved?.windowTokens) && resolved.windowTokens > 0
  const windowTokens = hasWindow ? resolved.windowTokens : DEFAULT_DATA.policies.budgetFallbackWindowTokens
  return { mode: 'auto', totalBytes, budgetBytes: null, capTokens: safeBytes(Math.floor(windowTokens * ratio)), unit: 'tokens', ratio, windowTokens, source: 'contract:memory:budgetWindowRatio', windowSource: hasWindow ? resolved.windowSource || 'session-model' : 'fallback-window', model: resolved?.model || null, fallback: !hasWindow, diagnostics: resolved?.diagnostics || [] }
}
