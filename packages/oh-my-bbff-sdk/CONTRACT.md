# Oh-My-BBFF family contract v1 — specification

Status: **FROZEN v1.6 specification with dated additive SDK0.1.8/0.1.9/0.1.10 amendments, 2026-11-08** (Lead approved). Service `contract:1` is unchanged. The canonical SDK runtime is implemented; root-provider deployment remains a separate acceptance milestone. Authoritative source: `oh-my-bbff-sdk` (this package).

### Additive amendment — 2026-11-08, SDK0.1.12

Lead approved the minimal parent-catalog normalized event variant only, with
actual native projection and Root consumer-boundary evidence27/0. No other
native event decoder or family service contract changed. ContractSHA remains
72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115;
adapterSHA is915027cb8fcac930e8781142b783457fe2422b8bb715226ecdb5ca82399920be.
All three consumers received one coordinated official resync notice and ACKed
actual sync/check. SDK0.1.11 remains superseded provenance; no live/install grant
is implied by source readiness.

### Additive amendment — 2026-11-08, SDK0.1.11

Lead approved one additive persisted-event decoder variant: normalized
model-selection intent, allowing cold route suffix folds without full native
Session/projection preparation. Existing state/wire decoder semantics and
contract:1 are unchanged. Native reference plus actual collaboration-consumer
boundary tests cover pending intent, unmatched requests and matching consumption.
See DSH_ADAPTER.md for the public non-deprecated async read/cache seam shared by
Widgets, Team and Memory. No effect/ownership/tool contract changed.

Contract SHA256 remains72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115.
Adapter SHA256 is68f5a357d61bb4f82df15904c7ccc27611d82e1e663e0ecdf28f6f9b70ede5f6.
SDK0.1.10 adapter d3bc67e99ec4a1776f741bd192e1b3a97d0e5bd2decbfe7f1ae6815d59b0a36b
is superseded; all consumers receive one coordinated resync notice before pack.

### Additive amendment — 2026-11-08, SDK0.1.10

Lead approved exhaustive installed-native effect coverage rather than one-name
patches. NATIVE_TOOL_EFFECTS records every inspected native definition/registration
and bundled host/preset alias site with owner package, exact version, file:line,
source hash, effect, stated reason, configuration/activation conditions and
same-name shadow rules. The full table is NATIVE_TOOL_EFFECTS.md. Generic Cordis/
test helper factories have NO tool identities. Dynamic MCP tool effects remain
unknown because the upstream server owns them. run_code is a separate synthesized,
reserved, write-capable transport, not an ordinary registered endpoint.

The acceptance gate compares all172 tool/alias evidence sites plus the complete
reviewed native host-source/package corpus. New tools, changed sources/versions,
unknown future registration syntax and new bundled aliases turn it RED and require
review; they do not silently inherit an unknown/default classification. Runtime
package-local verification remains per inference, not a global CLI-version gate.
Source duplication under lib/types is retained as build-mirror evidence, never
counted as two independent operational tool identities.

nativeToolGroup('team-spawn') resolves to exactly the native teammate-spawn tool,
grounded in dsh-experimental-tool-agent-team0.2.1-rc.2 index.js250. It does NOT
include ordinary subagent/workflow delegation. A real native own-layer registration
fixture checks the group and all three Team/subagent-control shadow collisions.

Effects remain descriptive, not entitlements. The reviewed Team rule is: readOnly
denies KNOWN write/delegate effects. Unknown effects are a visible Team setting
「只读角色对效果未知的工具」 with 允许 (shipped default, matching existing behavior)
and 拒绝; every currently unknown tool is listed with that status. No hidden allow,
role recommendation or named tool/skill/MCP seed filter is added. todo_write,
present, exit_plan_mode and structured_output are session-only/read; glob/grep
spills and job_output cursor movement are read-side harness bookkeeping. Shared
Team-board mutations remain write. load_workspace_dependencies records the
conditional root-configured write versus root-absent read behavior; the name-only
trait conservatively describes its write capability, not current deployment config.

SDK0.1.9 is superseded without rewriting its archived bytes. Its contract SHA256
is72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115 and adapter SHA256
isbf0fdb60eca73b3c8a408dd3c96b32fb8b094d7b82aaf4662437281b7c6845f6. contract.js
bytes/hash remain unchanged in0.1.10; service contract:1 is unchanged.

### Corrective and additive amendment — 2026-11-08, SDK0.1.9

Lead approved the correction of file `resourceKind` to the native Sidebar kind
`text`, not the resource protocol `file`. Basis: native owner
@deepseek-ai/dsh-client-ui-sidebar-documentpreview0.2.1-rc.2, client.js1053 and
1079–1085. Consumer-boundary fixtures check the actual registered kind, not just
URI encoding. SDK0.1.8 is **superseded**, not rewritten: its exact runtime pair is
preserved with contract SHA256
72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115 and adapter SHA256
77014502f32b5e922a440714aebe663f472e984239127d6656f00b50c60a2fc6. The contract.js
runtime bytes/hash remain unchanged in0.1.9.

After confirming no complete public normalized reader exists, sessionEventFacts
adds `user-message` with text/source/isHuman and optional seq/time metadata for
all recognized variants. `source` is only the native source-kind string, never a
raw source object. Text contains all text blocks, newline-joined without an
adapter cap; tool-call/image/other payloads are not included. isHuman follows the
native activity consumer's user/message + source.kind user predicate, not merely
user role. Optional seq/time come from the native event envelope, never wall
clock; malformed present metadata is incomplete. There is no raw-event escape.

The public-reader check is bounded to inspected dsh-session-query and session/
LLM exports: extractSessionEventText (index.js545–587) returns text for ALL
producer-tagged user-role messages; records598–606/search614–629 add seq/time/text
but no source/isHuman. Native human identity is defined by
@deepseek-ai/dsh-api-session-controller0.2.1-rc.2 index.js1874 and3002. Reference
fixtures exercise that actual native predicate and the public event metadata
reader with human, goal, instruction, plugin and future-producer examples.

### Additive amendment — 2026-11-08, SDK0.1.8

Lead approved these together after the original FROZEN v1.6 review:

- W11: HOST-ONLY resourceAddress adds input kind:'file' plus path and result
  resourceKind/navigationTarget. File addresses follow the native session-scoped
  file codec; child addresses use the native direct-parent target and registered
  Sidebar kind. Root-session navigation uses navigationTarget data, never a fake
  resource URI or kind. Clients pass host-returned data, copying no DSH formats.
- W12: normalized goal facts add optional id/revision/createdAt/updatedAt. The
  clear variant adds clearedId and optional revision/updatedAt (native clearedAt).
  Epoch-millisecond timestamps come from the owning native durable change, not
  wall-clock guesses. Malformed present fields produce incomplete diagnostics;
  absent optional fields stay absent. There is no raw-event escape hatch.
- §2.5.8: the precise cached successful resolveRoot allowance is recorded below.

The original 2026-11-08 FROZEN v1.6 hashes are **superseded by this additive
amendment**, retained for provenance (not the current-file acceptance hashes):

| Original frozen file | Superseded SHA-256 |
|---|---|
| CONTRACT.md | a37fe3cd2c74684ec496436ad8b606a4143982d6b68863097d98ae306248be2d |
| index.d.ts | 46dd862f24029016a8652421d94ffe300796c695be5c8b8696fc964fb72d33af |
| DSH_ADAPTER.md | 2446551a6640fabfe03a9afccd3f30e44263088b88d1835ae0be60d38d88c78c |
| dsh-adapter.d.ts | bfe42180e7df69ab6f5aad02a82a8af76723e00551d0049966e1b156cd965a70 |
| CATALOG_V1_6_DRAFT.md | e75a2f96d2e2e0a15003620f3155562bd10805c48087d9f3426a4dd727a7a047 |
| ROOT_SELF_REGISTRATION_DELTA.md | 946cabe80ca04f11716acf82b0e31c8a2fe819586f8e89be141c9dc0a2acd215 |

Unchanged original files may retain their original bytes. Current runtime pair
hashes and verification are published in the coordinated SDK readiness receipt.
The root `oh-my-bbff-widgets` plugin implements the two services described here.

The contract lets family modules disappear into the root without the root
knowing them: no module id, package name, card id or settings key may be
hardcoded in the root. Discovery is activation-based registration, not a
filesystem scan.

## 1. Identity

| Thing | Rule |
|---|---|
| Family display name | `Oh-My-BBFF` |
| Family slug / package prefix | `oh-my-bbff` |
| Package names | `oh-my-bbff-<module>` (lowercase; also the public npm name) |
| Display titles | `Oh-My-BBFF <Module>` (e.g. `Oh-My-BBFF Memory`, `Oh-My-BBFF Widgets`) |
| Module id | lowercase `[a-z][a-z0-9-]{0,31}`, unique in one profile |
| Root package | `oh-my-bbff-widgets` — owns the services and the UI seats |

Package metadata used by the plugin list and diagnostics:

```json
{
  "name": "oh-my-bbff-memory",
  "bbff": { "contract": 1, "id": "memory", "title": "Oh-My-BBFF Memory" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" },
           "client": { "platform": "web", "immediately": true } }
}
```

The locale `meta.title` / `meta.description` in `locale/{en,zh}.json` is what
the plugin list shows and should match `bbff.title` / the package description.

### 1.1 Normative family principle (v1.6 DECIDED)

Owner principle: 「核心宗旨是不要有任何hardcode，全部按contract」. Every
user-visible module-derived value or policy has EXACTLY ONE explainable source:
(a) a setting with its shipped default visible; (b) contract data from a NAMED
module; or (c) an adapter inference with its basis/owning-package verification.
The UI MUST be able to identify that source. A convenient literal, copied default,
other module's tool list or unexplained badge is not a fourth source. Review gate:
EVERY policy-derived badge/label in client code carries an explanation and links
to its setting or named module/inference as applicable. Missing facts are shown as
unknown/diagnosed, not guessed. Fixed structural presentation values may be
contract constants, named as such, rather than silently becoming policy.

**Identity choice: consume existing package.json.bbff, do not leave it inert.**
At runtime root reads its own package.json name/version and bbff id/title; modules
read their package.json and derive descriptor.packageName/version/id/title from
those fields. No hand-copied version or root-identity constants. Root consumes
its own metadata block as descriptor data; module blocks are consumed by their
registration code. Family membership is the SET of family.list() packageNames
plus root.packageName, never startsWith('oh-my-bbff-'). The naming rule remains a
packaging convention, not an ownership/membership inference.

## 2. Host half — `bbffFamily`

The root provides a Cordis service `bbffFamily` (`FAMILY_SERVICE`):

```ts
interface BbffFamilyService {
  contract: 1
  root: { packageName: string; version: string; apiBase?: string }
  register(descriptor): () => void
  list(): readonly (BbffModuleDescriptor & { compatible: boolean })[]
  get(id): (BbffModuleDescriptor & { compatible: boolean }) | undefined
  subscribe(listener): () => void
}

interface BbffModuleDescriptor {
  contract: 1
  id: string
  title: string
  description: string
  version: string
  packageName: string
  apiBase?: string                 // '/oh-my-bbff-memory/api'
  ui?: { cards?: string[]; settings?: boolean }
}
```

A module registers through injection, so load order and HMR are irrelevant and
a missing root degrades to "module without family UI":

```js
import { registerFamilyModule } from 'oh-my-bbff-sdk'
import { readFileSync } from 'node:fs'
const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export function apply(ctx) {
  registerFamilyModule(ctx, {
    contract: 1,
    id: packageInfo.bbff.id,
    title: packageInfo.bbff.title,
    description: packageInfo.description,
    version: packageInfo.version,
    packageName: packageInfo.name,
    apiBase: '/oh-my-bbff-hello/api',
    ui: { cards: ['hello'], settings: true },
  })
}
```

Rules:

- root absent → the injection waits; the module keeps working standalone;
- root appears/reloads → the descriptor registers; root unloads → disposer runs;
- duplicate id, invalid descriptor, or `contract !== 1` → root logs a warning
  and records the descriptor with `compatible: false` for diagnostics, never
  throwing inside the module fiber;
- the root never enumerates modules itself; `list()` is the only truth.

Root diagnostics endpoint is supplied as `bbffFamily.root.apiBase`; post
`{ "action": "family" }` there after feature detection. Its payload includes
root metadata, module compatibility, warnings/errors and callback diagnostics.
The internal route literal is not part of this contract.

### 2.1 Agent annotators (v1.2, additive — feature-detect)

```ts
bbffFamily.registerAgentAnnotator?(moduleId: string,
  annotate: (ids: string[]) => Record<string, Annotation | Annotation[]> | Promise<…>): () => void
type Annotation = { label: string | { [locale: string]: string }, tone?: 'default' | 'info' | 'warning' | 'success', title?: string }
```

A module contributes short badges for agent/session ids (Team members and
subagents). The root calls every annotator for the ids it is about to render,
bounds each call by AGENT_ANNOTATOR_TIMEOUT_MS (800ms), isolates throws,
keeps at most AGENT_ANNOTATIONS_PER_ID_MAX (four) valid entries PER ID TOTAL
across all modules, in registration order, and renders them next to the name, tagged
`data-annotation-module`. The root never interprets labels. Roots before
widgets 0.15.2 lack the method: check `typeof family.registerAgentAnnotator ===
'function'` before calling it (no SDK runtime change; vendored `contract.js`
stays byte-identical). First registration per module id wins.

### 2.2 Tool ownership and exposure annotators (v1.3, additive — feature-detect)

`descriptor.tools?: string[]` declares exact names of tools this module registers.
Each name must match `/^[A-Za-z0-9_-]{1,64}$/`, with no duplicates. An invalid
list produces `validateModuleDescriptor(...).warnings` and a root log diagnostic;
the entire field is dropped, but the otherwise valid module stays compatible.
The root records a copied, frozen array and includes it in family diagnostics.
No prefix inference or registration monkeypatch is used. The first compatible
module declaring a tool owns its display label; unload removes that ownership.

```ts
interface ExposureInput {
  sessionId: string
  rootSessionId: string
  cwd?: string
  items: readonly { kind: 'tool' | 'mcp' | 'skill'; name: string; server?: string }[]
}
interface ExposureAnnotation {
  kind: 'tool' | 'mcp' | 'skill'
  name: string
  available: false
  reason: string
  reasonLocales?: Record<string, string>
  by?: string
}
bbffFamily.registerExposureAnnotator?(moduleId: string,
  fn: (input: ExposureInput) => ExposureAnnotation[] | Promise<ExposureAnnotation[]>): () => void
bbffFamily.annotateExposure?(input: ExposureInput): Promise<readonly ExposureAnnotation[]>
```

Feature-detect both methods. First registration per module id wins; the disposer
removes only that registration. Calls run concurrently, timeboxed to 500 ms each
and error-contained (throw, rejection, timeout or non-array result means no
annotation). These are cooperative async deadlines, not preemption of blocking JS.
Only requested `(kind,name)` pairs with `available:false` and a nonblank reason
are retained; reason is trimmed/capped at 300 characters, `by` at 64 (defaults to
module id). Merging is deterministic: first registered annotator wins per pair,
independent of completion order. Input and returned records are frozen.

Inventory calls this seam with the requested session, resolved root and current
workspace cwd. `mcp` item `name` is the server name; MCP tool items also carry
`server`. Unavailable server annotations propagate to its tools. Result entries
carry `available:false`, `reason`, `by`, and `enabled:false`; cards disable the
checkbox and separately count workspace-unavailable entries. The annotator seam
is presentation-only: the contributing module must enforce its own restrictions.
Existing v1/v1.2 modules without either capability continue unchanged.

### 2.3 Session exposure contributors (v1.4, additive — feature-detect)

```ts
bbffFamily.registerExposureContributor?(moduleId: string, fn: (input: {
  sessionId: string; rootSessionId: string; cwd?: string
}) => null | {
  tools?: { name: string; description: string }[]
  exclusive?: boolean
  reason?: string
  reasonLocales?: Record<string, string>
  toggleable?: boolean
} | Promise<null | { tools?: { name: string; description: string }[];
  exclusive?: boolean; reason?: string; reasonLocales?: Record<string, string>;
  toggleable?: boolean }>): () => void
```

A contributor returns null for sessions it does not own, otherwise contributes
session-scoped tools that ordinary registry views may not expose. Exact tool names
follow the v1.3 name regex, with no duplicates; descriptions are strings. Invalid
results are ignored atomically with a diagnostic. Results are copied/frozen,
descriptions/reasons capped at 300 characters. `toggleable` defaults to false.

Calls run concurrently, individually error-contained with a 500 ms deadline.
The first registration per module id wins. Collection order is registration order,
never promise completion order. The optional root collector
`contributeExposure(input)` returns that ordered array with `module` and
`moduleTitle` added; modules only need feature-detected registration.

Inventory merges contributed tools in registration order (first contributor wins
for duplicate tool names), displaying BBFF ownership from the contributing module.
The first result with `exclusive:true` defines the available tool set for that
session; all tools outside that contributor's set, plus skill/MCP entries, become
unavailable with its reason (or a generic fallback), regardless of other contributors.
The exclusive contributor's own tools stay available; `toggleable:false` disables
the checkbox. The root refuses all unavailable or non-toggleable mutations server-side.
These are presentation/choice semantics, not an execution guard: modules still
own enforcement. v1.3 roots/modules without this capability continue unchanged.

Both contributor and annotator results may add `reasonLocales?: Record<string,string>`.
The root copies/freezes up to 16 nonempty locale entries, each capped at 300 characters.
The client generically selects the current UI locale key (`zh` or `en`) and falls
back to `reason` when absent. Every wording belongs to the module; the root never
hardcodes or translates module-specific reasons. SDK 0.1.5 finalizes this field.

### 2.4 Static exclusive tools (v1.5, additive — feature-detect)

```ts
descriptor.exclusiveTools?: {
  tools: string[]
  reason: string
  reasonLocales?: Record<string, string>
}
```

These tools exist only in sessions this module owns; their visibility is owned by
the module; workspace-scope rules do not apply to them. This is a static governance
declaration, not a per-session contributor result. The root never interprets it,
changes visibility, or applies workspace rules on its behalf. The module remains
responsible for its own session visibility and execution enforcement.

`tools` is non-empty and contains unique exact names matching the v1.3 regex.
Every name MUST be a member of the same descriptor's valid `descriptor.tools`.
Absent or invalid ownership therefore invalidates the exclusive declaration too
(with its own `not a subset of declared tools` warning). `reason` must be a
nonblank string, trimmed, at most 300 characters after trimming. Optional
`reasonLocales` maps at most 16 nonempty locale keys (at most 32 characters each)
to nonblank strings, trimmed and at most 300 characters after trimming; an empty
map is valid. Over-limit or malformed values invalidate the whole field, not just
one locale entry.

Invalid declarations produce plain-string, field-naming
`validateModuleDescriptor(...).warnings` and root diagnostics. The entire invalid
`exclusiveTools` field is dropped; valid `descriptor.tools` is preserved and the
otherwise valid module stays compatible. The SDK registration helper warns but
passes the descriptor to root validation, so diagnostics are not lost. Frozen
registry entries and the family diagnostics payload carry optional `warnings`.
Warnings are diagnostic only: consumers read governance solely from the validated
`exclusiveTools` field, never from warning text.

The root copies and deeply freezes the valid declaration, its tools array and
locale map, and returns it through `bbffFamily.list()`, `get()` and family
diagnostics. Consumers feature-detect each entry's `exclusiveTools`; older roots
may omit it. `contract:1` is unchanged. Modules without the field have neither an
empty declaration nor a warning. No module name or reason text is generated by
the root. Removing the module registration removes its declaration.

### 2.5 Shared capability catalog (FROZEN v1.6 — implementation pending)

This subsection and corresponding types are **FROZEN v1.6**, including the final
accepted retained-composition and context-pressure/message fixes. SDK0.1.6/runtime
v1.5 remain the installed baseline; this freeze is specification-only, not proof
of runtime exports, vendor sync, implementation or installation. `contract:1`
is retained; implementation proceeds in its separately assigned tasks.

#### 2.5.1 One provider, feature detection and boundaries

Only the Widgets family root provides optional `bbffFamily.catalog`. A consumer
checks the capability; when present it MUST use this provider for tool, MCP server
and skill discovery/attribution. It MUST NOT build another inventory by scanning
Loader entries, acquiring presets, assembling prompts, enumerating tool/skill
registries, or calling remote MCP listing operations. Public runtime reads needed
solely to apply an existing guard/restriction are enforcement, not an alternative
discovery path; they must not populate another catalog/observation ledger.

The provider aggregates existing declarations; it does not replace them:
`descriptor.tools` (v1.3), session contributors (v1.4), and
`descriptor.exclusiveTools` (v1.5). It never names a BBFF module, owns a module's
workspace policy, registers/executes a model tool, or creates/resumes/wakes an
Agent. Root-owned per-session exposure cards derive ownership, MCP attribution,
reserved/exclusive facts and diagnostics from this same catalog. Exact current
session exposure uses the provider's private current-view observations plus the
existing contributor/annotator contracts; the union catalog is never asserted to
be one session's callable set. Session identifiers and executable definitions are
not published or persisted in this catalog.

**DECIDED v1.6 behaviour change:** root self-registers its runtime package
descriptor through the SAME registration path before exposing the service, so
family.list() NOW INCLUDES ROOT. Its mask providers, permissionLayer and toolTraits
need no special case. Root identity/id/apiBase/contract metadata are retained too.
Consumers needing OTHER modules explicitly filter entry.id !== family.root.id;
never hardcode a root id or assume the first/only row is external. Consumers of
traits/masks/layers MUST retain the root row. The checked four-package impact is
listed in ROOT_SELF_REGISTRATION_DELTA.md.

The complete frozen data model is in `index.d.ts`; `DSH_ADAPTER.md` and
`dsh-adapter.d.ts` specify the future pure `dsh-adapter.js` boundary.

```ts
interface Catalog {
  snapshot(options?: { cwd?: string }): CatalogSnapshot
  subscribe(listener: (change: CatalogChange) => void): () => void
  forget(kind, name): Promise<ForgetResult>
  attributeTool(name, options?: { serverHints?: string[] }): {
    server?: string; basis: 'known' | 'hint' | 'fallback' | 'none'; uncertain: boolean
    candidates: { server: string; basis: 'known' | 'hint' }[]; ambiguous: boolean
    diagnostics
  }
  importObservations(moduleId, records): Promise<ImportResult>
  reportAdapterDiagnostics(moduleId, diags): () => void
}
```

**DECIDED Q1:** explicit moduleId is the FIRST argument, matching existing
registerX(moduleId,...) conventions. It must name a currently registered,
compatible module and is revalidated when admitting/committing a mutation. This
is cooperative attribution, not authentication of arbitrary in-process JS.
Records cannot supply/override caller identity. Registration-scoped state and
pending operations drop on unregister; already durably imported observations
remain root-owned history. There is no bound module-port layer or implicit-caller
import overload. No consumer has its own catalog provider.

**DECIDED Q2:** reportAdapterDiagnostics accepts only adapter inference-id codes.
Each call REPLACES that module's set; its disposer clears only that registration
(not a newer replacement), and unregister clears the set. Root merges reports
with module attribution, forces complete=false and never lets a report/disposer
clear root-owned failures. This is a diagnostic seam, not a discovery callback.

#### 2.5.2 Cache-only snapshot, new-root preview, and freshness

`snapshot()` is synchronous, deeply frozen and served from memory. It performs
no filesystem/network reads, lease acquisition or promise waiting. It returns an
opaque equality `revision`, ISO `generatedAt`, `origin:'live'|'cached'`,
`complete:boolean`, `diagnostics[]`, and sorted unique `(kind,name)` `entries`.
A revision changes on semantic facts/status/diagnostics changes; callers must not
order revisions across restarts/providers. `generatedAt` describes the returned
materialization, not proof every source was just refreshed. Persisted/imported
presence is never used as current-process presence.

`snapshot({cwd})` accepts any fully qualified absolute path. Root itself normalizes
it and returns snapshot.cwd/newRoot.cwd as the cache key; normalization is not
delegated to consumers. Every requested normalized cwd remains in the refresh set
for this process lifetime. There is no separate project-path registration API.
The query adds that project's skill context and an optional `newRoot` projection.
**DECIDED:** a
first-seen cwd queues a provider-owned background scan, immediately returns
`complete:false` with diagnostic `project-pending`, and returns
`newRoot.state:'pending'`, `newRoot.complete:false`; no blocking scan is hidden
inside the call. A later `subscribe` event announces completion/failure. Cache
miss/pending/error never substitutes the full catalog for a new-root preview.

`newRoot.entries` contains only keys actually observed for a new root at that
cwd: host + the DEFAULT preset + project skills for that default scope. It
excludes history-only, descriptor-only and session-local-only tools, and other
presets/live sessions. It also returns exact projected skill invocation flags,
resource-server names, section identities, defaultPresetId when known, its own
completeness and diagnostics. A same-name tool with a genuine host/default
presence may be included even if another session shadows it. Unknown default
preset or incomplete project scan makes the projection incomplete rather than
silently selecting another preset. Once a cwd cache has a last-good projection,
a failed refresh keeps that data with explicit incomplete/stale diagnostics;
`state:'error'` is not an authoritative empty result.

**DECIDED B3/B8 evidence views:** provider-only collection reads host tool schemas,
listed preset scope leases (disposed in finally), and actual live TOOL definitions,
including same-name own shadows by definition identity. ROSTER, SECTION and SKILL
evidence comes ONLY from unscoped, CURRENT preset-lease and MASK-FREE PRESET-PARENT
views of RETAINED live compositions. DSH retains retired generations while Agents
still use them; acquireScope(id) leases ONLY the current generation. Current leases
alone therefore cannot cover a hot-reloaded/removed preset's surviving revision.
Use public dsh-scope scopeOf(agent.ctx) then scopeParentOf(key), with public
composition inspection/service access to confirm/read the preset-parent view;
never walk private generation maps, rebind/dispose borrowed parents, or assemble
the live Agent scope itself. Distinct retained parent keys are separate slices,
identity-deduplicated by actual parent key, NOT just preset id: a successful empty
revision B cannot erase live revision A's presence. Retained keys live only in
provider memory; no Agent/session ids or scope keys enter catalog/ledger data.
If any retained live composition cannot be covered/confirmed, set complete:false
with named diagnostic retained-composition-incomplete and preserve prior valid
facts as stale; never silently omit that revision. Discovery assemblies are
event-driven, never periodic live-Agent assemblies; family waterfalls/shadows apply
only to actual live Agent scopes. No discovery call triggers a live Agent waterfall.
NEVER await the first scan inside apply/init: preset list/acquireScope may wait on
loader.await. Publish the service and synchronous declaration facts first, then
schedule scans after relevant readiness/change/query events. Leases do not create,
resume or wake Agents. Use agentPresets.defaultId for the default preset; missing
information is explicit incomplete state, not an arbitrary preset choice.

Mask-free skill views are unscoped×cwd, current preset-lease×cwd and retained
preset-parent×cwd, crossed with registered
workspace, live root/child and requested normalized cwd paths. User-only skills
remain; only mask-free observations may be persisted. Scope requests its rule
workspace paths with snapshot({cwd}); there are no root-to-consumer callbacks or
separate path registrations. Manual rule-only names stay flagged local UI overlays,
not fake root observations, owners or presence facts.

**DECIDED Q5, both mechanisms:** optional DATA-ONLY descriptor field
`skillMaskProviders?: string[]` declares exact synthetic/masking provider ids.
Root copies/freezes valid arrays and includes them in registry diagnostics; values
are unique nonblank exact strings, no wildcard/prefix inference. Invalid optional
fields warn/drop without rejecting an otherwise compatible module. Root declares
its OWN exposure hide provider through the SAME root descriptor data, never a
module-specific special case. In any actual Agent-scope/per-session view, candidates
from declared mask providers are dropped before aggregation: never persisted,
never promoted as real observations. Agent-scope candidates are not mask-free
catalog discovery evidence. A narrow `own-layer-masked` diagnostic is emitted only
when a declared mask covers a name absent from EVERY mask-free view; unresolved
mask-free scans get their own source-pending/error diagnostic, not a fabricated
claim of absence. Synthetic candidates with no base skill are never observations,
including in incomplete snapshots. No BBFF provider name is hardcoded in root.

#### 2.5.3 Entry facts and deterministic attribution

**DECIDED B4:** declaration-derived owner, declaredBy and live exclusive facts are
current in EVERY snapshot, including bootstrap-pending before ledger loading or
any scan. Apply these pure overlays synchronously from current descriptor data.
Enforcement may also read v1.5 exclusiveTools directly from family.list(); it need
not wait for observation scans/persistence.

Every entry carries kind/name/description, accumulated coarse `sources`, optional
latest ACTUAL observation source, owner, declaredBy, `present`, `stale`,
`seenThisRun`, `sourcesTruncated`, and nullable firstSeenAt/lastSeenAt. Sources are only host, preset:<id>, session-local,
bbff:<module>, mcp:<server>, configured, resource-prompt and project:<path>; no
session ids/call ids/history bodies. `present` means present at the LAST SUCCESSFUL
refresh of that source/view. A failed slice retains those facts with stale:true;
a SUCCESSFUL EMPTY refresh removes its presence. `seenThisRun` remains true after
an observed entry unloads.
Descriptor-only and imported-only records have present=false, seenThisRun=false
until actually observed. Re-reading a declaration does not advance observation
timestamps. Metadata presence is not execution permission.

Tools additionally carry mcpServer, adapter-derived reserved reason/locales,
CURRENT descriptor-derived exclusive `{module,reason,reasonLocales}` (not persisted),
and sessionLocal (including same-name own shadows). Ownership is exactly one of
DSH, BBFF module `{id,title}`, MCP server, or unknown. Priority: adapter-reserved
transport; first compatible explicit v1.3 owner/root-owned declaration; first
applicable v1.4 contributor when undeclared; MCP attribution; conservatively
proved DSH registration residue; otherwise unknown. Attribution and conflicts
must be deterministic, never guessed from a BBFF package/tool prefix. Historical
labels do not override live declarations. Multiple explicit owners retain their
`declaredBy` facts; first-registration display precedence is the existing v1.3
rule. Contributor output for a live session can add an observed session-local
entry without leaking that session's identity. A union contributor observation
never promises that tool for a new root or for every other session.

The adapter alone owns all DSH-convention name/section/package/effect/error
literals and conservative native-residue tests. Root traverses public evidence
and passes projected inputs, never monkeypatching ToolRuntime/registration.
**Decided namespace-hint seam:** `attributeTool(name,{serverHints?})` is
synchronous/cache-only. The PROVIDER resolves in this exact order:

1. Longest matching KNOWN server prefix, `basis:'known'`.
2. Only when NO known server matches, longest matching validated hint,
   `basis:'hint'`, `uncertain:true` and no discovery observation.
3. Adapter fallback, `basis:'fallback'`, uncertain/not independently corroborated;
   an ordinary non-MCP name returns no server with `basis:'none'`.

**DECIDED B1:** additionally return candidates:{server,basis}[] containing EVERY
known or hint prefix match, not only the display winner, plus ambiguous. Distinct
matching server identities make ambiguous=true; deduplicate a same-server known/
hint match with known precedence. Candidate ordering is deterministic (known then
hint, longest prefix first, lexical tie-break). If no known/hint candidate exists,
enforcement uses the returned fallback server when any. Enforcement DENIES when
ANY returned candidate is hidden (fail-closed); it must not check only the display
winner. Display keeps known→hint→fallback selection. A shorter known prefix still
wins DISPLAY over a longer hint, while the longer hinted hidden server remains an
enforcement candidate. No discovered boolean is part of this API.

Hints never override a known DISPLAY match, create rows/known server identities,
assign ownership, advance timestamps or become persisted observations. Scope
supplies MCP rule server names such as alpha__beta/tail_ to catch late tools.
Consumers never reinterpret the provider result with another regex or their own
prefix ordering. The same pure adapter algorithm is used in provider and explicitly
cached root-absent fallback, with uncertainty/cache provenance visible. Suffixes
are opaque normalized public-name suffixes, never original wire tool names.

**DECIDED B2/P1:** primary MCP roster is mcp:<server> SECTION IDENTITIES in unscoped,
current preset-lease and retained live-composition preset-parent assemblies. The Loader serverName scan supplies configured/
disabled metadata ONLY, never negative roster evidence. No Loader match does not
mean no server. A preset mcp-client whose name cannot be read makes the affected
view incomplete. Resource-section parsing augments resource metadata; it is not
the only roster source. No server-listing API is invented.

Server entries distinguish optional configured/configuredEnabled (unknown omitted)
from present. They expose toolCount/currentToolCount, zeroCurrentTools (may be
disconnected, failed or tool-less; not proof of resource-only behavior), and
coldCatalog. Disabled configured zero-tool and resource-advertised/tool-less
servers remain visible. Source/section evidence obeys the unscoped/preset rule.

Skills independently OR modelInvocable and userInvocable across contexts, keep
projectPaths and per-context flags/sources. Aggregate flags do not claim every
context allows invocation; the newRoot projection supplies its exact flags.

**DECIDED B5:** exclusive metadata is a CURRENT descriptor overlay, not root
history/governance. Root persists NO owner/declaration/exclusive/release facts.
Scope owns its v1.5 last-known governance and withdrawal/release semantics; it may
use family.list() synchronously and retain its own governance records. Those are
not a second discovery ledger and are never imported as observations. Unregister
removes root's current declaration-derived state, not durable observed-name history.

#### 2.5.4 Completeness, diagnostics, and two change channels

Every snapshot and projection MUST propagate structured diagnostics
`{code,reason,reasonLocales?,inference,severity}`. `complete:true` means all
required sources/checks for THIS bounded view succeeded; it never claims unseen
future plugins or arbitrary remote tools were enumerated. Pending bootstrap/
project work, source errors, stale required views, failed/unverified applicable
inferences and persistence/import failures make affected views complete=false.
Partial/last-good data stays visible. Silent `catch { return [] }` is forbidden.

**DECIDED B6:** last-good includes valid PARTIAL facts even when complete=false
persists indefinitely. The PROVIDER alone retains/merges successful source slices.
A failed slice stays visible at last-success presence with stale:true and explicit
diagnostics; a successful empty slice removes presence. Current declaration
updates always overlay even while other slices fail; they are not persisted.
Root's observation ledger accepts valid observation deltas, never failure-as-empty.

A CONSUMER stores the latest valid provider snapshot VERBATIM and replaces its
previous snapshot WHOLESALE, including valid incomplete/bootstrap snapshots. It
NEVER merges slices, unions old entries, or reconstructs root overlays. On root
unavailability/transport failure it retains that latest snapshot, displaying cached
provenance/unavailable warnings separately; it does not overwrite it with a local
empty substitute. Provider is responsible for retaining partial facts. Historical/
imported/synthetic data never becomes current simply because a view is incomplete.

**Consumers MUST display completeness/diagnostics**, including the cards,
pickers, overview and preview. **DECIDED Q4:** each inference declares its OWNING
DSH package and verified package versions. Root reads actual versions via
pluginPackages.packageOf(...).version. A mismatch/missing version degrades ONLY
that package's inferences, with “未在当前 DSH 版本上验证” attributed to those
inferences; it does not invalidate unrelated packages or use the CLI version as
an all-or-nothing gate. For inference failures/unverified owning-package versions
the required Chinese banner is **“MCP 服务器清单可能不完整：<原因>”**;
English: “MCP server catalog may be incomplete: <reason>”. A version mismatch
includes **“未在当前 DSH 版本上验证”**. Missing translations fall back to reason.
No green/complete badge, empty authoritative roster, or clipped preview may hide
these warnings. A module observing an adapter failure during enforcement reports
its replacement inference-id set via reportAdapterDiagnostics(moduleId,diags),
with attribution/complete=false and scoped disposer/unregister cleanup as decided
above. No module can clear a root-owned failure. Reserved transport corroboration
uses its appearance in NON-NATIVE schemas; otherwise it is not-observed, NOT fail.
No live register/restrict mutation or exported-constant presence test is required.

`catalog.subscribe` is debounced DISPLAY/INVENTORY invalidation, with a scheduled
initial notification even when a cache already exists. Event contains revision,
coalesced reasons and changed project paths, never session ids. Triggers include
tools/change, agent creation/disposal, preset changes, family registration/
disposal and contributor changes, skill/project changes, local/cross-process
ledger changes, forget/import and diagnostic changes. Listener exceptions are
isolated; unsubscribe is idempotent. The provider uses public change signals
where available and a root-owned bounded reconciliation fallback where not;
unconfirmed sources stay visibly stale. Debounce timing is not an enforcement
barrier and is not an excuse to drop a final invalidation.

**Decided immediate barrier:** root applies descriptor/ownership/exclusivity
overlays synchronously to cached catalog facts BEFORE existing
`bbffFamily.subscribe` listeners run. That existing family subscription remains
the immediate invalidation signal for enforcement. Scope may read current cached
facts there, synchronously recompute its hidden rules and lift/apply actual
ToolRuntime denies and MCP section shadows, BEFORE the next assembly/dispatch.
The later debounced catalog event is for UI/discovery refresh only. Do not regress
this into a debounce window. Phase2 MUST test prepopulated late root attachment,
ordinary updates, actual inherited denies, own-layer schemas and prompt shadows.
Register immediate listeners and evaluate initial current facts; subscribing
alone does not replay already-registered descriptors.

#### 2.5.5 Root-owned durability, import and forget

**DECIDED Q3/B5:** root owns `$DSH_HOME/oh-my-bbff-widgets/catalog.json`, a
metadata-only observation ledger for ALL THREE kinds: tools, servers, skills.
No executable/schema parameters, sessions, raw config/prompt bodies, declaration,
owner/exclusive or release facts are persisted. Names survive unload/restart as
history, never invented current presence. Scope owns last-known governance.

Limits: 20,000 rows TOTAL including forget tombstones, and8MiB serialized UTF-8
storage. Each row has at most64 sources; each skill has at most64 project paths.
Overflow sets sourcesTruncated and a visible diagnostic (including project-path
overflow). Never silently prune/evict names. When full, refuse NEW names with
ledger-full diagnostic; already known names remain. Admission and union commit
both check limits, including buffered deltas. Import is at most10,000 records per
call, all-or-nothing validation/admission/commit; a rejected call changes nothing.

Write DELTAS with1s debounce; flush on dispose. Under a scoped same-directory lock,
re-read latest file and atomic-union accepted deltas via unique temp+rename. Two
processes sharing one home do not write stale snapshots wholesale. Preserve first/
last actual timestamps and source union; older imports cannot overwrite newer
observation metadata. Async mtime reconciliation every30s invalidates/re-reads
changed ledger state, without periodic discovery assemblies. All lock acquisition,
retry/backoff and reconciliation are ASYNCHRONOUS; NEVER Atomics.wait/block the
host thread. Busy locks buffer accepted deltas within the cap and retry with
backoff. Never break a foreign lock by age. Possible Windows PID reuse is NOT
proof its owner is dead: show a visible diagnostic naming lock FILE and PID.

Crash-loss window on the NORMAL successful-storage path is at most1s (one write
debounce). During busy-lock/storage failure, deltas are PENDING DURABILITY and
this guarantee does NOT apply. A visible diagnostic reports pending row count and
since when, clearing once a flush succeeds. Do not claim a durable import/forget
ack before persistence or add a separate delta journal. Dispose requests an async
flush; unresolved durability remains explicitly reported rather than falsely
claiming success.

Corrupt ledger: atomically rename to catalog.json.corrupt-<Windows-safe UTC ts>,
start a fresh valid ledger and keep a PERSISTENT corruption diagnostic. Never
overwrite/delete that evidence or call the reset a successful read. Already
materialized successful provider slices remain stale/diagnosed as appropriate;
corrupt bytes never become valid observations. Recovery never replays stale whole
snapshots around forget fences.

**DECIDED migration:** importObservations(moduleId,records), with compatible
registered module validation and cooperative attribution. Scope reads/normalizes
its OWN legacy observations once, then sends this strict observation shape. Root
knows no module/path migration exception and never deletes/rewrites the old file.
Reject ownership/reserved/exclusive/present/seenThisRun/definition/config/session
fields, unknown keys and invalid values atomically. Root union/timestamp semantics
make retries idempotent WITHOUT import digest bookkeeping. Imported rows NEVER
count as present or seenThisRun merely because of import. Legacy exclusiveRecords
stay with Scope governance. Scope records completion only after durable ack and
retires its old discovery collector. Canonicalization of legacy preset:observed:
it does not identify an actual preset id; omit this ambiguous source marker (and
latestSource when applicable), preserve name/description/timestamps/other valid
sources, and show unresolved-source provenance instead of inventing a preset.
Root accepts canonical records only; it does not contain legacy-module literals.

forget(kind,name) refuses present/declared/exclusive/reserved entries and incomplete
current evidence. Scope also checks its own rule references; root never reads
Scope rules. A success/no-op or structured refusal is explicit. Persist a tombstone
forgottenAt under the union lock BEFORE ack; drop EVERY pending delta or import
whose lastSeenAt≤forgottenAt. A genuinely newer observation clears that tombstone
and may recreate the row. Tombstones count against BOTH caps and cannot be evicted
to hide exhaustion. Success invalidates caches/emits an event. No generation token
or per-import digest substitutes for this timestamp fence.

#### 2.5.6 Root absence and phase2 gates

Absent/incompatible catalog: NO consumer discovery. Keep the LATEST VALID provider
snapshot VERBATIM, even if incomplete; use adapter primitives only over cached
facts. Consumer UI marks its provider-availability envelope cached/unavailable,
shows original revision/timestamp and catalog-unavailable diagnostic, and cannot
claim current completeness. Do NOT rewrite/merge that stored provider snapshot or
replace it with a locally manufactured empty result. With no cache show unknown,
not authoritative empty. Cached newRoot data is reusable only for its SAME
root-normalized cwd; another path remains pending/unavailable. Root-ledger mutations
are disabled while absent. Scope retains its own last-known v1.5 governance without
running another discovery collector.

Required gates after freeze: single-provider source+installed literal audit
(DSH_ADAPTER.md); same root catalog owner/server facts in Scope/cards; startup and
changed-evidence adapter checks with failed-version/loader/resource-parse fixture
proofs that ALL consumers display diagnostics; cache-only cwd-pending→ready and
new-root exclusion tests; no-session-id metadata; user-only skill/context and
same-name own-shadow tests; two-process union/import/forget/release tests;
root-absent last-good UI; immediate family barrier tests above. Retained-revision
phase2 test: an Agent remains on preset revision A containing a UNIQUE skill and
ZERO-TOOL MCP server; revision B drops both. The full catalog still includes A's
mask-free facts, while newRoot uses B/default only. Remove the preset definition
while A survives and repeat; assert no Agent waterfall, wake or private-map access.
Inject missing retained-parent coverage and assert retained-composition-incomplete,
complete:false and retained stale facts. Phase1 runs no implementation/install/live
mutation.

#### 2.5.7 Oracle disposition — FROZEN v1.6 specification

Q1–Q5 and B1–B8 above are ACCEPTED Lead rulings, not open alternatives. Explicit
module-id APIs replace bound capabilities; all-kind capped history replaces the
history-kind question; package-specific verification and BOTH mask-free skill /
declared-mask mechanisms are decided. Consumer caching is verbatim, provider
slice retention is authoritative; no persisted declaration/release facts or import
digest bookkeeping remain. Requested cwd queries replace path registrations.

The adapter is DECIDED to be byte-identically vendored into ALL FOUR convention-
using BBFF packages: root, Scope, Team and Memory, source AND installed. Beyond
MCP/catalog literals, the gate covers Team's native/restriction/skill dispatch,
TEAM_POLICY order key, compact-command and subagent-provider conventions, and
Memory's native tool/package names, native presentation, section keys and
system-reminder wrapper. DSH package names are allowed only inside the adapter
boundary, not as BBFF module special cases in root. See DSH_ADAPTER.md.

The combined re-review is complete: Lead accepted P1/P2 as the final fixes and
authorized this ONE v1.6 specification freeze. Family-wide audit additions below
are included. Task41 closes on these frozen file hashes and strict declaration
checking; implementation/export/vendor/install verification belongs to subsequent
tasks, not this specification result.

#### 2.5.8 Family-wide audit additions — DECIDED

All new descriptor fields are OPTIONAL/additive, copied/deeply frozen and returned
by family.list()/diagnostics. Invalid fields are dropped atomically with field-
naming warnings; otherwise compatible modules stay compatible. They are contract
data, not permission to scan/name another BBFF module in root.

- toolTraits?: Record<toolName,{effect:'read'|'write'|'delegate'}>. Keys MUST be a
  subset of that descriptor's valid tools list. Invalid keys/effects drop the
  field. Team readOnly consults declared write/delegate traits, not another
  module's function-name list. Native DSH effects/classes come only from adapter
  rules with owning-package basis. Unknown effect is diagnosed, NEVER guessed
  read; the consumer's treatment is an explained setting, not an implicit allow.
- requiredTools?: {tools:string[],reason,reasonLocales?}. Unique nonempty exact
  tool names; nonblank trimmed reason≤300 and the existing≤16-locale bounds.
  This is a DEPENDENCY, not ownership and NOT a subset requirement on own tools.
  Team declares native report/control dependencies using adapter native names.
  Scope warns on save/preview when a rule would hide these, naming the module and
  reason; this warning is not automatic permission to override the user's rule.
- skillMaskProviders?: string[] follows the mask-free/declared-mask rule above.
- permissionLayer?: {title,titleLocales?,settingsSectionId?}. Nonblank title with
  existing title/localization bounds; optional valid section id. Consumers build
  other-layer explanations from CURRENT family.list(), naming each installed
  module and linking its declared section. No unconditional list of module names.

Shared root service: feature-detected bbffFamily.resolveRoot(sessionId) returns
{rootSessionId,cwd,resolved,reason}. The ONE rule is: for each hop use the live
session header when available, otherwise persisted header stats, otherwise session
query; follow adapter-decoded parentSession links. Resolve ROOT cwd, never child's
cwd. Bound traversal by ROOT_RESOLVE_MAX_DEPTH=64 and detect cycles/malformed or
missing headers; do not resume/create a session. Any unresolved result is own input
id, cwd:null, resolved:false with reason (including unavailable shared service).
Consumers do not keep competing ancestry walkers. They decide policy from this
result; Scope's unknown-cwd fail-open is a visible setting with shipped default,
not a root-service policy. Header fields/session position/depth decoding belongs
to the adapter. Resolved ancestry with absent cwd is explicitly cwd unknown; no
child-cwd fallback is permitted. The result describes ancestry, not permission.

**2026-11-08 additive SDK0.1.8 clarification:** a consumer may keep the last
successful resolveRoot result per already-attached agent as cached enforcement context
while the root is unavailable. Use that result only as is: no ancestry walking
and no discovery. It must be visibly marked as cached with its timestamp, is
dropped on agent dispose, and a fresh resolution replaces it. Agents that never
had a successful resolution are unresolved. This does not authorize a new walker,
a derived cache entry, child-cwd fallback or provider-snapshot slice merging.

Root provides root.apiBase as descriptor data. No consumer/spec copies an internal
root route; the endpoint's diagnostics payload includes compatible:false/errors
and optional-field warnings. SDK helpers FORWARD rejected/incompatible descriptors
to an available compatible root's diagnostics instead of only logging/dropping.
Malformed/missing ids get diagnostic records even if no registry key can be kept.

Export the contract values AGENT_ANNOTATOR_TIMEOUT_MS=800,
EXPOSURE_ANNOTATOR_TIMEOUT_MS=500, EXPOSURE_CONTRIBUTOR_TIMEOUT_MS=500,
AGENT_ANNOTATIONS_PER_ID_MAX=4, EXPOSURE_TEXT_MAX_LENGTH=300,
REASON_LOCALES_MAX_ENTRIES=16 and REASON_LOCALE_KEY_MAX_LENGTH=32, plus root-depth
and catalog caps/timings. The FOUR-entry annotation cap is PER ID TOTAL across
all modules, not four per module; deterministic registration order selects the
first four, with truncation diagnostics. Do not silently multiply the cap.

Add detailed collectors collectAgentAnnotations/collectExposureAnnotations/
collectExposureContributions returning {items,outcomes,diagnostics}. Outcomes
separate ok/not-applicable/timeout/error/invalid PER module. Contributor null
means only not-my-session; timeout is never encoded as null. Existing collectors
retain their contract1 return shapes for compatibility, but store the same root
diagnostics; upgraded consumers use detailed collectors. Timers are cooperative
async deadlines, not preemption of blocking JS. Rejected descriptors and callback
timeouts/rejections/invalid results appear in family diagnostics and UI.

UI kit: Badge adds title and explain?:{source,settingPath?,default?}. Root renders
explain as a tooltip/popover, not a discarded prop. Kit includes info (matching
annotation info); existing danger remains for compatibility. Every policy-derived
badge/label must supply explain or equivalent accessible explanatory content under
the three-source rule in §1.1. Catalog rows render owner+ownerBasis with explain;
there is no process-wide native/unknown label that hides the attribution basis.

Settings sections carry moduleId. v1.6 registrations MUST supply it; legacy
unattributed sections may render with a diagnostic but never imply every module's
UI is loaded. Root computes UI 已加载 PER module from that module's own registered
sections. Permission-layer links use moduleId/settingsSectionId through generic
root navigation, not guessed routes; missing targets are visibly unavailable.

#### 2.5.9 Role tools/skills/MCP permissions — OWNER OVERRIDE, DECIDED

Owner: 「不需要推荐技能包，也因此不要报未安装。给什么角色配什么skills/tools/mcp
是用户决定的，不要提前定义」. There is NO recommendation descriptor or pack-
recommendation flow. No role-reference missing/not-installed diagnostic exists,
including for explicit user allow-list entries. Do not relabel a warning as a
neutral-looking install suggestion.

Seed roles define NO tools/skills/MCP filters at all. Every role starts INHERIT
EVERYTHING. The only retained permission-related seed fields are the existing
readOnly/delegation flags; do not add effect-class filters or named pack/server
lists to seeds. These flags remain editable settings with visible shipped defaults;
this amendment does not silently change them. toolTraits describes what a tool
DOES; it never decides what a role GETS.

Filters are purely USER settings, edited through config-stage/commit. Their UI
shows 出厂默认 (inherit/no filter) or 已修改 and an explanation/setting path.
Tool/skill/MCP pickers read v1.6 catalog entries and per-row owner/source. Valid
hand-typed names are allowed. A nonexistent/unobserved name shows only neutral
catalog status: 从未出现 or 本次运行未出现, NEVER a warning, missing badge, not-
installed error or request to install a pack. Manual names do not become root
observations or ownership declarations. Syntax validation and genuine adapter/
storage diagnostics remain distinct from reference-existence status.

Model-selection projection decoding is also adapter-owned. T15 clear-override
requires a VERIFIED public mutation seam; clearing only a Team binding while a
pending native selection remains must not be called success. No fabricated clear
API/private projection write: if unsupported, return an explicit diagnostic and
UI text explaining that this override cannot be cleared here and why.

**Final P2 DECIDED:** context-pressure decoding belongs to the adapter inference
context-pressure, owned by @deepseek-ai/dsh-token-meter 0.2.1-rc.2 (package-local
version verification). Export projectionKey/DSH_PROJECTION_KEYS, including context
pressure AND model selection. Callers never copy stateOf key literals or native
projection layouts. contextPressureFacts requires explicit state/wire view. STATE
has pressureTokens/surfaceTokens/sampledSurfaceTokens/contextWindow; WIRE has
pressureTokens/projectedTokens/contextWindow. Never treat the shapes as identical.
For state with a pressure sample and sampled surface, compute the native wire
projection max(0,pressureTokens+surfaceTokens-sampledSurfaceTokens); wire prefers
its already computed projectedTokens. Otherwise a valid pressure sample is a
last-request basis; without one usage is unavailable. Window and numerator are
independent last-wins observations, NOT one atomic request sample. Normalize
used/window/percent/basis once in the adapter; percent is null without a valid
sample/positive window, otherwise round(used/window*10000)/100 (two decimal
percent, not capped at100). No Team copy of fields or formula.
Model-selection state/wire is explicit too: wire next is NOT proof of a pending
user override. Export keys but do not invent mutation support.

assistantMessageFacts normalizes direct derived assistant messages and native
assistant/message event records through one adapter read. It alone knows native
event.data.message/content-block layout; report excerpt length remains Team's
visible setting, not a hidden adapter cap. sessionEventFacts exposes the same
normalized assistant variant. Fixture/literal gates cover EXACT legacy sites:
Team team-ops.js14–30,95–112 and enforcer.js115,239–242, plus Widgets' request/log
reads (audit W12). Fixtures compare state and wire values including compaction
surface movement, missing samples/windows and malformed/mismatched view input;
key exports are asserted; direct/event assistant messages produce identical
normalized text, with non-assistant/invalid cases contained. No live mutation.

## 3. Client half — `bbffUi`

The root client module provides the client Cordis service `bbffUi`
(`UI_SERVICE`):

```ts
interface BbffUiService {
  contract: 1
  registerCard(def: BbffCardDefinition): () => void
  registerSettingsSection(def: BbffSettingsSectionDefinition): () => void
  readonly kit: BbffUiKit
}

interface BbffCardDefinition {
  id: string                        // card id inside the module
  title: LocalizedText | string
  order?: number                    // default 100; root core cards are < 100
  defaultHeight?: number            // px, 80...900
  component: (props: BbffCardProps) => unknown
  legacyIds?: string[]              // pre-namespacing ids for one-time layout migration
}

interface BbffSettingsSectionDefinition {
  id: string
  title: LocalizedText | string
  order?: number
  component: (props: BbffSettingsProps) => unknown
}

interface BbffCardProps {
  moduleId: string
  sessionId: string | null          // re-rendered when the active session changes
  kit: BbffUiKit
  t: (key: string, fallback?: string) => string
}
```

Registration:

```js
import { registerUiAdditions } from 'oh-my-bbff-sdk'

export function apply(ctx) {
  registerUiAdditions(ctx, {
    cards: [{ id: 'hello', title: { zh: '示例卡片', en: 'Hello' }, order: 100,
              defaultHeight: 200, component: HelloCard }],
    sections: [{ id: 'hello', title: { zh: 'Hello 设置', en: 'Hello settings' },
                 order: 100, component: HelloSettings }],
  })
}
```

**Namespacing requirement.** The root resolves a registered card's module id
from the module's host descriptor `ui.cards` declaration (first match) and
persists the card as `moduleId/cardId`; the client card definition itself does
not carry a module id. Every card a module registers must therefore be listed
in its host descriptor `ui.cards` (and a module contributing settings should
set `ui.settings: true`). A module that forgets this still renders, but its
cards fall back to the namespace `module/` and may collide across modules.

Root guarantees (a module must not reimplement them):

- card chrome: title, collapse, bottom resize, max height, drag/dock, N-way
  split, layout persistence (localStorage), hidden retention;
- layout ids are namespaced `moduleId/cardId`; `legacyIds` entries are migrated
  once when the card first registers;
- rendering order: core cards, then registered cards by `order`, then `id`;
  settings panel = core general settings + registered sections by `order`, then `id`;
- module unload/HMR removes its cards and sections; re-registration restores
  them into their retained layout slots;
- if the module host half is registered but its client half is not loaded, the
  settings diagnostics show `ui: missing`; no crash.

`BbffUiKit` is the only root UI surface: `Row`, `Checkbox`, `Badge`, `Hint`,
`Empty`, `Spinner`, `ErrorText`, `Button`, `Input`, `postJson`, `getJson`,
`useSession`, `usePoll`, `openSession`, `openFile`, `locale`, `t`, `tokens`.
`openSession` opens a session in the main view, `openFile` opens a file in the
right-sidebar preview (relative paths resolve against the session cwd), and
`tokens` exposes the current `--dsw-alias-*` theme token values. Modules must
not import root internals or guess root CSS classes.

**Operational note — adding a client half to an already-loaded package.** The
Host composes the client boot graph from each enabled Loader entry's
`dsh.client` declaration and caches that package metadata until Host restart.
A package first installed *with* `dsh.client` is discovered normally; a package
upgraded in place from a host-only version to one that adds `dsh.client` keeps
serving the old cached declaration until the Host restarts (the module then
shows up with `ui: missing`). The same applies to newly added `locale/`
exports for plugin-list display metadata, which Node's module resolver caches
per process. Ship `dsh.client` and `locale/` from the module's first release,
or accept one Host restart after enabling a client half.

## 4. Discovery semantics

1. A module's host plugin applies → `registerFamilyModule` → registration when
   the root host exists.
2. The same bundle's client module loads (`dsh.client`) → `registerUiAdditions`
   → cards/sections appear in the panel and settings seat.
3. Enabling/disabling/removing the module changes the UI with zero root changes.
4. Root absent → module is fully usable standalone; root present, module absent
   → the UI simply has no entries for it.

## 5. Versioning

- Both services carry `contract: 1`. Root accepts exactly the versions it
  implements; incompatible descriptors are recorded as `compatible: false`.
- Additive fields are backward compatible; removing/renaming a field or
  changing a signature bumps the contract number.
- Public SDK semver: `oh-my-bbff-sdk` major tracks the contract major.

## 5.x UI locale (additive — SDK 0.1.16)

Every package ships one dictionary file per language: `locale/en.json` and
`locale/zh.json` with

    { "meta": { "title": "…", "description": "…" },
      "ui":   { "<flat key>": "<template with {param}>" } }

`ui` is flat key → string, namespace = the package name. `en` is the complete
reference; a shipped `zh` must carry exactly the same key set.

### Declaration

```js
registerFamilyModule(ctx, { …descriptor, packageName: 'oh-my-bbff-team',
  locale: { dir: 'locale' } })          // dir is package-relative; default 'locale'
```

The root resolves `<package dir>/<dir>/*.json` from `packageName`; there is no
package list in code. `title` and `description` may also be message references.

### Host text is a message reference

```js
import { msg } from './lib/bbff-contract.js'
msg('settings.mode.title')                 // { $bbff: 'bbff-message', key, params?, ns? }
msg('settings.mode.count', { count: 3 })
```

Host code emits references for every UI string it produces: settings descriptors
(label, description, effect, option labels, group titles, source), card/overview
`reason`, diagnostics `reason`, module descriptor title/description. A
`{zh,en}` map or `reasonLocales` is legacy third-party compatibility only.
`resolveMessage(value, { t, bind, legacy })` resolves a reference, a legacy map
or a plain string; params that are themselves references or legacy maps are
resolved first.

### Client

- The root registers every (package, language) dictionary with DSH's `locale`
  service before the first card renders, adds unknown user language ids with
  `addLanguage({ id, label, fallback: 'en' })`, and re-registers on
  "Reload language files". DSH's own fallback chain makes every non-`zh`/`en`
  active language render English.
- `props.t(key, params)` / `props.kit.t(key, params)` are bound to the
  rendering module's package namespace; `kit.msg` builds references,
  `kit.resolveText(value, params)` resolves them. `kit.locale()` is removed.
- User files: `$DSH_HOME/oh-my-bbff/locale/<id>.json`

      { "language": { "id": "fr", "label": "Français" },
        "packages": { "oh-my-bbff-widgets": { "ui": { … } } } }

  Unknown ids are added to DSH's language list; user files never override the
  shipped `en`/`zh` (use a distinct id such as `zh-custom`); malformed files
  are reported in diagnostics and skipped. `template.en.json` is exported by
  the BBFF settings "Language files" block and is never loaded as a language.
- Lifecycle: dictionary and language registrations are disposers owned by the
  client plugin; unload removes them and the locale subscription.

## 6. First-party packaging

First-party bundles (`oh-my-bbff-widgets`, `oh-my-bbff-memory`, ...) vendor the
runtime file byte-for-byte as `lib/bbff-contract.js` and import it relatively,
so the profile install has zero runtime dependencies. `oh-my-bbff-sdk` is the
source of truth; `scripts/sync-into.mjs` copies/checks the vendored file and
every bundle's tests must assert byte equality.

External modules may either vendor the same file or bundle `oh-my-bbff-sdk`
into their client bundle. The contract is open: any `oh-my-bbff-*` package can
register; root validation is strict but module installation is never automatic.
