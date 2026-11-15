# Changelog — Oh-My-BBFF Widgets

## 1.0.0 — first public release

- First public release of Oh-My-BBFF Widgets. The family aligns every package at version 1.0.0.
- Requires DeepSeek Harness 0.2.2 or newer.
- The user-facing README was rewritten. The development log below is preserved unchanged.
- Documentation correction that supersedes the historical wording below: notes are never injected into a prompt, but the model can read them through the `read_user_notes` tool when the user explicitly asks.
- `CHANGELOG.md` is new. The former README is this history, moved verbatim.

# oh-my-BBFF-widgets

The **Oh-My-BBFF family root** for DeepSeek Harness: a shared capability catalog,
contract-driven status cards/settings, goal board, collaboration views and private
human notes.

## 0.20.3 — settings presentation namespaces (SDK 0.1.16)

- The BBFF settings page renders **member-owned presentation data** (group titles,
  basic groups, advanced counts, effects, display labels) through the shared
  Widgets layout. That layout now inherits the **member's** module context from the
  `kit` it hands out: `kit.SettingsLayout` / `kit.SettingHelp` default to the
  module's own id and stamp every collected reference with the producing package
  (recursively, params included), so a member needs no change and a reference is
  still resolved in its producer's namespace.
- Layout chrome owned by the Widgets root (advanced title/count/changed, help
  label, missing/invalid notices) falls back to the Widgets dictionary when a
  member's presentation data omits or cannot resolve a slot.
- The settings **card list** resolves each card's title in the module that
  registered it instead of the root section's namespace, and a failed lookup is
  treated as unreadable (localized fallback) rather than printed as a key. A
  translated title that happens to match a card id (e.g. English "Memory") is
  kept; only a literal raw id is replaced.
- Regression gate `test-settings-page-0203.mjs`: the real Team/Memory/Scope
  settings descriptors and the real Widgets root descriptors are rendered through
  the real per-module kits in zh, en and ja, and the rendered text plus
  `title`/`aria-label`/`placeholder`/`alt` attributes are scanned against every
  family dictionary key (zero hits); the real card catalog is checked the same way.
  Against the 0.20.2 client the same gate reproduces the clean-room keys
  (`settings.group.*`, `settings.basicGroup.*`, `presentation.group.*`,
  `settings.advancedCount/Changed`, `card.*.title`).

## 0.20.2 — reference namespaces (SDK 0.1.16)

- A message reference is always resolved in its **producer's** namespace. The host
  stamps `ns: 'oh-my-bbff-widgets'` on every reference it creates for shared
  payloads (exposure badges/availability, catalog owner basis, exposure reasons,
  diagnostics, settings descriptors) through `lib/locale-keys.js`, and
  `family.js` stamps the contributing member's package on every reference it
  collects from a member (annotations, contributions, descriptor fields), nested
  params included.
- The client keeps `value.ns` first; `kit.msg` stamps the module's own namespace.
  Previously a Widgets-produced badge reference or a Scope reason reference was
  resolved in the *consumer* module's dictionary and rendered as a raw key
  (`exposure.badge.module`, `reason.ruleHidden`).
- Regression gate: the real host exposure payload (a member annotation plus
  BBFF-owned tools from member modules) rendered through the real client, scanning
  text and `title`/`aria-label` attributes for any family dictionary key in zh
  and en.

## 0.20.1 — hot-install regression (SDK 0.1.16)

- The client-side card/settings-section validators now accept locale message
  references exactly like the vendored contract (`validateCard`,
  `validateSettingsSection`): a reference `title` or `description` is no longer
  rejected, so a migrated family module's cards and settings sections register.
- The `bbffUi` service exposes `msg(key, params)`, which Team 0.12.0 uses to build
  card/section title references; without it the whole Team report card was
  skipped silently.
- Regression gate `test-family-bundles-022.mjs`: the real Team, Memory and Scope
  client bundles register against the real Widgets root with zero rejected
  cards/sections and render their titles in zh and en; plus a parity test that
  runs identical inputs through the client mirrors and the vendored validators.

## 0.20.0 — UI localization (SDK 0.1.16)

- **Follows the DSH language setting.** Every UI string now lives in
  `locale/en.json` / `locale/zh.json` (`ui` = flat key → template). The root reads
  every family member's `locale/*.json` (declared by `locale: { dir }` in the
  family descriptor — there is no package list in code), registers each
  (package, language) with DSH's locale service before the first card renders,
  and re-renders on `locale/change`. A DSH language other than `zh`/`en` falls back
  to English through DSH's own chain; nothing in the panel picks a language.
- **Copy one file for a new language.** `$DSH_HOME/oh-my-bbff/locale/<id>.json`
  (`{"language": {id, label}, "packages": {"<pkg>": {"ui": {…}}}}`) adds a
  language, or a custom Chinese wording under a distinct id. Unknown ids are
  added to DSH's language list (`fallback: en`); user files never override the
  shipped `en`/`zh`; malformed files are reported in diagnostics and skipped.
  BBFF settings → *Language files* shows the folder, exports
  `template.en.json` (the combined English of all installed packages) and reloads
  the files live.
- **Host text is a message reference.** Host code emits `{ key, params }`
  (`msg()` from the SDK / `kit.msg()` on the client), never a rendered string;
  the client resolves it in the owning package's namespace (`kit.resolveText`).
  `{zh,en}` maps and `reasonLocales` are gone from Widgets; the SDK still accepts
  a legacy `{en,…}` map for third-party modules via `ctx.locale.resolveText`.
- **SDK 0.1.16**: family members declare `locale: { dir }`; the root host exposes
  `POST /oh-my-bbff-widgets/v6/api {action:'locales'|'locales-template'}`;
  `kit.t(key, params)` is bound to the rendering module's package namespace,
  `kit.msg` / `kit.resolveText` are the reference helpers, and `kit.locale()` /
  `pickLocale` are removed. The vendored `dsh-adapter` diagnostics are keys in the
  `oh-my-bbff-sdk` namespace (`lib/bbff-sdk-locale/*.json`).
- **Lifecycle**: dictionary registrations, user-language registrations and the
  locale subscription are disposers on plugin unload; a reload disposes and
  re-registers without a host restart.

## 0.19.6 — full-ledger outsourced counts

- Core and Lead rows take their `N 外包` badge from Team's full-ledger
  `outsourcedCount` / `outsourcedDescendants` fields (additive, Team 0.11.1)
  instead of counting only the bounded outsourced rows shown in the column, so a
  member whose children are older than the visible window still shows the right
  number. When Team has not supplied a count, the badge falls back to the shown
  rows.

## 0.19.5 — sidebar button restored on Team rows

- Every non-Lead Team row (core and outsourced) again exposes the native
  subagentchat resource, so the per-row "Open in sidebar" chevron renders next to
  it. Parent/mode come from Team's public view (`parentId`, `mode`, additive); a
  direct child of the Lead falls back to (Lead session, `continuable`), and a row
  with no known parent keeps a plain session resource (row click opens it in the
  main area, sidebar button stays hidden). No cold reads are used to find a
  parent. The Lead row has no sidebar button; row click behaviour is unchanged.

## 0.19.4 — plugin lifecycle: dispose stops everything

- Every timer, interval, debounce, background refresh, catalog-ledger write,
  in-flight read, subscription and cache owned by Widgets is tied to the plugin
  lifecycle. Disposing the plugin aborts in-flight session reads, cancels all
  timers and trailing flushes, stops ledger writes, and drops subscriptions; a
  reloaded generation starts clean with no activity left from the old one.
  A lifecycle test disposes mid-refresh and proves zero persistence calls
  afterwards, then starts a fresh generation that works normally.

## 0.19.3 — no cold log decodes from the panel

- Team card performance contract: the card never walks the subagent tree and never
  reads cold parent catalogs. Oh-My-BBFF Team's public member view is the single
  source (it already carries createdAt/dispatchedBy); without Team only the Lead's
  own live catalog is shown. Removed the per-parent `observeSession` cold reads
  that caused repeated 40+ MB session-log decodes and the Web UI hang.
- All remaining cold reads follow the same rule: cheap `persistence.stat`
  revision check first, derived facts cached per (sessionId, revision), bounded and
  in-flight deduped. Exposure metadata no longer cold-observes a session.
- Event-driven invalidation is coalesced (trailing, at most one Team-card refresh
  per 1–2 s), never one recompute per committed event.
- Catalog ledger is a no-op for unchanged observations: a cheap content
  fingerprint is compared before clone/serialize, and the atomic write happens
  only when the merged document changed.
- Team-card ordering follows activity, not creation: running agents (live Agent
  status, never a stale Team snapshot) sort to the top of both columns with a
  pulsing running dot; everyone else sorts by most recent activity
  (Team `lastActiveAt`/`reportAt`, falling back to createdAt), newest first. The
  Lead row stays pinned first in the core column. Activity comes from Team's
  public view plus live Agent state — never a cold session read.

## 0.19.2 — Team tasks card and member-row polish

- The shared task board moved out of the Team card into its own dockable
  **团队任务 / Team tasks** card (default visible, ordered right after Team).
  The Team card now contains only the Lead/core and outsourced member columns,
  so a busy team no longer buries the task board under hundreds of rows. Old
  saved dock layouts load cleanly: the new card is appended, unknown ids are
  dropped, no empty slot.
- Core rows no longer repeat the last report excerpt (the Oh-My-BBFF Team card
  already shows reports); name, role, status and model line stay.
- Overflow fixes: member text lines wrap or ellipsize inside their row
  (`min-width:0` flex children, `overflow-wrap:anywhere` for model strings), the
  sidebar chevron is a fixed-size flex item, and columns can shrink — checked at
  wide and narrow dock widths.
- Counts are self-explanatory: the Team header reads like `核心 8 · 外包 236`,
  and each Lead/core row's badge reads `<n> 外包` instead of a bare `+n`.

## 0.19.1 — one Team card with core and outsourced members

- DSH 0.2.2 has no separate teammate set: every agent of the Lead's native tree is
  part of the team. Widgets adds the owner's distinction: **core** seats carry a
  fixed long-lived responsibility and are reused heavily (the pre-0.2.2 team
  members), while **outsourced** agents (formerly independent subagents) take
  bounded dispatches from the Lead or a core member and can be reused for
  follow-ups.
- The Subagents card is removed. The single Team card shows the Lead and core
  seats on the left and the outsourced column on the right (newest first, each
  with role-or-unbound, model, status and who dispatched it; core rows count
  their outsourced children). Narrow dock widths wrap the second column below
  the first. The task board and other Team-card content stay; a saved dock layout
  that still names the old card loads cleanly without an empty slot.
- Tiering, aliases, roles, routes and report excerpts come only from Oh-My-BBFF
  Team's public member contract (`bbffTeam.members`). Without it every child is
  outsourced/unbound and names stay native — Widgets never invents a membership
  or a name. Other cards and docking are unchanged.

## 0.19.0 — DeepSeek Harness 0.2.2

Requires DSH `>=0.2.2-rc.2`. Every card and the dockable BBFF panel remain available.

- Session exposure uses native tool restrictions and a monotonic call guard; the
  obsolete tool-filtering assembly listener is removed. Disabled MCP servers also
  lose their instruction/resource sections and cannot be reached through resource
  tool arguments; the remaining prompt filter changes sections only. Agent-owned tool shadows
  are guard-protected but cannot be hidden by an inherited-tool restriction.
- Collaboration reads the named native subagent tree and the root conversation's
  saved Team mode/task board. Model badges use each Agent's current selection;
  Team role labels continue to come from public family annotations.
- The shared catalog also discovers dynamically registered MCP servers with no
  tools or instructions, and distinguishes removed records still awaiting cleanup.
- Goals, todos, notes, settings, family cards and docking are retained. Notes and
  BBFF settings use the native left-sidebar panel registrations; when unpinned,
  they remain reachable under More. No user settings or model choice is migrated.

## 0.18.10 — diagnostics never hide text by its script

- The Widgets diagnostics notice list shows the current UI locale's reason when the
  Host provides one, otherwise the reason exactly as written. A reason written only
  in English, or in any other script, is no longer dropped; the Han-character gate
  and the Chinese sentence splitter are removed from that read site.
- Nothing else changes: transient entries stay excluded by state, duplicate keys and
  duplicate texts stay deduplicated, the collapsed raw details still carry every
  entry, and diagnostics remain the same default-OFF panel.
- No new setting, no stored key, no SDK or Host data change.

## 0.18.9 — newest-first collaboration and goal history

- Team tasks reverse the public task service's creation order, without parsing IDs
  or inventing timestamps. Subagents use stable descending creation time; unknown
  creation times remain at the end and are marked in the panel.
- Goal history uses the recorded transition into completion, not later edits to a
  completed goal. Missing completion evidence uses last update time, then creation
  time, with the fallback shown beside the goal.
- Derived session checkpoints move from schema1 to2. Each old checkpoint rebuilds
  once from supported session facts in the background, reports the reason and
  duration, then resumes incremental reads. Completion times survive checkpoint
  restore. Original logs and user settings are not changed.
- The shared settings layout also keeps footer panels visible with legacy
  metadata. Its presentation-v2 branch is unchanged.

## 0.18.8 — three basic settings groups and optional advanced controls

- Widgets settings start with three categories: cards, automatic goal opening, and
  note limits. Other controls stay mounted inside an initially closed advanced
  section. Its expansion is component-local and is never written to preferences.
- Every Root field has a bilingual consequence sentence from Host presentation
  data. Help opens on click (including touch), and missing effect data falls back
  to existing descriptions or no text, with missing-data facts in diagnostics.
- The changed-advanced count compares current and shipped values semantically.
  Basic cards use three columns at1080px; advanced rows use two columns at960px.
  Other plugin sections keep their existing renderers until their owners opt in.

### Additive Widgets settings presentation extension (metadata v1)

This does not change the shared SDK or stored settings. Field descriptors may add
`effect: {zh,en}`, `importance: 'basic' | 'advanced'`, `basicGroup`, `basicOrder`,
and `advancedGroup`. Consequences are limited to60 Chinese /120 English characters.
The Host may publish `presentation: {version:2,basicGroups,advancedGroups,labels}`.
Groups contain readable localized titles; field membership and order come only
from each field's `basicGroup`/`basicOrder`. No Client key-to-copy map is used.

An additive `kit.SettingsLayout({descriptors,values,locale,renderField})` component
partitions valid descriptors, owns only local advanced expansion, and calls the
plugin's own `renderField(field,{basic,group})`; it never saves values itself.
`kit.SettingHelp({field,locale,labels,moduleId})` provides click/keyboard help using
`field.effect`, then `descriptionLocales`/`description`. `labels` comes from the
Host's `presentation.labels`, not from a plugin-specific Client copy table.

Missing/invalid presentation or fewer/more than three declared basic groups keeps
all legacy controls flat and visible. Missing consequences and grouping problems
are retained in default-OFF diagnostics. Old modules and metadata v1 keep working;
this release does not supply Memory, Team or Scope field text or group choices.

0.18.7：同步 SDK 0.1.13 vendored adapter，修正包身份的 HMR 依赖并增加发布版本校验，无界面变化。
## 0.18.6 — localized card-settings group names

- Card-settings group headings read the Host's `descriptors.cardGroups` display
  metadata. The eight core names come from matching Chinese and English locale
  entries, not a Client-side identifier-to-label map. Module cards keep their own
  published localized title descriptors.
- Missing titles or titles equal to a raw card/module identifier use the Host's
  readable localized `cardGroupFallback`, never the identifier. Source paths remain
  available in the heading tooltip.
- This changes only the settings heading read site and presentation metadata. It
  adds no persisted preference keys; card identities, grouping/order, normal-card
  rendering, navigation/service resolution, SDK bytes and Host algorithms are
  unchanged from0.18.5.

## 0.18.5 — restore collaboration navigation

- Fixes the **client service-resolution regression introduced in0.18.0** that
  prevented member/subagent rows and their **Open in sidebar** buttons from
  opening sessions. That refactor put an optional property getter and `ctx.get`
  fallback inside one `try`; a throwing getter skipped the working fallback.
  Resolution now tries `ctx.get` first and isolates each accessor's failure.
- The Client declares its required `uiWorkspace`, `sidebarRight`, `layout` and
  `locale` dependencies alongside `slots`. Package module ordering is not used
  as a substitute for service injection. Reactive tab registration and genuinely
  optional theme/DOM-token fallback keep their existing lifecycle behavior.
- Member/child navigation, file/session kit links, module-settings links and the
  header's open-tab action share classified failures: absent service, throwing
  accessor, missing method, and failed invocation (including Promise rejection).
  Chinese notices and original accessor/error evidence remain in the existing
  default-OFF diagnostics panel; no action-failure console spam is added.
- Older asynchronous completions cannot overwrite a newer action result, and a
  successful retry clears that operation's current failure. Host resource data,
  SDK bytes, exposure/state algorithms and the exact **◎ BBFF面板** header are
  unchanged. Core card group-name localization remains a separately deferred task.

## 0.18.4 — descriptor-driven settings and compact diagnostics

- The additive **Widgets-owned settings presentation contract v1** returns
  `descriptors.settings`, `descriptors.cardFields` and `descriptors.displayLabels`.
  Each field carries its resolved `displayLabel`, default, limits and source paths.
  This does not amend the frozen family SDK or native adapter.
- Chinese display names ship as editable `settings.displayLabels` defaults. The
  collapsed **显示名称** editor saves partial label patches with the same atomic
  optimistic-revision protocol as other preferences. Nonempty single-line labels
  are limited to 80 characters; unknown keys are rejected. Existing v1 settings
  resolve added defaults without rewriting the file or resetting preferences.
- Normal settings show one short **默认：…** line per field. Keys, ranges, contract
  sources and extended explanations remain in hover tooltips and diagnostic raw
  data, not inline JSON or a client-owned label map. Card field names follow the
  same descriptors, including module cards.
- Diagnostics remains default OFF and requires both Host visibility and the
  current toggle. When enabled it shows deduplicated Chinese single-sentence
  notices; transient or untranslated notices remain in the default-collapsed
  **原始数据** section together with original entries, modules, timings, revisions,
  settings sources and fixed contracts. Filtering does not discard the evidence.
- The entire **◎ BBFF面板** header and normal content-only cards are unchanged.
  Incremental reads, exposure rules and SDK runtime bytes are unchanged.

## 0.18.3 — incremental views and content-only cards

- Each session has a Root-owned folded view and atomic checkpoint. Committed live
  events advance its watermarks directly; unchanged cold sessions use cheap stat
  only. Parent catalog facts discover children; no recursive native child walk
  runs on each refresh. Restarts validate the saved anchor and fold only the tail.
- The native JSONL/zstd backend can still decode a whole file on a memo miss.
  This is an explicit, accepted backend limitation: changed cold sessions decode
  at most once per visible history-reuse interval (default15seconds), using the
  latest revision then; only the suffix is folded by Widgets. Live and unchanged
  refresh costs do not scale with the old log. No native backend patch is used.
- Normal cards show content. Unready content uses a small spinner/skeleton, not
  loading/cache/diagnostic prose. Known source badges are chosen by the Host;
  genuinely unknown skill attribution has no badge. Engineering details are
  deduplicated into ONE General Settings diagnostics panel behind the Host-owned
  `showDiagnostics` toggle, default OFF. Only an MCP completeness issue affecting
  the current list gets one ordinary line in that card.
- The entire header contribution is exactly the single **◎ BBFF面板** button,
  with no title/status siblings, including narrow layouts and every data state.
- SDK0.1.12 adds only normalized parent-catalog events; family contract runtime
  bytes remain unchanged. Public skill source/provider evidence now survives
  discovery and private-view materialization instead of receiving tool-owner rules.

## 0.18.2 — withdrawn after owner product rejection

`state` never waits for a first history fold, native projection, descendant walk,
route scan or catalog/preset lease. It returns cached Host values immediately.
Each uncomputed or refreshing part is explicitly `pending`/`running` with a
reason; the client shows **正在加载…** and that reason, not an empty/no-data claim.
Previously computed values remain visible during refresh or error, with status.
The existing shared poll picks up completed values; no second polling loop is added.

The response includes `diagnostics.parts`, `diagnostics.timings`, counts and
background-cycle completion time. Per-part `durationMs` includes dependency wait;
`workMs` and `waitMs` separate actual work from that wait. `timings` reports work
milliseconds and `total` reports the current cache-only state assembly time.
Catalog ledger/discovery costs are reported passively, never awaited by `state`.

History and collaboration use the proven0.17.2 pure baseline/read-only-handle
recipes with canonical SDK event decoders and route memoization. Full native
`readSession` replay and the rejected custom cursor fold are not on this path.
Live runtime roster/descendant values refresh using the visible poll setting;
log-derived/cold-route reuse uses `historyReuseIntervalMs` (minimum15seconds).
Public sequence/lifecycle and opaque persistence revision tokens fence caches.
`stateMaxSessions` (default64) and `stateRouteMaxEntries` (default512) are visible
independent bounds; they do not reuse unrelated exposure snapshot limits.

Native read errors remain explicit error parts with their last successful values,
not a successful empty response. Missing model evidence remains unknown: no
parent-route or legacy descriptor inference. Notes retain their separate private
API and privacy contract.

## 0.18.1 — withdrawn after cold-after-install regression

- Goal history and todo-log fallback fold only new log sequences after a public
  asynchronous baseline. UI refreshes never replay a complete native Session.
- Cold child route/roster metadata is cached by persistence instance, session id
  and opaque revision. It uses read-only handles, never prepares every child or
  hydrates all projections merely to display a route. Pending model-selection
  intent and actual request use retain native semantics; unknown routes stay unknown.
- `historyReuseIntervalMs` is visible in Widgets general settings, default/minimum
  15000 ms and maximum60000 ms. It is independent of5000 ms UI polling. Goal
  mutations invalidate the derived view immediately without losing its log cursor;
  native live goal/todo/model projections remain immediate. Title metadata uses
  the same reuse interval. The cache retains normalized DTOs only and holds live
  lifecycle identities weakly, not disposed logs.
- Registered attributed sections and cards prove the module UI is loaded. Legacy
  unattributed settings sections are explicitly identified rather than producing
  a false missing-UI warning. SDK0.1.11 adds the persisted selection-event decoder;
  family contract runtime bytes remain unchanged.

## 0.18.0 — contract-driven catalog and controls

- Root self-registers through the ordinary family contract before publishing
  `bbffFamily`; its list includes the root, with actual package metadata/apiBase.
- One cache-only catalog discovers host/current-preset/retained-parent views.
  Root alone retains failed source slices; consumers replace snapshots verbatim.
  Exact session exposure is separate from the union and never inferred from it.
- Observation history covers tools, MCP servers and skills with bounded async
  union writes, scoped lock/backoff, forget tombstone fencing, corruption evidence
  and explicit pending-durability diagnostics. It stores no executable definitions,
  ownership declarations or session identities.
- Per-Agent operational registry mutations are traced through Agent context.
  Inherited restrictions, own-layer body guards and Agent-only presentation masks
  preserve unrelated siblings/parents. MCP denial checks every attribution candidate.
- **Widgets 通用设置** shows defaults/paths for refresh, goal auto-open, note/goal
  limits, private snapshot caps, core/module card visibility/order/heights, section
  order and explicit layout reset. Settings use optimistic revisions and atomic writes.
- Goal objectives retain internal newlines; unchanged fields are not rewritten.
  Native round-cap placeholders come from verified resolved configuration or stay
  unavailable. Note input errors state actual configured limits, never silently clip.
- Resource kinds/addresses/navigation targets are computed on the Host using
  SDK0.1.10. Clients pass opaque data to public navigation APIs, without codecs.
- Source/ownership/basis, module callback failures, incomplete views and cache
  evictions are visible. MCP rows describe current tool evidence, not an assumed
  network handshake. The unused sessions/cleanup actions are removed.

The following feature history describes the original interaction design; current
0.18.2 API/settings and SDK contracts take precedence over historical defaults.

## Features

- **Goal management** over the native persisted goal (`ctx.goals`), which is the
  same state `/goal` and the goal-round driver use:
  - publish a goal (`objective` + optional round cap), edit it, pause, resume,
    complete, or clear it;
  - shows phase (`active` / `paused` / `blocked` / `complete`), rounds used vs cap,
    and whether automatic continuation is armed.
- **Status panel** — the session's right-sidebar tab: current goal, the folded **goal history** (completed objectives render struck through), and the agent todos, all in one resident column. It opens even when the session has no goal. Its eight core cards (**skills**, **tools**, **mcp**, **goal**, **history**, **team**, **subagents**, **todos**) can be dragged into any order, and family modules contribute their own cards (the memory module adds its memory/dreaming cards and settings section through the contract). Docking has no two-card limit: a row can hold **any number of cards side by side** (N−1 draggable vertical dividers), and a column can hold **any number of stacked cards** (N−1 draggable horizontal dividers), so short cards can share a column and the leftover space under a short card is reused. The arrangement is persisted per browser and survives the live data refresh (hidden cards keep their slot).
- **Collapse / expand** — click a card's title (the name itself, e.g. **历史目标**, 团队, 已暴露的 Skills, or a module card such as 记忆与指令…) or press Enter/Space on it to collapse that card: only its head (title, chevron ▸/▾, existing badges) stays visible, the body is hidden and the bottom resize strip is removed. Clicking again expands it. Collapsing changes **nothing** about the docking structure — rows, columns, widths, heights, column `maxHeight` and order are untouched; a single-card row shrinks to its head, a collapsed column in a split row shows just its head (the sibling column drives the row height, no re-docking), and inside a stack a collapsed card takes only its head height while the expanded siblings share the rest (all-collapsed stacks show just the heads). Expanding restores the previous shares and column cap exactly. Collapsed state is stored per card id and survives reorder/dock/split and conditional hide/show.
- **Family root (0.14.0)** — `oh-my-bbff-widgets` is the root of the Oh-My-BBFF family and
  implements the open contract in `oh-my-bbff-sdk/CONTRACT.md`:
  - host half provides the `bbffFamily` Cordis service; modules call
    `registerFamilyModule(ctx, descriptor)` and the widget lists them in
    `{action:'family'}` diagnostics. It validates with the vendored
    `lib/bbff-contract.js` (never throws; incompatible descriptors are reported with
    `compatible:false`);
  - client half provides the `bbffUi` Cordis service: `registerCard(def)` and
    `registerSettingsSection(def)` plus a `kit` (Row/Checkbox/Badge/Hint/Empty/Spinner/
    ErrorText, postJson/getJson, useSession, usePoll, t, theme tokens). A registered
    card renders inside the normal card chrome — collapse title, bottom resize,
    max-height, drag/dock/N-way split and layout persistence are all the root's — and
    its layout id is namespaced `moduleId/cardId`; a card may declare `legacyIds` and the
    stored bare id is migrated once, generically (no module table in the root).
    Registered settings sections render below the core settings area, ordered by `order`
    then `id`. Unloading a module removes its cards/sections while the layout slot is
    retained for the next registration.
- **Per-card max height** — every card is capped at its own max height (core defaults: skills 220, tools 220, mcp 200, goal 260, history 220, team 220, subagents 220, todos 180 px, whole card incl. head; a registered module card uses its definition `defaultHeight`, default 220). Taller content scrolls **inside the card body** with the mouse wheel while the card head stays fixed and the panel keeps its own scroll. Drag a card's **bottom edge** (the thin strip that appears on hover) to change that card's max height live (80–900 px, never taller than the panel viewport); double-click the strip resets it to the default, and ArrowUp/ArrowDown while it is focused steps it by 16 px. A **stacked column has its own overall max height** (120–900 px, also viewport-capped): drag the **bottom-most card's** strip to grow/shrink the whole stack (the row grows with it, or the stack stays shorter than its sibling column and leaves space below); double-click that strip resets the column to auto (natural content height). Other stacked cards' strips and the horizontal stack dividers adjust the **share** between neighbouring cards (double-click equalizes); ArrowUp/ArrowDown steps ±16 px in column mode and ±5% in share mode. Heights are stored per card id next to the rows in `localStorage['oh-my-bbff:status-layout:v1']` (`{version:5, rows, heights, collapsed}`; a stacked column carries its optional `maxHeight`), so reordering, docking, splitting and conditional hide/show keep each card's height, collapsed state and each column's cap. Legacy values (bare rows array, 0.7.0 `{rows,heights}`, 0.8.0 `{version:2,…}`, 0.9.0 `{version:3,…}`, 0.10.0 `{version:4,…}`) are still read and migrated on the next write.
- **Agent todos** — the agent's own `todo_write` list, read-only, with per-status
  counts. Read from the `todos` session projection for a live session and folded
  from the durable `todo/write` events for a persisted one (a new turn resets it,
  matching the tool's own semantics).
- Completed goals leave the editor automatically: a terminal (`complete`) goal is folded into the history list with its objective struck through, and the editor returns to the create form for the next goal.
- **Collaboration** — the same status panel also shows the Agent Team roster
  (name, role, live status, current-session marker) with its shared tasks
  (status, owner, expandable description) and the subagent catalog (label, mode,
  activity). Clicking a member or subagent navigates through
  `ctx.uiWorkspace.openSession` — the same call the shipped team/subagent surfaces
  use, including the `{parentSessionId, childSessionId, mode}` address for children.
  Each subagent row additionally carries the built-in **Open in sidebar** chevron:
  it opens that child chat in the right sidebar via
  `ctx.sidebarRight.openResource` and the shipped
  `dsh-resource://subagentchat/session/<child>?parent=<parent>&mode=<mode>` address.
  Data comes from the host's `agentTeams` and `subagents` services and refreshes
  every few seconds while the panel is open.
- **Human todos** — a private checklist that never enters a model request. Add,
  edit inline, toggle, delete, clear done/all, and **drag the handle to reorder**
  (order is persisted server-side, so it survives reloads and other tabs). Stored at
  `$DSH_HOME/oh-my-bbff-widgets/human-todos.json`.
- **BBFF 设置** (0.14.0) — a **global** settings panel in the same left-sidebar seat as
  笔记 (its own entry, one after it, with a gear icon). It has two parts:
  - a core **已注册模块** diagnostics block driven by `POST {action:'family'}`: every
    registered family module with its title / id / version / package, a compatible
    badge and a **UI 已加载** / **UI 未加载** state (host registered but its client half
    not loaded). The root hardcodes no module name; an unavailable API degrades to a
    retryable error;
  - every **registered settings section** contributed by family modules, ordered by
    `order` then `id`. Module-owned settings (memory defaults, routing window/budget, …)
    live in their own sections — the root hardcodes no module form.
- **Skills / Tools / MCP exposure** (0.13.0) — three cards in the status panel:
  **已暴露的 Skills**, **已暴露的 Tools** and **已连接的 MCP**.
  Each row has a checkbox, a name, and a source badge (skill source;
  **BBFF·module title**, **MCP·server**, **原生/DSH** for proven DSH tools on
  every registration plane, **其他 / other** for attributed third-party tools, or
  **未知来源 / unknown source** when the public ownership evidence is insufficient). MCP servers show connection
  state, a tool count and an expandable tool list. Module declarations, not tool-name
  prefixes, establish BBFF ownership. The card head counts enabled entries (`8/8`)
  and separately reports **本工作区不可用 N** when an exposure annotator marks
  entries unavailable. Those rows show the reason and a disabled, unchecked toggle;
  workspace unavailability does not alter stored session choices. Unchecking posts a toggle that
  disables the entry **in the current root session and its subagents** — the widget only
  renders the host report and posts the choice, the **host engine owns the actual
  per-session disable** (see Host API). Checkboxes update optimistically, adopt the
  refreshed report on success, and revert with the API error on failure; a host without
  the exposure action degrades to 「暴露信息不可用」 and an empty list renders
  「没有已暴露的 Skills」 / 「没有已暴露的 Tools」 / 「没有已连接的 MCP」.

## Use

The left sidebar carries the two **global** seats: **笔记** (your private notes) and
**BBFF 设置** (family modules and diagnostics), each with its own icon. The per-session **status
panel** opens as a right-sidebar tab — click the **◎ BBFF面板** chip in the session
header, or pick a session in the top-right selector. The panel refreshes every 5 seconds.

Goal mutations need a **live** session: a session with no running agent is shown
read-only with a hint to open it first.

## Host API

`POST /oh-my-bbff-widgets/v6/api`

| action | body | result |
|---|---|---|
| `state` | `sessionId` | goal view, agent todos, human todos, session header |
| `goal` | `sessionId`, `op` = create/edit/pause/resume/complete/clear, `objective?`, `maxGoalRounds?` | the refreshed state |
| `human` | `op` = add/toggle/update/remove/reorder/clearDone/clearAll, `id?`, `text?`, `done?`, `ids?` | refreshed human todos (reorder persists the given id order) |
| `exposure` (0.13.0) | `sessionId` | `{ok:true, exposure:{sessionId, rootSessionId, skills:[{name,description,source,enabled}], tools:[{name,description,enabled,source:'bbff'|'mcp'|'dsh'|'other',module?,moduleTitle?,mcpServer?,available?,reason?,by?}], mcp:[{server,connected,toolCount,enabled,tools,available?,reason?,by?}], counts}}` (including `skillsUnavailable`, `toolsUnavailable`, `mcpUnavailable`) for the root session |
| `exposure-toggle` (0.13.0) | `sessionId`, `kind` = skill/tool/mcp, `name`, `enabled` | the refreshed exposure report (400 on an unknown kind/name) |
| `family` (0.14.0) | — | `{ok:true, contract:1, root:{packageName, version}, modules:[{id, title, description, version, packageName, apiBase?, ui?, compatible}]}` — the registered family modules (diagnostics; never throws) |

| `settings` | — | current settings, shipped defaults, limits/card metadata, revision, diagnostics |
| `settings-update` | `revision`, `patch` | atomically validated settings; stale revision409, invalid400, storage500 |
| `settings-reset` | `revision` | restore Root preferences only; preserve note/exposure/history files |
| `catalog` | `cwd?` | immutable shared catalog; first project query is pending/incomplete, never a full-union preview fallback |
| `catalog-forget` | `kind`, `name` | guarded durable historical forget, with explicit protection/error code |
| `resource-address` | `resource` | adapter result with computed address/kind/target/openability and diagnostics |

The family response includes `root.id`/`root.apiBase`, root self-registration,
per-descriptor errors/warnings and detailed callback diagnostics. `state` includes
session cwd, the same settings payload, and native goal-default evidence. Cold
own-layer tool rows retain private snapshot origin/time while current ownership
and other permission-layer annotations remain authoritative.

## Design notes

- Goal mutations always read the current `{id, revision}` from the service right
  before mutating, so a stale panel can never silently overwrite a newer revision;
  the service still rejects a genuinely stale `GoalRef`.
- The agent todo list is deliberately read-only: it belongs to the model, and a
  human edit would be overwritten on its next whole-list replacement.
- Human todos are stored outside the session log, so they survive session
  deletion and never reach a prompt.

## Tool inventory accuracy and provenance (0.17.0)

- **实时 / Live:** use `tools.schemas(the exact live root Agent)`, the same public
  operation as Cordis `Tool.listTools`. The enabled-name set equals that view,
  excluding reserved `run_code`. Global/disabled/unavailable entries remain visible
  but are never silently counted as enabled when absent from the live view.
- **上次加载快照 @time / Last live snapshot:** an unloaded session reads its current
  `agentPreset` projection through `sessionQuery.observeSession`, pins the standing
  generation with `agentPresets.acquireScope`, reads `tools.schemas(lease.key)` and
  disposes both observation and lease. This creates no Agent and sends no messages.
  Global + preset schemas are merged with missing per-agent tools from the root's
  last live snapshot. Snapshot rows carry `inventoryOrigin:'snapshot'` and
  `lastLiveAt`. If no snapshot exists, the card says preset reconstruction; if
  neither scope nor snapshot exists, it explicitly says **仅全局层 / Global layer only**.
- Snapshots are atomically saved under `$DSH_HOME/oh-my-bbff-widgets/exposure-snapshots.json`.
  They survive process restarts, are bounded to 64 roots / 512 tools per root /
  4 MiB total, and never persist executable tool definitions or parameters. Lifecycle
  sweeps capture live roots even when the panel is closed. Cold reads do not load,
  resume, wake or message any session. `POST {action:'exposure',sessionId,view:'cold'}`
  forces that read-only path for exact-set comparison without unloading the Agent.
- **Ownership uses public runtime evidence, not prefixes or registration hooks.**
  Walk `ctx.registry.values()` and each runtime's fibers, recursively inspect public
  `fiber.getEffects()` labels, and resolve the nearest `fiber.entry` using
  `pluginPackages.packageOf(entry.options.name, baseUrl)`. Preset-tree fibers are
  included: `loader.entries()` alone misses them. `tools.register()` labels contain
  no tool name, so package counts are not claimed to be per-name ownership.
  BBFF names come from descriptor declarations (including the root's own frozen
  `root.tools`, so `read_user_notes` is BBFF·Oh-My-BBFF Widgets); MCP follows its
  server naming contract. Only when every remaining registering package is DSH
  or a declared BBFF module, with zero unattributed/third-party registrations, is
  the residue provably DSH. Otherwise residue is labelled **unknown**, not guessed
  native or other. Inventory includes the public audit in `exposure.provenance`.
- Bundles installed alongside the family (usage/cost panels, turn guards, web
  inspectors, mobile gateways) provide routes/UI/session plumbing, not model
  tools; MCP wrapper bundles use DSH's MCP client. Their absence of tool-registration effects is
  checked at runtime rather than treated as a permanent allowlist. A future
  third-party registration invalidates residue inference until attributable.
- v1.4 **session exposure contributors** describe private tools and optional
  exclusive surfaces; the root lists unavailable remainder with the module's
  reason, refuses their toggles, and defaults contributed controls to read-only.
  Both annotators and contributors can supply `reasonLocales`; the client selects
  its locale key and falls back to `reason`, without module-specific root strings.

## Changelog

### 0.17.2

- Vendor SDK 0.1.6's additive v1.5 `descriptor.exclusiveTools` declaration:
  exact module-owned session tools are outside workspace-scope governance.
- The family registry validates, copies and deeply freezes the declaration,
  returning it through `list()` and family diagnostics without interpreting it.
  Invalid optional fields are dropped independently, with immutable per-entry
  warnings; valid ownership and module compatibility remain intact.

### 0.17.1

- Exposure inventory now refreshes on the panel's existing five-second tick,
  without reopening the card. Snapshot/live mode transitions and newly registered
  tools become visible; refresh preserves ready content and avoids active toggles.

### 0.17.0

- Repair cold/restart tool inventories using standing preset generation leases and
  bounded atomic last-live snapshots; expose the mode and snapshot provenance.
- Correct host-plane/per-agent DSH classification with the public package-effect
  audit; declare the root notes tool and label true uncertainty honestly.
- Implement additive v1.4 session contributors, exclusive surfaces, read-only
  controls and localized reasons. SDK 0.1.5 runtime remains byte-identically vendored.

### 0.16.1

- Live tools-card verification found source badges could shrink and wrap under
  long tool descriptions. Source badges now stay on one line with a 50% width
  cap, ellipsis and a full-text tooltip.

### 0.16.0

- Tool source badges use declared family ownership (**BBFF·module title**), MCP
  server identity (**MCP·server**), agent-preset-only identity (**DSH**), or
  **other** for global tools whose registering package is not publicly recorded.
  No DSH runtime hooks or tool-name-prefix ownership guesses are used.
- Contract v1.3 (additive, `contract:1`): validated/frozen `descriptor.tools`,
  `registerExposureAnnotator(moduleId, fn)` and `annotateExposure(input)`. Modules
  may annotate unavailable workspace tools, MCP servers and skills; calls have
  isolated 500 ms deadlines and deterministic first-registered merge semantics.
- Exposure cards show unavailable reasons, disable affected checkboxes, and count
  unavailable entries separately. MCP unavailability propagates to server tools;
  a rejected unavailable toggle does not modify stored session preferences.
- SDK 0.1.3 runtime is vendored byte-identically. Family, inventory and client
  tests cover invalid declarations, timeout/error containment, all four source
  classes, both locales, and unavailable rows/counts.

### 0.14.0

- **Family root services + generic hosts (P1)** — `oh-my-bbff-widgets` now implements
  the open Oh-My-BBFF family contract (vendored runtime `lib/bbff-contract.js`,
  byte-identical to `oh-my-bbff-sdk/contract.js`):
  - host: new `lib/family.js` registry (validate with the vendored validator,
    duplicate/invalid/contract-mismatch recorded as `compatible:false`, frozen
    snapshots, change subscriptions, disposers) provided as the `bbffFamily` service;
    new `POST {action:'family'}` diagnostics action returning
    `{ok, contract, root, modules}`;
  - client: new `bbffUi` service (`contract:1`, `registerCard`,
    `registerSettingsSection`, `kit`) provided by the client plugin; the status panel
    merges registered cards into the existing layout model (core cards, then
    registered by `order`/`id`), with the root owning chrome, collapse, per-card and
    column sizing, drag/dock/N-way split and persistence; registered card ids are
    namespaced `moduleId/cardId` and a card's declared `legacyIds` are migrated once
    from the stored layout (generic, no module table); the settings panel renders core
    settings plus registered sections in order;
  - `kit` primitives (`Row`, `Checkbox`, `Badge`, `Hint`, `Empty`, `Spinner`,
    `ErrorText`, `postJson`, `getJson`, `useSession`, `usePoll`, `t`, theme `tokens`)
    let module components render without importing root internals;
  - `kit` primitives (`Button`, `Input`, `Row`, `Checkbox`, `Badge`, `Hint`, `Empty`,
    `Spinner`, `ErrorText`, `postJson`, `getJson`, `useSession`, `usePoll`,
    `openSession`, `openFile`, `locale`, `t`, theme `tokens`) let module components
    render and navigate without importing root internals;
  - module unload/HMR removes its cards and settings section and retains the layout
    slot for re-registration;
  - **P3 (same release)** — the root no longer hardcodes any module UI: the memory and
    dreaming cards, the memory settings form and the memory API helpers are gone. The
    panel renders the **eight core cards + every registered card**, and the settings
    seat renders the **modules diagnostics block + every registered settings section**;
    the memory module (0.6.0 client half) contributes its cards and settings section
    through `bbffFamily`/`bbffUi`, with `legacyIds` migrating existing layouts
    (`memory` → `memory/memory`, `dreaming` → `memory/dreaming`).
- Contract tests: new `.tmp-llm-test/test-bbff-family.mjs` covers the vendored-runtime
  byte identity, registry semantics, `family` action payload, `bbffUi` provision/kit,
  fake-module card + section rendering and ordering, namespacing, `legacyIds`
  migration, unload/re-registration and slot retention. Existing widget suites stay
  green.
### 0.13.0

- **Three exposure cards in the status panel** — **已暴露的 Skills**, **已暴露的 Tools**
  and **已连接的 MCP**. They join the card framework as ids `skills` / `tools` / `mcp`
  after memory/dreaming, so the panel now has **ten** cards
  (`STATUS_CARD_IDS = memory, dreaming, skills, tools, mcp, goal, history, team,
  subagents, todos`); a saved layout from an older version simply appends the three new
  ids at the end and keeps every stored row/width/share/height/collapse entry. Default
  max heights: skills 220, tools 220, mcp 200 px.
  - **Skills** card: one checkbox row per visible skill with name, description as
    secondary text/tooltip, its source, and an enabled/total badge (`8/8`).
  - **Tools** card: one checkbox row per callable tool; the source badge reads 原生 or
    **MCP · server** for `mcp__<server>__<tool>` tools.
  - **MCP** card: one checkbox row per MCP server (unchecking disables all of that
    server's tools for the session) with a connected dot + 已连接/未连接, its tool count
    (`2 工具`), and an expandable list of its tools.
  - The toggles are **per session**: they disable the entry for the current root session
    **and its subagents**. The widget only renders the host report and posts the choice —
    the **host engine owns the actual disable** (tools via the agent tool restrict,
    skills via a hiding provider; see the Host API section). Unchecking is optimistic,
    adopts the refreshed report on success, and reverts with the error text on failure.
    A host route without the exposure action renders 「暴露信息不可用」; an empty list
    renders 「没有已暴露的 Skills」 / 「没有已暴露的 Tools」 / 「没有已连接的 MCP」;
    「勾选仅影响当前会话及其 subagent」 states the scope. zh/en labels; theme tokens only.
- **Host API** — two new actions on `POST /oh-my-bbff-widgets/v6/api`:
  `{action:'exposure', sessionId}` returns
  `{ok:true, exposure:{sessionId, rootSessionId, skills:[{name,description,source,enabled}],
  tools:[{name,description,enabled,source:'native'|'mcp',mcpServer?}],
  mcp:[{server,connected,toolCount,enabled,tools:[...]}], counts}}` for that session's
  root, and `{action:'exposure-toggle', sessionId, kind:'skill'|'tool'|'mcp', name,
  enabled}` validates the name against the current inventory, persists the disabled set
  under `$DSH_HOME/oh-my-bbff-widgets/exposure.json`, applies it live, and returns the
  refreshed report. The host half of this release is `index.js` (route wiring) plus
  `lib/exposure-store.js` / `lib/exposure.js` / `lib/root-session.js` (store, catalog and
  live enforcement: tools restricted through the agent tool registry, skills hidden
  through a per-agent hiding provider); the widget itself implements no enforcement.
- **Tests** — `test-bbff-client.mjs` grew to 156 assertions (stubbed `exposure` render of
  all three lists, checkbox states, source/connection badges, the MCP tool expander, the
  exact `exposure-toggle` POST bodies for kind skill/tool/mcp, adopted refresh, revert +
  error on failure, and the `暴露信息不可用` fallback) and its card count/title
  assertions now expect ten cards. `test-bbff-status-layout.mjs` (234 assertions) was
  rebased onto the ten-card default order — docked/detached/moved rows are located by
  card id instead of hardcoded row indices — and still covers N-way docking, stacks,
  column caps, collapse and hidden-card retention. `test-bbff-installed-bundle.mjs`
  carries the 0.13.0 version/marker readback for the packed install.

### 0.12.0

- **Global BBFF settings panel** — a new **global** seat in the left sidebar, right after
  笔记 (`sidebar.panellist` id `oh-my-bbff-settings`, order 31, gear icon; the body is
  registered on the `main` pane under the same key). It is not per session: it edits the
  **memory plugin's defaults** for every session. Controls: **默认记忆模式**
  (全量常驻 `full` / 路由检索 `routed`), **路由窗口** (1–20, default 3 recent user turns),
  and **路由预算** (top-K 1–10, default 2 files; per-turn ceiling 16–512 KB shown in KB,
  default 120 KB). Values load from `GET /oh-my-bbff-memory/api?settings=1` and save with
  `POST {action:'memory-settings', settings:{defaultMode,routeWindowTurns,routeTopK,routeMaxBytes}}`.
  The save button stays disabled until something changes, shows 「已保存」 on success and
  the API's error (draft kept, retryable) on failure. Every numeric field is clamped to
  the range the memory route validates: an out-of-range entry is flagged
  (`data-invalid="true"`) and a warning names the values that will actually be saved, so
  the form never posts a number the API would reject. A missing/dead route degrades to
  「memory 插件不可用」 with a retry button; an `ok:false` reply shows its reason and no
  editing form. Theme tokens only; zh/en labels.
- **Memory-mode switch on the 记忆与指令 card** — the card now opens with a two-way
  switch reflecting the session's **effective** mode from `inventory.mode`
  (全量常驻 / 路由检索), plus the `modeSource` as a small badge (默认 / 会话覆盖). Toggling
  posts `{action:'memory-mode', sessionId, mode}` for the current root session:
  optimistic update, adoption of the returned inventory on success, revert + the API
  error (or 「切换失败」) on failure. A hint states that the switch affects the current
  root session and its subagents and that the global default lives in **BBFF 设置**;
  while routed, a compact **路由检索** badge on the card head and a hint that memory files
  are routed by the global settings. The widget implements no routing logic — it only
  renders the mode and posts the choice. An inventory without `mode` (memory plugin
  < 0.5.0) renders exactly the 0.11.0 card, and an unavailable memory API still shows
  「memory 插件不可用」.
- Tests: new `test-bbff-memory-settings.mjs` (71 assertions) covers the seat
  registration (same slot as 笔记, order, label, icon), the defaults loaded from a
  stubbed `?settings=1`, the exact `memory-settings` POST body, clamp/out-of-range
  display and clamped save, the unavailable + `ok:false` fallbacks, the retry, a refused
  save keeping its draft, the mode switch (active state, hint, `modeSource` badge, exact
  `memory-mode` POST body, adopted inventory, routed badge/hint), a refused switch
  reverting, and the no-`mode` degradation. All 378 client assertions from 0.11.0 still
  pass, and the suite now runs against the installed bundle via `BBFF_CLIENT_PATH`.

### 0.11.0

- **Per-card collapse/expand** — every card title (e.g. **BBFF Dreaming**, 记忆与指令,
  历史目标, 团队, 子代理, 模型待办, 目标) is now a button-like control (`role="button"`,
  `tabIndex=0`, Enter/Space toggles, `aria-expanded`, cursor pointer, `title` hint) with
  a ▸/▾ chevron. Clicking it collapses that card to its head only — body hidden, bottom
  resize strip removed, no internal scroll — and clicking again expands it. Only the
  title/chevron toggles; badges, rows, body content, the ⋮⋮ drag handle and the resize
  strip are unaffected.
- **Layout is untouched by collapsing** — rows, columns, widths, heights, column
  `maxHeight` and order all stay identical. A single-card row shrinks to head height; a
  collapsed column in a horizontal split shows just its head and the sibling column
  drives the row height (no re-docking); in a vertical stack the collapsed card takes
  head height only and the expanded siblings split the remaining space by their
  renormalized shares (all-collapsed stacks show just the heads). Expanding restores
  the stored shares and column cap exactly.
- **Persistence v5** — same key `oh-my-bbff:status-layout:v1`, now
  `{ version:5, rows:[…], heights:{cardId:px}, collapsed:{cardId:true} }`. Only `true`
  entries are stored (missing = expanded), unknown ids are dropped, and v1/v2/v3/v4
  documents are accepted and silently migrated (a missing collapsed map means all
  expanded); the next write emits v5. Hidden cards (team/subagents) keep their collapsed
  state and return collapsed.
- Tests: `test-bbff-status-layout.mjs` covers the collapsed map normalization and
  persistence, v4→v5 migration, title click/keyboard toggles, body-hidden/resize-strip
  markers, layout-structure invariance, stacked collapse (head-only slot, sibling
  expansion, renormalized shares, all-collapsed heads, expand restores shares + cap),
  collapse survival through reorder and hidden-card retention. `test-bbff-client.mjs`
  checks all seven titles are button-like toggles with `aria-expanded`, the chevron, and
  clicking BBFF Dreaming collapses/expands with the v5 document. 378 assertions pass in
  total.

### 0.10.0

- **Stacked column overall max height** — a stacked column can now be resized as a
  whole, not just split between its cards. Drag the **bottom-most card's** bottom resize
  strip to change the column's total max height (120–900 px, never above the panel
  viewport); the rendered stack height follows it — larger than the row makes the row
  grow, smaller leaves the stack shorter than its sibling column with intentional empty
  space below. Double-click that strip resets the column to **auto** (natural content
  height). The other stacked cards' bottom strips keep the **share** mode (the boundary
  to the next card), the horizontal stack dividers keep adjusting the adjacent share
  pair, and double-click on a non-bottom strip still equalizes the shares. Keyboard:
  ArrowUp/Down steps ±16 px in column mode, ±5% in share mode. Each stacked card still
  fills its share and scrolls internally.
- **Persistence v4** — same key `oh-my-bbff:status-layout:v1`, now
  `{ version:4, rows:[{ columns:[{ cards:[…], heights?:[…], maxHeight?:number }], widths?:[…] }], heights:{…} }`.
  `maxHeight` is optional per column, clamped 120–900 on read (invalid values dropped),
  persists with the column object across reorder/dock/split and hidden-card retention;
  a column that collapses to a single card renders with that card's own height cap and
  reuses its stored `maxHeight` if it becomes a stack again. All older documents (v1
  bare rows / `{rows,heights}`, v2, v3) are accepted and silently migrated; the next
  write emits v4. `BBFF Dreaming` title unchanged.
- Tests: `test-bbff-status-layout.mjs` covers column `maxHeight` normalization/clamps,
  set/clear, survival through detach/re-dock/reorder, v3→v4 migration, serialize/parse
  round-trip, bottom-strip column mode (changes only the cap, never shares), clamps
  120/900, keyboard ±16 px, double-click reset-to-auto vs equalize, render cap markers,
  cap above natural (row grows) and below a sibling column (stack stays short), and
  hidden-card retention with the cap. `test-bbff-client.mjs` checks the capped stack
  render and the column-mode strip. 321 assertions pass in total.

### 0.9.0

- **Unlimited docking (no more 2-card limit)** — the layout model is now fully N-way:
  a row holds **N columns** side by side with a normalized `widths` share array (sum 1,
  minimum share 6%) and N−1 draggable vertical dividers; a column holds **N stacked
  cards** with a normalized `heights` array and N−1 draggable horizontal dividers. Each
  divider moves only its adjacent pair of shares. `dock-left/right` inserts the dragged
  card as a new column before/after the target's column; `dock-top/bottom` inserts it as
  a new stacked card before/after the target card (any count, nothing is displaced);
  row-edge drops still reorder; dragging a card out removes it and collapses an emptied
  column/row, renormalizing the surviving shares.
- **Stacked cards get their max-length interaction back** — 0.8.0 hid the bottom resize
  strip on stacked cards; 0.9.0 shows it again. Dragging it adjusts **that card's share**
  inside the stack (it moves the boundary below, or the boundary above for the bottom-most
  card, so every card can grow and shrink); the horizontal stack divider remains for the
  same boundary from the other side. Double-click equalizes the stack, ArrowUp/Down steps
  the focused card's share by 5%. Stacked cards still fill their slot and their bodies
  scroll internally when content overflows; single cards keep the px-based 80–900 cap.
- **Persistence v3** — same key `oh-my-bbff:status-layout:v1`, now
  `{ version:3, rows:[{ columns:[{ cards:[id,…], heights?:[…] }], widths?:[…] }], heights:{cardId:px} }`.
  Legacy v1 (bare rows / `{rows,heights}`) and 0.8.0 v2 (`{columns,ratio}`) documents are
  accepted and silently migrated: v2 `row.ratio → widths [r,1−r]`, `column.ratio →
  heights [r,1−r]`, v1 rows become one column per card. Unknown ids dropped, duplicates
  deduped, shares clamped to the 6% floor and renormalized, invalid heights defaulted;
  the next write stores v3. The `BBFF Dreaming` card title is unchanged.
- Tests: `test-bbff-status-layout.mjs` covers the N-way model (share normalization,
  adjacent-pair resize, insert/remove shares, 3/4/5-column docking, 2/3/4-card stacks,
  detach/collapse, v1/v2→v3 migration), rendering of 3/4 columns with 2/3 dividers and
  3-card stacks with 2 horizontal dividers, divider drag persistence, stacked-card bottom
  strip (top and bottom card cases, share persistence, keyboard, double-click equalize),
  single-card px resize/clamps/reset, drag-out collapse, hidden retention and heights.
  `test-bbff-client.mjs` checks N-way render, stacked resize strips and scroll CSS.
  278 assertions pass in total.

### 0.8.0

- **Vertical docking (上下停靠)** — the layout model is now two-level: a **row** holds 1–2
  **columns** side by side (existing horizontal split + ratio), and a **column** holds 1–2
  **cards stacked vertically** (new). Drop a card on the **top/bottom quarter** of another
  card to stack it above/below that card in the same column; the stacked column fills the
  row height, each card takes its share by the column's **vertical ratio** (default 0.5,
  drag the horizontal divider or ArrowUp/ArrowDown to change it, persisted) and scrolls
  internally. This reuses the space left under a short card (e.g. drop a card below
  **BBFF Dreaming**). The middle band of a card still docks left/right, the outer 10%
  still reorders rows, and dragging a card out of a stack restores it as a normal
  single-card row. In a stacked column the bottom-edge resize strip is hidden (the
  vertical divider owns the allocation); single cards keep the 0.7.0 resize + max height.
- **Persistence v2** — the same key `oh-my-bbff:status-layout:v1` now stores
  `{ version:2, rows:[{ columns:[{ cards:[id]|[id,id], ratio? }], ratio? }], heights:{…} }`.
  Legacy values are accepted and silently migrated: a bare rows array (v1) and the
  0.7.0 `{rows, heights}` object become one column per card (row ratio preserved,
  heights preserved); unknown ids dropped, duplicates deduped, ratios clamped, invalid
  heights defaulted. The next write stores v2.
- **Rename** — the dreaming card title is now **BBFF Dreaming** (zh + en DICT); the
  resident session title `BBFF Dreaming Resident 🌙` is unchanged.
- Tests: `test-bbff-status-layout.mjs` covers the v2 model (normalize/migrate, locate,
  detach, move, horizontal + vertical dock with displacement, undock, both ratios),
  v1→v2 migration for both legacy shapes, per-card heights, horizontal dock + divider,
  vertical dock + stack divider drag/keyboard, drag-out of a stack, hidden-card
  retention inside a stack, and height survival across reorders. `test-bbff-client.mjs`
  checks the `BBFF Dreaming` title and a stacked render (one stack divider, stacked cards
  marked and strip-free). 240 assertions pass in total.

### 0.7.0

- **Per-card max height + internal scrolling** — every status card is capped at its own
  max height (whole card incl. head): memory 320, dreaming 220, goal 260, history 220,
  team 220, subagents 220, todos 180 px. `.gb-card` is a flex column with
  `max-height: var(--gb-card-max)`; `.gb-card-body` gets `overflow-y:auto` and
  `overscroll-behavior:contain`, so tall content scrolls inside the card and the panel's
  own scroll is untouched.
- **Bottom-edge resize** — a thin strip along the card's bottom edge (cursor `ns-resize`,
  `aria-label`「调整卡片高度」, visible on hover/focus, `touch-action:none`) drags that
  card's max height live; clamped to 80–900 px and never above the panel viewport.
  Persisted on pointerup/cancel. Double-click resets the card to its default height;
  ArrowUp/ArrowDown while focused steps 16 px. It is a separate handle from the top-right
  ⋮⋮ drag handle and the split divider, so card reordering/docking is unaffected.
- **Persistence** — the same key `oh-my-bbff:status-layout:v1` now stores
  `{ rows:[…], heights:{ cardId: px } }`. A legacy bare rows array is still accepted
  (heights default) and is silently migrated to the object shape on the next write;
  unknown/invalid heights are dropped/clamped. Heights are keyed by card id, so
  reordering, docking, splitting, and hiding/showing the conditional cards keep every
  card's height.
- Tests: `test-bbff-status-layout.mjs` covers default heights, resize drag (only the
  dragged card changes, live update, persist on pointerup), 80/900 and viewport clamps,
  double-click reset, keyboard steps, legacy-array migration, and height retention across
  reorder/dock/split/hide; `test-bbff-client.mjs` checks the per-card CSS var, resize
  strips, and the scroll CSS. 239 assertions pass in total.

### 0.6.0

- Panel header: removed the goal subtitle line (`.gb-sub`) entirely. The header now
  shows only the panel title for every state — an active goal's `进行中 · 1/256`,
  「当前没有活跃目标。」, and 「这个会话还没有目标。」 no longer appear there; goal
  information lives in the goal card.
- Two new cards in the status panel (5 → **7** cards: `memory`, `dreaming`, `goal`,
  `history`, `team`, `subagents`, `todos`; default order memory, dreaming, then the
  original five). Dragging, docking, split rows, hidden-card retention and the
  `oh-my-bbff:status-layout:v1` persistence are unchanged; a stored 5-card layout is
  repaired by appending the two new cards.
  - **记忆与指令** — reads the memory plugin's widget inventory
    (`GET /oh-my-bbff-memory/api?inventory=1&sessionId=…`): one row per instruction file
    (global `AGENTS.md`, workspace `AGENTS.local.md`) with a 已加载/未找到 badge, and one
    row per global/workspace memory file with a checkbox, byte size, and scope badge.
    Checkboxes default to checked and toggle activation **for the current root session
    and its subagents** via `POST /oh-my-bbff-memory/api`
    `{action:'memory-toggle', sessionId, key, enabled}` (optimistic UI; a refused toggle
    reverts and shows the API error). Clicking any row/name opens that file in the
    right sidebar through the **built-in document preview**
    (`sidebarRight.openResource('dsh-resource://file/session/<sid>/<path>', {kind:'text', preferNewPane:true})`),
    including global memory files outside the workspace. Older/unavailable memory
    plugins render 「memory 插件不可用」 instead of crashing.
  - **Dreaming** — polls `GET /oh-my-bbff-memory/api?dream=status` every 30 s while the
    panel is mounted (timer cleared on unmount): green dot + 「正在 dream」 when
    `dream.activeRun` is non-null, gray dot + 「睡眠中」 otherwise, with the next-wake
    time and a live countdown, last wake time, wake count, the resident title
    `BBFF Dreaming Resident 🌙`, and an open button for `residentSessionId` (navigates
    via `uiWorkspace.openSession`; the id is shown as text when no session exists yet).
    Unavailable API renders 「Dreaming 不可用」.
- Tests: `test-bbff-client.mjs` now renders the panel against a stubbed fetch (inventory
  render, preview address + options, toggle POST body, optimistic success/revert,
  dreaming green/gray, unavailable fallback, poll-timer cleanup);
  `test-bbff-status-layout.mjs` covers 7 cards, the header with no subtitle for all
  states, and drag/dock/persistence on the new card set. Verified end-to-end against
  the live `oh-my-bbff-memory` 0.4.0 API.

### 0.5.7

- Header chip: removed the trailing phase/rounds segment (`已完成 1/256`, `进行中 3/256`, …)
  for **every** phase. The chip now renders `◎ BBFF面板` only — no trailing span, no
  leftover separator. That counter belonged to the goal-only era; the panel itself now
  carries the goal card, history, team, and subagents. Chip click / auto-open
  (`oh-my-bbff:goal-tab-auto:<sessionId>`) and its `data-phase` styling are unchanged.

### 0.5.6

- Renamed the panel's visible labels (no behaviour change):
  - the session header chip now reads **「◎ BBFF面板」** (was 「◎ 状态」); the phase and
    round counter next to it are unchanged;
  - the right-sidebar **tab title** and the panel's `<h2>` heading now read
    **「Oh-My-BBFF 状态面板」** (both were 「状态」).
  - English locale: chip 「◎ BBFF panel」, tab / heading 「Oh-My-BBFF status panel」.
- Unchanged on purpose: the `oh-my-bbff:goal-tab-auto:<sessionId>` and
  `oh-my-bbff:status-layout:v1` localStorage keys, the `bbff-goal` tab kind and
  `oh-my-bbff-widgets/goal` type id, drag/dock behaviour, and the subagent/team
  buttons.

### 0.5.5

- Status panel: corrected the duplicate-hint placement. **「最近目标已完成」 now lives inside the
  goal card** (the card that shows the new-goal form); the panel header no longer repeats it and
  shows 「当前没有活跃目标。」 instead. (0.5.4 had removed the card copy and kept the header copy —
  that direction was backwards.)
- New Host tool `read_user_notes`: reads the user's global 笔记 (the widget's human notes store) and
  returns the notes with text / done / timestamps. The description instructs the model to call it
  **only when the user explicitly asks** to read their notes; it is never called proactively. Supports
  `includeDone: false`.

### 0.5.4

- Status panel: removed the duplicate **「最近目标已完成」** line (placement corrected in 0.5.5).
- Status panel: the five cards are now arrangeable. Every card carries a `⋮⋮` drag
  handle (visible on hover / focus-visible, `aria-label` "拖动卡片"):
  - dropping on the top/bottom 20% of a card inserts the dragged card before/after
    that row;
  - dropping on the middle-left/right half docks it beside that card as a split row
    (`ratio` 0.5), so any two cards share one row;
  - dropping on an occupied slot of an existing split row pops the displaced card
    out into a full-width row right below it (no card is ever lost);
  - dragging a card out of a split row collapses the remaining card back to a
    full-width row.
  The 6px vertical divider between docked cards is `cursor: col-resize`; dragging it
  updates `ratio` live and persists on pointer-up, clamped to 0.25–0.75
  (ArrowLeft/ArrowRight also nudge a focused divider). Drop previews use only
  `--dsw-alias-*` tokens: a dashed accent border plus 「停靠左侧」/「停靠右侧」 for
  docking, a horizontal accent line plus 「拖到这里」 for insertion.
- Layout is global and stored at
  `localStorage['oh-my-bbff:status-layout:v1']`. Reads are repaired: unknown ids
  dropped, repeated ids deduped, missing ids appended as single rows, `ratio`
  clamped, invalid structure reset to the default order; writes are `try/catch`
  wrapped so an unavailable storage never breaks the panel. The 5-second data
  refresh does not touch the layout — a card whose data is temporarily absent
  (team null, empty subagents) keeps its record and returns to the same slot.
- Tests: new `test-bbff-status-layout.mjs` covers the pure row model
  (default/move/dock/undock/ratio/serialize), localStorage round-trip and repair,
  the single 「最近目标已完成」 render, handle presence, a synthetic pointer
  drag that produces a `.gb-split` row with divider, dragging back out to single
  rows, and divider ratio clamping + persistence. No browser was available, so the
  interaction is exercised on the real component through a React stub with
  synthetic `getBoundingClientRect` values.

### 0.5.3

- Status panel: **team roster** rows now carry the same **Open in sidebar** arrow as the
  subagent rows. A teammate is addressable as a continuable child of the team lead, so the
  button opens `dsh-resource://subagentchat/session/<memberId>?parent=<leadId>&mode=continuable`.
  The lead's own row and the current session's row do not render it, and failed / provisioning
  members are skipped. The member chip itself still navigates the main area
  (`uiWorkspace.openSession`), now as `div role="button"` so the inner arrow button is valid
  markup.

### 0.5.2

- Status panel: every subagent row now has the built-in **Open in sidebar** arrow on
  its right (`title` / `aria-label` "Open in sidebar", 14px chevron, tertiary label
  colour with the hover background token from the shipped theme). Clicking it calls
  `ctx.sidebarRight.openResource('dsh-resource://subagentchat/session/…', { kind: 'subagentchat', preferNewPane: true })`
  with `parent`, `child`, and `mode` — the same address and placement the shipped
  subagent catalog uses — and stops propagation so the row keeps its existing
  `uiWorkspace.openSession` navigation. Rows without a child or parent id, and
  external tasks that have no session, do not render the button.
