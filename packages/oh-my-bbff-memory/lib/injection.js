/** Memory-owned managed frames. Only post-commit observations establish admission. */
import { createHash } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { collectMemory, dedupeMemoryFiles, renderBaseline, frameReminder, byteLength, truncateUtf8, SOURCE_KIND } from './store.js'
import { buildMemoryIndex, routeMemory, renderIndexText, renderRoutedText } from './router.js'
import { effectiveBudget, renderPrompt } from './defaults.js'
import { disabledKeysFor, filterActiveFiles, modeForSession } from './toggles.js'
import { sessionEventFacts } from './dsh-adapter.js'
import { createSessionReadCache } from './session-reads.js'
import { createTokenCounter } from './token-counter.js'
import { createVisibleReceiptReader } from './visible-receipts.js'
import { estimateByteCap } from './instruction-display.js'
import { msg } from './host-ref.js'
const identity = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const owned = message => message?.source?.kind === SOURCE_KIND && ['full', 'routed'].includes(message.source.memoryMode)
const fitFrame = (text, maximum) => { const framed = frameReminder(text);return byteLength(framed) <= maximum ? framed : '' }
function boundedRoute(routes, maximum, prompts) {
  const matches = routes.matches.map(match => ({ ...match })), omitted = []
  const textOf = () => matches.length ? frameReminder(renderRoutedText({ ...routes, matches }, { intro: prompts.routerRoutedIntro })) : ''
  let text = textOf()
  while (byteLength(text) > maximum && matches.length > 1) { omitted.push(matches.pop());text = textOf() }
  if (byteLength(text) > maximum && matches.length) {
    const match = matches[0], original = match.content
    let low = 0, high = byteLength(original), best = null
    while (low <= high) {
      const count = Math.floor((low + high) / 2);match.content = truncateUtf8(original, count);match.truncated = true;match.includedBytes = byteLength(match.content)
      if (byteLength(textOf()) <= maximum) { best = { ...match };low = count + 1 } else high = count - 1
    }
    if (best?.includedBytes) matches[0] = best
    else { omitted.push(...matches);matches.length = 0 }
    text = textOf()
  }
  return { text, matches, omitted }
}
export function createMemoryInjection({ ctx, home, globalDir, getSettings, resolveRoot, getToggles, readCache, resolveBudget, logger, tokenCounter }) {
  const counter = tokenCounter || createTokenCounter(), committedText = createVisibleReceiptReader(counter, { getSessionQuery: () => { try { return ctx.get('sessionQuery') } catch { return undefined } } })
  const reader = readCache || createSessionReadCache(ctx, { getSettings }), scans = new Map(), states = new WeakMap(), pending = new WeakMap(), receipts = new WeakMap(), hooks = new Map(), lastPlans = new WeakMap(), models = new WeakMap(), surfaces = new WeakMap()
  let disposed = false
  const get = name => { try { return ctx.get(name) } catch { return undefined } }
  const warn = text => { try { logger?.warn?.('Memory injection: ' + text) } catch {} }
  function activeSeqs(session) {
    const surface = session.surface
    if (!surface?.nodes) return null
    let view = surfaces.get(session)
    if (!view || view.generation !== surface.replaceGeneration || view.length > surface.nodes.length) view = { generation: surface.replaceGeneration, length: 0, set: new Set() }
    for (let index = view.length; index < surface.nodes.length; index++) view.set.add(surface.nodes[index])
    view.length = surface.nodes.length;surfaces.set(session, view);return view.set
  }
  function stateFor(session, model = models.get(session)) {
    if (!states.has(session)) states.set(session, { mode: null, signatures: {}, variants: {}, routed: {}, hintSeen: false, hydrated: -1 })
    const state = states.get(session)
    if (model && state.hydrated !== model.totalEvents) {
      const active = activeSeqs(session), admitted = receipts.get(session) || {}
      for (const frame of model.owned) {
        if (active && !active.has(frame.seq)) continue
        if (!frame.component || !frame.identity) continue
        state.mode = frame.mode;state.signatures[frame.component] = frame.identity;state.variants[frame.component] = frame.variant
        if (frame.trace) {
          if (admitted[frame.component]?.seq !== frame.seq) admitted[frame.component] = { ...frame.trace, admittedAt: null, seq: frame.seq, source: 'genuine-normalized-committed-source' }
          if (frame.component === 'route') for (const file of frame.trace.files) state.routed[file.key] = file.admittedSha1
          if (frame.hint) state.hintSeen = true
        }
      }
      state.hydrated = model.totalEvents;if (Object.keys(admitted).length) receipts.set(session, admitted)
    }
    return state
  }
  function queries(model, count, incoming = []) {
    const history = model ? (model.recent || []).map(fact => fact.value.text) : []
    // This is the independent PUBLIC Message API, not a persisted event decoder.
    const current = incoming.filter(message => message?.role === 'user' && message.source?.kind === 'user').map(message => message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')).filter(text => text.trim())
    return [...history, ...current].slice(-count)
  }
  async function plan({ sessionId, agent, queryTexts, incomingMessages = [], measure = async (_name, fn) => fn(), signal } = {}) {
    const stop = () => { if (disposed) throw new Error('Memory injection is disposed.');signal?.throwIfAborted?.() }
    const step = async (name, fn) => { stop();const value = await measure(name, fn);stop();return value }
    stop()
    const settings = getSettings(), root = await step('shared-root-resolution', () => resolveRoot(sessionId, { agent }))
    let model = null, readError = null
    if (agent) { try { model = await step('normalized-session-suffix', () => reader.read(sessionId, { signal, purpose: 'poll' }));models.set(agent.session, model) } catch (error) { readError = 'Normalized session facts unavailable: ' + String(error.message) } }
    let toggles, activationUnavailable = false
    try { toggles = getToggles() } catch { toggles = { sessions: {} };activationUnavailable = true }
    const disabled = disabledKeysFor(toggles, root.rootSessionId), cwd = root.resolved ? root.cwd : null
    const scanned = await step('memory-store-files', () => collectMemory({ globalDir, cwd, workspaceDirs: cwd ? settings.workspaceMemoryDirs : [], cache: scans, maxSourceBytes: settings.memorySourceMaxBytes })), all = scanned.allFiles, active = filterActiveFiles(all, disabled), unique = dedupeMemoryFiles(active), demanded = effectiveBudget(settings, all), resolvedBudget = resolveBudget ? await step('budget-resolution', () => resolveBudget({ agent, sessionId, measure, signal })) : null, budget = { ...demanded, ...(resolvedBudget || {}), totalBytes: demanded.totalBytes }
    const modeOverride = modeForSession(toggles, root.rootSessionId), mode = modeOverride || settings.defaultMode, diagnostics = [...scanned.warnings.map(reason => ({ reason })), ...(budget.diagnostics || [])]
    if (readError) diagnostics.push({ reason: readError })
    const variables = { intervalHours: settings.wakeIntervalHours, globalMemoryPath: globalDir, workspaceMemoryDirs: settings.workspaceMemoryDirs.join(', '), budgetRatio: budget.ratio, windowTokens: budget.windowTokens ?? '', mode }, prompts = Object.fromEntries(Object.entries(settings.prompts).map(([key, value]) => [key, renderPrompt(value, variables)]))
    const eligible = settings.injectEnabled && root.resolved === true && !activationUnavailable
    if (activationUnavailable) diagnostics.push({ reason: msg('diag.injection.activationUnreadable') })
    if (!eligible) diagnostics.push({ reason: !settings.injectEnabled ? msg('diag.injection.disabled') : root.reason || msg('diag.injection.rootUnknown') })
    if (root.cached) diagnostics.push({ reason: msg('diag.injection.cachedRoot'), cachedAt: root.cachedAt })
    const components = [], omitted = [], truncated = [], state = agent?.session ? stateFor(agent.session) : { mode: null, signatures: {} }
    let usedBytes = 0, route = null, index = null, usedTokens = 0, tokenResult = null
    const initialDiagnostics = diagnostics.length
    function renderAllocation(byteLimit) {
    components.length = 0;omitted.length = 0;truncated.length = 0;usedBytes = 0;route = null;index = null;diagnostics.length = initialDiagnostics
    if (eligible && mode === 'full') {
      let replacement = state.variants?.full?.replacement === true || !!(state.mode && state.mode !== mode)
      let rendered = renderBaseline([...unique.files, ...unique.unreadable], byteLimit, { prompts, replacement })
      if (rendered && state.signatures.full && state.signatures.full !== identity({ mode, text: rendered.text }) && !replacement) { replacement = true;rendered = renderBaseline([...unique.files, ...unique.unreadable], byteLimit, { prompts, replacement }) }
      if (rendered) {
        omitted.push(...rendered.omitted);truncated.push(...rendered.truncated);diagnostics.push(...rendered.warnings.map(reason => ({ reason })))
        usedBytes = rendered.usedBytes
        components.push({ component: 'full', signature: identity({ mode, text: rendered.text }), text: rendered.text, variant: { replacement }, files: rendered.rendered.map(file => ({ key: file.key, path: file.absPath, sourceSha1: file.sourceSha1, admittedSha1: file.admittedSha1, includedBytes: file.includedBytes, originalBytes: file.originalBytes, status: file.truncated ? 'truncated' : 'loaded' })), baseline: true })
      }
    } else if (eligible) {
      index = buildMemoryIndex(unique.files)
      const visibleEntries = [...index.entries]
      let indexText = frameReminder(renderIndexText({ ...index, entries: visibleEntries }, { intro: prompts.routerIndexIntro }))
      while (visibleEntries.length && byteLength(indexText) > byteLimit) { visibleEntries.pop();indexText = frameReminder(renderIndexText({ ...index, entries: visibleEntries }, { intro: prompts.routerIndexIntro })) }
      if (byteLength(indexText) > byteLimit) indexText = ''
      const transitionUsed = state.variants?.index?.transition === true || !!(state.mode && state.mode !== mode)
      if (transitionUsed) {
        const transition = renderPrompt(prompts.modeTransitionIntro, { mode })
        const replaced = fitFrame(transition + '\n\n' + renderIndexText({ ...index, entries: visibleEntries }, { intro: prompts.routerIndexIntro }), byteLimit)
        indexText = replaced || fitFrame(transition, byteLimit)
      }
      const indexBytes = byteLength(indexText), texts = queryTexts || queries(model, settings.routeWindowTurns, incomingMessages)
      const routes = routeMemory({ index, queryTexts: texts, topK: settings.routeTopK, maxBytes: settings.routeMaxBytes }), routed = boundedRoute(routes, Math.max(0, Math.min(settings.routeMaxBytes, byteLimit - indexBytes)), prompts)
      const selectedMatches = [...routed.matches], freshMatches = routed.matches.filter(match => state.routed?.[match.entry.key] !== createHash('sha1').update(match.content).digest('hex'))
      routed.matches = freshMatches
      let routeText = freshMatches.length ? frameReminder(renderRoutedText({ ...routes, matches: freshMatches }, { intro: prompts.routerRoutedIntro })) : ''
      const hint = !routes.matches.length && texts.length > 0 && !state.hintSeen && !!state.signatures.index
      if (hint) routeText = fitFrame(prompts.routerNoMatchHint, Math.max(0, byteLimit - indexBytes))
      route = { mode, modeSource: modeOverride ? 'root-session' : 'default', index: index.entries.map(entry => ({ key: entry.key, scope: entry.scope, file: entry.file, name: entry.name, description: entry.description, headings: entry.headings, bytes: entry.bytes })), window: { turns: settings.routeWindowTurns, messages: texts.length }, topK: settings.routeTopK, maxBytes: settings.routeMaxBytes, matches: selectedMatches.map(match => ({ retained: !freshMatches.includes(match), key: match.entry.key, scope: match.entry.scope, file: match.entry.file, path: match.entry.path, score: match.score, why: match.whyText, includedBytes: byteLength(match.content), truncated: match.truncated })), considered: routes.considered, totalBytes: routed.matches.reduce((sum, match) => sum + byteLength(match.content), 0), omittedMatches: routed.omitted.length, indexOmittedEntries: index.entries.length - visibleEntries.length }
      components.push({ component: 'index', signature: identity({ mode, text: indexText }), text: indexText, variant: { transition: transitionUsed }, files: [], baseline: true })
      components.push({ component: 'route', signature: identity({ mode, query: texts, text: routeText }), text: routeText, hint, baseline: false, files: routed.matches.map(match => ({ key: match.entry.key, path: match.entry.path, sourceSha1: createHash('sha1').update(match.entry.content).digest('hex'), admittedSha1: createHash('sha1').update(match.content).digest('hex'), originalBytes: byteLength(match.entry.content), includedBytes: byteLength(match.content), status: match.truncated ? 'truncated' : 'loaded' })) })
      usedBytes = indexBytes + byteLength(routeText)
      const represented = new Set(routed.matches.map(match => match.entry.key))
      omitted.push(...active.filter(file => !represented.has(file.key)).map(file => ({ key: file.key, path: file.absPath, bytes: file.bytes, reason: unique.unreadable.includes(file) ? file.readStatus : 'not-routed' })))
      truncated.push(...route.matches.filter(match => match.truncated).map(match => ({ key: match.key, path: match.path, includedBytes: match.includedBytes })))
    }
    }
    await step('framed-memory-render-and-routing', async () => {
      let limit = budget.mode === 'fixed' ? budget.budgetBytes : Number.MAX_SAFE_INTEGER
      renderAllocation(limit)
      tokenResult = await counter.countBatch(components.map(item => item.text), { signal })
      // Byte size is only a search hint, never a token-count conversion. Every
      // candidate is re-counted with the actual tokenizer before being admitted.
      for (let attempt = 0; budget.mode !== 'fixed' && tokenResult.tokens > budget.capTokens && attempt < 8; attempt++) {
        limit = Math.max(0, Math.min(limit - 1, Math.floor(usedBytes * budget.capTokens / tokenResult.tokens * 0.97)))
        renderAllocation(limit);tokenResult = await counter.countBatch(components.map(item => item.text), { signal })
      }
      if (budget.mode !== 'fixed' && tokenResult.tokens > budget.capTokens) { renderAllocation(0);tokenResult = await counter.countBatch(components.map(item => item.text), { signal }) }
      usedTokens = tokenResult.tokens
    })
    if (budget.mode === 'fixed') budget.byteCapEstimate = estimateByteCap(budget.budgetBytes, [{ readable: true, bytes: usedBytes, tokens: usedTokens }])
    const summaryComponent = mode === 'full' ? 'full' : 'route'
    budget.committedReceipt = await step('memory-visible-committed-receipt', async () => { try { return await committedText(agent, { kind: SOURCE_KIND, form: 'memory', signal, selectionKey: mode + '/' + summaryComponent, matches: message => message.source.memoryMode === mode && message.source.memoryComponent === summaryComponent, selectTexts: (message, texts) => message.source.memoryHint === true ? [] : texts }) } catch (error) { if (signal?.aborted) throw error;return { available: false, reason: 'Current-mode injection receipt unavailable: ' + String(error?.message || error) } } })
    stop();const plannedSummary = await counter.countBatch(components.filter(component => component.component === summaryComponent && !component.hint).map(component => component.text), { signal })
    budget.summary = { mode, component: summaryComponent, tokens: budget.committedReceipt.available ? budget.committedReceipt.tokens : plannedSummary.tokens, source: budget.committedReceipt.available ? 'actual-current-mode-injection' : 'planned-current-mode-fallback', fallback: !budget.committedReceipt.available, plannedTokens: plannedSummary.tokens, reason: budget.committedReceipt.available ? null : budget.committedReceipt.reason, receipt: budget.committedReceipt }
    if (budget.summary.fallback) diagnostics.push({ code: 'memory-summary-plan-fallback', reason: msg('diag.summary.fallback') })
    budget.tokenizer = counter.basis(budget.model);budget.tokenizer.cacheHit = tokenResult.cached;budget.tokenizer.countMs = tokenResult.elapsedMs;budget.tokenizer.metrics = counter.metrics()
    diagnostics.push({ code: 'memory-tokenizer-basis', reason: budget.tokenizer.basisLine, tokenizer: budget.tokenizer })
    if (!budget.tokenizer.available) diagnostics.push({ code: 'memory-tokenizer-unavailable', reason: msg('diag.tokenizer.unavailable', { reason: budget.tokenizer.reason }) })
    if (!eligible) omitted.push(...all.map(file => ({ key: file.key, path: file.absPath, bytes: file.bytes, reason: 'injection-ineligible' })))
    return { sessionId, root, cwd, activationUnavailable, mode, modeSource: modeOverride ? 'root-session' : 'default', settings, scanned, disabled, active, duplicates: unique.duplicates, budget: { ...budget, usedBytes, usedTokens, omitted, truncated, duplicateFiles: unique.duplicates.map(file => ({ key: file.key, path: file.absPath, duplicateOf: file.duplicateOf })) }, components, route, index, diagnostics, eligible }
  }
  async function preStep(payload, next) {
    const decision = await next()
    if (disposed || decision.kind === 'reject' || payload.signal?.aborted) return decision
    const agent = payload.agent, planned = await plan({ sessionId: agent.id, agent, incomingMessages: payload.messages, signal: payload.signal })
    if (disposed || payload.signal?.aborted) return decision
    lastPlans.set(agent.session, planned)
    const state = stateFor(agent.session), desired = planned.components.filter(component => component.text && state.signatures[component.component] !== component.signature)
    const messages = decision.messages.filter(message => !owned(message))
    if (!planned.eligible || !desired.length) return { ...decision, messages }
    const candidates = desired.map(component => {
      const trace = { component: component.component, signature: component.signature, mode: planned.mode, files: component.files, usedBytes: byteLength(component.text), budgetBytes: planned.budget.budgetBytes, capTokens: planned.budget.capTokens, batchUsedTokens: planned.budget.usedTokens, budgetUnit: planned.budget.unit }
      const message = createUserMessage({ content: [{ type: 'text', text: component.text }], source: { kind: SOURCE_KIND, form: 'memory', baseline: component.baseline, replace: state.mode !== null, memoryMode: planned.mode, memoryComponent: component.component, memoryIdentity: component.signature, memoryVariant: component.variant || {}, memoryHint: component.hint === true, memoryTrace: trace } })
      return { ...component, trace, message }
    })
    if (disposed || payload.signal?.aborted) return decision
    pending.set(agent.session, candidates)
    const lastClaimed = messages.findLastIndex(message => payload.messages.includes(message)), inserted = [...messages.slice(0, lastClaimed + 1), ...candidates.map(candidate => candidate.message), ...messages.slice(lastClaimed + 1)]
    return { ...decision, messages: inserted }
  }
  function observe(session, event) {
    reader.observe(session, event)
    const decoded = sessionEventFacts(event)
    if (!decoded.complete || decoded.value?.kind !== 'user-message' || decoded.value.source !== SOURCE_KIND) return
    const list = pending.get(session) || [], match = list.find(candidate => candidate.text === decoded.value.text)
    if (!match) return
    const state = stateFor(session);state.mode = match.trace.mode;state.signatures[match.component] = match.signature;state.variants ||= {};state.variants[match.component] = match.variant || {}
    if (match.component === 'route') { state.routed ||= {};for (const file of match.files) state.routed[file.key] = file.admittedSha1 }
    if (match.hint) state.hintSeen = true
    const all = receipts.get(session) || {}
    all[match.component] = { ...match.trace, admittedAt: decoded.value.time ?? null, seq: decoded.value.seq ?? null, source: 'genuine-post-commit-event' };receipts.set(session, all)
    pending.set(session, list.filter(candidate => candidate !== match))
  }
  function observedSurfaceBytes(agent) {
    const model = agent?.session && (reader.peek(agent.id, { purpose: 'poll' }) || models.get(agent.session)), active = agent?.session && activeSeqs(agent.session)
    if (!model || !active || model.start !== 0 || model.ownedComplete === false) return null
    return model.owned.filter(frame => active.has(frame.seq)).reduce((sum, frame) => sum + frame.bytes, 0)
  }
  function attach(agent) {
    if (disposed || hooks.has(agent) || !agent?.ctx?.on) return false
    const disposers = [agent.ctx.on('agent/pre-step', preStep)]
    hooks.set(agent, () => { for (const dispose of disposers.reverse()) dispose?.();hooks.delete(agent);pending.delete(agent.session);states.delete(agent.session);receipts.delete(agent.session);lastPlans.delete(agent.session);models.delete(agent.session);surfaces.delete(agent.session);reader.drop(agent.id) })
    return true
  }
  return { plan, attach, observe, preStep, observedSurfaceBytes, isAttached: agent => hooks.has(agent), detach: agent => hooks.get(agent)?.(), receipt: agent => agent?.session ? receipts.get(agent.session) || null : null, lastPlan: agent => agent?.session ? lastPlans.get(agent.session) || null : null, dispose() { disposed = true;for (const dispose of [...hooks.values()]) { try { dispose() } catch { warn('Agent hook cleanup failed.') } }return counter.dispose() } }
}
