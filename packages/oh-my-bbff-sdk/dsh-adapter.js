/** Oh-My-BBFF v1.6 DSH convention adapter. Pure data in/out; no runtime I/O or service calls. */
export const DSH_ADAPTER_CONTRACT = 1
export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
export const MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item)
    Object.freeze(value)
  }
  return value
}
const object = value => !!value && typeof value === 'object' && !Array.isArray(value)
const string = value => typeof value === 'string'
const nonnegative = value => Number.isFinite(value) && value >= 0
const positive = value => Number.isFinite(value) && value > 0
const unique = values => [...new Set(values)]
const sorted = values => unique(values).sort((a,b) => a < b ? -1 : a > b ? 1 : 0)
/** Locale namespace owning this adapter's dictionaries (locale/*.json in the SDK). */
export const SDK_NAMESPACE = 'oh-my-bbff-sdk'
/** Marker field identifying a locale message reference: `{ $bbff: 'message', key, params?, ns? }`. */
export const MESSAGE_REF_MARKER = 'bbff-message'
/**
 * Build a locale message reference. Host code emits references, never text: the
 * client resolves `{key, params}` through the owning package's dictionary.
 * @param key - flat dictionary key inside the owning namespace's `ui` map.
 * @param params - `{name}` interpolation values.
 * @param ns - owning locale namespace (package name); omitted for same-package refs.
 */
export function msg(key, params, ns) {
  const value = { $bbff: MESSAGE_REF_MARKER, key: String(key) }
  if (object(params) && Object.keys(params).length) value.params = { ...params }
  if (string(ns) && ns) value.ns = ns
  return freeze(value)
}
/** True for a locale message reference produced by {@link msg}. */
export function isMessageRef(value) {
  return object(value) && value.$bbff === MESSAGE_REF_MARKER && string(value.key) && value.key !== ''
}
/** Attach the SDK namespace to a same-package reference (diagnostics are SDK-owned). */
const sdkRef = reference => isMessageRef(reference)
  ? (reference.ns ? reference : msg(reference.key, reference.params, SDK_NAMESPACE))
  : msg(reference, undefined, SDK_NAMESPACE)
const diag = (inference, reference) => freeze({ code: inference, inference, severity: 'warning', reason: sdkRef(reference) })
const result = (value, diagnostics = []) => freeze({ value, complete: diagnostics.length === 0, diagnostics })
const missing = (inference, reference) => [diag(inference, reference)]
export const MCP_RESOURCE_TOOL_NAMES = /* @__PURE__ */ Object.freeze(['list_mcp_resources','list_mcp_resource_templates','read_mcp_resource'])
export const MCP_RESOURCE_SECTION_NAME = 'mcp-resource-servers'
export const MCP_SECTION_ORDER_KEY = 'MCP_SERVERS'
export const SKILL_TOOL_NAME = 'skill'
export const DSH_PROJECTION_KEYS = /* @__PURE__ */ Object.freeze({ 'context-pressure': 'contextPressure', 'model-selection': 'modelSelection' })
const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client'
const RESERVED_TRANSPORT = 'run_code'
const RESOURCE_HEADING = '## MCP resource servers\n\n'
const RESOURCE_PREFIX = 'Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: '
const REMINDER_OPEN = '<system-reminder>'
const REMINDER_CLOSE = '</system-reminder>'
const validServers = values => sorted((Array.isArray(values) ? values : []).filter(value => string(value) && MCP_SERVER_NAME_PATTERN.test(value)))
export function parseMcpToolName(name, knownServers = [], serverHints = []) {
  if (!string(name) || !name.startsWith('mcp__')) return result(null)
  const matchRows = (values,basis) => validServers(values).filter(server => name.startsWith('mcp__' + server + '__') && name.length > server.length + 7).map(server => ({server,basis}))
  const known = matchRows(knownServers,'known').sort((a,b) => b.server.length-a.server.length || a.server.localeCompare(b.server))
  const hints = matchRows(serverHints,'hint').filter(row => !known.some(other => other.server === row.server)).sort((a,b) => b.server.length-a.server.length || a.server.localeCompare(b.server))
  const candidates = [...known,...hints]
  const selected = known[0] || hints[0]
  const diagnostics = []
  let server, basis, suffix
  if (selected) {
    ({server,basis} = selected); suffix = name.slice(('mcp__' + server + '__').length)
    if (basis === 'hint') diagnostics.push(diag('mcp-tool-name', msg("diag.mcp-tool-name.server-attribution-uses-an-unobserved-rule-namespace")))
  } else {
    const match = /^mcp__(.+?)__(.+)$/.exec(name)
    if (!match || !MCP_SERVER_NAME_PATTERN.test(match[1])) return result(null,missing('mcp-tool-name', msg("diag.mcp-tool-name.malformed-mcp-public-tool-name")))
    server = match[1]; suffix = match[2]; basis = 'fallback'
    diagnostics.push(diag('mcp-tool-name', msg("diag.mcp-tool-name.server-attribution-is-an-uncorroborated-naming-fallb")))
  }
  return result({server,suffix,basis,uncertain:basis !== 'known',candidates,ambiguous:unique(candidates.map(row=>row.server)).length > 1,diagnostics},diagnostics)
}
export function reservedTool(name) {
  return name === RESERVED_TRANSPORT ? freeze({reason:msg('diag.reserved-tool-transport', undefined, SDK_NAMESPACE)}) : undefined
}
export function mcpSectionName(server) {
  if (!string(server) || !MCP_SERVER_NAME_PATTERN.test(server)) throw new TypeError('Invalid MCP server identity')
  return 'mcp:' + server
}
export function serverFromMcpSectionName(name) {
  if (!string(name) || !name.startsWith('mcp:')) return result(null)
  const server = name.slice(4)
  return MCP_SERVER_NAME_PATTERN.test(server) ? result(server) : result(null,missing('mcp-section-name', msg("diag.mcp-section-name.malformed-mcp-section-identity")))
}
export function serversFromSections(evidence) {
  const names = [], diagnostics = []
  if (!Array.isArray(evidence)) return result([],missing('mcp-section-name', msg("diag.mcp-section-name.section-evidence-is-unavailable")))
  for (const view of evidence) {
    if (!view?.complete) diagnostics.push(diag('mcp-section-name', msg("diag.mcp-section-name.a-mask-free-section-view-is-incomplete")))
    if (!Array.isArray(view?.sections)) continue
    for (const section of view.sections) {
      const parsed = serverFromMcpSectionName(section?.name)
      if (parsed.value) names.push(parsed.value)
      diagnostics.push(...parsed.diagnostics)
    }
  }
  return result(sorted(names),diagnostics)
}
export function isMcpResourceTool(name) { return MCP_RESOURCE_TOOL_NAMES.includes(name) }
export function resourceServerArgument(name,args) { return isMcpResourceTool(name) && object(args) && string(args.server) ? args.server : undefined }
export function skillNameArgument(name,args) { return name === SKILL_TOOL_NAME && object(args) && string(args.name) ? args.name : undefined }
export function scanConfiguredServers(rows,{traversalComplete} = {}) {
  const servers = new Map(), diagnostics = []
  if (!traversalComplete || !Array.isArray(rows)) diagnostics.push(diag('configured-mcp', msg("diag.configured-mcp.configured-entry-traversal-is-incomplete")))
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.packageName !== MCP_CLIENT && row?.moduleName !== MCP_CLIENT) continue
    let name
    try { name = row.config?.serverName } catch {}
    if (!string(name) || !MCP_SERVER_NAME_PATTERN.test(name)) {
      diagnostics.push(diag('configured-mcp', msg("diag.configured-mcp.an-mcp-client-entry-has-no-readable"))); continue
    }
    const previous = servers.get(name)
    const states = [...(previous?.states || []),...(typeof row.enabled === 'boolean' ? [row.enabled] : [])]
    const sources = sorted([...(previous?.sources || []),...(string(row.source) ? [row.source] : [])])
    servers.set(name,{name,sources,states})
  }
  const value = [...servers.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(({name,sources,states}) => {
    const distinct = unique(states)
    if (distinct.length > 1) diagnostics.push(diag('configured-mcp', msg("diag.configured-mcp.repeated-server-configuration-has-conflicting-enable")))
    return {name,...(distinct.length === 1 ? {enabled:distinct[0]} : {}),sources}
  })
  return result(value,diagnostics)
}
export function parseResourceSection(section) {
  if (!section || (section.name === MCP_RESOURCE_SECTION_NAME && string(section.text) && !section.text.trim())) return result([])
  const diagnostics = () => missing('resource-section', msg("diag.resource-section.the-native-mcp-resource-section-envelope-cannot"))
  if (section.name !== MCP_RESOURCE_SECTION_NAME || !string(section.text) || !section.text.startsWith(RESOURCE_HEADING + RESOURCE_PREFIX) || section.text.length > 1048576) return result([],diagnostics())
  const body = section.text.slice((RESOURCE_HEADING + RESOURCE_PREFIX).length).trim()
  if (!body.endsWith('.')) return result([],diagnostics())
  try {
    const names = JSON.parse(body.slice(0,-1))
    if (!Array.isArray(names) || names.length > 20000 || names.some(name=>!string(name)||!MCP_SERVER_NAME_PATTERN.test(name))) return result([],diagnostics())
    return result(sorted(names))
  } catch { return result([],diagnostics()) }
}
export function rewriteResourceSection(section,hiddenServers) {
  if (!object(section) || !string(section.name) || !string(section.text)) return result(null,missing('resource-section', msg("diag.resource-section.resource-section-to-rewrite-is-unavailable")))
  const parsed = parseResourceSection(section)
  if (!parsed.complete) return result({name:section.name,text:section.text},parsed.diagnostics)
  const hidden = new Set(validServers(hiddenServers))
  const names = parsed.value.filter(name=>!hidden.has(name))
  if (names.length === parsed.value.length) return result({name:section.name,text:section.text})
  return result(names.length ? {name:MCP_RESOURCE_SECTION_NAME,text:RESOURCE_HEADING + RESOURCE_PREFIX + JSON.stringify(names) + '.'} : null)
}
export function auditRegistrationEvidence(effects,{traversalComplete,familyPackages = [],declaredFamilyPackages = []} = {}) {
  const family = new Set(familyPackages), declared = new Set(declaredFamilyPackages), thirdParty = [], undeclared = []
  let unknownRegistrations = 0, native = 0
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (effect?.label !== 'tools.register()') continue
    const pkg = effect.packageName
    if (!string(pkg) || !pkg) { unknownRegistrations++; continue }
    if (pkg.startsWith('@deepseek-ai/')) native++
    else if (family.has(pkg)) { if (!declared.has(pkg)) undeclared.push(pkg) }
    else thirdParty.push(pkg)
  }
  const diagnostics = traversalComplete ? [] : missing('registration-provenance', msg("diag.registration-provenance.registration-evidence-traversal-is-incomplete"))
  return result({nativeResidueProven:!!traversalComplete && native > 0 && !unknownRegistrations && !thirdParty.length && !undeclared.length,unknownRegistrations,thirdPartyPackages:sorted(thirdParty),undeclaredFamilyPackages:sorted(undeclared)},diagnostics)
}
export function unknownRestrictionNames(message) {
  const match = string(message) && /^tools\.restrict\(\) names unknown global tools?\s+(.+?); known global tools:/.exec(message)
  if (!match) return result(null,missing('restriction-error', msg("diag.restriction-error.unrecognized-restriction-error-no-names-were-guessed")))
  const names = [...match[1].matchAll(/"([A-Za-z0-9_-]{1,64})"/g)].map(row=>row[1])
  return names.length ? result(unique(names)) : result(null,missing('restriction-error', msg("diag.restriction-error.restriction-error-contained-no-valid-exact-names")))
}
export function projectionKey(kind) {
  if (!Object.hasOwn(DSH_PROJECTION_KEYS,kind)) throw new TypeError('Unknown projection convention')
  return DSH_PROJECTION_KEYS[kind]
}
const emptyPressure = () => ({usedTokens:null,windowTokens:null,percent:null,pressureTokens:null,basis:'unavailable',independentSlots:true})
export function contextPressureFacts(projection,{view} = {}) {
  const value = emptyPressure()
  if (projection === undefined || projection === null) return result(value)
  const invalid = () => result(value,missing('context-pressure', msg("diag.context-pressure.malformed-or-mismatched-context-pressure-view")))
  if (!object(projection) || !['state','wire'].includes(view)) return invalid()
  const keys = view === 'state' ? ['contextWindow','pressureTokens','surfaceTokens','sampledSurfaceTokens','claim'] : ['contextWindow','pressureTokens','projectedTokens']
  if (Object.keys(projection).some(key=>!keys.includes(key)) || (view === 'state' && !nonnegative(projection.surfaceTokens))) return invalid()
  for (const key of ['pressureTokens','sampledSurfaceTokens','projectedTokens']) if (projection[key] !== undefined && !nonnegative(projection[key])) return invalid()
  if (projection.contextWindow !== undefined && !positive(projection.contextWindow)) return invalid()
  let used, basis = 'unavailable'
  if (view === 'wire' && nonnegative(projection.projectedTokens)) { used = projection.projectedTokens; basis = 'projected' }
  else if (nonnegative(projection.pressureTokens)) {
    if (view === 'state' && nonnegative(projection.sampledSurfaceTokens)) { used = Math.max(0,projection.pressureTokens + projection.surfaceTokens - projection.sampledSurfaceTokens); basis = 'projected' }
    else { used = projection.pressureTokens; basis = 'last-request' }
  }
  const window = positive(projection.contextWindow) ? projection.contextWindow : null
  return result({usedTokens:used ?? null,windowTokens:window,percent:used === undefined || window === null ? null : Math.round(used/window*10000)/100,pressureTokens:projection.pressureTokens ?? null,basis,independentSlots:true})
}
export function assistantMessageFacts(input,{view} = {}) {
  let message
  if (view === 'message') message = input
  else if (view === 'event') {
    const event = input?.type === 'event' ? input.event : input
    if (event?.type !== 'assistant/message') return result(null)
    message = event.data?.message
  } else return result(null,missing('session-log-events', msg("diag.session-log-events.unknown-assistant-message-input-view")))
  if (!object(message)) return result(null,missing('session-log-events', msg("diag.session-log-events.assistant-message-payload-is-unavailable")))
  if (message.role !== 'assistant') return result(null)
  if (!Array.isArray(message.content)) return result(null,missing('session-log-events', msg("diag.session-log-events.assistant-content-is-not-a-block-array")))
  return result({text:message.content.filter(block=>block?.type === 'text' && string(block.text)).map(block=>block.text).join('\n').trim()})
}
export function modelSelectionFacts(projection,{view} = {}) {
  const value = {mutationSupport:'unverified'}
  if (projection === undefined || projection === null) return result(value)
  const invalid = () => result(value,missing('model-selection', msg("diag.model-selection.malformed-or-mismatched-model-selection-view")))
  if (!object(projection) || !['state','wire'].includes(view)) return invalid()
  const keys = view === 'state' ? ['lastUsed','pending'] : ['lastUsed','next']
  if (Object.keys(projection).some(key=>!keys.includes(key)) || keys.some(key=>!Object.hasOwn(projection,key))) return invalid()
  const validRoute = source => source === null || (object(source) && string(source.provider) && string(source.model) && (source.reasoningEffort === undefined || string(source.reasoningEffort)))
  if (keys.some(key=>!validRoute(projection[key]))) return invalid()
  const route = source => source && string(source.provider) && string(source.model) ? {provider:source.provider,model:source.model,...(string(source.reasoningEffort) ? {effort:source.reasoningEffort} : {})} : undefined
  if (view === 'state') {
    const pending = route(projection.pending), next = pending || route(projection.lastUsed)
    return result({...value,...(pending ? {pending} : {}),...(next ? {next} : {})})
  }
  const next = route(projection.next)
  return result({...value,...(next ? {next} : {})})
}

// Native-name evidence is descriptive. It grants no role entitlement and does not
// establish which same-name definition a particular scope currently resolves.
/** SDK0.1.10: complete reviewed native source coverage; factories have no tool identities. */
export const NATIVE_TOOL_EFFECTS = /* @__PURE__ */ freeze([
  {
    "kind": "tool",
    "names": [
      "propose_action"
    ],
    "naming": "literal",
    "conditions": [],
    "id": "@deepseek-ai/dsh-action-cards:propose_action",
    "effect": "read",
    "reason": "Shows the user one optional action card under the answer (constant PROPOSE_ACTION = 'propose_action'); presentation only, no workspace or durable-state mutation by the tool itself.",
    "ownerPackage": "@deepseek-ai/dsh-action-cards",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 321,
        "kind": "definition",
        "sha256": "556c6d1a579a07d3aac20a9cafe653e10649693d17e2e975baeb4fd9c697af8d"
      },
      {
        "file": "lib/index.js",
        "line": 321,
        "kind": "registration",
        "sha256": "c2a38d86bab0ccf95f40acc8bede627eb6c16d0c02b98559b10ae0b5b590fb88"
      },
      {
        "file": "lib/types/index.js",
        "line": 133,
        "kind": "definition",
        "sha256": "40820fb0b7c44f8159d2fbb1c84e4fc3fa09a3fd1c79cc1a3f5a4b91049a1fbf"
      },
      {
        "file": "lib/types/index.js",
        "line": 133,
        "kind": "registration",
        "sha256": "b6121fe20fe8dfdf524e6b6da6396251a81511c37e1c55cab39e150985c28e70"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-cordis-host-runner:caller",
    "kind": "factory",
    "ownerPackage": "@deepseek-ai/dsh-cordis-host-runner",
    "packageVersion": "0.2.2-rc.2",
    "names": [],
    "effect": "unknown",
    "reason": "Dynamic Cordis harness tool factory accepts caller-supplied name and execute body. The native registration bridge cannot determine that plugin-defined effect.",
    "naming": "caller",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 489,
        "kind": "definition",
        "sha256": "39beb3c00c343477a4f1bb98e00cd4bdafc6f0ac65ae9864ca340195cecaee02"
      },
      {
        "file": "lib/index.js",
        "line": 543,
        "kind": "registration",
        "sha256": "5f9024eeba4cefc836899e831ce17280db5ab8077c3e4c63eeaf44aa06afff4d"
      },
      {
        "file": "lib/types/guard.js",
        "line": 562,
        "kind": "registration",
        "sha256": "5f9024eeba4cefc836899e831ce17280db5ab8077c3e4c63eeaf44aa06afff4d"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "cua"
    ],
    "naming": "literal",
    "conditions": [],
    "id": "@deepseek-ai/dsh-cua:cua",
    "effect": "write",
    "reason": "Computer-use tool (const tool = { name: 'cua' }) that drives the desktop through a bridge; it can change external state and run actions, so it is a write capability.",
    "ownerPackage": "@deepseek-ai/dsh-cua",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 2119,
        "kind": "registration",
        "sha256": "ee9566c28112b5db91df957f2ef278d34eb61a770f0c736ebe7a6acea60ffa96"
      }
    ]
  },
  {
    "kind": "factory",
    "names": [],
    "naming": "caller",
    "conditions": [],
    "id": "@deepseek-ai/dsh-experimental-liveshare:caller",
    "effect": "unknown",
    "reason": "Live-share registers confined replacements that shadow an existing deployment tool under that tool's own name; the replacement's effect is the shadowed tool's, which the name alone cannot establish.",
    "ownerPackage": "@deepseek-ai/dsh-experimental-liveshare",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 3683,
        "kind": "registration",
        "sha256": "fcf14d66ea774aee95180664abd0132a6c35f36689defb537321335e752e7f20"
      },
      {
        "file": "lib/index.js",
        "line": 4004,
        "kind": "registration",
        "sha256": "02e2f3b48c38570b75c1fa14fc7a055e29c51f8415484d9f3a624118b3317c93"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-experimental-tool-worktree:create_worktree",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-experimental-tool-worktree",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "create_worktree"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 13,
        "kind": "definition",
        "sha256": "dd4ba209d46f394d29a88b6599fdd4dd89be6104cf7c9c579742ce66f0bfff75"
      },
      {
        "file": "lib/index.js",
        "line": 13,
        "kind": "registration",
        "sha256": "452971c770eaea1232a46c60f8d736ceea2b2e6ba6cdbd5ed05af99615009bf5"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-mcp-client:upstream",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-mcp-client",
    "packageVersion": "0.2.2-rc.2",
    "names": [],
    "effect": "unknown",
    "reason": "Dynamic MCP tool proxies execute upstream-provided definitions. Their effect is owned upstream and cannot be inferred from public name/schema alone.",
    "naming": "upstream",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 519,
        "kind": "registration",
        "sha256": "2b5af51eccc10f604be4ef19dc6147031cd128849645ebc79f54caec0ba69e6e"
      },
      {
        "file": "lib/types/tools.js",
        "line": 134,
        "kind": "registration",
        "sha256": "2b5af51eccc10f604be4ef19dc6147031cd128849645ebc79f54caec0ba69e6e"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-mcp-resources:list_mcp_resource_templates",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-mcp-resources",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "list_mcp_resource_templates"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-mcp-resources/lib/index.js:138-158",
        "reason": "Shared resource tools are registered while the scope has a resource provider."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 66,
        "kind": "definition",
        "sha256": "ff45dda67e90da31a3448821307175d2396a150d5c698f9501a06c5f8a29772b"
      },
      {
        "file": "lib/index.js",
        "line": 66,
        "kind": "registration",
        "sha256": "2a399f2e90ba5a08e5b0e84712feafde5b388ee734ddcaa9ff2a731146733f5e"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-mcp-resources:list_mcp_resources",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-mcp-resources",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "list_mcp_resources"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-mcp-resources/lib/index.js:138-158",
        "reason": "Shared resource tools are registered while the scope has a resource provider."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 55,
        "kind": "definition",
        "sha256": "39e668857e17cdc03ea14e9642a0c9c37e17181c3a5a76fd841ea8789af678b9"
      },
      {
        "file": "lib/index.js",
        "line": 55,
        "kind": "registration",
        "sha256": "fe823e36f38a0fbf04d679bb6158105922ba9a3b3ebed7053e225c45d39a190c"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-mcp-resources:read_mcp_resource",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-mcp-resources",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "read_mcp_resource"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-mcp-resources/lib/index.js:138-158",
        "reason": "Shared resource tools are registered while the scope has a resource provider."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 77,
        "kind": "definition",
        "sha256": "82b0a5a2910e92087c2112bf8ac8700632c2a68459f89e6f96f03899dcea318b"
      },
      {
        "file": "lib/index.js",
        "line": 77,
        "kind": "registration",
        "sha256": "45d0d4aaa324370096e930f4b866e49f3c13ed7ce46de55b03e65052a41adc65"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-plan-mode:exit_plan_mode",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-plan-mode",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "exit_plan_mode"
    ],
    "effect": "read",
    "reason": "Reviews a plan through the human question channel and may leave the same session plan mode. This is session-only interaction/control, classified read by the reviewed Lead ruling.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 238,
        "kind": "definition",
        "sha256": "9bffc20d6b2b2bcdaf924caddbfab443e635b79ccf6792b705d2e0cabb1c975f"
      },
      {
        "file": "lib/index.js",
        "line": 238,
        "kind": "registration",
        "sha256": "34c349ef5c656d5563d796faae153ba105cb121f1bb22ae4dae7c3c845911efc"
      },
      {
        "file": "lib/types/index.js",
        "line": 226,
        "kind": "definition",
        "sha256": "d815c3a5b389549ef97298885c94bacaac0ea32899f8292446cb2007f55f256c"
      },
      {
        "file": "lib/types/index.js",
        "line": 226,
        "kind": "registration",
        "sha256": "b555287df74a206bdc11a7bd02ff48ac2dea62182a7c95330b2842de667f50f5"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-plugin-manager:plugin_manager",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-plugin-manager",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "plugin_manager"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-web-app/presets/cordis.patch.yml:131-136",
        "reason": "Cordis preset management rows additionally require profileContext; this does not apply to the separate read-only Inspect tools."
      }
    ],
    "sites": [
      {
        "file": "lib/types/tools.js",
        "line": 76,
        "kind": "definition",
        "sha256": "0a523c321fa30372ecef596722ac70883e1e0384570f0b80a38a280f484110b4"
      },
      {
        "file": "lib/types/tools.js",
        "line": 76,
        "kind": "registration",
        "sha256": "010f326f0c9d4bc60d1bb6dbb82a1bc4e6ce29f5596149f335ebdd6bc702f6a9"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-plugin-market:plugin_market",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-plugin-market",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "plugin_market"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-plugin-market/lib/types/tools.js:49-54",
        "reason": "Tool installation waits for the optional pluginMarket service."
      },
      {
        "source": "@deepseek-ai/dsh-web-app/presets/cordis.patch.yml:131-136",
        "reason": "Cordis preset management rows additionally require profileContext; this does not apply to the separate read-only Inspect tools."
      }
    ],
    "sites": [
      {
        "file": "lib/types/tools.js",
        "line": 53,
        "kind": "definition",
        "sha256": "10a591965a23b40b75e0ab44f6645aec6df19da2578d8685fbd60cdc24fb3c06"
      },
      {
        "file": "lib/types/tools.js",
        "line": 53,
        "kind": "registration",
        "sha256": "6db11b67efebf777bca14e981c42567efd1ea26f89c8231b8ba8db430d0941dc"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-subagent:structured_output",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-subagent",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "structured_output"
    ],
    "effect": "read",
    "reason": "Captures the current child's final structured answer and concludes its own turn. This is session-local result/bookkeeping, not filesystem/external mutation or new delegation.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-subagent/lib/index.js:1807",
        "reason": "The result-capture tool is attached only when the child has outputSchema; it does not create another child."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 1038,
        "kind": "registration",
        "sha256": "2d5ce7cf99445a7c3275a2a307c98f5cfeb2dc1d643b18178b922d70b4dd5bf2"
      },
      {
        "file": "lib/types/structured.js",
        "line": 52,
        "kind": "registration",
        "sha256": "274f3a129e7a6c2da9c39330ab0e459204b0f4c0ca0cb370fce9557bffa34529"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "user_terminal_list"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "read",
    "reason": "Lists user-controlled side-panel terminals; runs nothing (description).",
    "id": "@deepseek-ai/dsh-terminal-panel:user_terminal_list",
    "ownerPackage": "@deepseek-ai/dsh-terminal-panel",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 546,
        "kind": "definition",
        "sha256": "a3b91ddad4db3332f476ed81d0c419c23405e629d7cfd10b7d04961bf5cf3af4"
      },
      {
        "file": "lib/index.js",
        "line": 546,
        "kind": "registration",
        "sha256": "efef6bb2cd425459c59370921840e0abbc47a7052f2956e89a4728df9849f2e0"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "user_terminal_read"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "read",
    "reason": "Reads the rendered screen of a user-controlled terminal; runs nothing (description).",
    "id": "@deepseek-ai/dsh-terminal-panel:user_terminal_read",
    "ownerPackage": "@deepseek-ai/dsh-terminal-panel",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 601,
        "kind": "definition",
        "sha256": "87d8fc088c9a9184be26af6b52f1b38bb49f492223222e6502558c75b8694b6b"
      },
      {
        "file": "lib/index.js",
        "line": 601,
        "kind": "registration",
        "sha256": "5306dd70ae5c9dfdf43e12f3f407dc647adccc75927a3013d4bed9767f1c7b81"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "team_task_create"
    ],
    "naming": "literal",
    "conditions": [],
    "packageVersion": "0.2.2-rc.2",
    "effect": "write",
    "reason": "Creates a shared durable Team board task; this is shared-board mutation, not only the calling session's todo bookkeeping.",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 144,
        "kind": "definition",
        "sha256": "cd6f3b16f6827e9867c5f0a7a29f1c43503751932b61597437d66297ee68d3c8"
      },
      {
        "file": "lib/index.js",
        "line": 144,
        "kind": "registration",
        "sha256": "1bd6e63d1912c732fc503c44f12ccf96f6a49098ccc5fce2b902c57dcd8a203c"
      }
    ],
    "id": "@deepseek-ai/dsh-tool-agent-team:team_task_create",
    "ownerPackage": "@deepseek-ai/dsh-tool-agent-team"
  },
  {
    "kind": "tool",
    "names": [
      "team_task_get"
    ],
    "naming": "literal",
    "conditions": [],
    "packageVersion": "0.2.2-rc.2",
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 231,
        "kind": "definition",
        "sha256": "574b7bbde89dbcec0962a9eeeded18f6923ff0d5e8df0dc92241559591455ff7"
      },
      {
        "file": "lib/index.js",
        "line": 231,
        "kind": "registration",
        "sha256": "41a5c22618e064f7b51f6c32bddcb305ce45f711b565977568bf1b2697c99b20"
      }
    ],
    "id": "@deepseek-ai/dsh-tool-agent-team:team_task_get",
    "ownerPackage": "@deepseek-ai/dsh-tool-agent-team"
  },
  {
    "kind": "tool",
    "names": [
      "team_task_list"
    ],
    "naming": "literal",
    "conditions": [],
    "packageVersion": "0.2.2-rc.2",
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 180,
        "kind": "definition",
        "sha256": "4c1066b9b5a29be1094c27f6984563b0d364e7a3c86d2d3506ae9473f7279abe"
      },
      {
        "file": "lib/index.js",
        "line": 180,
        "kind": "registration",
        "sha256": "5e85b164239245029f24bb92349a536aaf12cd469565ce5fd1e48dd626b1714e"
      }
    ],
    "id": "@deepseek-ai/dsh-tool-agent-team:team_task_list",
    "ownerPackage": "@deepseek-ai/dsh-tool-agent-team"
  },
  {
    "kind": "tool",
    "names": [
      "team_task_update"
    ],
    "naming": "literal",
    "conditions": [],
    "packageVersion": "0.2.2-rc.2",
    "effect": "write",
    "reason": "CAS mutation of a shared durable Team board task (including edit/claim/complete/delete); this is shared-board mutation, not a read/report entitlement.",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 247,
        "kind": "definition",
        "sha256": "cbe969d98342e03f5b502196d9ba3b20edb61262490a3f7d8fd7e31bed76c38c"
      },
      {
        "file": "lib/index.js",
        "line": 247,
        "kind": "registration",
        "sha256": "117db3ee2ef242672c478ee552ecfc699cbf4c9d5edc7eca5026d2c14a8f0a52"
      }
    ],
    "id": "@deepseek-ai/dsh-tool-agent-team:team_task_update",
    "ownerPackage": "@deepseek-ai/dsh-tool-agent-team"
  },
  {
    "id": "@deepseek-ai/dsh-tool-ask-user:ask_user_question",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-ask-user",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "ask_user_question"
    ],
    "effect": "read",
    "reason": "Queries the human through the public question channel and returns answers. Question/session bookkeeping does not itself perform the requested business operation.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 66,
        "kind": "definition",
        "sha256": "f793d9fb0469fb18a2d354f3350d962113abd8d2f9e30db5f7a73ea14790d72a"
      },
      {
        "file": "lib/index.js",
        "line": 66,
        "kind": "registration",
        "sha256": "60752304bbe43ea7c08f0cdf096a531e74cde006b07ea168caea276c7defd7f8"
      },
      {
        "file": "lib/index.js",
        "line": 223,
        "kind": "definition",
        "sha256": "9037e635efea04bb6b3777643c4cb0f9e43dc44e0c429a6617abc44206de6856"
      },
      {
        "file": "lib/index.js",
        "line": 223,
        "kind": "registration",
        "sha256": "19c0770820a9ed7e43d204ae3f94876874e5398f5ea9b5180c17234ac743dc14"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-bash:bash",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-bash",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "bash"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-web-app/presets/standard.patch.yml:21-26",
        "reason": "Standard selects bash or pwsh by platform."
      },
      {
        "source": "@deepseek-ai/dsh-web-app/presets/minimal.patch.yml:42-68",
        "reason": "Minimal selects the persistent shell owner by platform; regular/persistent names are alternatives, not a unique owner."
      },
      {
        "source": "@deepseek-ai/dsh-tool-bash/lib/index.js:716-727",
        "reason": "Jobs availability re-registers the same shell identity; it does not create a new tool name."
      },
      {
        "source": "@deepseek-ai/dsh-tools/lib/index.js:2969-2982",
        "reason": "Same-layer duplicate registrations fail; nearest-layer definitions win."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 517,
        "kind": "definition",
        "sha256": "31175602dc84e37cfcf721600ae0062388f8ad27f2aa48fbfad58d36eeba5af0"
      },
      {
        "file": "lib/index.js",
        "line": 746,
        "kind": "registration",
        "sha256": "e19e755303fea4a6ab7d54c1ee524ef3ef26b81942ea769be27a9a1adb26d59f"
      },
      {
        "file": "lib/index.js",
        "line": 749,
        "kind": "registration",
        "sha256": "e19e755303fea4a6ab7d54c1ee524ef3ef26b81942ea769be27a9a1adb26d59f"
      },
      {
        "file": "lib/index.js",
        "line": 753,
        "kind": "registration",
        "sha256": "148699dd70d9aac04aa09d049bf2d7d81c436ec7813019c02876eef3fb97b3b7"
      },
      {
        "file": "lib/index.js",
        "line": 756,
        "kind": "registration",
        "sha256": "e19e755303fea4a6ab7d54c1ee524ef3ef26b81942ea769be27a9a1adb26d59f"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-bash-persistent:bash",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-bash-persistent",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "bash"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-web-app/presets/standard.patch.yml:21-26",
        "reason": "Standard selects bash or pwsh by platform."
      },
      {
        "source": "@deepseek-ai/dsh-web-app/presets/minimal.patch.yml:42-68",
        "reason": "Minimal selects the persistent shell owner by platform; regular/persistent names are alternatives, not a unique owner."
      },
      {
        "source": "@deepseek-ai/dsh-tools/lib/index.js:2969-2982",
        "reason": "Same-layer duplicate registrations fail; nearest-layer definitions win."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 337,
        "kind": "definition",
        "sha256": "3dc68084d6a5eccfb85cae29e3e29de6a32781aeb8f9f67d0b4f035ca2aa4c6d"
      },
      {
        "file": "lib/index.js",
        "line": 337,
        "kind": "registration",
        "sha256": "832b4d07ed50912d250b1bcc6a1b65e127d233ee9645fcd0db5ba5c9a36168da"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-cordis:cordis_inspect_list",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-cordis",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "cordis_inspect_list"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 39,
        "kind": "definition",
        "sha256": "3c1a2e45602b3a7023b5505aad92bc9cece88701633019e4a501b934b955d3b2"
      },
      {
        "file": "lib/index.js",
        "line": 39,
        "kind": "registration",
        "sha256": "4f8dfbbce1bfb8d7423459dc1d5a7b8a3f9a0ba2536dcd3e230bbc3b751a10c5"
      },
      {
        "file": "lib/types/index.js",
        "line": 15,
        "kind": "definition",
        "sha256": "2ba729a4895265f90229c18db1d4411912a93930d0ca77112541902b553f053c"
      },
      {
        "file": "lib/types/index.js",
        "line": 15,
        "kind": "registration",
        "sha256": "1edbf7a03522929079157ad8ee60604bf50d44c011a33cf3f2d3d655e5f6c06b"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-cordis:cordis_inspect_query",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-cordis",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "cordis_inspect_query"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 56,
        "kind": "definition",
        "sha256": "eb1cb346a355cc8eefa14721674fcdd91dae938daf61bbd59481a7b670cf49f8"
      },
      {
        "file": "lib/index.js",
        "line": 56,
        "kind": "registration",
        "sha256": "9a794ab055fd30e6b39b4d5c806a8406586c89ecec52ac2eb49b31b14fb915ff"
      },
      {
        "file": "lib/types/index.js",
        "line": 34,
        "kind": "definition",
        "sha256": "560c3dd7dada2bcffea8801f58e851a207ba141318b9b5fd6c5221125f42a213"
      },
      {
        "file": "lib/types/index.js",
        "line": 34,
        "kind": "registration",
        "sha256": "d01cc0a6c5acb2f31e8cf914afea0401cb6123c0bd6015c2228a40614946a9fc"
      }
    ]
  },
  {
    "kind": "transport",
    "names": [
      "run_code"
    ],
    "naming": "reserved",
    "conditions": [],
    "id": "@deepseek-ai/dsh-tool-executor-ptc:run_code",
    "effect": "write",
    "reason": "Reserved PTC presentation transport (RUN_CODE_NAME = 'run_code') now defined by the PTC executor; it runs program bindings of other tools, so restrict end-capability tools instead.",
    "ownerPackage": "@deepseek-ai/dsh-tool-executor-ptc",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 285,
        "kind": "definition",
        "sha256": "6b035b3c98ae7ca3ea29f47b198cfe9654138b503fee93f90e8b5354d5a4b0a3"
      },
      {
        "file": "lib/types/ptc.js",
        "line": 240,
        "kind": "definition",
        "sha256": "635f9362c7d8a660903a76dd7551f998758ba654539b61d8f5be38e8f6f29207"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "apply_patch"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "write",
    "reason": "Creates, updates, deletes or moves workspace text files through one patch (dsh-tool-fs lib/index.js apply_patch description); a file mutation capability like edit/write.",
    "id": "@deepseek-ai/dsh-tool-fs:apply_patch",
    "ownerPackage": "@deepseek-ai/dsh-tool-fs",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 1383,
        "kind": "definition",
        "sha256": "ed368dea32ddeb4a6c1ca7fe9f8365ec749f8e9b3dba8e56e15affd1ca00eb82"
      },
      {
        "file": "lib/index.js",
        "line": 1383,
        "kind": "registration",
        "sha256": "025a78a2e2694a692c70b910d0c57813a60f0e06e6af9edf670ff7e881bafacd"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-fs:edit",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-fs",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "edit"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-fs/lib/index.js:1194-1227",
        "reason": "Registration follows read/readImage/write/edit switches; read_image additionally needs attachments."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 1459,
        "kind": "definition",
        "sha256": "08b20f4f26e09bde5c21785ccd45297db92d7f26630053c3c7b76ecdf8c6dede"
      },
      {
        "file": "lib/index.js",
        "line": 1459,
        "kind": "registration",
        "sha256": "db28d0fe4aa8e1ebf0161c50b8aa0a04c13ae93c006a347987daa0f3d6d89722"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-fs:read",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-fs",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "read"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-fs/lib/index.js:1194-1227",
        "reason": "Registration follows read/readImage/write/edit switches; read_image additionally needs attachments."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 254,
        "kind": "definition",
        "sha256": "d94a4987ac944f594dc57d5a551da40f193cb7f84e12cb8ef5fcac719d1bc8b6"
      },
      {
        "file": "lib/index.js",
        "line": 254,
        "kind": "registration",
        "sha256": "144a503671c868531f5c9e062f49876a998ebc12fc58ef06afc7bda600cbb458"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-fs:read_image",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-fs",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "read_image"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-fs/lib/index.js:1194-1227",
        "reason": "Registration follows read/readImage/write/edit switches; read_image additionally needs attachments."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 1814,
        "kind": "definition",
        "sha256": "1ebe0eb933feef476a79a4e1b867de1ea112bc3ac5fa3c6b3e5ec32a4eabc118"
      },
      {
        "file": "lib/index.js",
        "line": 1814,
        "kind": "registration",
        "sha256": "af7676690e8d7188c7ed237d3ee1ba29982cf1a4eb678720a235a75f3e8cbb55"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-fs:write",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-fs",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "write"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-fs/lib/index.js:1194-1227",
        "reason": "Registration follows read/readImage/write/edit switches; read_image additionally needs attachments."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 549,
        "kind": "definition",
        "sha256": "19ccff5c299285e58e1001d93e60fbf21626c90b07d3a97b90810b6cb69b000b"
      },
      {
        "file": "lib/index.js",
        "line": 549,
        "kind": "registration",
        "sha256": "945471069ea0fb79b6e6be3000a7acb9cd303cd00386a2981fc8949c22c7d067"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-fs-search:glob",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-fs-search",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "glob"
    ],
    "effect": "read",
    "reason": "Read-only path discovery. Spilling an oversized result into an owned output artifact is harness bookkeeping, not permission to modify user files (Lead ruling).",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 765,
        "kind": "definition",
        "sha256": "4a19ec1d645a2b471d312205cc99d9534fa1fe351d63a6d4c451f4893a22c313"
      },
      {
        "file": "lib/index.js",
        "line": 832,
        "kind": "registration",
        "sha256": "5f9024eeba4cefc836899e831ce17280db5ab8077c3e4c63eeaf44aa06afff4d"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-fs-search:grep",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-fs-search",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "grep"
    ],
    "effect": "read",
    "reason": "Read-only content search. Spilling an oversized result into an owned output artifact is harness bookkeeping, not permission to modify user files (Lead ruling).",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 1076,
        "kind": "definition",
        "sha256": "012b53def6d5ee4e52b1f59ae2e37238dfc4780979e349f2fc44707bd21b23b8"
      },
      {
        "file": "lib/index.js",
        "line": 1146,
        "kind": "registration",
        "sha256": "5f9024eeba4cefc836899e831ce17280db5ab8077c3e4c63eeaf44aa06afff4d"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-goal:create_goal",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-goal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "create_goal"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 274,
        "kind": "definition",
        "sha256": "ca10fa8e8e75f57f0a8bc12ddbed2a77d1a00c3dc75b270ad588f31f862925ee"
      },
      {
        "file": "lib/index.js",
        "line": 274,
        "kind": "registration",
        "sha256": "40e707a2fa48cb0aeffd792ebe533f4821e6a48ec09d4320749f8ffaee471478"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-goal:get_goal",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-goal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "get_goal"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 263,
        "kind": "definition",
        "sha256": "bbd1a8cbc36684a1cc14c4b8125a8d67359beaa597d0ec6f8b130b338ff7b92f"
      },
      {
        "file": "lib/index.js",
        "line": 263,
        "kind": "registration",
        "sha256": "3883ac51ae82d157eabf894c566d151b754c773fc7e6d6c7bb708bc7f4389808"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-goal:update_goal",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-goal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "update_goal"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 300,
        "kind": "definition",
        "sha256": "efb1741b8e48a0cc30e5ce603aa5c4cda8c7fb50f9a00dd4eebb98822a2da348"
      },
      {
        "file": "lib/index.js",
        "line": 300,
        "kind": "registration",
        "sha256": "49774418223fd7efc7343c3d68456ec468236d676db7641452447fa062eef797"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-jobs:job_kill",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-jobs",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "job_kill"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 487,
        "kind": "definition",
        "sha256": "0a21b1f6eacc5d401d0a4c7d21b900ad05a77e0fcd5441269786cb914e31367a"
      },
      {
        "file": "lib/index.js",
        "line": 487,
        "kind": "registration",
        "sha256": "333a8a59504d7fd804634088a894a82c01f4ba3e815c15cbce26ef0aea44acdd"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-jobs:job_list",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-jobs",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "job_list"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 466,
        "kind": "definition",
        "sha256": "425ae3b86d24592ea0e3240187eab24977cae32082b072bf1f2da9030a0676b5"
      },
      {
        "file": "lib/index.js",
        "line": 466,
        "kind": "registration",
        "sha256": "ff186fe395568fbb8352887f36ed37b5af0017cd18b30ed52a2e4196dbfb0aeb"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-jobs:job_output",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-jobs",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "job_output"
    ],
    "effect": "read",
    "reason": "Reads existing job output/status. Advancing a stream read cursor is harness bookkeeping, not a business write (Lead ruling).",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 373,
        "kind": "definition",
        "sha256": "e3d334c1213ea72a1033d12c3cbd083095c594329d28f4d3d233bd3183fb2253"
      },
      {
        "file": "lib/index.js",
        "line": 373,
        "kind": "registration",
        "sha256": "bff719dd5847c0993afc89cba0b4c856f9b6ca8987b3d5e7386aca7a4791fae6"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "office_convert"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "read",
    "reason": "Converts a document into a harness-owned temporary output file the caller must copy with the shell; it does not modify the source or the workspace (dsh-tool-office description).",
    "id": "@deepseek-ai/dsh-tool-office:office_convert",
    "ownerPackage": "@deepseek-ai/dsh-tool-office",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 454,
        "kind": "definition",
        "sha256": "e538633e79c05f4b0f30f320ae342ca6e1dd8488980584c84ff10d2796a4bfa9"
      },
      {
        "file": "lib/index.js",
        "line": 454,
        "kind": "registration",
        "sha256": "f2dc1d13323bb93ea799a02dbabdd6a8410c704184c11e14951106d5cfe6e3a0"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "office_recalculate"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "read",
    "reason": "Recalculates formulas into a harness-owned temporary workbook the caller must copy with the shell; the source workbook and workspace are unchanged (dsh-tool-office description).",
    "id": "@deepseek-ai/dsh-tool-office:office_recalculate",
    "ownerPackage": "@deepseek-ai/dsh-tool-office",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 473,
        "kind": "definition",
        "sha256": "ec92c728254242aa1a108a844aa1b5ac8328490abef630acc14d977d3442677c"
      },
      {
        "file": "lib/index.js",
        "line": 473,
        "kind": "registration",
        "sha256": "b036b07ad0c45a8b0f4447a819e90a310b8d851024115f64959608449f74db59"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "office_render"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "read",
    "reason": "Renders document pages, slides or worksheet areas as images for viewing; no workspace mutation.",
    "id": "@deepseek-ai/dsh-tool-office:office_render",
    "ownerPackage": "@deepseek-ai/dsh-tool-office",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 401,
        "kind": "definition",
        "sha256": "ab50d7429e608defd9211bbb37d4894d9cff9f800c2d0c2f2388cb9eb416e1ad"
      },
      {
        "file": "lib/index.js",
        "line": 401,
        "kind": "registration",
        "sha256": "d7abf1156053da2def13f14fffbdaf83118f406edc806f7be8605d4256d814a6"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-present:present",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-present",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "present"
    ],
    "effect": "read",
    "reason": "Session-only presentation of existing regular files. Reads/stats file identities and appends deliverable metadata; never writes those files. Classified read by Lead ruling.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 24,
        "kind": "definition",
        "sha256": "23f0edd7782558174174f6c1fb845be4a700b9d1e9ba1554804326cde3448f6a"
      },
      {
        "file": "lib/index.js",
        "line": 24,
        "kind": "registration",
        "sha256": "a77eb8a5780225f685694c27f5b728953d6b979d51630a19e80325bdf92f408f"
      },
      {
        "file": "lib/types/index.js",
        "line": 22,
        "kind": "definition",
        "sha256": "630b52fcecf49fe013e2af6dcb451bbd7c58076933874d054583d9e37bcb51b2"
      },
      {
        "file": "lib/types/index.js",
        "line": 22,
        "kind": "registration",
        "sha256": "311b368deac6a22cd821051a44f8a1a392081deeefd67a073d3cff8439f09d34"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-pwsh:pwsh",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-pwsh",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "pwsh"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-web-app/presets/standard.patch.yml:21-26",
        "reason": "Standard selects bash or pwsh by platform."
      },
      {
        "source": "@deepseek-ai/dsh-web-app/presets/minimal.patch.yml:42-68",
        "reason": "Minimal selects the persistent shell owner by platform; regular/persistent names are alternatives, not a unique owner."
      },
      {
        "source": "@deepseek-ai/dsh-tool-pwsh/lib/index.js:721-732",
        "reason": "Jobs availability re-registers the same shell identity; it does not create a new tool name."
      },
      {
        "source": "@deepseek-ai/dsh-tools/lib/index.js:2969-2982",
        "reason": "Same-layer duplicate registrations fail; nearest-layer definitions win."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 490,
        "kind": "definition",
        "sha256": "f96df3bae13812926fcaad4d1ba18d081f28313562a90607a4925077a0d5ef8f"
      },
      {
        "file": "lib/index.js",
        "line": 751,
        "kind": "registration",
        "sha256": "b8c75e04398e9e4e656457b314709273cefb656f606f69dd8e1f2f5a373868bd"
      },
      {
        "file": "lib/index.js",
        "line": 754,
        "kind": "registration",
        "sha256": "b8c75e04398e9e4e656457b314709273cefb656f606f69dd8e1f2f5a373868bd"
      },
      {
        "file": "lib/index.js",
        "line": 758,
        "kind": "registration",
        "sha256": "8d67e8dde833b9cdf2cb44215f451f70d8855df909f65270872600871621e386"
      },
      {
        "file": "lib/index.js",
        "line": 761,
        "kind": "registration",
        "sha256": "b8c75e04398e9e4e656457b314709273cefb656f606f69dd8e1f2f5a373868bd"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-pwsh-persistent:pwsh",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-pwsh-persistent",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "pwsh"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-web-app/presets/standard.patch.yml:21-26",
        "reason": "Standard selects bash or pwsh by platform."
      },
      {
        "source": "@deepseek-ai/dsh-web-app/presets/minimal.patch.yml:42-68",
        "reason": "Minimal selects the persistent shell owner by platform; regular/persistent names are alternatives, not a unique owner."
      },
      {
        "source": "@deepseek-ai/dsh-tools/lib/index.js:2969-2982",
        "reason": "Same-layer duplicate registrations fail; nearest-layer definitions win."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 341,
        "kind": "definition",
        "sha256": "850b2fcdd4b147b791421822fc1068da7adce8655da645ad5b9917e0e0748181"
      },
      {
        "file": "lib/index.js",
        "line": 341,
        "kind": "registration",
        "sha256": "7dd7afaaeaa9d2a3a2ca548bd360c1e55c074feef3da7b431b6f80f1c59c08eb"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-ralph:ralph",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-ralph",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "ralph"
    ],
    "effect": "delegate",
    "reason": "Starts or orchestrates child Agents; this is descriptive effect evidence, not role entitlement.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 300,
        "kind": "definition",
        "sha256": "ed75ab4d09b1671265c9c005d7b6e9656d2f32b6cfaf43c796696774227a5f35"
      },
      {
        "file": "lib/index.js",
        "line": 300,
        "kind": "registration",
        "sha256": "eb6104e8dcfb09370c09fae40363d1d0375d7d32750bcb055dd1f2d817c44f60"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-schedule:schedule_create",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-schedule",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "schedule_create"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 517,
        "kind": "definition",
        "sha256": "4a948b4578eaecc6b8b0d0d62437de2480457d9ef28f365747d4c567de8c461c"
      },
      {
        "file": "lib/index.js",
        "line": 517,
        "kind": "registration",
        "sha256": "58194448ec987869654c0986129c946118ebff634f3faf2d6ab589a2e27c11ce"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "schedule_edit"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "write",
    "reason": "Updates, pauses, resumes or deletes a durable scheduled task; replaces 0.2.1 schedule_update/schedule_delete.",
    "id": "@deepseek-ai/dsh-tool-schedule:schedule_edit",
    "ownerPackage": "@deepseek-ai/dsh-tool-schedule",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 612,
        "kind": "definition",
        "sha256": "8d44d166be42fa79ee155bf2c26f68412bc0c5449422b930041d04823d0e4595"
      },
      {
        "file": "lib/index.js",
        "line": 612,
        "kind": "registration",
        "sha256": "1940f995924f2efdaf3616ab67fae9ca31e0c041c5d863f002d47d1d7135235b"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-schedule:schedule_list",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-schedule",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "schedule_list"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 560,
        "kind": "definition",
        "sha256": "08c153345f51cc596ee9142ba1715c78f36ed59dd3e13e522ccc0bd4f95c3d6e"
      },
      {
        "file": "lib/index.js",
        "line": 560,
        "kind": "registration",
        "sha256": "26f9d050923e11a16fa74fd2d33fef77b1fa06d068199e6a17593072f164bf50"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "schedule_view"
    ],
    "naming": "literal",
    "conditions": [],
    "effect": "read",
    "reason": "Reads one scheduled task by id.",
    "id": "@deepseek-ai/dsh-tool-schedule:schedule_view",
    "ownerPackage": "@deepseek-ai/dsh-tool-schedule",
    "packageVersion": "0.2.2-rc.2",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 594,
        "kind": "definition",
        "sha256": "134c70a8582c3d976806de1de9a1e19def62dc8cfe70cde9477bcad35b8ba484"
      },
      {
        "file": "lib/index.js",
        "line": 594,
        "kind": "registration",
        "sha256": "882fd604b7408c12050499785c4d0c677d4e0b11c7c3d20347e2e449b893a5da"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-session-query:session_event_read",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-session-query",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "session_event_read"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 997,
        "kind": "definition",
        "sha256": "9b89b78f38f0fd9e0aac03dbf809dbb1e6d80398108ee7b82a86039618dd8f41"
      },
      {
        "file": "lib/index.js",
        "line": 997,
        "kind": "registration",
        "sha256": "9f75702af92aa696f55d52fcf973d788f321e17292d4ea6ed3483f69376cb427"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-session-query:session_event_search",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-session-query",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "session_event_search"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 963,
        "kind": "definition",
        "sha256": "39f934a575cdff3c1ccde6850c74b419a8c052fc540222963c1596adac7e5405"
      },
      {
        "file": "lib/index.js",
        "line": 963,
        "kind": "registration",
        "sha256": "3916d82729f55bbdb599e028acd4b288341795af1e62dd64db62fda08f433383"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-session-query:session_event_trace",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-session-query",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "session_event_trace"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 981,
        "kind": "definition",
        "sha256": "753943bee6094aad6b5af601702ff9a18e6d210fa5128db0450b7dddc798d765"
      },
      {
        "file": "lib/index.js",
        "line": 981,
        "kind": "registration",
        "sha256": "8279c6f1cb563045efe95cee80b2ff9cb4328b44bca84374c9133d0e93bfadaf"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-session-query:session_search",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-session-query",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "session_search"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 954,
        "kind": "definition",
        "sha256": "39cf36fb16e920fd9d226c82a150c42aaca99aeca0b5112602a2695d631e65b1"
      },
      {
        "file": "lib/index.js",
        "line": 954,
        "kind": "registration",
        "sha256": "b18649482f1d8e4f6ced6338ce13c22678fcab122dcf72504dc4b65602ba0951"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-session-query:session_trace",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-session-query",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "session_trace"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 972,
        "kind": "definition",
        "sha256": "30c21cb60aedf35815ddda0ce8c38e74c870296180a608149260e53fc5d939ea"
      },
      {
        "file": "lib/index.js",
        "line": 972,
        "kind": "registration",
        "sha256": "0b2481bb9d2a0792f2331d32e1b2fe8b201383861effae17c1bd7221cdf653ba"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-skill:skill",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-skill",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "skill"
    ],
    "effect": "read",
    "reason": "Loads an existing skill body/instructions into the current session context; this does not itself execute scripts or grant tool/MCP permissions.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 788,
        "kind": "definition",
        "sha256": "f3b1954e5c3985757ec1a0d31b8eb13b977983544d7958b81f132f362bc483ce"
      },
      {
        "file": "lib/index.js",
        "line": 896,
        "kind": "registration",
        "sha256": "6ba59c22b2e7c4e551402626cc88faa85ee8fefe5f1b520a4600edc7fd6a85df"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-str-replace-editor:str_replace_editor",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-str-replace-editor",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "str_replace_editor"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 268,
        "kind": "definition",
        "sha256": "291b4ae0313905add23c4a16a3149637ef9355d46ff31ba3ffeafa436b48b510"
      },
      {
        "file": "lib/index.js",
        "line": 268,
        "kind": "registration",
        "sha256": "94a7e28159e4418c61a9fc9edce18b6413b8fae72bc14af0aa42b8d95fe32b6a"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-subagent:list_subagent_models",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-subagent",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "list_subagent_models"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-subagent/lib/index.js:172-173,375",
        "reason": "Model discovery is registered only with a captured model-selection policy."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 208,
        "kind": "definition",
        "sha256": "4e583b3994c05f12c29b3b22b95eda12b96bf1c71b3c8a1ef9500d8f07705a21"
      },
      {
        "file": "lib/index.js",
        "line": 208,
        "kind": "registration",
        "sha256": "ce30e2c73edfdae0098aee9bc9688ce7c571f7193581c16f38df22a33afc08ab"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-subagent:subagent+subagent_fork",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-subagent",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "subagent",
      "subagent_fork"
    ],
    "effect": "delegate",
    "reason": "Starts or orchestrates child Agents; this is descriptive effect evidence, not role entitlement.",
    "naming": "configured",
    "defaultName": "subagent",
    "configProperty": "toolName",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-subagent/lib/index.js:359-375,489-499",
        "reason": "toolName is configurable (default subagent; bundled fork instance uses subagent_fork); mounting depends on its configured provider."
      }
    ],
    "sites": [
      {
        "file": "@deepseek-ai/dsh-base/cordis.patch.yml",
        "line": 395,
        "kind": "configuration",
        "sha256": "94a168d2da574b00ec6c787377278465271cf2b97e68af076fc3eee87eba8664"
      },
      {
        "file": "@deepseek-ai/dsh-base/cordis.patch.yml",
        "line": 405,
        "kind": "configuration",
        "sha256": "3fc3e7a2043eba21a31cce3bed8737113bc706f564f093a01a4418155d080270"
      },
      {
        "file": "@deepseek-ai/dsh-web-app/presets/cordis.patch.yml",
        "line": 99,
        "kind": "configuration",
        "sha256": "94a168d2da574b00ec6c787377278465271cf2b97e68af076fc3eee87eba8664"
      },
      {
        "file": "@deepseek-ai/dsh-web-app/presets/cordis.patch.yml",
        "line": 106,
        "kind": "configuration",
        "sha256": "3fc3e7a2043eba21a31cce3bed8737113bc706f564f093a01a4418155d080270"
      },
      {
        "file": "@deepseek-ai/dsh-web-app/presets/ptc.patch.yml",
        "line": 100,
        "kind": "configuration",
        "sha256": "94a168d2da574b00ec6c787377278465271cf2b97e68af076fc3eee87eba8664"
      },
      {
        "file": "@deepseek-ai/dsh-web-app/presets/ptc.patch.yml",
        "line": 107,
        "kind": "configuration",
        "sha256": "3fc3e7a2043eba21a31cce3bed8737113bc706f564f093a01a4418155d080270"
      },
      {
        "file": "@deepseek-ai/dsh-web-app/presets/standard.patch.yml",
        "line": 103,
        "kind": "configuration",
        "sha256": "94a168d2da574b00ec6c787377278465271cf2b97e68af076fc3eee87eba8664"
      },
      {
        "file": "@deepseek-ai/dsh-web-app/presets/standard.patch.yml",
        "line": 110,
        "kind": "configuration",
        "sha256": "3fc3e7a2043eba21a31cce3bed8737113bc706f564f093a01a4418155d080270"
      },
      {
        "file": "lib/index.js",
        "line": 365,
        "kind": "definition",
        "sha256": "aff076062133bf78e41e07efacb9f21aad906c933f047bd4ea4fc8a2f44ea2bf"
      },
      {
        "file": "lib/index.js",
        "line": 483,
        "kind": "registration",
        "sha256": "2b5af51eccc10f604be4ef19dc6147031cd128849645ebc79f54caec0ba69e6e"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-subagent-control:interrupt_agent",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-subagent-control",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "interrupt_agent"
    ],
    "effect": "write",
    "reason": "Can interrupt another Agent. Team own-layer definition shadows the global subagent-control definition in Team scopes; both owners are recorded, never chosen by name alone.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 284,
        "kind": "definition",
        "sha256": "3961797762e646a9fced596723586e61bcffec30bad25f7774c1de301de8c128"
      },
      {
        "file": "lib/index.js",
        "line": 284,
        "kind": "registration",
        "sha256": "54ef71092be40db5915a2d3eab3ef5eaccf42a12bd71064fed1b42bcb102b6cc"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-subagent-control:list_agents",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-subagent-control",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "list_agents"
    ],
    "effect": "read",
    "reason": "Read-only roster. Native Team own-layer definition shadows global subagent-control/list-agents in Team scopes; outside those scopes the global definition applies. Name alone cannot select an owner.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 31,
        "kind": "definition",
        "sha256": "42fa2274bedb8ee6543d5c77f4e7227551bf06ad4ed50d5eccdc1ffd5830ae29"
      },
      {
        "file": "lib/index.js",
        "line": 79,
        "kind": "registration",
        "sha256": "2b5af51eccc10f604be4ef19dc6147031cd128849645ebc79f54caec0ba69e6e"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-subagent-control:send_message",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-subagent-control",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "send_message"
    ],
    "effect": "write",
    "reason": "Can deliver work to another Agent, continue a session and wake/resume an idle continuable target. Team own-layer definition shadows the global subagent-control definition in Team scopes; both owners are recorded, never chosen by name alone.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 221,
        "kind": "definition",
        "sha256": "eac233087a89e990a41ea4b293399b31d747d6e6e46671d68b7461844924c3e9"
      },
      {
        "file": "lib/index.js",
        "line": 261,
        "kind": "registration",
        "sha256": "40156045070657f4d9adf095ea6ffd9663a1424a89267a0eedea7939ce303f7b"
      }
    ]
  },
  {
    "kind": "tool",
    "names": [
      "wait_agent"
    ],
    "naming": "literal",
    "conditions": [],
    "packageVersion": "0.2.2-rc.2",
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "sites": [
      {
        "file": "lib/index.js",
        "line": 163,
        "kind": "definition",
        "sha256": "41c0d3998aab75623636d62261114d8557bab47f379229ccbda8d91e3f83f223"
      },
      {
        "file": "lib/index.js",
        "line": 163,
        "kind": "registration",
        "sha256": "14eab1cbfd9d7bfac5556c7ab0bef4d9d7d859a308cc8930c0501889ac132e2c"
      }
    ],
    "id": "@deepseek-ai/dsh-tool-subagent-control:wait_agent",
    "ownerPackage": "@deepseek-ai/dsh-tool-subagent-control"
  },
  {
    "id": "@deepseek-ai/dsh-tool-terminal:terminal_close",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-terminal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "terminal_close"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 585,
        "kind": "definition",
        "sha256": "0c1c26b052cf8c93577002cb4e14456ebe89ac57b4af50a37206cc07276fbc4a"
      },
      {
        "file": "lib/index.js",
        "line": 585,
        "kind": "registration",
        "sha256": "2d220ce887ea7e8829491cc5cd82e64e5fb2e61a948a8354336f1ba4031e5398"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-terminal:terminal_list",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-terminal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "terminal_list"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 628,
        "kind": "definition",
        "sha256": "bce619f6d97e6bc222d5e5aa971b727c0231168cc3e4182f7d04f94710f3022b"
      },
      {
        "file": "lib/index.js",
        "line": 628,
        "kind": "registration",
        "sha256": "33bf57bc52c422fd48ed1dcc3144efc2d66e38a9fc6ebda52aeb2b0e1ec74c63"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-terminal:terminal_open",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-terminal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "terminal_open"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 264,
        "kind": "definition",
        "sha256": "797426869986ed0cfa6f695a7e0fbd3c46aea9de0a57ca580c6373cd3180ae1c"
      },
      {
        "file": "lib/index.js",
        "line": 264,
        "kind": "registration",
        "sha256": "ed006f5aa2d486eb61544bfd752addbaea34f9bc9c13549cadae695cb18f8f88"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-terminal:terminal_read",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-terminal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "terminal_read"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 466,
        "kind": "definition",
        "sha256": "d9d37dda7e606a3b5f51f71504357ac87cd55f7fa8724598139e5526187f360f"
      },
      {
        "file": "lib/index.js",
        "line": 466,
        "kind": "registration",
        "sha256": "312d83fd883b01fde6acf0487ea5ec4ba3e6716945d2d1adad5fb1aded5d5332"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-terminal:terminal_send",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-terminal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "terminal_send"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 319,
        "kind": "definition",
        "sha256": "719033fe230dbed36b2bdef6f80d189c1d0abbad55b61e8d7fe22b1cf4aa9da5"
      },
      {
        "file": "lib/index.js",
        "line": 319,
        "kind": "registration",
        "sha256": "26ac421a6cf7a2c4abe0a49e22ec6ae5557ee26996d049e876388b61182305df"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-terminal:terminal_signal",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-terminal",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "terminal_signal"
    ],
    "effect": "write",
    "reason": "The named capability can change files, process/runtime control, durable policy or shared state; mixed read/write actions are conservatively classified write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 531,
        "kind": "definition",
        "sha256": "1c3dcbd5e2aad271d4230e8f1c431c5c9defb49d10cd2ef875953d503ceaf492"
      },
      {
        "file": "lib/index.js",
        "line": 531,
        "kind": "registration",
        "sha256": "47c425c39e225ddf7e80053e622b2413f9c23e16e77b5a0344ed9d661d79cf65"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-todo:todo_write",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-todo",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "todo_write"
    ],
    "effect": "read",
    "reason": "Session-only todo annotation. It appends the owning session todo event, but does not change workspace files, external systems or other Agents; classified read by Lead ruling.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 97,
        "kind": "definition",
        "sha256": "f13886764d5fffa41c375befe0970ed334fd74dfaf3624860bcdc7de8eeef5dc"
      },
      {
        "file": "lib/index.js",
        "line": 97,
        "kind": "registration",
        "sha256": "645a9bc544cdba37042254293ff44e5ddd4100496dada9ec2c5912f3a847f4d6"
      },
      {
        "file": "lib/types/index.js",
        "line": 102,
        "kind": "definition",
        "sha256": "ca8dcd776905533f25ebf7453b74aa9c13dff7e012caf6c2c47b30f72d0ba4ae"
      },
      {
        "file": "lib/types/index.js",
        "line": 102,
        "kind": "registration",
        "sha256": "16e8cea69c5691c8c67fc9fb9f557ac6c5b12b52302caf2c069dd988fa3a4199"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-web:web_fetch",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-web",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "web_fetch"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-web/lib/index.js:845-875",
        "reason": "Registration follows search/fetch switches; registered tools can remain visible with an unavailable provider."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 766,
        "kind": "definition",
        "sha256": "08c30c136c1d63edd7e7c9226723da77417f9ee22bb6e8ba03f531c7c19e9082"
      },
      {
        "file": "lib/index.js",
        "line": 766,
        "kind": "registration",
        "sha256": "f51a6b9de25a4aa7dad646b0b40520ef9c123b186c4a14618c0617e4a7647ba0"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-web:web_search",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-web",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "web_search"
    ],
    "effect": "read",
    "reason": "Reads existing data or performs a query; transient caches, read cursors and normal session bookkeeping do not grant a write capability.",
    "naming": "literal",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-web/lib/index.js:845-875",
        "reason": "Registration follows search/fetch switches; registered tools can remain visible with an unavailable provider."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 288,
        "kind": "definition",
        "sha256": "746cf8397d9625f3c3774c686ce06e135e7c901dab714c28ac98902cf2c78ae4"
      },
      {
        "file": "lib/index.js",
        "line": 288,
        "kind": "registration",
        "sha256": "d2eb1a96600f8922c09b6647a493da04ed82010e4869126f47768b7ca6a704ae"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-workflow:workflow",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-workflow",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "workflow"
    ],
    "effect": "delegate",
    "reason": "Starts or orchestrates child Agents; this is descriptive effect evidence, not role entitlement.",
    "naming": "configured",
    "defaultName": "workflow",
    "configProperty": "toolName",
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-workflow/lib/index.js:67,270",
        "reason": "toolName is configurable, default workflow; it is not the provider identity."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 270,
        "kind": "definition",
        "sha256": "9195b84f36977aee18f20a583561943aad4e1a39a2655572112fe7d6e6304e7d"
      },
      {
        "file": "lib/index.js",
        "line": 270,
        "kind": "registration",
        "sha256": "08611bf88929955a96684d913005d3d05ac1740a9c4702981d7582a1d92c5559"
      },
      {
        "file": "lib/types/index.js",
        "line": 247,
        "kind": "definition",
        "sha256": "3d5f7dc11a1852a4a67809110f3ef10d7a5ab197454823da8401e3881f0d3f43"
      },
      {
        "file": "lib/types/index.js",
        "line": 247,
        "kind": "registration",
        "sha256": "e648b558da141e0fec9617fbde4c1c53fe467c0f777f4ca325c6182a0ff0dcbe"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-working-directory:working_directory",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-working-directory",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "working_directory"
    ],
    "effect": "write",
    "reason": "May read or set the calling session working directory. Because cd changes runtime execution context, name-level mixed capability is write.",
    "naming": "literal",
    "conditions": [],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 16,
        "kind": "definition",
        "sha256": "d0ad01e89cae36e2b150310e74f15f0aa4b0979a8ee01692fdfe36cc69d28dfb"
      },
      {
        "file": "lib/index.js",
        "line": 16,
        "kind": "registration",
        "sha256": "bac2c474c2f829012a3965be135fb06336d9649c5fe6e27251934d87c72fc7fa"
      }
    ]
  },
  {
    "id": "@deepseek-ai/dsh-tool-workspace-dependencies:load_workspace_dependencies",
    "kind": "tool",
    "ownerPackage": "@deepseek-ai/dsh-tool-workspace-dependencies",
    "packageVersion": "0.2.2-rc.2",
    "names": [
      "load_workspace_dependencies"
    ],
    "effect": "write",
    "reason": "With config.root configured, first use installs/copies bundled runtime payload into that directory; without it, only resolves/validates paths. Name-level capability is write because installation is supported (Lead ruling).",
    "naming": "literal",
    "conditional": {
      "configProperty": "root",
      "configured": "write",
      "absent": "read"
    },
    "conditions": [
      {
        "source": "@deepseek-ai/dsh-tool-workspace-dependencies/lib/index.js:280-285",
        "reason": "root configured invokes installation (write); root absent resolves/validates existing paths (read)."
      },
      {
        "source": "@deepseek-ai/dsh-sdk-app/cordis.patch.yml:26-33",
        "reason": "Shipped activation uses DSH_PRIMARY_RUNTIME or the bundled-primary-runtime environment fallback."
      }
    ],
    "sites": [
      {
        "file": "lib/index.js",
        "line": 238,
        "kind": "definition",
        "sha256": "bb2f184cb91098da02acab6bded26b2d946da128441537501835fad84c6a7bfa"
      },
      {
        "file": "lib/index.js",
        "line": 238,
        "kind": "registration",
        "sha256": "d3433dc26118f7e4ac37c70d1e31f194ab46fadf7916f98f4ad55ec4f6a15000"
      }
    ]
  }
])
const NATIVE_ROWS = /* @__PURE__ */ freeze(NATIVE_TOOL_EFFECTS.flatMap(row=>row.names.map(name=>[name,row.effect,row.ownerPackage,row.reason])))
const TEAM_REPORT_NAMES = /* @__PURE__ */ Object.freeze(['send_message','list_agents','team_task_list','team_task_get','team_task_update','wait_agent'])
export function nativeToolTrait(name) {
  const rows = NATIVE_ROWS.filter(row=>row[0] === name)
  if (!rows.length) {
    const upstream=parseMcpToolName(name).value?NATIVE_TOOL_EFFECTS.find(row=>row.naming==='upstream'):undefined
    const reason=upstream
      ? msg('diag.native-tool-classes.upstream-effect-is-user-setting', undefined, SDK_NAMESPACE)
      : msg('diag.native-tool-classes.unverified-custom-effect-is-not-read-only', undefined, SDK_NAMESPACE)
    return result({reason},missing('native-tool-classes',reason))
  }
  const effects = unique(rows.map(row=>row[1])), owners = unique(rows.map(row=>row[2])),evidence=unique(rows.map(row=>row[3])).join(' ')
  const diagnostics = owners.length === 1 ? [] : missing('native-tool-classes', msg("diag.native-tool-classes.same-name-native-definitions-have-multiple-owners"))
  if(effects.length!==1||effects[0]==='unknown')diagnostics.push(...missing('native-tool-classes', msg("diag.native-tool-classes.native-name-has-unresolved-or-conflicting-effects")))
  return result({...(effects.length===1&&effects[0]!=='unknown'?{effect:effects[0]}:{}),...(owners.length===1?{ownerPackage:owners[0]}:{}),reason:msg('diag.native-tool-classes.verified-native-effect', { evidence }, SDK_NAMESPACE)},diagnostics)
}
export function nativeToolGroup(group) {
  if (group === 'team-spawn') return result(sorted(NATIVE_TOOL_EFFECTS.filter(row=>row.groups?.includes('team-spawn')).flatMap(row=>row.names)))
  if (group === 'team-report') return result(TEAM_REPORT_NAMES.slice())
  if (group === 'write' || group === 'delegate') return result(sorted(NATIVE_ROWS.filter(row=>row[1] === group).map(row=>row[0])))
  return result([],missing('native-tool-classes', msg("diag.native-tool-classes.unknown-native-tool-class")))
}
export function nativeToolSource(name) {
  const owners = sorted(NATIVE_ROWS.filter(row=>row[0] === name).map(row=>row[2]))
  return owners.length === 1 ? result({packageName:owners[0]}) : result({},missing('native-tool-classes',owners.length
    ? msg('diag.native-tool-classes.multiple-native-owners-share-this-name')
    : msg('diag.native-tool-classes.unknown-custom-tool-name-has-no-verified-owner')))
}
export function nativeSubagentProvider() { return 'spawn' }
export function nativeCompactCommand() { return freeze({name:'compact',definitionId:'@deepseek-ai/dsh-command-compact'}) }
export function isNativeCompactCommand(definition) {
  if (!object(definition)) return result(false)
  return result(definition.name === 'compact' && definition.definitionId === '@deepseek-ai/dsh-command-compact')
}
export function sessionHeaderFacts(header) {
  if (!object(header) || !string(header.id) || !header.id) return result({isSubagent:false},missing('session-header', msg("diag.session-header.session-header-is-unavailable-or-invalid")))
  const diagnostics = []
  if (header.parentSession !== undefined && (!string(header.parentSession)||!header.parentSession)) diagnostics.push(diag('session-header', msg("diag.session-header.invalid-parent-session-identity")))
  if (header.cwd !== undefined && !string(header.cwd)) diagnostics.push(diag('session-header', msg("diag.session-header.invalid-header-workspace-path")))
  if (header.delegationDepth !== undefined && (!Number.isSafeInteger(header.delegationDepth)||header.delegationDepth < 0)) diagnostics.push(diag('session-header', msg("diag.session-header.invalid-delegation-depth")))
  return result({sessionId:header.id,...(string(header.parentSession)&&header.parentSession ? {parentId:header.parentSession} : {}),...(string(header.cwd)?{cwd:header.cwd}:{}),isSubagent:header.origin === 'subagent',...(Number.isSafeInteger(header.delegationDepth)&&header.delegationDepth>=0 ? {depth:header.delegationDepth} : {}),...(string(header.agentPreset)?{presetId:header.agentPreset}:{})},diagnostics)
}
export function orchestratorServiceName() { return 'orchestrator' }
export function superagentIdentity({sessionId,presetId,orchestrator} = {}) {
  const hinted = (string(presetId)&&/^dsh-superagent/.test(presetId)) || (string(sessionId)&&sessionId.startsWith('worker-')&&object(orchestrator)&&'sources' in orchestrator)
  // The optional plugin's owning package has not been corroborated in this DSH
  // installation. Legacy name/shape hints must not be promoted to verified fact.
  return hinted ? result({foreign:false,basis:'unverified optional orchestration identity'},missing('superagent-identity', msg("diag.superagent-identity.optional-orchestration-identity-needs-verified-owner"))) : result({foreign:false,basis:'no foreign identity evidence'})
}
// SDK0.1.13 additive activity decoding for the Lead activity query. Faithful fields only:
// no verdict, no health label and no inferred failure class. Existing exports stay untouched.
const activityFailureFacts = (value) => {
  if (!object(value) || !string(value.message) || !string(value.code)) return null
  const failure = { message: value.message, code: value.code }
  if (value.status !== undefined) { if (!nonnegative(value.status)) return null; failure.status = value.status }
  if (value.providerRetryAfterMs !== undefined) { if (!nonnegative(value.providerRetryAfterMs)) return null; failure.providerRetryAfterMs = value.providerRetryAfterMs }
  if (value.requestId !== undefined) { if (!string(value.requestId)) return null; failure.requestId = value.requestId }
  if (value.offloadImages !== undefined) { if (!nonnegative(value.offloadImages)) return null; failure.offloadImages = value.offloadImages }
  return failure
}
const activityFinishFacts = (reason) => {
  if (!object(reason) || !string(reason.kind)) return null
  const finish = { kind: reason.kind }
  if (reason.failure !== undefined) {
    const failure = activityFailureFacts(reason.failure)
    if (!failure) return null
    finish.failure = failure
  }
  return finish
}
// Compact stream summary: block kinds present, joined text/reasoning, and the terminal finish.
const activityStreamFacts = (records) => {
  if (!Array.isArray(records)) return null
  const kinds = [], toolCalls = []
  let text = '', reasoning = '', finish = null
  for (const record of records) {
    if (!object(record) || !string(record.type)) return null
    if (record.type === 'text-chunks') {
      if (!Array.isArray(record.texts) || record.texts.some(part => !string(part))) return null
      kinds.push('text'); text += record.texts.join('')
    } else if (record.type === 'reasoning-chunks') {
      if (!Array.isArray(record.texts) || record.texts.some(part => !string(part))) return null
      kinds.push('reasoning'); reasoning += record.texts.join('')
    } else if (record.type === 'tool-call-chunks') {
      if (!string(record.id) || (record.name !== undefined && !string(record.name)) || !Array.isArray(record.args) || record.args.some(part => !string(part))) return null
      kinds.push('tool-call'); toolCalls.push({ id: record.id, ...(record.name !== undefined ? { name: record.name } : {}) })
    } else if (record.type === 'chunk') {
      const chunk = record.chunk
      if (!object(chunk) || !string(chunk.type)) return null
      if (chunk.type === 'finish') { finish = activityFinishFacts(chunk.reason); if (!finish) return null }
      else if (['text-delta', 'reasoning-delta', 'tool-call-delta', 'block-start', 'block-end', 'usage'].includes(chunk.type)) { /* framing only */ }
      else return null
    } else return null
  }
  return { blockKinds: sorted(kinds), text, reasoning, toolCalls, finish }
}
const activityMessageBlocks = (content) => {
  if (!Array.isArray(content)) return null
  const kinds = [], toolCalls = []
  let text = '', reasoning = ''
  for (const block of content) {
    if (!object(block) || !string(block.type)) return null
    if (block.type === 'text') { if (!string(block.text)) return null; kinds.push('text'); text += block.text }
    else if (block.type === 'reasoning') { if (!string(block.text)) return null; kinds.push('reasoning'); reasoning += block.text }
    else if (block.type === 'tool-call') { if (!string(block.id) || !string(block.name) || !string(block.arguments)) return null; kinds.push('tool-call'); toolCalls.push({ id: block.id, name: block.name }) }
    else if (block.type === 'image') { kinds.push('image') }
    else if (block.type === 'file') { kinds.push('file') }
    else kinds.push(String(block.type))
  }
  return { blockKinds: sorted(kinds), text, reasoning, toolCalls }
}
function decodeActivityEvent(type, data) {
  const invalid = { invalid: true }
  if (type === 'tool/call') {
    if (!object(data) || !nonnegative(data.turn) || !nonnegative(data.step) || !string(data.callId) || !data.callId || !string(data.name) || !data.name || !string(data.arguments)) return invalid
    return { fact: { kind: 'tool-call', turn: data.turn, step: data.step, callId: data.callId, name: data.name, arguments: data.arguments } }
  }
  if (type === 'tool/result') {
    const message = data?.message
    if (!object(data) || !nonnegative(data.turn) || !nonnegative(data.step) || !object(message) || message.role !== 'tool' || !string(message.toolCallId) || !message.toolCallId || (message.isError !== undefined && typeof message.isError !== 'boolean')) return invalid
    const blocks = activityMessageBlocks(message.content)
    if (!blocks) return invalid
    let error
    if (data.error !== undefined) {
      const value = data.error
      if (!object(value) || !string(value.name) || !string(value.code) || (value.reason !== undefined && !string(value.reason))) return invalid
      error = { name: value.name, code: value.code, ...(value.reason !== undefined ? { reason: value.reason } : {}) }
    }
    // Native error metadata is optional even when isError is true; preserve its absence.
    return { fact: { kind: 'tool-result', turn: data.turn, step: data.step, callId: message.toolCallId, isError: message.isError === true, text: blocks.text, ...(blocks.blockKinds.includes('image') ? { blockKinds: blocks.blockKinds } : {}), ...(error ? { error } : {}) } }
  }
  if (type === 'job/registered' || type === 'job/settled') {
    const validToolCall = (value) => object(value) && string(value.callId) && string(value.rootCallId)
    if (!object(data) || !string(data.jobId) || !data.jobId || !string(data.owner) || !data.owner || !string(data.kind) || !string(data.label) || !nonnegative(data.startedAt) || (data.toolCall !== undefined && !validToolCall(data.toolCall))) return invalid
    const common = { jobId: data.jobId, owner: data.owner, producerKind: data.kind, label: data.label, startedAt: data.startedAt, ...(data.toolCall !== undefined ? { toolCall: { callId: data.toolCall.callId, rootCallId: data.toolCall.rootCallId } } : {}) }
    if (type === 'job/registered') return { fact: { kind: 'job-registered', ...common } }
    if (!nonnegative(data.finishedAt) || !['completed', 'killed', 'failed'].includes(data.status) || !['producer', 'kill', 'teardown'].includes(data.cause) || typeof data.producerReported !== 'boolean' || (data.detail !== undefined && !string(data.detail))) return invalid
    return { fact: { kind: 'job-settled', ...common, finishedAt: data.finishedAt, status: data.status, cause: data.cause, producerReported: data.producerReported, ...(data.detail !== undefined ? { detail: data.detail } : {}) } }
  }
  if (type === 'assistant/message') {
    if (!object(data) || !nonnegative(data.turn) || !nonnegative(data.step) || !object(data.message) || data.message.role !== 'assistant') return invalid
    const blocks = activityMessageBlocks(data.message.content)
    const stream = activityStreamFacts(data.stream)
    if (!blocks || !stream) return invalid
    return { fact: { kind: 'assistant-message', turn: data.turn, step: data.step, blockKinds: blocks.blockKinds, text: blocks.text, reasoning: blocks.reasoning, textLength: blocks.text.length, reasoningLength: blocks.reasoning.length, toolCalls: blocks.toolCalls, finish: stream.finish, interrupted: data.interrupted === true } }
  }
  if (type === 'assistant/attempt') {
    if (!object(data) || !nonnegative(data.turn) || !nonnegative(data.step)) return invalid
    const stream = activityStreamFacts(data.stream)
    if (!stream) return invalid
    return { fact: { kind: 'assistant-attempt', turn: data.turn, step: data.step, blockKinds: stream.blockKinds, textLength: stream.text.length, reasoningLength: stream.reasoning.length, toolCalls: stream.toolCalls, finish: stream.finish } }
  }
  if (type === 'turn/end') {
    if (!object(data) || !nonnegative(data.turn) || !object(data.reason) || !string(data.reason.kind)) return invalid
    const reason = { kind: data.reason.kind }
    if (data.reason.kind === 'error') {
      const failure = activityFailureFacts(data.reason.error)
      if (!failure) return invalid
      reason.failure = failure
    } else if (data.reason.kind === 'aborted') {
      const cause = data.reason.reason
      if (!object(cause) || !string(cause.kind) || (cause.reason !== undefined && !string(cause.reason))) return invalid
      reason.cause = { kind: cause.kind, ...(cause.reason !== undefined ? { reason: cause.reason } : {}) }
    } // TurnEndReasonMap is merge-extensible: retain an unfamiliar recorded kind, not a closed-list refusal.
    return { fact: { kind: 'turn-end', turn: data.turn, reason } }
  }
  if (type === 'llm/retry') {
    if (!object(data) || !string(data.retryId) || !nonnegative(data.turn) || !nonnegative(data.step) || !string(data.provider) || !['normal', 'always'].includes(data.mode) || !string(data.policyKey) || !nonnegative(data.retry) || !nonnegative(data.delayMs)) return invalid
    const failure = activityFailureFacts(data.failure)
    if (!failure) return invalid
    if (data.mode === 'normal' && !nonnegative(data.maxRetries)) return invalid
    return { fact: { kind: 'llm-retry', retryId: data.retryId, turn: data.turn, step: data.step, provider: data.provider, mode: data.mode, policyKey: data.policyKey, retry: data.retry, ...(data.mode === 'normal' ? { maxRetries: data.maxRetries } : {}), delayMs: data.delayMs, failure } }
  }
  if (type === 'llm/retry-started') {
    if (!object(data) || !string(data.retryId) || !nonnegative(data.turn) || !nonnegative(data.step) || !nonnegative(data.retry)) return invalid
    return { fact: { kind: 'llm-retry-started', retryId: data.retryId, turn: data.turn, step: data.step, retry: data.retry } }
  }
  return null
}
/**
 * SDK0.1.13 additive: decode one committed session event into raw-but-faithful activity fields
 * for the Lead's recent-activity query. Recognized kinds carry exactly the recorded fields; an
 * unrecognized event type returns `{kind:'other', type}` so a consumer can still place it in the
 * window. No verdict, health label, or inferred failure class is produced here.
 * @param input - a stored SessionEvent, or `{type:'event', event}` as some call seams wrap it.
 * @returns the decoded fact plus seq/time metadata; diagnostics instead of a value when malformed.
 */
export function activityEventFacts(input) {
  const event = input?.type === 'event' ? input.event : input
  if (!object(event) || !string(event.type) || !event.type) return result(null, missing('session-log-events', msg("diag.session-log-events.session-event-envelope-is-unavailable")))
  if ((event.seq !== undefined && (!Number.isSafeInteger(event.seq) || event.seq < 0 || Object.is(event.seq, -0))) || (event.time !== undefined && !Number.isSafeInteger(event.time))) return result(null, missing('session-log-events', msg("diag.session-log-events.activity-event-has-invalid-seq-time-metadata")))
  const activity = decodeActivityEvent(event.type, event.data)
  if (activity === null) {
    const known = sessionEventFacts(event)
    if (known.value) return result({ ...known.value, ...(event.seq !== undefined ? { seq: event.seq } : {}), ...(event.time !== undefined ? { time: event.time } : {}) }, known.diagnostics)
    if (known.diagnostics.length) return known
    return result({ kind: 'other', eventType: event.type, ...(event.seq !== undefined ? { seq: event.seq } : {}), ...(event.time !== undefined ? { time: event.time } : {}) })
  }
  if (activity.invalid) return result(null, missing('session-log-events', msg("diag.session-log-events.recognized-session-event-has-malformed-payload")))
  return result({ ...activity.fact, ...(event.seq !== undefined ? { seq: event.seq } : {}), ...(event.time !== undefined ? { time: event.time } : {}) })
}
export function sessionEventFacts(input) {
  const event=input?.type === 'event' ? input.event : input
  const decoded=decodeSessionEventFacts(event)
  if(!decoded.value)return decoded
  if((event.seq !== undefined && (!Number.isSafeInteger(event.seq) || event.seq < 0 || Object.is(event.seq,-0))) || (event.time !== undefined && !Number.isSafeInteger(event.time)))return result(null,missing('session-log-events', msg("diag.session-log-events.recognized-session-event-has-invalid-seq-time")))
  return result({...decoded.value,...(event.seq !== undefined ? {seq:event.seq} : {}),...(event.time !== undefined ? {time:event.time} : {})},decoded.diagnostics)
}
function decodeSessionEventFacts(input) {
  const event = input?.type === 'event' ? input.event : input
  if (!object(event) || !string(event.type)) return result(null,missing('session-log-events', msg("diag.session-log-events.session-event-envelope-is-unavailable-2")))
  const data = event.data
  const invalid = () => result(null,missing('session-log-events', msg("diag.session-log-events.recognized-session-event-has-malformed-payload-2")))
  if (event.type === 'user/message') {
    if(!object(data) || data.role !== 'user' || !object(data.source) || !string(data.source.kind) || !data.source.kind || !Array.isArray(data.content) || data.content.some(block=>block?.type === 'text' && !string(block.text)))return invalid()
    // A user ROLE is not a human source: injected instructions/goal continuations
    // are also user-role messages. This is the native activity consumer predicate.
    return result({kind:'user-message',text:data.content.filter(block=>block?.type === 'text').map(block=>block.text).join('\n'),source:data.source.kind,isHuman:data.source.kind === 'user'})
  }
  if (event.type === 'assistant/message') {
    const message = assistantMessageFacts(event,{view:'event'})
    return result(message.value ? {kind:'assistant-message',message:message.value} : null,message.diagnostics)
  }
  if (event.type === 'turn/start') return object(data) && Number.isSafeInteger(data.turn) ? result({kind:'turn-start',turn:data.turn}) : invalid()
  if (event.type === 'todo/write') {
    if (!Array.isArray(data?.todos) || data.todos.some(row=>!string(row?.content)||!['pending','in_progress','completed'].includes(row.status))) return invalid()
    return result({kind:'todo-write',todos:data.todos.map(row=>({content:row.content,status:row.status}))})
  }
  if (event.type === 'goal/change') {
    if (!object(data) || data.kind !== 'goal/change' || data.version !== 1) return invalid()
    const identity = value => string(value) && value.length > 0
    const integer = value => Number.isSafeInteger(value) && value >= 0
    const revision = value => integer(value) && value > 0
    if (data.operation === 'clear') {
      // Native clear carries a GoalRef plus clearedAt, not another goal snapshot.
      if ((data.cleared !== undefined && (!object(data.cleared) || !identity(data.cleared.id) || !revision(data.cleared.revision))) || (data.clearedAt !== undefined && !integer(data.clearedAt))) return invalid()
      return result({kind:'goal-change',goal:null,...(data.cleared ? {clearedId:data.cleared.id,revision:data.cleared.revision} : {}),...(data.clearedAt !== undefined ? {updatedAt:data.clearedAt} : {})})
    }
    if (!['create','edit','pause','resume','complete','block'].includes(data.operation) || !object(data.goal) || !string(data.goal.objective) || !revision(data.goal.maxGoalRounds)) return invalid()
    const goal=data.goal
    if ((goal.id !== undefined && !identity(goal.id)) || (goal.revision !== undefined && !revision(goal.revision)) || (data.createdAt !== undefined && !integer(data.createdAt)) || (data.updatedAt !== undefined && !integer(data.updatedAt)) || (data.createdAt !== undefined && data.updatedAt !== undefined && data.updatedAt < data.createdAt) || (goal.phase !== undefined && !['active','paused','blocked','complete'].includes(goal.phase))) return invalid()
    return result({kind:'goal-change',goal:{...(goal.id !== undefined ? {id:goal.id} : {}),...(goal.revision !== undefined ? {revision:goal.revision} : {}),objective:goal.objective,maxRounds:goal.maxGoalRounds,...(goal.phase !== undefined ? {status:goal.phase} : {}),...(data.createdAt !== undefined ? {createdAt:data.createdAt} : {}),...(data.updatedAt !== undefined ? {updatedAt:data.updatedAt} : {})}})
  }
  // SDK0.1.11 additive persisted selection intent; not a wire `next` guess.
  if (event.type === 'model/selection') {
    if (!object(data)||!string(data.provider)||!data.provider||!string(data.model)||!data.model||(data.reasoningEffort !== undefined && (!string(data.reasoningEffort)||!data.reasoningEffort))) return invalid()
    return result({kind:'model-selection',route:{provider:data.provider,model:data.model,...(data.reasoningEffort !== undefined ? {effort:data.reasoningEffort} : {})}})
  }
  if (event.type === 'request/header') {
    const config = data?.header?.config
    if (!object(config)||!string(config.provider)||!string(config.model)) return invalid()
    return result({kind:'request-header',route:{provider:config.provider,model:config.model,...(string(config.reasoningEffort)?{effort:config.reasoningEffort}:{})}})
  }
  // SDK0.1.12: parent-owned discovery fact, distinct from the child's descriptor.
  // SDK0.1.14: catalog payload v3 (DSH 0.2.2) adds the sibling-unique agent name.
  if (event.type === 'subagent/catalog') {
    if (!object(data)||Object.keys(data).some(key=>!['version','childId','childCreatedAt','mode','label','name'].includes(key))||!string(data.childId)||!Number.isSafeInteger(data.childCreatedAt)||data.childCreatedAt<0||(data.label!==undefined&&!string(data.label))) return invalid()
    const named=data.version===3&&['continuable','external'].includes(data.mode)&&string(data.name)&&/^[a-z][a-z0-9-]{0,31}$/.test(data.name)
    const valid=named||(data.name===undefined&&((['one-shot','continuable'].includes(data.mode)&&[0,1].includes(data.version))||(data.mode==='external'&&data.version===2)||(data.mode==='unknown'&&data.version===1)))
    if(!valid||(data.mode==='continuable'&&!string(data.label)))return invalid()
    return result({kind:'subagent-catalog',child:{sessionId:data.childId,createdAt:data.childCreatedAt,mode:data.mode,...(data.label!==undefined?{label:data.label}:{}),...(named?{name:data.name}:{})}})
  }
  if (event.type === 'subagent/descriptor') {
    if (!object(data)||!string(data.id)) return invalid()
    return result({kind:'subagent-descriptor',childId:data.id,...(string(data.description)?{description:data.description}:{}),mode:['one-shot','continuable'].includes(data.mode)?data.mode:'unknown'})
  }
  if (event.type === 'team/member') {
    const member=data?.member
    if (!object(member)||!string(member.id)) return invalid()
    return result({kind:'team-member',member:{sessionId:member.id,...(string(member.name)?{name:member.name}:{}),...(string(member.role)?{role:member.role}:{}),...(string(member.status)?{status:member.status}:{})}})
  }
  return result(null)
}
export function promptSectionConvention(kind) {
  const values = {
    'team-policy':{key:'team:policy',orderKey:'TEAM_POLICY'},
    'deployment-persona':{key:'deployment:persona-prefix',orderKey:'DEPLOYMENT_PERSONA_PREFIX'},
    // Native delegation context keys are tool:<configured toolName>:depth.
    // There is no one universal concrete key. Only the order key is stable.
    'subagent-delegation':{key:'',orderKey:'SUBAGENT_DELEGATION'},
    mcp:{key:'mcp:',orderKey:MCP_SECTION_ORDER_KEY},
  }
  if (!Object.hasOwn(values,kind)) throw new TypeError('Unknown prompt convention')
  return freeze(values[kind])
}
export function wrapSystemReminder(text) { return REMINDER_OPEN + '\n' + String(text ?? '').replaceAll(REMINDER_CLOSE,'<\\/system-reminder>') + '\n' + REMINDER_CLOSE }
export function nativePresentationMode() { return 'native' }
export function resourceAddress(input) {
  const invalid = () => result({openable:false},missing('resource-address', msg("diag.resource-address.unsupported-resource-kind-mode-or-invalid-identity")))
  const valid = value => string(value) && value.length > 0 && !value.includes('\0')
  if (!object(input)) return invalid()
  try {
    if (input.kind === 'subagent') {
      if (!valid(input.parentId) || !valid(input.childId) || (input.mode !== undefined && !['one-shot','continuable','unknown'].includes(input.mode))) return invalid()
      const mode=input.mode ?? 'unknown'
      const query=new URLSearchParams({parent:input.parentId,mode})
      return result({address:'dsh-resource://subagentchat/session/'+encodeURIComponent(input.childId)+'?'+query.toString(),resourceKind:'subagentchat',navigationTarget:{parentSessionId:input.parentId,childSessionId:input.childId,mode},openable:true})
    }
    // Native SessionTarget is an id, not a resource protocol/URI.
    if (input.kind === 'session' && valid(input.sessionId)) return result({navigationTarget:input.sessionId,openable:true})
    if (input.kind === 'file' && valid(input.sessionId) && valid(input.path)) {
      // Exact dsh-util-workspace-path sessionFileAddress grammar; no filesystem I/O.
      const encodeSegment = segment => encodeURIComponent(segment).replace(/%3A/gi,':')
      const normalized=input.path.replace(/\\/g,'/').replace(/^(?:\.\/)+/,'')
      return result({address:'dsh-resource://file/session/'+encodeSegment(input.sessionId)+'/'+normalized.split('/').map(encodeSegment).join('/'),resourceKind:'text',openable:true})
    }
  } catch { /* Unencodable UTF-16 is invalid data, not a thrown host action. */ }
  return invalid()
}
export function resolvedGoalDefaults(config) {
  return object(config)&&Number.isSafeInteger(config.defaultMaxGoalRounds)&&config.defaultMaxGoalRounds>0 ? result({maxGoalRounds:config.defaultMaxGoalRounds}) : result({},missing('goal-defaults', msg("diag.goal-defaults.resolved-native-goal-default-is-unavailable")))
}
export function instructionLoaderFacts({resolvedConfig,fileEvidence = [],loadEvidence} = {}) {
  const diagnostics=[], files=[]
  const config=object(resolvedConfig)?resolvedConfig:null
  const names = config && Array.isArray(config.instructionFileCandidates) && Array.isArray(config.localInstructionFileCandidates) ? [...config.instructionFileCandidates,...config.localInstructionFileCandidates] : []
  const validName=name=>string(name)&&name&&!['.','..'].includes(name)&&!/[\\/]/.test(name)
  const candidates=names.every(validName)?unique(names):[]
  const maxBytes=config&&Number.isFinite(config.maxBytes)&&config.maxBytes>=0?config.maxBytes:undefined
  if (!config || maxBytes === undefined || !candidates.length) diagnostics.push(diag('instruction-loader', msg("diag.instruction-loader.effective-native-instruction-configuration-is-unknow")))
  const message=loadEvidence?.message
  const source=message?.source
  const rendered=loadEvidence?.rendered
  const messageText=Array.isArray(message?.content)?message.content.filter(part=>part?.type==='text'&&string(part.text)).map(part=>part.text).join('\n'):''
  // A supplied render trace is useful only when corroborated by genuine admitted
  // producer-tagged message text. A digest alone never proves included bytes.
  const admitted=message?.role==='user'&&source?.kind==='agent-instructions'&&source?.form==='instructions'&&Array.isArray(source.changes)
    &&object(rendered)&&string(rendered.text)&&rendered.text.length>0&&messageText.includes(rendered.text)
    &&Array.isArray(rendered.omitted)&&Array.isArray(rendered.truncated)
  for (const file of Array.isArray(fileEvidence)?fileEvidence:[]) {
    const path=string(file?.absolutePath)?file.absolutePath:string(file?.path)?file.path:null
    if (!path) { diagnostics.push(diag('instruction-loader', msg("diag.instruction-loader.an-instruction-file-fact-has-no-exact"))); continue }
    const bytes=nonnegative(file.bytes)?file.bytes:undefined
    let status='unknown',loadedBytes,reason=msg('diag.instruction-loader.no-evidence-for-actual-injected-bytes', undefined, SDK_NAMESPACE)
    if (file.exists === false && file.evidence === 'current-stat') { status='missing'; reason=msg('diag.instruction-loader.current-file-state-is-missing', undefined, SDK_NAMESPACE) }
    if (admitted && source.changes.some(change=>['set','replace'].includes(change.action)&&change.path===path)) {
      const omitted=rendered.omitted.find(row=>row.absolutePath===path || (file.displayPath&&row.displayPath===file.displayPath))
      const truncated=rendered.truncated.find(row=>row.absolutePath===path || (file.displayPath&&row.displayPath===file.displayPath))
      if (omitted) { status='over-budget'; loadedBytes=0; reason=msg('diag.instruction-loader.file-exceeds-batch-budget', undefined, SDK_NAMESPACE) }
      else if (truncated && nonnegative(truncated.includedBytes)) { status='truncated'; loadedBytes=truncated.includedBytes; reason=msg('diag.instruction-loader.file-injected-prefix-only', undefined, SDK_NAMESPACE) }
      else if (string(file.content)&&string(file.displayPath)&&rendered.text.includes('Instructions from: '+file.displayPath+'\n\n'+file.content.replaceAll(REMINDER_CLOSE,'<\\/system-reminder>'))) { status='loaded'; loadedBytes=new TextEncoder().encode(file.content).length; reason=msg('diag.instruction-loader.full-body-present-in-render', undefined, SDK_NAMESPACE) }
    }
    if (status==='unknown') diagnostics.push(diag('instruction-loader', msg("diag.instruction-loader.file-identity-existence-does-not-establish-full")))
    files.push({path,status,...(bytes!==undefined?{bytes}:{}),...(loadedBytes!==undefined?{loadedBytes}:{}),reason})
  }
  return result({candidates,...(maxBytes!==undefined?{maxBytes}:{}),files},diagnostics)
}

const BASIS_ROWS = /* @__PURE__ */ Object.freeze([
  ['mcp-tool-name',MCP_CLIENT,'Public server-qualified names; longest known/hint namespace before fallback.'],
  ['configured-mcp',MCP_CLIENT,'Configured serverName metadata; never a negative roster.'],
  ['mcp-section-name',MCP_CLIENT,'mcp:<server> section identities in mask-free views.'],
  ['resource-section','@deepseek-ai/dsh-mcp-resources','Native resource section JSON envelope and safe rewrite.'],
  ['resource-tool-names','@deepseek-ai/dsh-mcp-resources','Three native resource dispatch tools and server argument.'],
  ['reserved-transport','@deepseek-ai/dsh-tools','Reserved presentation transport corroborated only in non-native schemas.'],
  ['restriction-error','@deepseek-ai/dsh-tools','Exact unknown-global-name rejection syntax.'],
  ['registration-provenance','@deepseek-ai/dsh-tools','Public registration labels and resolved owner evidence, not counts per name.'],
  ['skill-dispatch','@deepseek-ai/dsh-tool-skill','Native skill loading tool and name argument.'],
  ['skill-name','@deepseek-ai/dsh-skill','Native kebab-case skill namespace.'],
  ['subagent-provider','@deepseek-ai/dsh-subagent-spawn-in-process','Native factory default spawn; actual registry/configuration remains authoritative.'],
  ['compact-command','@deepseek-ai/dsh-command-compact','Native compact command name and definition identity.'],
  ['session-header','@deepseek-ai/dsh-session','Native session header ancestry, cwd, origin and depth fields.'],
  ['session-log-events','@deepseek-ai/dsh-session','Versioned native event envelopes, optional seq/time and normalized message payloads.'],
  ['session-log-events','@deepseek-ai/dsh-api-session-controller','Native genuine-human user/message source predicate (activity metadata1874 and forwarder3002).'],
  ['prompt-sections','@deepseek-ai/dsh-system-prompt','Public section/context order keys; no numeric fallback.'],
  ['system-reminder-wrapper','@deepseek-ai/dsh-agent-instructions','Native instruction frame with escaped closing marker.'],
  ['native-presentation','@deepseek-ai/dsh-tools','Explicit scoped native presentation, not ownership.'],
  ['resource-address','@deepseek-ai/dsh-client-resources','Native resource protocol model; host-computed addresses and kinds.'],
  ['resource-address','@deepseek-ai/dsh-util-workspace-path','Pure sessionFileAddress codec for native file paths.'],
  ['resource-address','@deepseek-ai/dsh-client-ui-sidebar-documentpreview','Native registered file preview Sidebar kind text (client.js1053,1079–1085).'],
  ['resource-address','@deepseek-ai/dsh-client-ui-subagent','Native subagentchat address, mode and Sidebar kind.'],
  ['resource-address','@deepseek-ai/dsh-api-session-controller','Native SessionTarget id/direct-parent data; no fake root-session URI.'],
  ['session-log-events','@deepseek-ai/dsh-goal','Native goal/change identity, revision, epoch timestamps and clear tombstone.'],
  ['instruction-loader','@deepseek-ai/dsh-agent-instructions','Effective per-provider config; genuine admission/render evidence, never existence alone.'],
  ['goal-defaults','@deepseek-ai/dsh-goal','Resolved defaultMaxGoalRounds value.'],
  ['model-selection','@deepseek-ai/dsh-agent','Native state pending differs from wire next; Agent-owned since 0.2.1-alpha.4; select through agent.model.select().'],
  ['context-pressure','@deepseek-ai/dsh-token-meter','Explicit state/wire occupancy with native signed surface projection.'],
  ['retained-composition','@deepseek-ai/dsh-agent-preset-registry','Retired generations held by live Agents; current leases do not cover them.'],
  ['superagent-identity','unresolved:optional-orchestrator-owner','Legacy preset/worker/service hints are not verified owning-package evidence.'],
])
// Conventions are verified per release by reading that release's source. A convention re-read on a
// newer release lists it here; any other convention stays verified only on the release it was read on.
const BASIS_VERIFIED = /* @__PURE__ */ Object.freeze({
  base: '0.2.1-rc.2',
  // SDK0.1.14: re-read on the installed DSH 0.2.2-rc.2 sources.
  '0.2.2-rc.2': Object.freeze(['mcp-tool-name','resource-tool-names','reserved-transport','restriction-error','skill-dispatch','skill-name','subagent-provider','compact-command','session-header','prompt-sections','context-pressure','model-selection','configured-mcp','mcp-section-name','resource-section','registration-provenance','session-log-events','system-reminder-wrapper','resource-address','instruction-loader','goal-defaults','retained-composition']),
})
const basisVersions = (inference,ownerPackage) => ownerPackage.startsWith('unresolved:') ? [] : [BASIS_VERIFIED.base,...Object.entries(BASIS_VERIFIED).filter(([version,rows])=>version!=='base'&&(rows.includes(inference)||rows.includes(inference+'@'+ownerPackage))).map(([version])=>version)]
const makeManifest = () => [
  ...BASIS_ROWS.map(([inference,ownerPackage,convention])=>({inference,ownerPackage,convention,verifiedPackageVersions:basisVersions(inference,ownerPackage),evidenceRequired:convention})),
  // Tool classes are verified on exactly the package versions their reviewed evidence sites name.
  ...sorted(NATIVE_ROWS.map(row=>row[2])).map(ownerPackage=>({inference:'native-tool-classes',ownerPackage,convention:'Inspected exact native definitions; not per-scope ownership or role entitlement.',verifiedPackageVersions:sorted(NATIVE_TOOL_EFFECTS.filter(row=>row.ownerPackage===ownerPackage).map(row=>row.packageVersion)),evidenceRequired:'A matching exact native schema/definition plus owning package version.'})),
]
export const DSH_CONVENTIONS = /* @__PURE__ */ freeze(makeManifest())
export const VERIFIED_PACKAGE_VERSIONS = /* @__PURE__ */ freeze(Object.fromEntries(DSH_CONVENTIONS.map(row=>[row.ownerPackage,row.verifiedPackageVersions])))
export function selfCheck(evidence) {
  const checks=[],diagnostics=[]
  if (!object(evidence)) return freeze({complete:false,checks,diagnostics:missing('registration-provenance', msg("diag.registration-provenance.adapter-evidence-is-unavailable"))})
  const schemas=Array.isArray(evidence.toolSchemas)?evidence.toolSchemas:[]
  const names=new Set(schemas.map(row=>row.name))
  const loader=scanConfiguredServers(evidence.loaderRows,{traversalComplete:evidence.loaderTraversalComplete})
  const sections=serversFromSections(evidence.sectionViews)
  const resourceSections=(Array.isArray(evidence.sectionViews)?evidence.sectionViews:[]).flatMap(view=>Array.isArray(view.sections)?view.sections.filter(section=>section.name===MCP_RESOURCE_SECTION_NAME):[])
  const resourceResults=resourceSections.map(parseResourceSection)
  const known=sorted([...loader.value.map(row=>row.name),...sections.value,...resourceResults.flatMap(item=>item.value)])
  const mcpResults=schemas.filter(row=>string(row.name)&&row.name.startsWith('mcp__')).map(row=>parseMcpToolName(row.name,known))
  const configuredApplicable=(Array.isArray(evidence.loaderRows)?evidence.loaderRows:[]).some(row=>row.packageName===MCP_CLIENT||row.moduleName===MCP_CLIENT)
  const additional=object(evidence.conventionEvidence)?evidence.conventionEvidence:{}
  for (const basis of DSH_CONVENTIONS) {
    let applicable=false, observed=true, local=[]
    const id=basis.inference
    if (id==='configured-mcp') { applicable=configuredApplicable||!evidence.loaderTraversalComplete; observed=configuredApplicable; local=loader.diagnostics }
    else if (id==='mcp-section-name') { applicable=sections.value.length>0||sections.diagnostics.length>0; local=sections.diagnostics }
    else if (id==='mcp-tool-name') { applicable=mcpResults.length>0; local=mcpResults.flatMap(item=>item.diagnostics) }
    else if (id==='resource-section') { applicable=resourceSections.length>0; local=resourceResults.flatMap(item=>item.diagnostics) }
    else if (id==='resource-tool-names') {
      applicable=resourceResults.some(item=>item.value.length)||MCP_RESOURCE_TOOL_NAMES.some(name=>names.has(name))
      if (applicable && MCP_RESOURCE_TOOL_NAMES.some(name=>!schemas.some(row=>row.name===name&&object(row.parameters?.properties?.server)))) local=missing(id, msg("diag.check.positive-resource-evidence-lacks-the-expected-resour"))
    }
    else if (id==='reserved-transport') { applicable=(evidence.nonNativeToolSchemas||[]).some(row=>row.name===RESERVED_TRANSPORT); observed=applicable }
    else if (id==='restriction-error') { applicable=string(evidence.restrictionFailureMessage); if(applicable) local=unknownRestrictionNames(evidence.restrictionFailureMessage).diagnostics }
    else if (id==='registration-provenance') {
      applicable=(evidence.registrationEffects||[]).length>0||!evidence.registrationTraversalComplete
      if(applicable) local=auditRegistrationEvidence(evidence.registrationEffects,{traversalComplete:evidence.registrationTraversalComplete,familyPackages:evidence.familyPackages,declaredFamilyPackages:evidence.declaredFamilyPackages}).diagnostics
    }
    else if (id==='native-tool-classes') applicable=NATIVE_ROWS.some(row=>row[2]===basis.ownerPackage&&names.has(row[0]))
    else if (id==='skill-dispatch') {
      applicable=names.has(SKILL_TOOL_NAME)
      if(applicable&&!schemas.some(row=>row.name===SKILL_TOOL_NAME&&object(row.parameters?.properties?.name))) local=missing(id, msg("diag.check.skill-tool-schema-does-not-expose-its"))
    }
    else if (additional[id] !== undefined) {
      applicable=true
      const item=additional[id]
      if (id==='context-pressure') local=contextPressureFacts(item?.value,{view:item?.view}).diagnostics
      else if (id==='model-selection') local=modelSelectionFacts(item?.value,{view:item?.view}).diagnostics
      else if (id==='session-header') local=sessionHeaderFacts(item).diagnostics
      else if (id==='session-log-events') {
        const event=item?.type === 'event' ? item.event : item
        applicable=basis.ownerPackage === '@deepseek-ai/dsh-goal' ? event?.type === 'goal/change' : basis.ownerPackage === '@deepseek-ai/dsh-api-session-controller' ? event?.type === 'user/message' : true
        if(applicable) local=sessionEventFacts(item).diagnostics
      }
      else if (id==='resource-address') {
        applicable=basis.ownerPackage === '@deepseek-ai/dsh-client-resources' ? item?.kind !== 'session' : ['@deepseek-ai/dsh-util-workspace-path','@deepseek-ai/dsh-client-ui-sidebar-documentpreview'].includes(basis.ownerPackage) ? item?.kind === 'file' : basis.ownerPackage === '@deepseek-ai/dsh-client-ui-subagent' ? item?.kind === 'subagent' : ['session','subagent'].includes(item?.kind)
        if(applicable) local=resourceAddress(item).diagnostics
      }
      else if (id==='retained-composition' && item?.complete !== true) local=missing(id, msg("diag.check.retained-live-composition-coverage-is-incomplete"))
      else if (id==='instruction-loader') local=instructionLoaderFacts(item).diagnostics
      else if (id==='goal-defaults') local=resolvedGoalDefaults(item).diagnostics
      else if (id==='superagent-identity') local=superagentIdentity(item).diagnostics
      else if (item?.complete === false) local=missing(id, msg("diag.check.applicable-convention-evidence-is-incomplete"))
    }
    if (!applicable) { checks.push({inference:id,ownerPackage:basis.ownerPackage,state:'not-observed',evidence:'No applicable positive evidence; no mutating probe was made.'}); continue }
    const version=evidence.packageVersions?.[basis.ownerPackage]
    if (!basis.verifiedPackageVersions.includes(version)) local=[...local,diag(id,msg('diag.check.not-verified-on-owning-package-version', { package: basis.ownerPackage }))]
    diagnostics.push(...local)
    checks.push({inference:id,ownerPackage:basis.ownerPackage,...(string(version)?{actualVersion:version}:{}),state:local.length?'fail':observed?'pass':'not-observed',evidence:local.length?'Applicable evidence or owning-package verification failed.':basis.evidenceRequired})
  }
  return freeze({complete:diagnostics.length===0,checks,diagnostics})
}
