import { dirname } from 'node:path'
import { createGovernanceStore } from './catalog-ledger.js'
import { createCatalogCache, legacyObservations, validSnapshot } from './catalog-cache.js'
import { createGovernance } from './governance.js'
import { catalogStatus, catalogCaveats } from './catalog-status.js'
import { msg } from './bbff-contract.js'
import { parseMcpToolName, reservedTool } from './dsh-adapter.js'
import { ruleForTool, validateRuleTarget } from './rules.js'

const keyOf = entry => entry.kind + '\0' + entry.name
export function createCatalog(ctx, { store, warn = () => {}, moduleId = 'scope' }) {
  const get = key => { try { return ctx.get(key) } catch { return undefined } }
  const cache = createCatalogCache(store.dir, warn)
  const ledger = createGovernanceStore({ home: dirname(store.dir), warn })
  let available = false, providerError = null, importing = null, importError = null, reportDispose, reportedTo, reported = '', disposed = false
  const adapterNotes = new Map(), contextNotes = new Map()
  let contextProvider, requestedContexts = new Set()
  const provider = () => { const family = get('bbffFamily'), service = family?.contract === 1 ? family.catalog : undefined; return ['snapshot', 'attributeTool', 'subscribe', 'forget', 'importObservations', 'reportAdapterDiagnostics'].every(method => typeof service?.[method] === 'function') ? service : undefined }
  const knownServers = () => (cache.read()?.entries || []).filter(entry => entry.kind === 'mcp').map(entry => entry.name)
  function recordAdapter(result) {
    let changed = false
    for (const note of result?.diagnostics || []) {
      const key = note.inference + ':' + note.reason
      if (!adapterNotes.has(key)) changed = true
      adapterNotes.set(key, note)
    }
    if (changed) reportDiagnostics()
    return result?.value
  }
  function reportDiagnostics() {
    if (disposed) return
    const current = provider(), notes = [...adapterNotes.values()].map(({ inference, reason, severity }) => ({ code: inference, inference, reason, severity }))
    const signature = JSON.stringify(notes)
    if (signature === reported && current === reportedTo || !current?.reportAdapterDiagnostics) return
    try {
      const dispose = current.reportAdapterDiagnostics(moduleId, notes)
      reportDispose?.(); reportDispose = dispose; reported = signature; reportedTo = current
    } catch (error) { warn('Adapter diagnostic report unavailable: ' + error.message) }
  }
  function attributeTool(name, hints = []) {
    const current = provider()
    if (current?.attributeTool) {
      try { const value = current.attributeTool(name, { serverHints: hints }); recordAdapter(value); return value }
      catch (error) { providerError = msg('diagnostic.attributionUnavailable', { message: error.message }) }
    }
    const value = recordAdapter(parseMcpToolName(name, knownServers(), hints))
    return value || { basis: 'none', uncertain: false, ambiguous: false, candidates: [], diagnostics: [] }
  }
  const governance = createGovernance(() => get('bbffFamily'), ledger, attributeTool, warn, () => disposed)
  function receive(cwd) {
    if (disposed) return cache.read()
    const current = provider()
    available = !!current; providerError = null
    if (current) try { const value = current.snapshot(cwd === undefined ? undefined : { cwd }); cache.replace(value); return value }
    catch (error) { available = false; providerError = msg('diagnostic.catalogUnavailable', { message: error.message }); warn('Catalog unavailable: ' + error.message) }
    return cache.read()
  }
  function requestRuleContexts() {
    const current = provider()
    if (current !== contextProvider) { contextProvider = current; requestedContexts = new Set(); contextNotes.clear() }
    if (!current) return
    const paths = new Set(store.read().rules.flatMap(rule => rule.workspaces))
    for (const cwd of contextNotes.keys()) if (!paths.has(cwd)) contextNotes.delete(cwd)
    for (const cwd of paths) {
      if (requestedContexts.has(cwd)) continue
      try {
        const value = current.snapshot({ cwd })
        if (!validSnapshot(value)) throw new Error('invalid context snapshot')
        requestedContexts.add(cwd); contextNotes.delete(cwd)
      } catch (error) {
        contextNotes.set(cwd, { reason: msg('diagnostic.contextUnavailable', { cwd }) })
        warn('Rule context request failed: ' + error.message)
      }
    }
    // These calls register root-owned lifetime contexts. Only the final consumed
    // provider snapshot is cached below; never queue obsolete per-path copies.
  }
  function decorate(entry, rules, complete) {
    const policy = governance.policy(entry.kind, entry.name)
    const rule = rules.find(rule => rule.kind === entry.kind && rule.name === entry.name)
    const matching = rules.filter(candidate => candidate.kind === entry.kind && candidate.name === entry.name
      || entry.kind === 'tool' && candidate.kind === 'mcp' && ruleForTool([candidate], entry.name, undefined, attributeTool))
    const checked = matching.map(rule => {
      let valid = true
      try { validateRuleTarget(rule, knownServers()) } catch { valid = false }
      return { rule, active: valid && policy.governable && governance.policy(rule.kind, rule.name).governable }
    })
    const clauses = checked.filter(row => row.active && row.rule.workspaces.length).map(({ rule }) => ({ kind: rule.kind, name: rule.name, workspaces: rule.workspaces }))
    const value = { ...entry, loaded: entry.present === true, whereSeen: entry.sources || [],
      ...(entry.kind === 'skill' ? { invocation: { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable } } : {}),
      governance: policy, limits: { workspaces: clauses[0]?.workspaces || [], clauses, ...(rule ? { ruleId: rule.id } : {}), ignored: checked.some(row => !row.active) },
      canForget: !!(available && complete && entry.lastSeenAt && !entry.present && !entry.declaredBy?.length && !rule && policy.governable && !entry.manual) }
    value.status = catalogStatus(value); value.caveats = catalogCaveats(value)
    return value
  }
  function envelope(snapshot) {
    const notes = [...governance.info().notes, ...(snapshot?.diagnostics || []), ...adapterNotes.values(), ...contextNotes.values()]
    if (!available) notes.push({ reason: msg('diagnostic.providerUnavailable') })
    if (providerError || importError || cache.diagnostic()) notes.push({ reason: providerError || importError || cache.diagnostic() })
    if (cache.unresolvedSources()) notes.push({ reason: msg('diagnostic.unresolvedSources') })
    return { providerSnapshot: snapshot, providerAvailable: available, familyAvailable: governance.info().familyAvailable,
      complete: !!(available && snapshot?.complete && !adapterNotes.size && !contextNotes.size && !providerError && !importError && !cache.diagnostic()),
      revision: snapshot?.revision, generatedAt: snapshot?.generatedAt, origin: available ? snapshot?.origin : 'cached', notes }
  }
  async function migrate() {
    if (disposed || cache.migrated()) return
    if (importing) return importing
    const current = provider()
    if (!current?.importObservations) return
    importing = (async () => {
      try {
        const { records, unresolved } = legacyObservations(store.dir)
        if (records.length) { const result = await current.importObservations(moduleId, records); if (!result.ok) throw new Error(result.diagnostic.reason) }
        await cache.markMigrated(unresolved); importError = null
      } catch (error) { importError = msg('diagnostic.legacyImportFailed', { message: error.message }); warn('Legacy catalog import failed: ' + error.message) }
      finally { importing = null }
    })()
    return importing
  }
  function currentSnapshot() { return disposed ? cache.read() : receive() }
  async function collect(extraCwd) {
    if (disposed) return { ...envelope(cache.read()), entries: cache.read()?.entries || [] }
    governance.refresh()
    // Push rule workspace context through cache-only provider queries; no local skill discovery.
    if (extraCwd === undefined) requestRuleContexts()
    const snapshot = receive(extraCwd), rules = store.read().rules
    const state = envelope(snapshot), entries = [...(snapshot?.entries || [])]
    for (const rule of rules) if (!entries.some(entry => entry.kind === rule.kind && entry.name === rule.name) && !reservedTool(rule.name)) entries.push({ kind: rule.kind, name: rule.name, description: '', sources: [], declaredBy: [], present: false, firstSeenAt: null, lastSeenAt: null, manual: true })
    void migrate()
    const decorated = entries.map(entry => decorate(entry, rules, state.complete))
    reportDiagnostics()
    const finalState = envelope(snapshot)
    if (!finalState.complete) for (const entry of decorated) entry.canForget = false
    return { ...finalState, entries: decorated }
  }
  async function newRoot(cwd) {
    if (disposed) throw new Error('Scope generation is disposed')
    const snapshot = await collect(cwd), raw = snapshot.providerSnapshot, view = raw?.newRoot
    const matches = !!(view && (available || view.cwd === cwd))
    const keys = new Set(matches ? view.entries.map(keyOf) : [])
    const entries = snapshot.entries.filter(entry => !entry.manual && keys.has(keyOf(entry))).map(entry => {
      const skill = view.skills?.find(skill => skill.name === entry.name)
      if (!skill || entry.kind !== 'skill') return entry
      const projected = { ...entry, modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable, invocation: { modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable } }
      projected.caveats = catalogCaveats(projected)
      return projected
    })
    return { ...snapshot, cwd: matches ? view.cwd : cwd, entries, state: matches ? view.state : 'pending', complete: !!(matches && snapshot.complete && view.complete),
      resources: matches ? view.resourceServers : [], sections: matches ? view.sections : [], notes: [...snapshot.notes, ...(matches ? view.diagnostics : [{ reason: msg('diagnostic.newRootUnavailable') }])] }
  }
  async function forget(kind, name) {
    if (disposed) throw new Error('Scope generation is disposed')
    const state = await collect(), entry = state.entries.find(entry => entry.kind === kind && entry.name === name)
    if (!entry?.canForget) { const error = new Error('error.forgetRefused'); error.bbffRef = msg('error.forgetRefused'); throw error }
    const result = await provider().forget(kind, name)
    if (!result.ok) throw new Error(result.diagnostic.reason)
    receive(); return result
  }
  return { cache, ledger, governance, provider, currentSnapshot, collect, newRoot, forget, knownServers, attributeTool, recordAdapter, reportDiagnostics,
    beginAdapterPass: () => adapterNotes.clear(),
    project: snapshot => ({ tools: snapshot.entries.filter(row => row.kind === 'tool'), skills: snapshot.entries.filter(row => row.kind === 'skill'), mcp: snapshot.entries.filter(row => row.kind === 'mcp') }),
    dispose: async () => { if (disposed) return Promise.all([cache.flush(), ledger.flush()]); disposed = true; reportDispose?.(); reportDispose = undefined; await importing; await Promise.all([cache.flush(), ledger.flush()]) } }
}
