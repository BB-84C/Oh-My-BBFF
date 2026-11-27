// `domain/changed` is emitted for every durable write of every storage domain. The catalog only reads the
// workspace registry (domain 'workspace') from storage, so only a write to that domain may invalidate it;
// the session projection cache (domain 'session_projcache') writes a checkpoint for every running session
// every few seconds, and each of those used to start a full catalog rescan.
//
// The subscription block is cut out of the package's own index.js and run against a fake `ctx` that only
// records the handlers, so the event list and the handler body under test are the shipped source, not a copy.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createCatalogProvider } from '../lib/catalog.js'
import { widgetRoot } from './support/client-harness.mjs'

const scratchRoot = path.join(widgetRoot, '.test-artifacts')
const indexSource = await fs.readFile(path.join(widgetRoot, 'index.js'), 'utf8')
const wiring = /^[ \t]*for\(const \[event,reason\] of \[[\s\S]*?\n[ \t]*\}\n/m.exec(indexSource)?.[0]
const subscribed = [...(wiring ?? '').matchAll(/\['([a-z-]+\/[a-z-]+)','([a-z]+)'\]/g)].map((match) => [match[1], match[2]])

/** Run the real subscription block against a recording `ctx`; `catalogProvider` is whatever the caller supplies. */
function wire(catalogProvider) {
  const handlers = new Map()
  const ctx = { on(event, handler) { if (!handlers.has(event)) handlers.set(event, []); handlers.get(event).push(handler) } }
  new Function('ctx', 'catalogProvider', wiring)(ctx, catalogProvider)
  return { emit(event, payload) { for (const handler of handlers.get(event) ?? []) handler(payload) }, handlers }
}

function recordingProvider() {
  const invalidations = []
  return { invalidations, provider: { invalidate: (reason) => invalidations.push(reason) } }
}

test('the subscription block is found in index.js and subscribes domain/changed', () => {
  assert.ok(wiring, 'could not find the `for(const [event,reason] of [...])` block in index.js')
  const { handlers } = wire({ invalidate() {} })
  assert.ok(handlers.has('domain/changed'), 'domain/changed is subscribed')
  assert.ok(subscribed.length >= 13, 'the event list was parsed: ' + subscribed.length + ' events')
})

test('checkpoints of other storage domains do not invalidate the catalog', () => {
  const { invalidations, provider } = recordingProvider()
  const { emit } = wire(provider)
  for (const domain of ['session_projcache', 'schedule']) {
    for (let index = 0; index < 5; index += 1) emit('domain/changed', { domain, table: 'sessions', key: 'k' + index, operation: 'put' })
  }
  // A payload that names no domain cannot be a registry write.
  emit('domain/changed')
  emit('domain/changed', null)
  emit('domain/changed', {})
  assert.deepEqual(invalidations, [])
})

test('a write to the workspace registry still invalidates the catalog', () => {
  const { invalidations, provider } = recordingProvider()
  const { emit } = wire(provider)
  // The registry writes the single record first and then its global (table-less) state, whose order list the
  // workspace listing follows; both are writes to the 'workspace' domain.
  emit('domain/changed', { domain: 'workspace', table: 'workspaces', key: 'ws-1', operation: 'put' })
  emit('domain/changed', { domain: 'workspace', table: '', key: '', operation: 'put' })
  emit('domain/changed', { domain: 'workspace', table: 'workspaces', key: 'ws-1', operation: 'delete' })
  assert.deepEqual(invalidations, ['projects', 'projects', 'projects'])
})

test('every other subscribed event still invalidates with its own reason', () => {
  const others = subscribed.filter(([event]) => event !== 'domain/changed')
  assert.ok(others.length >= 12, 'the other events were parsed: ' + others.length)
  for (const [event, reason] of [['tools/change', 'tools'], ['skills/change', 'skills'], ['system-prompt/change', 'presets']]) {
    assert.ok(others.some(([name, expected]) => name === event && expected === reason), event + ' -> ' + reason + ' is subscribed')
  }
  for (const [event, reason] of others) {
    const { invalidations, provider } = recordingProvider()
    // The payload of a different event is never inspected: even one that looks like a checkpoint must not matter.
    wire(provider).emit(event, { domain: 'session_projcache' })
    assert.deepEqual(invalidations, [reason], event + ' invalidates with ' + reason)
  }
})

test('with the real catalog provider: checkpoints start no discovery, a registry write starts one', async () => {
  const dir = path.join(scratchRoot, 'domain-changed-' + process.pid)
  await fs.mkdir(dir, { recursive: true })
  let discoveries = 0
  const facts = Array.from({ length: 3 }, (_, index) => ({ kind: 'tool', name: 'domain_changed_tool_' + index, description: 'Synthetic tool.', sources: ['host'] }))
  const readDiscovery = async () => {
    discoveries += 1
    return {
      slices: [{ id: 'host:tools', viewId: 'host', roles: ['host'], part: 'tools', complete: true, diagnostics: [], facts }],
      authoritative: true, defaultViewId: 'host', projectPaths: [], privateViews: new Map(), packageVersions: {}, nativeResidueProven: false, diagnostics: [], adapterEvidence: undefined,
    }
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const provider = createCatalogProvider({ dir, getModules: () => [], readDiscovery })
  try {
    const { emit } = wire(provider)
    await provider.refresh()
    await sleep(150)
    const settled = discoveries
    assert.ok(settled >= 1, 'the first discovery ran')

    // Six sessions, a checkpoint each every five seconds, for a minute: 72 events, none of which reads anything new.
    for (let index = 0; index < 72; index += 1) emit('domain/changed', { domain: 'session_projcache', table: 'sessions', key: 'session-' + (index % 6), operation: 'put' })
    await sleep(300)
    assert.equal(discoveries, settled, 'no discovery ran for the checkpoints')

    emit('domain/changed', { domain: 'workspace', table: 'workspaces', key: 'ws-1', operation: 'put' })
    for (let waited = 0; discoveries === settled && waited < 3000; waited += 20) await sleep(20)
    assert.equal(discoveries, settled + 1, 'the registry write ran exactly one discovery')
  } finally {
    await provider.dispose()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
