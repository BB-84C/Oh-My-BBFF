# Changelog — Oh-My-BBFF Memory

## 1.0.4 — Dreaming rotation and the family session-read budget

- **Dreaming Resident rotation no longer deadlocks.** When the resident approaches the context window limit it rotates onto a fresh session, leaves a short handoff note, keeps the retired session on disk and re-delivers the wake that was deferred for the rotation. The resident can also rotate on demand from the Dreaming card.
- **Session-read budget.** A session log larger than 30 MB that has not been written for 7 days is skipped instead of decompressed when the resident reviews sessions, so a long history no longer makes the machine work through tens of megabytes at every wake. Both thresholds are settings in the BBFF settings page.

## 1.0.0 — first public release

- First public release of Oh-My-BBFF Memory. Family-wide version reset to 1.0.0. Includes the 0.9.2 semantic preset-budget drift comparison and the vendored js-yaml parser described below.
- Requires DeepSeek Harness 0.2.2 or newer.
- The user-facing README was rewritten. The development log below is preserved unchanged.
- Documentation correction that supersedes the historical wording below: compatibility directories are read-only. Archiving writes a shadow marker in the canonical workspace directory and never edits the legacy file.
- `CHANGELOG.md` is new. The former README is this history, moved verbatim.

# Oh-My-BBFF Memory

Markdown memory, deterministic recall and one scheduled Dreaming Resident for DeepSeek Harness.
The package registers its own cards/settings through the public Oh-My-BBFF SDK; the widgets root owns the shared UI shell, root identity and capability catalog.

## 0.9.2 — preset-budget drift is semantic

After a successful managed preset-budget apply, DSH re-serializes the profile patch: long
YAML scalars are re-wrapped and DSH appends its own patch entries (for example the `locale`
preference). Memory compared the managed block as *text*, so it reported "Installed DSH
presets changed: regenerate the budget copy" although nothing had changed.

- Drift is now decided on the **parsed preset values**, with the same parser and dialect DSH
  reads and writes the file with (`js-yaml` + the `!!js` scalar type, vendored under
  `lib/vendor/js-yaml/`). Folding, reflow, quoting style and comments cannot matter; a real
  content change in an installed preset still reports drift.
- Patch entries the projection does not own are never drift. If DSH appends one inside the
  managed markers it is preserved — moved below the block — instead of being counted as
  drift or deleted by the next apply.
- `maxBytes` remains the one value preview/apply may change, so a new cap is a requested
  change, not drift.

## 0.9.1 — fresh-install first run

Two first-run defects from the clean-room install are fixed; storage, injection, tools and the
Resident's review behaviour are unchanged.

- **Dreaming wakes on a fresh install.** Native `schedule` is now adopted as an *optional* Cordis
  dependency instead of being read opportunistically: Memory never requires it (a profile without
  the schedule plugin still activates), a child fiber starts adoption as soon as the service is
  active — which covers a schedule composed **after** Memory, the fresh-install load order — and
  re-adopts the same stored task when the service reloads. Adoption stays idempotent (the stored
  task id is viewed before anything is created, duplicates are reconciled deterministically), so a
  fresh install creates exactly one Resident task and the next wake is shown. While the service is
  absent the status is a neutral *pending* state with a localized reason, not a thrown error, and
  there is still no private timer.
- **First activation seeds the Resident route from the native default selection.** A fresh install
  has no Resident session yet, so there is no session-owned route to read; the first creation uses
  the same default selection a new DSH session would get and the session owns it from then on. The
  shared default is never sampled again, so it cannot move an established Resident. The Resident's
  model/route setting itself is untouched.
- **A fresh profile is "not configured", not an error.** With no managed preset-budget block the
  Memory card and settings section show a localized neutral state plus the action that configures
  it (per-chain `maxBytes`, suggested from the installed presets' own cap), instead of the raw
  `error.presetNoCap` key. Every message reference the host emits now carries this package's locale
  namespace (`lib/host-ref.js`), so a reference resolves through `locale/{en,zh}.json` even when the
  renderer is not this module's translator.
- Verified by `test-first-run.mjs` (fresh home with the schedule service before/after Memory,
  service reload, exactly-one-task, next-wake) and the render harness (fresh-profile state in en/zh).

## 0.9.0 — UI localization (follows the DSH language setting)

Every user-visible string of this package now lives in `locale/en.json` and `locale/zh.json`
(flat `ui` map with `{param}` templates); the code holds only keys. The client renders through
the locale-bound translator the widgets root injects (`props.kit.t`, `kit.resolveText`) and the
host emits locale message references (`msg(key, params)`) for the module descriptor, settings
labels/descriptions/effects, option/unit/group/prompt text and every diagnostic reason. No
`{zh,en}` object and no `text(kit, zh, en)` pair remains.

- The UI follows DSH's language setting: Chinese renders `zh`, any other language renders English
  (DSH's own fallback chain does that; this package ships only `en` and `zh`). A user language
  file in `$DSH_HOME/oh-my-bbff/locale/` adds a language without touching the package.
- **Requires the Oh-My-BBFF Widgets 0.20.0 root (SDK 0.1.16) and the frozen vendored
  `lib/bbff-contract.js` / `lib/dsh-adapter.js`.** 0.20.0 is the root that provides the
  per-module `kit.t`, `kit.msg`, `kit.resolveText` and the `locales` transport that reads these
  dictionaries; on an older root the panel would show raw keys. The family defines no
  machine-readable member→root version field, so this is an install-time requirement:
  **install Memory 0.9.2 together with Widgets 0.20.0 in one restart window.**
- Agent-facing text is unchanged and stays in code: tool descriptions, the Dreaming prompts
  (`lib/prompt-defaults.json`, including its intentional Chinese trigger phrases), the packaged
  `update-memory` skill, and the Resident's own prompt and agent-error text.

## 0.8.1 lifecycle / hot-reload contract

Every generation owns its timers, background reads, session-read cache, subscriptions, in-flight dream work, file handles and the Resident boundary, and stops all of them on dispose. A disposed generation makes no further `sessionQuery`/`sessionPersistence`/`fs`/`schedule` call: the schedule adapter closes and refuses further configuration or run-now, the shared session cache closes an in-flight cold handle and refuses later reads, an in-flight injection plan stops between awaited steps, and in-flight Resident setup unwinds without writing a schedule identity. Native schedule adoption is reconciled deterministically, so two racing generations converge on one task instead of double-adopting it. The Memory-registered Resident preset is unregistered on dispose; a retained live Agent keeps its revision, and a cold resume still fails closed. Verified by `test-dispose.mjs` (24 checks) and the cold-read audit.

## DSH 0.2.2 port — Memory 0.8.0

Requires DSH `>=0.2.2-rc.2`; SDK0.1.15. This section supersedes the older runtime notes below.

- Resident selection uses native `agent.model.current()` / `select()` before step preparation. No `agent/request` route rewriting, `assembly.tools` filtering, or shared-default fallback.
- Native Schedule owns the six-hour wake clock, latest-only downtime catch-up, and Run now. The BBFF card and `dream_status` read the same native task/next occurrence. Run now does not move that occurrence. Intervals are rounded to native RRULE whole-minute precision. Legacy private-timer/retry fields remain readable for settings compatibility but no longer drive delivery.
- A Memory-registered dedicated preset retains the seven-tool boundary for already-live Agents and refuses cold restoration when Memory is unloaded. The seven review tools, machine lease, staged transactions, archive/history and input checkpoint remain unchanged.
- Existing state/checkpoint/count are retained. A nonblank old session cannot change presets under0.2.2: one new protected Resident session copies its owner-selected route, the old session is retained and retitled as retired, and the native task reuses the new session thereafter. No global model choice or saved Memory setting is changed. Missing/ambiguous routes or state fail closed.
- Raised native instruction caps remain. Managed preset blocks regenerate from the **installed** preset files at preview and again at apply; only `maxBytes` differs. Startup detects declaration drift and shows a warning plus Preview/Confirm regeneration in Memory settings. It never silently rewrites the profile. A confirmed regeneration needs the owner to restart DSH; no restart is performed by Memory.
- Native `maxBytes` applies **independently to global and project chains**: a262,144B cap permits up to262,144B in each chain (combined ceiling524,288B), not a shared262,144B total. Memory full/routed injection remains a separate token budget.

**0.7.9 release candidate (not a claim of live installation).** Workspace memory changes now write only `<cwd>/.dsh/memory`; legacy `.opencode/memory` and `.agent/memory` stay readable but read-only. A rewrite creates a same-name canonical copy, selected before legacy sources; inventory shows older copies as shadowed, and injection/routing/search never use both. Archive of a name with a legacy source leaves a small canonical tombstone and a DSH-owned archive snapshot, preserving every legacy byte. Replacing that tombstone restores the name. Undoing history for a COW-created canonical file removes the override and restores the live legacy view rather than copying a frozen legacy snapshot. BOM/CRLF markers remain archived, and an unreadable marker probe produces a diagnostic rather than blocking workspace steps. Saved settings are not migrated; global `$DSH_HOME/memory` behaviour is unchanged. Pre-0.7.9 stages/history targeting legacy directories cannot be committed/restored there: inspect and restage a canonical change. Requires DSH `>=0.2.1-rc.2`.

**Existing presentation and runtime contracts.** Two existing-contract cards: **Memory** and **BBFF Dreaming**. Memory shows one coherent current-mode token readout, the global injection switch, the session's full/routed selector, enabled/disabled file checkboxes and a visible Native instructions region. AGENTS.md / AGENTS.local.md use the separate Harness instruction chain and are not included in that Memory total; readable files do not prove native admission. Dreaming shows one next-wake countdown, its status and visible Wake now / History and restore / Candidates / Schedule and model settings entrances. Selected history/candidate operations open visibly, not inside a closed diagnostic panel. Budgets, bytes, receipts, timestamps, sequences and technical provenance remain default-closed diagnostics. The one-readout rule counts **passive numeric metrics**, not buttons, selectors, file choices or their numeric names. Simplification removes redundant numbers, not controls. **0.7.7 fixed Dreaming Resident model drift**: the Resident route is owned by the Resident session (or an explicit Memory fixed setting) and resolved at each request, instead of sampling the shared DSH global default once per wake. **0.7.8 fixes cross-plugin serial-notification starvation**: Memory's `agent/created` listener no longer returns `injection.attach`'s boolean, because Cordis `serial` stops at the first non-`undefined`/`null`/`false` result — Memory registered before Team silently prevented Team from initializing member roles, routes, doctrine, identity and guards. Injection behaviour itself is unchanged; every Memory listener on a serial event now returns nothing while waterfall listeners keep their required return. No new persisted setting, tokenizer algorithm, SDK dependency or scheduling policy is introduced.

## 0.7.4 presentation and evidence boundaries

All53 `effect` sentences and the approved basic three (default session mode / injection switch / Dreaming switch) are package data. The optional presentation-v2 block is additive to metadata-v1. Memory calls the **installed widgets UI_KIT.SettingsLayout and SettingHelp**; missing v2 capability/metadata retains all fields in the legacy flat view. The other50 controls use the existing7 advanced groups, closed by the shared renderer on a fresh mount. No Client effect-name table, new persisted setting or SDK change.

Budget types are not interchangeable. Automatic injection has a genuine **token cap**; native `maxBytes` and fixed/review budgets have genuine **byte caps**. A byte budget cannot be uniquely converted into a token limit. Native/fixed diagnostic displays keep bytes primary, with a clearly approximate token sidecar computed from the same tokenizer's measured current-text tokens/bytes density. No readable non-empty text means the estimate is explicitly unavailable, never a guessed ratio or question mark. Fixed review4096 and auto review1000×1.3=1300 remain unchanged.

Diagnostics separate **planned batch** values from **committed receipts**; these are no longer competing body readouts. Routed summaries select the actual route component, excluding the router index and no-recall hints; full summaries select the full component. If a matching actual message is unavailable, the same-component plan is used and explicitly identified only in diagnostics. Receipt reads use existing attached, projection-free `sessionQuery.observeSession` leases and the public derived Message API; they never assemble/resume or manufacture an injection. Visible-surface generations and an append cursor avoid repeated historical scans. The most recent retained producer message carries an exact timestamp/sequence basis; it is not cumulative history or proof of remote-model consumption. Native public changes metadata contains original file digests even when only a prefix survives, so it cannot prove per-file admitted bytes by itself. File rows therefore separately show readable current正文 tokens/bytes and verified per-file admission if provided, otherwise a neutral “actual admission unavailable: no per-file receipt”. Host path mapping through the selected FS provider prevents treating a different provider's file as the same host file.

## One source for settings and defaults

- [defaults.json](lib/defaults.json) owns every shipped setting, range, timing, input limit, storage contract and named policy datum.
- [prompt-defaults.json](lib/prompt-defaults.json) owns16 editable prompts and the read-only packaged skill text. Templates use plain `{{variable}}` substitution, never code evaluation; unknown operation-specific variables remain visible.
- The settings API returns **effective values, shipped defaults, limits, sources and diagnostics**. The client renders this metadata and carries no copied policy fallback.
- Precedence is shipped data → explicitly present legacy plugin config → saved field overrides. Saves persist only changed fields, not frozen copies of every default. Legacy values are visibly labeled; they are not a second hidden runtime authority.
- [settings-metadata.js](lib/settings-metadata.js) is the Memory instance of the `settings-metadata v1` presentation contract (same shape as Scope/Widgets: `displayLabel / options[{value,displayLabel}] / default / description / limits / source`). It derives every readable group title, field title, enum label, unit and **default row** from the shipped data; the Client renders descriptors only and never invents a label or a default. 本模块是 settings-metadata v1 的 Memory 实例，下一轮 SDK 升级时与 Scope/widgets 合并。This presentation contract is not promoted into the SDK in this round; the independently approved SDK 0.1.13 adapter vendor sync is recorded separately. Package identity uses a static JSON manifest dependency so native HMR tracks version changes; prepack rejects a mismatch between the manifest, exported identity and `FAMILY_DESCRIPTOR.version`.

The settings page covers injection, full/routed mode, workspace directories, routing, scheduling/retry, input/page limits, model selection, polling/lease/error/stage limits, and all prompt data. Group and field titles are readable in both locales, each field shows one `默认：X` row rendered from its real shipped default, and the English key, numeric range and source live only in the hover title. Raw paths, placeholder inventories and structural limits are folded inside the single default-closed diagnostics panel; the read-only packaged skill stays visible there with its explanation, because an item may be non-editable but never invisible. Missing data shows a loading line in the content area while the reason stays in diagnostics. Restore buttons edit a draft; Save is explicit. Prompt preview does not save or wake anything.

## Memory layout and root identity

The global memory root and all control/artifact paths are computed from the common storage contract and shown in the UI. Workspace memory directories are one ordered setting, used by ordinary tools, injection, review inventories and staged transactions alike. The shipped order includes the canonical workspace store and compatibility stores; existing compatibility-only files are updated/archived **in place**, not copied into a different directory.

The module consumes `bbffFamily.resolveRoot(sessionId)` rather than walking native parents itself. Workspace operations use the resolved **root cwd**, never a child's cwd or the current process as a silent fallback. Unknown identity/cwd is reported. A cached successful result is used only as an explicitly timestamped enforcement context for an already-attached Agent and is dropped on disposal; accepted writes require fresh root evidence.

Ordinary model tools require a verified own root position before accepted memory/instruction writes. Subagents may read active memory or submit untrusted proposals. Per-root activation is inherited by team and ordinary child sessions. Workspace keys include their configured directory; legacy basename bans remain fail-closed, with explicit path enables recorded as overrides.

Tracked workspace instructions are protected. Instruction-writing tools target only the module's declared global/private instruction targets.

## Full and routed injection

**Full** frames an authoritative snapshot of eligible memory. **Routed** frames metadata plus deterministic English/CJK recall and tool fallback; no filename family is hardcoded as always-on. Disabled files are excluded from the index, routing and explicit retrieval. Unchanged admitted prefixes are not repeatedly sent just because a query changed.

Budget modes:

- **Auto** = the session's current model context window **in tokens** × `budgetWindowRatio` (default10%, bounds1%–50%). A 1M-token window yields a **100,000-token cap, not100,000bytes**. Each final framed message is actually encoded (no added BOS/EOS), and the batch count is the sum of message counts. Byte size is only a search hint when fitting oversized text; every fitted candidate is re-counted before admission. The native SDK model-selection projection gives pending→next precedence over a stale request header. Explicit new-Agent/default routes are lower fallbacks; an unloaded known session never borrows another global model. Unknown windows use the declared safe window with an explicit diagnostic. Saved legacy auto configurations get a migration note, including correction of the0.7.2 unit error; reads never rewrite the file. Existing settings.version becomes4 only on an explicit save. Auto review inventory still uses content×1.3, and fixed review still keeps its old byte value; neither is this injection cap.
- **Fixed** = the explicitly configured byte value; token counts are additionally shown without reinterpreting bytes as tokens.

### Offline tokenizer, performance and provenance (0.7.3)

The bundled reference is **DeepSeek-V4.1-Flash tokenizer @ dba1be0a40aa45a94ad051997016db3960a90277**, through **@huggingface/tokenizers0.2.0**. Current DeepSeek Flash aliases match the declared model registry; other models explicitly use this named reference estimate. No model weights, inference engine, native compilation, runtime network or remote code. The original MIT and Apache-2.0 licenses, per-fileSHA-256 and sourceURLs are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The extra megabytes buy real tokenization instead of a byte-count surrogate; the release receipt records exact compressed/uncompressed growth.

BPE runs in a memory-limited worker, not on the Host event loop. Counts are cached by pinned tokenizer revision plus contentSHA-256; unchanged content hashes do not re-run BPE. Missing/corrupt/mismatched files, workerOOM and load failures soft-degrade to explicitly labeled **UTF-8/3 heuristic v1**; the settings body marks estimates and diagnostics preserve the reason. Tokenizer name/revision and cross-model caveat stay in diagnostics/description; the0.7.4 body keeps a compact explicit estimate and labels planned versus committed quantities. Message-role/template overhead, other context and billing are outside these text counts.

One measured development snapshot (10 enabled Memory Markdown files, joined with twoLF separators) contained **456,487 UTF-8bytes and101,375 tokenizer tokens**. The rejected1-byte=1-token surrogate would overestimate by **350.30% relative to the true tokenizer count (4.50×)**. Cold count867.60ms (including worker initialization), same-content cache hit1.54ms. A1,728,000-byte synthetic multilingual sample counted336,000tokens in838.65ms cold and3.65ms cached. These are measured samples, not universal throughput guarantees; cached measurements still hash content but do not re-encode it. Both benchmarks and real workerOOM/missing-file recovery were performed without a model call.

There is no hidden byte minimum. Framing, escaping, headers and notices count toward a batch's allocation. Tiny budgets may omit everything; omitted/truncated/duplicate/source-unreadable paths are explicit. Source reads and aggregate staged snapshots have independently visible bounds.

A planned render is not a receipt. Memory records included bytes/prefix hashes only after observing its matching genuine committed producer message, and can hydrate its own committed metadata after HMR. Complete source-version identity is separate from an admitted prefix. The card distinguishes:

1. current planned framed allocation and omissions;
2. genuine Memory admission receipts;
3. currently retained managed surface bytes, when observable.

The budget is for a **framed Memory batch/snapshot**, not a promise to erase previous conversation, compacted summaries or information already read through other tools. Those limitations are stated in the UI; no remote-model-use proof is invented.

## Native instruction facts are separate

Memory does not claim two assumed instruction paths or copy a deployment budget. The card correlates genuine active native instruction fibers with the already-live selected operational scope, reads validated activation configuration, and uses the native public candidate metadata reader. Current-B declarations never stand in for retained-A configuration; multiple eligible producers remain distinct.

`maxBytes` has no intrinsic deployment default. Candidate discovery uses current host/environment metadata and is not proof of private mount-time homes, remote-provider presence or admission. **Without a genuine same-invocation committed render receipt, native loaded/truncated/over-budget bytes remain unknown.** Existence or a digest is not sufficient.

Direct native leaf budgets retain public `ConfigEditor` preview/apply with exact Entry identity and stale-preview checks. Preset-owned changes instead regenerate the managed block from installed declarations; the old inherited-composition freeze is refused. Normal Loader reconciliation may publish a new generation while an already-retained Agent keeps the old one; applying configuration is never reported as changed admission.

The old path/preset-specific patcher is replaced by an API client:

```sh
node scripts/patch-profile-budget.mjs --help
node scripts/patch-profile-budget.mjs --url <Memory-apiBase-URL> --session <already-live-id> --max-bytes <integer> --source <observed-source-id>
```

It previews by default, has no profile/preset/deployment defaults, and never edits files directly. Apply requires the exact inspected token. Preset regeneration rechecks both profile bytes and installed source digests.

## Ordinary tools

| Tool | Contract |
|---|---|
| `memory_list` | Actual configured paths, directory-qualified keys and activation/read facts |
| `memory_read` | Active file body with included/total bytes and truncation facts |
| `memory_search` | Literal search over active readable files; omitted hits/source limits disclosed |
| `memory_write` | Root-only complete replacement: dry-run diff, then exact confirmed `previewToken` |
| `memory_delete` | Root-only archive/remove using the exact confirmed preview |
| `agentsmd_read` | Module-owned instruction target read; not native admission proof |
| `agentsmd_write` | Root-only global/private instruction diff/apply, native budget warnings, no tracked workspace overwrite |
| `memory_candidate` | Untrusted proposal with source/root-workspace provenance; never auto-accepted |

Write previews bind actor, target, requested content and current bytes. Stale previews fail instead of overwriting a concurrent edit. Accepted file changes retain snapshots/archive/changelog. Powerful model tools remain subject to any other contract-declared permission layers.

## Dreaming Resident

One persistent dedicated session, fixed title **BBFF Dreaming Resident 🌙**, in the declared private workspace. Activation arms a missing state clock but never immediately wakes a new installation. Existing overdue state follows the configured rolling wall clock; a machine lease prevents concurrent scheduled reviewers.

Enabled/autoWake/interval, scheduler checks, heartbeat/stale thresholds and bounded retry behavior are live settings. Status is **running / idle / failed**, based on public native status/error evidence and durable failure state—not merely an open `activeRun` or a lease. A no-commit idle outcome preserves proposals/unread input and is shown as a failure. Read-only status/inventory never creates/resumes/messages the Resident or probes a lease by acquisition.

Retry is deliberately limited to failed preparation/delivery, only when enabled and within the configured attempts/delay. It reuses the bound review and does not replay a model turn or failed commit. Disabling review denies mutations and stops dedicated activity; uncommitted evidence is retained.

The Resident route belongs to the Resident session. **Default** mode reads that session's native `modelSelection` projection exactly as the Host itself views it — `pending ?? lastUsed`: the owner's newest durable selection intent, else the route the session's last actual request used. It never samples the shared DSH global default, so another session's model switch or a global-default change cannot move the Resident. **Fixed** mode uses the explicit Memory provider/model/effort whenever configured. The route is resolved at each assembly/request rather than cached at wake time, so a changed choice applies to the very next request — including a selection made after a wake — instead of one wake later. With no projection service the Resident makes no override and lets native routing decide. Memory never saves a global model default. Actual last-request facts and the last failure's route/time are exposed for attribution. The real/default preset is displayed read-only: native hot preset changes after the first turn are unsupported, so no nonfunctional selector is shipped.

Exactly seven tools exist in the Resident's own scope:

| Tool | Contract |
|---|---|
| `dream_status` | Clock, outcome/error, limits, lease, stage, paths, budget and proposals |
| `dream_delta` | Paginated genuine-human manifest, no raw text; active review evidence is fixed |
| `dream_page` | Bounded UTF-8 fragments; continue both cursor and byte offset until done |
| `dream_read` | Memory inventory/body or untrusted candidate inventory/body |
| `dream_stage` | Evidence-backed whole-file set or explicit archive; omitted content never implies removal |
| `dream_discard` | Discard stage or record a proposal review/rejection, not acceptance |
| `dream_commit` | Preflight all operations, snapshot, apply/archive/log, close review; checkpoint only contiguous delivered input |

Total unreviewed input is not silently lost at page/scan limits. Oversized messages split losslessly, partial cursors survive unchanged revisions, manifest omissions have continuation, and unread input remains after commit. Native event decoding is SDK-owned. Optional subagent inclusion is a visible setting; the private Resident corpus stays excluded.

All per-Agent service mutations use the actual operational getter and `agent.ctx.reflect.trace`. Inherited tools are hidden, every foreign own-layer call is execution-denied, and actual operational assembly is filtered to the seven held definitions. Presentation, prompt, guard and registration disposers are Agent-owned and removed on detach/HMR. No parent scope or service prototype is patched.

## Transactions, history and proposals

Every operation is validated before the first target mutation: exact configured path, stage ownership, before/after hash, limits and lease. Workspace-qualified identities avoid same-basename collisions. Cooperative writers use an immediate-refusal mutation lock; foreign locks are not broken by age.

Cross-file filesystem atomicity is **not** claimed. Complete snapshots and a recovery journal support guarded best-effort rollback; an external edit is never overwritten by rollback. Failed/partial operations preserve stage/checkpoint and recovery evidence. Completed changelog groups are fenced by commit markers.

History is paginated with explicit clipped-window diagnostics. Restore starts with a read-only diff; apply checks both current and desired snapshot identity and creates another audited transaction. It never moves the review clock/checkpoint. Unsupported legacy/protected instruction history remains visibly read-only.

Candidates are explicitly untrusted. Their paths/counts/content/provenance and reviewed status are browsable; review metadata is not accepted memory.

## Packaged update-memory skill: automatic, modification-aware

`skills/update-memory/SKILL.md` ships in the package. It is generated byte-for-byte from `prompt-defaults.json.skill` using only portable placeholder substitution and newline normalization; the build gate and archive test prove equality. The generator stores no duplicate body. It also extracts hashes from actual earlier release packages into `lib/skill-releases.json` with package-path/body-hash provenance, and automatically appends this package's body hash on **every pack**.

At startup the content table is exact: missing→install; equal to this package→no-op; equal to any recognized shipped release but different from this package→automatically replace with this package (backup retained); any other local content→leave byte-identical and record `本地已修改，未自动更新。`. No confirmation button or runtime skill-template override remains. Current hash/automatic result/local modification are readonly, in the default-closed diagnostics area. `memory-skill-preview` is readonly acceptance metadata only; there is no skill-apply write action. Native catalog visibility is independently verified, not inferred from file existence.

A downgrade running this new mechanism follows the same content table, not semantic-version preference. **The separately verified legacy0.6.4 rollback package predates this mechanism and only installs a missing file: rolling back to0.6.4 leaves an existing0.7.0 skill text in place. That is expected; an operator decides whether any manual action is appropriate.** Reports record actual bytes/hash before upgrade, after upgrade and after any real rollback; the plugin does not edit the old rollback code or manually downgrade an owner file.

## HTTP surface

`apiBase` is declared module metadata. GET makes no accepted memory/profile/model mutation; bounded derived-view checkpoints may be persisted under Memory's own data directory:

- `?settings=1`, `?inventory=1&sessionId=…`, `?route=preview&sessionId=…`
- `?dream=state`, `?history=1&cursor=…`, `?candidates=1&cursor=…`, `?candidateId=…`
- `?dream=wake` reports the decision only. Historical `GET …run=1` is rejected.

POST actions cover explicit settings/mode/toggle patches, prompt preview, candidate review, and confirmation-bound wake/history/native-budget flows, plus readonly packaged-skill preview. Model/file/profile mutations are not hidden in GET. Actions require explicit confirmation where they change real state. Authority/source/reason diagnostics are behind one closed-by-default diagnostics toggle.

## Nonblocking metadata reads and performance evidence

Every polled read endpoint returns a cached view or explicit `pending` state immediately. Cold root, native configuration/discovery, normalized session, control/inventory, model/preset and authority work runs after the response in one revision/sequence-keyed background flight. Responses expose `read.parts` with running/ready/error status and measured milliseconds, response-path timing, cache generation and settlement timestamps. The client shows a small spinner/skeleton without text while content is missing. All per-part state, timings, reasons and technical provenance live in one collapsed **诊断信息** area, off by default. Pending does not become an empty inventory, idle Resident or granted mutation authority; a valid cached view stays visible.

Pending polling, reuse, cache capacities and background deadline are shipped settings, not copied client constants. Failed or timed-out work remains one owned flight, not overlapping retries. Explicit operator responses supersede older cache generations. Unload cancels only owned metadata reads.

Native session work has one nondeprecated public seam: attached projection-free `observeSession` baselines, then normalized suffix folds keyed by sequence; cold public persistence identity/revision plus read-only `handle.read(cursor)`. Folds mutate their accumulated maps append-only, never copy all historical maps per event. The polled view retains a bounded recent-human window and owned-frame metadata. Its cursor/view checkpoint is persisted under the declared Memory data directory with a configurable byte bound; a verified unchanged live/cold restart needs no native observation/read/refold. Oversized recent text is represented by exact seq/digest references and restored only at those bounded seqs. Review input has its separate explicit checkpoint-tail view, so the bounded UI window cannot discard unread history. Missing initial/evicted checkpoints bootstrap once in the background; corrupt/unverifiable checkpoints never silently trigger a refold from zero. A newer listed source generation cannot be checkpointed from an older cached prefix. Card polls and pages never call full native `readSession`, replay a Session or use deprecated content accessors. Deferred native limitation: accessing an observation's events may materialize the complete readonly event array; persistence memo misses may decode the complete source file before slicing. Memory does not claim constant physical I/O. Cold and warm budgets are measured separately.

The copied-real-log benchmark distinguishes actual native persistence/SessionQuery/Scope from fixture Root/catalog/HTTP/Agent-carrier ports. Its timings are **not live GUI acceptance**. Before installation is accepted: cold first call ≤8 seconds; five warm calls each <1 second; three concurrent calls each ≤3.9 seconds; background settlement ≤20 seconds. A failure requires immediate rollback to the prior verified package. No model action is part of this passive gate.

## Verification boundary

The source harness covers framing, defaults/provenance, roots, UTF-8 paging/coverage, transactions/recovery, native public config facts, real isolated native registry ownership, simulated controller/model-route events, host API and client controls. Those fixture results do not count as a paid/live Resident cycle or a GUI deployment proof. A release receipt must additionally list packed files/hashes, installed byte checks, passive live status and actual refreshed GUI screenshots. Tests never need owner memory/profile edits or an out-of-schedule review.

The SDK's two runtime files are vendored only with its official synchronization/check tool. Local development peer junctions are test-resolution aids, excluded from the package and never used as runtime paths.
