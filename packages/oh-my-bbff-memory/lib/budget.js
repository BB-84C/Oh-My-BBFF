/** Session injection cap from the exact current model selection, through the native SDK contract. */
import { DEFAULT_DATA, effectiveBudget } from './defaults.js'
import { msg } from './host-ref.js'

const diagnostic = (code, reference, extra = {}) => ({ code, reason: reference, ...extra })
const validRoute = value => typeof value?.provider === 'string' && value.provider.trim() && typeof value?.model === 'string' && value.model.trim()
const route = (value, windowSource) => ({ provider: value.provider, model: value.model, windowSource })
const percent = ratio => Math.round(ratio * 10000) / 100
export const fallbackWindowTokens = () => DEFAULT_DATA.policies.budgetFallbackWindowTokens

/** No Agent is constructed/resumed, no model selection or provider request is changed. */
export function createBudgetResolver({ getSettings, getLlm, getDefaultModel, now = Date.now } = {}) {
  const cache = new Map()
  function routeOf(agent, diagnostics = [], sessionId) {
    // An unloaded known session has an unknown route, not the global default.
    // Do not resume it, or silently substitute some other session's model.
    if (!agent?.session && sessionId) return null
    if (agent?.session) {
      try {
        if (typeof agent.model?.current !== 'function') throw new Error('Agent-owned model.current() is unavailable')
        const selected = agent.model.current()
        if (validRoute(selected)) return route(selected, 'agent-model-current')
      } catch (error) {
        diagnostics.push(diagnostic('budget-model-projection-unavailable', msg('diag.budget.projectionUnavailable', { error: String(error?.message || error) })))
        return null
      }
      try {
        const config = agent.session.requestHeader?.()?.config
        if (validRoute(config)) return route(config, 'requestHeader')
      } catch {}
      // A new Agent may have an explicit route before either projection or first
      // request exists. Its explicit option must not be replaced with a global route.
      if (validRoute(agent.options)) return route(agent.options, 'agent-options')
    }
    try {
      const selection = getDefaultModel?.()?.currentSelection?.()
      if (validRoute(selection)) return route(selection, 'deployment-default-model')
    } catch {}
    return null
  }
  async function windowFor(selected, signal) {
    const key = JSON.stringify([selected.provider, selected.model]), cached = cache.get(key), at = now(), llm = getLlm?.()
    if (cached && cached.llm === llm && at - cached.at >= 0 && at - cached.at < DEFAULT_DATA.policies.budgetWindowCacheMs) return { ...cached, cached: true }
    if (!llm || typeof llm.resolveModelInfo !== 'function') throw new Error('LLM service does not expose resolveModelInfo')
    const info = await llm.resolveModelInfo(selected.provider, selected.model, signal), contextWindow = info?.context?.contextWindow
    if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) throw new Error('Adapter reported no positive context window for ' + selected.provider + '/' + selected.model)
    if (info.provider !== undefined && info.provider !== selected.provider || info.id !== undefined && info.id !== selected.model) throw new Error('Adapter metadata belongs to a different provider/model route')
    const value = { provider: selected.provider, model: selected.model, name: info.name, contextWindow, at, llm }
    cache.set(key, value)
    return value
  }
  async function resolve({ agent, sessionId, measure = async (_name, fn) => fn(), signal } = {}) {
    const settings = getSettings(), diagnostics = []
    if (settings.budgetMode === 'fixed') return effectiveBudget(settings)
    const selected = await measure('budget-model-route', () => routeOf(agent, diagnostics, sessionId))
    if (selected) {
      const lookup = await measure('budget-context-window', async () => {
        try { return { ok: true, value: await windowFor(selected, signal) } } catch (error) { if (signal?.aborted) throw error;return { ok: false, error } }
      })
      if (lookup.ok) {
        const info = lookup.value, model = { provider: selected.provider, model: selected.model, ...(info.name ? { name: info.name } : {}) }
        diagnostics.push(diagnostic('budget-window-source', msg('diag.budget.windowSource', { provider: selected.provider, model: selected.model, source: selected.windowSource, window: info.contextWindow, percent: percent(settings.budgetWindowRatio) }), { windowTokens: info.contextWindow, windowSource: selected.windowSource, model }))
        return effectiveBudget(settings, [], { windowTokens: info.contextWindow, windowSource: selected.windowSource, model, diagnostics })
      }
      diagnostics.push(diagnostic('budget-window-resolve-failed', msg('diag.budget.windowResolveFailed', { provider: selected.provider, model: selected.model, source: selected.windowSource, tokens: fallbackWindowTokens(), error: String(lookup.error?.message || lookup.error) }), { windowSource: 'shipped-safe-window', modelSource: selected.windowSource, windowTokens: fallbackWindowTokens(), model: { provider: selected.provider, model: selected.model } }))
    } else {
      diagnostics.push(diagnostic('budget-window-unknown-model', msg('diag.budget.windowUnknownModel', { tokens: fallbackWindowTokens() }), { windowTokens: fallbackWindowTokens(), windowSource: 'shipped-safe-window' }))
    }
    return { ...effectiveBudget(settings), model: selected ? { provider: selected.provider, model: selected.model } : null, modelSource: selected?.windowSource || null, windowSource: 'shipped-safe-window', diagnostics }
  }
  return { resolve, routeOf, windowFor, clear: () => cache.clear() }
}
