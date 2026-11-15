# FROZEN v1.6 — implementation handoff brief

**FROZEN specification, 2026-11-08.** Lead accepted the final P1/P2 fixes after
re-review. SDK/runtime stay0.1.6/v1.5; no implementation/exports/vendors/install yet.
The historical filename is retained for stable review links; its content is frozen.

Files: [contract](./CONTRACT.md), [types](./index.d.ts), [adapter spec](./DSH_ADAPTER.md),
[adapter API](./dsh-adapter.d.ts), [root-inclusion source impact](./ROOT_SELF_REGISTRATION_DELTA.md).

## Root catalog and data authority

Root-only catalog; no parallel consumer discovery. snapshot({cwd}) is sync/cache-
only: root normalizes/returns cwd and retains requested paths for process lifetime.
New paths are pending/incomplete. newRoot is host + agentPresets.defaultId + actual
project evidence, never historical/session-only union. No first-scan await inside
apply/init; discovery assemblies are event-driven, not live-Agent polling.

Primary MCP roster is section identities in unscoped/current-preset-lease AND
retained live compositions' mask-free preset-parent assemblies. Public scopeOf/
scopeParentOf with composition confirmation covers retired A after B reload or
preset removal, never Agent waterfalls/private generation maps. Distinct parent
keys remain separate private slices; missing coverage is explicitly incomplete.
Loader adds configured/disabled metadata only, never negative roster evidence.
zeroCurrentTools is honest about disconnected/failed/tool-less servers. Roster,
section and persistent skill evidence is mask-free. Declared skillMaskProviders
candidates are excluded in actual Agent views; no synthetic skill promotion.
Root uses the same descriptor mechanism for its own masks/layers/traits.

Current owner/declaredBy/exclusive overlays exist even before ledger/bootstrap;
root persists no declarations/releases. Scope owns last-known governance and may
read family.list directly. Immediate family.subscribe is the enforcement barrier;
catalog.subscribe is debounced display invalidation. attributeTool returns the
known→hint→fallback display winner plus EVERY known/hint candidate and ambiguous.
Enforcement denies ANY hidden candidate; hints create no observations.

## Durable history, snapshots and diagnostics

Explicit importObservations(moduleId,records) / reportAdapterDiagnostics(moduleId,
diags), registered compatible ids only, cooperative attribution. Reports replace
that module's inference-id set, force incomplete and clear on disposer/unregister.
No bound port, unbound import or project-path registration layer.

All3 history kinds:20,000 rows/8MiB including tombstones;64 sources/row and64 project
paths/skill; sourcesTruncated+diagnostic on overflow. Full refuses NEW names, never
evicts. Import≤10,000 records, all-or-nothing union; no digest bookkeeping. Scope
owns legacy reading; preset:observed is not invented as a real preset id.1s delta
debounce/dispose flush; async30s mtime reconcile and lock-backoff, no Atomics.wait.
Normal crash loss≤1s; lock/storage failure shows pendingRows+since without that
guarantee. Corruption is quarantined with persistent diagnostic. lastSeenAt≤
forgottenAt is fenced; newer observations clear tombstones. Provider retains failed
slices as stale last-success presence; consumers replace valid snapshots VERBATIM/
WHOLESALE, even incomplete, and never merge slices or fabricate empty substitutes.

## Every policy has a source; shared services and UI

Every visible module value/policy is an explained setting+shipped default, a named-
module contract datum, or a basis-bearing adapter inference. Badge title/explain
renders in root, including info tone. Review all policy badges/labels. Catalog
ownerBasis is per-row, not a process-wide native/unknown guess. Settings sections
carry moduleId; UI 已加载 is per module and layer links target declared sections.

Validated additive fields: toolTraits(read/write/delegate, own-tool subset),
requiredTools(dependency warnings, NOT ownership), skillMaskProviders and
permissionLayer. Invalid field drops with warning. Native effect/report groups
live in adapter, never another module's tool-name list. Unknown effect is not read.

Root self-registers its runtime package descriptor; list() NOW INCLUDES ROOT.
Modules-only consumers filter id!==root.id; masks/traits/layers retain root row.
Identity/apiBase/contract metadata remains available separately. Existing
package.json.bbff is actually consumed for id/title, with name/version read at
runtime; family membership is registered package set+root, never prefix inference.
Shared resolveRoot follows live header→persisted stat→query per parent hop,
bound64/cycle checked; unresolved is own id/cwd unknown/resolved:false. Scope's
unknown-cwd policy is a visible setting. root.apiBase replaces the copied route.
Export deadlines/caps;4 annotations PER ID TOTAL. Detailed collectors distinguish
timeout from contributor null and show rejection/timeout diagnostics in root UI.

## Role permissions — owner's overriding ruling

NO pack recommendation field/flow and NO missing/not-installed diagnostics for
role tool/skill/MCP references. Seeds define NO filters: every role inherits all.
Only existing readOnly/delegation permission flags remain, editable with visible
defaults. toolTraits describes effects, not role entitlement. Filters are USER
settings through stage/commit; pickers use catalog owner/source. Hand-typed unknown
names have NEUTRAL 从未出现 / 本次运行未出现 status, not a warning/install prompt.

## Four-package adapter and verification boundary

Adapter bytes match in root/Scope/Team/Memory, source+installed. Each inference
binds to its owning PACKAGE version via pluginPackages.packageOf; mismatches are
local. Covers MCP/resource/skill/restriction conventions, native effect/report
classes, Team/subagent/superagent/provider/compact identities, session header/log
schemas, prompt keys/orders/wrapper/presentation, HOST-ONLY resource addresses,
real instruction candidates/load/truncation/limits, resolved goal defaults,
projectionKey/DSH_PROJECTION_KEYS (model selection included), explicit state/wire
contextPressureFacts owned by dsh-token-meter0.2.1-rc.2, and shared direct/event
assistantMessageFacts. Team no longer copies pressure fields/formula or raw
projection/message layouts; exact sites and fixtures are in the adapter spec. No invented clear-override API: unsupported public
mutation is an explicit diagnostic/UI explanation. Reserved transport is
corroborated from non-native schemas; otherwise not-observed, not failure.

Freeze authorization is Lead's accepted final review, NOT declaration typechecking.
Typechecking validates the frozen API syntax only. Root-inclusion impact was read
in all4 packages; exact sites are in the delta. Phase2 adds retained-A/B/removal
coverage (including unique skill/zero-tool server), pressure state/wire/compaction
fixtures, projection-key and direct/event assistant tests and exact Team/W12
literal gates. Runtime/evidence/literal acceptance remains implementation work.
