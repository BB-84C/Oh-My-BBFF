# DSH adapter API/spec — FROZEN v1.6 + additive SDK0.1.8/0.1.9/0.1.10

**FROZEN specification, 2026-11-08, with Lead-approved dated additive amendments.**
The canonical SDK runtime is implemented in `dsh-adapter.js`; exact declarations
are [dsh-adapter.d.ts](./dsh-adapter.d.ts). See [CONTRACT.md](./CONTRACT.md) for
all six original FROZEN v1.6 hashes retained as **superseded** provenance. In
particular the superseded DSH_ADAPTER.md hash is
2446551a6640fabfe03a9afccd3f30e44263088b88d1835ae0be60d38d88c78c and the
superseded adapter declaration hash is
bfe42180e7df69ab6f5aad02a82a8af76723e00551d0049966e1b156cd965a70.
SDK source readiness is not a root-provider deployment or installation grant.

## Amendment — 2026-11-13, SDK0.1.15 (DSH 0.2.2-rc.2)

Re-read and verify the catalog conventions (`configured-mcp`, `mcp-section-name`,
`resource-section`, `registration-provenance`, `retained-composition`), session-event
and resource-address codecs, reminder wrapper, instruction-loader and goal-default
contracts on installed 0.2.2-rc.2. This changes verification metadata only: the
0.1.14 decoders, public contract and native tool-effect table are unchanged.
Instruction `maxBytes` is a **per-chain** native value (global and project chains
separately), not a combined document budget. The optional uncorroborated
superagent identity and obsolete native-presentation convention are not promoted.
Native-module tests exercise goal/todo folds, instruction admission/rendering and
MCP manager dynamic zero-tool registration/withdrawal. The port lane's
`sdk-native-evidence.json` records the exact owning source/version/SHA evidence.

## Amendment — 2026-11-13, SDK0.1.14 (DSH 0.2.2-rc.2)

Purpose: run the family on DSH 0.2.2-rc.2 without frozen 0.2.1 facts.

- `NATIVE_TOOL_EFFECTS`, `NATIVE_TOOL_EFFECTS.md` and `NATIVE_TOOL_SOURCE_BASELINE.json` are regenerated from the installed 0.2.2-rc.2 packages by the new `scripts/rebase-native-tool-effects.mjs`. Reviewed effects carry forward by exact identity; only new identities need a review entry (0.2.2 review: `apply_patch` write, `schedule_edit` write, `schedule_view` read, `office_convert`/`office_recalculate`/`office_render` read, `user_terminal_list`/`user_terminal_read` read, `propose_action` read, `cua` write, live-share replacement factory unknown, `run_code` transport now owned by `dsh-tool-executor-ptc`). `verifyNativeToolCoverage` is complete against 0.2.2-rc.2 (74 rows, 178 sites). Rows of the removed `dsh-experimental-tool-agent-team` (including `spawn_teammate`, so `nativeToolGroup('team-spawn')` is now empty), `schedule_update`/`schedule_delete` and the `dsh-tools` run_code/fixture definitions are dropped; `team_task_*` moved to `dsh-tool-agent-team`, `wait_agent` to `dsh-tool-subagent-control`.
- `native-tool-classes` verified versions are derived from each row's evidence `packageVersion` instead of a literal. Basis conventions list the releases they were re-read on (`BASIS_VERIFIED`); conventions not re-read on 0.2.2 stay verified on 0.2.1-rc.2 only, so `selfCheck` still fails closed for them.
- `model-selection` is owned by `@deepseek-ai/dsh-agent` (Agent-owned projection; select through `agent.model.select()`).
- `sessionEventFacts` accepts `subagent/catalog` payload version 3 and returns the child `name`.

## Additive amendment — 2026-11-09, SDK0.1.13

Purpose: the owner-requested Lead recent-activity query. This is an on-demand additive capability, not a bug fix to existing consumers. Only `activityEventFacts(event)` and its private helpers are added; `sessionEventFacts` and `assistantMessageFacts` remain unchanged. Against 19 archived real event types both existing exports compare field-for-field with 0.1.12, 19/19 each; the new decoder acceptance suite has 30 passing checks.

The new fact vocabulary covers tool calls/results, job registration/settlement, assistant messages/attempts, turn ends and retry events, preserving seq/time. Tool results with `isError:true` but no optional `error` metadata decode without invented name/code; optional job/LlmFailure fields stay absent. `TurnEndReasonMap`, `FinishReasonMap` and content-block kinds remain extensible. Only genuinely closed native unions (job outcome/cause and retry mode) use closed lists. Team consumers own excerpt limits, call/result pairing and age calculation; the decoder emits no health classifications.

Intentional family byte-baseline transition: contract unchanged at **16,852 B / `72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115`**. Adapter 0.1.13 final is **134,182 B / `c4a91aae7f2912b3b1656a54502f52f8923710f0375a255b018ff73ecb130556`**. Prior 0.1.12 adapter is **122,322 B / `915027cb8fcac930e8781142b783457fe2422b8bb715226ecdb5ca82399920be`** (rollback provenance); pre-freeze `ff861275…` / 134,194 B was superseded before installation. All four family vendored copies must equal the final canonical file.

## Additive amendment — 2026-11-08, SDK0.1.12

Lead approved ONLY the parent `subagent/catalog` event variant. It normalizes to
`{kind:'subagent-catalog',child:{sessionId,createdAt,mode,label?},seq?,time?}`.
Producer versions0/1 one-shot/continuable, version1 unknown and version2 external
match the actual native projection stateVersion6, including strict malformed
payload rejection. Root consumers apply the public inherited-prefix cut and
maintain adjacency incrementally; they do not recursively observe every child.
Native projection plus actual Root fold-consumer test:27PASS/0FAIL.
Contract runtime bytes are unchanged. AdapterSHA256:
915027cb8fcac930e8781142b783457fe2422b8bb715226ecdb5ca82399920be.
One coordinated notice went to Scope/cards-fix, Team/settings-dev and
Memory/dreaming-dev; all three actual official sync/check ACKs received.
Further decoder variants require separate approval/version/hash notice.

## Additive amendment — 2026-11-08, SDK0.1.11

`sessionEventFacts` additionally decodes persisted `model/selection` as
`{kind:'model-selection', route:{provider,model,effort?},seq?,time?}`. This is
selection intent, distinct from request use. The existing explicit projection
state/wire decoder is unchanged and cannot accept an event payload as a state.
Cold consumers fold normalized selection intent and request-header facts, retaining
pending intent until a matching request consumes it, exactly as native
modelSelection stateVersion2. Unknown/malformed payloads remain diagnostic; raw
source fields never escape. Contract runtime SHA is unchanged.

Native reference: dsh-api-session-controller0.2.1-rc.2,
lib/types/model-selection-projection.js22–58. Tests capture the actual installed
projection definition and compare its wire view with the actual collaboration
consumer after each persisted suffix, including unmatched/matching requests.

Shared read seam: live public async `observeSession({projectionMode:'none'})`
baseline/on-change, then sequence-keyed normalized suffix fold; cold public
`sessionPersistence.identity` + session id + `stat.revision`, read-only
`handle.read(offset,length)`, always close. Bounded normalized DTO caches reuse for
at least15s; no raw log retention, full `readSession` replay, cold Session prepare,
all-projection hydration, or direct deprecated snapshotEvents/eventAt calls.
Backend reads may decode a full physical file on memo miss; offset is not a
physical-I/O guarantee. Measurements must therefore use the real backend.

Adapter SHA256:68f5a357d61bb4f82df15904c7ccc27611d82e1e663e0ecdf28f6f9b70ede5f6.
0.1.10 adapterSHA d3bc67e99ec4a1776f741bd192e1b3a97d0e5bd2decbfe7f1ae6815d59b0a36b
is superseded, not silently overwritten in release evidence.

## Additive amendment — 2026-11-08, SDK0.1.10

NATIVE_TOOL_EFFECTS is the complete reviewed installed-native source evidence
manifest:70 rows covering63 named identities, including one synthesized reserved
transport; two generic factories name no tool identities and dynamic MCP tools
remain upstream-owned unknown. All172 native definition/registration/configured
alias sites carry owner/version/file:line and exact source-call hashes. The human
readable table and all activation/conditional/shadow notes are in
NATIVE_TOOL_EFFECTS.md. This lists native capabilities, not current deployment
presence, caller entitlement or a name-to-live-definition ownership guarantee.

The source acceptance gate also checks the full NATIVE_TOOL_SOURCE_BASELINE.json
host/package corpus. Even a future registration spelling not understood by the
AST recognizer turns the gate red when its source/package changes. Synthetic
new-tool and unsupported-syntax tests prove the negative branch. This strict
upgrade review gate is not the runtime's package-local inference verification
and does not introduce a global runtime CLI-version switch.

nativeToolGroup('team-spawn') returns ONLY the native teammate-spawn tool, from
its exact native Team registration. Ordinary subagent/workflow delegation is not
part of this group. A real native registration fixture verifies group identity
and Team own-layer shadowing/restoration of send_message/list_agents/interrupt_agent
against the global subagent-control registrations; no tool body executes.

Session-only todo_write/present/exit_plan_mode/structured_output are read-class;
read/search spill files and job output cursors are bookkeeping. Shared Team board
create/update are write. Dynamic MCP effects are unknown with stated upstream
reason, never guessed read. Config-driven subagent/workflow names retain their
native defaults and shipped aliases; unresolved caller aliases require actual
evidence. run_code is a write-capable reserved transport; terminal capabilities
remain the enforcement boundary. Conditional workspace dependency installation
is recorded explicitly, not confused with its read-only path query branch.

The Team unknown-effect behavior is a VISIBLE policy, default allow, with per-tool
unknown status. Known write/delegate remain denied by readOnly. Neither the effect
map nor team-report/team-spawn membership creates an entitlement or bypass.

0.1.9 exact bytes/hashes are retained as superseded; contract.js is unchanged.

## Corrective/additive amendment — 2026-11-08, SDK0.1.9

File resourceKind is the Sidebar CONSUMER kind `text`, not protocol `file`.
Owning source: @deepseek-ai/dsh-client-ui-sidebar-documentpreview0.2.1-rc.2,
client.js1053 and1079–1085. The manifest now binds this inference to that owner.
SDK0.1.8 remains recorded as superseded with its exact contract/adapter hashes in
CONTRACT.md; archived0.1.8 bytes are not rewritten. contract.js bytes are unchanged.

The approved user-message variant is {kind:'user-message',text,source,isHuman}.
source is the native source-kind string only. text includes text blocks only,
newline-joined, uncapped/untrimmed; no raw source, tool payload or image escapes.
seq/time are optional metadata on EVERY recognized event variant. Absent stays
absent; a present invalid native envelope value is diagnosed, not guessed.
The genuine-human predicate matches actual native activity consumers in
@deepseek-ai/dsh-api-session-controller0.2.1-rc.2 index.js1874,3002. User role
alone does not imply a human: goal/instructions/plugin sources are false.

Public reader preference was checked before adding this DTO. The public
extractSessionEventText returns only text for all user-role producer messages;
public records/search documents provide seq/time/text but no source/isHuman
(dsh-session-query index.js545–629; types25–56). deriveEventMessage retains raw
native source/content layouts, not the complete normalized predicate. Tests
compare against the actual native human predicate and public metadata reader.

Native consumer boundary coverage also checks: file/child registered Sidebar
kinds; child codec/parser; primary SessionTarget and direct-parent target resolver;
actual scoped ToolRuntime native presentation and restriction rejection; public
prompt section/context order keys, persona and MCP section identities; actual MCP
resource renderer → adapter rewrite → native prompt registry; compact descriptor
versus actual registration without execution; spawn factory DEFAULT and provider
registration without creating a child; native registered projection keys. These
fixtures use a disposable Agent-free Cordis universe, not owner's live state.

## Additive amendment — 2026-11-08, SDK0.1.8

W11 adds resourceAddress({kind:'file',sessionId,path}). Exact segment encoding,
Windows separator normalization and leading ./ removal follow native
@deepseek-ai/dsh-util-workspace-path0.2.1-rc.2 sessionFileAddress. Result fields
resourceKind/navigationTarget are computed HOST-SIDE. File results carry the
native registered kind and address; subagent results also carry the native
SessionTarget direct-parent object. Root sessions carry navigationTarget=sessionId
and NO fake resource URI/kind. Clients pass these fields to public navigation/
Sidebar services; no copied scheme/kind/mode grammar. Unsupported modes/invalid
identities or unencodable paths return openable:false with diagnostics.

W12 adds optional id/revision/createdAt/updatedAt inside normalized goal facts.
For goal:null, clearedId and optional revision/updatedAt describe the tombstone
(native cleared.id/revision/clearedAt). All timestamps are epoch milliseconds
from native dsh-goal0.2.1-rc.2 durable changes. Malformed present fields are
incomplete, absent optional evidence remains absent; no raw-event escape hatch.
The native package's public goal-change decoder and file codec are exercised
read-only by fixtures; tests do not create/edit/clear goals or open sessions.

The §2.5.8 clarification permits only the last successful resolveRoot result per
already-attached agent as cached enforcement context while root is unavailable:
use as is, visibly timestamped cached, no ancestry walking or discovery, dropped
on agent dispose, replaced by fresh resolution. Never-resolved agents remain
unresolved. The exact normative wording is in CONTRACT.md.

## 1. Single convention layer and four-package coverage

The dependency-free PURE adapter is byte-identically vendored into ALL FOUR
convention-using packages: Widgets root, Scope, Team and Memory. The canonical
adapter and contract runtime each have their own byte/SHA gate, for source AND
installed packages. No runtime stubs, export/version changes or vendors are added
by this specification freeze. A manifest/declaration is not functioning implementation.

Adapter functions take projected plain evidence. They never receive Context,
invoke business services, discover via Loader/Fibers, acquire scopes, assemble
prompts, read/write files, subscribe, run tools, mutate models, create/wake Agents
or own a catalog. Root alone orchestrates discovery. Consumers may use adapter
primitives for mechanical enforcement over current arguments/cached provider
facts, not another discovery loop. No monkeypatch/prototype/registration hooks.

Never serialize/log raw configs, tokens, command environments, raw prompt bodies,
whole sessions or executable definitions. Loader config is input-only and only
recognized convention fields may be read. Outputs are named facts, normalized
DTOs, structured reasons and sanitized evidence. Resource addresses are computed
HOST-SIDE and sent to clients as data; clients carry no scheme/kind/mode copies.

## 2. Package-specific basis manifest — DECIDED Q4/S2

Each DSH_CONVENTIONS row binds an inference id to its owning package, exact
verified PACKAGE versions, its convention/basis and required evidence. Root reads
actual versions through pluginPackages.packageOf(...).version. There is NO global
CLI-version on/off gate. A mismatch/missing version degrades ONLY the owning
package's inferences, with 未在当前 DSH 版本上验证 and that package/inference's
reason. Other package inferences remain usable. Source inspection at0.2.1-rc.2
is draft grounding; implementation fixtures/live evidence must pass before a
version is called verified. An optional absent feature is not fabricated evidence.

| Inference group | Owning basis/evidence to verify |
|---|---|
| mcp-tool-name/configured-mcp/mcp-section-name | MCP client package's public-name, config and section registration contracts; known namespace identities; owning package version |
| resource-section/resource-tool-names | MCP resource package's section/parser/argument schema; mask-free views only |
| reserved-transport/restriction-error | ToolRuntime package reservation/error contracts. Reserved transport is corroborated ONLY when seen in non-native schemas; otherwise not-observed, not fail |
| registration-provenance | Public registration labels/resolved packages; tool-runtime/package-inventory contracts. Counts never map a particular name to a package |
| skill-dispatch/skill-name | Native skill loader/registry contracts and exported pattern; exact name argument rather than a copied regex |
| native-tool-classes | Per-tool owning native packages: write/edit/bash/pwsh/apply_patch/plugin_manager/schedule/goal functions and delegate functions including subagent/subagent_fork/workflow/spawn_teammate; native Team/report groups |
| superagent-identity/subagent-provider | Preset and worker-id conventions plus actual orchestrator service shape/owner; native spawn provider. Do not guess a package if optional superagent is absent/unresolvable |
| compact-command | Native compact package/definition id/name, checked against the real public command definition rather than any similarly named command |
| session-header | Native session/subagent header fields: parentSession/cwd/origin/delegationDepth/preset. Root ancestry rule is in the family contract |
| session-log-events | Owners of turn/start, todo/write, goal/change, request/header, subagent/descriptor and team/member schemas; normalize once, no client copies |
| prompt-sections | Native system-prompt/feature packages: TEAM_POLICY, DEPLOYMENT_PERSONA_PREFIX, SUBAGENT_DELEGATION and MCP section/order conventions |
| system-reminder-wrapper/native-presentation | Native prompt framing and presentation mode contracts; no module-local wrappers/mode literals |
| resource-address | Native resource codec contract for dsh-resource:// formats, kinds and modes; HOST ONLY |
| instruction-loader | Native instruction plugin's resolved candidates/maxBytes and real loaded/truncated/over-budget receipts, not file existence |
| goal-defaults | Resolved native goal config/default; host projects actual round-cap placeholder data |
| model-selection | Native session-controller model-selection STATE versus WIRE schema and exported key. Wire next is not proof of a pending user override; mutation support is separate |
| context-pressure | @deepseek-ai/dsh-token-meter0.2.1-rc.2 usage-projection state/wire schemas and native projectedTokens formula; key accessor, no consumer formula clones |
| retained-composition | Public dsh-scope scopeOf/scopeParentOf plus preset registry retained-generation semantics; current leases alone are insufficient, unavailable retained coverage is incomplete |

Package sets for BBFF membership are family.list() packageNames plus the root.
NO oh-my-bbff- prefix inference. Native namespace/effect inference also requires
its actual evidence and version; per-row ownerBasis is rendered, not hidden
behind one process-wide native/unknown switch.

Relevant local sources read during drafting include native MCP client/resources,
ToolRuntime, session-controller and available instruction/goal/system-prompt/skill
packages. No optional superagent or model-selection package name was invented from
a prefix. Native model-selection projection is implemented by the session-controller
package; nonexistent guessed standalone packages are not a basis. Missing owner/
version/evidence yields a narrow unsupported/unverified diagnostic, never a false
successful capability claim.

## 3. MCP attribution: display choice plus enforcement candidates

parseMcpToolName(name,knownServers=[],serverHints=[]) is the ONE implementation.
Require exact nonempty public suffixes. Handle server names containing __ or
ending _. Collect EVERY known/hint prefix match into candidates:{server,basis}[],
deduplicating a same-server hint beneath a known match. Sort known before hint,
then longest prefix, then lexical tie-break. Multiple distinct servers means
ambiguous=true. Display server selection stays longest known, otherwise longest
hint, otherwise adapter fallback; ordinary names return null/none. Hints/fallback
are uncertain. No discovered boolean is exported.

The PROVIDER exposes attributeTool(name,{serverHints}); active consumers never
reinterpret it. ANY hidden candidate denies enforcement (fail-closed), even when
the display winner is a shorter known server. If no known/hint candidate exists,
use the explicit fallback server when returned. Hint queries create no rows,
known server identities, ownership, timestamps or persisted observations. The
normalized/hash suffix is opaque, NEVER original wire rawName. Cached-root-absent
fallback uses the same primitive and displays cached/uncertain provenance.

## 4. Roster, configured metadata and evidence views

Primary roster = mcp:<server> SECTION IDENTITIES from UNSCOPED, CURRENT PRESET-
LEASE and RETAINED PRESET-PARENT assemblies. serversFromSections aggregates those projected views. Loader scans
supply configured/disabled metadata ONLY; no match is NEVER negative roster
evidence. An unreadable preset MCP client's name is incomplete. Keep configured
zero-tool/disabled rows and section-roster zero-tool rows. zeroCurrentTools may
mean disconnected, failed or tool-less; do not label it resourceOnly.

scanConfiguredServers receives generic public entry projections. Root traverses
and resolves packages; adapter owns recognized package/config keys. Matching rows
without readable names, partial traversal and invalid names produce diagnostics,
while valid facts survive. No remote MCP list API is fabricated.

ROSTER/SECTION/SKILL discovery evidence is mask-free: unscoped, CURRENT preset
leases, AND retained live compositions' MASK-FREE PRESET-PARENT views. The current
acquireScope(id) cannot lease revision A once B replaces/removes it. Provider uses
public scopeOf(agent.ctx)/scopeParentOf(key), confirmed public composition/service
metadata, and BORROWS that preset parent without rebinding/disposal/private maps.
Deduplicate actual parent identities, not just preset ids; retain separate A/B
source slices without publishing Agent ids/scope keys. If coverage cannot be
obtained, report retained-composition-incomplete/complete:false, preserving known
facts as stale. Never assemble the live Agent scope or apply its waterfalls to
these discovery views. Live own TOOL definitions may still establish sessionLocal
(including same-name shadows by identity). Existing per-session exposure may use
actual Agent view facts, but those are not mask-free skill/roster evidence.

Do not await first scan in apply/init: preset APIs may wait on loader.await.
Publish synchronous declarations/service first; discovery assemblies are driven
by readiness/change/query events. The30s ledger mtime check does not trigger
periodic prompt assemblies. Use agentPresets.defaultId for default-preset views.

## 5. Safe parse/rewrite and other pure primitives

- parseResourceSection accepts the recognized section/envelope and bounded JSON
  string-array. Empty applicable sections are valid empty views; nonempty parse
  failures are incomplete, never authoritative empty roster. This parser is not
  the primary roster mechanism.
- rewriteResourceSection uses that SAME codec. Successful removal of all names
  returns null. Parse failure returns ORIGINAL unchanged with diagnostics; do not
  delete unknown future syntax. Caller preserves unrelated section metadata.
- mcpSectionName/serverFromMcpSectionName, MCP_RESOURCE_SECTION_NAME,
  MCP_RESOURCE_TOOL_NAMES and MCP_SECTION_ORDER_KEY replace local section/order
  literals. Query public getSectionOrder; no duplicated3100 fallback.
- isMcpResourceTool/resourceServerArgument and skillNameArgument use exact native
  dispatch/argument contracts. TOOL_NAME_PATTERN/MCP_SERVER_NAME_PATTERN/
  SKILL_NAME_PATTERN live here; catalog kinds are not inferred tool identities.
- auditRegistrationEvidence receives deduplicated public effect/package facts.
  Unknown/third-party registrations prevent unjustified DSH residue attribution.
  Family identities come from contracts, never a package prefix. Unknown remains
  a row-level attribution result with basis, not a guessed native label.
- unknownRestrictionNames recognizes ONLY the owning runtime's verified syntax;
  unrecognized errors return diagnostic/null and cannot manufacture success.
- nativeToolTrait/nativeToolGroup/nativeToolSource centralize native effect and
  Team/report-source groups with package basis. Unknown is NEVER assumed read.
  BBFF traits come from descriptor.toolTraits, not names in this adapter.
- nativeSubagentProvider/nativeCompactCommand/isNativeCompactCommand and
  superagentIdentity/orchestratorServiceName centralize provider/command/
  classification conventions. These do not execute commands or choose Team policy.
- sessionHeaderFacts/sessionEventFacts centralize native field/event decoding into
  normalized DTOs. Prefer public services/projections when available. Raw schemas
  and strings are not copied into clients or other modules.
- promptSectionConvention/wrapSystemReminder/nativePresentationMode centralize
  section keys/public order keys, framing and presentation modes. Root's own
  provider is descriptor data, not an adapter module-name special case.
- resourceAddress is HOST ONLY. Return computed address and openability; unknown
  modes are not silently continuable. Clients receive data/actions, not codecs.
- instructionLoaderFacts projects resolved native candidates/maxBytes and actual
  file-load evidence into loaded/truncated/over-budget/missing/unknown. A file
  merely existing is NOT loaded. If no true load evidence is available, show
  unknown/diagnostic rather than fabricate loaded. Never copy65536 into Memory.
- resolvedGoalDefaults supplies the actual resolved native goal cap for the host
  to send to the UI; no copied256 placeholder.
- Export DSH_PROJECTION_KEYS and projectionKey for context-pressure/model-selection
  keys; callers never copy raw projection-key strings. contextPressureFacts accepts
  explicit {view:'state'|'wire'}, owned by @deepseek-ai/dsh-token-meter0.2.1-rc.2.
  Native state has surfaceTokens and sampledSurfaceTokens; wire has projectedTokens
  instead. State projects max(0,pressureTokens+surfaceTokens-sampledSurfaceTokens)
  only when the sample fields exist; wire uses its provided projectedTokens.
  Otherwise use a valid pressure sample as last-request basis, or unavailable.
  Window/pressure are independent last-wins slots, not one atomic sample. The
  adapter owns used/window/percent/basis normalization and malformed-input handling,
  including compaction deltas. Team must not recopy field reads or formulas.
- assistantMessageFacts normalizes direct derived messages and assistant/message
  event records via one read of the native role/content/event.data.message schema.
  sessionEventFacts shares its assistant-message variant. It returns full normalized
  text; Team's report excerpt limit is an explained setting, not an adapter policy.
- modelSelectionFacts also takes explicit state/wire view. Pending user selection
  is read only from state pending; wire next may fall back to lastUsed and cannot
  become a fabricated pending override. It does NOT create a public clear API. Team clear-override needs a verified public mutation; if unavailable,
  report unsupported and say why it cannot be cleared from that UI. No private
  projection write or selectModel call falsely labelled clear (that call resumes).

## 6. Skill masks and partial data: BOTH mechanisms decided

Persist skills ONLY from unscoped×cwd/current preset-lease×cwd/retained preset-
parent×cwd mask-free views. Optional
data-only skillMaskProviders arrays from CURRENT descriptors identify synthetic
providers; root declares its own exposure mask through its own descriptor too.
Drop declared-mask candidates from actual Agent/per-session views before OR/
promotion. Never persist/promote synthetic rule-name candidates without a base
skill, even when complete=false. Emit own-layer-masked ONLY when a declared mask
covers a name absent from EVERY mask-free view; incomplete source scans are not
proof of absence. No module provider names are hardcoded in root.

Provider alone retains successful partial slices. Failed slices remain present-
at-last-success with stale:true; successful empty slices remove presence. Fresh
owner/declaredBy/exclusive overlays apply even before ledger/bootstrap scans.
No declaration/release/owner facts are persisted. Scope owns last-known governance.
Consumers replace their latest valid provider snapshot WHOLESALE/verbatim, never
merge slices. During provider absence retain that exact snapshot and show cached/
unavailable status separately; incomplete snapshots are still valid cache updates.

## 7. selfCheck, reporting and literal gate

selfCheck evaluates package versions and genuinely obtained projected evidence;
each check is pass/fail/not-observed with actual owner package/version. Package
mismatch affects only that package's rows, labelled 未在当前 DSH 版本上验证.
Reserved transport observed in NON-NATIVE schemas corroborates it; absent means
not-observed, NOT failure. No exported-constant-only success test or live mutating
probe is required. Optional absent features are not-observed, while malformed
positive evidence yields a narrow diagnostic. Loader absence is not roster proof.

All consumers/projections display completeness and diagnostics, including
MCP 服务器清单可能不完整：<原因>. reportAdapterDiagnostics(moduleId,diags) accepts
adapter inference-id codes only, REPLACES that compatible module's set, gets root
module attribution and forces complete=false. Disposer/unregister clears only
that set; it cannot clear root failures. No bound port, generic arbitrary errors
or stale module reports survive unregister.

Gate EVERY executable source and installed file in ALL FOUR packages plus SDK.
Allow convention literals only in canonical adapter, exact vendors, tests/docs/
declarations. No file-wide exemptions or literal splitting. Inspect:
MCP name/config/section/resource codecs; native names/effects/report classes;
reserved transport; skill-name pattern/dispatch; restriction-error syntax;
Team/subagent/superagent prefixes/shapes/provider/compact ids; session fields and
all six audited event schemas; prompt keys/orders/wrapper/presentAs modes;
dsh-resource formats/kinds (host-only); native instruction candidates/maxBytes;
resolved goal defaults; projection KEYS, model-selection and context-pressure STATE/
WIRE schemas/formula; assistant/message event/direct-message decoding. Exact residual
sites gated: Team team-ops.js14–30,95–112 and enforcer.js115,239–242, plus Widgets
native log reads (audit W12). Retained-generation traversal uses public scope APIs,
not copied preset-registry internals. Family membership uses a
registered package set, never a prefix. Review every policy-derived badge/label
for source explanation, including per-row catalog ownerBasis rendered by Badge.

Acceptance after freeze: package-local mismatch isolation, section-only and preset
zero-tool rosters, masked-Agent isolation, all-candidate fail-closed ambiguity,
masked synthetic skill rejection, bootstrap declaration overlays, stale-vs-empty
slices/whole consumer replacement, native name/effect/source helpers, instruction
real-load evidence, shared root resolution/diagnostics, callback timeout versus
null, host-only addresses, four-package literal+SHA gates and unsupported model
clear UI. Add retained revision A versus B: A-only skill/zero-tool server remains
while an Agent retains A, including after preset definition removal; newRoot never
falls back to A, and no Agent waterfall runs. Missing parent coverage reports the
named incomplete diagnostic. Pressure fixtures cover state/wire equivalence,
compaction surface deltas, absent samples/windows and wrong/malformed views;
assistant fixtures cover direct/event equivalence and non-assistant rejection;
projection key exports must match the owning packages. Full root catalog
persistence/import tests live in the main contract.
