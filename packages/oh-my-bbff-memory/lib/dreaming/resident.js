/** In-process scheduled Resident. Observer status is distinct from an open review run. */
import { existsSync, mkdirSync } from 'node:fs'
import { msg } from '../host-ref.js'
import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { PACKAGE_NAME } from '../identity.js'
import { createResidentSchedule, isResidentDelivery } from './schedule.js'
import { createDreamToolDefinitions, registerDreamTools, DREAM_TOOL_NAMES } from '../dream-tools.js'
import { RESIDENT_TITLE } from './state.js'
import { createLeaseHandle } from './lease.js'
import { DEFAULT_DATA, PROMPT_DEFAULTS, renderPrompt, shippedSettings } from '../defaults.js'
import { normalizeSettings, legacySettings } from '../settings.js'
import { byteLength, truncateUtf8 } from '../text.js'
import { readAgentService, traceAgentService } from '../scoped-services.js'
import { nativeToolSource, promptSectionConvention, sessionEventFacts, sessionHeaderFacts } from '../dsh-adapter.js'
export const RESIDENT_PRESET = 'oh-my-bbff-memory-dreaming'
export const SOURCE_KIND = DEFAULT_DATA.contract.sourceKind
const defaultVariables = { intervalHours: DEFAULT_DATA.fields.wakeIntervalHours.default }
export const WAKE_CONTRACT = renderPrompt(PROMPT_DEFAULTS.wakeContract, defaultVariables)
export const RESIDENT_PERSONA = renderPrompt(PROMPT_DEFAULTS.residentPersona, defaultVariables)
export const RESIDENT_CONTEXT = PROMPT_DEFAULTS.residentContext
const DREAM_SET = new Set(DREAM_TOOL_NAMES)
export const formatTime = value => Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : 'unknown'
function foreignSources(names) {
  const grouped = new Map()
  for (const name of names) {
    const result = nativeToolSource(name), plugin = result.complete && result.value.packageName ? result.value.packageName : 'unknown native/own-layer source'
    if (!grouped.has(plugin)) grouped.set(plugin, { plugin, tools: [], diagnostics: [] })
    grouped.get(plugin).tools.push(name);grouped.get(plugin).diagnostics.push(...result.diagnostics)
  }
  return [...grouped.values()]
}
export function buildWakePrompt({ runId, kind, now, decision, delta, inventory = [], budgetBytes = 0, totalBytes = 0, previousState, settings = shippedSettings(), candidates = { total: 0, pending: 0 }, maxBytes = settings.dreamPromptMaxBytes, variables = {} }) {
  const values = { ...variables, intervalHours: settings.wakeIntervalHours }, entries = delta?.entries || [], previewCount = settings.dreamWakeSessionLimit, lines = [
    '# Dreaming review ' + runId,
    renderPrompt(settings.prompts.wakeContract, values),
    `Wake kind: ${kind}. Now: ${formatTime(now)}. Previous wake: ${formatTime(previousState?.lastWakeAt)}.`,
    `Configured interval: ${settings.wakeIntervalHours} h; elapsed: ${Number.isFinite(decision?.elapsedMs) ? (decision.elapsedMs / 3600000).toFixed(2) : 'unknown'} h.`,
    '## Human input manifest',
  ]
  if (!delta || delta.stats?.unavailable || delta.stats?.failedReason || delta.stats?.blocked?.length) lines.push(renderPrompt(settings.prompts.wakeIncompleteNotice, { ...values, reason: delta?.stats?.failedReason || 'source unavailable or blocked; inspect dream_delta diagnostics' }))
  lines.push(`${entries.length} visible session(s), ${delta?.stats?.messages ?? 0} input fragment(s), ${delta?.stats?.bytes ?? 0} source byte(s).`)
  for (const entry of entries.slice(0, previewCount)) lines.push(`- ${entry.sessionId} cwd=${entry.cwd || 'unknown'} events ${entry.fromIndex}:${entry.fromOffset || 0}..${entry.toIndex}:${entry.toOffset || 0}; fragments=${entry.messageCount}, bytes=${entry.bytes}`)
  lines.push(`Preview omitted sessions: ${Math.max(0, entries.length - previewCount)}. Use paginated dream_delta/dream_page; unread input is retained. Unscanned candidate sessions: ${delta?.stats?.unscannedSessions || 0}.`)
  lines.push('## Untrusted proposals', `Candidate files: ${candidates.total ?? 'unknown'}, pending: ${candidates.pending ?? 'unknown'}. List/read opaque ids with dream_read; proposals are not accepted memory.`)
  lines.push('## Memory inventory')
  for (const file of inventory) lines.push(`- [${file.scope}] ${file.path || file.file} ${file.bytes} B`)
  lines.push(`Effective memory budget: ${totalBytes} / ${budgetBytes} B; mode=${settings.budgetMode}.`, '## Review', renderPrompt(settings.prompts.wakeReviewProcedure, values))
  const full = lines.join('\n\n')
  if (byteLength(full) <= maxBytes) return full
  const notice = renderPrompt(settings.prompts.wakeTruncationNotice, { omittedBytes: Math.max(0, byteLength(full) - maxBytes) }), allowance = Math.max(0, maxBytes - byteLength(notice) - byteLength('\n'))
  return byteLength(notice) >= maxBytes ? truncateUtf8(notice, maxBytes) : truncateUtf8(full, allowance) + '\n' + notice
}

export function createDreamingResident({ ctx, kernel, config = {}, getSettings, logger }) {
  const paths = kernel.paths, now = kernel.now || (() => Date.now()), current = () => getSettings ? normalizeSettings(getSettings()) : normalizeSettings({ ...(kernel.settings?.() || {}), ...legacySettings({ dream: config }), ...legacySettings(config) })
  const initial = current(), lease = createLeaseHandle({ lockPath: paths.lockPath, staleMs: initial.leaseStaleMs, heartbeatMs: initial.leaseHeartbeatMs, now, logger })
  const dreamDefinitions = createDreamToolDefinitions({ kernel, lease, logger, getSchedule: () => schedule.view() }), scopes = new Map(), lifecycle = []
  let handle = null, sessionAction = null, disposed = false, started = false, inFlight = false, lastResult = null, knownId = null, sessionPromise = null, presetPromise = null, unregisterPreset = null, startPromise = null, retryTimer = null
  const alive = () => { if (disposed) throw new Error('Resident was disposed during this operation.') }
  const warn = message => { try { logger?.warn?.('Memory Resident: ' + message) } catch {} }
  const service = name => { try { return ctx.get(name) } catch { return undefined } }
  function residentId() { const state = kernel.readState().state;if (!state.stateUnavailable && state.residentSessionId) knownId = state.residentSessionId;return knownId }
  function liveAgent() { const id = residentId();return id ? service('agents')?.get?.(id) || service('agents')?.list?.().find(agent => String(agent.id) === id) || handle?.agent : null }
  const routeFrom = (value, effortKey = 'reasoningEffort') => {
    if (!value || typeof value.provider !== 'string' || !value.provider || typeof value.model !== 'string' || !value.model) return null
    const effort = value[effortKey] ?? value.reasoningEffort ?? value.effort
    return { provider: value.provider, model: value.model, ...(typeof effort === 'string' && effort ? { reasoningEffort: effort } : {}) }
  }
  /**
   * The model the Resident actually runs on. The native session projection is the
   * single source: its wire view is `pending ?? lastUsed` — the owner's newest durable
   * selection intent, else the route the session's last request actually used. The
   * shared DSH global default is never sampled here, so another session's model switch
   * or a global-default change cannot move this Resident.
   */
  function residentSelection(agent) {
    if (!agent?.session) return null
    try {
      const route = routeFrom(agent.model?.current?.())
      return route ? { ...route, basis: 'resident-session-selection' } : null
    } catch { return null }
  }
  function desiredRoute(agent) {
    const value = current()
    if (value.residentModelMode === 'fixed') {
      const fixed = routeFrom({ provider: value.residentProvider, model: value.residentModel, reasoningEffort: value.residentReasoningEffort })
      return fixed ? { ...fixed, basis: 'memory-fixed' } : residentSelection(agent)
    }
    return residentSelection(agent)
  }
  /**
   * A fresh install has no Resident session yet, so no session-owned selection exists to
   * read. The first activation seeds the session with the native default selection — the
   * same route a new DSH session would use — and the session then owns it durably. After
   * creation the shared default is never sampled again, so it cannot move an established
   * Resident (see `residentSelection`).
   */
  function firstActivationRoute(existing) {
    if (existing || current().residentModelMode === 'fixed') return null
    const route = routeFrom(service('agentDefaultModel')?.currentSelection?.())
    return route ? { ...route, basis: 'dsh-default-first-activation' } : null
  }
  function selectRoute(agent) {
    const selected = desiredRoute(agent)
    if (!selected) throw new Error('Resident owner-selected route is unavailable; the DSH global default is not a fallback.')
    if (!agent.model?.select) throw new Error('Native agent.model.select() is unavailable.')
    const { basis, ...selection } = selected
    agent.model.select(selection)
    return selected
  }
  function variables() { return { intervalHours: current().wakeIntervalHours, globalMemoryPath: paths.memoryRoot, workspaceMemoryDirs: current().workspaceMemoryDirs.join(', ') } }
  function assertTools(agent) {
    if (disposed) throw new Error('Resident is disposed.')
    const tools = readAgentService(agent, 'tools', service('agentPresets')), owned = scopes.get(agent)?.definitions
    const missing = DREAM_TOOL_NAMES.filter(name => !tools?.get?.(name, agent) || (owned && tools.get(name, agent) !== owned.get(name)))
    if (missing.length) throw new Error('Resident private definitions unavailable: ' + missing.join(', '))
  }
  function install(agent) {
    if (disposed) throw new Error('Resident is disposed.')
    if (scopes.has(agent)) { selectRoute(agent);assertTools(agent);return }
    const agentCtx = agent.ctx, presets = service('agentPresets'), tools = traceAgentService(agent, 'tools', presets), prompt = traceAgentService(agent, 'systemPrompt', presets), disposers = []
    let released = false
    const release = () => { if (released) return;released = true;for (const dispose of disposers.reverse()) { try { dispose?.() } catch {} }scopes.delete(agent) }
    try {
      if (!tools.register || !tools.restrict || !tools.guard || !agentCtx.on) throw new Error('Required Agent-owned guard/registry APIs are unavailable.')
      // `allow: []` hides every inherited global tool for this Agent scope while its own
      // scoped dream_* registrations stay visible; the guard denies everything else.
      disposers.push(tools.restrict({ allow: [] }))
      disposers.push(tools.guard(exec => DREAM_SET.has(exec.name) ? undefined : 'Dreaming Resident may call only its seven dream_* tools; non-dream tool denied: ' + exec.name))
      selectRoute(agent)
      disposers.push(agentCtx.on('agent/pre-step', async (payload, next) => {
        const decision = await next()
        if (decision.kind === 'reject' || payload.signal?.aborted) return decision
        const message = payload.messages.find(item => isResidentDelivery(item, kernel.readState().state.scheduleTaskId))
        if (!message) return decision
        try {
          const review = await prepareReview(message)
          if (!review) return { kind: 'reject' }
          return { ...decision, messages: [...decision.messages, createUserMessage({ content: [{ type: 'text', text: review.prompt }], source: { kind: SOURCE_KIND, form: 'notice', summary: 'Dreaming review ' + review.runId, runId: review.runId } })] }
        } catch (error) { observeError(agent, error);throw error }
      }, { prepend: true }))
      const persona = promptSectionConvention('deployment-persona'), context = promptSectionConvention('subagent-delegation')
      if (!prompt.getSectionOrder || !prompt.getContextOrder) throw new Error('Native prompt ordering API is unavailable; no local numeric fallback is permitted.')
      disposers.push(prompt.section({ name: 'dreaming:resident-persona', order: prompt.getSectionOrder(persona.orderKey) + 1, text: () => renderPrompt(current().prompts.residentPersona, variables()) }))
      disposers.push(prompt.context({ name: 'dreaming:resident-context', order: prompt.getContextOrder(context.orderKey) + 1, text: () => renderPrompt(current().prompts.residentContext, variables()), required: true }))
      const unregister = registerDreamTools(agentCtx, { kernel, lease, logger, definitions: dreamDefinitions, tools });disposers.push(unregister)
      release.definitions = unregister.definitions;scopes.set(agent, release)
      disposers.push(agentCtx.effect?.(() => () => scopes.delete(agent), 'dreaming:scope-record'))
      assertTools(agent)
    } catch (error) { release();throw error }
  }
  function observeError(agent, error) {
    if (disposed || String(agent.id) !== residentId()) return
    const name = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(error.name) ? error.name : 'Error'
    try { kernel.recordFailure({ scope: 'agent', message: 'Resident Agent reported ' + name + '; inspect its session/host diagnostics for native details. Uncommitted proposals/input were preserved.' }) } catch { warn('Failure state could not be persisted; original recovery evidence was preserved.') }
    lastResult = { ran: false, reason: 'agent-error', error: name, at: now() }
  }
  function observeStatus(agent, status) {
    if (disposed || String(agent.id) !== residentId()) return
    try {
      const state = kernel.readState().state
      if (status === 'running') kernel.recordOutcome({ status: 'running', phase: 'running' })
      else if (state.activeRun && ['running', 'queued'].includes(state.execution?.phase)) kernel.recordFailure({ scope: 'uncommitted', message: 'Resident became idle without a commit; proposals and unread input remain available.' })
      else if (!state.activeRun && !state.execution?.lastError) kernel.recordOutcome({ status: 'idle', phase: 'idle' })
    } catch { warn('Execution state could not be recorded.') }
  }
  if (ctx.on) {
    lifecycle.push(ctx.on('schedule/resolve-agent', async (id, next) => String(id) === residentId() ? (await ensureSession()).agent : next()))
    lifecycle.push(ctx.on('agent/created', ({ agent }) => { if (!disposed && (scopes.has(agent) || (String(agent.id) === residentId() && service('agentPresets')?.presetForSession?.(agent.session) === RESIDENT_PRESET))) install(agent) }))
    lifecycle.push(ctx.on('agent/disposed', ({ agent }) => { scopes.get(agent)?.();if (handle?.agent === agent) handle = null }))
    lifecycle.push(ctx.on('agent/status', ({ agent, status }) => observeStatus(agent, status)))
    lifecycle.push(ctx.on('agent/error', ({ agent, error }) => observeError(agent, error)))
    lifecycle.push(ctx.on('session/event', (session, event) => {
      if (disposed || String(session.id) !== residentId()) return
      const decoded = sessionEventFacts(event)
      if (!decoded.complete || !decoded.value) return
      const facts = decoded.value
      if (facts.kind === 'request-header') {
        try { const state = kernel.readState().state;kernel.write({ ...state, execution: { ...state.execution, actualRoute: facts.route, actualRouteAt: now() } }) } catch {}
      }
    }))
  }
  async function ensureSession() {
    if (sessionPromise) return sessionPromise
    const pending = openSession();sessionPromise = pending
    try { return await pending } finally { if (sessionPromise === pending) sessionPromise = null }
  }
  async function ensurePreset() {
    if (presetPromise) return presetPromise
    const presets = service('agentPresets')
    if (!presets?.register || !presets?.mount || !presets?.presetForSession) throw new Error('Resident requires the native retained-preset registry.')
    if (typeof ctx.reflect?.trace !== 'function') throw new Error('Resident preset registration requires public mutation tracing.')
    const definition = { id: RESIDENT_PRESET, name: RESIDENT_TITLE, description: 'Memory-owned review boundary; unavailable when Memory is unloaded.', plugins: [{ id: 'dreaming-boundary', name: PACKAGE_NAME + '/resident-boundary' }] }
    const traced = ctx.reflect.trace(presets)
    const duplicate = error => /Duplicate agent preset/i.test(String(error?.message || error))
    const pending = (async () => {
      for (let attempt = 0; ; attempt++) {
        alive()
        try { const release = await traced.register(definition);unregisterPreset = release;return release }
        catch (error) {
          // A hot-reloaded generation may still be unregistering the previous definition.
          if (attempt >= 40 || disposed || !duplicate(error)) throw error
          await new Promise(resolve => { retryTimer = setTimeout(resolve, 25);retryTimer.unref?.() })
          retryTimer = null
          if (disposed) throw error
        }
      }
    })()
    presetPromise = pending
    try { return await pending } catch (error) { if (presetPromise === pending) presetPromise = null;throw error }
  }
  async function openSession() {
    const agents = service('agents'), presets = service('agentPresets')
    if (!agents?.create || !agents?.resume) throw new Error('Resident Agent factory is unavailable.')
    await ensurePreset();alive()
    const state = kernel.readState().state
    if (state.stateUnavailable) throw new Error('Resident identity state is unavailable; no replacement session will be created.')
    // A disposed generation must not mount the preset or install tools into a half-created
    // Agent: the native create callback can still run after dispose began.
    const setup = async (agentCtx, agent) => { alive();await presets.mount(agentCtx, RESIDENT_PRESET);alive();install(agent);return { commit: () => assertTools(agent) } }
    const closing = handle;let existing = liveAgent(), temporary = null
    if (!existing && state.residentSessionId) {
      // Resume only to recover the owner's durable route and saved preset, never a shared default.
      temporary = await agents.resume({ resumeSessionId: state.residentSessionId, agentOptions: {}, setup: async (agentCtx, agent) => { const saved = presets.presetForSession(agent.session);if (!saved) throw new Error('Historical Resident has no verifiable saved preset.');await presets.mount(agentCtx, saved) } })
      if (disposed) { await temporary.dispose();alive() }
      existing = temporary.agent
    }
    if (existing) {
      if (presets.presetForSession(existing.session) === RESIDENT_PRESET) {
        install(existing);handle = temporary || closing || { agent: existing, async dispose() {} };sessionAction = 'reused-resident-preset';return handle
      }
      if (existing.status === 'running') throw new Error('Resident preset migration waits for the existing review to become idle; no running review is interrupted.')
      try {
        await ctx.reflect.trace(presets).select(existing, RESIDENT_PRESET);alive()
        install(existing);handle = temporary || closing || { agent: existing, async dispose() {} };sessionAction = 'migrated-blank-session';return handle
      } catch (error) { if (error?.code !== 'agent-preset/locked') { await temporary?.dispose();throw error } }
    }
    const selected = desiredRoute(existing) || firstActivationRoute(existing)
    if (!selected) { await temporary?.dispose();throw new Error('Resident owner-selected route is unavailable; configure it explicitly before first activation. No global default is used.') }
    const { basis, ...agentOptions } = selected
    if (basis === 'dsh-default-first-activation') warn('First activation seeds the Resident from the native default selection; the Resident session owns the route from then on.')
    mkdirSync(paths.residentWorkspace, { recursive: true })
    const sessionId = 'session-' + randomUUID()
    handle = await agents.create({ sessionId, meta: { cwd: paths.residentWorkspace, agentPreset: RESIDENT_PRESET }, agentOptions, setup });knownId = sessionId
    if (disposed) { const closingHandle = handle;handle = null;await closingHandle?.dispose();alive() }
    const previous = state.residentSessionId, latest = kernel.readState().state
    kernel.write({ ...latest, residentSessionId: sessionId, ...(previous ? { previousResidentSessionIds: [...new Set([...(latest.previousResidentSessionIds || []), previous])], residentMigration: { from: previous, to: sessionId, at: now(), reason: 'native-preset-locked; retained fail-closed Resident boundary' } } : {}) });sessionAction = previous ? 'migrated-locked-session' : 'created'
    const title = readAgentService(handle.agent, 'sessionTitle', presets)
    if (title?.rename && handle.agent.ctx.reflect?.trace) handle.agent.ctx.reflect.trace(title).rename(handle.agent.session, RESIDENT_TITLE)
    if (previous && existing) {
      const previousTitle = readAgentService(existing, 'sessionTitle', presets)
      if (previousTitle?.rename && existing.ctx.reflect?.trace) existing.ctx.reflect.trace(previousTitle).rename(existing.session, 'BBFF Dreaming Resident (pre-0.2.2, retired)')
    }
    await temporary?.dispose();if (closing && closing !== temporary) await closing.dispose()
    if (disposed) { const pending = handle;handle = null;await pending?.dispose();throw new Error('Resident was disposed during setup.') }
    return handle
  }
  const schedule = createResidentSchedule({ getSchedule: () => service('schedule'), kernel, ensureSession, now })
  async function configure() {
    if (disposed) return
    const value = current();lease.configure({ staleMs: value.leaseStaleMs, heartbeatMs: value.leaseHeartbeatMs })
    const agent = liveAgent();if (agent && value.dreamEnabled) selectRoute(agent)
    if (!started) return
    const result = await schedule.configure()
    if (disposed) return result
    return result
  }
  /**
   * Adopt the native Schedule service now that it is active. The host calls this from an
   * optional `schedule` injection whenever the service appears or reloads; the adapter is
   * idempotent (it views the stored task id before creating anything), and an instance
   * that is already adopted is a no-op, so a reload re-adopts one task instead of adding a
   * second one. A disposed Resident never touches the native schedule again.
   */
  async function adoptSchedule() {
    if (disposed) return null
    if (startPromise) { try { await startPromise } catch {} }
    if (disposed || !started) return null
    const native = service('schedule')
    if (!native) return null
    if (schedule.adopted(native)) return schedule.view()
    return configure()
  }
  async function residentStatus() {
    const agent = liveAgent(), state = kernel.readState().state
    if (agent?.status === 'running') return 'running'
    if (state.execution?.lastError || state.stateUnavailable || (state.activeRun && ['running', 'queued'].includes(state.execution?.phase))) return 'failed'
    return 'idle'
  }
  // Compatibility entry points delegate to native Schedule, never a private due timer.
  async function tick() { return schedule.configure() }
  async function wake() {
    if (disposed) return { ran: false, reason: 'disposed' }
    if (!current().dreamEnabled) return { ran: false, reason: 'disabled' }
    const result = await schedule.run()
    if (disposed) return { ran: false, reason: 'disposed' }
    return { ran: !result.code, reason: result.code || 'native-schedule-run', schedule: result }
  }
  async function prepareReview(message) {
    if (disposed || !current().dreamEnabled || inFlight) return null
    const value = current(), state = kernel.readState().state
    if (state.stateUnavailable) return null
    const acquired = lease.acquire();if (!acquired.acquired) { lastResult = { ran: false, reason: 'lease:' + acquired.reason, at: now() };return null }
    inFlight = true
    try {
      // At-least-once native delivery keeps the message id; a restored inbox reuses
      // the same bound review instead of incrementing the clock/count a second time.
      const duplicate = state.scheduleLastMessageId === message.id && !!state.activeRun
      const runId = duplicate ? state.activeRun.runId : 'dream-' + new Date(now()).toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
      if (!duplicate) kernel.recordWake({ kind: 'native-schedule', runId, deltaId: null })
      const delta = await kernel.prepareWakeDelta({ retry: duplicate && !!state.activeRun?.deltaId })
      if (disposed) return null
      kernel.bindRunDelta({ runId, deltaId: delta.deltaId })
      if (disposed) return null
      kernel.write({ ...kernel.readState().state, scheduleLastMessageId: message.id })
      const review = kernel.reviewInventory(delta), prompt = buildWakePrompt({ runId, kind: 'native-schedule', now: now(), decision: kernel.decide().decision, delta, inventory: review.files, budgetBytes: review.budget.budgetBytes, totalBytes: review.budget.totalBytes, previousState: state, settings: value, candidates: kernel.candidates(), variables: variables() })
      if (disposed) return null
      kernel.recordOutcome({ status: 'running', phase: 'running', lastError: null, retry: null })
      const selected = desiredRoute(liveAgent())
      lastResult = { ran: true, runId, deltaId: delta.deltaId, kind: 'native-schedule', at: now(), sessionAction, sessions: delta.entries.length, promptBytes: byteLength(prompt), route: selected, scheduleTaskId: kernel.readState().state.scheduleTaskId }
      return { prompt, runId }
    } finally { inFlight = false }
  }
  function toolView() {
    const id = residentId(), agent = liveAgent()
    if (!agent) return { live: false, sessionId: id, names: [] }
    try { const rawNames = readAgentService(agent, 'tools', service('agentPresets')).schemas(agent).map(tool => tool.name).sort(), guarded = scopes.has(agent), foreignOwnScope = rawNames.filter(name => !DREAM_SET.has(name));return { live: true, sessionId: id, guarded, names: guarded ? rawNames.filter(name => DREAM_SET.has(name)) : rawNames, rawNames, foreignOwnScope, foreignSources: foreignSources(foreignOwnScope) } }
    catch { return { live: true, sessionId: id, guarded: false, names: [], error: 'Resident registry is unavailable.' } }
  }
  function modelView() {
    const agent = liveAgent(), state = kernel.readState().state, value = current(), presets = service('agentPresets')
    let actualPreset = null
    try { actualPreset = agent ? presets?.composedPreset?.(agent.ctx) || sessionHeaderFacts(agent.session?.header).value.presetId || null : null } catch {}
    const route = desiredRoute(agent), failure = state.execution?.lastError
    return { mode: value.residentModelMode, configured: value.residentModelMode === 'fixed' ? { provider: value.residentProvider, model: value.residentModel, effort: value.residentReasoningEffort || null } : null,
      // Informational only: the DSH global default is a shared setting and is not what this Resident follows.
      currentDefault: service('agentDefaultModel')?.currentSelection?.() || null,
      selectedForReview: route ? { provider: route.provider, model: route.model, ...(route.reasoningEffort ? { effort: route.reasoningEffort } : {}) } : null,
      routeSource: route?.basis || 'owner-route-unavailable',
      actualLastRequest: state.execution?.actualRoute || null, actualLastRequestAt: state.execution?.actualRouteAt || null,
      lastFailure: failure ? { at: Number.isFinite(failure.at) ? failure.at : null, scope: failure.scope || null, message: failure.message || null, route: state.execution?.actualRoute || null, routeAt: Number.isFinite(state.execution?.actualRouteAt) ? state.execution.actualRouteAt : null } : null,
      preset: actualPreset, defaultPreset: presets?.defaultId || null, presetMutable: false, presetReason: 'Native preset selection is locked after the first turn; no hot preset change is offered.', applies: DEFAULT_DATA.policies.modelApplyBoundary }
  }
  return {
    paths, title: RESIDENT_TITLE, get lease() { return lease }, get handle() { return handle },
    async start() {
      started = true
      const running = (async () => {
        const loaded = kernel.ensureInitialised();if (loaded.state.stateUnavailable) return
        await ensurePreset();alive()
        residentId()
        for (const agent of service('agents')?.list?.() || []) if (String(agent.id) === residentId() && service('agentPresets')?.presetForSession?.(agent.session) === RESIDENT_PRESET) install(agent)
        if (disposed) return
        return configure()
      })()
      startPromise = running
      try { return await running } finally { if (startPromise === running) startPromise = null }
    },
    configure, adoptSchedule, tick, wake, residentStatus, toolView, modelView, scheduleView: () => schedule.view(), decide: () => kernel.decide().decision, lastResult: () => lastResult,
    exposureFor({ sessionId, cwd } = {}) {
      const id = residentId(), normalize = value => { const path = typeof value === 'string' ? value.replace(/\\/g, '/').replace(/\/+$/, '') : '';return process.platform === 'win32' ? path.toLowerCase() : path }
      if (disposed || !id || sessionId !== id || !normalize(cwd) || normalize(cwd) !== normalize(paths.residentWorkspace)) return null
      const agent = liveAgent();if (agent) { if (!scopes.has(agent)) return null;try { assertTools(agent) } catch { return null } }
      return { tools: dreamDefinitions.map(({ name, description }) => ({ name, description })), exclusive: true, reason: msg('module.exposure.reason'), toggleable: false }
    },
    exists: () => existsSync(paths.dreamingRoot),
    async dispose() {
      disposed = true
      if (retryTimer !== null) { clearTimeout(retryTimer);retryTimer = null }
      for (const release of lifecycle.reverse()) { try { release?.() } catch {} }
      schedule.dispose()
      if (startPromise) {
        // Setup checks disposed after every awaited boundary; never let unload hang on it.
        let timer
        try { await Promise.race([startPromise.catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 2000);timer.unref?.() })]) } catch {}
        finally { if (timer !== undefined) clearTimeout(timer) }
      }
      const closing = handle;handle = null;let settled
      try { settled = closing?.dispose() } catch { warn('Resident handle disposal failed.') }
      for (const release of [...scopes.values()]) release()
      try { await settled } catch { warn('Resident teardown failed.') }
      lease.release()
      await presetPromise?.catch(() => {})
      await unregisterPreset?.()
    },
  }
}
