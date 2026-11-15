/** Native instruction facts from PUBLIC active fibers and native discovery helpers.
 * No Agent assembly/resume/load is performed; discovery is not admission evidence.
 */
import { statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { scopeOf, scopeChainOf } from '@deepseek-ai/dsh-scope'
import { DSH_CONVENTIONS, VERIFIED_PACKAGE_VERSIONS, instructionLoaderFacts } from './dsh-adapter.js'
import { createInstructionDisplayReader, estimateByteCap } from './instruction-display.js'
import { createVisibleReceiptReader } from './visible-receipts.js'
import { msg } from './host-ref.js'
import { localeError } from './locale-message.js'
const OWNER = DSH_CONVENTIONS.find(row => row.inference === 'instruction-loader').ownerPackage
const get = (ctx, name) => { try { return ctx.get(name) } catch { return undefined } }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const diagnostic = reason => ({ inference: 'instruction-loader', reason })
function active(fiber) { try { fiber.assertActive();return true } catch { return false } }
function packageInfo(ctx, entry) {
  const packages = get(ctx, 'pluginPackages')
  for (const base of [entry.parent?.tree?.ctx?.baseUrl, entry.ctx?.baseUrl, ctx.baseUrl, ctx.root?.baseUrl].filter(Boolean)) {
    try { const info = packages?.packageOf(entry.options.name, base);if (info?.name) return info } catch {}
  }
  return null
}
function pluginOf(namespace) { const module = namespace?.default || namespace;return typeof module === 'function' ? module : module?.apply }
function readConfig(config) {
  // Canonical adapter owns the native config interpretation. This projection is
  // an actual validated activation object, not a preset/default prediction.
  return instructionLoaderFacts({ resolvedConfig: config })
}
function nestedMatches(config, entry) {
  const matches = [], seen = new Set()
  function visit(value, path) {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (plain(value) && value.id === entry.options.id && value.name === entry.options.name) matches.push(path)
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, [...path, index]))
    else if (plain(value)) for (const [key, child] of Object.entries(value)) visit(child, [...path, key])
  }
  visit(config, []);return matches
}
function at(value, path) { for (const key of path) value = value?.[key];return value }
function patch(value, path, next) {
  if (!path.length) return next
  const [key, ...rest] = path, copy = Array.isArray(value) ? [...value] : { ...(value || {}) }
  copy[key] = patch(value?.[key], rest, next);return copy
}
export function createNativeInstructionReader(ctx, { tokenCounter } = {}) {
  const measureFile = tokenCounter ? createInstructionDisplayReader(tokenCounter) : async () => ({ readable: false, reason: msg('native.noCounter') })
  const readReceipt = tokenCounter ? createVisibleReceiptReader(tokenCounter, { getSessionQuery: () => get(ctx, 'sessionQuery') }) : async () => ({ available: false, reason: msg('native.noReceiptCounter') })
  function roots(agent) {
    if (!agent?.ctx) return { rows: [], diagnostics: [diagnostic(msg('native.diag.agentNotLive'))] }
    const key = scopeOf(agent.ctx), ancestors = new Set(scopeChainOf(key)), rows = [], diagnostics = [], seen = new Set()
    try {
      for (const runtime of ctx.registry.values()) for (const fiber of runtime.fibers) {
        if (seen.has(fiber)) continue;seen.add(fiber)
        const entry = fiber.entry
        if (!entry || entry.fiber !== fiber || !active(fiber)) continue
        const scope = scopeOf(fiber.ctx)
        if (scope !== undefined && !ancestors.has(scope)) continue
        const module = entry.moduleNamespace?.default || entry.moduleNamespace
        // Source-verified public root exports cheaply exclude unrelated fibers;
        // final ownership still requires package/version and exact callback identity.
        if (typeof module?.discoverBaselineInstructionFiles !== 'function' || typeof module?.renderAgentInstructions !== 'function' || pluginOf(entry.moduleNamespace) !== runtime.callback) continue
        const info = packageInfo(ctx, entry)
        if (info?.name !== OWNER) continue
        if (!VERIFIED_PACKAGE_VERSIONS[OWNER]?.includes(info.version)) { diagnostics.push(diagnostic(msg('native.diag.unverifiedVersion', { version: info.version || 'unknown' })));continue }
        rows.push({ fiber, entry, namespace: entry.moduleNamespace, config: fiber.config, scope, package: { name: info.name, version: info.version } })
      }
    } catch { diagnostics.push(diagnostic(msg('native.diag.traversalUnavailable'))) }
    if (!rows.length) diagnostics.push(diagnostic(msg('native.diag.noProducer')))
    return { rows, diagnostics, key }
  }
  function address(row) {
    const editor = get(ctx, 'configEditor')
    if (!editor?.configuration || !editor?.edit) return null
    const configurations = editor.configuration(), direct = configurations.find(value => value.entry === row.entry)
    if (direct) return { editor, ...direct, path: ['maxBytes'], kind: 'native-leaf', copyingInherited: false }
    const visited = new Set();let entry = row.entry
    while (entry && !visited.has(entry)) {
      visited.add(entry);entry = entry.parent?.tree?.ctx?.fiber?.entry
      const parent = configurations.find(value => value.entry === entry)
      if (!parent) continue
      const effective = { ...parent.inherited, ...parent.override }, matches = nestedMatches(effective, row.entry)
      if (matches.length !== 1) return null
      const child = at(effective, matches[0])
      if (child.config !== undefined && !plain(child.config)) return null
      const path = [...matches[0], 'config', 'maxBytes']
      return { editor, ...parent, path, kind: 'declaring-composition', copyingInherited: !Object.hasOwn(parent.override, path[0]) }
    }
    return null
  }
  async function read(sessionId, { signal } = {}) {
    const agent = get(ctx, 'agents')?.get?.(sessionId), collected = roots(agent), sources = [], diagnostics = [...collected.diagnostics]
    let cwd = null
    try { cwd = agent && get(ctx, 'workingDirectory')?.get?.(agent.session) } catch {}
    for (const row of collected.rows) {
      const facts = readConfig(row.config), files = [], namespace = row.namespace?.default || row.namespace
      try {
        if (!cwd || typeof namespace?.discoverBaselineInstructionFiles !== 'function') throw localeError(msg('native.diag.candidatesUnavailable'))
        const candidates = await namespace.discoverBaselineInstructionFiles({ cwd, projectRootMarkers: row.config.projectRootMarkers, instructionFileCandidates: row.config.instructionFileCandidates, localInstructionFileCandidates: row.config.localInstructionFileCandidates, signal })
        for (const file of candidates) {
          try { const info = statSync(file.absolutePath);files.push({ ...file, exists: info.isFile(), bytes: info.size, evidence: 'host-stat' }) }
          catch { files.push({ ...file, exists: null, evidence: 'host-unavailable' }) }
        }
      } catch (error) { diagnostics.push(diagnostic(error?.reference || msg('native.diag.discoveryUnavailable'))) }
      // Verify identity/lifecycle again after the asynchronous public metadata walk.
      if (!active(row.fiber) || row.entry.fiber !== row.fiber || row.fiber.config !== row.config || scopeOf(agent.ctx) !== collected.key || row.entry.moduleNamespace !== row.namespace) { diagnostics.push(diagnostic(msg('native.diag.lifecycleChanged')));continue }
      const projected = instructionLoaderFacts({ resolvedConfig: row.config, fileEvidence: files }), target = address(row)
      const fs = get(agent.ctx, 'fs') || get(ctx, 'fs'), measured = []
      for (const file of projected.value.files) measured.push({ ...file, textMeasurement: await measureFile(fs, file.path, { signal, nativeMaxSourceBytes: row.config.maxSourceBytes }) })
      if (!active(row.fiber) || row.entry.fiber !== row.fiber || row.fiber.config !== row.config) { diagnostics.push(diagnostic(msg('native.diag.lifecycleChangedCounting')));continue }
      sources.push({ id: row.entry.id, package: row.package, messageKind: typeof namespace.name === 'string' ? namespace.name : null, maxBytes: projected.value.maxBytes ?? null, maxSourceBytes: row.config.maxSourceBytes ?? null, budgetScope: 'per-chain', chains: ['global', 'project'], combinedChainCeilingBytes: projected.value.maxBytes * 2, budgetTokenEstimate: estimateByteCap(projected.value.maxBytes, measured.map(file => file.textMeasurement)), tokenizer: tokenCounter?.basis(null) || null, projectRootMarkers: [...(row.config.projectRootMarkers || [])], candidates: projected.value.candidates, files: measured, discoveryBasis: msg('native.basis.discovery'), configurationBasis: msg('native.basis.configuration'), admissionKnown: false, fileAdmissionReason: msg('native.fileAdmission.unknown'), writable: !!target, target: target ? { entryId: target.entry.id, kind: target.kind, path: target.path, copyingInherited: target.copyingInherited } : null, diagnostics: [...facts.diagnostics, ...projected.diagnostics] })
    }
    if (sources.length > 1) diagnostics.push(diagnostic(msg('native.diag.multipleProducers')))
    if (sources.length && !sources.some(source => source.writable)) diagnostics.push(diagnostic(msg('native.diag.noTarget')))
    const kinds = [...new Set(sources.map(source => source.messageKind).filter(Boolean))]
    let receipt = { available: false, reason: msg('native.receipt.noSource') }
    if (kinds.length === 1) { try { receipt = await readReceipt(agent, { kind: kinds[0], form: 'instructions', signal }) } catch (error) { if (signal?.aborted) throw error;receipt = { available: false, reason: msg('native.receipt.failed', { error: String(error?.message || error) }) } } }
    return { complete: diagnostics.length === 0 && sources.every(source => !source.diagnostics.length), value: { sources, receipt, files: sources.flatMap(source => source.files.map(file => ({ ...file, sourceId: source.id }))), ...(sources.length === 1 && sources[0].maxBytes !== null ? { maxBytes: sources[0].maxBytes } : {}) }, diagnostics, admissionKnown: false }
  }
  function preview({ sessionId, sourceId, maxBytes }) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw localeError(msg('error.nativeMaxBytes'))
    const agent = get(ctx, 'agents')?.get?.(sessionId), collected = roots(agent), row = collected.rows.find(value => value.entry.id === sourceId)
    if (!row) throw localeError(msg('error.nativeSourceUnknown'))
    const target = address(row)
    if (!target) throw localeError(msg('error.nativeTargetUnverified'))
    const token = hash({ sourceId, entryId: target.entry.id, path: target.path, inherited: target.inherited, override: target.override, maxBytes }), effective = { ...target.inherited, ...target.override }
    return { sourceId, maxBytes, before: row.config.maxBytes, previewToken: token, entryId: target.entry.id, path: target.path, kind: target.kind, copyingInherited: target.copyingInherited, declarationBefore: at(effective, target.path) ?? null, appliesTo: msg('native.preview.appliesTo'), admissionChanged: false }
  }
  async function apply(input) {
    const expected = preview(input)
    if (expected.kind === 'declaring-composition') throw localeError(msg('error.nativeFreezeUnsupported'))
    if (input.previewToken !== expected.previewToken || (expected.copyingInherited && input.confirmInheritedFreeze !== true)) throw localeError(msg('error.nativePreviewStale'))
    const agent = get(ctx, 'agents')?.get?.(input.sessionId), row = roots(agent).rows.find(value => value.entry.id === input.sourceId), target = address(row)
    const editor = typeof ctx.reflect?.trace === 'function' ? ctx.reflect.trace(target.editor) : null
    if (!editor) throw localeError(msg('error.nativeTracingUnavailable'))
    await editor.edit(target.entry, (current, inherited) => {
      if (hash({ sourceId: input.sourceId, entryId: target.entry.id, path: target.path, inherited, override: current, maxBytes: input.maxBytes }) !== expected.previewToken) throw localeError(msg('error.nativeDeclarationChanged'))
      const effective = { ...inherited, ...current }, changed = patch(effective, target.path, input.maxBytes)
      return { ...current, [target.path[0]]: changed[target.path[0]] }
    })
    return { ...expected, applied: true, admissionChanged: false }
  }
  return { read, preview, apply }
}
