// Behaviour test for the session-read budget in the Widgets read surfaces.
//
// Owner rule (2026-11-22): a session log larger than 30 MB that has not been written for
// 7 days is never decoded. DSH decompresses a whole compressed log even for a logical
// read, so the budget must be enforced BEFORE `sessionPersistence.open` — this test
// fails if any excluded log is opened. Fixtures are sparse files (a size without the
// bytes), so the real locator and the real limits are exercised.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { SESSION_LOG_FILENAMES, createSessionReadBudget } from '../lib/bbff-contract.js'
import { createIncrementalViews } from '../lib/incremental-views.js'
import { createStateReaders } from '../lib/state-readers.js'
import { widgetRoot } from './support/client-harness.mjs'

const MIB = 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const scratch = path.join(widgetRoot, '.test-artifacts')

async function sparseLog(file, sizeBytes) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const handle = await fs.open(file, 'w')
  try { await handle.truncate(sizeBytes) } finally { await handle.close() }
  return file
}

/** The same four cases the owner rule distinguishes, as sparse logs with real mtimes. */
async function fixtureRoot() {
  const root = path.join(scratch, 'views-budget-' + process.pid + '-' + Date.now())
  const now = Date.now(), old = new Date(now - 8 * DAY), big = 31 * MIB
  const cases = { 'big-old': [big, old], 'big-fresh': [big, new Date(now)], 'small-old': [20 * MIB, old], 'small-fresh': [MIB, new Date(now)] }
  for (const [id, [size, at]] of Object.entries(cases)) await fs.utimes(await sparseLog(path.join(root, 'bucket', id, SESSION_LOG_FILENAMES[0]), size), at, at)
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}

/** Fake persistence: records every open, returns no events (the fold itself is not under test). */
function fakePersistence() {
  const opened = []
  return {
    opened,
    identity: 'persistence-fixture',
    async stat(id) { return { revision: 'r-' + id, header: { id, version: 4, events: 0 }, eventCount: 0 } },
    async open(id) {
      opened.push(String(id))
      return { header: { id, version: 4, events: 0 }, inheritedEventCount: 0, async read() { return { events: [] } }, async close() {} }
    },
  }
}

const contextOf = (persistence) => ({ get: (name) => (name === 'sessionPersistence' ? persistence : undefined), on: () => undefined })

test('cold views never open a large, long-untouched log and report the skip', async () => {
  const fixture = await fixtureRoot()
  const dir = path.join(scratch, 'views-checkpoints-' + process.pid + '-' + Date.now())
  try {
    const persistence = fakePersistence()
    const sessionBudget = createSessionReadBudget({ sessionsRoot: fixture.root, now: Date.now, cacheMs: 0 })
    const views = createIncrementalViews(contextOf(persistence), { dir, sessionBudget, readConcurrency: 1 })
    try {
      await views.refresh('big-old', { wait: true })
      assert.deepEqual(persistence.opened, [], 'the excluded log is never opened (no decode at all)')
      const skipped = views.snapshot('big-old').diagnostics.entries.find((entry) => entry.code === 'session-read-skipped')
      assert.ok(skipped, 'the skip is an explicit diagnostic')
      assert.equal(skipped.reason.$bbff, 'bbff-message', 'the reason is a localizable reference')
      assert.equal(skipped.reason.key, 'diag.sessionReadSkipped')
      assert.equal(skipped.reason.params.sessionId, 'big-old')
      assert.equal(skipped.reason.params.sizeMb, 31)
      assert.ok(skipped.reason.params.ageDays >= 7)
      assert.equal(views.counts.skipped, 1)
      assert.equal(views.counts.readOpens, 0)

      for (const id of ['big-fresh', 'small-old', 'small-fresh']) await views.refresh(id, { wait: true })
      assert.deepEqual(persistence.opened.sort(), ['big-fresh', 'small-fresh', 'small-old'], 'a fresh or small log is still read')

      // An explicit user request is never skipped by the rule.
      persistence.opened.length = 0
      views.request('big-old', { pin: true })
      await views.refresh('big-old', { wait: true })
      assert.deepEqual(persistence.opened, ['big-old'], 'the session the user opened is read')
      assert.equal(views.snapshot('big-old').diagnostics.entries.some((entry) => entry.code === 'session-read-skipped'), false)
    } finally { await views.dispose() }
  } finally { await fixture.cleanup(); await fs.rm(dir, { recursive: true, force: true }) }
})

test('the views honour the configured thresholds', async () => {
  const fixture = await fixtureRoot()
  const dir = path.join(scratch, 'views-checkpoints-limits-' + process.pid + '-' + Date.now())
  try {
    let settings = {}
    const persistence = fakePersistence()
    const sessionBudget = createSessionReadBudget({ sessionsRoot: fixture.root, getSettings: () => settings, now: Date.now, cacheMs: 0 })
    const views = createIncrementalViews(contextOf(persistence), { dir, sessionBudget, getSettings: () => settings, readConcurrency: 1 })
    try {
      await views.refresh('big-old', { wait: true })
      assert.deepEqual(persistence.opened, [], 'default limits skip the 31 MB 8-day-old log')
      settings = { sessionReadMaxSizeMb: 64, sessionReadMaxAgeDays: 7 }
      await views.refresh('big-old', { wait: true })
      assert.deepEqual(persistence.opened, ['big-old'], 'a raised size limit reads the same log')
    } finally { await views.dispose() }
  } finally { await fixture.cleanup(); await fs.rm(dir, { recursive: true, force: true }) }
})

test('cold state reads skip the excluded log without inventing a value', async () => {
  const fixture = await fixtureRoot()
  try {
    const persistence = fakePersistence()
    const sessionBudget = createSessionReadBudget({ sessionsRoot: fixture.root, now: Date.now, cacheMs: 0 })
    const readers = createStateReaders(contextOf(persistence), { sessionBudget })
    try {
      assert.equal(await readers.coldRoute('big-old'), undefined, 'a skipped read produces no value')
      assert.deepEqual(persistence.opened, [], 'nothing was opened')
      assert.equal(readers.counts.skipped, 1)
      assert.equal(readers.counts.decodes, 0)
      const skip = readers.skips().find((row) => row.sessionId === 'big-old')
      assert.equal(skip.code, 'session-read-skipped')
      assert.equal(skip.sizeBytes, 31 * MIB)
      assert.ok(skip.ageMs >= 7 * DAY)
      assert.equal(skip.reason.key, 'diag.sessionReadSkipped')

      await readers.coldRoute('small-fresh')
      assert.deepEqual(persistence.opened, ['small-fresh'], 'a fresh log is read through the same reader')
      assert.equal(readers.counts.skipped, 1, 'only the excluded log is counted as skipped')
    } finally { readers.dispose() }
  } finally { await fixture.cleanup() }
})

test('every first-party bundle vendors the contract byte for byte', async () => {
  const packages = path.dirname(widgetRoot)
  const digest = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex')
  const files = [['oh-my-bbff-sdk/contract.js', 'lib/bbff-contract.js'], ['oh-my-bbff-sdk/dsh-adapter.js', 'lib/dsh-adapter.js'], ['oh-my-bbff-sdk/locale/en.json', 'lib/bbff-sdk-locale/en.json'], ['oh-my-bbff-sdk/locale/zh.json', 'lib/bbff-sdk-locale/zh.json']]
  const mismatches = []
  for (const bundle of ['oh-my-bbff-widgets', 'oh-my-bbff-team', 'oh-my-bbff-memory', 'oh-my-bbff-scope']) {
    for (const [source, vendored] of files) {
      const left = await digest(path.join(packages, source))
      const right = await digest(path.join(packages, bundle, vendored))
      if (left !== right) mismatches.push(bundle + ' ' + vendored)
    }
  }
  assert.deepEqual(mismatches, [], 'vendored contract copies must be byte-identical to the SDK source')
})
