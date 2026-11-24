// Catalog attribution performance change (task-111): the entries/attribution output must be
// identical to the pre-change implementation, the build must not be cubic, and an agent/session
// lifecycle event must not trigger a discovery rescan.
//
// The pre-change `buildCatalogEntries` is kept as `fixtures/old-catalog-entries.js` and used as
// the reference oracle, the same pattern the ledger-admission test uses for the ledger rewrite.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { buildCatalogEntries } from '../lib/catalog-entries.js'
import { buildCatalogEntries as oldBuildCatalogEntries } from './fixtures/old-catalog-entries.js'
import { createCatalogProvider } from '../lib/catalog.js'
import { parseMcpToolName } from '../lib/dsh-adapter.js'
import { widgetRoot } from './support/client-harness.mjs'

const scratch = path.join(widgetRoot, '.test-artifacts')

/** A catalog with presets, MCP servers, tools (attributed, ambiguous, reserved), modules, skills. */
function syntheticCatalog({ tools = 40, servers = 4 } = {}) {
  const serverNames = Array.from({ length: servers }, (_, index) => 'srv-' + String(index).padStart(2, '0'))
  // `srv` is a known prefix of `srv-00`, so `mcp__srv__x` is a genuinely ambiguous attribution.
  const knownServers = ['srv', ...serverNames]
  const facts = [], observations = []
  for (const name of serverNames) facts.push({ kind: 'mcp', name, sources: ['configured:test'], present: true, configured: true, configuredEnabled: true })
  for (let index = 0; index < tools; index += 1) {
    const name = 'mcp__' + knownServers[1 + (index % servers)] + '__tool-' + index
    facts.push({ kind: 'tool', name, description: 'tool ' + index, sources: ['preset:p1'], present: true, at: 1000 + index })
    observations.push({ kind: 'tool', name, description: 'tool ' + index, sources: ['preset:p1', 'host'], latestSource: 'host', firstSeenAt: 10, lastSeenAt: 10 + index })
  }
  facts.push({ kind: 'tool', name: 'mcp__srv__ambiguous', description: 'ambiguous', sources: ['preset:p2'], present: true })
  facts.push({ kind: 'tool', name: 'mcp__unknown-server__loose', description: 'fallback', sources: ['preset:p2'], present: true })
  facts.push({ kind: 'tool', name: 'malformed_tool', description: 'not mcp shaped', sources: ['preset:p2'], present: true })
  facts.push({ kind: 'tool', name: 'bbff_team_dispatch', description: 'declared by module', sources: [], present: true })
  facts.push({ kind: 'tool', name: 'bbff_shared', description: 'two modules claim it', sources: [], present: true })
  facts.push({ kind: 'tool', name: 'session_contributed', description: 'contributed live', sources: ['session-local'], sessionLocal: true, moduleId: 'mod-b' })
  facts.push({ kind: 'skill', name: 'skill-a', description: 'a', sources: ['preset:p1', 'project:/w1'], projectPath: '/w1', modelInvocable: true, userInvocable: true })
  facts.push({ kind: 'skill', name: 'skill-a', description: 'a', sources: ['host'], projectPath: '/w2', modelInvocable: false, userInvocable: true })
  facts.push({ kind: 'skill', name: 'skill-b', description: 'b', sources: ['host'], skillSource: 'dir', skillProvider: 'host' })
  facts.push({ kind: 'mcp', name: serverNames[0], sources: ['manager'], present: false, configurationAuthority: 'manager', configured: true })
  observations.push({ kind: 'mcp', name: knownServers[0], description: '', sources: ['prompt:mcp'], firstSeenAt: 1, lastSeenAt: 2 })
  observations.push({ kind: 'skill', name: 'skill-old', description: 'historical only', sources: ['project:/w3'], firstSeenAt: 1, lastSeenAt: 2 })
  observations.push({ kind: 'tool', name: 'mcp__srv-01__historical', description: 'historical tool', sources: ['preset:old'], firstSeenAt: 1, lastSeenAt: 2 })
  const modules = [
    { id: 'mod-a', title: 'Module A', compatible: true, tools: ['bbff_team_dispatch', 'bbff_shared'] },
    { id: 'mod-b', title: 'Module B', compatible: true, tools: ['bbff_shared'] },
    { id: 'mod-c', title: 'Module C', compatible: false, tools: ['bbff_incompatible'] },
    { id: 'mod-d', title: 'Module D', compatible: true, exclusiveTools: { tools: ['bbff_team_dispatch'], reason: 'team only', reasonLocales: { zh: '仅团队' } } },
  ]
  const seenThisRun = new Set(facts.map((fact) => fact.kind + '\0' + fact.name))
  return { facts, observations, modules, seenThisRun, knownServers, serverNames }
}

test('the new attribution path produces entries identical to the old implementation', () => {
  const { facts, observations, modules, seenThisRun } = syntheticCatalog({ tools: 60, servers: 5 })
  const ledgerServers = [...new Set(observations.filter((row) => row.kind === 'mcp').map((row) => row.name))]
  const factServers = [...new Set(facts.filter((fact) => fact.kind === 'mcp').map((fact) => fact.name))]
  const servers = [...new Set([...ledgerServers, ...factServers])].sort()
  const attribute = (name) => {
    const decoded = parseMcpToolName(name, servers, [])
    return decoded.value || { basis: 'none', uncertain: false, candidates: [], ambiguous: false, diagnostics: decoded.diagnostics }
  }
  const input = { observations, facts, modules, seenThisRun, attributeTool: attribute, packageVersions: { '@deepseek-ai/dsh-tools': '0.2.2' }, nativeResidueProven: false }
  const actual = buildCatalogEntries(input)
  const expected = oldBuildCatalogEntries(input)
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), 'entries/owners/attribution must be identical to the old implementation')
  assert.ok(actual.length > 60, 'the synthetic catalog actually produced rows')
  const attributed = actual.filter((row) => row.kind === 'tool' && row.mcpServer)
  assert.ok(attributed.length > 50, 'most synthetic tools carry an MCP attribution')
  assert.ok(actual.some((row) => row.kind === 'tool' && row.name === 'mcp__srv__ambiguous' && row.ownerBasis?.kind === 'adapter'))
  // The same equivalence under caller-provided server hints (Scope's shape): the hint set changes
  // the attribution, and both implementations must derive the identical rows from it.
  const hinted = (name) => {
    const decoded = parseMcpToolName(name, servers, ['unknown-server'])
    return decoded.value || { basis: 'none', uncertain: false, candidates: [], ambiguous: false, diagnostics: decoded.diagnostics }
  }
  const hintedInput = { ...input, attributeTool: hinted }
  assert.equal(JSON.stringify(buildCatalogEntries(hintedInput)), JSON.stringify(oldBuildCatalogEntries(hintedInput)))
  assert.notEqual(JSON.stringify(buildCatalogEntries(hintedInput)), JSON.stringify(actual), 'the hint set must actually change attribution')
})

test('memoized attribution equals a fresh decode and follows the ledger/fact revision', async () => {
  const dir = path.join(scratch, 'catalog-attribution-' + process.pid + '-' + Date.now())
  const toolNames = ['mcp__srv-00__a', 'mcp__srv__b', 'mcp__unknown__c', 'malformed', 'mcp__srv-01__d']
  const discoveryFor = (servers) => async () => ({
    slices: [
      { id: 'v1:sections', viewId: 'v1', presetId: 'p1', roles: ['host'], part: 'sections', complete: true, diagnostics: [], facts: servers.map((name) => ({ kind: 'mcp', name, sources: ['preset:p1'] })) },
      { id: 'v1:tools', viewId: 'v1', presetId: 'p1', roles: ['host'], part: 'tools', complete: true, diagnostics: [], facts: toolNames.map((name) => ({ kind: 'tool', name, sources: ['preset:p1'] })) },
    ],
    authoritative: true, defaultViewId: 'v1', projectPaths: [], privateViews: new Map(), packageVersions: {}, nativeResidueProven: false, diagnostics: [],
  })
  let servers = ['srv', 'srv-00', 'srv-01']
  const provider = createCatalogProvider({ dir, getModules: () => [], readDiscovery: async (args) => discoveryFor(servers)(args) })
  try {
    await provider.refresh()
    const reference = (name) => {
      const sorted = [...new Set([...servers])].sort()
      const decoded = parseMcpToolName(name, sorted, [])
      return decoded.value || { basis: 'none', uncertain: false, candidates: [], ambiguous: false, diagnostics: decoded.diagnostics }
    }
    const first = new Map(toolNames.map((name) => [name, provider.catalog.attributeTool(name)]))
    for (const name of toolNames) assert.equal(JSON.stringify(first.get(name)), JSON.stringify(reference(name)), 'attribution of ' + name)
    // The memo returns the very same frozen value instead of recomputing.
    assert.equal(provider.catalog.attributeTool('mcp__srv-00__a'), first.get('mcp__srv-00__a'))
    // A new fact revision (a server appears) changes the attribution, so the cache is keyed correctly.
    servers = ['srv', 'srv-00', 'srv-01', 'unknown']
    await provider.refresh()
    const after = provider.catalog.attributeTool('mcp__unknown__c')
    assert.equal(after.server, 'unknown')
    assert.equal(after.basis, 'known')
    assert.equal(JSON.stringify(provider.catalog.attributeTool('mcp__srv-00__a')), JSON.stringify(reference('mcp__srv-00__a')))
  } finally { await provider.dispose(); await fs.rm(dir, { recursive: true, force: true }) }
})

test('the hinted attribution path is memoized on (name, sorted hints) without changing results', async () => {
  const dir = path.join(scratch, 'catalog-hints-' + process.pid + '-' + Date.now())
  const servers = ['srv', 'srv-00', 'srv-01']
  const names = ['mcp__srv-00__a', 'mcp__srv__b', 'mcp__unknown__c', 'mcp__srv-01__d']
  const provider = createCatalogProvider({
    dir, getModules: () => [],
    readDiscovery: async () => ({
      slices: [
        { id: 'v1:sections', viewId: 'v1', presetId: 'p1', roles: ['host'], part: 'sections', complete: true, diagnostics: [], facts: servers.map((name) => ({ kind: 'mcp', name, sources: ['preset:p1'] })) },
        { id: 'v1:tools', viewId: 'v1', presetId: 'p1', roles: ['host'], part: 'tools', complete: true, diagnostics: [], facts: names.map((name) => ({ kind: 'tool', name, sources: ['preset:p1'] })) },
      ],
      authoritative: true, defaultViewId: 'v1', projectPaths: [], privateViews: new Map(), packageVersions: {}, nativeResidueProven: false, diagnostics: [],
    }),
  })
  try {
    await provider.refresh()
    const reference = (name, hints) => {
      const decoded = parseMcpToolName(name, [...servers].sort(), hints)
      return decoded.value || { basis: 'none', uncertain: false, candidates: [], ambiguous: false, diagnostics: decoded.diagnostics }
    }
    const hintSets = [[], ['srv-02'], ['srv-02', 'srv-03'], ['nope']]
    for (const name of names) for (const hints of hintSets) {
      assert.equal(JSON.stringify(provider.catalog.attributeTool(name, { serverHints: hints })), JSON.stringify(reference(name, hints)), 'hinted attribution of ' + name + ' with ' + JSON.stringify(hints))
    }
    // A repeated hint-carrying call returns the memoized frozen value, not a new decode.
    const first = provider.catalog.attributeTool('mcp__srv-00__a', { serverHints: ['srv-02'] })
    assert.ok(Object.isFrozen(first))
    assert.equal(provider.catalog.attributeTool('mcp__srv-00__a', { serverHints: ['srv-02'] }), first)
    // Hint order cannot change the result, so it must not create a second cache entry either.
    assert.equal(provider.catalog.attributeTool('mcp__srv-00__a', { serverHints: ['srv-03', 'srv-02'] }), provider.catalog.attributeTool('mcp__srv-00__a', { serverHints: ['srv-02', 'srv-03'] }))
    // The unhinted value stays a different entry: hints are part of the key.
    assert.notEqual(provider.catalog.attributeTool('mcp__srv-00__a'), first)
  } finally { await provider.dispose(); await fs.rm(dir, { recursive: true, force: true }) }
})

test('catalog build scales sub-quadratically and stays fast at 2,000 tools x 20 servers', async () => {
  const dir = path.join(scratch, 'catalog-scale-' + process.pid + '-' + Date.now())
  const servers = Array.from({ length: 20 }, (_, index) => 'srv-' + String(index).padStart(2, '0'))
  const discoveryFor = (tools) => async () => ({
    slices: [
      { id: 'v1:sections', viewId: 'v1', presetId: 'p1', roles: ['host'], part: 'sections', complete: true, diagnostics: [], facts: servers.map((name) => ({ kind: 'mcp', name, sources: ['preset:p1'] })) },
      { id: 'v1:tools', viewId: 'v1', presetId: 'p1', roles: ['host'], part: 'tools', complete: true, diagnostics: [], facts: Array.from({ length: tools }, (_, index) => ({ kind: 'tool', name: 'mcp__' + servers[index % servers.length] + '__tool-' + index, description: 'tool ' + index, sources: ['preset:p1'] })) },
    ],
    authoritative: true, defaultViewId: 'v1', projectPaths: [], privateViews: new Map(), packageVersions: {}, nativeResidueProven: false, diagnostics: [],
  })
  const provider = createCatalogProvider({ dir, getModules: () => [], readDiscovery: discoveryFor(2000) })
  try {
    await provider.refresh()
    provider.invalidate('tools') // clears the snapshot cache synchronously; the queued rescan is not awaited
    const started = performance.now()
    const view = provider.catalog.snapshot()
    const snapshotMs = performance.now() - started
    assert.ok(view.entries.length >= 2000, 'the build produced one row per tool (' + view.entries.length + ')')
    assert.ok(view.entries.filter((row) => row.kind === 'mcp').length >= servers.length, 'every server row exists')
    // Integrated bound: the pre-change implementation took ~400 ms at exactly this shape on this
    // machine (measured in .dsh/artifacts/catalog-cpu/benchmark.json), so this bound also fails a
    // regression back to the quadratic shape.
    assert.ok(snapshotMs < 1500, '2,000 tools x 20 servers materialized in ' + Math.round(snapshotMs) + ' ms')

    // Scaling ratio of the changed hot path (build + attribution), against the provider's own
    // memoized attribution: doubling the entries must not multiply the cost superlinearly.
    const build = (tools) => {
      const facts = servers.map((name) => ({ kind: 'mcp', name, sources: ['configured'], present: true, configured: true }))
      const observations = []
      for (let index = 0; index < tools; index += 1) {
        const name = 'mcp__' + servers[index % servers.length] + '__tool-' + index
        facts.push({ kind: 'tool', name, description: 'tool ' + index, sources: ['preset:p1'], present: true, at: 1000 + index })
        observations.push({ kind: 'tool', name, description: 'tool ' + index, sources: ['preset:p1'], firstSeenAt: 10, lastSeenAt: 10 + index })
      }
      // Minimum of three runs: a single run can absorb a GC pause and read as superlinear.
      let best = Infinity, rows = 0
      for (let run = 0; run < 3; run += 1) {
        const startedAt = performance.now()
        rows = buildCatalogEntries({ observations, facts, modules: [], seenThisRun: new Set(facts.map((fact) => fact.kind + '\0' + fact.name)), attributeTool: provider.catalog.attributeTool, packageVersions: {}, nativeResidueProven: false }).length
        best = Math.min(best, performance.now() - startedAt)
      }
      return { ms: best, rows }
    }
    build(200) // warm up
    const small = build(2000), large = build(4000)
    assert.ok(large.rows > small.rows)
    const ratio = large.ms / Math.max(small.ms, 0.001)
    assert.ok(ratio < 3, 'doubling the entry count must not multiply the build time superlinearly (t(2n)/t(n) = ' + ratio.toFixed(2) + ', ' + Math.round(small.ms) + ' ms -> ' + Math.round(large.ms) + ' ms)')
  } finally { await provider.dispose(); await fs.rm(dir, { recursive: true, force: true }) }
})

test('agent lifecycle events notify without a discovery rescan, catalog changes still rescan', async () => {
  const dir = path.join(scratch, 'catalog-events-' + process.pid + '-' + Date.now())
  let discoveryCalls = 0
  const provider = createCatalogProvider({
    dir, getModules: () => [],
    readDiscovery: async () => {
      discoveryCalls += 1
      return { slices: [{ id: 'v1:tools', viewId: 'v1', presetId: 'p1', roles: ['host'], part: 'tools', complete: true, diagnostics: [], facts: [{ kind: 'tool', name: 'a_tool', sources: ['preset:p1'] }] }], authoritative: true, defaultViewId: 'v1', projectPaths: [], privateViews: new Map(), packageVersions: {}, nativeResidueProven: false, diagnostics: [] }
    },
  })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 25))
  try {
    await provider.refresh()
    assert.equal(discoveryCalls, 1)
    provider.touch('agents') // what index.js now does for agent/created | agent/disposed
    await settle()
    assert.equal(discoveryCalls, 1, 'an agent load/unload must not trigger a discovery rescan')
    provider.invalidate('tools')
    await settle()
    assert.equal(discoveryCalls, 2, 'a real tool-catalog change still rescans')
  } finally { await provider.dispose(); await fs.rm(dir, { recursive: true, force: true }) }
})

test('index.js routes agent lifecycle events to the cheap notify path', async () => {
  const source = await fs.readFile(path.join(widgetRoot, 'index.js'), 'utf8')
  assert.match(source, /for\(const event of \['agent\/created','agent\/disposed'\]\)ctx\.on\?\.\(event,\(\)=>\{catalogProvider\.touch\('agents'\)\}\)/)
  const invalidateLine = source.split('\n').find((line) => line.includes('catalogProvider.invalidate(reason)')) || ''
  assert.doesNotMatch(invalidateLine, /agent\//, 'agent lifecycle events must not reach invalidate()')
})
