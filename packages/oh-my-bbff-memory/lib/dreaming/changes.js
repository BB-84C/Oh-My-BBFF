/** Staged Memory changes: preflight ALL operations, snapshot ALL, then per-file mutation.
 * Cross-file filesystem atomicity is not claimed. A journal and best-effort guarded
 * rollback preserve recovery evidence; failures never consume a stage/checkpoint.
 */
import * as fs from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, relative, sep, parse } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from '../defaults.js'
import { resolveMemoryDirectories, WORKSPACE_MEMORY_DIRECTORY, isWorkspaceArchive, workspaceArchiveMarker, WORKSPACE_ARCHIVE_STATUS, WORKSPACE_ARCHIVE_HEADER_BYTES, markWorkspaceShadows } from '../directories.js'
import { readUtf8Bounded } from '../io.js'
import { withMutationLock } from '../mutation-lock.js'

export const MEMORY_FILE_RE = /^(?!\.)(?!.*[\\/:\x00-\x1f<>?"|*]).+\.md$/u
export const MAX_FILE_BYTES = DEFAULT_DATA.fields.toolWriteMaxBytes.default
export const MAX_EVIDENCE_CHARS = DEFAULT_DATA.fields.stageEvidenceMaxChars.default
export const sha1 = value => createHash('sha1').update(value).digest('hex')
export const byteLength = text => Buffer.byteLength(text, 'utf8')
function safeId(value, label) {
  if (typeof value !== 'string' || value.length > DEFAULT_DATA.structuralLimits.idMaxChars || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error('Invalid ' + label)
  return value
}
export function ensureMemoryFile(file) {
  const name = String(file ?? '').trim()
  if (!MEMORY_FILE_RE.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Memory file must be a safe plain *.md filename without directories or traversal.')
  return name
}
function inside(root, target) {
  const path = relative(resolve(root), resolve(target))
  return !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep)
}
function assertOwned(root, target) {
  if (!inside(root, target)) throw new Error('Path escapes its owning Memory directory.')
  if (fs.existsSync(root) && fs.existsSync(target) && !inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error('Linked path escapes its owning Memory directory.')
  return resolve(target)
}
function removeOwned(root, target, recursive = false) { assertOwned(root, target);fs.rmSync(target, { recursive, force: true }) }
function regular(path) { try { return fs.statSync(path).isFile() } catch { return false } }
function currentBytes(path) { return regular(path) ? fs.readFileSync(path) : null }
function pathIdentity(path) { let value = resolve(path);try { value = fs.realpathSync(value) } catch {}return sha1(process.platform === 'win32' ? value.toLowerCase() : value) }
function limit(settings, key) { return settings?.[key] ?? DEFAULT_DATA.fields[key].default }

export function resolveMemoryTarget({ paths, scope = 'global', file, workspaceDir, workspaceDirs = DEFAULT_DATA.fields.workspaceMemoryDirs.default, directory }) {
  const name = ensureMemoryFile(file)
  if (scope !== 'global' && scope !== 'workspace') throw new Error('Unknown memory scope.')
  if (paths.home && resolve(paths.home) === parse(resolve(paths.home)).root) throw new Error('A drive root is not an allowed Memory home.')
  if (scope === 'global') {
    const root = resolve(paths.memoryRoot), targetPath = assertOwned(root, join(root, name))
    return { scope, file: name, root, targetPath, workspaceDir: null, directory: null, targetKey: pathIdentity(targetPath) }
  }
  if (typeof workspaceDir !== 'string' || !isAbsolute(workspaceDir) || resolve(workspaceDir) === parse(resolve(workspaceDir)).root) throw new Error('Workspace memory requires a verified absolute non-drive-root workspaceDir.')
  const workspace = resolve(workspaceDir), roots = resolveMemoryDirectories({ home: paths.home || dirname(paths.memoryRoot), cwd: workspace, workspaceDirs }).workspaceDirs
  let selected = directory === undefined || directory === null ? roots.find(row => regular(join(row.path, name))) || roots[0] : roots.find(row => row.directory === String(directory).replace(/\\/g, '/'))
  if (!selected) throw new Error('Workspace memory directory is not configured or no write directory is available.')
  const targetPath = assertOwned(selected.path, join(selected.path, name))
  // Memory tools never become an alternate way to overwrite the tracked instruction file.
  if (resolve(targetPath).toLowerCase() === join(workspace, DEFAULT_DATA.storage.protectedWorkspaceInstructionFile).toLowerCase()) throw new Error('Tracked workspace instructions are protected; use the private instruction target.')
  return { scope, file: name, root: selected.path, targetPath, workspaceDir: workspace, directory: selected.directory, targetKey: pathIdentity(targetPath) }
}
export function resolveMemoryWriteTarget(input) {
  const source = resolveMemoryTarget(input)
  if (source.scope === 'global') return { ...source, sourcePath: source.targetPath, sourceDirectory: null, legacyPaths: [] }
  const workspace = source.workspaceDir, root = assertOwned(workspace, join(workspace, WORKSPACE_MEMORY_DIRECTORY))
  // A canonical label must not be an alias/junction into somebody else's legacy tree.
  for (const path of [join(workspace, '.dsh'), root]) if (fs.existsSync(path) && fs.lstatSync(path).isSymbolicLink()) throw new Error('Linked canonical workspace memory directories are not writable.')
  const roots = resolveMemoryDirectories({ home: input.paths.home || dirname(input.paths.memoryRoot), cwd: workspace, workspaceDirs: input.workspaceDirs }).workspaceDirs
  const targetPath = assertOwned(root, join(root, source.file)), legacyPaths = roots.filter(row => row.directory !== WORKSPACE_MEMORY_DIRECTORY).map(row => join(row.path, source.file)).filter(regular)
  const effective = regular(targetPath) ? { targetPath, directory: WORKSPACE_MEMORY_DIRECTORY } : roots.map(row => ({ targetPath: join(row.path, source.file), directory: row.directory })).find(row => regular(row.targetPath)) || { targetPath, directory: WORKSPACE_MEMORY_DIRECTORY }
  return { ...source, root, targetPath, directory: WORKSPACE_MEMORY_DIRECTORY, targetKey: pathIdentity(targetPath), sourcePath: effective.targetPath, sourceDirectory: effective.directory, legacyPaths }
}
export function readMemoryFile(input) {
  const target = resolveMemoryTarget(input), read = readUtf8Bounded(target.targetPath, input.maxBytes ?? DEFAULT_DATA.fields.toolReadMaxBytes.default)
  let archived = false, readError = null
  try { archived = target.scope === 'workspace' && target.directory === WORKSPACE_MEMORY_DIRECTORY && (isWorkspaceArchive(read.content) || (read.truncated && isWorkspaceArchive(readUtf8Bounded(target.targetPath, WORKSPACE_ARCHIVE_HEADER_BYTES).content))) }
  catch (error) { readError = 'Archive metadata read failed: ' + String(error?.message || error) }
  return { ...target, ...read, path: target.targetPath, archived, status: readError ? 'read-failed' : archived ? WORKSPACE_ARCHIVE_STATUS : 'active', ...(readError ? { readError } : {}) }
}
export function listMemoryFiles({ paths, scope = 'global', workspaceDir, workspaceDirs = DEFAULT_DATA.fields.workspaceMemoryDirs.default }) {
  const roots = scope === 'workspace' ? resolveMemoryDirectories({ home: paths.home || dirname(paths.memoryRoot), cwd: workspaceDir, workspaceDirs }).workspaceDirs : [{ path: paths.memoryRoot, directory: null }]
  const files = []
  for (const root of roots) {
    let entries
    try { entries = fs.readdirSync(root.path, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (!entry.isFile() || !MEMORY_FILE_RE.test(entry.name)) continue
      const path = join(root.path, entry.name), info = fs.statSync(path)
      let archived = false, readError = null
      try { archived = scope === 'workspace' && root.directory === WORKSPACE_MEMORY_DIRECTORY && isWorkspaceArchive(readUtf8Bounded(path, WORKSPACE_ARCHIVE_HEADER_BYTES).content) }
      catch (error) { readError = 'Archive metadata read failed: ' + String(error?.message || error) }
      files.push({ scope, file: entry.name, path, directory: root.directory, workspaceDir: scope === 'workspace' ? resolve(workspaceDir) : null, bytes: info.size, updatedAt: Math.round(info.mtimeMs), archived, ...(readError ? { readStatus: 'failed', readError } : {}) })
    }
  }
  return markWorkspaceShadows(files).map(row => ({ ...row, active: !row.shadowedBy && !row.archived && row.readStatus !== 'failed' })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}
export function runStageDir({ paths, runId }) { return assertOwned(paths.stageRoot, join(paths.stageRoot, safeId(runId, 'runId'))) }
const stageFile = (paths, runId, opId) => assertOwned(runStageDir({ paths, runId }), join(runStageDir({ paths, runId }), 'files', safeId(opId, 'opId') + '.md'))
export function readStageManifest({ paths, runId }) {
  const path = join(runStageDir({ paths, runId }), 'manifest.json')
  if (!fs.existsSync(path)) return { version: 2, runId, createdAt: null, ops: [] }
  const parsed = JSON.parse(fs.readFileSync(assertOwned(paths.stageRoot, path), 'utf8'))
  if (!parsed || parsed.runId !== runId || !Array.isArray(parsed.ops)) throw new Error('Staging manifest is invalid; recovery evidence was preserved.')
  return parsed
}
function writeManifest(paths, runId, manifest) {
  const dir = runStageDir({ paths, runId });fs.mkdirSync(dir, { recursive: true })
  const target = join(dir, 'manifest.json'), temporary = target + '.' + randomUUID() + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', 'utf8');fs.renameSync(temporary, target)
}
export function stageChange({ paths, runId, now, scope = 'global', file, content, reason, evidence, workspaceDir, workspaceDirs, directory, settings, actor = 'Memory transaction ' + runId, restoreCanonicalAbsence = false }) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > limit(settings, 'stageReasonMaxChars')) throw new Error('Every staged change needs a reason within its published character limit.')
  if (typeof evidence !== 'string' || !evidence.trim() || evidence.length > limit(settings, 'stageEvidenceMaxChars')) throw new Error('Every staged change needs evidence within its published character limit.')
  const target = resolveMemoryWriteTarget({ paths, scope, file, workspaceDir, workspaceDirs, directory })
  for (const path of new Set([target.targetPath, target.sourcePath])) if (regular(path) && fs.statSync(path).size > limit(settings, 'toolReadMaxBytes')) throw new Error('Existing source exceeds the configured snapshot/read limit; inspect settings before staging.')
  const before = currentBytes(target.targetPath), sourceBefore = currentBytes(target.sourcePath), kind = content === null || content === undefined ? 'remove' : 'set'
  if (kind === 'set' && (typeof content !== 'string' || byteLength(content) > limit(settings, 'toolWriteMaxBytes'))) throw new Error('Staged content must be UTF-8 text within the configured file limit.')
  if (kind === 'remove' && sourceBefore === null) throw new Error('Cannot archive a memory file that does not exist.')
  if (restoreCanonicalAbsence && (target.scope !== 'workspace' || kind !== 'remove')) throw new Error('Canonical absence restoration requires a workspace removal.')
  const shadowArchive = kind === 'remove' && target.scope === 'workspace' && target.legacyPaths.length > 0 && !restoreCanonicalAbsence, after = kind === 'set' ? content : shadowArchive ? workspaceArchiveMarker({ legacyPaths: target.legacyPaths, at: now, actor }) : null
  if (after !== null && byteLength(after) > limit(settings, 'toolWriteMaxBytes')) throw new Error('Proposed after-state exceeds the configured file limit.')
  const manifest = readStageManifest({ paths, runId }), replaced = manifest.ops.filter(op => (op.targetKey || pathIdentity(op.targetPath)) === target.targetKey), ops = manifest.ops.filter(op => !replaced.includes(op))
  if (ops.length >= limit(settings, 'stageMaxOps')) throw new Error('Stage has reached its published operation limit.')
  if (ops.reduce((sum, op) => sum + (op.bytesBefore || 0) + (op.bytesAfter || 0), 0) + (sourceBefore?.length || 0) + (after === null ? 0 : byteLength(after)) > limit(settings, 'stageMaxBytesTotal')) throw new Error('Stage exceeds the published total snapshot byte limit.')
  const opId = 'op-' + randomUUID(), stagedPath = kind === 'set' ? stageFile(paths, runId, opId) : null
  if (stagedPath) { fs.mkdirSync(dirname(stagedPath), { recursive: true });fs.writeFileSync(stagedPath, content, 'utf8') }
  const op = { opId, kind, scope: target.scope, file: target.file, workspaceDir: target.workspaceDir, directory: target.directory, targetKey: target.targetKey, targetPath: target.targetPath, sourcePath: target.sourcePath, sourceDirectory: target.sourceDirectory, sourceSha1Before: sourceBefore === null ? null : sha1(sourceBefore), shadowArchive, restoreCanonicalAbsence: Boolean(restoreCanonicalAbsence), actor, stagedPath, bytesBefore: sourceBefore?.length || 0, bytesAfter: after === null ? 0 : byteLength(after), sha1Before: before === null ? null : sha1(before), sha1After: after === null ? null : sha1(after), reason, evidence, stagedAt: now }
  ops.push(op);writeManifest(paths, runId, { version: 2, runId, createdAt: manifest.createdAt ?? now, ops })
  for (const old of replaced) if (old.kind === 'set') { const owned = stageFile(paths, runId, old.opId);if (fs.existsSync(owned)) removeOwned(paths.stageRoot, owned) }
  return { ...op, runId, changed: op.sha1Before !== op.sha1After, stagePath: runStageDir({ paths, runId }) }
}
export function discardStage({ paths, runId, opId }) {
  const manifest = readStageManifest({ paths, runId }), kept = opId === undefined ? [] : manifest.ops.filter(op => op.opId !== opId), removed = manifest.ops.filter(op => !kept.includes(op))
  for (const op of removed) if (op.kind === 'set') { const owned = stageFile(paths, runId, op.opId);if (fs.existsSync(owned)) removeOwned(paths.stageRoot, owned) }
  if (!kept.length) { const dir = runStageDir({ paths, runId });if (fs.existsSync(dir)) removeOwned(paths.stageRoot, dir, true) }
  else writeManifest(paths, runId, { ...manifest, ops: kept })
  return { runId, discarded: removed.map(op => op.opId), remaining: kept.length }
}
function backupSuffix(target) {
  return target.scope === 'global' ? join('global', target.file) : join('workspace', sha1(target.workspaceDir), target.directory, target.file)
}
function appendRows(paths, rows, io = fs) { io.mkdirSync(dirname(paths.changelogPath), { recursive: true });io.writeFileSync(paths.changelogPath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', { flag: 'a' }) }
export { assertOwned as assertMemoryOwnedPath }
export function commitStage(input) { input.verifyLease?.();return withMutationLock(input.paths, () => commitStageUnlocked(input)) }
function commitStageUnlocked({ paths, runId, now, extra = {}, workspaceDirs, settings, verifyLease, fsOps = {} }) {
  const io = { ...fs, ...fsOps }, manifest = readStageManifest({ paths, runId }), ops = manifest.ops
  if (ops.length > limit(settings, 'stageMaxOps')) throw new Error('Staged operation count exceeds its configured limit.')
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-'), transactionId = 'transaction-' + randomUUID(), historyDir = ops.length ? join(paths.historyRoot, stamp + '-' + transactionId) : null, prepared = [], records = [], skipped = []
  verifyLease?.()
  // No snapshot, removal or target mutation occurs until EVERY operation passes.
  let preflightBytes = 0
  for (const op of ops) {
    safeId(op.opId, 'opId')
    const target = resolveMemoryWriteTarget({ paths, scope: op.scope, file: op.file, workspaceDir: op.workspaceDir, workspaceDirs, directory: op.sourceDirectory ?? op.directory })
    if (resolve(op.targetPath) !== target.targetPath) throw new Error('Staged target no longer matches its configured scope/directory.')
    if (fs.existsSync(target.targetPath) && fs.lstatSync(target.targetPath).isSymbolicLink()) throw new Error('Writing through a linked memory file is unsupported.')
    const beforeSize = regular(target.targetPath) ? fs.statSync(target.targetPath).size : 0
    if (beforeSize > limit(settings, 'toolReadMaxBytes')) throw new Error('Existing source exceeds the configured snapshot/read limit.')
    preflightBytes += beforeSize
    if (preflightBytes > limit(settings, 'stageMaxBytesTotal')) throw new Error('Transaction exceeds total snapshot byte limit.')
    const before = currentBytes(target.targetPath), beforeHash = before === null ? null : sha1(before)
    if (beforeHash !== op.sha1Before) throw new Error('Memory changed after staging: ' + op.file)
    const sourcePath = op.sourcePath || op.targetPath
    if (resolve(sourcePath) !== target.sourcePath) throw new Error('Memory read source changed after staging: ' + op.file)
    const sourceSize = regular(sourcePath) ? fs.statSync(sourcePath).size : 0
    if (sourceSize > limit(settings, 'toolReadMaxBytes')) throw new Error('Read-only source exceeds the snapshot limit.')
    if (sourcePath !== target.targetPath) preflightBytes += sourceSize
    if (preflightBytes > limit(settings, 'stageMaxBytesTotal')) throw new Error('Transaction exceeds total snapshot byte limit.')
    const sourceBefore = currentBytes(sourcePath), sourceHash = sourceBefore === null ? null : sha1(sourceBefore)
    if (sourceHash !== (op.sourceSha1Before === undefined ? op.sha1Before : op.sourceSha1Before)) throw new Error('Memory read source changed after staging: ' + op.file)
    if (op.restoreCanonicalAbsence && (target.scope !== 'workspace' || op.kind !== 'remove')) throw new Error('Invalid canonical absence restoration.')
    const shadowArchive = op.kind === 'remove' && target.scope === 'workspace' && target.legacyPaths.length > 0 && !op.restoreCanonicalAbsence
    if (shadowArchive !== Boolean(op.shadowArchive)) throw new Error('Legacy archive coverage changed after staging; restage the proposal.')
    let content = shadowArchive ? Buffer.from(workspaceArchiveMarker({ legacyPaths: target.legacyPaths, at: now, actor: op.actor }), 'utf8') : null
    if (shadowArchive) { preflightBytes += content.length;if (content.length > limit(settings, 'toolWriteMaxBytes') || preflightBytes > limit(settings, 'stageMaxBytesTotal')) throw new Error('Archive marker exceeds published file/transaction limits.') }
    if (op.kind === 'set') {
      const owned = stageFile(paths, runId, op.opId)
      if (!op.stagedPath || resolve(op.stagedPath) !== owned || !regular(owned) || fs.lstatSync(owned).isSymbolicLink()) throw new Error('Staged content is missing or outside its recorded operation.')
      const stagedSize = fs.statSync(owned).size;preflightBytes += stagedSize
      if (stagedSize > limit(settings, 'toolWriteMaxBytes') || preflightBytes > limit(settings, 'stageMaxBytesTotal')) throw new Error('Staged content exceeds published file/total snapshot limits.')
      content = fs.readFileSync(owned)
      if (content.length > limit(settings, 'toolWriteMaxBytes') || sha1(content) !== op.sha1After) throw new Error('Staged content changed or exceeds its configured limit.')
    } else if (op.kind !== 'remove' || sourceBefore === null) throw new Error('Invalid or missing archive source.')
    const stagedAfter = shadowArchive ? sha1(workspaceArchiveMarker({ legacyPaths: target.legacyPaths, at: op.stagedAt, actor: op.actor })) : content === null ? null : sha1(content)
    if (stagedAfter !== op.sha1After) throw new Error('Staged after-state no longer matches its operation.')
    const afterHash = content === null ? null : sha1(content)
    if (beforeHash === afterHash) { skipped.push({ file: op.file, reason: 'unchanged' });continue }
    prepared.push({ op: { ...op, sha1After: afterHash }, target, before, content, beforeHash, sourcePath, sourceBefore, sourceHash, backup: sourceBefore === null ? null : assertOwned(paths.historyRoot, join(historyDir, backupSuffix(target))), temporary: null, archivedTo: op.kind === 'remove' ? assertOwned(paths.archiveRoot, join(paths.archiveRoot, stamp, transactionId, backupSuffix(target))) : null })
  }
  const journalPath = historyDir ? join(historyDir, 'transaction.json') : null
  const journal = { version: 1, transactionId, runId, at: now, status: 'prepared', operations: prepared.map(item => ({ targetPath: item.target.targetPath, backup: item.backup, beforeHash: item.beforeHash, afterHash: item.op.sha1After })) }
  const writeJournal = () => { if (journalPath) { io.mkdirSync(dirname(journalPath), { recursive: true });io.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8') } }
  const appliedItems = [], warnings = []
  try {
    for (const item of prepared) {
      if (item.backup) { io.mkdirSync(dirname(item.backup), { recursive: true });io.copyFileSync(item.sourcePath, item.backup) }
      if (item.content !== null) { io.mkdirSync(dirname(item.target.targetPath), { recursive: true });item.temporary = assertOwned(item.target.root, item.target.targetPath + '.' + randomUUID() + '.tmp');io.writeFileSync(item.temporary, item.content) }
    }
    writeJournal()
    for (const item of prepared) {
      verifyLease?.()
      const current = currentBytes(item.target.targetPath)
      if ((current === null ? null : sha1(current)) !== item.beforeHash) throw new Error('Memory changed during transaction preparation: ' + item.op.file)
      const source = currentBytes(item.sourcePath)
      if ((source === null ? null : sha1(source)) !== item.sourceHash) throw new Error('Memory read source changed during transaction preparation: ' + item.op.file)
      if (item.op.kind === 'remove') {
        io.mkdirSync(dirname(item.archivedTo), { recursive: true })
        if (item.op.shadowArchive) { io.copyFileSync(item.sourcePath, item.archivedTo);io.renameSync(item.temporary, item.target.targetPath) }
        else io.renameSync(item.target.targetPath, item.archivedTo)
      } else io.renameSync(item.temporary, item.target.targetPath)
      appliedItems.push(item)
      records.push({ id: 'change-' + randomUUID(), at: now, runId, transactionId, kind: item.op.kind === 'remove' ? 'archive' : item.sourceBefore === null ? 'create' : 'replace', action: item.op.kind === 'remove' ? 'archive' : item.sourceBefore === null ? 'create' : 'replace', scope: item.target.scope, file: item.target.file, directory: item.target.directory, workspaceDir: item.target.workspaceDir, targetPath: item.target.targetPath, backup: item.backup, archivedTo: item.archivedTo, bytesBefore: item.sourceBefore?.length || 0, bytesAfter: item.content?.length || 0, sha1Before: item.sourceHash, sha1After: item.op.sha1After, sourcePath: item.sourcePath, canonicalCreated: item.target.scope === 'workspace' && item.before === null, shadowArchive: Boolean(item.op.shadowArchive), reason: item.op.reason, evidence: item.op.evidence, ...extra })
    }
    journal.status = 'files-applied';writeJournal()
    appendRows(paths, [{ at: now, runId, transactionId, kind: 'transaction-begin' }, ...records, { id: 'review-' + randomUUID(), at: now, runId, transactionId, kind: 'review', applied: records.filter(row => row.kind !== 'archive').length, archived: records.filter(row => row.kind === 'archive').length, skipped: skipped.length, changed: records.length > 0, ...extra }, { at: now, runId, transactionId, kind: 'transaction-commit' }], io)
    journal.status = 'committed'
    try { writeJournal() } catch (error) { warnings.push('Change log committed, but journal finalization failed: ' + String(error?.message || error)) }
  } catch (error) {
    const rollback = []
    for (const item of appliedItems.reverse()) {
      try {
        verifyLease?.()
        const current = currentBytes(item.target.targetPath), expectedAfter = item.op.sha1After
        if ((current === null ? null : sha1(current)) !== expectedAfter) throw new Error('Target changed outside this transaction; rollback refused to overwrite it.')
        if (item.before === null) removeOwned(item.target.root, item.target.targetPath)
        else { const temporary = assertOwned(item.target.root, item.target.targetPath + '.' + randomUUID() + '.rollback.tmp');fs.writeFileSync(temporary, item.before);fs.renameSync(temporary, item.target.targetPath) }
        rollback.push({ file: item.op.file, restored: true })
      } catch (failure) { rollback.push({ file: item.op.file, restored: false, reason: String(failure?.message || failure) }) }
    }
    journal.status = rollback.some(row => !row.restored) ? 'partial' : 'rolled-back';journal.rollback = rollback;journal.error = String(error?.message || error)
    try { writeJournal() } catch {}
    const failure = new Error('Memory transaction failed; stage/checkpoint preserved. Recovery: ' + journal.status + '. ' + String(error?.message || error));failure.recovery = { journalPath, rollback };throw failure
  } finally {
    for (const item of prepared) if (item.temporary && fs.existsSync(item.temporary)) removeOwned(item.target.root, item.temporary)
  }
  const stageDir = runStageDir({ paths, runId })
  try { if (fs.existsSync(stageDir)) removeOwned(paths.stageRoot, stageDir, true) } catch (error) { warnings.push('Committed stage cleanup failed: ' + String(error?.message || error)) }
  return { applied: records.filter(row => row.kind !== 'archive'), archived: records.filter(row => row.kind === 'archive'), skipped, historyDir, transactionId, changed: records.length > 0, warnings }
}
export function describeStage({ paths, runId }) {
  if (typeof runId !== 'string') return { runId: null, ops: [], changed: 0 }
  try {
    const manifest = readStageManifest({ paths, runId })
    return { runId, createdAt: manifest.createdAt, ops: manifest.ops.map(({ opId, kind, scope, file, directory, workspaceDir, bytesBefore, bytesAfter, reason }) => ({ opId, kind, scope, file, directory, workspaceDir, bytesBefore, bytesAfter, reason })), changed: manifest.ops.filter(op => op.sha1Before !== op.sha1After).length }
  } catch (error) { return { runId, ops: [], changed: 0, error: String(error?.message || error) } }
}
export function listStagedRuns({ paths, limit: count = DEFAULT_DATA.fields.changelogPageSize.default }) {
  let entries
  try { entries = fs.readdirSync(paths.stageRoot, { withFileTypes: true }) } catch { return [] }
  return entries.filter(entry => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name)).map(entry => ({ runId: entry.name, ...describeStage({ paths, runId: entry.name }) })).slice(0, count)
}
