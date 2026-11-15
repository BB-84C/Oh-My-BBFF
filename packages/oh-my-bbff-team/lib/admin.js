// Oh-My-BBFF Team — settings/admin actions behind /oh-my-bbff-team/api.
//
// Writes go ONLY to the global overlay `$DSH_HOME/oh-my-bbff-team/roles.json`
// (the workspace overlay is the user's own file). Every write is composed in
// memory, validated together with the seeds and the current workspace overlay,
// preflighted against the LLM registry, and only then written atomically.

import { existsSync, readFileSync } from 'node:fs'
import { createConfigStore } from './config-store.js'
import { SEED_ROLES, buildCatalog, catalogPaths, readOverlayFile, routeText } from './catalog.js'
import { readTeamSettings } from './team-settings.js'

function cleanRoute(route) {
  if (!route || typeof route !== 'object') return null
  const provider = String(route.provider || '').trim()
  const model = String(route.model || '').trim()
  if (!provider || !model) return null
  const effort = route.effort ? String(route.effort).trim() : ''
  return { provider, model, ...(effort ? { effort } : {}) }
}

function readGlobalFile(path) {
  if (!path || !existsSync(path)) return { roles: [], remove: [] }
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  return {
    ...parsed,
    roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    remove: Array.isArray(parsed.remove) ? parsed.remove.filter((id) => typeof id === 'string') : [],
  }
}

export function createAdmin(ctx, { home, seeds = SEED_ROLES, configStore }) {
  const store = configStore || createConfigStore(ctx, { home, seeds })
  const metadata = (args, action) => ({source:'settings-ui',sessionId:args.sessionId||'',reason:args.reason||action,userInstruction:args.userInstruction||'',cwd:args.cwd,signal:args.signal})
  const get = (name) => { try { return ctx.get(name) } catch { return undefined } }
  let modelCache = null

  function paths(cwd) {
    return catalogPaths({ home, cwd })
  }

  /** Validate a candidate global overlay with the real seeds + workspace overlay. */
  function compose(candidate, cwd) {
    const errors = []
    const { global, workspace } = paths(cwd)
    const overlays = [{ label: 'global', path: global, roles: candidate.roles, remove: candidate.remove }]
    const ws = readOverlayFile(workspace, errors)
    if (ws) overlays.push({ ...ws, label: 'workspace' })
    return buildCatalog(seeds, overlays, errors)
  }

  async function preflight(routes, signal) {
    const llm = get('llm')
    if (!llm || typeof llm.resolveCallConfig !== 'function') return []
    const problems = []
    for (const route of routes) {
      try {
        await llm.resolveCallConfig({ provider: route.provider, model: route.model, ...(route.effort ? { reasoningEffort: route.effort } : {}) }, signal)
      } catch (error) {
        problems.push(`${routeText(route)}: ${String(error && error.message ? error.message : error).slice(0, 200)}`)
      }
    }
    return problems
  }

  async function models() {
    if (modelCache && Date.now() - modelCache.at < readTeamSettings({ home }).modelCacheMs) return modelCache.value
    const llm = get('llm')
    if (!llm || typeof llm.listProviders !== 'function') return []
    const providers = []
    for (const provider of llm.listProviders()) {
      let list = []
      try { list = await llm.listModels(provider.id) } catch { list = [] }
      providers.push({
        id: String(provider.id),
        name: String(provider.name || provider.id),
        models: (list || []).map((model) => ({ id: String(model.id), name: String(model.name || model.id) })),
      })
    }
    modelCache = { at: Date.now(), value: providers }
    return providers
  }

  async function efforts(provider, model) {
    const llm = get('llm')
    if (!llm || typeof llm.resolveModelInfo !== 'function') return { efforts: [], defaultEffort: null }
    const info = await llm.resolveModelInfo(String(provider), String(model))
    const reasoning = info && info.reasoning
    return {
      efforts: reasoning && Array.isArray(reasoning.efforts) ? reasoning.efforts.map((effort) => ({ id: String(effort.id), name: String(effort.name || effort.id) })) : [],
      defaultEffort: reasoning && reasoning.defaultEffort ? String(reasoning.defaultEffort) : null,
    }
  }

  /** Save explicit model tiers; legacy settings clients may still submit route/fallback. */
  async function saveRoute(args) {
    const { id, route, fallback, models: modelList, cwd, signal } = args
    const { global } = paths(cwd)
    if (!global) throw new Error('no DSH home; cannot write the global role file')
    let tiers = modelList
    if (tiers === undefined) {
      const primary = route === null ? null : cleanRoute(route)
      if (route !== null && !primary) throw new Error('route needs provider and model (or null for the DSH default)')
      const chain = Array.isArray(fallback) ? fallback.map(cleanRoute) : []
      if (chain.some((entry) => entry === null)) throw new Error('every fallback entry needs provider and model')
      tiers = [primary, ...chain].filter(Boolean).map((item, index) => ({ ...item, use: index === 0 ? 'Preferred model' : 'Explicit alternative; select only when appropriate' }))
    }
    if (!Array.isArray(tiers)) throw new Error('models must be an array')

    // Semantic patches compose over the state observed by stage, never over a
    // whole-file candidate captured before the asynchronous model preflight.
    const beforeModels = store.read({cwd}).catalog.roles.find(role=>role.id===id)?.models
    const applyRequestedModels = async () => {
      const staged = await store.stage({op:'patch-role',id,role:{models:tiers}},metadata(args,'save-role'))
      try { return await store.commit(staged.id) }
      catch (error) { try { store.discard(staged.id) } catch {} throw error }
    }
    let committed
    try { committed = await applyRequestedModels() }
    catch (error) {
      const current = store.read({cwd}).catalog.roles.find(role=>role.id===id)
      if (!/^configuration changed (since stage|during preflight)/.test(String(error?.message || error)) || !current || JSON.stringify(current.models) !== JSON.stringify(beforeModels)) throw error
      // Legacy no-review adapter may rebase one semantic models-only patch, never a changed target field.
      committed = await applyRequestedModels()
    }
    const role = store.read({cwd}).catalog.roles.find(role=>role.id===id)
    return { ...(role || {id}), current: !!role, availabilityWarnings: committed.warnings || [] }
  }

  /** UI convenience operations use the same stage/commit/history as model tools. */
  async function resetRoute(args) {
    const staged=await store.stage({op:'reset-role-models',id:args.id},metadata(args,'reset-role'))
    await store.commit(staged.id)
    const role=store.read({cwd:args.cwd}).catalog.roles.find(role=>role.id===args.id)||null
    return {changed:staged.summary.length>0,role}
  }
  async function setRemoved(args) {
    try {
      const staged=await store.stage({op:args.removed?'remove-role':'restore-role',id:args.id},metadata(args,args.removed?'remove-role':'restore-role'))
      await store.commit(staged.id)
      return {removed:!!args.removed,roles:store.read({cwd:args.cwd}).catalog.roles.length}
    } catch(error) {
      if(args.removed && String(error.message).includes(`unknown role "${args.id}"`))throw new Error(`other roles delegate to "${args.id}": ${error.message}`)
      throw error
    }
  }
  return { models, efforts, saveRoute, resetRoute, setRemoved, compose, paths, preflight }
}
