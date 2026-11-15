/** Memory scanning and byte-exact bounded rendering. Defaults/prose are module data. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { DEFAULT_DATA, PROMPT_DEFAULTS, renderPrompt, reviewInventoryBudget, shippedSettings } from './defaults.js'
import { fileIdentity, workspaceReadDirectories, markWorkspaceShadows, WORKSPACE_MEMORY_DIRECTORY, WORKSPACE_ARCHIVE_HEADER_BYTES, isWorkspaceArchive } from './directories.js'
import { wrapSystemReminder } from './dsh-adapter.js'
import { byteLength, truncateUtf8 } from './text.js'
import { readUtf8Bounded } from './io.js'
export { byteLength, truncateUtf8 } from './text.js'

export const SOURCE_KIND = DEFAULT_DATA.contract.sourceKind
/** Compatibility export: auto budgeting intentionally has no fixed byte default. */
export const DEFAULT_BUDGET_BYTES = undefined
export const DEFAULT_WORKSPACE_DIRS = DEFAULT_DATA.fields.workspaceMemoryDirs.default
export const sha1 = text => createHash('sha1').update(text).digest('hex')
export function collectMemory({ globalDir, cwd, workspaceDirs = DEFAULT_WORKSPACE_DIRS, cache = new Map(), maxSourceBytes = DEFAULT_DATA.fields.memorySourceMaxBytes.default }) {
  const warnings = [], allFiles = []
  function scan(dir, scope, directory) {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const name of entries.filter(entry => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')).map(entry => entry.name).sort()) {
      const absPath = join(dir, name)
      let info
      try { info = statSync(absPath) } catch { continue }
      if (!info.isFile()) continue
      let file = cache.get(absPath)
      if (!file || file.mtimeMs !== info.mtimeMs || file.size !== info.size || file.readLimit !== maxSourceBytes) {
        try {
          const read = readUtf8Bounded(absPath, maxSourceBytes), readable = read.exists && !read.truncated && read.validUtf8
          const content = readable ? read.content : null
          file = { mtimeMs: info.mtimeMs, size: info.size, readLimit: maxSourceBytes, content, sha1: readable ? sha1(content.trim()) : null, sourceSha1: readable ? sha1(content) : null, readStatus: readable ? 'read' : read.truncated ? 'over-limit' : 'invalid-utf8' };cache.set(absPath, file)
        } catch (error) { file = { mtimeMs: info.mtimeMs, size: info.size, readLimit: maxSourceBytes, content: null, readStatus: 'failed' };warnings.push(name + ': read failed (' + String(error?.message || error) + ')') }
      }
      const row = { scope, name, directory, key: fileIdentity({ scope, name, directory }), display: scope === 'global' ? absPath : `${directory.replace(/\\/g, '/')}/${name}`, absPath, content: file.content, sha1: file.sha1, sourceSha1: file.sourceSha1, bytes: typeof file.content === 'string' ? byteLength(file.content) : info.size, mtimeMs: file.mtimeMs, readStatus: file.readStatus }
      if (scope === 'workspace' && directory === WORKSPACE_MEMORY_DIRECTORY && typeof file.content !== 'string') {
        try { row.archived = isWorkspaceArchive(readUtf8Bounded(absPath, WORKSPACE_ARCHIVE_HEADER_BYTES).content) }
        catch (error) { row.archived = false;row.readStatus = 'failed';warnings.push(name + ': read failed (archive metadata: ' + String(error?.message || error) + ')') }
      }
      allFiles.push(row)
      if (typeof file.content !== 'string') { warnings.push(name + ': source omitted (' + file.readStatus + ')');continue }
    }
  }
  scan(globalDir, 'global', '')
  if (cwd) for (const directory of workspaceReadDirectories(workspaceDirs)) scan(join(cwd, directory), 'workspace', directory)
  const annotated = markWorkspaceShadows(allFiles), represented = dedupeMemoryFiles(annotated)
  return { files: represented.files, allFiles: annotated, duplicates: represented.duplicates, warnings }
}
/** Call AFTER activation filtering so an enabled duplicate can represent a disabled earlier path. */
export function dedupeMemoryFiles(files) {
  const seen = new Map(), represented = [], duplicates = [], unreadable = []
  for (const file of files) {
    if (file.shadowedBy || file.archived) { duplicates.push({ ...file, duplicateOf: file.shadowedBy || file.key, reason: file.archived ? 'archived' : 'shadowed' });continue }
    if (typeof file.content !== 'string') { unreadable.push(file);continue }
    const digest = sha1(file.content.trim())
    if (seen.has(digest)) duplicates.push({ ...file, duplicateOf: seen.get(digest).key })
    else { seen.set(digest, file);represented.push(file) }
  }
  return { files: represented, duplicates, unreadable }
}
/** Digests describe the supplied body, not a claim that all discovered source bytes were admitted. */
export function digestsOf(files) {
  return new Map(files.map(file => [file.display, file.admittedSha1 || file.sourceSha1 || sha1(file.content ?? '')]))
}
export const frameReminder = text => wrapSystemReminder(String(text ?? ''))
const budgetFor = (files, value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : reviewInventoryBudget(shippedSettings(), files).budgetBytes
function sectionText(file) {
  const note = file.truncated ? ` [truncated ${file.includedBytes}/${file.originalBytes} UTF-8 bytes]` : ''
  return `Instructions from: ${file.display}${note}\n\n${file.content}`
}
function assemble(files, intro, prompts, omitted) {
  const parts = [intro]
  const truncatedCount = files.filter(file => file.truncated).length
  if (omitted.length || truncatedCount) parts.push(renderPrompt(prompts.injectionBudgetNotice, { omittedCount: omitted.length, truncatedCount }))
  parts.push(...files.map(sectionText))
  return frameReminder(parts.filter(Boolean).join('\n\n'))
}

/** Includes framing/escaping/metadata. No hidden minimum or output beyond the chosen budget. */
export function renderBaseline(files, budget, options = {}) {
  if (!Array.isArray(files) || !files.length) return null
  const limit = budgetFor(files, budget), prompts = { ...PROMPT_DEFAULTS, ...options.prompts }
  let intro = options.replacement ? prompts.injectionReplacementIntro : prompts.injectionIntro
  let included = files.filter(file => typeof file.content === 'string').map(file => ({ ...file, sourceSha1: file.sourceSha1 || sha1(file.content), originalBytes: byteLength(file.content), includedBytes: byteLength(file.content), truncated: false, admittedSha1: sha1(file.content) }))
  const omitted = files.filter(file => typeof file.content !== 'string').map(file => ({ ...file, originalBytes: file.bytes, reason: file.readStatus || 'source-unavailable' }))
  if (byteLength(assemble(included, intro, prompts, omitted)) > limit) intro = prompts.injectionBudgetIntro
  let text = included.length ? assemble(included, intro, prompts, omitted) : ''
  while (byteLength(text) > limit && included.length > 1) {
    omitted.push(included.shift());text = assemble(included, intro, prompts, omitted)
  }
  if (byteLength(text) > limit && included.length === 1) {
    const original = included[0]
    let low = 0, high = original.originalBytes, best = null
    while (low <= high) {
      const count = Math.floor((low + high) / 2), content = truncateUtf8(original.content, count)
      const copy = { ...original, content, includedBytes: byteLength(content), truncated: content !== original.content, admittedSha1: sha1(content) }
      const trial = assemble([copy], intro, prompts, omitted)
      if (byteLength(trial) <= limit) { best = copy;low = count + 1 } else high = count - 1
    }
    if (best && (best.includedBytes > 0 || original.originalBytes === 0)) included = [best]
    else { omitted.push(original);included = [] }
    text = included.length ? assemble(included, intro, prompts, omitted) : ''
  }
  if (byteLength(text) > limit) { omitted.push(...included);included = [];text = '' }
  const truncated = included.filter(file => file.truncated).map(file => ({ key: file.key, display: file.display, path: file.absPath, originalBytes: file.originalBytes, includedBytes: file.includedBytes }))
  const omittedFacts = omitted.map(file => ({ key: file.key, display: file.display, path: file.absPath, bytes: file.originalBytes ?? file.bytes, reason: file.reason || 'injection-budget' }))
  const warnings = []
  if (omitted.length) warnings.push(`Memory budget omitted ${omitted.length} file(s): ${omitted.map(file => file.display).join(', ')}`)
  if (truncated.length) warnings.push(`Memory budget truncated ${truncated.map(file => file.display).join(', ')}`)
  if (!text && files.length) warnings.push('The effective budget cannot contain a file with its required frame; nothing new was injected. Previously admitted context is not retroactively erased.')
  return { text, identity: sha1(JSON.stringify({ limit, files: included.map(file => [file.display, file.admittedSha1]), intro })), rendered: included, omitted: omittedFacts, truncated, usedBytes: byteLength(text), budgetBytes: limit, totalBytes: files.reduce((sum, file) => sum + (typeof file.content === 'string' ? byteLength(file.content) : file.bytes || 0), 0), warnings }
}
export function renderBaselineReplacement(files, budget, options = {}) {
  return renderBaseline(files, budget, { ...options, replacement: true })
}
export function renderChanges(files, previousDigests, budget, options = {}) {
  if (!(previousDigests instanceof Map)) return null
  const allocation = renderBaseline(files, budget, options)
  const represented = allocation?.rendered || [], current = digestsOf(represented), prompts = { ...PROMPT_DEFAULTS, ...options.prompts }, changes = []
  for (const file of represented) {
    const before = previousDigests.get(file.display)
    if (before !== current.get(file.display)) changes.push({ action: before === undefined ? 'set' : 'replace', display: file.display, file })
  }
  for (const display of previousDigests.keys()) if (!current.has(display)) changes.push({ action: 'remove', display })
  if (!changes.length) return null
  const parts = [prompts.injectionUpdateIntro]
  for (const change of changes) {
    if (change.action === 'remove') parts.push(renderPrompt(prompts.injectionRemovedNotice, { path: change.display }))
    else parts.push(`${change.action === 'set' ? 'Additional memory from' : 'Updated memory from'}: ${change.display}\n\n${change.file.content}`)
  }
  const text = frameReminder(parts.join('\n\n')), limit = budgetFor(files, budget)
  if (byteLength(text) > limit) {
    const replacement = renderBaselineReplacement(files, limit, options)
    if (!replacement) return { mode: 'replace', text: '', identity: sha1('empty'), changes: changes.map(({ action, display }) => ({ action, display })), rendered: [], omitted: [], truncated: [], usedBytes: 0, budgetBytes: limit, warnings: ['No active memory remains; no new content was injected.'] }
    return { ...replacement, mode: 'replace', changes: changes.map(({ action, display }) => ({ action, display })) }
  }
  return { ...(allocation || {}), mode: 'update', text, usedBytes: byteLength(text), identity: sha1(JSON.stringify([...current])), changes: changes.map(({ action, display }) => ({ action, display })), rendered: represented, warnings: allocation?.warnings || [] }
}
export function memoryStatus({ files, budget, globalDir, warnings = [], prompts }) {
  const rendered = renderBaseline(files, budget, { prompts }), totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  return { ok: true, budgetBytes: budgetFor(files, budget), usedBytes: rendered?.usedBytes || 0, globalDir, totals: { files: files.length, bytes: totalBytes, global: files.filter(file => file.scope === 'global').length, workspace: files.filter(file => file.scope === 'workspace').length }, files: files.map(file => ({ key: file.key, scope: file.scope, display: file.display, path: file.absPath, bytes: file.bytes, sha1: file.sha1, updatedAt: Math.round(file.mtimeMs) })), omitted: rendered?.omitted || [], truncated: rendered?.truncated || [], warnings: [...warnings, ...(rendered?.warnings || [])] }
}
