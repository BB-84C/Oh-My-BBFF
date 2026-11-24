# Changelog — Oh-My-BBFF Scope

## 1.0.1 — Shared SDK contract alignment

- Aligns the vendored contract with the current Oh-My-BBFF SDK. Workspace rules, settings, and enforcement are unchanged.

## 1.0.0 — first public release

- First public release of Oh-My-BBFF Scope. Family-wide version reset to 1.0.0.
- Requires DeepSeek Harness 0.2.2 or newer.
- The user-facing README was rewritten. The development log below is preserved unchanged.
- `CHANGELOG.md` is new. The former README is this history, moved verbatim.

# Oh-My-BBFF Scope — workspace availability

## 0.5.0 — UI i18n

All Scope UI text lives in `locale/en.json` and `locale/zh.json` (flat `ui` map, one file per language, DSH plugin-list convention). `en.json` is the complete reference; `zh.json` carries exactly the same keys. Code holds keys only: the client resolves them through the family root's locale binding (`props.t` / `kit.t`) and resolves host text (settings descriptors, statuses, caveats, diagnostics, API errors) through `kit.resolveText`, because the host emits locale message references (`{ $bbff: 'bbff-message', key, params }`), never text. The language follows DSH's own locale setting: any non-Chinese DSH language shows English through DSH's fallback chain, and a user language file only needs the keys it wants to change.

No `{ zh, en }` maps, `reasonLocales`/`titleLocales`, `detectLang` or client `DICT` remain; the vendored SDK is 0.1.16 and ships its own `lib/bbff-sdk-locale/*`. Packaged gate: `scripts/check-package.mjs` checks en/zh parity, placeholders, that every key used in code exists in `en.json`, and that shipped code carries no CJK and no legacy locale shapes.

## 0.4.1 — generation lifecycle

Every Scope-owned background activity is bound to the plugin generation: the debounce timer, catalog refresh/sweep, provider reads, governance/cache writes, family/catalog subscriptions, adapter-report registration, tool restrictions/guards, skill masks, prompt section shadows and per-Agent assembly listeners. Disposal clears the timer, aborts sweep continuations, waits for an in-flight read to settle before closing the owned queues, and leaves a reloaded generation with exactly one registration set and zero activity from the old one. No setting or behavior change.

## 0.4.0 — DSH0.2.2 port

Requires DSH `>=0.2.2-rc.2`. The presentation waterfall filters only MCP instructions/resource sections; tool declarations and calls are governed through native `tools.restrict` and `guard`, including conditional registrations. SDK0.1.15 is vendored byte-for-byte. The shared Root catalog remains the only discovery source, including dynamically registered and preset-mounted MCP servers; Scope does not copy native server configuration or connect/probe servers.

Inherited preset capabilities can be hidden. An Agent's **own** tool declarations are exempt from native restrictions: Scope reports that visibility limitation and still vetoes matching calls through the native execution pipeline. Custom executors must honor native registry admission and guards. Old Creator skill names are not remapped or written into owner data: the live catalog supplies `dsh-doc`; removed names can remain explicit historical/manual rules until the owner edits them. Settings and client registration contracts are unchanged.

0.3.5：诊断通知按当前界面语言选择文案，当前语言缺失时原样显示原文；不再因为句子不含中文而隐藏，无新增设置、无 SDK 变更。

0.3.4：设置页接上 Widgets 0.18.8 的 v2 呈现——基础三项（工作区未确定时、规则入口、诊断）+ 折叠高级设置，每项后果句与分组均来自 Host 数据；规则入口真实打开查看/新建编辑器，无 SDK 变更。

0.3.3：同步 SDK 0.1.13 vendored adapter，并将身份读取改为静态 JSON manifest、增加 prepack 一致性门；无用户可见变化。

Scope manages **one permission layer: workspace rules**. It adds **zero model tools**. Its settings, catalog, rule picker, new-root preview, current-session diagnostics and audited history live in the BBFF settings panel.

Module-exclusive tools and reserved transports are not governed by Scope. Other installed permission layers are listed from current `permissionLayer` descriptors, with contract-provided settings links. Scope never guesses which other modules are installed and never computes their permission intersection.

## Shared catalog, not a second discovery system

Scope consumes the frozen v1.6 `bbffFamily.catalog` contract. The family root alone discovers tools, MCP servers and skills; Scope does **not** scan Loader entries, acquire presets, inspect MCP packages, parse discovery prompts, enumerate skills or maintain another observation ledger.

The provider supplies current and historical names, source/owner attribution and basis, declared owners, presence/staleness, first/last observations, skill invocation flags, configured/enabled MCP metadata and completeness diagnostics. The same provider facts feed root exposure cards and Scope. Scope adds only its own governance/rule status. Manually entered rule-only names remain clearly marked local overlays, never root observations or ownership declarations.

- Current, stale, not-seen-this-run and never-observed are distinct states. A reference that has never appeared is neutral, not an installation warning.
- “This run” means since the **catalog provider started**, not this conversation and not a promise that a tool is callable.
- User-only skills remain listed. Preview uses the provider's exact projected invocation flags, not the full-catalog OR summary.
- Configured/enabled is separate from tool presence. Zero current tools may mean disconnected, failed or tool-less; it is not a connection-health or resource-only claim.
- The reserved transport is not synthesized by Scope. When observed in the provider catalog, its name/reason comes from the shared adapter.
- Missing or unverified inference evidence belongs only in the single default-OFF **诊断信息** panel and its collapsed **原始数据**. Ordinary settings, rule editors and new-root previews show neither completeness notices nor catalog timestamps; the original cause, revision and `generatedAt` remain intact in diagnostic data. Incompleteness is evidence quality, not a loading state or proof of an MCP disconnection.

Truly future session-local registrations can only become observations after they exist. No dormant Agent is resumed or woken to complete an inventory. Discovery limitations are diagnosed rather than replaced with guessed names.

## Attribution and enforcement

Display attribution uses the provider's known → hint → fallback choice. Scope passes manually entered MCP rule names as `serverHints`; hints never create rows, owners, observations or timestamps.

**Enforcement checks every returned candidate. If any candidate server is hidden, the tool is denied**, even when another candidate wins display attribution. With no candidates, the explicit fallback server is used. Scope never reparses an active provider result with a competing regex.

All host conventions used mechanically during enforcement come from the canonical, byte-identical vendored SDK adapter: name patterns, reserved transports, MCP section identities/order keys, safe resource-section codec, exact resource/skill dispatch and recognized restriction-error recovery. There is no copied prompt sentence, package scan, MCP-name parser or numeric MCP section order in Scope.

## Workspace rules and unknown cwd

Rules remain global and audited:

```text
$DSH_HOME/oh-my-bbff-scope/rules.json
$DSH_HOME/oh-my-bbff-scope/changelog.jsonl
$DSH_HOME/oh-my-bbff-scope/.history/<uuid>.json
```

```json
{"version":1,"rules":[{"id":"example","kind":"mcp","name":"analysis_server","workspaces":["D:\\Work\\Analysis"]}]}
```

- An **empty workspace list imposes no workspace restriction**. Multiple nonempty rules apply simultaneously; an unrestricted rule never cancels another rule.
- Paths must be fully qualified absolute paths. Scope matches normalized text and directory boundaries: equal or descendant, not sibling-prefix. Windows matching ignores case. Symlink/junction aliases are **not** resolved; the settings page states this limitation.
- Scope calls the shared `bbffFamily.resolveRoot`; it has no competing ancestry walker. The ROOT session cwd governs children. A mid-session directory change does not re-scope the root tree.
- The visible **工作区未确定时** setting (`unknownCwd`) offers **放行 / open (factory default)** or **全部隐藏 / hide-all**. Hide-all hides governable tools and known skills/MCP instructions when the ROOT cwd is unknown; reserved/exclusive tools remain exempt. Current-session rows show workspace and matched-rule count; the policy outcome and resolution reason remain in tooltips and diagnostics.
- Per the Lead-approved v1.6 clarification, an already-attached agent retains its last successful shared ROOT result **as-is** while the root is unavailable. Its restrictions stay applied; the UI and diagnostics show “根模块不可用，按上次解析结果（time）执行” with the original timestamp. No walking or new discovery is performed. A fresh usable resolution replaces this context, and agent disposal drops it. Only an agent with no prior usable resolution falls under the visible unknown-cwd setting; a new instance never inherits a disposed instance's cache. Scope never substitutes a child's cwd.

Settings are separate from the rule file, with their own revision token. Merely reading the catalog, preview, history or diagnostics never edits rules or audit history.

## Settings presentation contract v1

The Scope-owned `lib/settings-metadata.js` contract supplies controls, Chinese display names, option labels, defaults and source paths. Type/group headings use descriptor display names, never raw `mcp`/`tool`/`skill` identifiers. Each setting has one short **默认** line; source paths, ranges and explanatory text are tooltip material. The collapsed **显示名称** editor persists partial `displayLabels` edits with the same settings CAS; only declared, nonempty single-line labels up to80characters are accepted.

`showDiagnostics` defaults to **false**. The single **诊断信息** panel selects the current UI locale's reason or falls back to the raw reason, without a language/script exclusion, and deduplicates by authoritative key and sentence. Transient entries, full original messages, timestamps, revisions, descriptors, session identities and preview responses remain intact under collapsed **原始数据**. Range guidance and per-row explanations are not ordinary-page prose. Per-session inspectors live only in that collapsed diagnostic area and make no request until explicitly opened.

Older settings files retain their exact availability policy and resolve the added presentation defaults without any read-time rewrite. Saving a partial presentation change preserves the availability policy and all other labels; the rule file, audit history, provider membership and enforcement implementation are unchanged.

## Module governance and dependencies

Current compatible `exclusiveTools` declarations are authoritative. Scope retains a **governance-only** last-known snapshot; absent owners retain their prior exclusivity, while a present owner's explicit withdrawal releases it. A live declaration beats persisted data. Exclusive names are never restricted, guarded, filtered or annotated unavailable by Scope. New rules targeting them fail server-side with localized reasons; legacy rules remain readable/revertible but are explicitly ignored.

First-declared and last-confirmed times are separate. Identical polling does not manufacture new declaration timestamps. Old data repeatedly re-stamped its declaration field, so a migrated record's first-declaration time is **unknown**, not fabricated from that old last-confirmed value.

A module's `requiredTools` is a dependency declaration, not ownership or an exemption. Before saving a rule that hides one, the UI names the dependent module/tool/reason and asks for acknowledgment; preview repeats the warning. The chosen rule still applies. Scope declares its own synthetic skill provider through `skillMaskProviders`, so those masks cannot masquerade as real skill observations.

## Cache, import and root absence

```text
$DSH_HOME/oh-my-bbff-scope/catalog-cache.json  # latest provider snapshot + migration receipt
$DSH_HOME/oh-my-bbff-scope/governance.json     # last-known exclusivity only
$DSH_HOME/oh-my-bbff-scope/settings.json       # explicit Scope settings
```

The consumer caches the latest valid provider snapshot **verbatim and wholesale**, including valid incomplete/bootstrap snapshots. It never merges source slices, unions old names back in or reconstructs root overlays. Partial-slice retention is the provider's responsibility. On provider absence/failure, the original snapshot/revision/timestamp remains unchanged and a separate cached/unavailable envelope is shown. With no cache the catalog is unknown, not authoritative empty. A cached new-root projection can be reused only for its exact provider-returned cwd key. Root-ledger mutations are disabled without the provider.

On first successful migration, Scope reads its old catalog and calls generic `importObservations(moduleId,records)`. It keeps names/descriptions/timestamps, omits ambiguous `preset:observed` and its latest-source marker, and reports unresolved provenance. Exclusive records stay with Scope; they are never imported as observations. A durable acknowledgment precedes the completion receipt. The old file is not deleted or rewritten, and the old discovery collector is retired.

Governance writes use asynchronous scoped locks, latest-file union, unique temporary files and atomic rename. Lock contention never blocks the host event loop. A foreign lock is never broken by age or guessed PID death; the diagnostic identifies its file/PID. Storage failure does not cancel immediate in-memory governance, but durability failure is reported.

## Preview, diagnostics and history

A preview asks the provider for **a new ROOT session at that path**: host + current default preset + project skills and actual sections/resources. It never substitutes every historical, descriptor-only or other-session name. Pending/error/incomplete states are preserved in diagnostic raw data; a pending empty projection is never declared “unrestricted.” Returned cwd is the provider-normalized cache key. A text-free animation is mounted only while the actual settings/preview request is unresolved and removed on settlement; `complete=false` never starts an animation, and a settled pending/error response never becomes an endless spinner.

Per-session diagnostic expanders read only the selected live session when opened. They show resolved ROOT context, Scope-effective visible tools and MCP section text. They do not wake sessions.

History is paged and shows translated actions, affected rule names and before/after rule differences. **Revert restores the entire rules file to the selected before-image, including other rules**, as a new audited edit. No-op edits create no history. Audit rows and all snapshots remain on disk; paging does not silently discard older history.

## Runtime boundary

Scoped ToolRuntime restrictions hide inherited tools; a monotonic guard catches own-layer and late registrations, and an actual-Agent-only assembly backstop removes hidden schemas. Scope's waterfall does not run on mask-free preset discovery leases. Exact unknown-name recovery is adapter-owned.

Own-layer tools cannot always be removed from PTC-generated declarations. **When a workspace rule hides such a tool**, its call is still denied; Scope does not perform text surgery on generated code. Scope does not manage MCP process or connection lifetime. Skill hiding disables both model and user invocation and returns no body.

This is availability/context control, not a filesystem/network sandbox or server-name secrecy boundary. Existing transcripts and global diagnostics may retain names.

## API

All operations use `POST /oh-my-bbff-scope/api`. Non-POST returns405; cross-origin browser calls return403. Input/governance failures return400 with `{ok:false,error,code?,reasonLocales?}`. Maximum request body is256KiB. The client parses error bodies and never replays a mutation.

| Action | Purpose |
|---|---|
| `state` | One decorated shared catalog, rule status, current sessions, workspace registry, settings/defaults/revisions, current permission layers/dependencies and first history page. |
| `check-rule` | Validate a candidate without writing; return module-owned required-tool warnings. |
| `upsert`, `delete`, `revert` | Audited rule edits with optional rule-revision CAS; governance is rechecked at commit. |
| `settings-save` | Save a partial availability or presentation patch with separate settings-revision CAS; return updated Host descriptors. |
| `history` | Explicit offset/limit page with affected names and before/after changes. |
| `catalog-forget` | Delegate durable forget to the provider after Scope's rule-reference/governance guard; reject incomplete/current/declared/reserved/exclusive evidence. |
| `preview` | Root-normalized new-root projection and Scope-only visibility/dependency warnings. |
| `diagnostics` | Read one live session's ROOT resolution, effective tools and MCP sections without waking it. |

## Release discipline

Source version0.3.2 consumes the frozen v1.6 contract. This patch only moves completeness/timestamp presentation into diagnostics and makes actual request loading animation-only; it adds no settings or data migration and does not change catalog discovery, the SDK, enforcement, permissions or rule bytes. It has no new dependencies. The SDK contract and adapter are vendored only through the official byte/SHA-checked sync path, never local stubs. Installation follows the Widgets/root upgrade and the Lead's serial install slot; no DSH restart is required. Source implementation is not proof that the currently installed GUI has been upgraded.

The workspace Scope tests cover the real ToolRuntime/SystemPrompt/SkillRegistry/resource boundaries, provider-contract consumption, candidate enforcement, safe legacy governance, exact cached snapshots, migration, concurrent async governance writes, and real-client interactions. Release acceptance additionally requires installed byte checks, family literal gates and live root/Scope parity with unchanged rules/audit evidence.
