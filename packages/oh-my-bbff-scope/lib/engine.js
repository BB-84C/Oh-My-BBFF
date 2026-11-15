import { msg } from './bbff-contract.js'
import { createCatalog } from './catalog.js'
import { governanceError } from './governance.js'
import { createScopeSettings } from './settings.js'
import { hiddenRules, normalizePath, ruleForTool, annotationsFor, filterAssembly, reasonFor, validateRuleTarget } from './rules.js'
import { SKILL_NAME_PATTERN, reservedTool, mcpSectionName, serverFromMcpSectionName, MCP_RESOURCE_SECTION_NAME, MCP_SECTION_ORDER_KEY, unknownRestrictionNames } from './dsh-adapter.js'

export const HIDE_PROVIDER = 'bbff-scope-hide'
// Public API, not an inferred wire/registry shape: @deepseek-ai/dsh-skill@0.2.1-rc.2
// lib/types/index.d.ts:24 (SkillSource 'runtime'), :36-41 (invocation flags),
// :63-67 (numeric rank; lower wins; opaque provider-owned locator), :159-185 (list/get).
// Rank 0 is Scope's explicit overlay priority, NOT a copied native default. Null
// locator is our own unused handle because a mask never loads a body.
const MASK_CANDIDATE = Object.freeze({ source: 'runtime', rank: 0, locator: null })
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
/** Log-only text for a reason that may be a message ref. */
const reasonText = value => typeof value === 'string' ? value : (value && typeof value.key === 'string' ? value.key : '')
export function makeHidingProvider(names) {
  return { name: HIDE_PROVIDER, list: async () => ({ complete: true, candidates: names.filter(name => SKILL_NAME_PATTERN.test(name)).map(name => ({
    name, description: 'Not available in this workspace (Oh-My-BBFF Scope)', ...MASK_CANDIDATE, provider: HIDE_PROVIDER,
    invocation: { modelInvocable: false, userInvocable: false },
  })) }), get: async () => undefined }
}
export function createScopeEngine(ctx, { store, logger = ctx.logger, moduleId = 'scope' } = {}) {
  const get = key => { try { return ctx.get(key) } catch { return undefined } }
  const warn = text => { try { logger?.warn?.('oh-my-bbff-scope: ' + text) } catch {} }
  const catalog = createCatalog(ctx, { store, warn, moduleId }), settings = createScopeSettings(store.dir)
  const policyFor = (kind, name) => catalog.governance.policy(kind, name)
  const apps = new Map(), ignoredWarnings = new Set()
  let rules = store.read().rules, disposed = false, timer = null, sweeping = false, dirty = false
  const running = new Set()
  const live = () => get('agents')?.list?.() || []
  function unsupported(agent, service, detailRef) {
    const app = apps.get(agent), reason = msg('diagnostic.enforcementUnsupported', { service, detail: detailRef })
    if (app) {
      if (JSON.stringify(app.enforcementDiagnostics.get(service)?.reason) === JSON.stringify(reason)) return
      app.enforcementDiagnostics.set(service, { code: 'unsupported-agent-service', service, reason })
    }
    warn(`[unsupported-agent-service] ${agent?.id || 'unknown Agent'}: ${service}; ${reasonText(detailRef)}`)
  }
  // Native loopCtx and Agent.ctx share the OPERATIONAL service-isolation realm.
  // Never replace that getter with a retained alternate composition serviceFor.
  function operational(agent, key) {
    try {
      const target = agent?.ctx?.get?.(key)
      if (!target) unsupported(agent, key, msg('diagnostic.detail.serviceUnavailable'))
      return target
    } catch (error) { unsupported(agent, key, msg('diagnostic.detail.getterFailed', { message: error.message })) }
  }
  const schemas = agent => {
    try { return operational(agent, 'tools')?.schemas?.(agent) || [] }
    catch (error) { unsupported(agent, 'tools', msg('diagnostic.detail.schemaReadFailed', { message: error.message })); return [] }
  }
  function scoped(agent, key) {
    const target = operational(agent, key)
    if (!target) return undefined
    // Public ReflectService.trace<T>, cordis/lib/types/reflect.d.ts:171–177.
    // All mutators require the receiving Agent wrapper; NO raw fallback.
    if (typeof agent.ctx.reflect?.trace !== 'function') { unsupported(agent, key, msg('diagnostic.detail.tracingUnavailable')); return undefined }
    try {
      const traced = agent.ctx.reflect.trace(target)
      if (!traced) { unsupported(agent, key, msg('diagnostic.detail.tracingNoService')); return undefined }
      apps.get(agent)?.enforcementDiagnostics.delete(key)
      return traced
    } catch (error) { unsupported(agent, key, msg('diagnostic.detail.tracingFailed', { message: error.message })); return undefined }
  }
  const hideAll = cwd => !normalizePath(cwd) && settings.read().unknownCwd === 'hide-all'
  function validateUpsert(rule) {
    if (disposed) { const error = new Error('error.disposed'); error.bbffRef = msg('error.disposed'); throw error }
    catalog.currentSnapshot(); catalog.governance.refresh(); validateRuleTarget(rule, catalog.knownServers())
    const policy = policyFor(rule.kind, rule.name)
    if (!policy.governable) throw governanceError(policy, rule.name)
  }
  store.setRuleValidator(validateUpsert)
  function ruleStatuses(snapshot) {
    if (disposed) return []
    catalog.governance.refresh()
    return rules.map(rule => {
      const policy = policyFor(rule.kind, rule.name)
      let invalid
      try { validateRuleTarget(rule, catalog.knownServers()) } catch (error) { invalid = error }
      const ignored = !policy.governable || !!invalid, warning = !policy.governable ? policy.reason : invalid?.bbffRef
      if (ignored && !ignoredWarnings.has(rule.id)) { ignoredWarnings.add(rule.id); warn(`Ignoring rule ${rule.id}: ${reasonText(warning)}`) }
      const entry = snapshot?.entries.find(entry => entry.kind === rule.kind && entry.name === rule.name)
      return { ...rule, ...(entry ? { status: entry.status, caveats: entry.caveats } : {}), ignored, ...(ignored ? { warning } : {}) }
    })
  }
  async function resolve(agentOrId) {
    const id = typeof agentOrId === 'string' ? agentOrId : agentOrId?.id
    if (disposed) return { rootSessionId: id, cwd: null, resolved: false, reason: msg('error.disposed') }
    const family = get('bbffFamily')
    const agent = typeof agentOrId === 'string' ? get('agents')?.get?.(id) : agentOrId
    const app = apps.get(agent)
    let fresh
    if (family?.contract === 1 && typeof family.resolveRoot === 'function') try {
      fresh = await family.resolveRoot(id)
      if (fresh.resolved && normalizePath(fresh.cwd)) {
        const at = new Date().toISOString()
        if (app && apps.get(agent) === app && !app.disposed) {
          app.rootCache = { ...fresh }
          app.rootCacheAt = at
        }
        return { ...fresh, rootCached: false, rootResolvedAt: at }
      }
    } catch (error) { warn('Shared ROOT resolution failed: ' + error.message) }
    // Per lead ruling: an unavailable/failing root cannot erase already usable
    // ROOT context. This is per-attached-agent cache use, NEVER another walker.
    if (app?.rootCache && !app.disposed && apps.get(agent) === app) {
      return { ...app.rootCache, rootCached: true, rootResolvedAt: app.rootCacheAt, rootCacheNotice: { reason: msg('diagnostic.rootCached', { at: app.rootCacheAt }) } }
    }
    return { ...(fresh || { rootSessionId: id, cwd: null, resolved: false, reason: msg('reason.rootResolverUnavailable') }), rootCached: false }
  }
  const hiddenFor = cwd => hiddenRules(ruleStatuses().filter(rule => !rule.ignored), cwd)
  function guardReason(app, exec) {
    catalog.governance.refresh()
    if (!policyFor('tool', exec.name).governable) return
    if (app.hideAll) return 'Not available: unknown ROOT cwd; Scope setting unknownCwd=hide-all'
    const rule = ruleForTool(app.hidden.filter(rule => policyFor(rule.kind, rule.name).governable), exec.name, exec.arguments, catalog.attributeTool)
    if (rule) return `Not available in this workspace: ${exec.name}; Scope rule ${rule.id} (${rule.name} → ${rule.workspaces.join(', ')})`
  }
  function restrict(agent, app) {
    // Reads here ONLY apply existing restrictions; they never feed a discovery ledger.
    // Operational schemas are already filtered by our prior deny. Retain only
    // this Agent's previously proven targets while they still match a hidden rule;
    // otherwise a second sweep would erase its own deny. This is enforcement state,
    // not another discovery source or a Root-registry fallback.
    const requested = [...new Set([...schemas(agent).map(tool => tool.name), ...(app.requested || [])])]
      .filter(name => !reservedTool(name) && policyFor('tool', name).governable && (app.hideAll || ruleForTool(app.hidden, name, undefined, catalog.attributeTool))).sort()
    if (equal(app.requested, requested) && (app.denyDispose || !requested.length)) return
    app.denyDispose?.(); app.denyDispose = undefined; app.requested = requested
    app.enforcementDiagnostics.delete('tool-visibility')
    let deny = requested.slice()
    while (deny.length) {
      try { app.denyDispose = scoped(agent, 'tools')?.restrict({ deny }); break }
      catch (error) {
        const unknown = catalog.recordAdapter(unknownRestrictionNames(String(error?.message || error)))
        if (!unknown?.length) { unsupported(agent, 'tool-visibility', msg('diagnostic.detail.restrictionFailed', { message: error.message })); app.requested = null; break }
        // Native0.2.2 deliberately exempts the viewing Agent's own registrations.
        // A still-visible rejected name is guard-only, not a successful hide.
        const own = unknown.filter(name => operational(agent, 'tools')?.get?.(name, agent))
        if (own.length) unsupported(agent, 'tool-visibility', msg('diagnostic.detail.agentOwnedVisible', { names: own.join(', ') }))
        const next = deny.filter(name => !unknown.includes(name))
        if (next.length === deny.length) break
        deny = next
      }
    }
  }
  function updateSkills(agent, app) {
    const names = [...new Set([...app.hidden.filter(rule => rule.kind === 'skill').map(rule => rule.name), ...(app.hideAll ? (catalog.cache.read()?.entries || []).filter(entry => entry.kind === 'skill').map(entry => entry.name) : [])])].sort()
    if (equal(app.skillNames, names)) return
    app.skillDispose?.(); app.skillDispose = undefined; app.skillNames = names
    if (names.length) app.skillDispose = scoped(agent, 'skills')?.registerProvider(() => makeHidingProvider(names))
  }
  function shadowSections(agent, app) {
    const servers = [...new Set([...app.hidden.filter(rule => rule.kind === 'mcp').map(rule => rule.name), ...(app.hideAll ? catalog.knownServers().filter(name => policyFor('mcp', name).governable) : [])])].sort()
    if (equal(app.servers, servers)) return
    for (const dispose of app.sectionDisposers) dispose()
    app.sectionDisposers = []; app.servers = servers
    const prompt = scoped(agent, 'systemPrompt')
    if (!prompt) return
    for (const server of servers) try { app.sectionDisposers.push(prompt.section({ name: mcpSectionName(server), order: prompt.getSectionOrder(MCP_SECTION_ORDER_KEY), text: '', interpolate: false })) }
    catch (error) { warn('Section shadow unavailable; assembly filtering remains active: ' + error.message) }
  }
  function enforce(agent, app) {
    app.hidden = hiddenFor(app.cwd); app.hideAll = hideAll(app.cwd)
    restrict(agent, app); updateSkills(agent, app); shadowSections(agent, app)
  }
  async function applyAgent(agent) {
    if (disposed || !agent?.id) return
    let app = apps.get(agent)
    if (!app) {
      app = { hidden: [], hideAll: hideAll(null), requested: null, skillNames: [], servers: [], sectionDisposers: [], enforcementDiagnostics: new Map() }; apps.set(agent, app)
      app.guardDispose = scoped(agent, 'tools')?.guard(exec => guardReason(app, exec))
      try {
        if (typeof agent.ctx?.on !== 'function') unsupported(agent, 'assembly-hook', msg('diagnostic.detail.eventSubscriptionUnavailable'))
        else app.assemblyDispose = agent.ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
          const result = await next()
          // Agent-owned listener + exact native consumer scope. Parent/sibling
          // assemblies never inherit an unrelated Actor's filtering policy.
          if (disposed || app.disposed || apps.get(agent) !== app || context.scope !== agent) return result
          const hidden = app.hidden.filter(rule => policyFor(rule.kind, rule.name).governable)
          return hidden.length || app.hideAll ? filterAssembly(result, hidden, catalog.recordAdapter, app.hideAll, name => policyFor('mcp', name).governable) : result
        })
      } catch (error) { unsupported(agent, 'assembly-hook', msg('diagnostic.detail.eventSubscriptionFailed', { message: error.message })) }
    }
    const root = await resolve(agent)
    if (disposed || app.disposed || apps.get(agent) !== app) return
    if (!normalizePath(root.cwd) && app.unknownPolicy !== settings.read().unknownCwd) { app.unknownPolicy = settings.read().unknownCwd; warn(`unknown ROOT cwd for ${agent.id}; ${app.unknownPolicy === 'open' ? 'fail-open' : 'hide-all'} (Scope setting unknownCwd); ${reasonText(root.reason)}`) }
    app.rootSessionId = root.rootSessionId; app.cwd = root.cwd; app.rootReason = root.reason
    enforce(agent, app)
    return { sessionId: agent.id, ...root, hidden: app.hidden.map(rule => ({ kind: rule.kind, name: rule.name, ruleId: rule.id })) }
  }
  async function refreshAll() {
    if (disposed) return
    const task = (async () => {
      catalog.beginAdapterPass(); catalog.currentSnapshot(); catalog.governance.refresh()
      if (disposed) return
      for (const agent of live()) { if (disposed) return; try { await applyAgent(agent) } catch (error) { warn('Enforcement refresh failed: ' + error.message) } }
      if (disposed) return
      try { await catalog.collect(); if (!disposed) catalog.reportDiagnostics() } catch (error) { warn('Catalog read failed: ' + error.message) }
    })()
    running.add(task)
    try { await task } finally { running.delete(task) }
  }
  function schedule() {
    if (disposed) return
    dirty = true
    if (timer || sweeping) return
    timer = setTimeout(async () => { timer = null; dirty = false; sweeping = true; try { await refreshAll() } finally { sweeping = false; if (dirty) schedule() } }, 40)
    timer.unref?.()
  }
  function disposeAgent(agent) {
    const app = apps.get(agent)
    if (!app) return
    apps.delete(agent); app.disposed = true; app.rootCache = undefined; app.rootCacheAt = undefined
    for (const dispose of [app.guardDispose, app.denyDispose, app.skillDispose, app.assemblyDispose, ...app.sectionDisposers]) try { dispose?.() } catch {}
  }
  async function reload() { if (disposed) return; rules = store.read().rules; await refreshAll() }
  async function annotate(input) {
    if (disposed) return []
    const root = await resolve(input.sessionId || input.rootSessionId)
    if (hideAll(root.cwd)) return (input.items || []).filter(item => policyFor(item.kind, item.name).governable).map(item => ({ kind: item.kind, name: item.name, available: false, by: moduleId,
      reason: msg('reason.hiddenUnknownCwd') }))
    return annotationsFor(hiddenFor(root.cwd), input.items, catalog.attributeTool).filter(item => policyFor(item.kind, item.name).governable).map(item => ({ ...item, by: moduleId }))
  }
  function requiredWarnings(candidateRules, cwd) {
    if (disposed) return []
    catalog.governance.refresh()
    const hidden = cwd === undefined ? candidateRules.filter(rule => rule.workspaces.length) : hiddenRules(candidateRules, cwd)
    return catalog.governance.info().modules.flatMap(module => (module.requiredTools?.tools || []).flatMap(tool => {
      if (!policyFor('tool', tool).governable) return []
      const rule = ruleForTool(hidden, tool, undefined, catalog.attributeTool)
      if (!rule) return []
      return [{ moduleId: module.id, moduleTitle: module.title, tool, ruleId: rule.id,
        reason: msg('reason.requiredToolHidden', { module: module.title, tool, reason: module.requiredTools.reasonLocales || module.requiredTools.reason }) }]
    }))
  }
  async function preview(cwd) {
    if (disposed) { const error = new Error('error.disposed'); error.bbffRef = msg('error.disposed'); throw error }
    if (!normalizePath(cwd)) { const error = new Error('error.previewPath'); error.bbffRef = msg('error.previewPath'); throw error }
    const snapshot = await catalog.newRoot(cwd), actualCwd = snapshot.cwd, hidden = hiddenFor(actualCwd)
    const entries = snapshot.entries.map(entry => {
      const rule = entry.governance.governable ? entry.kind === 'tool' ? ruleForTool(hidden, entry.name, undefined, catalog.attributeTool) : hidden.find(rule => rule.kind === entry.kind && rule.name === entry.name) : undefined
      return { ...entry, workspaceStatus: { hidden: !!rule, governed: entry.governance.governable, ...(rule ? { ruleId: rule.id } : {}), reason: rule ? reasonFor(rule) : entry.governance.reason } }
    })
    const matched = new Set(entries.filter(entry => entry.workspaceStatus.hidden).map(entry => entry.workspaceStatus.ruleId))
    return { ...snapshot, entries, warnings: requiredWarnings(rules, actualCwd), hidden: hidden.filter(rule => matched.has(rule.id)).map(rule => ({ kind: rule.kind, name: rule.name, ruleId: rule.id, reason: reasonFor(rule) })),
      tools: entries.filter(entry => entry.kind === 'tool' && entry.workspaceStatus.hidden).map(entry => entry.name),
      sections: snapshot.sections.filter(name => { const server = catalog.recordAdapter(serverFromMcpSectionName(name)); return server && hidden.some(rule => rule.kind === 'mcp' && rule.name === server) }),
      resources: snapshot.resources.filter(name => hidden.some(rule => rule.kind === 'mcp' && rule.name === name)) }
  }
  async function diagnosticSections(agent) {
    if (disposed) return []
    try {
      // Public native assemble context sets BOTH agent and scope (dsh-agent
      // assembleContextFor, lib/index.js:284–296); receiver stays operational.
      const assembly = await operational(agent, 'systemPrompt')?.assemble?.({ agent, scope: agent })
      return (assembly?.sections || []).filter(section => section.name === MCP_RESOURCE_SECTION_NAME || !!catalog.recordAdapter(serverFromMcpSectionName(section.name))).map(({ name, text }) => ({ name, text }))
    } catch (error) { unsupported(agent, 'systemPrompt', msg('diagnostic.detail.assemblyFailed', { message: error.message })); return [] }
  }
  async function sessionDiagnostics(agent) {
    if (disposed) return { sessionId: agent?.id, rootSessionId: agent?.id, cwd: null, resolved: false, reason: msg('error.disposed'), failOpen: true, hideAll: false, hidden: [], hiddenCount: 0, visibleTools: [], enforcementSupported: true, enforcementDiagnostics: [] }
    const root = await resolve(agent), hidden = hiddenFor(root.cwd), all = hideAll(root.cwd)
    // Report the real consumer view, not a second hypothetical application of
    // rules that would falsely erase unhideable Agent-owned declarations.
    const visibleTools = schemas(agent).map(tool => tool.name)
    const enforcementDiagnostics = [...(apps.get(agent)?.enforcementDiagnostics.values() || [])]
    return { sessionId: agent?.id, ...root, failOpen: !normalizePath(root.cwd) && !all, hideAll: all, hidden, hiddenCount: hidden.length, visibleTools,
      enforcementSupported: enforcementDiagnostics.length === 0, enforcementDiagnostics }
  }
  async function sessions() {
    if (disposed) return []
    const result = []
    for (const agent of live()) { const { visibleTools, hidden, ...summary } = await sessionDiagnostics(agent); result.push(summary) }
    return result
  }
  function install() {
    ctx.on('agent/created', async ({ agent }) => { await applyAgent(agent) }); ctx.on('agent/disposed', ({ agent }) => disposeAgent(agent))
    ctx.on('tools/change', schedule); ctx.on('skills/change', schedule)
    if (typeof ctx.inject === 'function') ctx.inject(['bbffFamily'], scope => {
      const family = scope.get('bbffFamily')
      if (family?.contract !== 1) { schedule(); return }
      const refreshGovernance = () => {
        if (disposed) return
        catalog.currentSnapshot(); catalog.governance.refresh()
        for (const [agent, app] of apps) enforce(agent, app)
        schedule()
      }
      if (typeof family?.subscribe === 'function') scope.effect(() => family.subscribe(refreshGovernance), 'scope:governance-updates')
      if (typeof family?.catalog?.subscribe === 'function') scope.effect(() => family.catalog.subscribe(schedule), 'scope:catalog-updates')
      catalog.governance.refresh(true)
      refreshGovernance()
    })
    ctx.effect(() => disposeAll, 'scope:enforcement'); schedule()
  }
  async function disposeAll() {
    if (disposed) { await Promise.allSettled([...running]); return }
    disposed = true; if (timer) { clearTimeout(timer); timer = null }
    for (const agent of [...apps.keys()]) disposeAgent(agent)
    // A sweep already inside a provider read cannot be cancelled; let its
    // continuations observe `disposed` and finish before the catalog queues close.
    await Promise.allSettled([...running])
    await catalog.dispose()
  }
  return { install, applyAgent, refreshAll, reload, resolve, annotate, inventory: async snapshot => catalog.project(snapshot || await catalog.collect()), catalogState: () => catalog.collect(), ruleStatuses, validateUpsert, requiredWarnings, catalog, settings, preview, sessions, sessionDiagnostics, diagnosticSections, disposeAgent, disposeAll, apps,
    isMcpSection: name => name === MCP_RESOURCE_SECTION_NAME || !!catalog.recordAdapter(serverFromMcpSectionName(name)) }
}
