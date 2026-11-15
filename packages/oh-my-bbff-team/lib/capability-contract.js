// Capability blacklists consume the inspected native directory and family ownership.
// This is package capability data, never a role -> tool-name routing table.
import { NATIVE_TOOL_EFFECTS, reservedTool } from './dsh-adapter.js'
export const DENY_CAPABILITIES = Object.freeze(['write', 'execute', 'delegate', 'web'])
const EXECUTION_PACKAGES = new Set([
  '@deepseek-ai/dsh-tool-bash', '@deepseek-ai/dsh-tool-bash-persistent',
  '@deepseek-ai/dsh-tool-pwsh', '@deepseek-ai/dsh-tool-pwsh-persistent',
  '@deepseek-ai/dsh-tool-terminal', '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/dsh-plugin-market',
])
const WEB_PACKAGES = new Set(['@deepseek-ai/dsh-tool-web'])
const nativeRowsByName = new Map()
for (const row of NATIVE_TOOL_EFFECTS) for (const name of row.names || []) {
  const values = nativeRowsByName.get(name) || []; values.push(row); nativeRowsByName.set(name, values)
}
export function capabilityFacts(name, { family, snapshot } = {}) {
  if (reservedTool(name)) return { managed: false, reserved: true, capabilities: [], basis: 'reserved transport; evaluate terminal capabilities' }
  let directory = snapshot
  try { directory ||= family?.catalog?.snapshot?.() } catch {}
  const entry = directory?.entries?.find(row => row.kind === 'tool' && row.name === name)
  let descriptor
  try { descriptor = family?.list?.().find(row => row.compatible !== false && row.tools?.includes(name)) } catch {}
  const rows = nativeRowsByName.get(name) || []
  const owner = entry?.owner?.kind
  // A positively attributed external/MCP owner wins over a same-name native hint.
  const managed = owner === 'dsh' || owner === 'bbff' || !!descriptor || ((!owner || owner === 'unknown') && rows.length > 0)
  if (!managed) return { managed: false, capabilities: [], basis: owner ? 'external catalog owner: ' + owner : 'no native/family ownership evidence' }
  const capabilities = new Set(), owners = new Set()
  if (owner === 'dsh' || (!descriptor && (!owner || owner === 'unknown'))) for (const row of rows) {
    owners.add(row.ownerPackage)
    if (['write', 'delegate'].includes(row.effect)) capabilities.add(row.effect)
    if (EXECUTION_PACKAGES.has(row.ownerPackage) && row.effect !== 'read') capabilities.add('execute')
    if (WEB_PACKAGES.has(row.ownerPackage)) capabilities.add('web')
  }
  const trait = descriptor?.toolTraits?.[name]
  if (trait?.effect && ['write', 'delegate'].includes(trait.effect)) capabilities.add(trait.effect)
  if (entry?.effect && ['write', 'delegate'].includes(entry.effect)) capabilities.add(entry.effect)
  // Future additive descriptors/catalog rows can declare finer capability facts.
  for (const value of [...(trait?.capabilities || []), ...(entry?.capabilities || [])]) if (DENY_CAPABILITIES.includes(value)) capabilities.add(value)
  return { managed: true, owner: owner || (descriptor ? 'bbff' : 'dsh'), capabilities: [...capabilities], ownerPackages: [...owners], basis: descriptor ? 'compatible family descriptor and current catalog' : 'inspected NATIVE_TOOL_EFFECTS + current catalog ownership' }
}
export function roleCapabilityDenies(role) {
  const values = new Set(role?.tools?.denyEffects || [])
  if (role?.readOnly) for (const value of ['write', 'execute', 'delegate']) values.add(value)
  if (role?.delegation?.mode === 'none') values.add('delegate')
  return [...values]
}
export function expandedCapabilityBlacklist(role, names, context = {}) {
  const denied = new Set(roleCapabilityDenies(role))
  return [...new Set(names)].flatMap(name => {
    const facts = capabilityFacts(name, context), matches = facts.capabilities.filter(value => denied.has(value))
    return facts.managed && matches.length ? [{ name, denyEffects: matches, facts }] : []
  })
}
/** Only verified bundled/native locations or explicit family ownership are auto-managed.
 * User/project/custom skills (including a user shadow of a bundled name) stay user-owned.
 */
export function managedSkillFacts(summary) {
  if (!summary) return { managed: false, basis: 'unobserved skill' }
  if (['dsh', 'bbff'].includes(summary.owner?.kind)) return { managed: true, basis: 'catalog ownership: ' + summary.owner.kind }
  const source = summary.skillSource || summary.source
  if (source === 'bundled') return { managed: true, basis: 'native bundled source' }
  const locations = [summary.path, summary.resourceBase?.kind === 'directory' ? summary.resourceBase.path : null].filter(value => typeof value === 'string').map(value => value.replaceAll('\\', '/'))
  if (locations.some(value => /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:@deepseek-ai\/dsh-[^/]+|oh-my-bbff-[^/]+)\//.test(value))) return { managed: true, basis: 'installed DSH/BBFF package resource path' }
  return { managed: false, basis: 'user/project/custom or unverified source; no automatic default restriction' }
}
