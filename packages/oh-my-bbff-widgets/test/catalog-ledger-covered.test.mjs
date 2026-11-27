// Discovery observes every catalog fact once per source slice (the host, each preset, each project) and every
// observation lists only that one source, while the ledger stores one row per fact that holds the union of the
// sources. The fingerprint test of observe() compares the whole row, so a one-source observation never matched a
// multi-source row and every rescan was admitted, merged and announced as a change although nothing was new.
//
// An observation that the row it would be merged into already covers (same kind, description and flags, every
// source, latest source and project path already present) is now a no-op. The row it is compared with is the
// pending row when there is one, and the stored row otherwise.
//
// The cases D1-D8 pin the rows that come out to what the previous algorithm produced, so only the work that
// leads there is different: expectations were taken from the unpatched ledger.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createCatalogLedger } from '../lib/catalog-ledger.js'
import { widgetRoot } from './support/client-harness.mjs'

const scratchRoot = path.join(widgetRoot, '.test-artifacts')
const iso = (seconds) => new Date(Date.UTC(2026, 10, 26, 10, 0, 0) + seconds * 1000).toISOString()
let sequence = 0

async function openLedger() {
  const dir = path.join(scratchRoot, 'ledger-covered-' + process.pid + '-' + (++sequence))
  await fs.mkdir(dir, { recursive: true })
  let changes = 0
  // A long debounce: nothing is written unless the test flushes, so a write window is exactly what the test makes it.
  const ledger = createCatalogLedger({ dir, writeDebounceMs: 600_000, reconcileMs: 0, onChange: () => { changes += 1 } })
  await ledger.initialize()
  return { ledger, changes: () => changes, close: async () => { await ledger.dispose(); await fs.rm(dir, { recursive: true, force: true }) } }
}

const skill = (description, sources, at, extra = {}) => ({ kind: 'skill', name: 'case-skill', description, sources, latestSource: sources.at(-1), firstSeenAt: iso(at), lastSeenAt: iso(at), ...extra })
const rowOf = (ledger, kind, name) => ledger.snapshot().entries.find((row) => row.kind === kind && row.name === name)
const content = (row) => ({ description: row.description, sources: [...row.sources].sort(), projectPaths: [...(row.projectPaths ?? [])].sort(), sessionLocal: row.sessionLocal === true })

/** The stored row of the cases below: one skill seen from three source slices, flushed, as discovery leaves it. */
async function seed(ledger) {
  for (const source of ['host', 'project:/p/one', 'project:/p/two']) {
    ledger.observe([skill('A', [source], 0, source.startsWith('project:') ? { projectPaths: [source.slice('project:'.length)] } : {})])
  }
  await ledger.flush()
}

test('a rescan that brings nothing new is a no-op: no admission, no change notification, no write', async () => {
  const session = await openLedger()
  try {
    const { ledger } = session
    const scan = (at) => {
      const records = []
      for (let name = 0; name < 40; name += 1) {
        for (const source of ['host', 'preset:one', 'preset:two']) records.push({ kind: 'tool', name: 'tool_' + name, description: 'Tool ' + name, sources: [source], latestSource: source, firstSeenAt: iso(at), lastSeenAt: iso(at) })
      }
      return records
    }
    assert.deepEqual(ledger.observe(scan(0)), { accepted: 120, rejected: 0, unchanged: 0 }, 'the first scan is admitted')
    await ledger.flush()
    const written = ledger.counts.writes, revision = ledger.revision(), changes = session.changes()

    assert.deepEqual(ledger.observe(scan(60)), { accepted: 0, rejected: 0, unchanged: 120 }, 'the same facts again are unchanged')
    assert.equal(session.changes(), changes, 'no change notification')
    assert.equal(ledger.revision(), revision, 'the change token did not move')
    assert.equal((await ledger.flush()).changed, false, 'nothing to write')
    assert.equal(ledger.counts.writes, written, 'the file was not rewritten')
    // The timestamps of a no-op observation are not refreshed: the existing fingerprint test already behaves like this.
    assert.equal(rowOf(ledger, 'tool', 'tool_0').lastSeenAt, iso(0))
  } finally { await session.close() }
})

test('an observation that brings something new is still admitted', async () => {
  const session = await openLedger()
  try {
    const { ledger } = session
    await seed(ledger)
    const changes = session.changes()
    const result = ledger.observe([
      skill('A', ['mcp:extra'], 10),                                                                  // a new source
      { ...skill('A', ['host'], 10), name: 'other-skill', description: 'Another skill' },             // a new row
      skill('A', ['host', 'project:/p/three'], 10, { projectPaths: ['/p/three'] }),                   // a new project path
      skill('A (reworded)', ['host'], 11),                                                            // a new description
    ])
    assert.equal(result.accepted, 4)
    assert.equal(result.unchanged, 0)
    assert.ok(session.changes() > changes, 'the change is announced')
    await ledger.flush()
    const row = content(rowOf(ledger, 'skill', 'case-skill'))
    assert.deepEqual(row.sources, ['host', 'mcp:extra', 'project:/p/one', 'project:/p/three', 'project:/p/two'])
    assert.deepEqual(row.projectPaths, ['/p/one', '/p/three', '/p/two'])
    assert.equal(row.description, 'A (reworded)')
    assert.ok(rowOf(ledger, 'skill', 'other-skill'))
  } finally { await session.close() }
})

// The expected rows are what the unpatched ledger leaves for the same observations. `work` is what each observe() call
// did: `unchanged` for an observation the row in flight or the stored row already covers, `accepted` for the rest.
const ONE_TWO = ['/p/one', '/p/two']
const THREE_SOURCES = ['host', 'project:/p/one', 'project:/p/two']
const CASES = [
  {
    name: 'D1 description A, B, A inside one write window ends as A (the pending row, not the stored one, is the base)',
    run: ({ observe }) => { observe(skill('B', ['host'], 1)); observe(skill('A', ['host'], 2)) },
    work: ['accepted', 'accepted'],
    expected: { description: 'A', sources: THREE_SOURCES, projectPaths: ONE_TWO, sessionLocal: false },
  },
  {
    name: 'D2 description A, B, flush, A ends as A',
    run: async ({ observe, flush }) => { observe(skill('B', ['host'], 1)); await flush(); observe(skill('A', ['host'], 2)) },
    work: ['accepted', 'accepted'],
    expected: { description: 'A', sources: THREE_SOURCES, projectPaths: ONE_TWO, sessionLocal: false },
  },
  {
    name: 'D3 description A, B inside one write window ends as B',
    run: ({ observe }) => { observe(skill('B', ['host'], 1)) },
    work: ['accepted'],
    expected: { description: 'B', sources: THREE_SOURCES, projectPaths: ONE_TWO, sessionLocal: false },
  },
  {
    name: 'D4 the same observation twice',
    run: ({ observe }) => { observe(skill('A', ['host'], 1)); observe(skill('A', ['host'], 2)) },
    work: ['unchanged', 'unchanged'],
    expected: { description: 'A', sources: THREE_SOURCES, projectPaths: ONE_TWO, sessionLocal: false },
  },
  {
    name: 'D5 a new source in flight, then the same source again',
    run: ({ observe }) => { observe(skill('A', ['mcp:extra'], 1)); observe(skill('A', ['mcp:extra'], 2)) },
    work: ['accepted', 'unchanged'],
    expected: { description: 'A', sources: [...THREE_SOURCES, 'mcp:extra'].sort(), projectPaths: ONE_TWO, sessionLocal: false },
  },
  {
    name: 'D6 a new project path in flight, then an older path again',
    run: ({ observe }) => {
      observe(skill('A', ['host', 'project:/p/three'], 1, { projectPaths: ['/p/three'] }))
      observe(skill('A', ['host', 'project:/p/one'], 2, { projectPaths: ['/p/one'] }))
    },
    work: ['accepted', 'accepted'],
    expected: { description: 'A', sources: [...THREE_SOURCES, 'project:/p/three'].sort(), projectPaths: ['/p/one', '/p/three', '/p/two'], sessionLocal: false },
  },
  {
    name: 'D7 sessionLocal in flight, then an observation without it',
    run: ({ observe }) => { observe(skill('A', ['host'], 1, { sessionLocal: true })); observe(skill('A', ['host'], 2)) },
    work: ['accepted', 'unchanged'],
    expected: { description: 'A', sources: THREE_SOURCES, projectPaths: ONE_TWO, sessionLocal: true },
  },
]

for (const { name, run, work: expectedWork, expected } of CASES) {
  test(name, async () => {
    const session = await openLedger()
    try {
      await seed(session.ledger)
      const work = []
      const observe = (record) => { const result = session.ledger.observe([record]); work.push(result.accepted ? 'accepted' : result.unchanged ? 'unchanged' : 'rejected') }
      await run({ observe, flush: () => session.ledger.flush() })
      await session.ledger.flush()
      assert.deepEqual(content(rowOf(session.ledger, 'skill', 'case-skill')), expected)
      assert.deepEqual(work, expectedWork, 'what each observation cost')
    } finally { await session.close() }
  })
}

test('D8 one tool described differently by one preset: the stored description does not flip between rescans', async () => {
  // `bash` has its own description in the `minimal` preset and DSH's in the others. A rescan observes the four presets
  // in one call, which is the shape of D1 (A, B, A inside one write window). Comparing only with the stored row
  // would judge the second A covered while B is in flight and leave B on disk, flipping the row on every rescan.
  const A = 'Execute a bash command and return its output. Each call runs in a fresh shell.'
  const B = 'Run commands in a bash shell. The command parameter does not need to be XML-escaped.'
  const order = [['preset:cordis', A], ['preset:standard', A], ['preset:minimal', B], ['preset:ptc', A]]
  const rescan = (at) => order.map(([source, description]) => ({ kind: 'tool', name: 'bash', description, sources: [source], latestSource: source, firstSeenAt: iso(at), lastSeenAt: iso(at) }))
  const session = await openLedger()
  try {
    const { ledger } = session
    for (const [source] of order) ledger.observe([{ kind: 'tool', name: 'bash', description: A, sources: [source], latestSource: source, firstSeenAt: iso(0), lastSeenAt: iso(0) }])
    await ledger.flush()
    for (let round = 1; round <= 8; round += 1) {
      const result = ledger.observe(rescan(5 * round))
      assert.ok(result.accepted <= 2, 'round ' + round + ': only the description flip is admitted, got ' + result.accepted)
      await ledger.flush()
      assert.equal(rowOf(ledger, 'tool', 'bash').description, A, 'round ' + round + ': the description after the flush')
      assert.deepEqual(rowOf(ledger, 'tool', 'bash').sources, ['preset:cordis', 'preset:minimal', 'preset:ptc', 'preset:standard'])
    }
  } finally { await session.close() }
})
