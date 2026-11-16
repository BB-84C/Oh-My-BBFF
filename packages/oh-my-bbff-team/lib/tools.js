// Oh-My-BBFF Team — model-facing tools.
//
//   bbff_team_roles     read the effective role catalog (routing table, permissions)
//   bbff_team_dispatch  start a one-shot, role-bound child (non-blocking; result is
//                  delivered to the caller like a native subagent)
//   bbff_team_hire      hire a durable, role-bound Team member (Team Lead only)
//   bbff_team_roster    Team roster with roles, routes and live status, plus reuse hints
//
// Nesting is only possible through bbff_team_dispatch, which enforces the caller's
// role delegation policy and the absolute depth cap (MAX_DEPTH). The native
// `subagent` tool keeps DSH's own depth setting (default 1).

import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { roleTitle, routeText } from './catalog.js'
import { classify, assertPosition, positionRefusal } from './classify.js'
import { preflightModel, routeOptions, bindingRouteFields, routeForBinding, sameModelIdentity } from './models.js'
import { normalizeTeamSettings, teamCapacity, teamDepthCapacity, DEFAULT_TEAM_SETTINGS } from './team-settings.js'
import { nativeSubagentProvider } from './dsh-adapter.js'
import { createTeamOps } from './team-ops.js'
import { createFormationManager, nextSeatName } from './formations.js'
import { createTree } from './tree.js'

export const MAX_DEPTH = DEFAULT_TEAM_SETTINGS.maxDepth
import { MEMBER_NAME_RE } from './member-names.js'
import { teamPresetCheck, PRESET_RESULT_PROPERTIES, withPresetWarning } from './preset-requirement.js'
import { modelTierGuidance, modelRoleTitle } from './doctrine.js'
import { REPORT_PLACEHOLDER } from './report-checkpoints.js'
import { isMessageRef } from './bbff-contract.js'

function text(value) {
  return [{ type: 'text', text: value }]
}
// Only normalized framework facts cross this English projection. Never pass
// member report text, raw activity events, user formations or config snapshots here.
function contextForModel(value) {
  if(Array.isArray(value))return value.map(contextForModel)
  if(!value||typeof value!=='object')return value
  // A locale message reference (UI text) becomes its key for the model; the text is in Settings.
  if(isMessageRef(value))return value.key
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,contextForModel(item)]))
}
function compactionForModel(value) {
  return value&&typeof value==='object'?{...value,...(value.before?{before:contextForModel(value.before)}:{}),...(value.after?{after:contextForModel(value.after)}:{})}:value
}
function rosterForModel(value) {
  return {...value,members:(value.members||[]).map(member=>({...member,...(member.context?{context:contextForModel(member.context)}:{}),...(member.reportPlaceholder!==undefined?{reportPlaceholder:REPORT_PLACEHOLDER.model}:{}),...(member.compactPending?{compactPending:compactionForModel(member.compactPending)}:{}),...(member.lastCompaction?{lastCompaction:compactionForModel(member.lastCompaction)}:{})}))}
}
function formationForModel(value) {
  return Array.isArray(value?.roles)?{...value,roles:value.roles.map(role=>({...role,title:modelRoleTitle(role),models:(role.models||[]).map(tier=>({...tier,use:modelTierGuidance(tier.use)}))}))}:value
}

export function createTeamTools(ctx, { getCatalog, bindings, enforcer, logger, sessionModes, getTeamSettings = () => ({}), pendingFile = null, formationsFile = null, reportFile = null, reportImportFile = null, sessionRoot = null, memberFactsFile = null, tree = null }) {
  const get = (name) => { try { return ctx.get(name) } catch { return undefined } }
  const settings = () => normalizeTeamSettings(getTeamSettings())
  const nativeTree = tree || createTree(get, { bindings })
  const ops = createTeamOps(ctx, { getCatalog, bindings, getTeamSettings: settings, getEnforcementStatus:(id,agent)=>enforcer?.enforcementStatus?.(id,agent) || {state:'missing',reason:'Team policy observer is unavailable'}, pendingFile, reportFile, reportImportFile, sessionRoot, memberFactsFile, tree: nativeTree })
  const formations = createFormationManager(ctx, { path: formationsFile, bindings, getCatalog, getTeamSettings: settings, enforcer, ops, sessionModes, tree: nativeTree })
  const active = new Map()
  // Serialize our admission checks with the complete start; this queue protects the BBFF
  // soft/helper caps and seat naming against parallel hires by the same Lead.
  const hires = new Map()
  async function serializeHire(id, task) {
    const previous = hires.get(id) || Promise.resolve()
    let release
    const current = new Promise((resolve) => { release = resolve })
    hires.set(id, current)
    await previous.catch(() => {})
    try { return await task() } finally { release(); if (hires.get(id) === current) hires.delete(id) }
  }

  async function resolveRoute(role, signal, selector) {
    return preflightModel(role, selector, get, signal)
  }

  function callerRole(caller, catalog) {
    const binding = bindings.get(caller.id)
    return binding ? catalog.byId.get(binding.role) || null : null
  }

  function assertMayDispatch(caller, target, catalog) {
    bindings.assertReadable?.()
    const cls = classify(caller, get, settings())
    if (cls.position === 'foreign') throw new Error('bbff_team_dispatch is not available in sessions owned by another orchestration plugin')
    if (cls.position === 'unknown' || cls.depth === null) throw new Error('Cannot authorize dispatch with uncorroborated native identity/depth: ' + cls.reason)
    const depth = teamDepthCapacity(get, settings())
    if (depth.effectiveDepth === null) throw new Error('Cannot validate Team delegation depth: ' + depth.depthReason)
    if (cls.depth + 1 > depth.effectiveDepth) throw new Error(`delegation depth ${cls.depth + 1} exceeds the team limit ${depth.effectiveDepth} (configured ${depth.configuredDepth}, native ${depth.nativeDepth}); do this work yourself or report back to your caller`)
    if (cls.position === 'solo-root' || cls.position === 'lead') return { ...cls, maxDepth: depth.effectiveDepth }
    if (settings().nestingMode === 'helpers') throw new Error('helpers mode: members may not dispatch children; ask the Team Lead for a helper via bbff_team_hire(..., assist: your member name)')
    const own = callerRole(caller, catalog)
    if (!own) throw new Error('only role-bound members and children may dispatch; you were started without a team role')
    const policy = own.delegation || { mode: 'none' }
    if (policy.mode === 'none') throw new Error(`role "${own.id}" may not delegate`)
    if (policy.mode === 'oneshot' && Array.isArray(policy.roles) && policy.roles.length && !policy.roles.includes(target.id)) {
      throw new Error(`role "${own.id}" may only dispatch: ${policy.roles.join(', ')}`)
    }
    return { ...cls, maxDepth: depth.effectiveDepth }
  }

  const teamRoles = defineTool({
    name: 'bbff_team_roles',
    description: 'Read the Oh-My-BBFF Team role catalog: each role leaderBrief (summary, when to use, when not to deliver, deliverable, boundaries), kind (oneshot/member/both), model route, permissions and delegation policy. Pass a role id for its full record, including the identityPrompt that only the role itself receives.',
    parameters: {
      role: { type: 'string', description: 'Optional role id to show in full.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const catalog = getCatalog(exec.agent)
      if (args.role) {
        const role = catalog.byId.get(String(args.role))
        if (!role) throw new Error(`unknown role "${args.role}"; known: ${catalog.roles.map((r) => r.id).join(', ')}`)
        return JSON.stringify({ role, errors: catalog.errors, sources: catalog.sources }, null, 2)
      }
      return JSON.stringify({
        roles: catalog.roles.map(({ prompt: _prompt, identityPrompt: _identityPrompt, source: _source, defaults: _defaults, fieldSources: _fieldSources, ...rest }) => ({...rest,title:modelRoleTitle(rest),models:(rest.models||[]).map(tier=>({...tier,use:modelTierGuidance(tier.use)}))})),
        errors: catalog.errors,
        migrations: catalog.migrations || [],
        retired: catalog.retired || [],
        sources: catalog.sources,
      }, null, 2)
    },
  })

  /** One native activation for both one-shot role children and durable members (flat 0.2.2 spec). */
  /** The native subagent service and its canonical provider, checked before any model preflight. */
  function nativeStarter() {
    const subagents = get('subagents')
    if (!subagents || typeof subagents.startActivation !== 'function') throw new Error('the subagents service is unavailable')
    const providerName = nativeSubagentProvider()
    const provider = subagents.getProvider ? subagents.getProvider(providerName) : undefined
    if (!provider) throw new Error('The canonical native provider is not registered: ' + providerName)
    return { subagents, providerName, provider }
  }
  async function startRoleChild(caller, { route, binding, name, label, prompt, cwd, maxDepth, signal, starter = nativeStarter() }) {
    const { subagents, providerName, provider } = starter
    // The binding exists under the reserved id before the child is created, so agent/created
    // attaches the role policy and route before the child's first step.
    const childId = randomUUID()
    const lift = bindings.protect?.(childId) || (() => {})
    try {
      bindings.set(childId, binding)
      const activation = await subagents.startActivation({
        provider: providerName,
        childId,
        ...(name ? { name } : {}),
        label,
        delivery: 'parent',
        signal,
        prompt: text(String(prompt)),
        parent: caller,
        ...(cwd ? { cwd: String(cwd) } : {}),
        ...(route ? { agentOptions: routeOptions(route) } : {}),
        ...(provider.capabilities?.depthLimit && Number.isSafeInteger(maxDepth) ? { maxDepth } : {}),
      })
      return { activation, childId: String(activation.childId || childId), name: String(activation.name || childId) }
    } catch (error) {
      try { bindings.delete(childId) } catch {}
      throw error
    } finally { lift() }
  }

  const teamDispatch = defineTool({
    name: 'bbff_team_dispatch',
    description: 'Outsource a bounded task: start a child bound to a team role. The role decides the child\'s prompt, permission scope and model whitelist; select only a tier label/index exposed by bbff_team_roles. Non-blocking: returns the child\'s native name at once; its result is delivered to you when it finishes, and bbff_team_steer or send_message({agent: name}) reuses it for follow-ups on the same job. Start independent dispatches in one message.',
    parameters: {
      role: { type: 'string', required: true, description: 'Role id from the team routing table (bbff_team_roles).' },
      model: { type: 'string', description: 'Optional model tier label or 1-based index from this role\'s models list. Defaults to its first tier; empty models uses the current DSH default. No arbitrary model ids; no automatic switching.' },
      name: { type: 'string', description: 'Optional native agent name, unique among the agents you started: lower-case letters, digits and hyphens, starting with a letter, at most 32 characters. Omitted names default to agent-1, agent-2, and so on.' },
      description: { type: 'string', required: true, description: 'Short (3-6 word) task label shown in the UI.' },
      prompt: { type: 'string', required: true, description: 'Complete, self-contained brief: objective, inputs, constraints, expected report shape. The child does not see your conversation.' },
      cwd: { type: 'string', description: 'Optional working directory for the child.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, const: 'activation' },
          name: { type: 'string', required: true },
          sessionId: { type: 'string', required: true },
          role: { type: 'string', required: true },
          route: { type: 'string', required: true },
          fallbackUsed: { type: 'boolean', required: true },
          ...PRESET_RESULT_PROPERTIES,
        },
      },
      render: (_args, value) => withPresetWarning(value, `started team child ${value.name} as ${value.role} on ${value.route}${value.fallbackUsed ? ' (fallback route)' : ''}`),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const caller = exec.agent
      if (!caller) throw new Error('bbff_team_dispatch requires a calling agent')
      const catalog = getCatalog(caller)
      const role = catalog.byId.get(String(args.role))
      if (!role) throw new Error(`unknown role "${args.role}"; known: ${catalog.roles.map((r) => r.id).join(', ')}`)
      if (role.kind === 'member') throw new Error(`role "${role.id}" is member-only; hire it with bbff_team_hire or give the task to an existing member`)
      const admission = assertMayDispatch(caller, role, catalog)
      const starter = nativeStarter()
      if (role.concurrency) {
        const running = active.get(role.id) || 0
        if (running >= role.concurrency) throw new Error(`role "${role.id}" allows ${role.concurrency} concurrent initial dispatch(es) and ${running} are pending or unfinished; wait for them to finish`)
      }
      // Reserve before the first await: grouped parallel calls cannot both pass a cap of one.
      active.set(role.id, (active.get(role.id) || 0) + 1)
      let released = false
      const release = () => { if (!released) { released = true; active.set(role.id, Math.max(0, (active.get(role.id) || 1) - 1)) } }
      try {
        const { route } = await resolveRoute(role, exec.signal, args.model)
        const preset = teamPresetCheck(caller, get)
        const started = await startRoleChild(caller, { role, route, binding: { role: role.id, kind: 'oneshot', route, ownerId: caller.id }, name: args.name === undefined ? undefined : String(args.name), label: `[${role.id}] ${String(args.description)}`, prompt: args.prompt, cwd: args.cwd, maxDepth: admission.maxDepth, signal: exec.signal, starter })
        Promise.resolve(started.activation.result).catch(() => {}).finally(release)
        return { kind: 'activation', name: started.name, sessionId: started.childId, role: role.id, route: route ? routeText(route) : 'inherited', fallbackUsed: false, ...preset }
      } catch (error) {
        release()
        throw error
      }
    },
  })
  const teamHire = defineTool({
    name: 'bbff_team_hire',
    description: 'Create a core position: hire a durable Team member for a standing responsibility that needs long-lived context, bound to a team role (Team Lead only; requires Use Agent Teams in this conversation). The member is a named native subagent of the Lead with the role prompt, permission scope and model route, reused heavily for that responsibility: continue it with bbff_team_steer or send_message({agent: name}). Check bbff_team_roster first: reuse an idle member of the same role instead of hiring a duplicate.',
    parameters: {
      role: { type: 'string', required: true, description: 'Member-capable role id (kind member or both).' },
      model: { type: 'string', description: 'Optional tier label or 1-based index within the role models list; omitted = first tier (empty list = DSH default).' },
      name: { type: 'string', description: 'Long-lived function, never a task name; lower-kebab-case, at most 32 characters, unique among your agents. In seat naming mode omit for the next free seat-N.' },
      assist: { type: 'string', description: 'Helpers mode only: existing main teammate name this helper belongs to. One owner per helper; limited by helpersPerMember. Omit for a main member.' },
      description: { type: 'string', required: true, description: 'Standing responsibility of this member (one sentence).' },
      prompt: { type: 'string', required: true, description: 'First assignment or standing brief; the member starts working on it immediately.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          role: { type: 'string', required: true },
          route: { type: 'string', required: true },
          memberId: { type: 'string' },
          ...PRESET_RESULT_PROPERTIES,
        },
      },
      render: (_args, value) => withPresetWarning(value, `hired ${value.name} as ${value.role} on ${value.route}`),
    },
    async execute(args, exec) {
      const caller = exec.agent
      if (!caller) throw new Error('bbff_team_hire requires a calling agent')
      return serializeHire(caller.id, async () => {
      exec.signal?.throwIfAborted?.()
      const cls = classify(caller, get, settings())
      if (cls.position !== 'lead') throw positionRefusal(cls, 'hire members', { alternative: cls.position === 'solo-root' ? 'Without Agent Teams, use bbff_team_dispatch for one-shot role children.' : '' })
      bindings.assertReadable?.()
      sessionModes?.assertReadable?.()
      const mode = sessionModes ? sessionModes.get(caller.id) : 'auto'
      if (mode === 'orchestrator' || mode === 'off') throw new Error(`this session runs in team mode "${mode}"; the user switched hiring off here. Use bbff_team_dispatch, or ask the user to switch the session to leader mode`)
      const catalog = getCatalog(caller)
      const role = catalog.byId.get(String(args.role))
      if (!role) throw new Error(`unknown role "${args.role}"; known: ${catalog.roles.map((r) => r.id).join(', ')}`)
      if (role.kind === 'oneshot') throw new Error(`role "${role.id}" is one-shot only; use bbff_team_dispatch`)
      const currentSettings = settings()
      const members = nativeTree.membersOf(caller).filter((entry) => entry.role !== 'lead')
      // Names in use: every child's native name or Team alias, plus every seat bound to a child.
      const children = nativeTree.childrenOf(caller)
      const taken = new Map(children.map((child) => [child.name, child.name]))
      for (const child of children) { const seat = bindings.get(child.id)?.seat; if (typeof seat === 'string' && !taken.has(seat)) taken.set(seat, child.name) }
      const name = args.name === undefined && currentSettings.memberNaming === 'seat' ? nextSeatName([...taken.keys()].map((value) => ({ name: value }))) : String(args.name ?? '')
      if (!MEMBER_NAME_RE.test(name)) throw new Error('name must be lower-kebab-case (a-z, 0-9, -), starting with a letter; required in function naming mode. The native subagent start validates the final name (length, reserved names, duplicates).')
      if (taken.has(name)) throw new Error(`name "${name}" is already used by team member "${taken.get(name)}" (its native name, Team alias or seat); reuse that member or choose another name`)
      const bound = members.filter((entry) => entry.tier === 'core').length
      const capacity = teamCapacity(get, currentSettings)
      if (capacity.bbffCap !== null && bound >= capacity.bbffCap) throw new Error(`BBFF member cap ${capacity.bbffCap} reached (${bound} core members, including failed). Reuse an existing core member or outsource the task.`)
      const assist = args.assist === undefined ? null : String(args.assist).trim()
      if (args.assist !== undefined) {
        if (!assist) throw new Error('assist must name an existing main member')
        if (currentSettings.nestingMode !== 'helpers') throw new Error('assist is available only in helpers mode')
        const main = members.find((entry) => String(entry.name) === assist)
        if (!main) throw new Error(`helper owner "${assist}" must be an available main teammate`)
        if (bindings.get(String(main.id))?.assist) throw new Error('a helper may not own more helpers; assist must name a main member')
        const count = members.filter((entry) => bindings.get(String(entry.id))?.assist === assist).length
        if (count >= currentSettings.helpersPerMember) throw new Error(`main member "${assist}" already has ${count} helper(s); helpersPerMember is ${currentSettings.helpersPerMember}`)
      }
      const starter = nativeStarter()
      const { route } = await resolveRoute(role, exec.signal, args.model)
      const preset = teamPresetCheck(caller, get)
      const depth = teamDepthCapacity(get, currentSettings)
      const started = await startRoleChild(caller, {
        role, route,
        binding: { role: role.id, kind: 'member', ...bindingRouteFields(role, route), ownerId: caller.id, leadId: caller.id, name, seat: name, function: String(args.description), ...(assist ? { assist } : {}) },
        name, label: `[${role.id}] ${String(args.description).slice(0, 180)}`, prompt: args.prompt, maxDepth: depth.effectiveDepth ?? undefined, signal: exec.signal, starter,
      })
      return { name: started.name, role: role.id, route: route ? routeText(route) : 'inherited', memberId: started.childId, ...preset }
      })
    },
  })

  const teamAssign = defineTool({
    name: 'bbff_team_assign',
    description: 'Promote an EXISTING agent you started to a core member, or rebind a core seat: bind it (by native name) to a member-capable team role (Team Lead only), so it is reused instead of hiring a new one. The role prompt and permission scope apply from its next step. The model tier applies from its next turn: a turn in progress finishes on the model it started with, because providers that replay their own reasoning within a turn reject earlier tool-call steps from another provider (DeepSeek thinking mode fails with "reasoning_content ... must be passed back"). To switch a busy member right away, let its current turn finish (or end it), then send the next task. An unloaded member applies both when it next wakes. Pass role "none" to remove the binding.',
    parameters: {
      name: { type: 'string', required: true, description: 'Existing agent name from bbff_team_roster.' },
      role: { type: 'string', required: true, description: 'Member-capable role id, or "none" to unbind.' },
      function: { type: 'string', description: 'Optional new standing responsibility, not the current task.' },
      model: { type: 'string', description: 'Optional tier label or 1-based index within the role models list; omitted = first tier (empty list = DSH default).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          role: { type: 'string', required: true },
          route: { type: 'string', required: true },
          live: { type: 'boolean', required: true },
          appliesFrom: { type: 'string' },
          currentTurnRoute: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.role === 'none' ? `${value.name} no longer has a team role` : `${value.name} is now ${value.role} on ${value.route}${!value.live ? ' (applies when it next wakes)' : value.currentTurnRoute ? `; the route applies from its next turn; the current turn keeps ${value.currentTurnRoute}` : ' (the route applies from its next turn)'}` }],
    },
    async execute(args, exec) {
      const caller = exec.agent
      if (!caller) throw new Error('bbff_team_assign requires a calling agent')
      assertPosition(caller, get, settings(), 'assign roles')
      const name = String(args.name)
      const member = nativeTree.childrenOf(caller).find((entry) => entry.name === name || entry.id === name)
      if (!member) throw new Error(`no teammate or other agent named "${name}" among the agents you started (bbff_team_roster shows names)`)
      if (member.mode !== 'continuable') throw new Error(`"${name}" has catalog mode ${member.mode}; only continuable agents can be reused`)
      const memberId = String(member.id)
      const registry = get('agents')
      const liveNow = () => (registry && typeof registry.get === 'function' ? registry.get(memberId) : undefined)
      if (String(args.role) === 'none') {
        const live = liveNow()
        if (bindings.get(memberId)?.assist) throw new Error('a helper retains its owner; assign it another role instead of removing its binding')
        bindings.delete(memberId)
        if (live) enforcer.reinstall(live)
        return { name: member.name, role: 'none', route: 'unchanged', live: !!live }
      }
      const catalog = getCatalog(caller)
      const role = catalog.byId.get(String(args.role))
      if (!role) throw new Error(`unknown role "${args.role}"; known: ${catalog.roles.map((r) => r.id).join(', ')}`)
      if (role.kind === 'oneshot') throw new Error(`role "${role.id}" is one-shot only; members need a member-capable role`)
      const { route } = await resolveRoute(role, exec.signal, args.model)
      const previous = bindings.get(memberId)
      if (args.function !== undefined && (typeof args.function !== 'string' || !args.function.trim())) throw new Error('function must be a non-empty standing responsibility')
      let samePreviousModel = false
      try { samePreviousModel = previous?.role === role.id && sameModelIdentity(routeForBinding(previous, catalog, get), route) } catch {}
      // The member may have unloaded or cold-resumed while the route preflight awaited: read the
      // live Agent again right before the binding write, so a resumed instance gets the new policy.
      const live = liveNow()
      bindings.set(memberId, { role: role.id, kind: 'member', ...bindingRouteFields(role, route), ownerId: caller.id, leadId: caller.id, name: member.name, seat: previous?.seat || member.name, function: args.function?.trim() || previous?.function || String(member.description || ''), ...(previous?.formation && samePreviousModel && (args.function === undefined || args.function.trim() === previous.function) ? { formation: previous.formation } : {}), ...(previous?.assist ? { assist: previous.assist } : {}) })
      let held = null
      if (live) {
        enforcer.reinstall(live)
        enforcer.selectionChanged?.(live)
        held = enforcer.routeStatus?.(live)
        await get('sessions')?.flush?.(live.session)
      }
      return { name: member.name, role: role.id, route: route ? routeText(route) : 'inherited', live: !!live, appliesFrom: !live ? 'next-wake' : held?.deferred ? 'next-turn (current turn in progress)' : 'next-turn', ...(held?.deferred ? { currentTurnRoute: held.currentTurn } : {}) }
    },
  })
  const teamRoster = defineTool({
    name: 'bbff_team_roster',
    description: 'Read the Team roster (it replaces native list_agents, which is disabled in Team trees) before hiring or reassigning. Every agent of the Lead\'s tree is in the team: core members (hired or bound with bbff_team_assign) get full rows, each with outsourcedCount (agents it started) and outsourcedDescendants (its whole subtree); outsourced agents (role dispatches and native subagents, started by the Lead or by members) get compact rows (name, role or unbound, kind, model, status, lastActiveAt, description, dispatchedBy, parentId, mode), newest first and bounded, with the omitted count. Full rows carry the name (native, or the BBFF seat alias of an unnamed pre-0.2.2 member with its native address), role, purpose, selected model tier, running/idle/inactive state, context used/window/percent, enforcement (attached, missing or yielded with reason), last turn state (pending, ok, or unavailable with reason), latest report excerpt, helper ownership and the BBFF soft cap (counts core members only). Context percent is a projected estimate, not an atomic provider sample. Compact only idle members before reassigning.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      if (!exec.agent) return JSON.stringify({ team: false, members: [], idleByRole: {} })
      return JSON.stringify(rosterForModel(await ops.roster(exec.agent, exec.signal)), null, 2)
    },
  })

  const teamSteer = defineTool({
    name: 'bbff_team_steer',
    description: 'Steer a message to any agent of your team (the Lead, a core member or an outsourced agent, including one started by a member) or to an agent you started, by native name or path as bbff_team_roster shows it (a session id also works). A running target sees it at its next step; an idle or unloaded target starts a turn. Acceptance does not mean the target has processed it. Outsourced role dispatches are continuable too, so steer reuses them for follow-ups on the same job. Noncontinuable entries are rejected; native send_message({agent, message}) is the unrestricted equivalent.',
    parameters: {
      target: { type: 'string', required: true, description: 'Teammate name from bbff_team_roster (including the Lead own name), or the name of an agent you started.' },
      message: { type: 'string', required: true, description: 'Self-contained correction, clarification or next assignment.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => text(value) },
    async execute(args, exec) { return JSON.stringify(await ops.steer(exec.agent, args.target, args.message, exec.signal)) },
  })
  const teamCompact = defineTool({
    name: 'bbff_team_compact',
    description: 'Team Lead only: request compaction of an idle teammate before reuse. A loaded member compacts immediately; an unloaded idle member gets a persisted pending request, applied before its next manager-owned turn. Never cold-resumes solely for compaction and never compacts a running member. Roster exposes pending state, errors and before/after context; a null result is a no-op.',
    parameters: { name: { type: 'string', required: true, description: 'Idle teammate name from bbff_team_roster.' } },
    output: { schema: { type: 'string' }, render: (_args, value) => text(value) },
    async execute(args, exec) { return JSON.stringify(compactionForModel(await ops.compact(exec.agent, args.name, exec.signal))) },
  })

  const teamFormation = defineTool({
    name: 'bbff_team_formation',
    description: 'Lead only: list, plan/apply idle seating, or draft a formation. Never hires or interrupts.',
    parameters: {
      action: { type: 'string', enum: ['list', 'plan', 'apply', 'draft'], required: true },
      id: { type: 'string', description: 'Formation id; required for plan/apply, optional for draft.' },
      map: { type: 'object', additionalProperties: true, description: 'Optional seat -> existing member name mapping (string values only).' },
      compact: { type: 'string', enum: ['changed', 'all', 'none'], description: 'Compaction policy; default changed (role or function).' },
      label: { type: 'string', description: 'Optional label for a draft.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => text(value) },
    async execute(args, exec) { return JSON.stringify(formationForModel(await formations.execute(exec.agent, args, exec.signal)), null, 2) },
  })
  const teamActivity = defineTool({
    name: 'bbff_team_activity',
    description: 'Tree root only (the Team Lead, or an Orchestrator root conversation with Agent Teams off): read a member or descendant child’s recent committed events as recorded, with Host time, seq/time/age, call/result pairing and bounded field excerpts. No verdict or health classification.',
    parameters: {
      target: { type: 'string', required: true, description: 'Teammate name, a descendant name/path as bbff_team_roster shows it (e.g. reviewer/checker), or a session id within the Lead tree.' },
      limit: { type: 'integer', description: 'Positive event count. Uses activityDefaultLimit (shipped 10), capped by activityMaxLimit (shipped 50). Field excerpts use activityPreviewChars (shipped 400); original chars/bytes and truncation are reported.' },
      before: { type: 'integer', description: 'Exclusive seq cursor: return only events with seq < before.' },
      kinds: { type: 'array', items: { type: 'string' }, description: 'Optional recorded kind names, e.g. turn-end, llm-retry, job-settled, tool-result. Empty = any kind. Filters before applying limit; bounded lookback reports continuation.' },
      outcome: { type: 'string', enum: ['error','any'], description: 'error matches failed tool results, error turn-end and llm-retry. Omitted/any keeps all outcomes; composes with kinds and before.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => text(value) },
    isConcurrencySafe: () => true,
    async execute(args, exec) { return JSON.stringify(await ops.activityWindow(exec.agent, args, exec.signal), null, 2) },
  })
  const teamJobKill = defineTool({
    name: 'bbff_team_job_kill',
    description: 'Tree root only (the Team Lead, or an Orchestrator root conversation with Agent Teams off): request cancellation of a known member/child background job. Verifies its native owner within the permitted target sessions, forwards reason, and returns owner plus requested/already-finished. Does not interrupt the whole turn.',
    parameters: {
      jobId: { type: 'string', required: true, description: 'Job id from the target activity window (bbff_team_activity).' },
      target: { type: 'string', description: 'Optional teammate/child the job should belong to; narrows the evidence search.' },
      reason: { type: 'string', description: 'Optional kill reason forwarded to the native jobs service.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => text(value) },
    async execute(args, exec) { return JSON.stringify(await ops.killDescendantJob(exec.agent, args, exec.signal), null, 2) },
  })
  return { tools: [teamRoles, teamDispatch, teamHire, teamAssign, teamRoster, teamSteer, teamCompact, teamFormation, teamActivity, teamJobKill], resolveRoute, active, ops, formations }
}

export { roleTitle }
