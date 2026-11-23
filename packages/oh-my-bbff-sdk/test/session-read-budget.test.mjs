// Contract test: the session-read budget policy (owner decision: > 30 MB AND untouched
// for 7 days is never decoded), its settings resolution, and the stat-only locator.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import {
  SESSION_LOG_FILENAMES, SESSION_READ_LIMIT_DEFAULTS, SESSION_READ_LIMIT_RANGES, SESSION_READ_SKIP_CODE,
  SESSION_READ_SKIP_REASON_KEY, createSessionReadBudget, sessionReadLimits, sessionReadSkipParams,
  skippableSessionLog, statSessionLog,
} from '../contract.js'

const MIB = 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const scratch = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '.test-artifacts')

/** A sparse log: reports a size without allocating or writing that many bytes. */
async function sparseLog(file, sizeBytes) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const handle = await fs.open(file, 'w')
  try { await handle.truncate(sizeBytes) } finally { await handle.close() }
  return file
}

async function fixtureRoot() {
  const root = path.join(scratch, 'session-budget-' + process.pid + '-' + Date.now())
  const now = Date.now()
  const old = new Date(now - 8 * DAY)
  const big = SESSION_READ_LIMIT_DEFAULTS.maxSizeMb * MIB + MIB
  const cases = {
    'big-old': { size: big, at: old },
    'big-fresh': { size: big, at: new Date(now) },
    'small-old': { size: 20 * MIB, at: old },
    'small-fresh': { size: MIB, at: new Date(now) },
  }
  for (const [id, spec] of Object.entries(cases)) {
    const file = await sparseLog(path.join(root, 'bucket', id, SESSION_LOG_FILENAMES[0]), spec.size)
    await fs.utimes(file, spec.at, spec.at)
  }
  return { root, cases, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}

test('limits default to 30 MB and 7 days and stay configurable within their ranges', () => {
  assert.deepEqual({ ...SESSION_READ_LIMIT_DEFAULTS }, { maxSizeMb: 30, maxAgeDays: 7 })
  const defaults = sessionReadLimits({})
  assert.equal(defaults.maxSizeBytes, 30 * MIB)
  assert.equal(defaults.maxAgeMs, 7 * DAY)
  assert.deepEqual({ ...sessionReadLimits({ maxSizeMb: 55, maxAgeDays: 3 }) }, { maxSizeMb: 55, maxAgeDays: 3, maxSizeBytes: 55 * MIB, maxAgeMs: 3 * DAY })
  assert.equal(sessionReadLimits({ maxSizeMb: 0 }).maxSizeMb, SESSION_READ_LIMIT_RANGES.maxSizeMb.min, 'below-range sizes clamp up')
  assert.equal(sessionReadLimits({ maxAgeDays: 99999 }).maxAgeDays, SESSION_READ_LIMIT_RANGES.maxAgeDays.max, 'above-range ages clamp down')
  assert.equal(sessionReadLimits({ maxSizeMb: 'nonsense' }).maxSizeMb, 30, 'unusable values fall back to the owner default')
})

test('the rule needs BOTH conditions: larger than the limit AND older than the age limit', () => {
  const limits = sessionReadLimits({})
  const now = 1_000 * DAY
  assert.equal(skippableSessionLog({ sizeBytes: 31 * MIB, mtimeMs: now - 8 * DAY }, now, limits), true)
  assert.equal(skippableSessionLog({ sizeBytes: 31 * MIB, mtimeMs: now - DAY }, now, limits), false, 'a large but fresh log is read')
  assert.equal(skippableSessionLog({ sizeBytes: 20 * MIB, mtimeMs: now - 30 * DAY }, now, limits), false, 'a small but old log is read')
  assert.equal(skippableSessionLog({ sizeBytes: 31 * MIB, mtimeMs: now - 7 * DAY }, now, limits), false, 'exactly at the age limit is not older')
  assert.equal(skippableSessionLog({}, now, limits), false, 'unknown stats never skip')
})

test('statSessionLog finds a log without opening it, and the budget skips only the stale big ones', async () => {
  const fixture = await fixtureRoot()
  try {
    const stats = await statSessionLog(fixture.root, 'big-old')
    assert.equal(stats.sizeBytes, fixture.cases['big-old'].size)
    assert.ok(stats.mtimeMs < Date.now() - 7 * DAY)
    assert.equal(await statSessionLog(fixture.root, 'not-a-session'), null)
    assert.equal(await statSessionLog(fixture.root, '../escape'), null, 'session ids cannot escape the sessions root')

    const now = Date.now()
    const budget = createSessionReadBudget({ sessionsRoot: fixture.root, now: () => now, cacheMs: 0 })
    assert.equal((await budget.check('big-old')).skipped, true)
    assert.equal((await budget.check('big-fresh')).skipped, false)
    assert.equal((await budget.check('small-old')).skipped, false)
    assert.equal((await budget.check('small-fresh')).skipped, false)
    const verdict = await budget.check('big-old')
    assert.equal(verdict.code, SESSION_READ_SKIP_CODE)
    assert.equal(verdict.reasonKey, SESSION_READ_SKIP_REASON_KEY)
    assert.equal(verdict.sessionId, 'big-old')
    const params = sessionReadSkipParams(verdict)
    assert.equal(params.sessionId, 'big-old')
    assert.equal(params.sizeMb, 31)
    assert.ok(params.ageDays >= 7)
    assert.equal(params.maxSizeMb, 30)
    assert.equal(params.maxAgeDays, 7)
    assert.equal((await budget.check('big-old', { exempt: true })).skipped, false, 'an exempt read is never skipped')
  } finally { await fixture.cleanup() }
})

test('thresholds come from settings, so a raised limit reads the same log', async () => {
  const fixture = await fixtureRoot()
  try {
    let settings = {}
    const now = Date.now()
    const budget = createSessionReadBudget({ sessionsRoot: fixture.root, getSettings: () => settings, now: () => now, cacheMs: 0 })
    assert.equal((await budget.check('big-old')).skipped, true)
    settings = { maxSizeMb: 64 }
    assert.equal((await budget.check('big-old')).skipped, false, 'a 64 MB limit admits the 31 MB log')
    settings = { maxSizeMb: 64, maxAgeDays: 30 }
    assert.equal((await budget.check('big-old')).skipped, false)
    settings = { maxSizeMb: 10, maxAgeDays: 1 }
    assert.equal((await budget.check('small-old')).skipped, true, 'a tightened size+age limit skips the 20 MB 8-day-old log')
    assert.equal((await budget.check('small-fresh')).skipped, false, 'the fresh log is still read under tightened limits')
  } finally { await fixture.cleanup() }
})
