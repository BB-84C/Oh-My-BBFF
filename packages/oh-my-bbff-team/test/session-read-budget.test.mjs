// Behaviour test: Team's cold-session hydration obeys the session-read budget. A member
// whose log is larger than 30 MB and untouched for 7 days is marked `skipped` in its
// fact instead of being decoded, so the roster never queues a multi-tens-of-MB decode.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { SESSION_LOG_FILENAMES, createSessionReadBudget } from '../lib/bbff-contract.js'
import { createTree } from '../lib/tree.js'
import { createActivity } from '../lib/activity.js'
import { createReportTimeBackfill } from '../lib/report-time-backfill.js'

const MIB = 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const scratch = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '.test-artifacts')

async function sparseLog(file, sizeBytes) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const handle = await fs.open(file, 'w')
  try { await handle.truncate(sizeBytes) } finally { await handle.close() }
  return file
}

async function fixtureRoot() {
  const root = path.join(scratch, 'team-budget-' + process.pid + '-' + Date.now())
  const now = Date.now(), old = new Date(now - 8 * DAY)
  for (const [id, size, at] of [['big-old', 31 * MIB, old], ['small-fresh', MIB, new Date(now)]]) {
    await fs.utimes(await sparseLog(path.join(root, 'bucket', id, SESSION_LOG_FILENAMES[0]), size), at, at)
  }
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}

function fakePersistence() {
  const opened = []
  return {
    opened,
    identity: 'team-persistence-fixture',
    async stat(id) { return { revision: 'r-' + id, header: { id, version: 4, events: 2 }, eventCount: 2 } },
    async open(id) {
      opened.push(String(id))
      return { header: { id, version: 4, events: 0 }, inheritedEventCount: 0, async read() { return { events: [] } }, async close() {} }
    },
  }
}

const contextOf = (persistence) => (name) => {
  if (name === 'sessionPersistence') return persistence
  if (name === 'agents') return { get: () => undefined }
  if (name === 'sessions') return { get: () => undefined }
  return undefined
}

test('hydration marks a large, long-untouched member fact as skipped without decoding it', async () => {
  const fixture = await fixtureRoot()
  try {
    const persistence = fakePersistence()
    const sessionBudget = createSessionReadBudget({ sessionsRoot: fixture.root, now: Date.now, cacheMs: 0 })
    const tree = createTree(contextOf(persistence), { sessionBudget, getSettings: () => ({}), now: Date.now })
    try {
      const status = await tree.syncSession('big-old')
      assert.equal(status, 'skipped')
      assert.deepEqual(persistence.opened, [], 'the excluded log is never opened')
      const fact = tree.ledger.agent('big-old')
      assert.equal(fact?.skipped?.code, 'session-read-skipped', 'the member fact records the skip')
      assert.equal(fact?.skipped?.sizeBytes, 31 * MIB, 'the fact carries the log size')
      assert.ok(fact?.skipped?.ageMs >= 7 * DAY, 'the fact carries the log age')
      assert.equal(fact?.skipped?.maxSizeMb, 30)
      assert.equal(fact?.skipped?.maxAgeDays, 7)
      assert.ok(tree.diagnostics().skipped >= 1, 'the tree diagnostics count the skip')

      // The same revision is never retried, and a fresh log is still hydrated.
      const again = await tree.syncSession('big-old')
      assert.ok(again === 'current' || again === 'skipped', 'no repeated decode attempt')
      assert.deepEqual(persistence.opened, [])
      await tree.syncSession('small-fresh')
      assert.deepEqual(persistence.opened, ['small-fresh'], 'a fresh log is hydrated normally')
    } finally { await tree.dispose() }
  } finally { await fixture.cleanup() }
})

test('the report-time backfill skips an over-budget log instead of decoding it', async () => {
  // The backfill only accepts native session identities, so this fixture uses UUID directory names.
  const bigId = '11111111-1111-4111-8111-111111111111', freshId = '22222222-2222-4222-8222-222222222222'
  const root = path.join(scratch, 'team-backfill-' + process.pid + '-' + Date.now())
  const run = async (id) => {
    let writes = 0
    const reports = {
      allRows: () => [{ id, row: { timestamp: null, report: { text: 'report body' }, source: { capturedAt: '2026-01-02T03:04:05.000Z' } } }],
      fix: () => null,
      applyTimeBackfill: () => { writes += 1; return { updated: 0, skipped: 0, backup: null } },
    }
    const backfill = createReportTimeBackfill({ reports, sessionRoot: root, logger: { warn() {}, info() {}, error() {} } })
    await backfill.flight
    return { diagnostics: backfill.diagnostics(), writes }
  }
  try {
    const old = new Date(Date.now() - 8 * DAY)
    const stale = await sparseLog(path.join(root, 'bucket', bigId, SESSION_LOG_FILENAMES[0]), 31 * MIB)
    await fs.utimes(stale, old, old)
    const staleRun = await run(bigId)
    const skipped = staleRun.diagnostics.rows.find((row) => row.id === bigId)
    assert.equal(staleRun.writes, 0, 'a skipped row must not trigger a checkpoint write')
    assert.equal(skipped.decision, 'skipped')
    assert.equal(skipped.reason, 'session-read-skipped', 'the stale log is skipped before any decode')
    assert.equal(skipped.sizeBytes, 31 * MIB)
    assert.ok(skipped.ageMs >= 7 * DAY)

    // An empty (valid) fresh log is decoded, finds no matching event, and falls back to the capture time.
    const fresh = path.join(root, 'bucket', freshId, SESSION_LOG_FILENAMES[1])
    await fs.mkdir(path.dirname(fresh), { recursive: true })
    await fs.writeFile(fresh, '')
    const freshRun = await run(freshId)
    const freshRow = freshRun.diagnostics.rows.find((row) => row.id === freshId)
    assert.equal(freshRow.decision, 'capture-time', 'the fresh log went through the decode path')
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('the background turn-summary scan honours the budget while a named-member request stays exempt', async () => {
  const fixture = await fixtureRoot()
  try {
    const persistence = fakePersistence()
    const sessionBudget = createSessionReadBudget({ sessionsRoot: fixture.root, now: Date.now, cacheMs: 0 })
    const activity = createActivity({ get: contextOf(persistence), getSettings: () => ({}), sessionBudget, now: Date.now })
    const scanned = await activity.warmTurnSummary('big-old')
    assert.equal(scanned.status, 'skipped', 'the unattended warm scan never decodes an over-budget log')
    assert.equal(scanned.code, 'session-read-skipped')
    assert.deepEqual(persistence.opened, [])
    // The explicit named-member request path is exempt by design (documented in the module header).
    await activity.lastTurnEnd('small-fresh')
    assert.deepEqual(persistence.opened, ['small-fresh'], 'a named-member request still reads its log')
  } finally { await fixture.cleanup() }
})
