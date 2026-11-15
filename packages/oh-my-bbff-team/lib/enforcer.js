// Oh-My-BBFF Team — per-agent installation: doctrine section, role scope, route.
//
// Policy is installed when an Agent is created or resumed (agent/created), when its binding or
// role changes (assign, formation, configuration commit) and re-verified by one global variable
// provider at every native assembly. Live-Agent identity owns scoped doctrine, visibility and
// permission/skill guards; a binding/role revision change rebuilds them. Missing guards block.
// The binding/catalog is the member model authority: the route is recorded for this Agent only
// through the public agent.model.select() before step preparation (DSH >= 0.2.2 fixes the route
// before prompt assembly; agent/request may not change it). The DSH global default is never saved.
// Foreign sessions (dsh-superagent router/worker) are never touched.

import { DELEGATION_TOOLS } from './catalog.js'
import { FAMILY_SERVICE } from './bbff-contract.js'
import { TEAM_ROOT_ONLY_TOOLS } from './tool-contract.js'
import { roleToolDenied, delegationControls, mcpAttribution, serverDenied } from './role-permissions.js'
import { classify, teamEnabled } from './classify.js'
// Native list_agents (dsh-tool-subagent-control; SDK NATIVE_TOOL_EFFECTS row) is replaced by bbff_team_roster in Team trees.
export const LIST_AGENTS_TOOL = 'list_agents'
export const LIST_AGENTS_DENIAL = 'Native list_agents is disabled in Oh-My-BBFF Team trees: it reads the whole session log of every agent on each call. Use bbff_team_roster for every agent name or path, status, description, role, model and dispatcher (it answers from the Team ledger). send_message and wait_agent work as usual.'
import { childDoctrine, leaderDoctrine, memberDoctrine, orchestratorDoctrine } from './doctrine.js'
import { effectiveRootMode } from './session-modes.js'
import { routeForBinding, resolveBindingModel, routeOptions } from './models.js'
import { routeText } from './catalog.js'
import { normalizeTeamSettings, teamDepthCapacity } from './team-settings.js'
import { createHash } from 'node:crypto'
import { createTree } from './tree.js'
import { SKILL_NAME_PATTERN, skillNameArgument, resourceServerArgument, isMcpResourceTool, unknownRestrictionNames, promptSectionConvention, orchestratorServiceName } from './dsh-adapter.js'

export const SECTION_NAME = 'team:doctrine'
export const HIDE_PROVIDER = 'bbff-team-hide'
const SKILL_NAME_RE = SKILL_NAME_PATTERN
const CONFIG_TOOLS = new Set(TEAM_ROOT_ONLY_TOOLS)

export function mcpServerOf(name, family) {
  return mcpAttribution(String(name || ''), family).server || null
}
export function deniedDelegationTools(role) { return delegationControls(role) }

/**
 * Decide whether `toolName` is denied for `role`. Pure; used by the guard and
 * to compute the visibility restriction.
 */
export function toolDenied(role, toolName, context) {
  return roleToolDenied(role, toolName, context)
}

export function skillDenied(role, skillName) {
  if (!role) return null
  const skills = role.skills || {}
  const name = String(skillName || '')
  if (Array.isArray(skills.deny) && skills.deny.includes(name)) return `role "${role.id}" may not load skill ${name}`
  if (Array.isArray(skills.allow) && !skills.allow.includes(name)) return `role "${role.id}" may not load skill ${name}`
  return null
}

/** Native ModelSelection equality; an absent effort is its own value (adapter default). */
export function sameSelection(left, right) {
  return !!left && !!right && left.provider === right.provider && left.model === right.model && (left.reasoningEffort || undefined) === (right.reasoningEffort || undefined)
}

export function createEnforcer(ctx, { getCatalog, bindings, logger, sessionModes, getTeamSettings = () => ({}), getFormationState = () => ({}), getContextFacts = () => null, onBindingInvalid = () => {}, tree = null }) {
  const apps = new Map()
  // Routes Team itself selected for each live Agent instance. Keyed by the Agent (not the policy
  // record) so they survive a policy reinstall; bounded; released with the Agent.
  const selectedRoutes = new WeakMap(), ROUTE_HISTORY = 4
  const rememberRoute = (agent, selection) => {
    const list = (selectedRoutes.get(agent) || []).filter(entry => !sameSelection(entry, selection))
    list.push({ provider: selection.provider, model: selection.model, ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}) })
    selectedRoutes.set(agent, list.slice(-ROUTE_HISTORY))
  }
  const teamSelected = (agent, selection) => (selectedRoutes.get(agent) || []).some(entry => sameSelection(entry, selection))
  let anchorDispose = null, anchorError = null
  const get = (name) => { try { return ctx.get(name) } catch { return undefined } }
  const nativeTree = tree || createTree(get, { bindings })
  const settings = () => normalizeTeamSettings(getTeamSettings())
  function agentService(agent, name, mutation) {
    const own = agent?.ctx
    if (!own) return undefined
    // Operational receiver is the Agent's loop realm. serviceFor is an alternate composition, not a fallback.
    const service = own.get?.(name)
    if (!service || !mutation) return service
    if (typeof service[mutation] !== 'function') return undefined
    if (typeof own.reflect?.trace !== 'function') throw new Error('Agent-own tracing is unavailable for ' + name + '.' + mutation)
    return own.reflect.trace(service)
  }
  const permissionDecision = (role, name, record) => {
    const diagnostics = []
    const family = get(FAMILY_SERVICE)
    const reason = toolDenied(role, name, { family: family?.contract === 1 ? family : undefined, settings: settings(), onDiagnostic: value => diagnostics.push(value) })
    if (record) {
      record.permissionDiagnostics ||= {}
      if (diagnostics.length) record.permissionDiagnostics[name] = diagnostics
      else delete record.permissionDiagnostics[name]
    }
    return reason
  }
  const warn = (message, error) => {
    try { logger?.warn?.(`oh-my-bbff-team: ${message}${error ? ` (${String(error && error.message ? error.message : error)})` : ''}`) } catch {}
  }

  // Bindings are written under the reserved child id before the child exists, so a lookup is enough.
  function bindingFor(agent) { return bindings.get(agent.id) }
  function classifyBound(agent) {
    const cls=classify(agent,get,settings()),binding=bindings.get(agent.id)
    if(cls.position==='child'&&binding?.kind==='member'&&cls.parentId===String(binding.ownerId||binding.leadId||''))return{...cls,position:'member',membership:{role:'teammate',name:binding.name||binding.seat||agent.id,root:get('agents')?.get?.(cls.parentId)},reason:'Durable Team binding and corroborated native parent'}
    return cls
  }

  /** Stable doctrine input: the Lead's role-bound members only (assignments, never live state). */
  function rosterFor(leadAgent) {
    try {
      return nativeTree.membersOf(leadAgent)
        .filter((member) => member.role !== 'lead' && bindings.get(String(member.id))?.kind === 'member')
        .map((member) => {
          const binding = bindings.get(String(member.id))
          let route = null
          try { route = routeForBinding(binding, getCatalog(leadAgent), get) } catch {}
          // Doctrine consumes stable assignments only. Do not read pressure or
          // copy busy/idle state into the system-prompt input.
          return { name: String(member.name), ...(member.nameSource && member.nameSource !== 'native' ? { address: String(member.address) } : {}), role: binding.role, model: binding?.model ?? null, route, function: binding?.function || String(member.description || ''), assist: binding?.assist || null }
        })
    } catch {
      return []
    }
  }

  /** Doctrine text for this agent right now (mode can change while it lives). */
  function doctrineFor(agent) {
    if (apps.get(agent)?.suspended) return ''
    const catalog = getCatalog(agent)
    const currentSettings = settings()
    const cls = classifyBound(agent)
    if (cls.position === 'foreign') return ''
    if (['lead','solo-root'].includes(cls.position) && sessionModes?.diagnostics?.().failedLoad) return ''
    const binding = bindings.get(agent.id)
    const role = binding ? catalog.byId.get(binding.role) : null
    const depth = teamDepthCapacity(get, currentSettings)
    // The root's native name, read live from the subagent service (never assumed).
    const lead = nativeTree.leadOf(agent), leadNative = lead ? nativeTree.nameOf(lead) : null
    const renderSettings = { ...currentSettings, ...(leadNative ? { leadName: JSON.stringify(leadNative) } : {}), configuredDepth: depth.configuredDepth, nativeDepth: depth.nativeDepth ?? 'unavailable', maxDepth: depth.effectiveDepth ?? 'unavailable',
      delegationBlocked: cls.depth === null || depth.effectiveDepth === null || cls.depth + 1 > depth.effectiveDepth,
      delegationReason: cls.depth === null ? 'Current native depth is unavailable' : depth.effectiveDepth === null ? depth.depthReason : 'Next depth ' + (cls.depth + 1) + (cls.depth + 1 > depth.effectiveDepth ? ' exceeds effective limit ' : ' is within effective limit ') + depth.effectiveDepth }
    // A session whose owner restricted bbff_team_dispatch away (a resident with a
    // fixed tool set, or the user's exposure toggle) gets no dispatch doctrine.
    if ((cls.position === 'solo-root' || cls.position === 'lead') && !toolVisible(agent, 'bbff_team_dispatch')) return ''
    if (cls.position === 'solo-root' || cls.position === 'lead') {
      const stored = sessionModes ? sessionModes.get(agent.id) : 'auto'
      const effective = effectiveRootMode(stored, cls.position === 'lead')
      if (effective === 'off') return ''
      if (effective === 'orchestrator') return orchestratorDoctrine(catalog, { teamAvailable: cls.position === 'lead', settings: renderSettings })
      const formationState = getFormationState(agent)
      return leaderDoctrine(catalog, { roster: rosterFor(agent), settings: renderSettings, activeFormation: formationState.activeFormation, formation: formationState.formations?.find(item => item.id === formationState.activeFormation && Array.isArray(item.seats) && !item.diagnostics?.length) })
    }
    switch (cls.position) {
      case 'foreign': return ''
      case 'member': {
        const root = cls.membership?.root
        const roster = root ? rosterFor(root) : []
        return memberDoctrine(role, catalog, { settings: renderSettings, seat: binding?.seat || cls.membership?.name, function: binding?.function || (root ? nativeTree.childrenOf(root).find(member => member.id === String(agent.id))?.description : '') || '', formation: binding?.formation || null, assist: binding?.assist || null, helpers: roster.filter((entry) => entry.assist === cls.membership?.name).map((entry) => entry.name) })
      }
      case 'child': return role ? childDoctrine(role, catalog, { settings: renderSettings }) : ''
      default: return ''
    }
  }

  function toolVisible(agent, name) {
    const tools = agentService(agent, 'tools')
    if (!tools || typeof tools.get !== 'function') return true
    try { return tools.get(name, agent) !== undefined } catch { return true }
  }

  function visibleToolNames(agent) {
    const tools = agentService(agent, 'tools')
    if (!tools || typeof tools.schemas !== 'function') return []
    try { return tools.schemas(agent).map((schema) => schema.name) } catch { return [] }
  }

  function restrictVisibility(agent, role, record) {
    const scoped = agentService(agent, 'tools', 'restrict')
    if (!scoped) return
    let names = visibleToolNames(agent).filter((name) => permissionDecision(role, name, record) !== null)
    for (let attempt = 0; attempt < 6 && names.length > 0; attempt += 1) {
      try {
        record.disposers.push(scoped.restrict({ deny: names }))
        record.restricted = names
        return
      } catch (error) {
        const message = String(error && error.message ? error.message : error)
        const parsed = unknownRestrictionNames(message)
        record.restrictionDiagnostics = parsed.diagnostics
        const drop = names.filter(name => parsed.value?.includes(name))
        if (drop.length === 0) { warn('tools.restrict failed', error); return }
        names = names.filter((name) => !drop.includes(name))
      }
    }
  }

  /**
   * Native list_agents reads every agent's whole session log on each call. In a tree with Agent
   * Teams on, Team denies it for every agent (Lead, core and outsourced) and points to
   * bbff_team_roster, which answers from the Team ledger. Decided at call time, so turning Agent
   * Teams off restores it without a reload. send_message and wait_agent stay untouched.
   */
  function installListAgentsGuard(agent, record) {
    const scoped = agentService(agent, 'tools', 'guard')
    if (!scoped) return
    const dispose = scoped.guard((execution) => {
      if (execution?.name !== LIST_AGENTS_TOOL) return undefined
      const lead = nativeTree.leadOf(agent)
      return lead && teamEnabled(lead, get).enabled === true ? LIST_AGENTS_DENIAL : undefined
    })
    if (typeof dispose === 'function') record.disposers.push(dispose)
    record.listAgentsGuard = typeof dispose === 'function'
  }
  function installGuard(agent, role, record) {
    const scoped = agentService(agent, 'tools', 'guard')
    if (!scoped) return
    const guardDispose=scoped.guard((execution) => {
      const currentSettings = settings()
      const position = classify(agent, get, currentSettings).position
      if(position==='foreign')return undefined
      if(position==='unknown')return bindings.get(agent.id) ? 'Team cannot corroborate the bound role identity; request/tool execution is blocked' : undefined
      const name = execution && execution.name
      if (CONFIG_TOOLS.has(name)) return 'Team configuration tools are root-session only'
      // Position policy is independent of catalog validity or role binding. Even
      // an unbound/unknown-role teammate must not escape through native tools.
      if ((position === 'member' || position === 'child') && currentSettings.nestingMode === 'helpers' && DELEGATION_TOOLS.includes(name)) return 'helpers mode: members may not delegate; ask the Team Lead for an assigned helper'
      const args = execution.arguments && typeof execution.arguments === 'object' ? execution.arguments : {}
      const skill = skillNameArgument(name, args)
      if (skill) { const reason = skillDenied(role, skill); if (reason) return reason }
      if (isMcpResourceTool(name) && role && (Array.isArray(role.mcp?.allow) || role.mcp?.deny?.length)) {
        const server = resourceServerArgument(name, args)
        if (!server) return 'This role must specify a permitted MCP server for a resource request'
        const reason = serverDenied(role, server)
        if (reason) return reason
      }
      return permissionDecision(role, name, record) || undefined
    })
    if(typeof guardDispose!=='function')throw new Error('Native role guard registration did not return an owned disposer')
    record.disposers.push(guardDispose)
    record.guardInstalled = true
  }

  /**
   * Register the role's skill mask synchronously, then resolve which denied names are installed.
   *
   * A registration is a skill-registry revision change, and the native catalog publisher abandons
   * a snapshot whose collect observes two revision changes (`dsh-skill` collect() retries once).
   * Registering from an awaited path started inside assembly therefore raced the first-request
   * catalog: the registration landed while the publisher was collecting, so the child received no
   * catalog at all. Registering here (no await before it) moves the only Team-owned revision change
   * before any catalog snapshot; the install-time scan is settled by the assembly hook below, also
   * before the publisher runs. `list()` reads the resolved mask, so a denied name that is not
   * installed never becomes a synthesized catalog row.
   */
  function installSkillMask(agent, role, record) {
    const skills = role.skills || {}
    const deny = Array.isArray(skills.deny) ? skills.deny : []
    const allow = Array.isArray(skills.allow) ? skills.allow : null
    if (!allow && deny.length === 0) return
    const source = agentService(agent, 'skills')
    const scoped = agentService(agent, 'skills', 'registerProvider')
    if (!scoped || typeof source?.list !== 'function') return
    let control
    try {
      record.disposers.push(scoped.registerProvider((registration) => {
        control = registration
        return {
          name: HIDE_PROVIDER,
          list: async () => ({
            complete: true,
            candidates: [...record.hiddenSkills].map((name) => ({
              name,
              description: `Not available to the ${role.id} role`,
              source: 'runtime',
              provider: HIDE_PROVIDER,
              invocation: { modelInvocable: false, userInvocable: false },
              rank: 0,
              locator: null,
            })),
          }),
          get: async () => undefined,
        }
      }))
    } catch (error) { warn('skills.registerProvider failed', error); return }
    record.skillReady = (async () => {
      const summaries = await source.list({ scope: agent })
      if (apps.get(agent) !== record) return
      const hidden = summaries
        .map((summary) => summary && summary.name)
        .filter((name) => typeof name === 'string' && SKILL_NAME_RE.test(name) && skillDenied(role, name) !== null)
      const previous = record.hiddenSkills
      record.hiddenSkills = hidden
      if (hidden.length === previous.length && hidden.every((name, index) => name === previous[index])) return
      try { control?.invalidate?.() } catch (error) { warn('skills.invalidate failed', error) }
    })().catch((error) => {
      record.skillCatalogError = String(error?.message || error)
      warn('skill masking failed', error)
    })
  }

  /** Wait for the install-time skill scan without letting an aborted assembly hang on it. */
  function settleSkillMask(promise, signal) {
    if (!promise) return Promise.resolve()
    const settle = () => undefined
    if (!signal || typeof signal.addEventListener !== 'function') return promise.then(settle, settle)
    return new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        try { signal.removeEventListener('abort', finish) } catch {}
        resolve()
      }
      if (signal.aborted) { finish(); return }
      signal.addEventListener('abort', finish, { once: true })
      promise.then(finish, finish)
    })
  }

  /** Binding/catalog authority only: native routing refuses independent member/child UI selection. */
  function memberRoute(agent, binding) {
    const current = bindings.get(agent.id) || binding
    const resolved = resolveBindingModel(current, getCatalog(agent), get)
    const record = apps.get(agent)
    if (resolved.bindingInvalid) {
      if (record) record.bindingInvalid = resolved.bindingInvalid
      try { onBindingInvalid(agent, resolved.bindingInvalid) } catch (error) { warn('binding diagnostic failed', error) }
    } else if (record) delete record.bindingInvalid
    return { ...resolved.route, source:'role' }
  }
  /** The bound route as a native ModelSelection. */
  function boundSelection(agent, binding) {
    const options = routeOptions(memberRoute(agent, binding))
    return { provider: options.provider, model: options.model, ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}) }
  }
  // ---- Turn-scoped routes -------------------------------------------------------------------
  // A turn keeps the route of its first step: a provider/model switch inside a turn replays that
  // turn's earlier assistant messages to another provider, which providers may reject (for
  // example a thinking-mode provider requiring its own reasoning content). Turn positions come
  // from the public AgentRegistry.turnBoundaryOf(session); the route a turn runs on is pinned when
  // the assembly anchor admits its step (or, after a reload, read from agent.model.current()).
  // A route change for a member mid-turn is held as pending
  // and selected at the next turn boundary (agent/inbox/claimed of a later turn, before native
  // step preparation captures its route, or agent/status idle).
  const turnPins = new WeakMap(), pendingRoutes = new WeakMap()
  function turnPosition(agent) {
    try {
      const boundary = get('agents')?.turnBoundaryOf?.(agent.session)
      if (!boundary || typeof boundary !== 'object') return null
      const open = boundary.openTurnStartSeq !== null && boundary.openTurnStartSeq !== undefined
      return { open, turn: boundary.lastTurn, stepped: open && boundary.lastStepStartSeq !== null && boundary.lastStepStartSeq !== undefined && boundary.lastStepStartSeq > boundary.openTurnStartSeq }
    } catch { return null }
  }
  // Without a pin (Team reloaded while a turn ran) the Agent's own current selection is the best
  // public evidence of the route its open turn uses.
  function currentRoute(agent) {
    try { const value = agent.model?.current?.(); return value && typeof value.provider === 'string' ? value : null } catch { return null }
  }
  /** The route the agent's open turn is running on, or null when no turn has started a step. */
  function turnRoute(agent) {
    const position = turnPosition(agent)
    if (!position) return null
    if (!position.open) return null
    const pin = turnPins.get(agent)
    if (pin && pin.turn === position.turn) return pin.route
    return position.stepped ? currentRoute(agent) : null
  }
  function pin(agent, selection) {
    const position = turnPosition(agent)
    if (position?.open) turnPins.set(agent, { turn: position.turn, route: { provider: selection.provider, model: selection.model, ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}) } })
  }
  function holdRoute(agent, record, running, target) {
    const position = turnPosition(agent)
    pendingRoutes.set(agent, { from: running, to: target, turn: position?.turn ?? null, at: Date.now() })
    record.pendingRoute = { currentTurn: stepSelectionText(running), nextTurn: stepSelectionText(target), turn: position?.turn ?? null }
    // Keep the running turn's later steps on its own route.
    if (!sameSelection(agent.model.current(), running)) agent.model.select(running)
  }
  /**
   * Record the bound route for this Agent through the public Agent model API. Outside a turn (and
   * before a turn's first step) it takes effect at the next step preparation; during a turn that
   * already ran a step on another route it is held until the next turn boundary. Only this Agent's
   * session receives model/selection events; no global default is written.
   * @returns {{ target, deferred }} the bound route and whether it waits for the next turn.
   */
  function applyRoute(agent, binding, record) {
    try {
      const model = agent.model
      if (typeof model?.select !== 'function' || typeof model?.current !== 'function') throw new Error('the native agent.model selection API is unavailable')
      const target = boundSelection(agent, binding)
      const running = turnRoute(agent)
      let deferred = false, selected = false
      if (running && !sameSelection(running, target) && (teamSelected(agent, running) || sameSelection(running, currentRoute(agent)))) {
        holdRoute(agent, record, running, target)
        deferred = true
      } else {
        selected = !sameSelection(model.current(), target)
        if (selected) model.select(target)
        rememberRoute(agent, target)
        pendingRoutes.delete(agent)
        delete record.pendingRoute
      }
      record.routed = true
      record.lastRoute = { provider: target.provider, model: target.model, effort: target.reasoningEffort || '', source: 'role' }
      record.nativeSelection = { state: deferred ? 'pending-next-turn' : 'ready', source: 'binding', selected }
      delete record.selectionError
      return { target, deferred }
    } catch (error) {
      record.routed = false
      record.selectionError = String(error?.message || error)
      throw new Error('Team enforcement blocked for ' + agent.id + ': ' + record.selectionError)
    }
  }
  /** Turn boundary: select a held route once the turn that held it is over. Never throws. */
  function applyPending(agent) {
    if (!pendingRoutes.has(agent)) return
    const record = apps.get(agent), binding = bindings.get(agent.id)
    if (!record || !binding || !record.role) { pendingRoutes.delete(agent); return }
    try { applyRoute(agent, binding, record) } catch (error) { record.routeError = record.selectionError || String(error?.message || error); warn('held route selection failed', error) }
  }
  function installTurnBoundary(agent, record) {
    if (!agent.ctx || typeof agent.ctx.on !== 'function') return
    // A later turn's claim runs in native step preparation before the step route is captured.
    record.disposers.push(agent.ctx.on('agent/inbox/claimed', ({ turn }) => { const held = pendingRoutes.get(agent); if (held && held.turn !== null && turn > held.turn) applyPending(agent) }))
    record.disposers.push(agent.ctx.on('agent/status', ({ status }) => { if (status === 'idle') applyPending(agent) }))
  }
  /**
   * Verify the route native step preparation fixed before this assembly. The step keeps a route
   * Team selected for this Agent (a binding, catalog or DSH-default change landed after the step
   * captured it): refusing it would drop the inbox input the step already claimed, and the turn
   * then finishes on that route while the new one waits for the next turn. A route Team never
   * selected fails closed.
   */
  function verifyStepRoute(agent, record, stepSelection) {
    const binding = bindings.get(agent.id)
    if (!binding || !record?.role || !stepSelection) return
    const target = boundSelection(agent, binding)
    if (sameSelection(stepSelection, target)) {
      pin(agent, stepSelection)
      applyRoute(agent, binding, record)
      delete record.routeTransition
      return
    }
    if (teamSelected(agent, stepSelection)) {
      pin(agent, stepSelection)
      applyRoute(agent, binding, record)
      record.routeTransition = { step: stepSelectionText(stepSelection), next: stepSelectionText(target), at: Date.now() }
      return
    }
    applyRoute(agent, binding, record)
    record.selectionError = 'This step was prepared on ' + stepSelectionText(stepSelection) + ', a route Team never selected for this agent (role route: ' + stepSelectionText(target) + ')'
    throw new Error('Team enforcement blocked for ' + agent.id + ': ' + record.selectionError + '; the role route is selected for the next step. Team Lead: re-send the message with bbff_team_steer.')
  }
  /** Route state for tools: the bound route and, while held, the route the current turn keeps. */
  function routeStatus(agent) {
    const held = pendingRoutes.get(agent)
    return held ? { deferred: true, currentTurn: stepSelectionText(held.from), nextTurn: stepSelectionText(held.to) } : { deferred: false }
  }  const stepSelectionText = selection => routeText({ provider: selection.provider, model: selection.model, effort: selection.reasoningEffort })

  /** Skill-mask settlement before the native pre-step catalog publisher (no prompt mutation). */
  function installAssemblyBarrier(agent, record) {
    if (!agent.ctx || typeof agent.ctx.on !== 'function') return
    record.disposers.push(agent.ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      const assembled = await next()
      // The install-time skill scan must settle here: assembly completes before the native
      // pre-step catalog publisher snapshots, so its revision change never straddles that collect.
      await settleSkillMask(record.skillReady, context?.signal)
      return assembled
    }, {prepend:true}))
  }
  function suspendRole(agent, record, reason) {
    record.suspended = true
    record.roleResolutionError = reason
    record.doctrineError = reason
    record.doctrineInstalled = false
    const tools = agentService(agent, 'tools', 'guard')
    if (tools) record.disposers.push(tools.guard(() => reason))
    return record
  }
  function installPolicy(agent) {
    if (!agent || apps.has(agent)) return apps.get(agent)
    const record = { disposers: [], position: 'unknown', role: null, restricted: [], hiddenSkills: [], routed: false }
    apps.set(agent, record)
    let cls
    try { cls = classifyBound(agent) } catch (error) { warn('classify failed', error); return record }
    record.position = cls.position
    record.classificationReason = cls.reason
    record.identityDiagnostics = cls.diagnostics
    if (cls.position === 'foreign') {record.yielded=true;record.yieldReason=cls.reason;return record}
    const bindingState = bindings.diagnostics?.()
    const directBinding = bindings.get(agent.id)
    if (bindingState?.failedLoad && ['member','child'].includes(cls.position)) return suspendRole(agent, record, 'Team role binding storage is unreadable: ' + bindingState.loadError)
    if (cls.position === 'unknown') return directBinding ? suspendRole(agent, record, 'A Team role is bound but native identity is uncorroborated: ' + cls.reason) : record
    const binding = ['member','child'].includes(cls.position) ? bindingFor(agent) : null
    const role = binding ? getCatalog(agent).byId.get(binding.role) : null
    if (binding && !role) { record.requestedRole = binding.role; return suspendRole(agent, record, 'Bound Team role is unavailable or invalid: ' + binding.role) }
    const scopedPrompt = agentService(agent, 'systemPrompt', 'section')
    if (scopedPrompt && typeof scopedPrompt.section === 'function') {
      try {
        const convention = promptSectionConvention('team-policy')
        const order = scopedPrompt.getSectionOrder(convention.orderKey)
        if (!Number.isFinite(order)) throw new Error('Native Team prompt order is unavailable; no fallback order is invented')
        record.doctrineOrder = { source: 'DSH adapter prompt-section convention', orderKey: convention.orderKey, nativeOrder: order, teamOffset: 10 }
        record.disposers.push(scopedPrompt.section({
          name: SECTION_NAME,
          order: order + record.doctrineOrder.teamOffset,
          text: () => { try { const text = doctrineFor(agent); delete record.doctrineError; return text } catch (error) { record.doctrineError = String(error?.message || error); warn('doctrine failed', error); return '' } },
        }))
        record.doctrineInstalled = true
      } catch (error) {
        record.doctrineError = String(error?.message || error)
        record.doctrineInstalled = false
        warn('systemPrompt.section failed', error)
      }
    }
    try { installListAgentsGuard(agent, record) } catch (error) { warn('list_agents guard failed', error) }
    if (cls.position !== 'member' && cls.position !== 'child') return record
    try { installGuard(agent, role, record) } catch (error) { record.guardError=String(error?.message||error);warn('guard failed', error) }
    if (!role) {
      const scoped = agentService(agent, 'tools', 'restrict')
      if (scoped) {
        const names = visibleToolNames(agent).filter((name) => CONFIG_TOOLS.has(name))
        if (names.length) record.disposers.push(scoped.restrict({ deny: names }))
      }
      if (binding) warn(`binding for ${agent.id} names unknown role ${binding.role}`)
      return record
    }
    record.role = role.id
    try { restrictVisibility(agent, role, record) } catch (error) { warn('restrict failed', error) }
    try { applyRoute(agent, binding, record) } catch (error) { record.routeError=record.selectionError||String(error?.message||error);warn('route selection failed', error) }
    try { installAssemblyBarrier(agent, record) } catch (error) { warn('assembly barrier failed', error) }
    try { installTurnBoundary(agent, record) } catch (error) { warn('turn boundary hook failed', error) }
    try { installSkillMask(agent, role, record) } catch (error) { record.skillCatalogError=String(error?.message||error);warn('skill masking failed', error) }
    return record
  }

  function dispose(agent) {
    const record = apps.get(agent)
    if (!record) return
    apps.delete(agent)
    for (const disposer of record.disposers.reverse()) {
      try { disposer() } catch {}
    }
  }

  function disposeAll() {
    for (const agent of [...apps.keys()]) dispose(agent)
    anchorDispose?.();anchorDispose=null
  }

  function describe(agent) {
    const record = apps.get(agent)
    if (!record) return null
    const { disposers: _disposers, ...rest } = record
    return rest
  }

  function doctrineStatus(agent) {
    if (!agent) return { active: false, reason: 'The session is not attached; no current doctrine can be confirmed.' }
    const record = apps.get(agent), cls = classifyBound(agent)
    let text = ''
    try { text = doctrineFor(agent) } catch (error) { return { active: false, reason: String(error?.message || error), position: cls.position } }
    let reason
    if(cls.position==='foreign')reason=cls.reason
    else if (!record?.doctrineInstalled) reason = record?.doctrineError || 'The Agent-own system prompt section is unavailable.'
    else if (['lead','solo-root'].includes(cls.position) && sessionModes?.diagnostics?.().failedLoad) reason = 'Session mode storage is unreadable: ' + sessionModes.diagnostics().loadError
    else if (text) reason = 'Nonempty Team doctrine is provided by the registered Agent-own section and current template settings.'
    else if (cls.position === 'foreign' || cls.position === 'unknown') reason = cls.reason
    else if ((cls.position === 'lead' || cls.position === 'solo-root') && !toolVisible(agent, 'bbff_team_dispatch')) reason = 'The dispatch tool is not exposed; dispatch doctrine is not injected.'
    else if ((cls.position === 'lead' || cls.position === 'solo-root') && sessionModes?.get(agent.id) === 'off') reason = 'The session mode is off; no Team doctrine is injected.'
    else reason = 'No applicable role doctrine is currently rendered for this session.'
    return { active: !!record?.doctrineInstalled && !!text, reason, position: cls.position, templateSource: 'settings.doctrineTemplates (shipped templates when not overridden)', order: record?.doctrineOrder || null }
  }

  function revisionFor(agent) {
    const binding = bindings.get(agent.id)
    const { override:_override, ...stableBinding } = binding || {}
    const role = binding ? getCatalog(agent).byId.get(binding.role) : null
    return createHash('sha256').update(JSON.stringify({binding:stableBinding,role,settings:settings()})).digest('hex')
  }
  function assertAttached(agent, record) {
    const binding = bindings.get(agent.id)
    if(record?.yielded && classifyBound(agent).position==='foreign')return record
    if(record?.suspended)throw new Error('Team enforcement blocked for '+agent.id+': '+record.roleResolutionError)
    if (!binding) return record
    const reason = record?.suspended ? record.roleResolutionError : !record?.doctrineInstalled ? record?.doctrineError || 'role doctrine is not registered' : !record.guardInstalled ? record.guardError || 'permission/skill-load guard is not installed' : !record.routed ? 'the role route cannot be selected: ' + (record.selectionError || record.routeError || 'member-local route verification is not installed') : record.role !== binding.role ? 'installed role does not match the binding' : null
    if (reason) {
      if(record)record.enforcementError = reason
      throw new Error('Team enforcement blocked for ' + agent.id + ': ' + reason)
    }
    delete record.enforcementError
    return record
  }
  /** One path for first admission, binding changes and a recreated live Agent. */
  function ensure(agent, { admit = false, strict = false } = {}) {
    if (!agent) return null
    const cls = classifyBound(agent)
    const revision = revisionFor(agent)
    let record = apps.get(agent)
    if (!record || record.revision !== revision || (record.yielded && cls.position !== 'foreign')) {
      if(record)dispose(agent)
      record = installPolicy(agent)
      record.revision = revision
    }
    if (strict) assertAttached(agent,record)
    return record
  }
  /**
   * Runs at every native assembly, after the step's route and tool set were fixed and before
   * section snapshots and the assembly waterfall: refresh a changed binding/role policy, block an
   * unattached bound role, and refuse a step prepared on a route the binding did not select.
   */
  function installAnchor() {
    if(anchorDispose)return true
    try {
      const prompt = get('systemPrompt')
      if(typeof prompt?.variable !== 'function'){anchorError='Host systemPrompt.variable is unavailable';return false}
      anchorDispose = prompt.variable('bbff_team_binding_revision', context => {
        const agent = context.agent
        if(!agent)return ''
        if(context.scope !== agent)throw new Error('Team enforcement requires the native Agent assembly scope')
        context.signal?.throwIfAborted?.()
        const record = ensure(agent,{admit:!!context.signal,strict:!!context.signal})
        if (context.signal && !record?.yielded) verifyStepRoute(agent, record, context.modelSelection)
        return record?.revision || ''
      })
      anchorError=null
      return true
    } catch(error) {anchorError=String(error?.message||error);return false}
  }
  function enforcementStatus(id, agent) {
    if((settings().superagentYield==='all'&&get(orchestratorServiceName())!=null)||(agent&&classifyBound(agent).position==='foreign'))return{state:'yielded',reason:'superagentYield=all; Team is not managing this session'}
    const binding=bindings.get(String(id)),storage=bindings.diagnostics?.()
    if(storage?.failedLoad)return{state:'missing',reason:'Team binding storage is unreadable: '+storage.loadError}
    if(!binding)return{state:'unbound',reason:'No BBFF role is bound; native Team policy applies'}
    if(!agent)return{state:'missing',reason:'Agent is unloaded; binding policy will attach before its next request'}
    const record=apps.get(agent)
    try{assertAttached(agent,record)}catch(error){return{state:'missing',reason:String(error?.message||error)}}
    if(record.selectionError)return{state:'missing',reason:record.selectionError}
    if(record.revision!==revisionFor(agent))return{state:'missing',reason:'Binding or role policy changed; the next assembly must refresh it'}
    return{state:'attached',reason:'Bound role doctrine, permission/skill guards and route verification are installed',role:record.role,nativeSelection:record.nativeSelection||null,...(pendingRoutes.has(agent)?{pendingRoute:routeStatus(agent)}:{})}
  }
  /** Explicit assign uses the same policy path, then records only this member's native intent. */
  function selectionChanged(agent) {
    const record=ensure(agent,{strict:true})
    if(record.yielded)return record
    const binding=bindings.get(agent.id)
    if(binding && record.role)applyRoute(agent,binding,record)
    return record
  }
  /**
   * agent/created (fresh child, cold resume, clear or compaction): attach the bound policy and
   * record the bound route before the first step of the new Agent instance. Never throws into the
   * native serial notification; failures stay on the record and block at the next assembly.
   */
  function onCreated(agent) {
    try { ensure(agent) } catch (error) { warn('policy attach on agent creation failed', error) }
  }
  function install(agent) { return ensure(agent) }
  function reinstall(agent) {
    dispose(agent)
    return ensure(agent)
  }
  installAnchor()

  return { install, ensure, installAnchor, selectionChanged, routeStatus, onCreated, enforcementStatus, reinstall, dispose, disposeAll, describe, doctrineFor, doctrineStatus }
}
