// Model resolution shared by tools, activation and diagnostics. Display labels
// are resolved at explicit selection time, never persisted as a new identity.
import { modelTier, routeText } from './catalog.js'

export function routeOptions(route) {
  return { provider: route.provider, model: route.model, ...(route.effort ? { reasoningEffort: route.effort } : {}) }
}
export function sameModelIdentity(left, right) {
  return !!left && !!right && left.provider === right.provider && left.model === right.model && (left.effort || '') === (right.effort || '')
}
export function defaultRoute(get) {
  const service = get('agentDefaultModel')
  const selected = service && typeof service.currentSelection === 'function' ? service.currentSelection() : null
  if (!selected || !selected.provider || !selected.model) throw new Error('DSH default model is unavailable (agentDefaultModel.currentSelection)')
  return { provider: String(selected.provider), model: String(selected.model), ...(selected.reasoningEffort ? { effort: String(selected.reasoningEffort) } : {}) }
}
export function resolveRoleModel(role, selector, get) {
  const chosen = modelTier(role, selector)
  return { route: chosen.route || defaultRoute(get), selection: chosen.selection }
}
/** Existing storage keys only. null keeps the intentional dynamic DSH-default mode. */
export function bindingRouteFields(role, route) {
  return role.models?.length ? { route: { provider: route.provider, model: route.model, ...(route.effort ? { effort: route.effort } : {}) } } : { model: null }
}
function bindingChoice(binding, role) {
  if (binding.model !== undefined) {
    // Pre-0.8.2 primitive selectors are interpreted in memory. Invalid history
    // recovers to the role's preferred tier, not a provider-availability retry.
    try { return modelTier(role, binding.model) }
    catch (error) {
      if (binding.model !== null && !['string', 'number'].includes(typeof binding.model)) throw error
      const chosen = modelTier(role, undefined)
      return { ...chosen, bindingInvalid: { selector: binding.model, reason: String(error?.message || error), fallback: 'role-preferred' } }
    }
  }
  if (binding.route && role.models?.length) {
    const index = role.models.findIndex(tier => sameModelIdentity(tier, binding.route))
    if (index < 0) throw new Error(`bound model identity for role "${role.id}" is no longer in its configured tiers: ${routeText(binding.route)}`)
    return modelTier(role, index + 1)
  }
  return modelTier(role, undefined)
}
/** Current display selector, derived from identity; never writes the binding. */
export function bindingSelection(binding, role) { return bindingChoice(binding, role).selection }
/** Internal preflight never round-trips the current display label. */
export function bindingModelIndex(binding, role) {
  const chosen=bindingChoice(binding,role)
  return role.models?.length ? role.models.findIndex(tier=>sameModelIdentity(tier,chosen.route))+1 : undefined
}
export function resolveBindingModel(binding, catalog, get) {
  const role = catalog.byId.get(binding.role)
  if (!role) throw new Error(`bound role "${binding.role}" is no longer available`)
  const chosen = bindingChoice(binding, role), route = chosen.route || defaultRoute(get)
  return { ...chosen, route, ...(chosen.bindingInvalid ? { bindingInvalid: { ...chosen.bindingInvalid, effectiveRoute: route } } : {}) }
}
export function routeForBinding(binding, catalog, get) { return resolveBindingModel(binding, catalog, get).route }

export async function preflightModel(role, selector, get, signal) {
  const chosen = resolveRoleModel(role, selector, get)
  const llm = get('llm')
  if (llm && typeof llm.resolveCallConfig === 'function') {
    try { await llm.resolveCallConfig(routeOptions(chosen.route), signal) } catch (error) {
      const others = (role.models || []).map((tier, index) => ({ tier, index }))
        .filter(({ tier, index }) => (tier.label || index + 1) !== chosen.selection)
        .map(({ tier, index }) => `${index + 1}${tier.label ? ` (${tier.label})` : ''}: ${routeText(tier)} — ${tier.use}`)
      throw new Error(`selected model for role "${role.id}" is not usable: ${routeText(chosen.route)}: ${String(error && error.message || error)}. No automatic switching. ${others.length ? 'Other tiers (choose explicitly): ' + others.join(' | ') : 'No other models configured; stop and report to the user.'}`)
    }
  }
  return chosen
}
