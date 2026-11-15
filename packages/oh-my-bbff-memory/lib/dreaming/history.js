/** Read-only history preview + explicitly applied, stale-checked restore transactions. */
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from '../defaults.js'
import { simpleDiff } from '../diff.js'
import { assertMemoryOwnedPath, resolveMemoryWriteTarget, stageChange, commitStage, sha1 } from './changes.js'
import { msg } from '../host-ref.js'

function readRows(path, maxBytes, source) {
  if (!existsSync(path)) return { rows: [], diagnostics: [], omittedBytes: 0 }
  const size = statSync(path).size, start = Math.max(0, size - maxBytes), buffer = Buffer.alloc(Math.min(size, maxBytes)), descriptor = openSync(path, 'r')
  let count
  try { count = readSync(descriptor, buffer, 0, buffer.length, start) } finally { closeSync(descriptor) }
  let retained = buffer.subarray(0, count), omittedBytes = start
  if (start) { const newline = retained.indexOf(10), dropped = newline < 0 ? retained.length : newline + 1;omittedBytes += dropped;retained = retained.subarray(dropped) }
  const text = retained.toString('utf8')
  const rows = [], diagnostics = []
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    try {
      const value = JSON.parse(line)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not a record')
      rows.push({ ...value, id: createHash('sha256').update(source + '\n' + line).digest('hex'), nativeId: value.id || null, historySource: source })
    } catch { diagnostics.push({ reason: msg('diag.history.malformedRow') }) }
  }
  if (omittedBytes) diagnostics.push({ reason: msg('diag.history.clipped'), omittedBytes })
  return { rows, diagnostics, omittedBytes }
}
function allHistory({ paths, settings }) {
  const max = settings?.toolReadMaxBytes ?? DEFAULT_DATA.fields.toolReadMaxBytes.default
  const sources = [readRows(paths.changelogPath, max, 'dreaming'), readRows(join(paths.historyRoot, 'changes.jsonl'), max, 'ordinary-memory')]
  const rows = sources.flatMap(source => source.rows), diagnostics = sources.flatMap(source => source.diagnostics), begins = new Set(rows.filter(row => row.kind === 'transaction-begin').map(row => row.transactionId)), ends = new Set(rows.filter(row => row.kind === 'transaction-commit').map(row => row.transactionId))
  const retained = rows.filter(row => !['transaction-begin', 'transaction-commit'].includes(row.kind) && (!row.transactionId || (begins.has(row.transactionId) && ends.has(row.transactionId))))
  if (retained.length < rows.filter(row => !['transaction-begin', 'transaction-commit'].includes(row.kind)).length) diagnostics.push({ reason: msg('diag.history.incompleteTransactions') })
  retained.sort((left, right) => (typeof right.at === 'number' ? right.at : Date.parse(right.at) || 0) - (typeof left.at === 'number' ? left.at : Date.parse(left.at) || 0))
  return { rows: retained, diagnostics, omittedBytes: sources.reduce((sum, source) => sum + source.omittedBytes, 0) }
}
function restoreTarget({ paths, row, settings, workspaceDirs }) {
  if (!['global', 'workspace'].includes(row.scope)) throw new Error('This history row has no restorable memory scope.')
  if (row.scope === 'workspace' && !row.workspaceDir) throw new Error('Legacy workspace history lacks verified workspace identity.')
  const targetPath = row.targetPath || row.path
  if (!targetPath) throw new Error('This history row has no file target.')
  const target = resolveMemoryWriteTarget({ paths, scope: row.scope, file: row.file || basename(targetPath), workspaceDir: row.workspaceDir, directory: row.directory, workspaceDirs })
  if (target.targetPath !== targetPath) throw new Error('History target is not a currently configured memory file; instruction-file history is read-only here.')
  let content = null, snapshotPath = row.backup || row.archivedTo || row.archived || row.archivedPath || null
  const originalCreate = row.kind === 'create' || (row.kind === 'memory-write' && !snapshotPath && row.bytesBefore === 0)
  const canonicalCreated = row.scope === 'workspace' && (row.canonicalCreated === true || (row.sourcePath && row.sourcePath !== targetPath))
  const restoreCanonicalAbsence = row.scope === 'workspace' && (originalCreate || canonicalCreated)
  if (!originalCreate && !canonicalCreated) {
    if (!snapshotPath) throw new Error('The previous version has no retained snapshot.')
    const inHistory = (() => { try { assertMemoryOwnedPath(paths.historyRoot, snapshotPath);return true } catch { return false } })()
    assertMemoryOwnedPath(inHistory ? paths.historyRoot : paths.archiveRoot, snapshotPath)
    const bytes = readFileSync(snapshotPath), text = bytes.toString('utf8')
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('Snapshot is not valid UTF-8 text; automatic restoration is unsupported.')
    if (bytes.length > (settings?.toolWriteMaxBytes ?? DEFAULT_DATA.fields.toolWriteMaxBytes.default)) throw new Error('Snapshot exceeds the current write limit.')
    if (row.sha1Before && sha1(bytes) !== row.sha1Before) throw new Error('Snapshot identity no longer matches its history record.')
    content = text
  }
  return { ...target, content, snapshotPath, restoreCanonicalAbsence }
}
export function historyPage({ paths, settings, workspaceDirs, cursor = 0, limit = settings?.changelogPageSize ?? DEFAULT_DATA.fields.changelogPageSize.default }) {
  const all = allHistory({ paths, settings }), start = Math.max(0, Number.isSafeInteger(cursor) ? cursor : 0), end = Math.min(all.rows.length, start + Math.max(1, limit))
  const items = all.rows.slice(start, end).map(row => {
    try { restoreTarget({ paths, row, settings, workspaceDirs });return { ...row, revertible: true } }
    catch (error) { return { ...row, revertible: false, revertReason: String(error?.message || error) } }
  })
  return { items, total: all.rows.length, totalIsLowerBound: all.omittedBytes > 0, cursor: start, nextCursor: end < all.rows.length ? end : null, diagnostics: all.diagnostics, omittedBytes: all.omittedBytes }
}
export function previewRevert({ paths, id, settings, workspaceDirs }) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Choose a history id returned by the current history view.')
  const all = allHistory({ paths, settings }), matches = all.rows.filter(row => row.id === id)
  if (matches.length !== 1) throw new Error('History entry is absent or ambiguous in the current read window.')
  const row = matches[0], target = restoreTarget({ paths, row, settings, workspaceDirs }), beforeBytes = existsSync(target.targetPath) ? readFileSync(target.targetPath) : null, before = beforeBytes?.toString('utf8') || ''
  const currentSha = beforeBytes === null ? null : sha1(beforeBytes), restoreSha = target.content === null ? null : sha1(target.content)
  return { id, entry: row, targetPath: target.targetPath, scope: target.scope, file: target.file, directory: target.directory, workspaceDir: target.workspaceDir, operation: target.restoreCanonicalAbsence ? 'remove-canonical-override' : target.content === null ? 'remove' : 'restore', restoreCanonicalAbsence: target.restoreCanonicalAbsence, expectedCurrentSha: currentSha, expectedRestoreSha: restoreSha, bytesBefore: beforeBytes?.length || 0, bytesAfter: target.content === null ? 0 : Buffer.byteLength(target.content, 'utf8'), diff: simpleDiff(before, target.content || ''), changed: currentSha !== restoreSha, content: target.content, outOfOrder: row.sha1After !== undefined && row.sha1After !== currentSha, diagnostics: all.diagnostics }
}
export function applyRevert({ paths, id, expectedCurrentSha, expectedRestoreSha, settings, workspaceDirs, now, verifyLease }) {
  const preview = previewRevert({ paths, id, settings, workspaceDirs })
  if (preview.expectedCurrentSha !== expectedCurrentSha || preview.expectedRestoreSha !== expectedRestoreSha) throw new Error('Revert preview is stale; inspect a new diff before applying.')
  if (!preview.changed) return { id, changed: false, applied: [], archived: [], skipped: [] }
  verifyLease?.()
  const runId = 'revert-' + randomUUID()
  stageChange({ paths, runId, now, scope: preview.scope, file: preview.file, directory: preview.directory, workspaceDir: preview.workspaceDir, workspaceDirs, settings, content: preview.content, restoreCanonicalAbsence: preview.restoreCanonicalAbsence, reason: 'Explicit restore of history entry ' + id, evidence: 'Root-session user inspected and confirmed this version diff.' })
  return { id, ...commitStage({ paths, runId, now, workspaceDirs, settings, verifyLease, extra: { reverts: id } }) }
}
