// Regression for community issue #1: a large catalog batch must not block the host
// thread. Before the fix, observe() rebuilt and serialized the whole ledger per
// accepted observation, so a 6,000-observation batch over 500 entries took ~10s here
// (17s on the reporter's machine) and a zero-delay timer could not fire until it
// returned. The bounds below are generous for a loaded machine and still fail the old
// quadratic path by an order of magnitude.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createCatalogLedger } from '../lib/catalog-ledger.js'
import { widgetRoot } from './support/client-harness.mjs'

const scratchRoot = path.join(widgetRoot, '.test-artifacts')
const TIME_BUDGET_MS = 4000
const MAX_GROWTH_RATIO = 8
const MAX_TIMER_DELAY_MS = 1000

let sequence = 0
async function openLedger() {
  const dir = path.join(scratchRoot, 'ledger-scale-' + process.pid + '-' + (++sequence))
  await fs.mkdir(dir, { recursive: true })
  const ledger = createCatalogLedger({ dir, now: () => new Date().toISOString(), writeDebounceMs: 60_000, reconcileMs: 0 })
  await ledger.initialize()
  return { dir, ledger, close: async () => { await ledger.dispose(); await fs.rm(dir, { recursive: true, force: true }) } }
}

/** The reported shape: `names` catalog rows revisited once per source. */
function batch(names, sources) {
  const records = []
  const at = new Date().toISOString()
  for (let source = 0; source < sources; source += 1) {
    for (let name = 0; name < names; name += 1) {
      const label = 'row-' + String(name)
      records.push({ kind: 'tool', name: label, description: label + ' 描述 ' + 'x'.repeat(40), sources: ['preset:s' + String(source)], firstSeenAt: at, lastSeenAt: at })
    }
  }
  return records
}

async function timed(records) {
  const session = await openLedger()
  try {
    const started = performance.now()
    const result = session.ledger.observe(records)
    const elapsed = performance.now() - started
    await session.ledger.flush()
    const persisted = JSON.parse(await fs.readFile(session.ledger.file, 'utf8'))
    return { elapsed, result, entries: persisted.entries }
  } finally { await session.close() }
}

test('a 6,000-observation batch stays far inside the interactive budget', async () => {
  const { elapsed, result, entries } = await timed(batch(500, 12))
  assert.equal(result.accepted, 6000, 'every observation is admitted')
  assert.equal(result.rejected, 0)
  assert.equal(entries.length, 500, 'the batch collapses into 500 catalog rows')
  assert.equal(entries[0].sources.length, 12, 'the source union is complete')
  assert.ok(elapsed < TIME_BUDGET_MS, 'observe() took ' + Math.round(elapsed) + 'ms, budget ' + TIME_BUDGET_MS + 'ms')
})

test('the batch cost grows with observations, not with observations x entries', async () => {
  const small = await timed(batch(500, 3))
  const large = await timed(batch(500, 12))
  assert.equal(small.result.accepted, 1500)
  assert.equal(large.result.accepted, 6000)
  // Same 500 entries, four times the observations: linear work gives ~4x, the old
  // per-observation whole-ledger rebuild gave ~16x.
  const ratio = large.elapsed / Math.max(small.elapsed, 0.5)
  assert.ok(ratio < MAX_GROWTH_RATIO, 'growth ratio ' + ratio.toFixed(1) + 'x for 4x observations (budget ' + MAX_GROWTH_RATIO + 'x)')
})

test('the event loop stays free while a large batch is observed', async () => {
  const session = await openLedger()
  try {
    const records = batch(500, 8)
    let firedAt = null
    const started = performance.now()
    setTimeout(() => { firedAt = performance.now() }, 0)
    session.ledger.observe(records)
    for (let tick = 0; tick < 200 && firedAt === null; tick += 1) await new Promise((resolve) => setImmediate(resolve))
    assert.notEqual(firedAt, null, 'the zero-delay timer fired')
    const delay = firedAt - started
    assert.ok(delay < MAX_TIMER_DELAY_MS, 'a zero-delay timer waited ' + Math.round(delay) + 'ms (budget ' + MAX_TIMER_DELAY_MS + 'ms)')
  } finally { await session.close() }
})
