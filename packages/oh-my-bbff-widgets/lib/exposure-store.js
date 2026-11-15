/**
 * Per-root-session exposure store: which skills / tools / MCP servers the user
 * disabled for one session tree.
 *
 * Only *disabled* entries are persisted, so a missing file, a missing session or a
 * missing name all mean "enabled". The document lives at
 * `$DSH_HOME/oh-my-bbff-widgets/exposure.json`:
 *
 *   { version: 1, sessions: { <rootSessionId>: { skills: [names], tools: [names], mcp: [servers] } } }
 *
 * Subagents inherit their root session's switches because the store is keyed by the
 * root session id, never by the child id.
 *
 * @module oh-my-bbff-widgets/exposure-store
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import ROOT_PACKAGE from '../package.json' with {type:'json'}
export const EXPOSURE_VERSION = 1
export const EXPOSURE_KINDS = ['skill', 'tool', 'mcp']
export const MAX_NAME_LENGTH = 256

/** Resolve the exposure store path for a DSH home. */
export function exposurePaths({ home }) {
  const root = join(home, ROOT_PACKAGE.name)
  return { root, file: join(root, 'exposure.json') }
}

/** Empty exposure document. */
export function emptyExposure() {
  return { version: EXPOSURE_VERSION, sessions: {} }
}

function normalizeNames(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const name = item.trim()
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) continue
    seen.add(name)
  }
  return [...seen].sort()
}

function normalizeExposure(parsed) {
  const base = emptyExposure()
  if (parsed === null || typeof parsed !== 'object') return base
  const rawSessions = parsed.sessions !== null && typeof parsed.sessions === 'object' ? parsed.sessions : {}
  for (const [sessionId, entry] of Object.entries(rawSessions)) {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > MAX_NAME_LENGTH) continue
    if (entry === null || typeof entry !== 'object') continue
    const next = {}
    for (const key of ['skills', 'tools', 'mcp']) {
      const names = normalizeNames(entry[key])
      if (names.length > 0) next[key] = names
    }
    if (Object.keys(next).length > 0) base.sessions[sessionId] = next
  }
  return base
}

/** Read the exposure store, tolerating a missing or corrupt file (both mean "nothing disabled"). */
export function loadExposure({ file }) {
  if (!existsSync(file)) return emptyExposure()
  try {
    return normalizeExposure(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return emptyExposure()
  }
}

/** Atomically persist the exposure document (temp file + rename). */
export function saveExposure({ file, store }) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(normalizeExposure(store), null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

/** The disabled name sets for one root session. */
export function disabledFor(store, rootSessionId) {
  const entry = store && store.sessions && typeof store.sessions === 'object' ? store.sessions[rootSessionId] : undefined
  return {
    skills: new Set(Array.isArray(entry && entry.skills) ? entry.skills : []),
    tools: new Set(Array.isArray(entry && entry.tools) ? entry.tools : []),
    mcp: new Set(Array.isArray(entry && entry.mcp) ? entry.mcp : []),
  }
}

/** Map a public toggle kind to the store bucket key. */
export function storeKeyOf(kind) {
  if (kind === 'skill') return 'skills'
  if (kind === 'tool') return 'tools'
  if (kind === 'mcp') return 'mcp'
  return null
}

/**
 * Return a new store document with one name enabled/disabled for a root session.
 * Enabling an already-enabled name (or the reverse) is a no-op.
 */
export function setDisabled({ store, rootSessionId, kind, name, disabled }) {
  const key = storeKeyOf(kind)
  if (key === null) throw new Error(`invalid exposure kind: ${String(kind)}`)
  if (typeof rootSessionId !== 'string' || rootSessionId.length === 0) throw new Error('rootSessionId is required')
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME_LENGTH) throw new Error('invalid exposure name')
  const next = normalizeExposure(store)
  const entry = { ...(next.sessions[rootSessionId] || {}) }
  const names = new Set(Array.isArray(entry[key]) ? entry[key] : [])
  if (disabled === true) names.add(name)
  else names.delete(name)
  if (names.size > 0) entry[key] = [...names].sort()
  else delete entry[key]
  if (Object.keys(entry).length > 0) next.sessions[rootSessionId] = entry
  else delete next.sessions[rootSessionId]
  return next
}
