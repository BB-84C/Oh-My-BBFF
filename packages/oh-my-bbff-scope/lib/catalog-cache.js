// Provider snapshots are stored verbatim: no observation collector and no consumer slice merging.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicJson } from './persistence.js'

export function validSnapshot(value) {
  return !!(value && value.contract === 1 && typeof value.revision === 'string' && typeof value.generatedAt === 'string'
    && typeof value.complete === 'boolean' && Array.isArray(value.entries) && Array.isArray(value.diagnostics))
}
export function createCatalogCache(dir, warn = () => {}) {
  const file = join(dir, 'catalog-cache.json')
  let snapshot = null, migration = false, unresolvedSources = false, queue = Promise.resolve(), error = null
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (data.snapshot !== null && !validSnapshot(data.snapshot)) throw new Error('invalid cached provider snapshot')
    snapshot = data.snapshot; migration = data.migration === true; unresolvedSources = data.unresolvedSources === true
  } catch (problem) { if (problem.code !== 'ENOENT') { error = problem.message; warn(error) } }
  function persist() {
    const document = { version: 1, snapshot, migration, unresolvedSources }
    queue = queue.catch(() => {}).then(() => atomicJson(file, document)).then(() => { error = null }, problem => { error = problem.message; warn(error) })
    return queue
  }
  return {
    read: () => snapshot,
    replace(value) {
      if (!validSnapshot(value)) throw new Error('invalid provider catalog snapshot')
      if (JSON.stringify(snapshot) === JSON.stringify(value)) return
      snapshot = JSON.parse(JSON.stringify(value)); persist()
    },
    migrated: () => migration,
    async markMigrated(unresolved) { migration = true; unresolvedSources = unresolved; await persist(); if (error) { migration = false; throw new Error(error) } },
    unresolvedSources: () => unresolvedSources,
    diagnostic: () => error,
    flush: () => queue,
  }
}

/** Canonical legacy mapping. Exclusive records are deliberately never imported. */
export function legacyObservations(dir) {
  let document
  try { document = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8')) } catch (error) { if (error.code === 'ENOENT') return { records: [], unresolved: false }; throw error }
  if (document.version !== 1 || !Array.isArray(document.entries)) throw new Error('invalid legacy observations')
  let unresolved = false
  const records = document.entries.map(row => {
    if (row.whereSeen?.includes('preset:observed') || row.source === 'preset:observed') unresolved = true
    const sources = (row.whereSeen || []).filter(source => source !== 'preset:observed')
    const latestSource = row.source && row.source !== 'preset:observed' ? row.source : undefined
    return { kind: row.kind, name: row.name, description: row.description, sources, ...(latestSource ? { latestSource } : {}), firstSeenAt: row.firstSeenAt, lastSeenAt: row.lastSeenAt,
      ...(sources.includes('session-local') ? { sessionLocal: true } : {}) }
  })
  return { records, unresolved }
}
