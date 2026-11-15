/** One Memory directory/identity contract for scanning, tools and dreaming. */
import { isAbsolute, resolve, join, relative, sep } from 'node:path'
import { DEFAULT_DATA, SETTINGS_DEFINITIONS } from './defaults.js'

// Owned storage, not a configurable legacy write target. Saved read directories stay intact.
export const WORKSPACE_MEMORY_DIRECTORY = '.dsh/memory'
// Same-name tombstone: one transaction target; no separate overlay/sidecar consistency state.
const WORKSPACE_ARCHIVE_PREFIX = '---\nbbffMemory: archived-workspace-file-v1\nstatus: archived\n'
export const WORKSPACE_ARCHIVE_HEADER_BYTES = Buffer.byteLength(WORKSPACE_ARCHIVE_PREFIX, 'utf8') + (WORKSPACE_ARCHIVE_PREFIX.match(/\n/g) || []).length + 3
export const WORKSPACE_ARCHIVE_STATUS = 'archived (shadows legacy file)'
export function isWorkspaceArchive(content) { return typeof content === 'string' && content.slice(0, WORKSPACE_ARCHIVE_HEADER_BYTES).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').startsWith(WORKSPACE_ARCHIVE_PREFIX) }
export function workspaceArchiveMarker({ legacyPaths, at, actor }) {
  const date = new Date(at).toISOString(), who = String(actor || 'Memory transaction')
  return WORKSPACE_ARCHIVE_PREFIX + 'archivedAt: ' + JSON.stringify(date) + '\narchivedBy: ' + JSON.stringify(who) + '\nshadows: ' + JSON.stringify(legacyPaths) + '\n---\n\n# Archived workspace memory (shadows legacy file)\n\nThis is a DSH archive marker, not a memory entry. Do not inject, route, search, or rewrite it as memory.\n\nArchived on ' + date + ' by ' + who + '.\n\nIt shadows these read-only legacy sources:\n' + legacyPaths.map(path => '- `' + path + '`').join('\n') + '\n\nDeleting this tombstone restores the legacy file to the active read view; the legacy bytes were never changed.\n'
}
export function workspaceReadDirectories(values = SETTINGS_DEFINITIONS.workspaceMemoryDirs.default) {
  return [...new Set([WORKSPACE_MEMORY_DIRECTORY, ...values.map(value => value.trim().replace(/\\/g, '/').replace(/\/+$/, '') || '.')])]
}
export function validWorkspaceMemoryDirectory(value) {
  if (typeof value !== 'string' || !value.trim() || isAbsolute(value) || /^[\\/]/.test(value) || value.includes(':')) return false
  return !value.replace(/\\/g, '/').split('/').some(part => part === '..')
}
export function resolveMemoryDirectories({ home, cwd, workspaceDirs = SETTINGS_DEFINITIONS.workspaceMemoryDirs.default }) {
  if (typeof home !== 'string' || !isAbsolute(home)) throw new Error('Memory home must be absolute.')
  const globalDir = resolve(home, DEFAULT_DATA.storage.globalMemoryDirectory)
  if (workspaceDirs.length && (typeof cwd !== 'string' || !isAbsolute(cwd))) throw new Error('Workspace memory requires a resolved absolute root cwd.')
  const directories = []
  for (const candidate of workspaceDirs) if (!validWorkspaceMemoryDirectory(candidate)) throw new Error('Workspace memory directories must remain relative to the workspace: ' + String(candidate))
  for (const label of typeof cwd === 'string' && isAbsolute(cwd) ? workspaceReadDirectories(workspaceDirs) : []) {
    const path = resolve(cwd, label), inside = relative(resolve(cwd), path)
    if (isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)) throw new Error('Memory directory escapes workspace')
    if (!directories.some(row => row.path === path)) directories.push({ path, directory: label, readOnly: label !== WORKSPACE_MEMORY_DIRECTORY })
  }
  return { globalDir, workspaceDirs: directories, writeDirectory: directories[0]?.path || null, globalPath: globalDir, settingsPath: join(home, DEFAULT_DATA.storage.settingsDirectory, 'settings.json') }
}
/** Name precedence is resolved BEFORE activation, so a disabled winner cannot resurrect a shadow. */
export function markWorkspaceShadows(files) {
  const names = new Map()
  return files.map(file => {
    if (file.scope !== 'workspace') return file
    const name = file.name || file.file, identity = process.platform === 'win32' ? name.toLowerCase() : name
    const prior = names.get(identity), key = file.key || fileIdentity({ scope: file.scope, name, directory: file.directory })
    const row = { ...file, readOnly: file.directory !== WORKSPACE_MEMORY_DIRECTORY, archived: file.archived === true || (file.directory === WORKSPACE_MEMORY_DIRECTORY && isWorkspaceArchive(file.content)), shadowedBy: prior || null }
    row.status = row.archived ? WORKSPACE_ARCHIVE_STATUS : row.shadowedBy ? 'shadowed' : row.readStatus === 'failed' ? 'read-failed' : 'active'
    if (!prior) names.set(identity, key)
    return row
  })
}
/** Directory-qualified workspace keys retain source provenance, including shadowed legacy rows. */
export function fileIdentity({ scope, name, directory }) {
  return scope === 'workspace' && directory ? `workspace:${String(directory).replace(/\\/g, '/')}/${name}` : `${scope}:${name}`
}
export function sameMemoryFile(left, right) {
  return left.scope === right.scope && left.name === right.name && (left.absPath ? left.absPath === right.absPath : (left.directory || '') === (right.directory || ''))
}
