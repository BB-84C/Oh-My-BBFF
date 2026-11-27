// Dreaming reviews the human messages of the sessions the host lists. A session the user archived is hidden from the
// host's session groupings, and the user does not expect its content to end up in memory, so the kernel adds the
// registry's archived session ids to the exclusion list that `computeDelta` already takes (`exclude.sessionIds`),
// next to the Resident's own sessions. The registry is the host's `workspaceRegistry` service; when it is missing, not
// started yet or failing, nothing extra is excluded, which is what the kernel did before.
//
// The kernel runs for real, over a fake session source and a fake registry. The fake registry has the property of
// the real one that matters here: reading `archivedSessionIds` throws until the registry has started.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createDreamingKernel } from '../lib/dreaming/kernel.js'
import { dreamingPaths } from '../lib/dreaming/state.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = path.join(packageRoot, '.test-artifacts')
let sequence = 0

/** A session source with one human message per session; `reads` records which sessions were opened. */
function fakeSource(ids) {
  const reads = []
  const source = {
    reads,
    available: () => true,
    async list() { return ids.map((id) => ({ id, cwd: null, sourceCwd: '/work/' + id, isSubagent: false, revision: '1', eventCount: 1, createdAt: null })) },
    async sessionCheck() { return null },
    async readFacts(id) {
      reads.push(id)
      const message = { complete: true, human: true, value: { text: 'message of ' + id, seq: 0, time: null }, sourceDigest: 'digest-' + id }
      return { events: [], totalEvents: 1, revision: '1', human: new Map([[0, message]]), invalid: new Map() }
    },
    async root(id) { return { resolved: true, cwd: '/work/' + id } },
    budgetDescribe: () => null,
  }
  return source
}

/** What `workspaceRegistry` does: the archive set is readable once the registry has started, and throws before. */
function fakeRegistry({ started = true, archived = [] } = {}) {
  const registry = {
    started, archived: [...archived],
    get archivedSessionIds() {
      if (!registry.started) throw new Error('workspace registry is not started yet')
      return registry.archived
    },
  }
  return registry
}

async function openKernel(options = {}) {
  const home = path.join(scratchRoot, 'archived-sessions-' + process.pid + '-' + (++sequence))
  await fs.mkdir(home, { recursive: true })
  const source = fakeSource(options.sessions ?? ['sess-a', 'sess-b', 'sess-c'])
  const kernel = createDreamingKernel({ paths: dreamingPaths({ home }), getSettings: () => ({}), source, ...(options.getArchivedSessionIds ? { getArchivedSessionIds: options.getArchivedSessionIds } : {}) })
  return { kernel, source, close: () => fs.rm(home, { recursive: true, force: true }) }
}

const reviewed = async (kernel) => (await kernel.prepareWakeDelta()).entries.map((entry) => entry.sessionId)

test('archived sessions are neither read nor part of the delta', async () => {
  const registry = fakeRegistry({ archived: ['sess-b'] })
  const { kernel, source, close } = await openKernel({ getArchivedSessionIds: () => registry.archivedSessionIds })
  try {
    const delta = await kernel.prepareWakeDelta()
    assert.deepEqual(delta.entries.map((entry) => entry.sessionId), ['sess-a', 'sess-c'])
    assert.deepEqual(source.reads, ['sess-a', 'sess-c'], 'the archived session was not even opened')
    assert.equal(delta.stats.sessionsListed, 3)
    assert.equal(delta.stats.sessionsConsidered, 2)
  } finally { await close() }
})

test('the archive set is read for every delta: unarchiving brings a session back, archiving removes one', async () => {
  const registry = fakeRegistry({ archived: ['sess-b'] })
  const { kernel, close } = await openKernel({ getArchivedSessionIds: () => registry.archivedSessionIds })
  try {
    assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-c'])
    registry.archived = []
    assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-b', 'sess-c'])
    registry.archived = ['sess-a', 'sess-c']
    assert.deepEqual(await reviewed(kernel), ['sess-b'])
  } finally { await close() }
})

test('the Resident\'s own sessions stay excluded next to the archived ones', async () => {
  const registry = fakeRegistry({ archived: ['sess-b'] })
  const { kernel, close } = await openKernel({ sessions: ['sess-a', 'sess-b', 'sess-c', 'sess-d', 'sess-e'], getArchivedSessionIds: () => registry.archivedSessionIds })
  try {
    kernel.ensureInitialised()
    kernel.write({ ...kernel.readState().state, residentSessionId: 'sess-c', previousResidentSessionIds: ['sess-d'] })
    assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-e'])
  } finally { await close() }
})

test('without a registry nothing extra is excluded', async () => {
  for (const getArchivedSessionIds of [undefined, () => undefined, () => null]) {
    const { kernel, close } = await openKernel({ getArchivedSessionIds })
    try {
      assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-b', 'sess-c'])
    } finally { await close() }
  }
})

test('a registry that has not started, or fails, does not break the delta', async () => {
  const notStarted = fakeRegistry({ started: false, archived: ['sess-b'] })
  const failing = () => { throw new TypeError('registry failure') }
  for (const getArchivedSessionIds of [() => notStarted.archivedSessionIds, failing]) {
    const { kernel, close } = await openKernel({ getArchivedSessionIds })
    try {
      assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-b', 'sess-c'], 'every session is reviewed, as before the archive set was read')
    } finally { await close() }
  }
  // The registry that comes up later is used from then on.
  const { kernel, close } = await openKernel({ getArchivedSessionIds: () => notStarted.archivedSessionIds })
  try {
    assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-b', 'sess-c'])
    notStarted.started = true
    assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-c'])
  } finally { await close() }
})

test('a value that is not a list of session ids is ignored, a list with other items keeps its ids', async () => {
  for (const value of ['sess-b', { 0: 'sess-b', length: 1 }, 42, true]) {
    const { kernel, close } = await openKernel({ getArchivedSessionIds: () => value })
    try {
      assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-b', 'sess-c'], 'ignored: ' + JSON.stringify(value))
    } finally { await close() }
  }
  const { kernel, close } = await openKernel({ getArchivedSessionIds: () => [null, 7, { id: 'sess-a' }, 'sess-b'] })
  try {
    assert.deepEqual(await reviewed(kernel), ['sess-a', 'sess-c'])
  } finally { await close() }
})

test('index.js reads the archive set from the host\'s workspaceRegistry service', async () => {
  const source = await fs.readFile(path.join(packageRoot, 'index.js'), 'utf8')
  const kernel = /createDreamingKernel\(\{([^}]*)\}/.exec(source)
  assert.ok(kernel, 'the kernel is created in index.js')
  assert.match(kernel[1], /getArchivedSessionIds: \(\) => get\('workspaceRegistry'\)\?\.archivedSessionIds/)
})
