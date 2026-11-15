/** Per-root activation. V1 basename bans remain fail-closed until explicit path overrides. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from './defaults.js'
import { fileIdentity, validWorkspaceMemoryDirectory } from './directories.js'
import { ensureMemoryFile } from './dreaming/changes.js'
export const TOGGLES_VERSION = 2
/** Lexical precheck only; parseToggleKey is authoritative for directory/traversal validation. */
export const TOGGLE_KEY_RE = /^(global|workspace):[^\\\x00]+\.md$/u
export function togglesPaths({ home }) { const root = join(home, DEFAULT_DATA.storage.settingsDirectory);return { root, file: join(root, 'toggles.json') } }
export function fileKey(file) { return file.key || fileIdentity({ scope: file.scope, name: file.name || file.file, directory: file.directory }) }
export function parseToggleKey(key) {
  if (typeof key !== 'string' || !TOGGLE_KEY_RE.test(key)) return null
  const split = key.indexOf(':'), scope = key.slice(0, split), value = key.slice(split + 1), parts = value.split('/'), file = parts.pop()
  try { ensureMemoryFile(file) } catch { return null }
  if (scope === 'global' && parts.length) return null
  if (!parts.length) return { scope, file }
  const directory = parts.join('/')
  if (scope !== 'workspace' || !validWorkspaceMemoryDirectory(directory)) return null
  return { scope, file, directory }
}
export function emptyToggles() { return { version: TOGGLES_VERSION, sessions: {} } }
function normalize(parsed) {
  const sessions = Object.create(null)
  for (const [id, value] of Object.entries(parsed?.sessions || {})) {
    if (!id || !value || typeof value !== 'object') continue
    const disabled = [...new Set((Array.isArray(value.disabled) ? value.disabled : []).filter(key => parseToggleKey(key)))].sort()
    const enabledOverrides = [...new Set((Array.isArray(value.enabledOverrides) ? value.enabledOverrides : []).filter(key => parseToggleKey(key)?.directory && !disabled.includes(key)))].sort()
    const mode = value.mode === 'full' || value.mode === 'routed' ? value.mode : null, entry = {}
    if (disabled.length) entry.disabled = disabled
    if (enabledOverrides.length) entry.enabledOverrides = enabledOverrides
    if (mode) entry.mode = mode
    if (Object.keys(entry).length) sessions[id] = entry
  }
  return { version: TOGGLES_VERSION, sessions }
}
export function loadToggles({ file, strict = false }) {
  if (!existsSync(file)) return emptyToggles()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (strict) {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.sessions || typeof parsed.sessions !== 'object' || Array.isArray(parsed.sessions)) throw new Error('Invalid activation document.')
      for (const [id, entry] of Object.entries(parsed.sessions)) {
        if (!id || !entry || typeof entry !== 'object' || Array.isArray(entry) || (entry.disabled !== undefined && (!Array.isArray(entry.disabled) || entry.disabled.some(key => !parseToggleKey(key)))) || (entry.enabledOverrides !== undefined && (!Array.isArray(entry.enabledOverrides) || entry.enabledOverrides.some(key => !parseToggleKey(key)?.directory))) || (entry.mode !== undefined && !['full', 'routed'].includes(entry.mode))) throw new Error('Invalid activation entry.')
      }
    }
    return normalize(parsed)
  } catch (error) { if (strict) throw new Error('Activation state is unreadable; preserved file must be repaired before mutation/injection.');return emptyToggles() }
}
export function saveToggles({ file, toggles }) {
  mkdirSync(dirname(file), { recursive: true });const temporary = file + '.' + process.pid + '.' + randomUUID() + '.tmp'
  writeFileSync(temporary, JSON.stringify(normalize(toggles), null, 2) + '\n', 'utf8');renameSync(temporary, file)
}
export function disabledKeysFor(toggles, rootSessionId) {
  const entry = toggles?.sessions?.[rootSessionId], keys = new Set(entry?.disabled || [])
  keys.enabledOverrides = new Set(entry?.enabledOverrides || [])
  return keys
}
export function isFileEnabled(file, disabled) {
  if (file.shadowedBy || file.archived) return false
  if (!(disabled instanceof Set)) return true
  const key = fileKey(file), legacy = `${file.scope}:${file.name || file.file}`
  if (disabled.has(key)) return false
  if (disabled.enabledOverrides?.has(key)) return true
  return !disabled.has(legacy)
}
export function setToggle({ toggles, rootSessionId, key, enabled }) {
  const parsed = parseToggleKey(key)
  if (!parsed || typeof rootSessionId !== 'string' || !rootSessionId || typeof enabled !== 'boolean') throw new Error('Invalid memory activation change.')
  const next = normalize(toggles), existing = next.sessions[rootSessionId] || {}, disabled = new Set(existing.disabled || []), overrides = new Set(existing.enabledOverrides || [])
  if (!enabled) { disabled.add(key);overrides.delete(key) }
  else {
    disabled.delete(key)
    const legacy = `${parsed.scope}:${parsed.file}`
    if (parsed.directory && disabled.has(legacy)) overrides.add(key)
    else overrides.delete(key)
  }
  const entry = { ...existing }
  if (disabled.size) entry.disabled = [...disabled].sort();else delete entry.disabled
  if (overrides.size) entry.enabledOverrides = [...overrides].sort();else delete entry.enabledOverrides
  if (Object.keys(entry).length) next.sessions[rootSessionId] = entry;else delete next.sessions[rootSessionId]
  return next
}
export function modeForSession(toggles, rootSessionId) { const mode = toggles?.sessions?.[rootSessionId]?.mode;return mode === 'full' || mode === 'routed' ? mode : null }
export function setSessionMode({ toggles, rootSessionId, mode }) {
  if (mode !== null && mode !== 'full' && mode !== 'routed') throw new Error('Invalid memory mode.')
  const next = normalize(toggles), entry = { ...next.sessions[rootSessionId] }
  if (mode) entry.mode = mode;else delete entry.mode
  if (Object.keys(entry).length) next.sessions[rootSessionId] = entry;else delete next.sessions[rootSessionId]
  return next
}
export function filterActiveFiles(files, disabled) { return files.filter(file => isFileEnabled(file, disabled)) }
