// Regression for community issue #1: `observe()` rebuilt and re-serialized the whole
// ledger for every accepted observation (O(observations x entries), 6k observations
// blocked the host thread for ~10s here and ~17s on the reporter's machine).
//
// It now decides admission from exact per-row byte deltas. This test pins that change
// to the previous algorithm: the OLD implementation is replayed verbatim as a
// reference, every batch is compared in lockstep (admission counts, merged view,
// tombstone fencing, first/last seen, source/path union), and the persisted document
// must be byte-identical to what the old algorithm would have written.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import {
  CATALOG_BYTES_MAX, CATALOG_PROJECT_PATHS_PER_SKILL_MAX, CATALOG_ROWS_MAX,
  CATALOG_SOURCES_PER_ROW_MAX, EXPOSURE_TEXT_MAX_LENGTH,
} from '../lib/bbff-contract.js'
import { createCatalogLedger } from '../lib/catalog-ledger.js'
import { widgetRoot } from './support/client-harness.mjs'

// ---------------------------------------------------------------------------
// Reference implementation: the pre-fix algorithm, copied verbatim (key/unique/
// source/timestamp/normalize/merge/serialize/full + the old observe loop). It is
// deliberately independent of the new incremental accounting.
// ---------------------------------------------------------------------------
const kinds = new Set(['tool', 'mcp', 'skill'])
const fields = new Set(['kind', 'name', 'description', 'sources', 'latestSource', 'firstSeenAt', 'lastSeenAt', 'sessionLocal', 'projectPaths', 'sourcesTruncated'])
const key = (row) => row.kind + '\0' + row.name
const clone = (value) => JSON.parse(JSON.stringify(value))
const unique = (values) => [...new Set(values)].sort()
const source = (value) => {
  if (typeof value !== 'string' || !value) return false
  if (['host', 'session-local', 'configured', 'resource-prompt'].includes(value)) return true
  const index = value.indexOf(':')
  return index > 0 && ['preset', 'bbff', 'mcp', 'project'].includes(value.slice(0, index)) && index < value.length - 1
}
const timestamp = (value) => { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid observation timestamp'); return new Date(value).toISOString() }
const normalize = (raw, { maxSources, maxPaths }) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((name) => !fields.has(name))) throw new Error('Observation contains unsupported fields')
  if (!kinds.has(raw.kind) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name !== raw.name.trim() || raw.name.length > 256 || typeof raw.description !== 'string') throw new Error('Invalid observation identity/description')
  if (!Array.isArray(raw.sources) || Array.from(raw.sources).some((item) => !source(item))) throw new Error('Invalid observation sources')
  if (raw.latestSource !== undefined && !source(raw.latestSource)) throw new Error('Invalid latest observation source')
  if (raw.sessionLocal !== undefined && typeof raw.sessionLocal !== 'boolean') throw new Error('Invalid own-layer fact')
  if (raw.projectPaths !== undefined && (raw.kind !== 'skill' || !Array.isArray(raw.projectPaths) || Array.from(raw.projectPaths).some((item) => typeof item !== 'string' || !item.trim()))) throw new Error('Invalid project path metadata')
  const firstSeenAt = timestamp(raw.firstSeenAt), lastSeenAt = timestamp(raw.lastSeenAt)
  if (firstSeenAt > lastSeenAt) throw new Error('Observation timestamps are reversed')
  const sources = unique(raw.sources), projectPaths = unique(raw.projectPaths || [])
  return { kind: raw.kind, name: raw.name, description: raw.description.slice(0, EXPOSURE_TEXT_MAX_LENGTH), sources: sources.slice(0, maxSources), ...(raw.latestSource ? { latestSource: raw.latestSource } : {}), firstSeenAt, lastSeenAt, ...(raw.sessionLocal !== undefined ? { sessionLocal: raw.sessionLocal } : {}), ...(raw.kind === 'skill' ? { projectPaths: projectPaths.slice(0, maxPaths) } : {}), sourcesTruncated: raw.sourcesTruncated === true || sources.length > maxSources || projectPaths.length > maxPaths }
}
const empty = () => ({ version: 1, entries: [], tombstones: [], persistentDiagnostics: [] })
const sortedRows = (rows) => [...rows].sort((a, b) => key(a).localeCompare(key(b)))
function merge(document, records, tombstoneWrites, limits, { live = false } = {}) {
  const entries = new Map(document.entries.map((row) => [key(row), clone(row)])), tombstones = new Map(document.tombstones.map((row) => [key(row), clone(row)]))
  for (const row of tombstoneWrites) { const id = key(row), old = tombstones.get(id); if (!old || row.forgottenAt > old.forgottenAt) tombstones.set(id, { ...row }); entries.delete(id) }
  let changed = 0, fenced = 0
  for (const row of records) {
    const id = key(row), tombstone = tombstones.get(id)
    if (tombstone && row.lastSeenAt <= tombstone.forgottenAt) { fenced++; continue }
    if (tombstone) tombstones.delete(id)
    const old = entries.get(id)
    if (!old) { entries.set(id, clone(row)); changed++; continue }
    const sources = unique([...old.sources, ...row.sources]), paths = unique([...(old.projectPaths || []), ...(row.projectPaths || [])])
    const newest = row.lastSeenAt > old.lastSeenAt || (live && row.lastSeenAt === old.lastSeenAt)
    const next = { ...old, firstSeenAt: old.firstSeenAt < row.firstSeenAt ? old.firstSeenAt : row.firstSeenAt, lastSeenAt: old.lastSeenAt > row.lastSeenAt ? old.lastSeenAt : row.lastSeenAt, sources: sources.slice(0, limits.maxSources), sourcesTruncated: old.sourcesTruncated || row.sourcesTruncated || sources.length > limits.maxSources || paths.length > limits.maxPaths, ...(old.kind === 'skill' ? { projectPaths: paths.slice(0, limits.maxPaths) } : {}), ...(old.sessionLocal || row.sessionLocal ? { sessionLocal: true } : {}) }
    if (newest) { if (row.description) next.description = row.description; if (row.latestSource) next.latestSource = row.latestSource }
    if (JSON.stringify(next) !== JSON.stringify(old)) changed++
    entries.set(id, next)
  }
  return { document: { version: 1, entries: sortedRows(entries.values()), tombstones: sortedRows(tombstones.values()), persistentDiagnostics: document.persistentDiagnostics.slice() }, changed, fenced }
}
const serialize = (document) => JSON.stringify(document, null, 2) + '\n'
const fingerprint = (row) => JSON.stringify([row.kind, row.name, row.description, row.sources, row.latestSource || '', row.sessionLocal === true, row.projectPaths || [], row.sourcesTruncated === true])

function createReference({ limits, maxRows, maxBytes }) {
  let document = empty()
  const pending = new Map(), fingerprints = new Map()
  const index = () => { fingerprints.clear(); for (const row of document.entries) fingerprints.set(key(row), fingerprint(row)) }
  index()
  const full = (value) => value.entries.length + value.tombstones.length > maxRows || Buffer.byteLength(serialize(value), 'utf8') > maxBytes
  return {
    observe(records) {
      let accepted = 0, rejected = 0, unchanged = 0
      for (const raw of Array.isArray(records) ? records : []) {
        let row
        try { row = normalize(raw, limits) } catch { rejected++; continue }
        const id = key(row), nextFingerprint = fingerprint(row), prior = pending.get(id)
        if (prior ? fingerprint(prior) === nextFingerprint : fingerprints.get(id) === nextFingerprint) { unchanged++; continue }
        if (prior) row = merge(empty(), [prior, row], [], limits, { live: true }).document.entries[0]
        const proposal = new Map(pending)
        proposal.set(id, row)
        const next = merge(document, [...proposal.values()], [], limits, { live: true }).document
        if (full(next)) { rejected++; continue }
        pending.set(id, row); fingerprints.set(id, fingerprint(row)); accepted++
      }
      return { accepted, rejected, unchanged }
    },
    view() { return merge(document, [...pending.values()], [], limits, { live: true }).document },
    reset(next) { document = next; pending.clear(); index() },
  }
}

// ---------------------------------------------------------------------------
// Lockstep driver
// ---------------------------------------------------------------------------
const limits = { maxSources: CATALOG_SOURCES_PER_ROW_MAX, maxPaths: CATALOG_PROJECT_PATHS_PER_SKILL_MAX }
const scratchRoot = path.join(widgetRoot, '.test-artifacts')
let sequence = 0

async function openLedger(options = {}) {
  const dir = path.join(scratchRoot, 'ledger-admission-' + process.pid + '-' + (++sequence))
  await fs.mkdir(dir, { recursive: true })
  let clock = new Date('2026-11-20T00:00:00.000Z')
  const ledger = createCatalogLedger({ dir, now: () => clock.toISOString(), writeDebounceMs: 60_000, reconcileMs: 0, ...options })
  await ledger.initialize()
  const reference = createReference({ limits, maxRows: options.maxRows ?? CATALOG_ROWS_MAX, maxBytes: options.maxBytes ?? CATALOG_BYTES_MAX })
  return {
    dir, ledger, reference,
    now() { return clock.toISOString() },
    advance(ms = 1000) { clock = new Date(clock.getTime() + ms); return clock.toISOString() },
    // A flush commits exactly `merge(document, pending)` and drains the pending set.
    async flush() { await ledger.flush(); reference.reset(reference.view()) },
    // forget() leaves the ledger untouched when the row is absent (changed:false), so the
    // reference only advances when the tombstone commit actually happened.
    async forget(kind, name) {
      const forgottenAt = clock.toISOString()
      const result = await ledger.forget(kind, name)
      if (result.changed) reference.reset(merge(reference.view(), [], [{ kind, name, forgottenAt }], limits).document)
      return result
    },
    async close() { await ledger.dispose(); await fs.rm(dir, { recursive: true, force: true }) },
  }
}

/** Compare one observe() batch: admission counts, effective view and counters must match. */
function assertSame(stage, session, records) {
  const actual = session.ledger.observe(records)
  const expected = session.reference.observe(records)
  assert.deepEqual(actual, expected, stage + ': admission counts')
  const view = session.ledger.snapshot()
  const reference = session.reference.view()
  assert.deepEqual(view.entries, reference.entries, stage + ': merged entries')
  assert.deepEqual(view.tombstones, reference.tombstones, stage + ': merged tombstones')
  return actual
}

const observed = { observations: 0, accepted: 0, unchanged: 0 }
const row = (session, name, extra = {}) => {
  const at = session.advance(0)
  return { kind: 'tool', name, description: name, sources: ['host'], firstSeenAt: at, lastSeenAt: at, ...extra }
}

test('incremental admission matches the old algorithm: union, Unicode, repeats, fencing', async () => {
  const session = await openLedger()
  try {
    const at0 = session.advance(60_000)
    // Growing sources per name, multi-byte descriptions, repeated records.
    assertSame('union batch 1', session, [
      { kind: 'tool', name: 'alpha', description: 'α — 一', sources: ['host'], firstSeenAt: at0, lastSeenAt: at0 },
      { kind: 'tool', name: 'beta', description: 'β — 二', sources: ['preset:one'], firstSeenAt: at0, lastSeenAt: at0 },
    ])
    assertSame('union batch 2', session, [
      { kind: 'tool', name: 'alpha', description: 'α — 一', sources: ['preset:one'], firstSeenAt: at0, lastSeenAt: session.advance(1000) },
      { kind: 'tool', name: 'alpha', description: 'α — 一', sources: ['host', 'preset:two'], firstSeenAt: at0, lastSeenAt: session.advance(1000) },
      { kind: 'tool', name: 'alpha', description: 'α — 一', sources: ['host', 'preset:two'], firstSeenAt: at0, lastSeenAt: session.advance(1000) },
      { kind: 'skill', name: 'gamma', description: 'γ — 三', sources: ['project:' + session.dir], projectPaths: [session.dir, path.join(session.dir, 'a'), path.join(session.dir, 'b')], firstSeenAt: at0, lastSeenAt: at0 },
    ])
    // Same-timestamp repeat (live merge) then an older-but-different re-observation.
    assertSame('live tie', session, [{ kind: 'tool', name: 'beta', description: 'β — 二 (newer)', sources: ['preset:one'], firstSeenAt: at0, lastSeenAt: at0 }])
    await session.flush()
    // Withdraw a row, then replay observations against the tombstone.
    const atForgotten = session.advance(60_000)
    await session.forget('tool', 'alpha')
    assertSame('fenced stale', session, [{ kind: 'tool', name: 'alpha', description: 'α — 一', sources: ['host'], firstSeenAt: at0, lastSeenAt: at0 }])
    assertSame('equal timestamp cannot resurrect', session, [{ kind: 'tool', name: 'alpha', description: 'α — 一', sources: ['host'], firstSeenAt: at0, lastSeenAt: atForgotten }])
    assertSame('newer clears tombstone', session, [{ kind: 'tool', name: 'alpha', description: 'α — 一', sources: ['host', 'preset:three'], firstSeenAt: at0, lastSeenAt: session.advance(60_000) }])
    await session.flush()
    // Byte identity with the old algorithm's document.
    const persisted = await fs.readFile(session.ledger.file, 'utf8')
    assert.equal(persisted, serialize(session.reference.view()), 'the persisted document is byte-identical to the old algorithm')
  } finally { await session.close() }
})

test('incremental admission matches the old algorithm around the exact byte cap', async () => {
  // Build a target document, then sweep maxBytes across its exact serialized size so an
  // off-by-one in the delta accounting cannot pass unnoticed.
  const probe = await openLedger()
  let target
  try {
    for (const name of ['one', 'two', 'three']) assertSame('probe', probe, [row(probe, name, { sources: ['host', 'preset:x'] })])
    await probe.flush()
    target = (await fs.readFile(probe.ledger.file, 'utf8')).length
  } finally { await probe.close() }

  for (const delta of [-6, -2, -1, 0, 1, 2, 6]) {
    const session = await openLedger({ maxBytes: target + delta })
    try {
      const names = ['one', 'two', 'three', 'four', 'five']
      for (const name of names) assertSame('byte cap ' + delta + ' ' + name, session, [row(session, name, { sources: ['host', 'preset:x'] })])
      await session.flush()
      assert.equal(await fs.readFile(session.ledger.file, 'utf8'), serialize(session.reference.view()), 'byte cap ' + delta + ': document matches')
    } finally { await session.close() }
  }
})

test('incremental admission matches the old algorithm around the row cap with tombstones', async () => {
  const session = await openLedger({ maxRows: 3 })
  try {
    assertSame('row cap fill', session, [row(session, 'one'), row(session, 'two')])
    await session.flush()
    session.advance(60_000)
    await session.forget('tool', 'one')
    // Two entries + one tombstone = 3 rows: a third name is refused, no eviction.
    assertSame('row cap refused', session, [row(session, 'three')])
    // A newer observation for the forgotten name clears the tombstone and fits.
    assertSame('row cap cleared', session, [row(session, 'one', { lastSeenAt: session.advance(60_000) })])
    assertSame('row cap again', session, [row(session, 'four')])
    await session.flush()
    assert.equal(await fs.readFile(session.ledger.file, 'utf8'), serialize(session.reference.view()), 'row cap: document matches')
  } finally { await session.close() }
})

test('randomized differential: incremental admission matches the old algorithm batch by batch', async () => {
  // Deterministic PRNG so a failure is reproducible.
  let seed = 0x5eed1234
  const random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (list) => list[Math.floor(random() * list.length)]
  const names = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11']
  const sources = ['host', 'session-local', 'configured', 'preset:a', 'preset:b', 'mcp:x', 'project:y', 'bbff:z']
  const suffixes = ['', ' — 说明', ' ünïcode', ' — 二']
  const session = await openLedger({ maxRows: 20, maxBytes: 24_000 })
  try {
    for (let step = 0; step < 60; step += 1) {
      const roll = random()
      if (roll < 0.1) { await session.flush(); continue }
      if (roll < 0.16) { const name = pick(names); const at = session.advance(60_000); await session.forget('tool', name); continue }
      const batch = []
      const size = 1 + Math.floor(random() * 5)
      for (let index = 0; index < size; index += 1) {
        const name = pick(names)
        const first = session.advance(0)
        batch.push({ kind: 'tool', name, description: name + pick(suffixes), sources: unique([pick(sources), pick(sources)]), firstSeenAt: first, lastSeenAt: session.advance(Math.floor(random() * 3000)) })
      }
      assertSame('random step ' + step, session, batch)
    }
    await session.flush()
    assert.equal(await fs.readFile(session.ledger.file, 'utf8'), serialize(session.reference.view()), 'randomized: document matches')
  } finally { await session.close() }
})
