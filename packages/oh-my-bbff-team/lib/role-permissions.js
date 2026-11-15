// Permission policy composes user filters with descriptive family/adapter facts.
import { nativeToolTrait, nativeToolGroup, parseMcpToolName, reservedTool } from './dsh-adapter.js'
import { TEAM_TOOL_EFFECTS, TEAM_DELEGATION_CONTROLS, TEAM_ROOT_ONLY_TOOLS } from './tool-contract.js'
import { normalizeTeamSettings } from './team-settings.js'
import { capabilityFacts, roleCapabilityDenies } from './capability-contract.js'
export function effectFacts(name,family,known={}) {
  const effects=new Set(),sources=[],diagnostics=[]
  if(TEAM_TOOL_EFFECTS[name]) { effects.add(TEAM_TOOL_EFFECTS[name]);sources.push('Team tool contract') }
  try {
    for(const descriptor of known.descriptors || family?.list?.() || []) {
      if(!descriptor.compatible)continue
      const trait=descriptor.toolTraits?.[name]
      if(trait) { effects.add(trait.effect);sources.push(descriptor.title) }
    }
    const snapshot=known.snapshot || family?.catalog?.snapshot?.()
    const entry=known.toolEntries ? known.toolEntries.get(name) : snapshot?.entries?.find(item=>item.kind==='tool'&&item.name===name)
    if(entry?.effect) { effects.add(entry.effect);sources.push(entry.effectBasis?.source || 'Family catalog') }
  } catch(error) { diagnostics.push({code:'family-traits',reason:String(error?.message||error)}) }
  if(!effects.size) {
    const native=nativeToolTrait(name)
    if(native.value.effect)effects.add(native.value.effect)
    sources.push(native.value.reason);diagnostics.push(...native.diagnostics)
  }
  if(effects.size>1)diagnostics.push({code:'conflicting-tool-traits',reason:'Multiple declared effects apply to '+name})
  return {effects:[...effects],sources,diagnostics}
}
export function delegationControls(role) {
  const names=[...nativeToolGroup('delegate').value,...TEAM_DELEGATION_CONTROLS]
  return role?.delegation?.mode==='none'?names:names.filter(name=>name!=='bbff_team_dispatch')
}
export function mcpAttribution(name,family,hints=[]) {
  try { if(family?.catalog?.attributeTool)return family.catalog.attributeTool(name,{serverHints:hints}) }
  catch(error) { return {server:null,candidates:[],ambiguous:false,diagnostics:[{code:'mcp-attribution',reason:String(error?.message||error)}]} }
  const parsed=parseMcpToolName(name,[],hints)
  return parsed.value || {server:null,candidates:[],ambiguous:false,diagnostics:parsed.diagnostics}
}
export function serverDenied(role,server) {
  const filter=role?.mcp || {}
  if(Array.isArray(filter.deny)&&filter.deny.includes(server))return `role "${role.id}" denies MCP server ${server}`
  if(Array.isArray(filter.allow)&&!filter.allow.includes(server))return `role "${role.id}" only allows MCP servers: ${filter.allow.join(', ')}`
  return null
}
export function roleToolDenied(role,toolName,{family,settings={},onDiagnostic=()=>{}}={}) {
  if(!role)return null
  const name=String(toolName||'')
  if(reservedTool(name))return null // transport only; terminal calls retain the guard.
  if(TEAM_ROOT_ONLY_TOOLS.includes(name))return 'Team administration and activity tools are root-session only'
  if(delegationControls(role).includes(name))return `role "${role.id}" may not use ${name} (delegation policy: ${role.delegation?.mode || 'none'})`
  const filter=role.tools || {}
  if(Array.isArray(filter.deny)&&filter.deny.includes(name))return `role "${role.id}" denies ${name}`
  const capability=capabilityFacts(name,{family}),blacklist=roleCapabilityDenies(role)
  const deniedCapabilities=capability.managed?capability.capabilities.filter(effect=>blacklist.includes(effect)):[]
  if(deniedCapabilities.length)return `role "${role.id}" ${role.readOnly?'is read-only; ':''}denies native capabilities ${deniedCapabilities.join('/')} for ${name}`
  if(role.readOnly && capability.managed) {
    const facts=effectFacts(name,family)
    for(const diagnostic of facts.diagnostics)onDiagnostic({...diagnostic,tool:name})
    if(!facts.effects.length && normalizeTeamSettings(settings).unknownToolEffect==='deny')return `role "${role.id}" rejects unknown native tool effect for ${name} (settings.unknownToolEffect)`
  }
  // Legacy explicit user allow-lists remain authoritative. New defaults and UI
  // use blacklists only; no absent third-party name is denied automatically.
  if(Array.isArray(filter.allow)&&!filter.allow.includes(name))return `role "${role.id}" only allows: ${filter.allow.join(', ')}`
  const attribution=mcpAttribution(name,family,[...(role.mcp?.allow||[]),...(role.mcp?.deny||[])])
  for(const diagnostic of attribution.diagnostics||[])onDiagnostic({...diagnostic,tool:name})
  const candidates=[...new Set([attribution.server,...(attribution.candidates||[]).map(candidate=>candidate.server)].filter(Boolean))]
  for(const server of candidates) { const reason=serverDenied(role,server);if(reason)return reason }
  return null
}
