import path from 'node:path'
import { TOOL_NAME_PATTERN, MCP_SERVER_NAME_PATTERN, SKILL_NAME_PATTERN, resourceServerArgument, skillNameArgument, serverFromMcpSectionName, parseResourceSection, rewriteResourceSection, MCP_RESOURCE_SECTION_NAME } from './dsh-adapter.js'
import { msg } from './bbff-contract.js'

export const KINDS = ['mcp', 'tool', 'skill']
/** A user-visible failure carries a locale message ref; the API answers with it. */
const fail = (key, params) => { const error = new Error(key); error.bbffRef = msg(key, params); throw error }
export function normalizePath(value, platform = process.platform) {
  if (typeof value !== 'string' || !value.trim()) return null
  const api = platform === 'win32' ? path.win32 : path.posix, raw = value.trim()
  if (!api.isAbsolute(raw) || platform === 'win32' && !/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(raw)) return null
  const resolved = api.resolve(raw)
  let normalized = resolved === api.parse(resolved).root ? resolved : resolved.replace(platform === 'win32' ? /[\\/]+$/ : /\/+$/, '')
  if (!normalized) normalized = api.sep
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}
export function workspaceMatches(cwd, workspace, platform = process.platform) {
  const current = normalizePath(cwd, platform), allowed = normalizePath(workspace, platform)
  if (!current || !allowed) return false
  const sep = platform === 'win32' ? '\\' : '/'
  return current === allowed || current.startsWith(allowed.endsWith(sep) ? allowed : allowed + sep)
}
export function validateRule(raw, platform = process.platform) {
  if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind)) fail('error.ruleKind')
  if (typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id)) fail('error.ruleId')
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 256) fail('error.ruleName')
  if (raw.kind === 'skill' && !SKILL_NAME_PATTERN.test(raw.name)) fail('error.ruleSkillName')
  if (!Array.isArray(raw.workspaces) || raw.workspaces.length > 200) fail('error.ruleWorkspaces')
  const workspaces = [...new Set(raw.workspaces.map(value => { const normalized = normalizePath(value, platform); if (!normalized) fail('error.ruleWorkspacePath'); return normalized }))]
  if (raw.note !== undefined && (typeof raw.note !== 'string' || raw.note.length > 2000)) fail('error.ruleNote')
  return { id: raw.id, kind: raw.kind, name: raw.name.trim(), workspaces, ...(raw.note ? { note: raw.note } : {}) }
}
export function validateDocument(doc, platform = process.platform) {
  if (!doc || doc.version !== 1 || !Array.isArray(doc.rules) || doc.rules.length > 2000) fail('error.rulesDocument')
  const rules = doc.rules.map(rule => validateRule(rule, platform)), ids = new Set(), names = new Set()
  for (const rule of rules) { const key = rule.kind + '\0' + rule.name; if (ids.has(rule.id) || names.has(key)) fail('error.rulesDuplicate'); ids.add(rule.id); names.add(key) }
  return { version: 1, rules }
}
export function validateRuleTarget(rule, knownServers = []) {
  const name = rule.name
  let reason
  if (rule.kind === 'tool' && !TOOL_NAME_PATTERN.test(name)) reason = msg('reason.invalidToolName')
  if (rule.kind === 'mcp' && !MCP_SERVER_NAME_PATTERN.test(name)) reason = msg('reason.invalidMcpName')
  if (rule.kind === 'tool' && knownServers.includes(name)) reason = msg('reason.knownServerName')
  if (rule.kind === 'skill' && !SKILL_NAME_PATTERN.test(name)) reason = msg('reason.invalidSkillName')
  if (reason) { const error = new Error('invalid rule target'); error.code = 'SCOPE_INVALID_TARGET'; error.bbffRef = reason; throw error }
}
export function hiddenRules(rules, cwd, platform = process.platform) {
  if (!normalizePath(cwd, platform)) return []
  return rules.filter(rule => rule.workspaces.length > 0 && !rule.workspaces.some(workspace => workspaceMatches(cwd, workspace, platform)))
}
export const reasonFor = rule => msg('reason.ruleHidden', { name: rule.name, workspaces: rule.workspaces.join(', '), id: rule.id })
export function ruleForTool(rules, name, args, attributeTool) {
  const attribution = attributeTool(name, rules.filter(rule => rule.kind === 'mcp').map(rule => rule.name))
  const servers = attribution.candidates?.length ? attribution.candidates.map(candidate => candidate.server) : attribution.server ? [attribution.server] : []
  const resource = resourceServerArgument(name, args), skill = skillNameArgument(name, args)
  return rules.find(rule => rule.kind === 'tool' && rule.name === name
    || rule.kind === 'mcp' && (servers.includes(rule.name) || resource === rule.name)
    || rule.kind === 'skill' && skill === rule.name)
}
export function annotationsFor(rules, items, attributeTool) {
  return (items || []).flatMap(item => {
    const rule = item.kind === 'tool' ? ruleForTool(rules, item.name, undefined, attributeTool) : rules.find(rule => rule.kind === item.kind && rule.name === item.name)
    if (!rule) return []
    return [{ kind: item.kind, name: item.name, available: false, reason: reasonFor(rule), by: 'scope' }]
  })
}
// DSH0.2.2 presents sections/contexts/variables here, never tool declarations.
// Tool restrictions and execution guards are installed on the native registry.
export function filterAssembly(assembly, rules, recordAdapter = result => result.value, hideAll = false, canLimitServer = () => true) {
  const servers = rules.filter(rule => rule.kind === 'mcp').map(rule => rule.name)
  return { contexts: assembly.contexts, variables: assembly.variables, sections: assembly.sections.flatMap(section => {
    const server = recordAdapter(serverFromMcpSectionName(section.name))
    if (server && (hideAll && canLimitServer(server) || servers.includes(server))) return []
    if (section.name !== MCP_RESOURCE_SECTION_NAME) return [section]
    const hiddenServers = hideAll ? [...new Set([...servers, ...(recordAdapter(parseResourceSection(section)) || []).filter(canLimitServer)])] : servers
    const result = recordAdapter(rewriteResourceSection(section, hiddenServers))
    return result === null ? [] : [{ ...section, ...result }]
  }) }
}
