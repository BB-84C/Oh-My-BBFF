// The catalog hands the project paths that were requested through `snapshot({ cwd })` to every discovery. That set
// used to grow for the lifetime of the process, so each rescan got bigger the longer the host stayed up. Transient
// requests (the HTTP `catalog` action and the session view) now expire: a path is submitted while it was requested
// within the last four hours and only the 64 most recently requested ones are submitted. A request that is not
// transient (Scope registers the workspaces of its rules this way, once per provider) is pinned and never dropped.
//
// The real lib/catalog.js runs against a synthetic discovery that returns one skills slice per submitted path and
// records what it was handed. Hours of use run on a virtual clock: the code under test only reads `Date.now()`.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { createCatalogProvider } from '../lib/catalog.js'
import { widgetRoot } from './support/client-harness.mjs'

const scratchRoot = path.join(widgetRoot, '.test-artifacts')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const TTL = 4 * HOUR
const CAP = 64
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let sequence = 0

/** The real catalog provider over a recording discovery, with `Date.now()` on a virtual clock. */
async function openProvider(t) {
  const dir = path.join(scratchRoot, 'requested-bound-' + process.pid + '-' + (++sequence))
  await fs.mkdir(dir, { recursive: true })
  let virtual = Date.parse('2026-11-20T08:00:00.000Z')
  t.mock.method(Date, 'now', () => virtual)
  const submitted = []
  const readDiscovery = async ({ projectPaths = [] } = {}) => {
    submitted.push([...projectPaths])
    const slices = [{ id: 'host:tools', viewId: 'host', roles: ['host'], part: 'tools', complete: true, diagnostics: [], facts: [{ kind: 'tool', name: 'bounded_tool', description: 'Synthetic tool.', sources: ['host'] }] }]
    for (const cwd of [undefined, ...projectPaths]) {
      slices.push({
        id: 'host:skills' + (cwd ? ':' + cwd : ''), viewId: 'host', roles: ['host'], part: 'skills', ...(cwd ? { cwd } : {}), complete: true, diagnostics: [],
        facts: [{ kind: 'skill', name: 'bounded-skill', description: 'Synthetic skill.', sources: ['host', ...(cwd ? ['project:' + cwd] : [])], ...(cwd ? { projectPath: cwd } : {}) }],
      })
    }
    return { slices, authoritative: true, defaultViewId: 'host', projectPaths: [], privateViews: new Map(), packageVersions: {}, nativeResidueProven: false, diagnostics: [], adapterEvidence: undefined }
  }
  const provider = createCatalogProvider({ dir, getModules: () => [], readDiscovery, ledgerOptions: { writeDebounceMs: 60 * MINUTE, reconcileMs: 0 } })
  /** Wait until the catalog is idle: no discovery is running and none starts for a few ticks. */
  const quiet = async () => {
    for (let stable = 0; stable < 3;) {
      const before = submitted.length
      await sleep(10)
      stable = before === submitted.length && provider.status().state !== 'running' ? stable + 1 : 0
    }
  }
  const session = {
    provider, submitted,
    advance(ms) { virtual += ms },
    /** HTTP-style request: the `catalog` action marks it transient. */
    request(cwd) { return provider.catalog.snapshot({ cwd, transient: true }) },
    /** In-process request without the flag, as Scope makes it. */
    pin(cwd) { return provider.catalog.snapshot({ cwd }) },
    /** Run `trigger`, which must start a rescan; wait for that rescan and return the paths it was handed. */
    async rescanAfter(trigger) {
      const before = submitted.length
      trigger()
      for (let waited = 0; submitted.length === before && waited < 5000; waited += 5) await sleep(5)
      assert.ok(submitted.length > before, 'the trigger started a rescan')
      await quiet()
      return submitted.at(-1)
    },
    /** Any other trigger of a rescan (a system-prompt change, a config reload, ...). */
    rescan() { return session.rescanAfter(() => provider.invalidate('tools')) },
    cwd: (index) => path.join(dir, 'project-' + String(index).padStart(3, '0')),
    async close() { await provider.dispose(); await fs.rm(dir, { recursive: true, force: true }) },
  }
  await provider.refresh()
  await quiet()
  return session
}

test('a transient request stays for four hours after its last use, then drops out and comes back when requested again', async (t) => {
  const session = await openProvider(t)
  try {
    const a = session.cwd(1)
    assert.deepEqual(await session.rescanAfter(() => session.request(a)), [a], 'the request is handed to the rescan it schedules')
    assert.equal(session.request(a).newRoot.state, 'ready')

    session.advance(TTL)
    assert.deepEqual(await session.rescan(), [a], 'exactly four hours after the request it is still handed to discovery')
    session.advance(1000)
    assert.deepEqual(await session.rescan(), [], 'one second later it is not')

    const before = session.submitted.length
    let answer
    assert.deepEqual(await session.rescanAfter(() => { answer = session.request(a) }), [a], 'requesting it again adds it and schedules a rescan')
    assert.equal(answer.newRoot.state, 'pending', 'a dropped project is pending again until that rescan has run')
    assert.equal(session.submitted.length, before + 1)
    assert.equal(session.request(a).newRoot.state, 'ready')
  } finally { await session.close() }
})

test('using a project again keeps it', async (t) => {
  const session = await openProvider(t)
  try {
    const a = session.cwd(1), b = session.cwd(2)
    await session.rescanAfter(() => { session.request(a); session.request(b) })
    session.advance(3 * HOUR)
    session.request(a)                                     // only `a` is used again
    session.advance(2 * HOUR)                              // 5 h after `b`'s request, 2 h after `a`'s
    assert.deepEqual(await session.rescan(), [a], '`a` stays, `b` has expired')
    session.advance(2 * HOUR + 1000)                       // 4 h 0 min 1 s after the last use of `a`
    assert.deepEqual(await session.rescan(), [])
  } finally { await session.close() }
})

test('only the most recently requested paths are handed to discovery, at most 64', async (t) => {
  const session = await openProvider(t)
  try {
    const total = CAP + 16
    const handed = await session.rescanAfter(() => { for (let index = 1; index <= total; index += 1) { session.request(session.cwd(index)); session.advance(1000) } })
    assert.equal(handed.length, CAP, 'a rescan after ' + total + ' requests is handed ' + CAP + ' paths')
    assert.deepEqual(new Set(handed), new Set(Array.from({ length: CAP }, (_, index) => session.cwd(total - CAP + 1 + index))), 'the 64 most recent ones')

    // The oldest dropped path comes back when it is requested again, and pushes out the oldest of the rest.
    const again = await session.rescanAfter(() => session.request(session.cwd(1)))
    assert.equal(again.length, CAP)
    assert.ok(again.includes(session.cwd(1)), 'the requested path is handed over again')
    assert.ok(!again.includes(session.cwd(total - CAP + 1)), 'the least recently used one made room')
    assert.equal(session.request(session.cwd(1)).newRoot.state, 'ready')
  } finally { await session.close() }
})

test('a burst of requests is bounded for as long as the process runs', async (t) => {
  const session = await openProvider(t)
  try {
    // 300 different projects within ten minutes, afterwards a few of them are used for two hours while other triggers keep rescanning.
    const burst = await session.rescanAfter(() => { for (let index = 1; index <= 300; index += 1) { session.request(session.cwd(index)); session.advance(2000) } })
    assert.equal(burst.length, CAP)
    const recent = [296, 297, 298, 299, 300].map((index) => session.cwd(index))
    let handed
    for (let round = 0; round < 12; round += 1) {
      session.advance(10 * MINUTE)
      for (const cwd of recent) session.request(cwd)
      handed = await session.rescan()
      assert.ok(handed.length <= CAP, 'no rescan is handed more than ' + CAP + ' paths')
    }
    assert.deepEqual(new Set(handed), new Set(Array.from({ length: CAP }, (_, index) => session.cwd(300 - CAP + 1 + index))), 'the projects in use and the most recent of the others')
    for (const cwd of recent) assert.equal(session.request(cwd).newRoot.state, 'ready', 'a project in use was not dropped')
  } finally { await session.close() }
})

test('a request that is not transient is pinned: it never expires and does not count against the cap', async (t) => {
  const session = await openProvider(t)
  try {
    const pinned = [session.cwd(901), session.cwd(902), session.cwd(903)]
    const handed = await session.rescanAfter(() => {
      for (const cwd of pinned) session.pin(cwd)
      for (let index = 1; index <= CAP + 6; index += 1) { session.request(session.cwd(index)); session.advance(1000) }
    })
    assert.equal(handed.length, CAP + pinned.length, 'the cap applies to the transient paths only')
    for (const cwd of pinned) assert.ok(handed.includes(cwd), cwd + ' is handed over')

    session.advance(TTL + HOUR)
    assert.deepEqual(new Set(await session.rescan()), new Set(pinned), 'five hours later only the pinned paths are left')
    for (const cwd of pinned) assert.equal(session.request(cwd).newRoot.state, 'ready', 'a pinned project is never pending')
  } finally { await session.close() }
})

test('a pinned path stays pinned whichever request comes first', async (t) => {
  const session = await openProvider(t)
  try {
    const pinnedFirst = session.cwd(1), pinnedLast = session.cwd(2), plain = session.cwd(3)
    await session.rescanAfter(() => {
      session.pin(pinnedFirst); session.request(pinnedFirst)   // registered by Scope, later also opened in the UI
      session.request(pinnedLast); session.pin(pinnedLast)     // opened in the UI, later registered by Scope
      session.request(plain)
    })
    session.advance(TTL + HOUR)
    session.request(pinnedFirst)                               // using it again must not make it expire later either
    session.advance(TTL + HOUR)
    assert.deepEqual(new Set(await session.rescan()), new Set([pinnedFirst, pinnedLast]), 'only the path that was never pinned has expired')
  } finally { await session.close() }
})

test('the session view requests its project as a transient path', async (t) => {
  const session = await openProvider(t)
  try {
    const cwd = session.cwd(1)
    assert.deepEqual(await session.rescanAfter(() => session.provider.sessionView({ cwd })), [cwd])
    session.advance(TTL + 1000)
    assert.deepEqual(await session.rescan(), [], 'a session view does not keep a project for ever')
  } finally { await session.close() }
})

test('index.js marks the requests of the HTTP catalog action as transient', async () => {
  const source = await fs.readFile(path.join(widgetRoot, 'index.js'), 'utf8')
  const action = /if \(action === 'catalog'\) \{\s*sendJson\(res,\{ok:true,catalog:catalogProvider\.catalog\.snapshot\(([^\n]*)\)\}\)/.exec(source)
  assert.ok(action, 'the `catalog` action was found in index.js')
  assert.match(action[1], /\{cwd:body\.cwd,transient:true\}/, 'the request of the action carries `transient: true`')
})
