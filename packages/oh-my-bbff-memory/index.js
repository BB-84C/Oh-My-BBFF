/** Oh-My-BBFF Memory host: one settings/path authority, honest evidence and explicit controls. */
import { join } from 'node:path'
import { statSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createReadPartCache } from './lib/read-parts.js'
import { homedir } from 'node:os'
import { DEFAULT_DATA, PROMPT_DEFAULTS, renderPrompt, promptVariables } from './lib/defaults.js'
import { PACKAGE_NAME, MODULE_ID, VERSION, API_BASE, SETTINGS_SECTION } from './lib/identity.js'
import { settingsSnapshot, settingsPaths, validateSettingsPatch, saveSettingsPatch } from './lib/settings.js'
import { loadToggles, saveToggles, setToggle, setSessionMode, disabledKeysFor, isFileEnabled, parseToggleKey, togglesPaths } from './lib/toggles.js'
import { createRootResolver } from './lib/root-session.js'
import { authorizeRootAgent } from './lib/root-access.js'
import { resolveMemoryDirectories } from './lib/directories.js'
import { createMemoryInjection } from './lib/injection.js'
import { createBudgetResolver } from './lib/budget.js'
import { createTokenCounter } from './lib/token-counter.js'
import { createInstructionDisplayReader, estimateByteCap } from './lib/instruction-display.js'
import { createSessionReadCache } from './lib/session-reads.js'
import { truncateUtf8 } from './lib/text.js'
import { createHash } from 'node:crypto'
import { registerMemoryTools, MEMORY_TOOL_NAMES, MEMORY_TOOL_TRAITS } from './lib/memory-tools.js'
import { DREAM_TOOL_NAMES, DREAM_TOOL_TRAITS } from './lib/dream-tools.js'
import { dreamingPaths } from './lib/dreaming/state.js'
import { createSessionSource } from './lib/dreaming/sessions.js'
import { createDreamingKernel } from './lib/dreaming/kernel.js'
import { createDreamingResident } from './lib/dreaming/resident.js'
import { adoptNativeSchedule } from './lib/dreaming/adoption.js'
import { registerDreamingExposure } from './lib/dreaming/exposure.js'
import { createNativeInstructionReader } from './lib/native-instructions.js'
import { createPresetBudgetManager, MANAGED_BUDGET_SOURCE } from './lib/preset-budget.js'
import { createManagedSkill } from './lib/managed-skill.js'
import { registerFamilyModule, FAMILY_SERVICE } from './lib/bbff-contract.js'
import { msg } from './lib/host-ref.js'
import { localeError, messageOf, logText } from './lib/locale-message.js'

export const name = PACKAGE_NAME
export const inject = ['workingDirectory', 'webServer', 'tools']
export const FAMILY_DESCRIPTOR = Object.freeze({ contract: 1, id: MODULE_ID, title: msg('module.title'), description: msg('module.description'), version: VERSION, packageName: PACKAGE_NAME, apiBase: API_BASE, locale: { dir: 'locale' }, ui: { cards: ['memory', 'dreaming'], settings: true }, tools: [...MEMORY_TOOL_NAMES, ...DREAM_TOOL_NAMES], toolTraits: { ...MEMORY_TOOL_TRAITS, ...DREAM_TOOL_TRAITS }, permissionLayer: { title: msg('module.permissionLayer.title'), settingsSectionId: SETTINGS_SECTION }, exclusiveTools: { tools: [...DREAM_TOOL_NAMES], reason: msg('module.exclusiveTools.reason') } })
function readBody(req, maximum) {
  return new Promise((resolve, reject) => {
    let bytes = 0, settled = false;const chunks = []
    req.on('data', chunk => { if (settled) return;const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);bytes += buffer.length;if (bytes > maximum) { settled = true;reject(localeError(msg('error.httpBodyLimit')));return }chunks.push(buffer) })
    req.on('end', () => { if (!settled) { settled = true;resolve(Buffer.concat(chunks).toString('utf8')) } })
    req.on('error', error => { if (!settled) { settled = true;reject(error) } })
  })
}
const nonnegative = value => { const number = Number(value);return Number.isSafeInteger(number) && number >= 0 ? number : 0 }
export function apply(ctx, config = {}) {
  const home = process.env.DSH_HOME || join(homedir(), DEFAULT_DATA.storage.homeDefaultDirectory), paths = dreamingPaths({ home }), settingPath = settingsPaths({ home }), togglePath = togglesPaths({ home }), releases = []
  const get = key => { try { return ctx.get(key) } catch { return undefined } }, warn = message => { try { ctx.logger?.warn?.(PACKAGE_NAME + ': ' + message) } catch {} }
  const fileToken = path => { try { const value = statSync(path);return [value.ino,value.size,value.mtimeMs].join(':') } catch { return 'missing' } }
  let settingMemo = null, settingToken = null
  const settingsView = () => { const token = fileToken(settingPath.file);if (token !== settingToken || !settingMemo) { settingMemo = settingsSnapshot({ file: settingPath.file, legacy: config });settingToken = token }return settingMemo }, settings = () => settingsView().settings, toggles = () => loadToggles({ file: togglePath.file, strict: true })
  const polledReads = createReadPartCache({ getSettings: settings }), liveIds = new WeakMap();let liveSequence = 0
  const readKey = id => { const session = id && get('agents')?.get?.(id)?.session;let identity = null;if (session) { if (!liveIds.has(session)) liveIds.set(session, ++liveSequence);identity = liveIds.get(session) }return JSON.stringify([id || null,identity,session?.seq ?? null,fileToken(settingPath.file),fileToken(togglePath.file),fileToken(paths.statePath)]) }
  const resolver = createRootResolver({ getFamily: () => get(FAMILY_SERVICE), getAgents: () => get('agents'), getPersistence: () => get('sessionPersistence'), getSessionQuery: () => get('sessionQuery'), logger: ctx.logger })
  const resolveRoot = (id, hint = {}) => resolver.resolve(id, hint)
  const sessionReads = createSessionReadCache(ctx, { getSettings: settings, checkpointDirectory: join(home, DEFAULT_DATA.storage.settingsDirectory, DEFAULT_DATA.storage.sessionReadCheckpointDirectory) })
  const budget = createBudgetResolver({ getSettings: settings, getLlm: () => get('llm'), getDefaultModel: () => get('agentDefaultModel'),  })
  const tokenCounter = createTokenCounter(), measureReviewFile = createInstructionDisplayReader(tokenCounter)
  const injection = createMemoryInjection({ ctx, home, globalDir: paths.memoryRoot, getSettings: settings, resolveRoot, getToggles: toggles, readCache: sessionReads, resolveBudget: budget.resolve, tokenCounter, logger: ctx.logger })
  const source = createSessionSource({ getPersistence: () => get('sessionPersistence'), getQuery: () => get('sessionQuery'), getAgents: () => get('agents'), getRoot: id => resolveRoot(id), getSettings: settings, readCache: sessionReads, logger: ctx.logger })
  const kernel = createDreamingKernel({ paths, getSettings: settings, source, logger: ctx.logger }), resident = createDreamingResident({ ctx, kernel, getSettings: settings, logger: ctx.logger }), native = createNativeInstructionReader(ctx, { tokenCounter }), skill = createManagedSkill({ home, paths, getSettings: settings })
  const presetBudget = createPresetBudgetManager({ getProfile: () => get('profileContext') })
  const startupBudget = presetBudget.status();if (startupBudget.drift === true) warn(logText(startupBudget.reason))
  skill.ensure()
  const agentFor = id => id ? get('agents')?.get?.(id) || null : null
  const actorFs = id => { try { return agentFor(id)?.ctx?.get?.('fs') || get('fs') } catch { return undefined } }
  const publicRoot = root => { const { header, ...value } = root;return value }
  async function actorPermission(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId) return { allowed: false, reason: msg('error.rootSessionRequired') }
    const agent = agentFor(sessionId), header = agent?.session?.header || await resolver.headerOf(sessionId), resolution = await resolveRoot(sessionId, { ...(agent ? { agent } : {}), header })
    // Detached public header proof is not an Agent construction/resume.
    return authorizeRootAgent(agent || { id: sessionId, session: { header } }, resolution)
  }
  async function requireActor(sessionId) { const permission = await actorPermission(sessionId);if (!permission.allowed) throw localeError(permission.reason);return permission }
  const controlCapabilities = async sessionId => {
    const actor = await actorPermission(sessionId), state = kernel.readState().state
    return { settingsWrite: true, settingsAuthority: 'Explicit operator Web UI settings action; model tools retain their root-only write guard.', rootWrite: actor.allowed, wake: actor.allowed && settings().dreamEnabled && !state.stateUnavailable && (await resident.residentStatus()) !== 'running', historyRevert: actor.allowed && !state.stateUnavailable, reason: actor.allowed ? '' : actor.reason }
  }
  async function fullSettings(sessionId, measure = async (_name, fn) => fn(), signal) {
    let managed, effectiveBudgetView = null
    try { managed = await measure('managed-skill-metadata', () => skill.status()) } catch (error) { managed = { error: String(error.message), source: 'managed-skill-preview' } }
    try { const planned = await measure('effective-budget', () => injection.plan({ sessionId, agent: agentFor(sessionId), measure, signal }));effectiveBudgetView = planned.budget } catch (error) { effectiveBudgetView = { error: String(error?.message || error), diagnostics: [{ code: 'budget-preview-unavailable', reason: msg('diag.budget.previewUnavailable', { error: String(error?.message || error) }) }] } }
    return { ok: true, moduleId: MODULE_ID, ...settingsView(), paths: { settings: settingPath.file, activation: togglePath.file, ...paths }, managedSkill: managed, budget: effectiveBudgetView, nativePresetBudget: presetBudget.status(), capabilities: await measure('operator-authority', () => controlCapabilities(sessionId)) }
  }
  async function inventory(sessionId, measure = async (_name, fn) => fn(), signal) {
    const agent = agentFor(sessionId), planned = await injection.plan({ sessionId, agent, measure, signal }), actual = injection.receipt(agent), modeReceipts = actual ? planned.mode === 'full' ? [actual.full].filter(Boolean) : [actual.index, actual.route].filter(Boolean) : [], admittedFiles = modeReceipts.flatMap(receipt => receipt.files || []), plannedFiles = planned.components.flatMap(component => component.files)
    const memory = planned.scanned.allFiles.map(file => {
      const enabled = !planned.activationUnavailable && planned.root.resolved ? isFileEnabled(file, planned.disabled) : null, allocation = plannedFiles.find(row => row.key === file.key), admission = admittedFiles.find(row => row.key === file.key), omitted = planned.budget.omitted.find(row => row.key === file.key), duplicate = planned.duplicates.find(row => row.key === file.key)
      const sameSource = admission && file.sourceSha1 && admission.sourceSha1 === file.sourceSha1
      const samePrefix = admission?.admittedSha1 && typeof file.content === 'string' && createHash('sha1').update(truncateUtf8(file.content, admission.includedBytes)).digest('hex') === admission.admittedSha1
      const admissionCurrent = admission?.status === 'truncated' ? samePrefix : sameSource
      return { key: file.key, scope: file.scope, file: file.name, directory: file.directory, path: file.absPath, exists: true, bytes: file.bytes, enabled, toggleable: settings().injectEnabled && enabled !== null && !planned.root.cached && !file.shadowedBy && !file.archived, readOnly: file.readOnly || false, shadowedBy: file.shadowedBy || null, archived: file.archived || false, status: file.status || 'active', kind: file.archived ? 'archive-marker' : 'memory', readStatus: file.readStatus, plannedStatus: file.archived ? 'archived (shadows legacy file)' : file.shadowedBy ? 'shadowed' : enabled === false ? 'disabled' : duplicate ? 'duplicate' : allocation?.status || omitted?.reason || 'not-represented', plannedIncludedBytes: allocation?.includedBytes || 0, admissionStatus: admissionCurrent ? admission.status : admission ? 'stale-source' : 'unknown', admittedBytes: admissionCurrent ? admission.includedBytes : null, sourceVersionMatches: !!sameSource, admittedPrefixMatches: !!samePrefix, duplicateOf: duplicate?.duplicateOf || null }
    })
    const instructionFacts = await measure('native-instruction-config-and-discovery', () => native.read(sessionId, { signal }))
    const metadata = settingsView(), operator = await measure('operator-authority', () => controlCapabilities(sessionId))
    return { ok: true, defaults: metadata.defaults, sources: metadata.sources, policies: metadata.policies, fields: metadata.fields, sessionId, rootSessionId: planned.root.rootSessionId, root: publicRoot(planned.root), cwd: planned.cwd, mode: planned.mode, modeSource: planned.modeSource, enabled: settings().injectEnabled, settings: settings(), paths: resolveMemoryDirectories({ home, cwd: planned.cwd, workspaceDirs: planned.cwd ? settings().workspaceMemoryDirs : [] }), budget: planned.budget, retainedManagedSurfaceBytes: injection.observedSurfaceBytes(agent), admission: { known: !!actual, receipts: modeReceipts, scope: DEFAULT_DATA.policies.budgetScope }, memory, agents: instructionFacts.value.files, nativeInstructions: instructionFacts, nativePresetBudget: presetBudget.status(), diagnostics: planned.diagnostics, route: planned.route, capabilities: { ...operator, activationWrite: settings().injectEnabled && planned.root.resolved && !planned.root.cached && !planned.activationUnavailable, modeWrite: planned.root.resolved && !planned.root.cached && !planned.activationUnavailable, reason: !settings().injectEnabled ? msg('error.injectionDisabled') : planned.root.reason || '' }, at: Date.now() }
  }
  async function dreamingStatus(sessionId, measure = async (_name, fn) => fn(), signal) {
    const status = await measure('dreaming-control-files-inventory-lease', () => kernel.statusSync({ lease: resident.lease.describe() }))
    const metadata = settingsView(), schedule = await resident.scheduleView()
    status.nextDueAt = schedule.nextDueAt;status.due = schedule.available && schedule.status === 'active' && schedule.nextDueAt <= Date.now();status.schedule = schedule
    const reviewMeasurements = await measure('review-byte-budget-token-estimate', async () => { const review = kernel.reviewInventory(), fs = actorFs(sessionId), rows = [];for (const file of review.files) rows.push(await measureReviewFile(fs, file.path, { signal, nativeMaxSourceBytes: settings().memorySourceMaxBytes }));return rows })
    status.budget = { ...status.budget, tokenEstimate: estimateByteCap(status.budget.budgetBytes, reviewMeasurements), measuredFiles: reviewMeasurements.filter(row => row.readable).length, unreadableFiles: reviewMeasurements.filter(row => !row.readable).length, tokenizer: tokenCounter.basis(null) }
    return { ok: true, defaults: metadata.defaults, sources: metadata.sources, policies: metadata.policies, ...status, residentStatus: await measure('resident-observed-status', () => resident.residentStatus()), lastResult: resident.lastResult(), residentTools: await measure('resident-operational-tool-view', () => resident.toolView()), model: await measure('model-and-retained-preset-facts', () => resident.modelView()), capabilities: await measure('operator-authority', () => controlCapabilities(sessionId)) }
  }
  function seed(name, sessionId) {
    const metadata = settingsView(), base = { ok: true, sessionId, settings: metadata.settings, defaults: metadata.defaults, sources: metadata.sources, policies: metadata.policies, fields: metadata.fields, readonlyPrompts: metadata.readonlyPrompts, groups: metadata.groups, limits: metadata.limits, storage: metadata.storage, source: metadata.source, diagnostics: metadata.diagnostics, settingDescriptors: metadata.settingDescriptors }
    if (name === 'settings') return { ...base, moduleId: MODULE_ID, managedSkill: { status: 'pending', reason: msg('seed.skillPending') }, budget: { status: 'pending', reason: msg('seed.budgetPending') }, capabilities: { settingsWrite: true, rootWrite: null, reason: msg('seed.authorityPending') } }
    if (name === 'dreamStatus') return { ...base, dreaming: null }
    if (name === 'history') return { ...base, history: null }
    if (name === 'candidates') return { ...base, candidates: null }
    return { ...base, memory: null, nativeInstructions: { status: 'pending', reason: msg('seed.nativePending'), admissionKnown: false } }
  }
  const polled = (name, id, build) => polledReads.read(name, id, readKey(id), build, () => seed(name, id))
  let queue = Promise.resolve()
  const serial = task => { const result = queue.then(task, task);queue = result.then(() => undefined, () => undefined);return result }
  async function actions(body) {
    const action = body?.action
    if (action === 'memory-settings') return serial(async () => {
      const validated = validateSettingsPatch(settings(), body.settings)
      if (!validated.ok) throw localeError(validated.error)
      saveSettingsPatch({ file: settingPath.file, patch: body.settings, settings: validated.settings });if (Object.keys(body.settings || {}).some(key => ['dreaming', 'model'].includes(DEFAULT_DATA.fields[key]?.group) || key.startsWith('lease'))) await resident.configure();polledReads.invalidate();const response = await fullSettings(body.sessionId);polledReads.publish('settings', body.sessionId, readKey(body.sessionId), response);return response
    })
    if (action === 'memory-prompts-preview') {
      let value = settings()
      const patch = { ...(body.settings || {}), ...(body.prompts ? { prompts: body.prompts } : {}) }
      if (Object.keys(patch).length) { const checked = validateSettingsPatch(value, patch);if (!checked.ok) throw localeError(checked.error);value = checked.settings }
      const variables = { intervalHours: value.wakeIntervalHours, globalMemoryPath: paths.memoryRoot, workspaceMemoryDirs: value.workspaceMemoryDirs.join(', '), budgetRatio: value.budgetWindowRatio, windowTokens: '', mode: value.defaultMode }, previews = {}, diagnostics = []
      for (const [key, text] of Object.entries(value.prompts)) { previews[key] = renderPrompt(text, variables);for (const variable of promptVariables(text)) if (!Object.hasOwn(variables, variable)) diagnostics.push({ key, reason: msg('error.promptPreviewPlaceholder', { variable }) }) }
      return { ok: true, previews, diagnostics, saved: false }
    }
    if (action === 'memory-toggle' || action === 'memory-mode') return serial(async () => {
      const current = await inventory(body.sessionId)
      if (!current.root.resolved || current.root.cached) throw localeError(msg('error.freshRootRequired'))
      const before = toggles()
      if (action === 'memory-toggle') {
        if (!settings().injectEnabled) throw localeError(msg('error.injectionDisabled'))
        if (!parseToggleKey(body.key) || typeof body.enabled !== 'boolean' || !current.memory.some(file => file.key === body.key)) throw localeError(msg('error.unknownInventoryKey'))
        saveToggles({ file: togglePath.file, toggles: setToggle({ toggles: before, rootSessionId: current.rootSessionId, key: body.key, enabled: body.enabled }) })
      } else saveToggles({ file: togglePath.file, toggles: setSessionMode({ toggles: before, rootSessionId: current.rootSessionId, mode: body.mode === 'default' ? null : body.mode }) })
      polledReads.invalidate();const response = await inventory(body.sessionId);polledReads.publish('inventory', body.sessionId, readKey(body.sessionId), response);polledReads.publish('routePreview', body.sessionId, readKey(body.sessionId), response);return response
    })
    if (action === 'memory-skill-preview') return { ok: true, ...skill.preview(), applied: false }
    if (action === 'native-budget-preview') { const preview = body.sourceId === MANAGED_BUDGET_SOURCE ? presetBudget.preview(body) : native.preview(body);return { ok: true, ...(preview.kind === 'declaring-composition' ? presetBudget.preview(body) : preview), applied: false } }
    if (action === 'native-budget-apply') { await requireActor(body.sessionId);if (body.confirm !== true) throw localeError(msg('error.nativeConfirmRequired'));return serial(async () => { const response = { ok: true, ...await (body.sourceId === MANAGED_BUDGET_SOURCE ? presetBudget.apply(body) : native.apply(body)) };polledReads.invalidate();return response }) }
    if (action === 'dream-wake') { await requireActor(body.sessionId);if (body.confirm !== true) throw localeError(msg('error.wakeConfirmRequired'));return { ok: true, result: await resident.wake({ kind: 'manual-user', force: true }), dreaming: await dreamingStatus(body.sessionId) } }
    if (action === 'dream-revert-preview') return { ok: true, preview: kernel.previewRevert({ id: body.id }), applied: false }
    if (action === 'dream-revert-apply') { await requireActor(body.sessionId);if (body.confirm !== true) throw localeError(msg('error.revertConfirmRequired'));return serial(() => { const response = { ok: true, result: kernel.revert(body), applied: true };polledReads.invalidate();return response }) }
    if (action === 'candidate-review') { await requireActor(body.sessionId);if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > settings().stageReasonMaxChars) throw localeError(msg('error.reviewReasonRequired'));return { ok: true, result: kernel.decideCandidate({ ids: body.ids, status: body.status, reason: body.reason }) } }
    throw localeError(msg('error.unknownAction'))
  }
  const web = get('webServer')
  if (web?.register) {
    const route = { kind: 'exact', path: API_BASE, handler: async (req, res) => {
      const requestStarted = performance.now()
      let status = 200, output
      try {
        const url = new URL(req.url || API_BASE, (() => { try { return web.getOrigin() } catch { return 'http://memory.invalid' } })()), sessionId = url.searchParams.get('sessionId') || undefined
        if (req.method === 'POST') output = await actions(JSON.parse(await readBody(req, settings().httpBodyMaxBytes)))
        else if (req.method && req.method !== 'GET') { status = 405;output = { ok: false, error: msg('error.methodNotAllowed') } }
        else if (url.searchParams.has('settings')) output = polled('settings', sessionId, (measure, signal) => fullSettings(sessionId, measure, signal))
        else if (url.searchParams.get('dream') === 'wake') { if (url.searchParams.get('run') === '1') { status = 405;output = { ok: false, error: msg('error.wakeRequiresPost') } } else output = { ok: true, dryRun: true, decision: resident.decide(), enabled: settings().dreamEnabled, autoWake: settings().dreamAutoWake } }
        else if (url.searchParams.has('history')) { const cursor = nonnegative(url.searchParams.get('cursor'));output = polled('history', JSON.stringify([sessionId,cursor]), measure => measure('history-bounded-window', () => ({ ok: true, history: kernel.history({ cursor, limit: settings().changelogPageSize }) }))) }
        else if (url.searchParams.has('candidates')) { const cursor = nonnegative(url.searchParams.get('cursor')), includeReviewed = url.searchParams.get('reviewed') === '1';output = polled('candidates', JSON.stringify([sessionId,cursor,includeReviewed]), measure => measure('candidate-metadata-inventory', () => ({ ok: true, candidates: kernel.candidates({ cursor, includeReviewed }) }))) }
        else if (url.searchParams.has('candidateId')) output = { ok: true, candidate: kernel.read({ candidateId: url.searchParams.get('candidateId') }) }
        else if (url.searchParams.has('dream')) { if (!['state', 'status', '1'].includes(url.searchParams.get('dream'))) throw localeError(msg('error.unknownDreamAction'));output = polled('dreamStatus', sessionId, async (measure, signal) => ({ ok: true, dreaming: await dreamingStatus(sessionId, measure, signal) })) }
        else if (url.searchParams.get('route') === 'preview') { if (!sessionId) throw localeError(msg('error.sessionRequired'));output = polled('routePreview', sessionId, (measure, signal) => inventory(sessionId, measure, signal)) }
        else if (url.searchParams.has('inventory') || sessionId) output = polled('inventory', sessionId, (measure, signal) => inventory(sessionId, measure, signal))
        else output = polled('status', undefined, async (measure, signal) => ({ ok: true, moduleId: MODULE_ID, version: VERSION, settings: settings(), dreaming: await dreamingStatus(undefined, measure, signal), paths, diagnostics: settingsView().diagnostics }))
      } catch (error) { status = 400;output = { ok: false, error: messageOf(error), source: MODULE_ID } }
      if (output?.read) output.read.responsePathMs = performance.now() - requestStarted
      res.statusCode = status;res.setHeader('content-type', 'application/json; charset=utf-8');res.end(JSON.stringify(output))
    } }
    try { const release = web.register(route);if (typeof release === 'function') releases.push(release) } catch { warn('API route collision; no private route table was mutated.') }
  }
  releases.push(registerMemoryTools(ctx, { dshHome: home, getSettings: settings, resolveRoot: (id, exec) => resolveRoot(id, { agent: exec?.agent, header: exec?.agent?.session?.header }), getDisabledKeys: async exec => { const root = await resolveRoot(exec.agent.id, { agent: exec.agent });if (!root.resolved) throw localeError(msg('error.rootUnavailable'));return disabledKeysFor(toggles(), root.rootSessionId) }, getNativeInstructionFacts: exec => native.read(exec.agent.id) }))
  try { registerFamilyModule(ctx, FAMILY_DESCRIPTOR);registerDreamingExposure(ctx, resident) } catch { warn('Optional family registration is unavailable.') }
  if (ctx.on) {
    // agent/created is a Cordis serial notification: returning a value (attach's true)
    // makes Cordis stop dispatch and silently starves every later listener (Team role
    // init). Keep attach's own return for direct callers, but never return it here.
    releases.push(ctx.on('schedule/changed', () => { polledReads.invalidate() }))
    releases.push(ctx.on('agent/created', ({ agent }) => { injection.attach(agent) }))
    releases.push(ctx.on('agent/disposed', ({ agent }) => { injection.detach(agent);resolver.dispose(agent) }))
    releases.push(ctx.on('session/event', (session, event) => injection.observe(session, event)))
    // Bootstrap carriers not seen at agent/created. Mutation/hook ownership stays
    // Agent-local; this global observer never mutates a scoped native service.
    releases.push(ctx.on('agent/pre-step', (payload, next) => {
      if (injection.isAttached(payload.agent)) return next()
      if (injection.attach(payload.agent)) return injection.preStep(payload, next)
      return next()
    }))
  }
  for (const agent of get('agents')?.list?.() || []) injection.attach(agent)
  // Native `schedule` is adopted as an optional dependency: it may be composed after
  // Memory (fresh-install load order) or reloaded while Memory stays loaded, and a
  // profile without it must still activate Memory. See lib/dreaming/adoption.js.
  const scheduleFiber = adoptNativeSchedule({ ctx, resident, warn })
  void resident.start().catch(error => warn('Native Resident schedule setup failed: ' + String(error.message || error)))
  let cleaned = false
  // Dispose in ownership order: stop the Resident generation first (schedule, setup and
  // dream work), then the read models, injection hooks and the shared session cache.
  const cleanup = async () => {
    if (cleaned) return;cleaned = true
    // Stop schedule adoption before the Resident generation: no new adoption may start
    // while the adapter, setup and dream work are being torn down.
    try { await scheduleFiber?.dispose?.() } catch { warn('Native schedule adoption disposal failed; the Resident teardown still runs.') }
    try { await resident.dispose() } catch { warn('Resident disposal failed; remaining resources are still released.') }
    polledReads.dispose()
    try { await injection.dispose() } catch { warn('Injection disposal failed.') }
    sessionReads.dispose()
    for (const release of releases.reverse()) { try { release?.() } catch {} }
  }
  if (ctx.effect) ctx.effect(() => cleanup, 'memory:host-lifecycle')
  return cleanup
}
