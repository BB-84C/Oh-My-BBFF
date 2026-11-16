// Oh-My-BBFF Team — role-based organization and dispatch of subagents and Team
// members for DeepSeek Harness.
//
// * Role catalog (data): built-in seeds + $DSH_HOME/oh-my-bbff-team/roles.json
//   + <workspace>/.dsh/team/roles.json.
// * Two organization modes chosen per root conversation at prompt-assembly time:
//   native "Use Agent Teams" off → the root is an ORCHESTRATOR of one-shot role children;
//   on → the root (native name `lead`) is a TEAM LEADER of durable role members, which are
//   named native subagents (DSH >= 0.2.2); members orchestrate their own one-shot children.
// * Enforcement on the real execution surfaces: tool visibility + guard,
//   skill hiding, MCP server access, delegation policy, per-member LLM route.
// * Coexists with dsh-superagent: never provides `orchestrator`, never touches
//   superagent-owned sessions.
// * Registers with the Oh-My-BBFF family root when it is present (contract v1);
//   works standalone when it is not.

import { homedir } from 'node:os'
import { join, resolve, isAbsolute } from 'node:path'
import { statSync, readFileSync } from 'node:fs'
import { loadCatalog, catalogPaths, routeText, ROLE_KINDS, DELEGATION_MODES, REUSE_MODES, LEADER_BRIEF_FIELDS } from './lib/catalog.js'
import { createBindingStore } from './lib/bindings.js'
import { createTree } from './lib/tree.js'
import { createLedger } from './lib/ledger.js'
import { createEnforcer, HIDE_PROVIDER } from './lib/enforcer.js'
import { createTeamTools } from './lib/tools.js'
import { classify, superagentPresent, orchestrationFacts } from './lib/classify.js'
import { registerFamilyModule, FAMILY_SERVICE, msg } from './lib/bbff-contract.js'
import { TOOL_NAME_PATTERN, SKILL_NAME_PATTERN, MCP_SERVER_NAME_PATTERN, nativeToolGroup, orchestratorServiceName, sessionHeaderFacts } from './lib/dsh-adapter.js'
import { teamToolTraits } from './lib/tool-contract.js'
import { effectFacts } from './lib/role-permissions.js'
import { DENY_CAPABILITIES, capabilityFacts, expandedCapabilityBlacklist, managedSkillFacts } from './lib/capability-contract.js'
import { createRootContext } from './lib/root-context.js'
import { createAdmin } from './lib/admin.js'
import { createConfigStore } from './lib/config-store.js'
import { createConfigTools } from './lib/config-tools.js'
import { createSessionModes, effectiveRootMode, SESSION_MODES } from './lib/session-modes.js'
import { migrateLegacyData } from './lib/migration.js'
import { routeForBinding } from './lib/models.js'
import { readTeamSettings, teamCapacity, teamDepthCapacity, teamSettingsState, DEFAULT_TEAM_SETTINGS } from './lib/team-settings.js'
import { DEFAULT_DOCTRINE_TEMPLATES, DOCTRINE_VARIABLES, validateDoctrineTemplates, renderDoctrineTemplate } from './lib/doctrine-templates.js'
import { orchestratorDoctrine, leaderDoctrine, memberDoctrine, childDoctrine } from './lib/doctrine.js'

import PACKAGE_META from './package.json' with { type: 'json' }
export const name = PACKAGE_META.name
export const inject = ['tools']

export const VERSION = PACKAGE_META.version
const API_ROUTE = '/oh-my-bbff-team/api'
const CATALOG_TTL_MS = 3_000

export const FAMILY_DESCRIPTOR = Object.freeze({
  contract: 1,
  id: PACKAGE_META.bbff.id,
  title: msg('module.title'),
  description: msg('module.description'),
  version: VERSION,
  packageName: PACKAGE_META.name,
  apiBase: API_ROUTE,
  ui: { cards: ['team'], settings: true },
})

export function apply(ctx, config = {}) {
  const home = config.home || process.env.DSH_HOME || join(homedir(), '.dsh')
  const dataDir = join(home, 'oh-my-bbff-team')
  const logger = ctx.logger
  const get = (key) => { try { return ctx.get(key) } catch { return undefined } }

  // Copy legacy crew state before any lazy store is first read. Existing team
  // files win, and the source remains intact for a safe rollback.
  migrateLegacyData(home, logger)
  const bindings = createBindingStore(join(dataDir, 'bindings.json'), { getLimit: () => readTeamSettings({ home }).bindingLimit, isProtected: id => !!get('agents')?.get?.(String(id)) })

  // Catalog cache per workspace, invalidated by overlay mtime or a short TTL.
  const catalogs = new Map()
  function stamp(path) {
    try { return path ? statSync(path).mtimeMs : 0 } catch { return 0 }
  }
  function getCatalog(agent) {
    const header = agent ? sessionHeaderFacts(agent.session?.header).value : undefined
    const cwd = header?.cwd || ''
    const paths = catalogPaths({ home, cwd })
    const key = cwd
    const marks = `${stamp(paths.global)}|${stamp(paths.workspace)}`
    const hit = catalogs.get(key)
    if (hit && hit.marks === marks && Date.now() - hit.at < CATALOG_TTL_MS) return hit.catalog
    const catalog = loadCatalog({ home, cwd })
    catalogs.set(key, { marks, at: Date.now(), catalog })
    if (catalog.errors.length && (!hit || hit.marks !== marks)) {
      try { logger?.warn?.(`oh-my-bbff-team catalog: ${catalog.errors.join('; ')}`) } catch {}
    }
    return catalog
  }

  // Binding compatibility is read-only. Preserve route identities and legacy
  // selectors on startup; only explicit assign/hire/formation actions persist.

  const sessionModes = createSessionModes(join(dataDir, 'session-modes.json'), { getLimit: () => readTeamSettings({ home }).sessionModeLimit, isProtected: id => !!get('agents')?.get?.(String(id)) })
  const getTeamSettings = () => readTeamSettings({ home })
  // Team metadata ledger (derived, rebuildable SQLite): every repeated read answers from it.
  const ledger = createLedger({ file: join(dataDir, 'ledger.sqlite'), ringSize: getTeamSettings().activityMaxLimit })
  const tree = createTree(get, { bindings, ledger, getSettings: getTeamSettings, ...(Number.isSafeInteger(config.treeRevalidateMs) ? { coldRevalidateMs: config.treeRevalidateMs } : {}) })
  const enforcer = createEnforcer(ctx, { getCatalog, bindings, logger, sessionModes, getTeamSettings, tree, getFormationState: agent => team.formations.list(agent), getContextFacts: id => team.ops.peekContext(id), onBindingInvalid: (agent, issue) => team.ops.recordBindingDiagnostic(agent.id, issue) })
  const team = createTeamTools(ctx, { getCatalog, bindings, enforcer, logger, sessionModes, getTeamSettings, tree, pendingFile: join(dataDir, 'compaction-pending.json'), formationsFile: join(dataDir, 'formations.json'), reportFile: join(dataDir, 'report-checkpoints.json'), reportImportFile: join(dataDir, 'report-import.json'), sessionRoot: join(home, 'sessions') })
  const configStore = createConfigStore(ctx, { home, onCommit: () => {
    catalogs.clear()
    const registry=get('agents')
    if(registry && typeof registry.list==='function')for(const agent of registry.list()){
      try{enforcer.reinstall(agent)}catch(error){try{logger?.warn?.('Team config reapply failed',error)}catch{}}
    }
  } })
  const admin = createAdmin(ctx, { home, configStore })
  const configTools = createConfigTools(ctx, { store: configStore })

  const rootContext = createRootContext(get, { getLimit: () => getTeamSettings().reportCacheEntries })
  const permissionRead = { value: null, flight: null, at: null, durationMs: 0, error: '', provider: null }
  function peekPermissionCatalog() {
    const family=get(FAMILY_SERVICE),provider=family?.contract===1?family.catalog:null
    if(!provider?.snapshot)return {snapshot:null,part:{status:'unavailable',reason:'The family catalog capability is unavailable; valid manually entered names remain user settings',durationMs:0}}
    if(permissionRead.provider!==provider){permissionRead.provider=provider;permissionRead.at=null}
    if(!permissionRead.flight && (!permissionRead.at || Date.now()-permissionRead.at>=getTeamSettings().cardRefreshMs)) {
      const started=performance.now()
      permissionRead.flight=new Promise(resolve=>setImmediate(resolve)).then(()=>{const snapshot=provider.snapshot();if(!snapshot||!Array.isArray(snapshot.entries))throw new Error('Invalid family catalog snapshot');permissionRead.value=snapshot;permissionRead.error='';permissionRead.at=Date.now()}).catch(error=>{permissionRead.error=String(error?.message||error);permissionRead.at=Date.now()}).finally(()=>{permissionRead.durationMs=performance.now()-started;permissionRead.flight=null})
    }
    return {snapshot:permissionRead.value,part:{status:permissionRead.flight?(permissionRead.value?'stale':'pending'):permissionRead.error?'unavailable':'ready',pending:!!permissionRead.flight,reason:permissionRead.error||(permissionRead.flight?'Family catalog is loading in one background flight':'Cached Root-owned picker catalog'),durationMs:permissionRead.durationMs,asOf:permissionRead.at?new Date(permissionRead.at).toISOString():null}}
  }

  const definitions = [...team.tools, ...configTools]
  for (const definition of definitions) ctx.effect(() => ctx.tools.register(definition), `team:tool:${definition.name}`)

  // Role policy is established by the pre-waterfall assembly provider, not this serial notification.
  if(typeof ctx.inject==='function')ctx.inject(['systemPrompt'],()=>{enforcer.installAnchor()})
  // Serial notification: attach role policy + route before the new Agent's first step; return nothing.
  // A session that becomes live (or stops being live) may change its catalog: re-check its revision next walk.
  ctx.on('agent/created', ({ agent, signal }) => { tree.invalidate(agent.id); enforcer.onCreated(agent); team.ops.onCreated(agent, signal) })
  ctx.on('agent/disposed', ({ agent }) => { tree.invalidate(agent.id); rootContext.dispose(agent); enforcer.dispose(agent); team.ops.onDisposed(agent) })
  ctx.on('agent/status', ({ agent, status }) => { team.ops.onStatus(agent, status) })
  let stopping = false
  // Unload: stop every background pass, timer and in-flight read, then close the ledger. A reloaded
  // generation must leave no activity from this one.
  ctx.effect(() => () => { stopping = true; enforcer.disposeAll(); tree.dispose(); const done = team.ops.dispose(); ledger.close(); return done }, 'team:enforcer')
  // A (re)loaded generation attaches policy to Agents that are already live, so a reload never
  // leaves a bound member without guards until its next assembly.
  for (const agent of get('agents')?.list?.() || []) { try { enforcer.ensure(agent); team.ops.seed(agent) } catch (error) { try { logger?.warn?.('Team policy attach on load failed', error) } catch {} } }
  // Re-evaluate static role visibility if an orchestration owner appears or disappears.
  if (typeof ctx.inject === 'function') ctx.inject([orchestratorServiceName()], (scope) => {
    const refresh = () => { if (!stopping) for (const agent of get('agents')?.list?.() || []) enforcer.reinstall(agent) }
    refresh()
    scope.effect(() => () => { queueMicrotask(refresh) }, 'team:orchestrator-yield')
  })

  const familyDescriptor = { ...FAMILY_DESCRIPTOR, tools: definitions.map(definition => definition.name), toolTraits: teamToolTraits(definitions), skillMaskProviders: [HIDE_PROVIDER],
    // UI text is a message reference into locale/<lang>.json; the root resolves it per active locale.
    locale: { dir: 'locale' },
    requiredTools: { tools: nativeToolGroup('team-report').value, reason: msg('module.requiredTools.reason') },
    permissionLayer: { title: msg('module.permissionLayer.title'), settingsSectionId: PACKAGE_META.bbff.id } }
  registerFamilyModule(ctx, familyDescriptor)

  // Contract v1.2 (additive, feature-detected): role badges for Team members and
  // subagents in the root's cards. Older roots simply lack the method.
  const annotate = (ids) => {
    const out = {}
    for (const id of ids) {
      const binding = bindings.get(String(id))
      if (!binding || !binding.role) continue
      const registry = get('agents')
      const live = registry && typeof registry.get === 'function' ? registry.get(String(id)) : undefined
      let route = binding.route
      if (binding.kind === 'member') {
        try { route = routeForBinding(binding, getCatalog(live), get) } catch { route = null }
      }
      out[id] = [{
        label: binding.role,
        tone: binding.kind === 'member' ? 'info' : 'default',
        title: `Oh-My-BBFF Team role: ${binding.role}${route ? ' · ' + routeText(route) : ''}`,
      }]
    }
    return out
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject([FAMILY_SERVICE], (scope) => {
      const family = scope.get(FAMILY_SERVICE)
      if (!family || family.contract !== 1) return
      if (typeof family.subscribe === 'function') scope.effect(() => family.subscribe(() => {
        if (!stopping) for (const agent of get('agents')?.list?.() || []) enforcer.reinstall(agent)
      }), 'team:family-permission-barrier')
      if (typeof family.registerAgentAnnotator === 'function') scope.effect(() => family.registerAgentAnnotator(PACKAGE_META.bbff.id, annotate), 'team:annotator')
    })
  }

  // Public host-side Team view for other plugins (for example the Widgets Team card):
  // await ctx.get('bbffTeam').members(rootAgent, { signal }) returns the same two-tier object as
  // the Team API `?action=team&sessionId=`. Owned by this plugin's fiber; removed when Team unloads.
  if (typeof ctx.provide === 'function') {
    try { ctx.provide('bbffTeam', Object.freeze({ version: 1, members: (rootAgent, options = {}) => team.ops.teamView(rootAgent, options.signal) })) } catch (error) { ctx.logger?.warn?.('oh-my-bbff-team: provide bbffTeam failed', error) }
  }

  // Diagnostics route (local): catalog, bindings, per-session doctrine preview.
  const json = (res, status, body) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }
  async function readBody(req) {
    if (req.method !== 'POST') return {}
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
  }
  async function handler(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://local')
      const body = await readBody(req)
      const action = String(body.action || url.searchParams.get('action') || 'status')
      const sessionId = String(body.sessionId || url.searchParams.get('sessionId') || '')
      const registry = get('agents')
      const live = sessionId && registry && typeof registry.get === 'function' ? registry.get(sessionId) : undefined
      const liveFacts = live ? sessionHeaderFacts(live.session?.header).value : undefined
      if (action === 'formations') {
        if (sessionId && !live) return json(res, 404, { ok: false, error: 'session is not live' })
        return json(res, 200, { ok: true, ...team.formations.list(live) })
      }
      if (action === 'team-settings') return json(res, 200, { ok: true, ...teamSettingsState({ home }), ...teamCapacity(get, getTeamSettings()), ...teamDepthCapacity(get, getTeamSettings()), retention: { bindings: bindings.diagnostics(), sessionModes: sessionModes.diagnostics() }, doctrineDefaults: DEFAULT_DOCTRINE_TEMPLATES, doctrineVariables: DOCTRINE_VARIABLES })
      if (action === 'doctrine-current') {
        if (!live) return json(res,404,{ok:false,error:'Choose a live session to read its current Team section'})
        return json(res,200,{ok:true,readOnly:true,sessionId:live.id,position:classify(live,get,getTeamSettings()).position,context:'current-team-section',source:'registered Team doctrineFor(live Agent); computed for the next assembly, not a historical request receipt',preview:enforcer.doctrineFor(live)})
      }
      if (action === 'doctrine-preview') {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'doctrine-preview requires POST' })
        const key = String(body.key || '')
        if (!Object.hasOwn(DEFAULT_DOCTRINE_TEMPLATES, key)) return json(res, 400, { ok: false, error: 'unknown doctrine template' })
        const overrides = body.replaceOverrides === true ? { ...(body.doctrineTemplates || {}) } : { ...getTeamSettings().doctrineTemplates, ...(body.doctrineTemplates || {}) }
        try { validateDoctrineTemplates(overrides) } catch (error) { return json(res, 400, { ok: false, error: String(error?.message || error) }) }
        const configured = { ...getTeamSettings(), doctrineTemplates: overrides }
        const depth = teamDepthCapacity(get, configured)
        const settings = { ...configured, maxDepth: depth.effectiveDepth ?? 'unavailable', configuredDepth: depth.configuredDepth, nativeDepth: depth.nativeDepth ?? 'unavailable' }
        const catalog = getCatalog(live)
        const role = body.roleId ? catalog.byId.get(String(body.roleId)) : catalog.roles[0]
        if (body.roleId && !role) return json(res, 400, { ok: false, error: 'unknown preview role' })
        let preview
        if (key === 'orchestrator') preview = orchestratorDoctrine(catalog, { settings, teamAvailable: !!get('agentTeams') })
        else if (key === 'leader') preview = leaderDoctrine(catalog, { settings })
        else if (key === 'member') preview = memberDoctrine(role, catalog, { settings })
        else if (key === 'child') {
          if (!role) return json(res, 400, { ok: false, error: 'choose an available role for child doctrine preview' })
          preview = childDoctrine(role, catalog, { settings })
        } else preview = renderDoctrineTemplate(key, { ...Object.fromEntries(DOCTRINE_VARIABLES.map(name => [name, '<' + name + '>'])), maxDepth: settings.maxDepth, helpersPerMember: settings.helpersPerMember }, overrides)
        return json(res, 200, { ok: true, preview, context: 'example', key, roleId: role?.id || null })
      }
      if (action === 'team') {
        if (!sessionId) return json(res, 400, { ok: false, error: 'sessionId is required' })
        // A live session resolves its Lead natively; otherwise the shared root resolver names it.
        const resolution = live ? null : rootContext.poll(sessionId).resolution
        const rootAgent = live ? tree.leadOf(live) : resolution.resolved && registry && typeof registry.get === 'function' ? registry.get(resolution.rootSessionId) : undefined
        if (!rootAgent) return json(res, 404, { ok: false, error: resolution && !resolution.resolved ? resolution.reason : 'the root session is not live' })
        return json(res, 200, { ok: true, sessionId, rootId: String(rootAgent.id), ...(await team.ops.teamView(rootAgent, AbortSignal.timeout(30000))) })
      }
      if (action === 'roster') {
        if (!live) return json(res, 404, { ok: false, error: 'session is not live' })
        return json(res, 200, { ok: true, ...(await team.ops.roster(live)) })
      }
      if (action === 'status') {
        const statusStart=performance.now()
        return json(res, 200, {
          ok: true,
          version: VERSION,
          maxDepth: teamDepthCapacity(get, getTeamSettings()).effectiveDepth,
          depth: teamDepthCapacity(get, getTeamSettings()),
          team: !!get('agentTeams'),
          superagent: superagentPresent(get),
          bindings: bindings.diagnostics().count,
          retention: { bindings: bindings.diagnostics(), sessionModes: sessionModes.diagnostics() },
          reportMigration: team.ops.reportImportDiagnostics(),
          reportTimeFix: team.ops.reportTimeFixDiagnostics(),
          treeReads: tree.diagnostics(),
          ledger: team.ops.ledgerDiagnostics(),
          active: Object.fromEntries(team.active),
          parts: { runtime: { status: 'ready', reason: 'Current in-memory admissions and small operational metadata only', durationMs: performance.now()-statusStart } },
        })
      }
      if (action === 'overview') {
        if (!sessionId) return json(res, 400, { ok: false, error: 'sessionId is required' })
        const overviewStart=performance.now()
        const root = rootContext.poll(sessionId)
        const rootId = root.resolution.rootSessionId
        const rootAgent = root.resolution.resolved && registry && typeof registry.get === 'function' ? registry.get(rootId) : undefined
        const cls = rootAgent ? classify(rootAgent, get, getTeamSettings()) : null
        const teamAvailable = !!(cls && cls.position === 'lead')
        const mode = sessionModes.get(rootId)
        const bindingState = bindings.diagnostics()
        const owned = bindings.all().filter((binding) => binding.ownerId === rootId || binding.leadId === rootId)
        const byRole = {}
        for (const binding of owned) {
          const slot = (byRole[binding.role] ||= { oneshot: 0, member: 0 })
          slot[binding.kind === 'member' ? 'member' : 'oneshot'] += 1
        }
        const doctrine = enforcer.doctrineStatus(rootAgent)
        return json(res, 200, {
          ok: true,
          sessionId,
          rootId,
          rootResolution: root,
          parts: { root: root.part, bindings: { status: bindingState.complete ? 'ready' : 'unavailable', reason: bindingState.loadError || 'Cached persisted role bindings', durationMs: performance.now()-overviewStart }, doctrine: { status: root.part.status==='pending' ? 'pending' : doctrine.active ? 'ready' : 'unavailable', reason: doctrine.reason, durationMs: performance.now()-overviewStart }, overview: { status: root.part.status==='pending' ? 'pending' : 'ready', reason: 'Cache-only session overview; heavy ancestry work is in background', durationMs: performance.now()-overviewStart } },
          isRoot: root.resolution.resolved && rootId === sessionId,
          live: root.resolution.resolved && !!rootAgent,
          position: cls ? cls.position : null,
          team: !!get('agentTeams'),
          teamAvailable,
          mode: root.resolution.resolved ? mode : null,
          modes: SESSION_MODES,
          effective: !root.resolution.resolved || !rootAgent ? null : doctrine.active ? effectiveRootMode(mode, teamAvailable) : 'off',
          doctrine,
          effectiveReason: !root.resolution.resolved ? root.resolution.reason : doctrine.reason,
          memberReports: root.resolution.resolved && bindingState.complete && rootAgent ? team.ops.reportRows(rootAgent) : null,
          bindingState,
          modeState: sessionModes.diagnostics(),
          byRole: root.resolution.resolved && bindingState.complete ? byRole : null,
          roleTitles: root.resolution.resolved && bindingState.complete ? Object.fromEntries(Object.keys(byRole).map(id=>[id,getCatalog(rootAgent).byId.get(id)?.title||null])) : null,
          poll: { intervalMs: getTeamSettings().cardRefreshMs, defaultMs: DEFAULT_TEAM_SETTINGS.cardRefreshMs, settingPath: 'settings.cardRefreshMs', pendingMs: getTeamSettings().pendingRefreshMs, pendingDefaultMs: DEFAULT_TEAM_SETTINGS.pendingRefreshMs, pendingSettingPath: 'settings.pendingRefreshMs' },
          countBasis: { source: 'memberReports are the Lead and its core members (member bindings); the whole two-tier team (core and outsourced) is served by action=team', coreFromMemberBindings: true, cumulative: true, includesCompletedOneshots: true },
          modelOverrides: root.resolution.resolved && bindingState.complete ? [] : null,
          ignoredLegacyOverrideCount: root.resolution.resolved && bindingState.complete ? owned.filter(binding=>binding.override).length : null,
        })
      }
      if (action === 'set-session-mode') {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'set-session-mode requires POST' })
        if (!sessionId) return json(res, 400, { ok: false, error: 'sessionId is required' })
        const root = await rootContext.resolve(sessionId)
        const rootId = root.resolution.rootSessionId
        if (!root.resolution.resolved) return json(res, 400, { ok: false, error: root.resolution.reason, rootResolution: root })
        const requested = String(body.mode || '')
        if (!SESSION_MODES.includes(requested)) return json(res, 400, { ok: false, error: 'mode must be one of ' + SESSION_MODES.join(', ') })
        try { sessionModes.assertReadable() } catch (error) { return json(res, 409, { ok: false, error: String(error?.message || error), mode: null }) }
        // Team leader / Orchestrator are the native per-root Agent Teams selection: switch it first and
        // store BBFF's mode only after the native call succeeded. auto and off leave the native selection alone.
        const nativeEnabled = requested === 'leader' ? true : requested === 'orchestrator' ? false : null
        let native = { changed: false, enabled: null }
        if (nativeEnabled !== null) {
          const teams = get('agentTeams'), current = sessionModes.get(rootId)
          if (!teams || typeof teams.setEnabled !== 'function' || typeof teams.isEnabled !== 'function') return json(res, 503, { ok: false, rootId, mode: current, error: 'The native Agent Teams service is unavailable, so ' + requested + ' cannot be selected; the session mode was not changed.' })
          const rootAgent = registry && typeof registry.get === 'function' ? registry.get(rootId) : undefined
          if (!rootAgent) return json(res, 409, { ok: false, rootId, mode: current, error: 'The root conversation is not loaded; open it to switch to ' + requested + ' (the native Agent Teams selection needs the live root). The session mode was not changed.' })
          const before = teams.isEnabled(rootAgent) === true
          try { await teams.setEnabled(rootAgent, nativeEnabled) }
          catch (error) {
            let after = null
            try { after = teams.isEnabled(rootAgent) === true } catch {}
            return json(res, 502, { ok: false, rootId, mode: current, native: { requested: nativeEnabled, enabled: after }, error: 'Switching native Agent Teams failed: ' + String(error?.message || error) + '. The session mode was not changed.' })
          }
          native = { changed: before !== nativeEnabled, enabled: teams.isEnabled(rootAgent) === true }
        }
        const mode = sessionModes.set(rootId, requested)
        return json(res, 200, { ok: true, rootId, mode, native })
      }
      if (action === 'effective-catalog') {
        const explicit = body.cwd || url.searchParams.get('cwd') || ''
        let cwd = '', context = null
        if (explicit) {
          if (typeof explicit !== 'string' || !isAbsolute(explicit) || (process.platform === 'win32' && /^\/(?!\/)/.test(explicit))) return json(res, 400, { ok: false, error: 'Supply an absolute native workspace directory' })
          cwd = resolve(explicit)
          context = { source: 'explicit-read-only-workspace', asOf: new Date().toISOString() }
        } else {
          if (!sessionId) return json(res, 400, { ok: false, error: 'Choose a session or an explicit workspace directory' })
          context = await rootContext.resolve(sessionId)
          if (!context.resolution.resolved || !context.resolution.cwd) return json(res, 400, { ok: false, error: context.resolution.reason, rootResolution: context })
          cwd = context.resolution.cwd
        }
        try { if (!statSync(cwd).isDirectory()) throw new Error('not a directory') } catch (error) { return json(res, 400, { ok: false, error: 'Workspace is not readable: ' + String(error?.message || error) }) }
        const value = configStore.read({ cwd })
        return json(res, 200, { ok: true, readOnly: true, cwd, context, catalog: value.catalog, complete: !value.catalog.errors.length, globalFile: catalogPaths({ home, cwd }).global })
      }
      if (action === 'catalog') {
        const catalogStart=performance.now(),catalog = getCatalog(live),permission=peekPermissionCatalog()
        const permissionCatalog=permission.snapshot
        let permissionCatalogError=permission.part.status==='unavailable'?permission.part.reason:''
        const family = get(FAMILY_SERVICE)
        let descriptors = []
        try { descriptors = family?.contract === 1 ? family.list?.() || [] : [] } catch (error) { permissionCatalogError = String(error?.message || error) }
        const toolEntries = new Map((permissionCatalog?.entries || []).filter(entry => entry.kind === 'tool').map(entry => [entry.name, entry]))
        const relevantNames = new Set([...(permissionCatalog?.entries || []).filter(entry => entry.kind === 'tool' && (entry.present || entry.seenThisRun)).map(entry => entry.name), ...catalog.roles.flatMap(role => [...(role.tools?.allow || []), ...(role.tools?.deny || [])])])
        const toolEffects = Object.fromEntries([...relevantNames].map(name => [name, { ...effectFacts(name, family?.contract === 1 ? family : undefined, { descriptors, snapshot: permissionCatalog || { entries: [], complete: false }, toolEntries }), ...capabilityFacts(name, { family: family?.contract === 1 ? family : undefined, snapshot: permissionCatalog || { entries: [] } }) }]))
        return json(res, 200, {
          ok: true,
          sources: catalog.sources,
          errors: catalog.errors,
          removed: catalog.removed || [],
          globalFile: catalogPaths({ home, cwd: '' }).global,
          permissionCatalog,
          permissionCatalogError,
          parts: { permissions: permission.part, roles: { status: 'ready', reason: 'Local role declarations and effective source metadata', durationMs: performance.now()-catalogStart }, catalog: { status: permission.part.status==='pending'?'pending':'ready', reason: 'Local roles do not wait on Root picker discovery', durationMs: performance.now()-catalogStart } },
          toolEffects,
          capabilityBlacklist: { classes: DENY_CAPABILITIES, scope: 'Verified DSH/BBFF native tools only; external tools stay user-owned unless explicitly denied', byRole: Object.fromEntries(catalog.roles.map(role => [role.id, expandedCapabilityBlacklist(role, [...relevantNames], { family: family?.contract === 1 ? family : undefined, snapshot: permissionCatalog || { entries: [] } })])) },
          skillDefaultScope: { scope: 'Proven DSH/BBFF bundled skills only; user/project/custom and unverified sources have no automatic defaults', entries: (permissionCatalog?.entries || []).filter(entry => entry.kind === 'skill').map(entry => ({ name: entry.name, ...managedSkillFacts(entry) })) },
          unknownToolEffectPolicy: { value: getTeamSettings().unknownToolEffect, default: teamSettingsState({ home }).defaults.unknownToolEffect, settingPath: 'settings.unknownToolEffect' },
          reportDependencies: familyDescriptor.requiredTools,
          permissionLayers: descriptors.filter(descriptor => descriptor.compatible && descriptor.permissionLayer).map(descriptor => ({ moduleId: descriptor.id, moduleTitle: descriptor.title, packageName: descriptor.packageName, ...descriptor.permissionLayer })),
          orchestration: orchestrationFacts(live, get),
          roleSchema: { version: 3, kinds: ROLE_KINDS, delegationModes: DELEGATION_MODES, reuseModes: REUSE_MODES, leaderBriefFields: LEADER_BRIEF_FIELDS, denyCapabilities: DENY_CAPABILITIES, filterSyntax: { tools: TOOL_NAME_PATTERN.source, skills: SKILL_NAME_PATTERN.source, mcp: MCP_SERVER_NAME_PATTERN.source }, newRoleDefaults: { kind: 'both', title: '', leaderBrief: Object.fromEntries(LEADER_BRIEF_FIELDS.map(field => [field, ''])), identityPrompt: '', readOnly: false, models: [], concurrency: null, delegation: { mode: 'none' }, reuse: 'fresh' } },
          migrations: catalog.migrations || [],
          retired: catalog.retired || [],
          defaults: catalog.defaults,
          team: !!get('agentTeams'),
          superagent: superagentPresent(get),
          roles: catalog.roles.map((role) => ({ ...role, routeText: routeText(role.models[0]) })),
        })
      }
      if (action === 'bindings') return json(res, 200, { ok: true, bindings: bindings.all() })
      if (action === 'models') return json(res, 200, { ok: true, providers: await admin.models() })
      if (action === 'efforts') {
        const provider = String(body.provider || url.searchParams.get('provider') || '')
        const model = String(body.model || url.searchParams.get('model') || '')
        if (!provider || !model) return json(res, 400, { ok: false, error: 'provider and model are required' })
        return json(res, 200, { ok: true, ...(await admin.efforts(provider, model)) })
      }
      if (action.startsWith('config-')) {
        if (sessionId && !live && typeof body.cwd!=='string') return json(res,400,{ok:false,error:'session is no longer live; supply an explicit cwd for workspace validation or omit sessionId for global-only configuration'})
        const cwd = liveFacts?.cwd || (typeof body.cwd==='string'?body.cwd:'')
        if (action === 'config-read') return json(res, 200, { ok:true, ...configStore.read({cwd}) })
        if (action === 'config-history') return json(res, 200, { ok:true, history:configStore.history() })
        if (!['config-stage','config-commit','config-discard','config-revert'].includes(action)) return json(res,400,{ok:false,error:'unknown config action'})
        if (req.method !== 'POST') return json(res,405,{ok:false,error:`${action} requires POST`})
        try {
          const meta={source:'settings-ui',sessionId,cwd,reason:body.reason||action,userInstruction:body.userInstruction||body.user_instruction||''}
          if(action==='config-stage')return json(res,200,{ok:true,staged:await configStore.stage(body.change,{...meta,expected:body.expected})})
          if(action==='config-commit')return json(res,200,{ok:true,...await configStore.commit(body.id)})
          if(action==='config-discard')return json(res,200,{ok:true,...configStore.discard(body.id)})
          return json(res,200,{ok:true,...await configStore.revert(body.id,meta)})
        } catch(error) { return json(res,400,{ok:false,error:String(error?.message||error)}) }
      }
      if (['save-role', 'reset-role', 'remove-role', 'restore-role'].includes(action)) return json(res, 410, { ok: false, error: 'Direct role mutation shortcuts are retired. Use config-stage, review its actual before/after, then config-commit with the exact stage id or config-discard.' })
      if (action === 'session') {
        if (!live) return json(res, 404, { ok: false, error: 'session is not live' })
        const cls = classify(live, get, getTeamSettings())
        return json(res, 200, {
          ok: true,
          position: cls.position,
          depth: cls.depth,
          binding: bindings.get(sessionId),
          enforcement: enforcer.describe(live),
          doctrine: enforcer.doctrineFor(live),
          doctrineStatus: enforcer.doctrineStatus(live),
        })
      }
      return json(res, 400, { ok: false, error: `unknown action: ${action}` })
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error && error.message ? error.message : error) })
    }
  }
  // Optional carrier: the route mounts whenever webServer is (or becomes) available.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      scope.effect(() => scope.webServer.register({ kind: 'exact', path: API_ROUTE, handler }), 'team:route')
    })
  }
  return team.ops.whenReportImportSettled().then(result=>{
    if(['unavailable','partial','cancelled'].includes(result.status))throw new Error('Team report migration did not pass; installation must not be accepted: '+result.reason)
  }).then(()=>team.ops.whenReportTimeBackfillSettled()).then(fix=>{
    if(!fix||fix.status==='unavailable')throw new Error('Team report time backfill did not pass; installation must not be accepted: '+(fix?.reason||'unknown reason'))
    if(fix.remainingNullTimes>0)throw new Error('Team report time backfill left report records without a time: '+JSON.stringify((fix.rows||[]).filter(row=>row.decision==='skipped')))
  })
}
