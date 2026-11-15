/** Eight global Memory tools. Shared identity, paths, settings and preview-bound writes. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, statSync } from 'node:fs'
import { join, dirname, isAbsolute, resolve, parse } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_DATA, PROMPT_DEFAULTS } from './defaults.js'
import { normalizeSettings } from './settings.js'
import { collectMemory } from './store.js'
import { resolveMemoryDirectories, fileIdentity } from './directories.js'
import { parseToggleKey, isFileEnabled } from './toggles.js'
import { sessionHeaderFacts } from './dsh-adapter.js'
import { FAMILY_SERVICE } from './bbff-contract.js'
import { authorizeRootAgent } from './root-access.js'
import { dreamingPaths } from './dreaming/state.js'
import { resolveMemoryTarget, resolveMemoryWriteTarget, readMemoryFile, stageChange, commitStage, sha1 } from './dreaming/changes.js'
import { readUtf8Bounded } from './io.js'
import { withMutationLock } from './mutation-lock.js'
import { simpleDiff } from './diff.js'
export { simpleDiff } from './diff.js'

export const MEMORY_TOOL_TRAITS = Object.freeze({ memory_list: { effect: 'read' }, memory_read: { effect: 'read' }, memory_search: { effect: 'read' }, memory_write: { effect: 'write' }, memory_delete: { effect: 'write' }, agentsmd_read: { effect: 'read' }, agentsmd_write: { effect: 'write' }, memory_candidate: { effect: 'write' } })
export const MEMORY_TOOL_NAMES = Object.freeze(Object.keys(MEMORY_TOOL_TRAITS))
const output = { schema: { type: 'object', additionalProperties: true, properties: {} }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
const scope = { type: 'string', enum: ['global', 'workspace'], description: 'Memory scope.' }
const file = { type: 'string', description: 'Safe plain Markdown filename.' }
const directory = { type: 'string', description: 'Optional exact configured workspace directory from inventory.' }
const key = { type: 'string', description: 'Optional directory-qualified inventory key; do not combine with conflicting scope/file.' }
const previewToken = { type: 'string', description: 'Required with apply:true; copy the dry-run token for this exact actor, target, content and current bytes. It is a stale-target check, not authentication.' }
export function isRootAgent(exec) {
  const decoded = sessionHeaderFacts(exec?.agent?.session?.header), value = decoded.value
  return decoded.complete && !value.isSubagent && !value.parentId && !(Number(value.depth) > 0)
}
const tokenFor = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function selected(args) {
  if (args?.key) {
    const parsed = parseToggleKey(args.key)
    if (!parsed || (args.file && args.file !== parsed.file) || (args.scope && args.scope !== parsed.scope)) throw new Error('Inventory key conflicts with scope/file.')
    return parsed
  }
  return { scope: args?.scope || 'global', file: args?.file, directory: args?.directory }
}
export function registerMemoryTools(ctx, options) {
  const home = options.dshHome, paths = dreamingPaths({ home }), tools = ctx.get('tools')
  if (!tools?.register) return () => {}
  const settings = () => normalizeSettings({ ...(Array.isArray(options.workspaceDirs) ? { workspaceMemoryDirs: options.workspaceDirs } : {}), ...(options.getSettings?.() || {}) })
  async function context(exec, write = false) {
    const decoded = sessionHeaderFacts(exec?.agent?.session?.header), id = exec?.agent?.id || decoded.value.sessionId
    let root = { rootSessionId: id || null, cwd: null, resolved: false, reason: 'Shared root resolver unavailable.' }
    if (id) {
      if (options.resolveRoot) root = await options.resolveRoot(id, exec)
      else { let family;try { family = ctx.get(FAMILY_SERVICE) } catch {}if (family?.contract === 1 && family.resolveRoot) root = await family.resolveRoot(id) }
    }
    if (write) { const permission = authorizeRootAgent(exec?.agent, root);if (!permission.allowed) throw new Error(permission.reason) }
    let disabled = new Set()
    if (options.getDisabledKeys) {
      if (!root.resolved) throw new Error('Root activation context is unavailable; reads cannot bypass per-root file switches.')
      disabled = await options.getDisabledKeys(exec)
      if (!(disabled instanceof Set)) throw new Error('Memory activation policy is unavailable.')
    }
    return { root, id, cwd: root.resolved ? root.cwd : null, disabled, settings: settings() }
  }
  function target(selection, current, write = false) {
    const input = { paths, ...selection, workspaceDir: current.cwd, workspaceDirs: current.settings.workspaceMemoryDirs }, source = resolveMemoryTarget(input)
    if (!isFileEnabled({ scope: source.scope, name: source.file, directory: source.directory }, current.disabled)) throw new Error('This memory file is disabled for the resolved root session.')
    const value = write ? resolveMemoryWriteTarget(input) : source
    if (!isFileEnabled({ scope: value.scope, name: value.file, directory: value.directory }, current.disabled)) throw new Error('The canonical memory target is disabled for the resolved root session.')
    return value
  }
  function scan(current) {
    return collectMemory({ globalDir: paths.memoryRoot, cwd: current.cwd, workspaceDirs: current.cwd ? current.settings.workspaceMemoryDirs : [], maxSourceBytes: current.settings.toolReadMaxBytes, cache: new Map() })
  }
  function beforeTarget(path, limit) {
    const read = readUtf8Bounded(path, limit)
    if (read.truncated || !read.validUtf8) throw new Error('A complete valid UTF-8 source is required for a write preview; inspect the published read limit.')
    const hash = read.exists ? sha1(readFileSync(path)) : null
    return { ...read, hash }
  }
  function preview(kind, current, targetPath, before, after) {
    return tokenFor({ kind, actor: current.id, targetPath, before: before.hash, after: after === null ? null : sha1(after) })
  }
  const definitions = [], add = (name, description, parameters, execute) => definitions.push(defineTool({ name, description, parameters, output, execute, presentCall: args => ({ card: 'generic', title: name, kind: 'other', rawInput: args || {} }) }))
  add('memory_list', 'List persistent memory files with configured real paths, directory-qualified keys and root activation/read status. Inventory is not proof of injection.', { scope: { type: 'string', enum: ['global', 'workspace', 'all'], description: 'Scope filter; all by default.' } }, async (args, exec) => {
    const current = await context(exec), scanned = scan(current), files = scanned.allFiles.filter(item => !args?.scope || args.scope === 'all' || item.scope === args.scope)
    return { files: files.map(item => ({ key: item.key, scope: item.scope, file: item.name, directory: item.directory, path: item.absPath, bytes: item.bytes, sha1: item.sourceSha1 || null, updatedAt: Math.round(item.mtimeMs), disabled: !isFileEnabled(item, current.disabled), active: isFileEnabled(item, current.disabled), readOnly: item.readOnly || false, shadowedBy: item.shadowedBy || null, archived: item.archived || false, status: item.status || 'active', kind: item.archived ? 'archive-marker' : 'memory', readStatus: item.readStatus })), counts: { total: files.length, global: files.filter(item => item.scope === 'global').length, workspace: files.filter(item => item.scope === 'workspace').length }, paths: resolveMemoryDirectories({ home, cwd: current.cwd, workspaceDirs: current.cwd ? current.settings.workspaceMemoryDirs : [] }), root: current.root, warnings: scanned.warnings }
  })
  add('memory_read', 'Read one active memory file by filename/directory or inventory key. Root cwd comes from the shared resolver. Output reports source bytes and any truncation.', { scope, file, directory, key }, async (args, exec) => {
    const current = await context(exec), value = target(selected(args), current)
    const read = readMemoryFile({ paths, scope: value.scope, file: value.file, directory: value.directory, workspaceDir: current.cwd, workspaceDirs: current.settings.workspaceMemoryDirs, maxBytes: current.settings.toolReadMaxBytes })
    return { ...read, disabled: false, key: fileIdentity({ scope: value.scope, name: value.file, directory: value.directory }) }
  })
  add('memory_search', `Search active memory lines with case-insensitive literal matching. Default ${DEFAULT_DATA.policies.searchDefaultLimit} hits, maximum ${DEFAULT_DATA.policies.searchMaxLimit}; clipped excerpts are disclosed.`, { query: { type: 'string', required: true, description: 'Literal search text.' }, limit: { type: 'integer', description: 'Requested maximum hits.' } }, async (args, exec) => {
    const current = await context(exec), query = String(args?.query || '').trim(), policy = DEFAULT_DATA.policies
    if (query.length < policy.searchMinQueryChars) throw new Error('Query must contain at least ' + policy.searchMinQueryChars + ' characters.')
    const maximum = Math.max(1, Math.min(policy.searchMaxLimit, Number.isSafeInteger(args.limit) ? args.limit : policy.searchDefaultLimit)), hits = [], scanned = scan(current)
    let matchingLines = 0
    for (const item of scanned.allFiles.filter(value => isFileEnabled(value, current.disabled) && typeof value.content === 'string')) {
      const lines = item.content.split('\n')
      for (let index = 0; index < lines.length; index++) if (lines[index].toLowerCase().includes(query.toLowerCase())) {
        matchingLines++
        if (hits.length < maximum) hits.push({ key: item.key, scope: item.scope, file: item.name, directory: item.directory, line: index + 1, text: lines[index].trim().slice(0, policy.searchLineMaxChars), truncated: lines[index].trim().length > policy.searchLineMaxChars })
      }
    }
    return { query, hits, total: matchingLines, omittedHits: matchingLines - hits.length, warnings: scanned.warnings }
  })
  add('memory_write', 'Preview a complete memory replacement first. Only a verified root may apply after explicit user confirmation, with the returned previewToken. Workspace writes use .dsh/memory; legacy sources are read-only and copied on write. Before hashes are enforced; history is retained.', { scope, file, directory, key, content: { type: 'string', required: true, description: 'Whole proposed UTF-8 content within the visible write limit.' }, apply: { type: 'boolean', description: 'False/omitted previews only; true requires confirmed previewToken.' }, previewToken }, async (args, exec) => {
    const current = await context(exec, true), value = target(selected(args), current, true), content = args?.content
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > current.settings.toolWriteMaxBytes) throw new Error('Content exceeds its published write limit or is not text.')
    const before = beforeTarget(value.sourcePath || value.targetPath, current.settings.toolReadMaxBytes), token = preview('memory-write', current, value.targetPath, before, content), result = { scope: value.scope, file: value.file, directory: value.directory, path: value.targetPath, applied: false, changed: before.content !== content || !before.exists, bytesBefore: before.bytes, bytesAfter: Buffer.byteLength(content, 'utf8'), diff: simpleDiff(before.content, content), previewToken: token }
    if (!args.apply || !result.changed) return result
    if (args.previewToken !== token) throw new Error('Write preview is missing/stale or its actor/target/content changed; inspect a new diff.')
    const runId = 'tool-' + randomUUID();stageChange({ paths, runId, now: Date.now(), scope: value.scope, file: value.file, directory: value.directory, workspaceDir: current.cwd, workspaceDirs: current.settings.workspaceMemoryDirs, settings: current.settings, actor: current.id, content, reason: 'Explicit root memory_write apply after preview confirmation.', evidence: 'Root user confirmed the exact target/content diff.' })
    const committed = commitStage({ paths, runId, now: Date.now(), workspaceDirs: current.settings.workspaceMemoryDirs, settings: current.settings })
    return { ...result, applied: true, backup: committed.applied[0]?.backup || null, transactionId: committed.transactionId, warnings: committed.warnings }
  })
  add('memory_delete', 'Preview archive-and-remove first. Root-only application requires explicit user confirmation and its exact previewToken. Files are archived, not silently deleted. Legacy workspace sources stay untouched; a .dsh/memory shadow suppresses archived names.', { scope, file, directory, key, apply: { type: 'boolean', description: 'Apply the confirmed preview; otherwise read-only.' }, previewToken }, async (args, exec) => {
    const current = await context(exec, true), value = target(selected(args), current, true), before = beforeTarget(value.sourcePath || value.targetPath, current.settings.toolReadMaxBytes), token = preview('memory-delete', current, value.targetPath, before, null)
    const result = { scope: value.scope, file: value.file, directory: value.directory, path: value.targetPath, exists: before.exists, applied: false, bytesBefore: before.bytes, previewToken: token, diff: simpleDiff(before.content, '') }
    if (!args.apply || !before.exists) return result
    if (args.previewToken !== token) throw new Error('Archive preview is missing/stale; inspect the current target first.')
    const runId = 'tool-' + randomUUID();stageChange({ paths, runId, now: Date.now(), scope: value.scope, file: value.file, directory: value.directory, workspaceDir: current.cwd, workspaceDirs: current.settings.workspaceMemoryDirs, settings: current.settings, actor: current.id, content: null, reason: 'Explicit root memory_delete apply after preview confirmation.', evidence: 'Root user confirmed archive-and-remove.' })
    const committed = commitStage({ paths, runId, now: Date.now(), workspaceDirs: current.settings.workspaceMemoryDirs, settings: current.settings })
    return { ...result, applied: true, archivedTo: committed.archived[0]?.archivedTo || null, transactionId: committed.transactionId }
  })
  function instructionPath(selectedScope, current) {
    if (selectedScope !== 'global' && selectedScope !== 'workspace') throw new Error('Unknown instruction scope.')
    if (selectedScope === 'workspace' && (!current.cwd || !isAbsolute(current.cwd) || resolve(current.cwd) === parse(resolve(current.cwd)).root)) throw new Error('Verified non-drive-root workspace is unavailable; private instruction target is unknown.')
    return selectedScope === 'global' ? join(home, DEFAULT_DATA.storage.globalInstructionFile) : join(current.cwd, DEFAULT_DATA.storage.workspaceInstructionFile)
  }
  async function nativeWarning(exec, content) {
    let facts
    try { facts = await options.getNativeInstructionFacts?.(exec) } catch {}
    const maxBytes = facts?.value?.maxBytes
    return Number.isFinite(maxBytes) ? Buffer.byteLength(content, 'utf8') > maxBytes ? ['Source text exceeds the native formatted-batch budget ' + maxBytes + '; actual admission/truncation remains evidence-dependent.'] : [] : ['Native maxBytes/admission evidence is unavailable; this write does not claim the instructions were loaded.']
  }
  add('agentsmd_read', 'Read Memory-owned global or private workspace instruction target. This is file-read evidence, not proof the native loader admitted it.', { scope }, async (args, exec) => {
    const current = await context(exec), selectedScope = args?.scope || 'global', path = instructionPath(selectedScope, current)
    return { scope: selectedScope, ...readUtf8Bounded(path, current.settings.toolReadMaxBytes), admission: 'unknown' }
  })
  add('agentsmd_write', 'Preview global/private instruction text first; never write the tracked workspace instruction file. Root-only apply requires explicit user confirmation and exact previewToken; native loader overflow is a warning, not a fabricated loaded badge.', { scope, content: { type: 'string', required: true, description: 'Complete UTF-8 instruction text within the visible write limit.' }, apply: { type: 'boolean', description: 'Apply a confirmed preview; omitted/false is read-only.' }, previewToken }, async (args, exec) => {
    const current = await context(exec, true), selectedScope = args?.scope || 'global', path = instructionPath(selectedScope, current), content = args?.content
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > current.settings.toolWriteMaxBytes) throw new Error('Instruction text exceeds the published write limit or is not text.')
    const before = beforeTarget(path, current.settings.toolReadMaxBytes), token = preview('instruction-write', current, path, before, content), warnings = await nativeWarning(exec, content)
    const result = { scope: selectedScope, path, applied: false, changed: before.content !== content || !before.exists, bytesBefore: before.bytes, bytesAfter: Buffer.byteLength(content, 'utf8'), diff: simpleDiff(before.content, content), previewToken: token, warnings, nativeAdmission: 'unknown' }
    if (!args.apply || !result.changed) return result
    if (args.previewToken !== token) throw new Error('Instruction preview is missing/stale; inspect the current target first.')
    return withMutationLock(paths, () => {
      const fresh = beforeTarget(path, current.settings.toolReadMaxBytes)
      if (preview('instruction-write', current, path, fresh, content) !== token) throw new Error('Instruction source changed before apply.')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID(), backup = fresh.exists ? join(paths.historyRoot, stamp, 'instructions-' + selectedScope, selectedScope === 'global' ? DEFAULT_DATA.storage.globalInstructionFile : DEFAULT_DATA.storage.workspaceInstructionFile) : null
      if (backup) { mkdirSync(dirname(backup), { recursive: true });copyFileSync(path, backup) }
      mkdirSync(dirname(path), { recursive: true });const temporary = path + '.' + randomUUID() + '.tmp';writeFileSync(temporary, content, 'utf8');renameSync(temporary, path)
      mkdirSync(paths.historyRoot, { recursive: true });writeFileSync(join(paths.historyRoot, 'changes.jsonl'), JSON.stringify({ at: Date.now(), kind: 'agentsmd-write', scope: selectedScope, path, backup, bytesBefore: fresh.bytes, bytesAfter: result.bytesAfter, sha1After: sha1(content) }) + '\n', { flag: 'a' })
      return { ...result, applied: true, backup }
    })
  })
  add('memory_candidate', 'Propose an untrusted memory candidate instead of writing accepted memory. Resident/card can inventory and inspect it. Origin and resolved workspace provenance are retained; proposal content is never auto-accepted.', { text: { type: 'string', required: true, description: 'Proposal plus concrete evidence within the candidate body limit.' }, scope: { type: 'string', enum: ['global', 'workspace'], description: 'Intended scope; global by default.' } }, async (args, exec) => {
    const decoded = sessionHeaderFacts(exec?.agent?.session?.header), id = exec?.agent?.id || decoded.value.sessionId, value = settings(), text = args?.text
    if (!id || typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > value.candidateMaxBytes) throw new Error('Candidate requires known origin and nonempty bounded text.')
    let root = { resolved: false, cwd: null, rootSessionId: id, reason: 'Shared root unavailable.' }
    try { if (options.resolveRoot) root = await options.resolveRoot(id, exec);else { const family = ctx.get(FAMILY_SERVICE);if (family?.resolveRoot) root = await family.resolveRoot(id) } } catch {}
    const selectedScope = args.scope || 'global'
    if (!['global', 'workspace'].includes(selectedScope)) throw new Error('Unknown candidate scope.')
    const sessionFolder = createHash('sha256').update(id).digest('hex'), directory = join(paths.candidateRoot, sessionFolder), path = join(directory, new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.md')
    const metadata = { scope: selectedScope, session: id, rootSessionId: root.rootSessionId, workspaceDir: root.resolved ? root.cwd : null, originResolved: root.resolved === true, createdAt: new Date().toISOString(), status: 'proposed' }
    const content = '---\n' + Object.entries(metadata).map(([field, entry]) => field + ': ' + JSON.stringify(entry)).join('\n') + '\n---\n\n' + text + '\n'
    mkdirSync(directory, { recursive: true });writeFileSync(path, content, 'utf8')
    return { path, scope: selectedScope, bytes: Buffer.byteLength(content, 'utf8'), proposed: true, accepted: false, workspaceDir: metadata.workspaceDir, originResolved: metadata.originResolved }
  })
  const disposers = []
  try { for (const definition of definitions) { const release = tools.register(definition);if (typeof release === 'function') disposers.push(release) } }
  catch (error) { for (const release of disposers.reverse()) release();throw error }
  return () => { for (const release of disposers.splice(0).reverse()) release() }
}
