/** Candidate proposals are untrusted review input, not accepted memories. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from '../defaults.js'
import { truncateUtf8 } from '../store.js'
import { assertMemoryOwnedPath } from './changes.js'
const rootFor = paths => paths.candidateRoot || join(paths.memoryRoot, DEFAULT_DATA.storage.candidatesDirectory)
const idFor = (root, path) => createHash('sha256').update(relative(root, path).replace(/\\/g, '/')).digest('hex')
function candidates(paths) {
  const root = rootFor(paths), files = []
  let sessions
  try { sessions = readdirSync(root, { withFileTypes: true }) } catch { return files }
  for (const session of sessions) {
    if (!session.isDirectory()) continue
    const directory = assertMemoryOwnedPath(root, join(root, session.name))
    let entries
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { continue }
    for (const file of entries) {
      if (!file.isFile() || !file.name.endsWith('.md')) continue
      const path = assertMemoryOwnedPath(root, join(directory, file.name)), info = statSync(path)
      files.push({ id: idFor(root, path), path, file: file.name, bytes: info.size, updatedAt: Math.round(info.mtimeMs) })
    }
  }
  return files.sort((left, right) => right.updatedAt - left.updatedAt || (left.id < right.id ? -1 : 1))
}
function decisions(paths) {
  const file = join(rootFor(paths), 'decisions.json')
  try { const value = JSON.parse(readFileSync(file, 'utf8'));return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} }
}
export function candidateInventory({ paths, cursor = 0, limit = DEFAULT_DATA.fields.candidatePageSize.default, includeReviewed = false }) {
  const ledger = decisions(paths), all = candidates(paths), pending = all.filter(file => !ledger[file.id]), selected = includeReviewed ? all : pending, start = Math.max(0, Number.isSafeInteger(cursor) ? cursor : 0), count = Math.max(1, Number.isSafeInteger(limit) ? limit : DEFAULT_DATA.fields.candidatePageSize.default), end = Math.min(selected.length, start + count)
  return { total: all.length, pending: pending.length, reviewed: all.length - pending.length, cursor: start, nextCursor: end < selected.length ? end : null, items: selected.slice(start, end).map(file => ({ ...file, status: ledger[file.id]?.status || 'proposed', decision: ledger[file.id] || null })), root: rootFor(paths) }
}
export function readCandidate({ paths, id, maxBytes = DEFAULT_DATA.fields.toolReadMaxBytes.default }) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Choose an opaque candidate id from the candidate inventory.')
  const file = candidates(paths).find(row => row.id === id)
  if (!file) throw new Error('Candidate no longer exists.')
  const limit = Math.max(1, Math.min(maxBytes, DEFAULT_DATA.fields.toolReadMaxBytes.max)), bytes = Buffer.alloc(Math.min(file.bytes, limit + 4)), descriptor = openSync(file.path, 'r')
  let loaded
  try { loaded = readSync(descriptor, bytes, 0, bytes.length, 0) } finally { closeSync(descriptor) }
  const content = truncateUtf8(bytes.subarray(0, loaded).toString('utf8'), limit), metadata = {}
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (match) for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(scope|session|sessionId|workspaceDir|createdAt|status):\s*(.*)$/)
    if (!field) continue
    try { metadata[field[1]] = field[2].startsWith('"') ? JSON.parse(field[2]) : field[2] } catch { metadata[field[1]] = field[2] }
  }
  return { ...file, exists: true, content, includedBytes: Buffer.byteLength(content, 'utf8'), truncated: file.bytes > Buffer.byteLength(content, 'utf8'), metadata, trusted: false, decision: decisions(paths)[id] || null }
}
export function recordCandidateDecision({ paths, ids = [], status, runId, reason, now }) {
  if (!['reviewed', 'accepted', 'rejected'].includes(status)) throw new Error('Unknown candidate decision status.')
  const known = new Set(candidates(paths).map(file => file.id)), ledger = decisions(paths)
  for (const id of ids) if (!known.has(id)) throw new Error('Candidate id is not present in this store.')
  for (const id of ids) ledger[id] = { status, runId: runId || null, reason: String(reason || ''), at: now }
  const root = rootFor(paths), file = join(root, 'decisions.json'), temporary = file + '.' + randomUUID() + '.tmp'
  mkdirSync(root, { recursive: true });writeFileSync(temporary, JSON.stringify(ledger, null, 2) + '\n', 'utf8');renameSync(temporary, file)
  return { updated: ids.length, pending: candidateInventory({ paths }).pending }
}
