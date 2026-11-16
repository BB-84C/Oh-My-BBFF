# Changelog — Oh-My-BBFF Team

## 1.0.2

- The session-mode switch on the Team card now really switches. Team leader turns native Agent Teams on for the conversation and Orchestrator turns it off, so a conversation that started in one mode can move to the other without a restart. Auto and Off leave the native selection as it is (Off still turns the Team doctrine off). Before, the switch only stored a BBFF preference and the card honestly showed "Effective: Orchestrator".
- The mode is stored only after the native switch succeeded. A missing Agent Teams service, an unloaded root conversation or a failed native call is reported as an error on the card and nothing changes.
- Fixed resolving the root of a conversation that is not loaded (it failed with an internal error).

## 1.0.1

- An Orchestrator root (a root conversation with Agent Teams off) may now read the activity of its own subagents (`bbff_team_activity`) and cancel their background jobs (`bbff_team_job_kill`). A subagent and an unclassified or yielded session are still refused.
- Every Team refusal now states how the conversation is classified (`lead`, `solo-root`, `child`, `unknown`, `foreign`), the reason, and what to do. For example, an Orchestrator root is told to turn on "Use Agent Teams" in the model menu. Hiring, assigning, compacting and formations share one wording.
- When Team mode is off, `bbff_team_roster` returns `teamState` with the classified position, the reason and the remedy.

## 1.0.0 — first public release

- First public release of Oh-My-BBFF Team. Family-wide version reset to 1.0.0.
- Requires DeepSeek Harness 0.2.2 or newer. Built on the native team and subagent model.
- The user-facing README was rewritten. The development log below is preserved unchanged.
- Documentation correction that supersedes the historical wording below: the role catalog (or `bbff_team_assign`) is the single model authority. Deprecated per-member override data is ignored and there is no manual-override precedence.
- `CHANGELOG.md` is new. The former README is this history, moved verbatim.

# Oh-My-BBFF Team

Role-based organization of subagents and Team members for DeepSeek Harness. Part of the Oh-My-BBFF family (contract v1); works standalone.

## Current release 0.12.0 — UI language follows DSH

The Team card and settings now follow DSH's language setting (Settings → Language). Chinese shows Chinese; every other language shows English. Team adds no language setting of its own.

- **One file per language.** All UI text is in `locale/en.json` and `locale/zh.json`, under `ui`, as flat keys with `{param}` placeholders; `meta` keeps the plugin-list title and description. `en.json` is the complete reference and `zh.json` has exactly the same keys. To add a language, copy `en.json`'s `ui` into a user language file as the BBFF root describes (`$DSH_HOME/oh-my-bbff/locale/<id>.json`, section `oh-my-bbff-team`); missing keys fall back to English.
- **No UI text in code.** Host code emits message references (SDK `msg(key, params)`) for:
  - settings labels, effects, option labels, groups and sources;
  - doctrine template names and meanings;
  - shipped role titles;
  - the report placeholder;
  - the family descriptor's title, description, required-tools reason and permission-layer title.

  The client reads Team keys with `props.t` and resolves references with `kit.resolveText`; the card and settings section register with `ui.msg` titles and `moduleId: 'team'`. The old in-code dictionaries, `{zh, en}` maps, `reasonLocales` / `titleLocales` and `kit.locale()` branches are gone. The descriptor declares `locale: { dir: 'locale' }`.
- **What stays English in code:**
  - agent-facing text (tool descriptions, doctrine, prompts; role titles shown to agents come from `en.json`);
  - logs (formerly partly Chinese);
  - host error and diagnostic messages, which the card shows only inside its technical "Diagnostics" dump.
- **User text is never translated.** A display-label override, a user role title or a legacy `{lang: text}` map in a roles file is shown as written. An edited role title is stored as the user's single string.
- Needs the BBFF SDK 0.1.16 surface (Widgets root). Without `ui.msg`, Team registers no card rather than showing raw keys.

## Previous release 0.11.1

- **Outsourced counts per member.** Every core row and the Lead header (team view, `bbffTeam.members`, HTTP `action=team`, and the roster) carry `outsourcedCount`, the number of outsourced agents that agent started, and `outsourcedDescendants`, the number in its whole subtree. Both are computed from the full ledger tree, not from the bounded outsourced list, so a member's count stays right when its older children are omitted from `members`. They are ledger-only and need no decode.

## Previous release 0.11.0 — Team metadata ledger

Team is built for persistent agent teams, so sessions keep growing; repeated reads must not decode session logs. Team now keeps its own metadata ledger, `<DSH_HOME>/oh-my-bbff-team/ledger.sqlite`. It uses built-in `node:sqlite` in WAL mode with a short busy timeout, and it is derived data: a missing, corrupt or unknown-version file is rebuilt.

- **What it holds:** for every agent of Team's trees:
  - parent and catalog row (native name, label, mode, `createdAt`);
  - running/idle/inactive status with times;
  - turn start and end, route, last report;
  - context estimate at turn end, last error;
  - a ring of its most recent events (at least 50, or `activityMaxLimit`) for `bbff_team_activity`.
- **How it is fed:** from live events Team already observes (`session/event`, `agent/status`, `agent/created`, `agent/disposed`). Writes are batched in one transaction about every 250 ms, never on the event path. A busy database keeps the queue and retries.
- **Read only from the ledger, with zero decodes:**
  - roster and team view (`bbffTeam.members`, HTTP `action=team`), overview and card data;
  - status, `lastActiveAt` and `runningSince`, counts, names and aliases, `dispatchedBy`, routes, last report and last turn end;
  - `bbff_team_activity` within the ring;
  - name and path resolution for steer, job-kill and activity.
- **The only times a session log is decoded** (serial, in the background, at most once per persistence revision, and recorded so it never repeats):
  1. a one-time backfill of a session the ledger never saw (history from before the ledger);
  2. reconciliation when a session's `persistence.stat` revision changed but the ledger saw none of its events (another process, or events while Team was unloaded);
  3. an explicit deep request: `bbff_team_activity` with `before` older than the ring.
- **Native `list_agents` is disabled** for every agent of a tree with Agent Teams on, because it reads every agent's whole log on each call. The denial points to `bbff_team_roster`, whose rows carry the name or path, status and description plus Team's fields. `send_message` and `wait_agent` are unchanged.
- **Clean unload:** every timer, background pass, in-flight read and the SQLite handle stops or closes on unload, so a reloaded generation never runs alongside the old one.
- **New view and roster fields:** every non-Lead row carries `parentId` (the creating session) and `mode` (the native catalog mode). Together they give the native sidebar address: `dsh-resource://subagentchat/session/<id>?parent=<parentId>&mode=<mode>`.

## Previous release 0.10.4

- **No repeated full-log decodes.** Reading a cold (unloaded) session's subagent catalog decodes that session's whole log. 0.10.3 did it for every descendant on every roster or team-view refresh, which kept a host busy decoding large logs continuously. Team now:
  - reads a cold catalog at most once per persistence revision;
  - keeps the result in a bounded cache, persisted in `catalog-cache.json` so a restart does not repeat it;
  - re-checks a cold session (one cheap `persistence.stat`) only after it was live in this process or every 30 s.

  The roster and the team view never wait for a cold read: they answer from live and cached catalogs and fill the rest in one background pass (`partial` says so). Member-fact hydration opens a cold log once per revision for both the event count and the turn-end scan, and shares the same stat.
- **Live status and recency.** Every team-view row (and the Lead) carries `status` from the native live Agent at read time (`running`, `idle` = loaded, `inactive` = unloaded). It also carries `lastActiveAt`: the latest of the last observed event, cached turn end, cached report and `createdAt`; no log is read for it. Running rows carry `runningSince`. Rows are ordered running first, then by `lastActiveAt` (newest first). These are additive fields in contract version 1. Roster rows carry the same `status` and `lastActiveAt`.

## Previous release 0.10.3

DSH 0.2.2 treats every subagent of a conversation as part of its team. Team follows that and adds one distinction on top:

- **Core** members hold standing responsibilities that need long-lived context and are reused heavily: hired with `bbff_team_hire`, or promoted (and rebound) with `bbff_team_assign`. Members created before DSH 0.2.2 that have a BBFF binding are core and keep their binding name or seat as an alias. DSH 0.2.2 has no public reader for the historical Team roster, so a 0.2.1 teammate without a binding is outsourced until it is assigned.
- **Outsourced** agents do bounded jobs: role dispatches (`bbff_team_dispatch`) and native subagents, started by the Lead or by a core member at any depth. They are reusable too: `bbff_team_steer` continues one for follow-ups on the same job, by name or path.
- `bbff_team_roster` gives core members full rows and outsourced agents compact rows (name, role or `unbound`, kind, model, status, description, `dispatchedBy`), newest first, bounded by `rosterOutsourcedLimit` (default 20, replaces `rosterUnboundLimit`) with `outsourcedOmitted`. The BBFF soft cap counts core members only.

**Public team view (contract version 1).** The same two-tier list is served by `GET <Team apiBase>?action=team&sessionId=<any session of the tree>` and, host-side, by `await ctx.get('bbffTeam').members(rootAgent, { signal })`:

```
{ available: true, version: 1, enabled: boolean|null,
  lead: { sessionId, name },
  counts: { core, outsourced, outsourcedOmitted },
  partial?: string,                      // why deeper agents are missing, when they are
  members: [                             // core first, then outsourced newest first (bounded)
    { sessionId, name, alias?,           // name: native name or path, else the BBFF alias, else the session id; alias only when name is a BBFF alias
      tier: 'core'|'outsourced', kind: 'member'|'oneshot'|'unbound', role: string|null,
      routeLabel: string|null,           // "provider / model / effort"
      status: 'running'|'idle'|'inactive', createdAt: number|null, description, dispatchedBy,
      seat?, reportExcerpt?, reportAt? } // core rows only
  ] }
```

The HTTP route also returns `ok`, `sessionId` and `rootId`. When the session is not in a live tree the view is `{ available: false, version: 1, reason, counts, members: [] }`.

## Previous release 0.10.2

- **Model changes take effect at the member's next turn** (`bbff_team_assign`, formation apply, a new DSH default for a role without tiers). A turn in progress finishes on the model it started with: cross-provider switches inside one turn break providers that replay their own reasoning (DeepSeek thinking mode rejects earlier tool-call steps from another provider with "reasoning_content … must be passed back"). The assign result says when a busy member's current turn keeps its old route; the roster shows the held route. To switch a busy member right away, let its current turn finish (or end it), then send the next task. Role prompt and permissions still change from the next step.

## Previous release 0.10.1

Review fixes on top of 0.10.0 (DSH `>=0.2.2-rc.2`):

- **Members created before DSH 0.2.2 keep their names.** Their native catalog rows have no name, so Team uses the member's BBFF binding name (else its seat) as an alias: the roster, steer, assign, activity, compact and formation planning accept it, formations match the bound seat instead of proposing a duplicate hire, and a new hire cannot take an existing alias or seat. The roster and leader prompt show the native address (session id) that `send_message` needs. Conflicting aliases fall back to the session id and are reported.
- **Roster size.** Role-bound members and live children get full rows; inactive unbound native children are one line each (name, description, status), bounded by the new `rosterUnboundLimit` setting (default 20), with the rest counted. Only role-bound members count toward the BBFF soft cap.
- **Route changes no longer drop a claimed step.** When a binding, catalog or DSH-default change lands after native step preparation captured a route Team itself selected, that step runs and the new route takes effect from the next step. A route Team never selected is still refused.
- **Clearer route failures.** When the bound tier can no longer be selected (for example, it was removed from roles.json), the member's turn error names the cause; `bbff_team_assign` to a valid tier recovers it.
- **Assign during an unload or resume.** `bbff_team_assign` re-reads the live member after its model preflight, so a member that resumed meanwhile gets the new role and route before its next step.
- **No copied native facts.** The root's native name in the doctrine is read live from the subagent service; new names are validated by the native start (length, reserved and duplicate names) instead of a Team copy.

## Previous release 0.10.0 — DeepSeek Harness 0.2.2

Requires DSH `>=0.2.2-rc.2` (`engines.dsh`). DSH 0.2.2 removed native teammates: Team members are now named native subagents of the root conversation, and Agent Teams is a per-conversation switch ("Use Agent Teams" in the model menu, default off). Every Team tool keeps working on that model:

- **Members are named subagents.** `bbff_team_hire` starts a named, continuable subagent of the Lead (the root, native name `lead`) with the role prompt, permissions, skill/MCP masks, doctrine and tier route attached before its first step. Hiring needs Agent Teams on; with it off the conversation stays an orchestrator and `bbff_team_dispatch` still works. Dispatch returns the child's native name and accepts an optional `name`.
- **Role and model changes use the public model API.** The role route is recorded for that member only with `agent.model.select()` (DSH 0.2.2 fixes provider/model/effort before prompt assembly; `agent/request` may no longer change it). `bbff_team_assign(name, role, model)` takes effect from the member's next step; an unloaded member applies it when it next wakes. A step prepared on a route the binding did not select is refused and the role route is selected for the next step. The DSH default model and other sessions are never touched.
- **Names everywhere.** `bbff_team_steer`, `bbff_team_activity` and `bbff_team_job_kill` take native names (`builder`, paths such as `builder/scout` for activity and job kill) or session ids, `bbff_team_compact` and `bbff_team_formation` use teammate names, messages go through the native subagent message service, and doctrine describes `send_message({agent, message})`, inbox-only `wait_agent` and task owners by name.
- **Roster.** `bbff_team_roster` lists every agent the Lead started except one-shot role dispatches, from the Lead's native subagent catalog. DSH 0.2.2 has no member-count cap (live members are bounded by the native `maxActiveSubagents`, which plugins cannot read), so the roster says so and only the optional BBFF soft cap applies; it can now be set without a DSH cap.
- **Removed:** the `list_agents` model rewriter and its `listAgentsColdReadMs` setting (0.2.2 rows carry no model; the roster is the model source; an existing setting value is ignored), the `spawn_teammate` guard (tool removed), the reload diagnostic tied to `agent/request`, and name-keyed member reservations.
- **Skill isolation:** every shipped role now denies `dsh-doc`, the 0.2.2 replacement for the four retired Creator skills; only the Lead sees it. `diagnose-windows-sandbox-acl` denials are unchanged.
- **Native tool effects** (read-only and capability masks) come from SDK 0.1.14, rebased on the installed 0.2.2 packages: `apply_patch` and `schedule_edit` are writes; `office_*`, `schedule_view` and `user_terminal_*` are reads.

## Previous release 0.9.3

- **Cold `list_agents` model reads answer from caches first and no longer depend on a fixed 1.2 s cap.** Before any session decode the plugin now reads the session's persistence revision and tries, in order: the persisted member-fact cache when it holds the served model at that exact revision, an in-memory success cache keyed by the same revision (valid until the session changes), and — only when the backend reports `eventCount` so the block's watermark proves it covers the last event — the persistent projection cache. The JSONL backend reports `sizeBytes` but no `eventCount`, so the revision cache is the exact zero-decode path there.
- **The wait bound is a Team setting.** `listAgentsColdReadMs` (default 5000 ms) replaces the module constant. It was measured from the real oversized session `d26c3e13…`: the full cold path (`stat` + `sessionQuery.observeSession` + `modelSelection`) took 55–82 ms over five runs (median 62.7 ms), so the shipped default keeps roughly sixty times the observed headroom.
- **A read that outlives the budget keeps running in the background.** The call still returns `model unknown: …` at the budget, never the Lead's model and never a wait beyond it; the background read verifies the revision, fills both caches, and the next `list_agents` call answers without decoding. Reads stay one-at-a-time and non-activating, and failed reads keep their 30-second / 64-entry negative cache.
- **No other change.** The 0.9.1/0.9.2 tool-identity guard, reload diagnostic, assignment ownership and every prompt, role, permission and model route are unchanged. `engines.dsh` stays `>=0.2.1-rc.2`.

## Previous release 0.9.2

- **Explain interrupted hot-reload admissions without weakening enforcement.** A request assembled under a Team policy generation that was unloaded/reloaded is still stopped before model dispatch. When exact live-Agent and turn-signal receipts prove that replacement, the failure text carries `BBFF_TEAM_RELOADED` and tells the Team Lead to resume with `bbff_team_steer`. A first-step failure says no task work ran; later or unverified step positions warn that earlier tools may already have run, so the Lead should continue from the stopping point rather than blindly repeat the whole task. The same text reaches the recorded turn-end, roster last-turn failure and activity view. Genuine missing-policy and section-registration errors keep their existing diagnostics; no automatic retry or admission bypass is added.
- **Assignment ownership is consistent.** Future explicit `bbff_team_assign` writes include `leadId` equal to the Lead's root session id, alongside `ownerId`, as hired member bindings already do. Existing records are not migrated or rewritten on load or installation.
- **Residual reload limits.** The first upgrade from a pre-0.9.2 version has no old admission receipt, so a stale turn from that version cannot be labelled reliably and keeps the generic error. An assembly wholly inside an unobserved old-disposed/new-not-yet-applied gap also stays generic. Receipts are process-local weak references, never persisted owner data. Earlier task work is not rolled back.
- **Install only while every Team member is inactive.** A turn assembled before upgrading from a pre-0.9.2 version has no reload receipt and still gets the generic missing-policy error if interrupted by installation. Once receipt instrumentation is present, a pre-reload request is always blocked even if the replacement instance already re-installed policy; this is an intended fail-closed tightening, and re-sending or continuing the task recovers on a fresh assembly.
- **Native roster compatibility and bounded reads are hardened.** `list_agents` enrichment requires the native row schema to keep `model` an optional string; an incompatible future schema is left untouched. Failed and timed-out cold reads preserve their `model unknown:` reason in the same 30-second, 64-entry bounded cache as successful reads, so repeated roster calls do not repeatedly decode an unavailable member session.
- **0.9.1 model correction remains in place.** Its `tools/post-execute` registration is unchanged. DSH compatibility remains `>=0.2.1-rc.2`; no role/model/settings migration, new serial notification registration, default prompt or permission change is introduced.

## Previous release 0.9.1

- **Native Team `list_agents` now reports each row's real next-request model.** One listener on the public `tools/post-execute` waterfall (the contract's "accept, replace, enrich, or block a normalized dispatch result") recognizes the native Agent Teams roster tool by its resolved definition and returns the same rows, order and fields with only `model` corrected: the Lead from its own session `modelSelection`, a bound member from the same resolved route Team enforcement installs, and an unbound member from its own session `modelSelection` (cold sessions are read through the public `sessionController.projections` under a bounded budget and are never resumed). When certainty is missing the field is omitted and one `model unknown: …` diagnostic is appended; the Lead's value is never substituted. Failures, cancellations, other tools and the ordinary subagent `list_agents` are untouched, and the corrected value still passes the native closed output schema.
- **No other change.** Client, SDK adapter, family contract, catalog/prompts, doctrine, settings, tools, permissions and model routing are byte-identical to 0.9.0; installation adds no setting and rewrites no owner role, setting, model or binding byte.
- **Residual limitation.** The cold read only makes a persisted member session's own selection visible; a member whose session has no model-selection record (never had a request and no explicit selection) is reported as unknown rather than guessed.

## Previous release 0.9.0

- **DSH-native skill deny defaults are shipped per role.** Every seed role now denies the four Creator-mode authoring skills (`agent-experience`, `cordis-composition-reference`, `cordis-plugin-development`, `editing-cordis-compositions`); explorer, librarian, oracle and writer also deny `diagnose-windows-sandbox-acl`, while laborer, fixer and designer keep it because they run commands. Creator-mode authoring skills are therefore visible only to the Lead (an unbound session). A deny for a skill absent in the current mode stays silent, and the 0.8.8/0.8.9 superpowers denials are unchanged; these are deny lists only, never allow lists.
- **DSH compatibility gate.** `package.json` declares `engines.dsh: ">=0.2.1-rc.2"`; the running 0.2.1-rc.2 satisfies it, with the prerelease participating in the range (`includePrerelease`).
- **Shipped doctrine gains one workspace-hygiene line.** The leader, member and child defaults now place intermediate files (notes, scratch scripts, probes, captures) only under `<workspace>/.dsh/artifacts/<task>/`; user `doctrineTemplates` overrides still win.
- **No other change.** Client, SDK adapter, family contract, catalog prompts, tool and model routing are byte-identical to 0.8.9.

## Previous release 0.8.9

- **The skill catalog is published from the first request again.** A role's `skills.deny` list now installs its skill mask synchronously while the role policy is installed, instead of registering it from an awaited task that finished while the native catalog publisher was collecting. The native publisher retries a collect only once, so a registration that landed in that collect left the child with no catalog at all from 0.8.8 onwards; the assembly hook now also settles the mask's one install-time scan before any catalog snapshot. Denied skills stay hidden from the catalog and denied at call time, names that are not installed stay silent, and unbound sessions and the Lead are untouched.
- **No other change.** Client, SDK adapter, family contract, catalog seeds, doctrine templates, tool and model routing are byte-identical to 0.8.8; installation adds no setting and rewrites no owner role, setting, model or binding byte.

## Previous release 0.8.8

- **Shipped skill denials are role data, not runtime lookup.** Every seed role now carries a deny-only `skills.deny` blacklist from the owner-adjudicated OMO mapping. `bbff-team-member` stays visible for every role; explorer, librarian, writer and laborer deny the seven method/leader skills plus `update-memory`; oracle keeps `systematic-debugging`; fixer and designer keep the implementation skills and `bbff-team-member`. A user `skills` field still replaces the shipped one verbatim (including `{}` or an allow list); nothing is migrated, nothing is looked up at runtime, and no owner file is rewritten on read or install.
- **The fixer may use native reference web.** The shipped fixer no longer denies the `web` tool effect: its identity and leader brief permit `web_search`/`web_fetch` for the official documentation, API contract or exact error a bounded implementation needs. Open-ended research still belongs to the librarian. Explorer keeps its native web denial.
- **Absent denial rows are quiet.** A skill named only by the shipped denial stays an ordinary editable row in the role editor when the current catalog has no such skill: no missing/uninstalled diagnostic, no catalog-absence badge, no installation recommendation. Rename and removal controls stay available.
- **No runtime, SDK or contract change.** The Client change is limited to that absent-row rendering. SDK adapter, family contract, doctrine templates, role schema, tools and model routing are unchanged; installation adds no setting and rewrites no owner role, setting, model or binding byte.
- **Residual limitation — deferred compaction still runs on the serial `agent/created` notification.** Native AgentLoop marks the agent running before the pre-step `systemPrompt.assemble`, and native `compactNow` reserves maintenance only while idle, so moving the deferred hop onto the role-policy anchor cannot preserve the never-running / before-next-normal-turn semantics as a small change. The role policy itself stays on the early `systemPrompt.variable` provider; family listeners still return nothing on that serial event.
- **Regression evidence.** The complete historical suite (29 suites) passes with exactly two adapted expectations — both the old "seeds impose no skill policy" assertion superseded by these deny-only defaults — together with the focused native runtime and UI suites. The language gate normalizes only the authorized default deltas and keeps the raw hashes.

## Previous release 0.8.7

- Shipped leader and member doctrine defaults each add one English skill-discovery line: `bbff-team-leading` for the Lead's operating method and references, and `bbff-team-member` at member intake/shared-state changes/reporting.
- User `doctrineTemplates` overrides still win verbatim. These are plain template hints, not runtime skill loading or an installation dependency; rendering works when a skill is absent. Child and orchestrator templates are unchanged.
- Client, SDK, catalog, permissions, model routing and persistence behavior are unchanged. Stable-prefix and language gates remain in force; the two approved default lines are the only intended prompt delta.

## Previous release 0.8.6

- **Binding-driven first-request enforcement.** One Host `systemPrompt.variable` provider ensures the live Agent's role policy before native section/tool snapshots and before the assembly waterfall. It is independent of serial `agent/created` delivery; role initialization no longer lives in that callback. Recreated Agents obtain fresh scoped doctrine, identity, visibility, permission/skill-load guards and route verification from the binding.
- **Fail closed, observable state.** A bound request with missing or stale guards is blocked with a specific error at the Team request boundary. `bbff_team_roster` includes `enforcement.state` (`attached`, `missing`, `yielded`, or `unbound`) and a reason. An unloaded member is honestly missing until its next real admission; status reads never wake it. Read-only prompt previews do not write model-selection events.
- **One model authority.** Members and role children use their binding/catalog route, changed by assign, formation or role catalog. Native rc.2 rejects member/child session UI model picks, so there is no competing UI-choice branch. Deprecated `binding.override` data is ignored, not migrated or deleted at install. Empty model lists follow the current DSH default at every request; a catalog edit from fixed models to an empty list takes effect on the next request.
- **Normalized native agreement.** Real admission resolves the binding route through public `llm.resolveCallConfig`, including default effort, and compares it with `sessionProjections.stateOf(session,'modelSelection').pending ?? lastUsed`. It appends a normalized member-local `model/selection` only when different. The next matching request header clears pending, unchanged admissions append nothing, and cold members are not resumed for configuration. No event scan, selection cursor, new binding field or install-time selector rewrite is used.
- **No global-default mutation.** Team never calls `sessionController.selectModel` or saves `agentDefaultModel`; that UI API would resume a session and save the global default. Member choices stay local. Unavailable tiers are reported without automatic model switching.
- **Notification gate.** Prepack exercises the actual serial-notification callback with boolean/object/Promise helper values and requires undefined. Required waterfall return values are unchanged. SDK adapter, family contract, catalog/default prompts and Client bundle remain unchanged.

### Public-contract boundary and upstream proposal

The early global provider is not an event listener, so another listener returning true on `agent/created` cannot skip role initialization. Native request/assembly middleware remains privileged and vetoable; Team does not claim an absolute boundary against Host code that replaces services or deliberately bypasses later middleware. Native generic session model selection refuses subagent-owned member/child sessions; this product does not promise member UI picks or rely on an ordinary-session private selection cache. Acceptance reads the first actual request header and role system prompt, never only self-description or an immutable creation-options badge.

Busy assign has a remaining in-flight window: a step already sent may retain its previous doctrine until the next assembly; route and guards are refreshed for managed subsequent requests. Owner `superagentYield:all` with an observed superagent yields without blocking; roster reports `enforcement: yielded`. Deferred compaction remains an operational `agent/created` notification, not part of the role-policy anchor; Memory0.7.8 removes the known notification bailout, but an unrelated plugin can still disrupt that separate maintenance notification.

A normalized selection may remain pending if no request header follows (live assign without a request, or rejected/aborted admission); rolling back to0.8.5 in that window can make the old code read it as a user override, whose value equals the assigned route.

A future native contract could provide non-vetoable request admission and a public session-local selector that neither resumes an Agent nor saves the global default. Team0.8.6 does not patch DSH or access private selection-controller methods to emulate those APIs.

## Previous release 0.8.5

- **English defaults, unrestricted user language.** Shipped role briefs, identities and doctrine templates remain English. User-written tier guidance, model labels, role titles, briefs, identity prompts and doctrine overrides enter model context without language/script filtering or replacement. Existing whitespace normalization applies equally to all languages.
- **Both language gates removed.** Ordinary Lead/orchestrator role tables, member tier lists and role/formation discovery retain the configured guidance and title instead of substituting a Settings pointer or role id for Chinese, Japanese or Cyrillic text. Locale-aware title selection still prefers the existing English entry, without inspecting its characters.
- **No owner-data migration.** Roles, settings, models, bindings and doctrine overrides are read-only on installation; no new setting or model choice is introduced. Client changes are limited to three English fallback copy strings; its registration id stays unchanged. SDK adapter, family contract, catalog seeds, shipped English prompts and tool schemas stay byte-identical to 0.8.4.
- **Regression evidence.** The real roles.json shape retains every owner tier, including the fable cost warning, through the Lead renderer and ordinary role discovery. The same new assertions fail against frozen 0.8.4. Shipped default prompts render byte-identically to that baseline.

## Previous release 0.8.4

- **Cold sessions do not require an event count.** The native persistence contract makes `eventCount` optional. Summary loading reuses activity's bounded point-probe counter (at most 48 one-event probes), then scans backward in batches of 64, with a 7680-event lookback. No native field is invented and no session is cold-resumed.
- **Last-turn results have three explicit states.** `lastTurnEnd.state` is `pending` while queued/loading, `ok` only when a committed native turn-end was found (with `time`, `turn`, `reasonKind`, and bounded failure details), or `unavailable` with a required `reason`. A zero pending count does not imply success: `parts.turnEnd` separately reports `okMembers` and `unavailableMembers`.
- **Previously missed cold summaries recover automatically.** Older operational-cache entries with null summaries are revalidated once in the background even when their log fingerprint/revision has not changed. Real recorded facts remain cached. Owner roles, settings and bindings are not rewritten.
- **Request-path behavior is unchanged.** Roster reads cached facts immediately; cold summary work stays in the serial background queue. Native first-read decompression/parsing can still cause an event-loop delay; this is measured separately rather than described as non-blocking merely because an API is async.
- **Evidence uses actual cold logs.** Tests copy byte-identical compressed member sessions into a test-owned workspace directory, mount the shipped native backend, prove that its snapshots omit `eventCount`, reproduce the 0.8.3 failure from the frozen 8725 package, and verify the repaired result against independently filtered activity. Activity error filtering and frozen 0.8.1 binding rollback checks are retained.

## Previous release 0.8.3

Performance passed live acceptance, but cold summaries had a known gap when native snapshots omitted `eventCount`. Pending/empty results below describe that previous release, not the 0.8.4 three-state contract.

- **Roster never waits for last-turn summaries.** On the request path `lastTurnEnd` is a synchronous cache lookup only. A summary that has not been read yet yields `lastTurnEnd: null`, `lastTurnEndPending: true` and `parts.turnEnd.status: "partial"` with the pending member count; the roster response never reads, decodes or awaits a session log. Summaries refresh in the background after the response, one member at a time, cached per live session or persistence revision.
- **Background scan is bounded and yields.** It walks backward in 64-event batches, decodes only `turn/end` events (no per-event SDK decode), yields a macrotask between batches, and stops at the same 7680-event bound. A native memo-miss read remains the only unavoidable long task; batch count and event-loop lag are measured by the acceptance test rather than assumed from `async`.
- **Ready summaries are complete.** Once warm each member shows recorded `time`, `turn`, `reasonKind`, and for errors the bounded `failureMessage` with original length/truncation. Live `turn/end` events update the summary immediately from the activity tail already decoded for them, with zero extra reads.
- **Unchanged elsewhere.** `bbff_team_activity` filtering (`kinds`/`outcome`) semantics are unchanged. Bindings keep the route identity (provider/model/effort) with no persisted selector; legacy selectors resolve in memory with `bindingInvalid`; the frozen 0.8.1 package still reads route-only data. Client, SDK, catalog text, ACL and owner role data are untouched.

## Previous release 0.8.2

- Model identity instead of labels in bindings, read-only legacy recovery, `lastTurnEnd` and `bbff_team_activity` filters. Retracted before acceptance: the first cold roster read regressed to ~1.7 s because summaries were awaited on the request path; fixed in 0.8.3.

- **Bindings use model identity, not labels.** Explicit dispatch/hire/assign/formation operations store provider/model/effort in the existing route field. Member bindings omit the display selector; an empty role model list keeps model:null for dynamic DSH default selection. Labels/indexes remain selection inputs and current display values, never newly persisted identities. Startup performs no binding or owner-role rewrite.
- **Read-only legacy recovery.** An unresolvable historical primitive selector falls back to the role's first tier/default and exposes bindingInvalid with the selector, reason and effective route. Current identity routes must still match configured provider/model/effort; removing an identity or an unavailable provider does not silently select another model. The historical override-priority behavior was removed in0.8.6 because native member-session UI picks are not supported; the binding is authoritative.
- **Last turn at a glance.** Each roster member has lastTurnEnd with recorded time/turn/reasonKind and a bounded failureMessage with original length/truncation. It comes only from SDK-decoded committed turn/end facts. parts.turnEnd distinguishes pending/stale/unavailable/partial; a bounded cold lookback never invents a completion verdict.
- **Activity filters before limit.** kinds selects recorded kinds; outcome:error selects failed tool results, error turn-end and llm-retry. Both compose with exclusive before paging. Omitted filters, empty kinds or outcome:any preserve the previous unfiltered shape. Filtered scans are bounded and expose scannedEvents/maxScannedEvents/scanLimitReached plus nextBefore; continue when an older result is required.
- **Recovery diagnostics are not native events.** Actual binding recovery is retained in bounded Team RAM and returned separately as teamDiagnostics with source:team-diagnostic. No fake turn/end, unknown native event type, persistent diagnostic file or new storage key is written. Restart clears those notices; recorded native errors remain in activity.
- **Rollback remains readable.** Version 0.8.1 already resolves a missing model selector from the route identity; tests load route-only records produced by 0.8.2 through the exact frozen 6F26 package. Existing primitive bindings remain readable without a startup migration. Client, SDK, owner role/settings data and role ACL stay unchanged.

## Previous release 0.8.1

- **Executable role identities, not summaries.** Each of the seven shipped identities now separates Role, Tools and Usage, Behavior, Output Format, and Constraints. The prompts explain the actual DSH file/search/image/command tools, stopping conditions, evidence requirements and copyable report skeletons; they do not assume unavailable OpenCode tools or an external skill package.
- **Actionable caller briefs.** The five leaderBrief fields distinguish dispatch triggers, concrete counterexamples, required deliverables and verifiable acceptance, while keeping the role's own operating prompt out of ordinary leader discovery.
- **Source adaptation is explicit.** The OMO source design principles, review/candidate verdict and writing capability-gap rules are retained with DSH mappings. Existing BBFF fixer/designer delegation differs from OMO's leaf defaults and is described as the unchanged configured permission, not silently altered.
- **Text-only runtime change.** Role kinds, models, reuse, concurrency, read-only flags, tool/skill/MCP permissions, schema and renderer logic are unchanged. Owner role overrides are not rewritten; legacy purpose/prompt views still derive from leaderBrief/identityPrompt. Client, SDK and stable-prefix gates are unchanged.

## Previous release 0.8.0

- **Two distinct role text layers.** `leaderBrief` has five sections (`summary`, `whenToUse`, `whenNotToUse`, `deliverable`, `boundaries`) for the caller to decide when to dispatch. `identityPrompt` is appended once to the role's own system prompt, never to the normal leader routing table or catalog list (including nested default records). An explicit role-id query returns the full record. Old `purpose` / `prompt` input is upgraded in memory with diagnostics; read-only compatibility views remain available, and no owner file is rewritten on read or installation.
- **Seven shipped roles.** `validator` is retired, not hidden: old overrides are ignored with a diagnostic, old remove entries do not become restore buttons, and role operations cannot resurrect it. `laborer` is a non-delegating leaf. Seeds have no model pins.
- **Real native capability blacklists.** `tools.denyEffects` declares `write`, `execute`, `delegate`, or `web`; the current native tool surface is expanded using the SDK's inspected `NATIVE_TOOL_EFFECTS` and family catalog ownership, not a role-to-tool-name table. Read-only roles derive write/execute/delegate denials; writer can write files but cannot execute native commands; workspace-only explorer and non-research fixer deny native web (0.8.8 removed the fixer web denial; explorer keeps it). Explicit user name denials still apply to external tools; automatic defaults do not manage external/MCP tools. Existing user allow-lists remain readable but the UI creates blacklists only. Skills impose no installation requirements; automatic scope is only proven DSH/BBFF bundled sources, while user/project/custom or unknown sources stay user-owned.
- **Widgets presentation v2.** Team reuses the family `SettingsLayout` / `SettingHelp`: exactly three basic groups (member work mode, soft cap, naming), one default-closed advanced region, and consequence text owned by Team metadata. The soft cap cannot raise the native ceiling; existing members cannot be renamed (verified against the installed DSH projection). Old roots without the optional renderer keep the complete flat editing surface.
- **Understandable doctrine.** All 24 fragments retain compatible keys but carry group/audience/trigger/effect metadata. Actual discipline, conditional fragments and the four position prompts are separate; position prompts live in advanced. `memberRole` stays editable. A read-only current-session Team-section view is explicitly a calculation for the next assembly, not a historical request receipt.
- **Historical language restriction, removed in 0.8.5.** Version 0.8.0 shipped English defaults but incorrectly replaced non-English user tier `use` text in ordinary routing output with a Settings pointer. This was not the intended English-default contract; current releases retain user text in every language. Installation never rewrites the owner's role file.
- **Historical model-output boundary, corrected in 0.8.5.** Ordinary role/formation directories previously replaced some user titles with role ids. They now retain the selected title verbatim. Framework report placeholders and plugin-owned diagnostic metadata remain English; user formation labels/descriptions, member reports and raw activity evidence are untouched.
- **Stable prefix regression gates preserved.** Routine busy/idle/context/report changes cannot alter leader/member text. Hiring/removing members or changing assignments/formations may invalidate once, then five further live-state perturbations must be byte-identical. Both gates run in prepack. SDK adapter and family contract bytes remain canonical; no profile or native DSH code change.

## Previous release 0.7.2

- The leader system prompt carries stable assignments only: member name, role, selected model tier, standing function and helper ownership. Busy/idle status, context pressure and latest reports stay in `bbff_team_roster` and are no longer part of the stable system prefix. Routine status/report changes therefore cannot invalidate prefix caching.
- `prepack` runs a byte-stability regression gate: six leader renders and six member renders per seed role must be identical while busy/idle state, context usage and reports change. Stable configuration changes (hiring/assignment, role or model edits, formations, helper ownership and permission/depth settings) may invalidate the prefix once, as intended.
- No Client, SDK, contract, tool-result, user role/settings, or dynamic roster API changes. The 0.7.1 preset requirement and identity de-duplication remain intact.

## Previous release 0.7.1

- Role-bound members receive their identity prompt once. The shipped `memberRole` fragment no longer prepends a second `Your role — purpose` description; leader routing descriptions and user-authored template overrides are unchanged.
- **Team requires standard or cordis (Creator).** `bbff_team_dispatch` and `bbff_team_hire` read the calling Agent's actual retained preset through `agentPresets.composedPreset(agent.ctx)`, not the profile default or another window. An unsupported preset (including ptc/minimal) produces a visible **This will not work** warning in both the receipt and rendered result. If that live source is unavailable, the warning says it could not verify the current preset and identifies any unverified session-header hint. The warning does not turn a successful dispatch/hire into a failure, change the model, or silently switch the inherited preset.
- No user role/settings file, Client code, SDK adapter or family contract change.

## Previous release 0.7.0

- **Lead-only `bbff_team_activity(target, limit?, before?)`** reads the last committed events of a teammate, a direct child, or a known member descendant **exactly as recorded**. The result carries `hostNow` (epoch ms + ISO), the resolved target, the effective limits, and an ascending bounded window; every event has `seq`, absolute `time`/`timeIso` and `ageMs` relative to `hostNow`. Per event kind: `tool/call` (name, raw arguments, original length, truncated flag), `tool/result` (`isError`, recorded error `{name,code,reason?}`, output excerpt + original length), `job/registered` / `job/settled` (jobId, owner, producer kind, label, startedAt/finishedAt, recorded status, cause, detail), `assistant/message` (block kinds, text/reasoning excerpts + full lengths, tool calls, stream finish reason and LlmFailure fields, interrupted), `assistant/attempt` (block kinds, finish reason/failure), `turn/end` (recorded end reason, LlmFailure or cancel cause), `llm/retry` / `llm/retry-started` (retry identity, delay, provider, failure), plus seq/time/type envelopes for other event kinds (large unrelated goal/todo/history payloads are not copied into the activity window). Calls report `hasResult:true/false` when the retained evidence covers the result, or `null` when a paged older call falls outside the bounded pairing window. **No verdict, health label or inferred failure class is produced** — the Lead reads the raw recorded fields itself. The two Lead-only tools are root-session only, so members cannot call them.
- **Lead-only `bbff_team_job_kill(jobId, target?, reason?)`** cancels an owned member/child background job through `jobs.kill(jobId, ownerSessionId, reason)`. The current native owner-fenced registry (`jobs.get`) is authoritative, so a long-running job is still cancellable after its registration has aged out of the activity tail. Supplying `target` restricts lookup to that session; it never silently widens to another member. On a backend without `jobs.get`, the bounded registration fallback accepts only a registration whose recorded owner equals the permitted session itself; copied ancestor registrations cannot grant access to another owner's job. Returns the verified owner, evidence source and native `requested`/`already-finished` outcome; does not interrupt the whole turn.
- **Bounded data path**: the Widgets committed-event/watermark approach is reused for a separate raw-activity RAM tail (Widgets' existing engine folds goals/todos, not raw activity). Each queried session retains at most `max(160, activityMaxLimit)` bounded facts, with 64-session LRU retention; concurrent identical fills coalesce and same-revision warm reads reuse the tail. A cold (or not-yet-watched) session reads a **bounded tail** through native `sessionPersistence`; live sessions give their exact length. When cold `stat` lacks `eventCount`, logarithmic single-event probes plus binary search locate the tail, with at most 48 one-event reads (no linear scan/replay), and the count is cached per stored revision. The native JSONL/zstd backend itself can still fully decode on a backend memo miss; this is disclosed, not presented as physical tail-only disk I/O. Team only receives/folds bounded events. `activityDefaultLimit` (shipped **10**), `activityMaxLimit` (shipped **50**) and `activityPreviewChars` (shipped **400**) are Team settings with visible defaults; truncation always states the original length and a truncated flag.
- **SDK 0.1.13 (additive)**: the new `activityEventFacts` decoder in `lib/dsh-adapter.js` supplies these raw facts; `sessionEventFacts` and `assistantMessageFacts` are unchanged (verified against real archived session events). Family invariant changes here: contract stays `72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115`; the vendored `lib/dsh-adapter.js` is now **134,182 B / SHA256 `c4a91aae7f2912b3b1656a54502f52f8923710f0375a255b018ff73ecb130556`** (previous `915027cb8fcac930e8781142b783457fe2422b8bb715226ecdb5ca82399920be` / 122,322 B remains the documented rollback baseline). All four family plugins must vendor the same new bytes.

- **Tracked manifest identity**: Host metadata imports `package.json` statically with JSON import attributes, so package changes enter the HMR dependency graph. `prepack` loads the real Host module and refuses a mismatch between package/name/version, exported `VERSION`, `FAMILY_DESCRIPTOR` and the Client factory id. Installation acceptance uses disk bytes **and** callable new tools; the family-reported version is additionally checked after this repair, not used as a substitute for observed behavior.

## Previous release 0.6.5

- Report bodies now render Markdown instead of displaying escaped/plain text. Each member report is one bordered container; the **head row** (member name · Chinese role title or 未绑定/团队领导 · local time) uses `--dsw-alias-bg-layer-2` while the **body** uses `--dsw-alias-bg-layer-1`, and adjacent member blocks are separated by an 8px gap. All colors come from existing theme tokens; no dependency is added and the card height is unchanged. No role → 未绑定; lead → 团队领导; a member without a report shows 暂无汇报 and no time.
- Renderer choice, in contract order: ① no directly exportable Markdown component/primitive exists in this installation — `dsh-client-ui-primitives` is only an internal bundle id of the Web frontend, not a resolvable plugin module; ② the `conversation.chat.reasoning.content` factory slot is a Chat-internal slot whose render helpers are supplied to Chat factories, not to a Widgets card, so a card cannot invoke it; ③ therefore this release ships a small **safe React Markdown subset** whose whole contract is listed below. Nothing is injected as HTML and `dangerouslySetInnerHTML` is never used.
- Deliberate limits of the subset: paragraphs, headings (levels 1–6), bold/italic, inline code, fenced code blocks (rendered as `<pre><code>`; content is never executed), unordered/ordered lists, blockquotes, horizontal rules, and links. Links become anchors **only** for `http`, `https` and `mailto` targets, always with `target="_blank"` and `rel="noopener noreferrer nofollow"`; any other scheme (for example `javascript:`) stays inert text. Images (`![alt](url)`) are **never fetched and never rendered as `<img>`** — only their alt text (or the URL text when alt is empty) appears. Raw HTML in a report stays literal text. An unmatched emphasis/code marker is dropped instead of printed, so a stored excerpt cut mid-marker (the old `**Memor` case) renders without leaking half a marker.
- Preview length: the complete 400-character excerpt is rendered; only the body container is visually clipped with CSS (`display:-webkit-box`, `WebkitLineClamp: 3`, `overflow:hidden`), so a code fence or emphasis span is never cut into invalid Markdown. Long tokens/paths wrap (`overflow-wrap:anywhere`).
- Data is untouched: the persisted 400-character excerpt, `totalChars`/`truncated` and the Lead's roster/overview API keep the full normalized summary. `REPORT_RENDER` (`maxLines:3`, `clamp:'css'`) is a display constant surfaced in the default-closed diagnostics, not a new persisted setting.

## Previous release 0.6.4

- The card report area is scannable: each member report is its own rounded block with a head line (**member name · Chinese role title or 未绑定/团队领导 · time or 暂无汇报**) and a short preview body, separated by an 8px gap plus a 1px border and light background from the existing theme tokens. No new dependency, no card-height change.
- The preview is display-only. It strips markdown notation (fenced/inline code, bold/italic markers, headings, list markers, quotes, links/images, rules, HTML) and shows at most the first two sentences or 120 characters, whichever comes first, with an ellipsis; it never ends on half a sentence, half a marker, or a dangling comma. Fenced code blocks are not shown.
- Data is untouched: the persisted 400-character excerpt and `totalChars`/`truncated` stay exactly as recorded, and the Lead's roster/overview API keeps the complete normalized excerpt. The preview policy is a display constant surfaced in the default-closed diagnostics, not a new persisted setting.
- Members with no report keep **暂无汇报** and show no time. Both locales are covered by the same policy.

## Previous release 0.6.3

- The card report area covers **every native Team member, one row per member row** (lead included). Role bindings still provide the role chip and permissions, but no longer decide whether a report row exists; an unbound member shows **未绑定 / Unbound** in the role slot and still shows its report. A member without any report shows **暂无汇报 / No report yet** — no empty limbo row and no fabricated time.
- One-time metadata correction on load, for report records imported from the 0.5.4 DTO that had no timestamp: the plugin looks up the member's own persisted session store (`$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl[.zstd]`, read-only), requires a **unique** `assistant/message` whose text blocks start with the stored excerpt, and restores that event's real time plus provenance (`timeSource: member-session-event`, `eventSeq`, `eventTime`, `sessionFile`, matched/original lengths). The previously lost truncation metadata is corrected too (`truncated`, real `totalChars`) while the stored excerpt bytes stay unchanged.
- If no unique event matches (excerpt no longer present, session rewritten/compacted), the record falls back to the documented capture time (`timeSource: capture-time`) with the reason recorded, and the UI labels it **采集时间 / Captured** — never presented as the member's speech time. If neither exists, the row is left untouched and reported explicitly; nothing is filled with the current time or zero.
- The correction is idempotent and fail-closed: a durable marker (`fixes.report-time-backfill-v1`) makes later starts read nothing from session stores; before the single atomic replacement the plugin backs up the exact pre-fix bytes next to the checkpoint with a SHA manifest, verifies every untouched record's raw bytes before and after, reads the whole file back, and rejects plugin activation if a record would still be missing a time. Only the listed records change; all other records keep their exact bytes even as new live reports keep arriving.

## Previous release 0.6.2

- Loaded/running member context uses the actual Agent-owned native projection service and current Session cursor. Measurements are reused only for that exact service/Session/sequence. Unloaded members remain explicit checkpoint hints; no cold report replay or bootstrap is introduced. Native `stateOf()` can materialize every registered unit: its measured cost is not hidden or replaced with a pressure fixture.
- `rosterWaitMs` is a visible setting: **1000 milliseconds by default, 0–1000**. A roster call waits only when a shared refresh is actually in flight, within one total request budget. With no flight it returns immediately; cancellation does not cancel work shared by other readers. `refreshWait` diagnostics expose whether there was a flight and the actual inclusive wait elapsed time. Native synchronous work cannot be preempted by a JavaScript timer and remains part of real wall-clock acceptance.
- Team-owned presentation descriptors provide Chinese setting/option/template names and editable sparse `displayLabels`. Each setting has one default-value line; technical paths/ranges are tooltips or default-closed details. Role titles, not wire ids, label the card/list/editor. Placeholder lists are closed by default. An existing report with no original timestamp says **时间未知 / Time unknown**; migration/import time is never presented as report time.

### One-time normalized legacy report migration

This is explicit operator-provided data, not log backfill. The package contains no user reports. The only input is Team's own `report-import.json` file, with this envelope:

```json
{
  "version": 1,
  "apply": false,
  "source": { "kind": "normalized-team-roster", "version": "0.5.4", "capturedAt": null },
  "members": []
}
```

Each supplied member is an already-normalized legacy DTO row (`id`, `name`, nonempty `lastReport`, optional original `reportAt`/`lastReportAt`, optional exact lifecycle `identity`). Source placeholders/empty text are skipped. Original time is either a valid original ISO timestamp or `null`; imported time is a separate field. Actual live/header-or-public-stat identity is checked again on apply. Any existing newer checkpoint wins.

`apply:false` is a read-only preview: counts, identities and unknown-time rows are reported without a report write, backup or completion marker. An approved apply additionally requires `apply:true` and an explicit absolute non-root `backupDirectory` chosen under the operator's artifacts tree. Approval covers the missing-only/no-overwrite rules, not a frozen count. Optional `approvedSnapshot` (or legacy `expectedPlan`) records the preview counts and `missingIds` for comparison only. Immediately before backup/commit, the plugin synchronously recomputes the final missing/preserved list. Reports that arrived since preview are preserved, so actual additions may be 2, 1 or 0; number differences are warnings and the log names rows that became preserved. Only the final write-time list is compared with actual additions. Identity/backup errors, any existing-record change, or a mismatch against that final list refuse the apply; there is no automatic retry loop.

**Single writer:** do not externally rewrite the report file while 0.6.1 still owns its old in-memory store: its next message could overwrite externally inserted rows, causing a lost update. Stage only the approved input; after the normal version switch the new plugin is the sole writer. It logs the plan, backs up exact pre-import bytes with SHA256 to the explicit artifacts directory, commits additions and marker in one atomic replacement, reads bytes back, and verifies every pre-existing record's raw bytes plus the new count. Noncanonical pre-existing formatting requires review rather than silently rewriting record bytes. The resulting whole-file SHA is reported in the audit log and migration status.

Once the one-time marker is already loaded, repeated execution performs no source/header/filesystem I/O or writes. A new process must still read its persistent checkpoint once to recover the marker. Failed/cancelled migration rejects plugin activation, so a failed migration cannot count as a successful installation. Operator readback and normal rollback remain required; user role/settings files are never restored as part of report migration.

## Historical content-first correction 0.6.1

- Cards and the settings page show content only. Pending data uses a small spinner; technical part status, timing, revisions and reasons live in one default-closed **诊断信息 / Diagnostics** area.
- Polling never cold-bootstraps or fully replays report logs. Each new live member assistant report writes a bounded checkpoint under Team's own data directory: lifecycle identity, native revision when available, excerpt and timestamp. The previous report survives restart/unload; stale content has only a visual marker/time in the main card. A member without any checkpoint shows **暂无汇报 / No report yet** until its next report.
- Existing native JSONL range reads can still decode the complete file. A true physical O(delta) cold-read API is an upstream deferred item; Team does not pretend `read(cursor)` solves it. Old reports are not recomputed in the background.
- The already-packaged 0.6.0 archive remains immutable and is not the installation candidate for this correction.

## Contract-driven settings release 0.6.0

- Uses SDK 0.1.11 / additive family contract v1.6 (major `1`), with the canonical native convention/effect adapter. Package identity and runtime version come from package metadata.
- Every role exposes title, kind, read-only/delegation policy and tools/skills/MCP filters, with field-level source and shipped-default comparisons. Seeds contain no model pins or preselected filters. Empty filters inherit; a user-authored empty allow-list remains an intentional deny-all. Unknown references remain neutral catalog state, never installation recommendations.
- All configuration writes use an explicit stage → actual before/after review → exact-id commit/discard. Expected affected-field baselines are checked against the server's captured snapshot; role edits, model/full resets, hide/restore, settings, templates and formations cannot silently replace an unseen same-field change. The old direct mutation HTTP shortcuts return `410` with migration guidance.
- Unknown tool effects have the visible **allow (shipped default) / deny** setting for read-only roles. Known write/delegate effects remain forbidden. Report dependencies are descriptive requirements, not filter or read-only exemptions.
- Methodology/doctrine is editable default data with declared placeholders, example preview, sparse overrides and formal restore. Templates change instruction text, not mechanical permission/capacity rules. Configured/native/effective delegation depth are distinct; actual dispatch uses their verified effective bound.
- Polled overview/catalog/roster reads return cached parts with status, reason, freshness and per-part timing. Cold work is a single background flight; pending is shown as loading, not empty. Pressure checkpoints are explicitly labelled hints; no polled read materializes all native projection units or replays a whole Session. Read cache/cadence/retention/excerpt settings and defaults are visible.
- Manual model overrides are visible and take precedence over role tiers. Clearing remains disabled until a verified public native mutation exists; deleting only the Team binding is not presented as a real clear.
- Operational retention protects live/member/initializing role assignments and reports evictions. Unreadable stores preserve their bytes and report unknown state; managed roles fail closed instead of becoming unrestricted. Published older archives are not rewritten.

## Historical contract sync release 0.5.4

0.5.4 only syncs the vendored runtime to SDK 0.1.6 (additive contract v1.5 `descriptor.exclusiveTools`; contract major remains `1`). Team does not declare `exclusiveTools`; its tools, business logic and verified 0.5.2 client are unchanged. Published 0.5.3 package bytes are retained.

## Contract sync release 0.5.3

This release only updates the vendored family runtime to SDK 0.1.5 (additive contract v1.4, including exposure-contributor `reasonLocales`). The contract major stays `1`; Team does not register a new contributor or change its tools, routing, settings or UI behavior. The client remains the verified 0.5.2 implementation. The twelve-tool ownership declaration is unchanged. Published 0.5.2 package bytes are retained.

## What it does

- **Role catalog (data, not code).** Seven editable seeds (explorer, librarian, oracle, designer, fixer, writer, laborer) are overlaid by `$DSH_HOME/oh-my-bbff-team/roles.json` and `<workspace>/.dsh/team/roles.json`. The former validator is retired and cannot be restored; existing references are retained on disk but ignored with a diagnostic.
- **Two organization modes, chosen live per session:**
  - Team plugin absent → the root session is an **orchestrator** of one-shot role children (`bbff_team_dispatch`).
  - Team plugin present → the root is a **team leader**: hires durable role members (`bbff_team_hire`), reuses them (`bbff_team_roster`), assigns tasks, verifies. Members may orchestrate one-shot children only within the current verified Team/native depth bound.
- **Enforcement on real surfaces** for role-bound agents: tool visibility (`tools.restrict`) plus an authoritative execution guard (write tools for read-only roles, per-server MCP access, delegation policy, skill allow-lists), skill-catalog hiding, and per-member LLM routes (`agent/request`), with the binding/catalog route authoritative.
- **Coexistence with dsh-superagent:** never provides the `orchestrator` service; never decorates, restricts or reroutes superagent router/worker sessions.

## Role file

New role text uses schema v3: `leaderBrief: {summary, whenToUse, whenNotToUse, deliverable, boundaries}` plus `identityPrompt`. `tools.denyEffects` contains capability names; `tools.deny` contains explicit user-selected names. Both text layers are edited separately in Settings. Old `purpose`/`prompt` input remains readable through a non-writing in-memory upgrade; migration and retired-role diagnostics explain what was used or ignored.

The following **legacy v2 compatibility example** is not the current authoring shape:

```jsonc
{
  "remove": ["validator"],
  "roles": [
    { "id": "fixer", "route": { "provider": "<provider-id>", "model": "deepseek-v4.1-flash", "effort": "max" } },
    {
      "id": "tester", "title": { "en": "Tester", "zh": "测试" }, "kind": "member",
      "purpose": "Owns the test suite and acceptance runs",
      "prompt": "You are the TESTER …",
      "route": { "provider": "<provider-id>", "model": "gpt-6.1-sol", "effort": "high" },
      "delegation": { "mode": "oneshot", "roles": ["explorer", "laborer"] },
      "reuse": "pool"
    }
  ]
}
```

Schema v2 (0.4.1): `id`, `title`, `kind` (`oneshot|member|both`), `purpose`, `prompt`, `readOnly`, `models: [{label?, provider, model, effort?, use}]`, `concurrency`, `tools {allow?, deny?}`, `skills {allow?, deny?}`, `mcp {allow?, deny?}` (server names), `delegation {mode: none|oneshot|any, roles?}`, `reuse` (`fresh|amend-same|pool`). Overrides merge field-by-field over the role with the same id.

All built-in seeds have **no model pins**. `models: []` uses the current DSH default from `agentDefaultModel.currentSelection()` at use time, not the caller's route. `models[0]` is preferred; dispatch/hire/assign accept optional `model` (a tier label or 1-based index in that role's list). No arbitrary caller provider/model and **no automatic switching**: failed preflight lists the alternatives and their `use` conditions for an explicit next choice. One configured model means no alternative. Legacy `route`/`fallback`/`substitution` files are converted on read before overlay merging; old examples above remain readable, but new writes use `models` only.

Durable members retain role plus provider/model/effort identity (or intentional default-following mode), never a display-label alias. Each admission resolves that binding against the catalog; removing a fixed identity fails closed rather than silently substituting another tier, while empty models follow the current DSH default. Member/child session UI model picks are refused by native subagent ownership routing. Models change through assign, formation or the role catalog; deprecated override fields are ignored. No install-time selector migration occurs.

## Tools

| tool | who | what |
|---|---|---|
| `bbff_team_roles` | everyone | routing table / one role in full |
| `bbff_team_dispatch` | roots; members/children whose role allows delegation | one-shot role child, non-blocking, result delivered to the caller |
| `bbff_team_hire` | Team Lead | durable role member (Team `spawnTeammate` + role binding + route) |
| `bbff_team_assign` | Team Lead | bind an existing (role-less) member to a role, or `none` to unbind |
| `bbff_team_roster` | Team members | roles, purpose, model tiers, busy/idle, projected context used/window/%, last reports, helper ownership, caps and pending compactions |
| `bbff_team_steer` | Team members / direct-child owner | native steer delivery by teammate name or the caller's own direct continuable child id; role-dispatched spawn children are accepted when their native catalog mode is continuable, even with a `kind:'oneshot'` role binding |
| `bbff_team_compact` | Team Lead | idle loaded member: compact now; idle unloaded member: persist a request to compact before its next normal manager-owned turn; never resumes a member solely for compaction |

### Team operations (0.4.3)

`bbff_team_steer` accepts peer member names and the caller's own direct child id, not cross-level ids.
Native catalog mode decides child continuation; a BBFF role binding called `oneshot` does not by itself
make a spawn child unsteerable. Noncontinuable/external catalog entries are refused. An accepted message
is steered at the next step boundary; acceptance is not proof that the target has processed it.

DSH releases a teammate's Agent handle when its turn settles. An idle member is therefore often
unloaded. `bbff_team_compact` records such a request in `compaction-pending.json` without resuming it.
On the next normal manager-owned resume, a non-awaited creation listener waits for initialization
maintenance to finish and reserves native compaction maintenance before the first turn. The serial
creation listener never waits on its own `whenIdle`, and a running turn is never compacted. The native
`compactNow` service is preferred; when isolated by the preset, only DSH's identified native `/compact`
command is used as a public bridge. Roster `compactPending` and `lastCompaction` show scheduled work,
errors/no-ops and before/after context; a failed or missed idle window remains pending with a diagnostic.
No second Agent, direct `agents.resume`, profile patch or DSH source change is used.

In `helpers` mode every member, including an unbound or unknown-role member, is blocked from native
and BBFF delegation. The lead can hire a helper with `assist:'main-member-name'`; each helper has one
owner and counts against both the per-main helper quota and the team cap. `memberCap` is only a BBFF
soft cap under DSH's read-only `maxMembers`. Failed roster entries still count. The read-only API
`action=team-settings` exposes both caps; `action=roster&sessionId=...` exposes the same roster readback.

## Sidebar card (组织与调度)

Per root session: switch the team mode (auto / orchestrator / leader / off) and see role-bound agents counted by role. `auto` follows Team availability; `orchestrator` keeps a Team-enabled root on one-shot dispatch (`bbff_team_hire` refuses); `off` injects no team doctrine. Children and members follow their root. Stored in `$DSH_HOME/oh-my-bbff-team/session-modes.json`.

## Settings (BBFF 设置 → Oh-My-BBFF Team)

The global settings section keeps one compact header per role; details and the inline editor open only when requested. The editor changes purpose, the multiline prompt, model tiers and concurrency. Tiers can be added, removed or reordered; each has an optional label, provider → model → effort pickers and a required free-text use condition. The first tier is preferred, not an automatic fallback. An empty list means **DSH default model**. Long prompts stay in a vertically resizable textarea.

**New role** exposes id/title/kind/purpose/prompt/readOnly/delegation. Role ids are checked before saving; hidden roles remain restorable. Existing-role edits send only fields changed from the editor's initial baseline, so a prompt edit does not accidentally replace model settings changed elsewhere. Workspace overlays are read-only; this global page deliberately does not use a possibly stale current session id. The separate current-session workspace button explicitly views the shared **root** directory. Runtime role overlays remain scoped to the actual Agent working directory, including a child's explicitly selected `cwd`; use the explicit-directory view to inspect that child's workspace. Neither view writes an overlay.

**Team settings** exposes nesting mode, helper quota, superagent yield, member naming, the read-only DSH member hard cap and the separate editable BBFF soft cap. `memberNaming:'function'` names members after a long-lived function; `'seat'` uses `seat-1`, `seat-2`, etc. while the real function stays in the binding. Blank soft cap follows DSH; a custom value cannot exceed the observed hard cap. Unknown DSH capacity disables custom-cap editing. Settings changes now stage a changed-field patch and show a before/after review before **Confirm commit**; discarding returns to the retained draft.

Every save, hide, restore or model reset uses `config-stage` then `config-commit` with that exact stage id. Failed saves retain the form draft. The shared history lists time, UI/tool provenance, reason and a value-free change summary. Revert requires an inline confirmation explaining that it restores whole-file before snapshots, including later edits to those same files, and records the restoration as a new audited change. No-op edits do not create phantom history.

### Formation editor (0.5.1)

The same settings section lists each formation's label, id, seat count and diagnostics. Create/edit supports an immutable-after-creation lower-kebab id, label, description and any number of seats. A seat has a true lower-kebab name (letter-first, up to 48 characters, not `lead`), a standing function, a member-capable role, an optional **labelled** model tier and an optional main seat it assists. Tier options display the catalog's `use` text. An empty model list means the current DSH default; omission uses the role's preferred tier. Unlabelled alternatives are shown but cannot be selected as formation pins. Helpers list only other main seats in the same definition; helpers-mode, quota, capacity and stale-reference diagnostics remain visible without inventing extra structural write restrictions.

Formation saves and removals use **stage → before/after diff and server summary → Confirm commit**. The staged id is displayed, the reviewed draft is locked, and abandoning/discarding a review discards only that form's stage. Definitions are whole replacements, not shallow merges; a fresh read rejects an already-changed editing baseline before staging. Removing a definition requires a separate removal preview and does not remove members or rewrite bindings. Existing shared history/revert handles formations too, including exact-byte whole-file restoration. This page has **no Apply button and never hires members**; application remains the Lead-session `bbff_team_formation` tool.

The active formation is read-only. Global definitions are loaded without a session id; a separate current-session read obtains the active id. Loading or a failed session read is displayed as loading/unknown, never as a confirmed empty selection. A stale session affects only that status row, not global editing or writes. File-level structural diagnostics disable create/edit/remove until the document is explicitly repaired or restored through history; a corrupt document is not called an empty collection. Per-definition runtime diagnostics do not impose new write restrictions. Saving an already-active definition changes the Lead's rendered definition on its next request, but does not re-seat members. Forms and diffs adapt to the actual settings-panel width, including a collapsed sidebar at 860px.

The module descriptor's optional contract-v1.3 `tools` list is derived from the exact tool definitions registered by this plugin, including formation and root-only config tools. Compatible roots can label these tools `BBFF·Team` without classifying other plugins as native. The vendored SDK runtime remains dependency-free and byte-identical to the authoritative SDK.

## Diagnostics

`GET /oh-my-bbff-team/api` — `action=status|catalog|bindings|models|efforts|session|overview|roster|effective-catalog`. Explicit configuration changes use `config-stage` → reviewed `config-commit` or `config-discard`; old `save-role|reset-role|remove-role|restore-role` HTTP shortcuts return `410`. `session` reads actual doctrine/enforcement state; `doctrine-preview` is a read-only example render, not a claim about live injection.

## Audited configuration (0.4.2)

`lib/config-store.js` is the sole role/settings/formation writer. Both settings UI convenience actions and
model tools use the same durable **stage → commit** path. A stage validates the global catalog
plus the chosen live-session/explicit `cwd` workspace overlay (when supplied), every configured
model through the real LLM preflight, and settings keys. It does not alter live files. Commit refuses a stale base, snapshots old bytes to
`.history/<timestamp>-<id>-<file>`, atomically replaces the global file and appends `changelog.jsonl`.
The log records time, source (`settings-ui|tool`), session id, reason, exact user instruction and diff
summary (changed files, role ids/fields). Revert restores the entry's **before** snapshots as a new
commit, preserving history. This is a whole-file snapshot restore, not a selective per-role undo;
later edits to the same file will also be replaced (and are snapshotted by the new revert commit).
Config changes invalidate catalog caches and reapply live restrictions. The JSONL log is extended
via atomic temp+rename, not a vulnerable partial append; malformed historical tail lines are
reported in `config-read.historyWarnings`. No-op commits do not create phantom history entries.
Bad role/settings JSON stays visible in `config-read.raw`/catalog diagnostics so an explicit,
validated `replace-file` can repair it without hand-editing a broken UI data file.

Only `$DSH_HOME/oh-my-bbff-team/{roles.json,settings.json,formations.json}` can be written; workspace files are never
written. Stages survive reload in `.staged/<id>.json`. Invalid stages leave config/history untouched;
discard drops a stage. A commit preflights again and serializes writes in the live store. This is
not an OS-wide cross-process lock: do not operate two independent profile hosts on this data dir.

API on `/oh-my-bbff-team/api`: a supplied `sessionId` must be live, or an explicit `cwd` is
required to retain workspace validation. Omit both for an intentional global-only edit. The UI API
is user-facing; root-only enforcement applies to the model tools, not to authenticated UI edits.

| action | method/body | result |
|---|---|---|
| `config-read` | GET; optional sessionId for workspace context | global roles, normalized settings, effective catalog, history |
| `config-stage` | POST `{change, reason?, userInstruction?, sessionId?}` | `{ok, staged:{id,summary,...}}` |
| `config-commit` | POST `{id}` | applied entry |
| `config-discard` | POST `{id}` | discarded flag |
| `config-history` | GET | entries, newest first |
| `config-revert` | POST `{id, reason?, userInstruction?, sessionId?}` | new commit restoring that history entry's prior state |

Changes: `{op:'patch-role'|'replace-role', id, role:{...}}` (new custom roles require all role fields),
`{op:'remove-role'|'restore-role',id}`, `{op:'patch-settings',settings:{...}}`; an array groups multiple
changes. A validated whole-global-file replacement is also supported as
`{op:'replace-file',file:'roles.json'|'settings.json'|'formations.json',value:object|null}`. Lifecycle operations preserve
hidden custom definitions so restoring them is lossless. Old direct-write UI endpoints are retired;
clients must stage, display the returned actual review documents and confirm the exact id.

`bbff_team_config_read`, `bbff_team_config_stage`, `bbff_team_config_commit`,
`bbff_team_config_discard` are **root-only** (members/children/foreign sessions are refused).
Only use mutation tools when the user explicitly asks to change roles/prompts/models/settings.
`_stage` requires `reason` and `user_instruction` (the user's words verbatim). UI edits record
`source:'settings-ui'`; an older UI that supplies no words records an honest empty `userInstruction`,
not invented user consent.

Settings: `nestingMode` (`nested|helpers`), `helpersPerMember` (nonnegative safe integer),
`superagentYield` (`own-sessions|all`), and `memberCap` (`null` or a positive safe integer no greater
than the observed DSH cap). `memberCap` is a **BBFF soft cap**, never a profile/TeamService mutation;
`null` follows DSH. Unknown keys, out-of-range caps or an unknown DSH cap for a non-null edit are
refused. Raising the DSH cap requires the user's separate profile change.

## Data

`$DSH_HOME/oh-my-bbff-team/bindings.json` — durable session → role/model-tier bindings (oneshots also
keep their dispatch-time route snapshot); `session-modes.json` holds root organization modes;
`roles.json`/`settings.json` are audited config; `.staged`, `.history` and `changelog.jsonl` hold the
review/history ledger. `formations.json` is also audited configuration; `bindings.json` additionally holds each Lead session's active formation and member seat/function/formation fields.

## Formations and standing names (0.5.0, backend)

DSH names/descriptions and durable roster entries are immutable. Name a member by a long-lived function, **never the current task**. `memberNaming:'function'` is the default. With `memberNaming:'seat'`, names are `seat-1`, `seat-2`, etc.; omitting `bbff_team_hire.name` allocates the first free `seat-N` inside serialized admission. The real function lives in the binding. Retarget by assigning/re-seating and compacting an **idle** member, not by hiring/retiring. There is no retire operation.

`$DSH_HOME/oh-my-bbff-team/formations.json` has this versioned shape:

```json
{
  "version": 1,
  "formations": [{
    "id": "build-phase",
    "label": "Build phase",
    "description": "Implementation and review desks",
    "seats": [
      {"seat":"modeler","function":"Own the domain model and integration.","role":"fixer","model":"sol"},
      {"seat":"labor-desk","function":"Perform mechanical chores for the modeler.","role":"laborer","assist":"modeler"}
    ]
  }]
}
```

Formation ids are lower-kebab. New seats and hires use the same lower-kebab member-name validation (letter-first, up to 48 characters, no repeated/trailing hyphens, reserved `lead` excluded). Maps may target any existing native DSH member name (including digit-first names, up to 64 characters), but mapping to a missing member is diagnostic-invalid; unmapped vacancies always use `name=seat`. `function` is a standing responsibility (one or two sentences); `role` names a member-capable role. Optional `model` is a **tier label**, never a provider/model route or numeric index; omission selects the role's preferred tier/current DSH default. Helper seats require `nestingMode:'helpers'`, consistently with hire's `assist` policy. `assist` names another **main seat in this formation**, not a task or external member. API diagnostics report stale roles/labels, duplicate seats, invalid helper targets/quotas and seat counts over either cap without crashing reads. Structural invalidity is rejected by staging. Catalog/settings-dependent invalidity may remain stored for later repair; plan/apply return `valid:false` and apply does not mutate any binding while diagnostics exist.

### UI API and audited writes

`GET /oh-my-bbff-team/api?action=formations&sessionId=<live-Lead-id>` returns:

```js
{
  ok:true, version:1,
  formations:[{id,label,description?,seats:[{seat,function,role,model?,assist?}],seatCount,diagnostics:[string]}],
  diagnostics:[string], activeFormation: string|null,
  roles:[{id,title,models:[{label?,provider,model,effort?,use,index:1}]}],
  dshCap:number|null, bbffCap:number|null, configuredCap:number|null,
  memberCapEditable:boolean, reason:string
}
```

`sessionId` is optional (omit for a global list with `activeFormation:null`); a supplied non-live id returns 404. No UI component is added in 0.5.0. Save/remove through the **existing** audited API, never a direct write:

```js
POST {action:'config-stage',change:{op:'put-formation',formation:{id,label,description?,seats}},reason,userInstruction,sessionId?}
POST {action:'config-stage',change:{op:'remove-formation',id},reason,userInstruction,sessionId?}
POST {action:'config-commit',id:staged.id}
POST {action:'config-revert',id:committedEntry.id,reason,userInstruction}
POST {action:'config-stage',change:{op:'patch-settings',settings:{memberNaming:'seat'}},reason,userInstruction}
```

`put-formation` upserts one **whole** definition, not a shallow patch; `remove-formation` requires an existing id. `config-read` adds `formations:{version:1,formations:[...]}` and `raw['formations.json']`; `replace-file` also accepts `formations.json`. Stage never changes live definitions. Commit, before snapshots, atomic changelog and exact-byte whole-file revert are shared with roles/settings. The existing `bbff_team_config_stage` accepts these same change objects and still requires the user's **verbatim** `user_instruction`. No other formation writer exists.

### One Lead-only tool

`bbff_team_formation` parameters are `{action:'list'|'plan'|'apply'|'draft',id?,map?,compact?,label?}`. `map` is `{seat:existingMemberName}`; `compact` is `'changed'` (default), `'all'` or `'none'`. `label`/optional `id` name a draft (defaults `team-draft` / `Current team`).

- **list**: `{version,formations:[{id,label,seatCount,diagnostics}],diagnostics,activeFormation,roles,...caps}`.
- **plan/apply** require `id`. Both report `{id,label,compact,valid,diagnostics,assignments,skipped,vacancies,unseated,activeFormation,memberCount,dshCap,bbffCap,dshHeadroom,bbffHeadroom,headroom,vacanciesExceedHeadroom}`. Each assignment is `{memberId,name,seat,function,role,model,assist,changed,compact,overrideRetained,legacyOverrideIgnored}`; `overrideRetained` is always null and retained only for compatibility. `legacyOverrideIgnored` reports whether deprecated override bytes were present; they never control the binding/catalog route. Skips are `{seat,name,reason}`. Vacancies are `{seat,mappedName,hire:{role,model?,name:seat,description:function,assist?},needsBrief:true}`. Unseated rows are `{name,memberId}` and remain untouched. Headroom counts **all durable members including failed ones**, against both observed DSH and BBFF caps; unknown capacity remains null.
- **plan** makes no writes, does not preflight or schedule compaction. **apply** preflights selected routes, rechecks idle state after awaits, binds only inactive members, and persists the Lead's active formation. Busy/provisioning/failed members are skipped, never interrupted. Returns `applied:boolean` plus `appliedMembers`, `compactions:[{name,memberId?,scheduled,error?}]` and `warnings:[string]` on success. Bindings and the active id persist atomically together; persistence failure rolls back memory and throws. Compaction/reinstall failures after seating are reported explicitly without pretending the seating did not occur. Apply refuses user-selected `off`/`orchestrator` modes (plan/list/draft remain read-only). A role or standing-function change schedules deferred compaction by default; tier-only or seat-only changes do not. `'all'` schedules every assigned idle member and `'none'` schedules none. Requests use the existing persisted maintenance mechanism and never cold-wake a member. Loaded idle members enter maintenance as soon as their idle window permits; unloaded members wait until their next normal manager-owned wake.
- Vacancies are **not hired**. Call `bbff_team_hire` with the returned arguments **plus a real prompt/brief** when appropriate; helper owners must already exist and hire's helpers-mode rules still apply. Apply may seat available desks despite vacancies exceeding headroom; the shortage is explicitly flagged.
- **draft** makes no write and returns `{formation,diagnostics,activeFormation,written:false}` built from current bindings, with `seat=name` and function fallback to DSH description. Unbound members are omitted with a diagnostic. Inspect/approve the draft, then stage it through the existing configuration tool/API.

`bbff_team_assign` now accepts optional `function` and preserves its seat. Roster rows add `seat`, `function` (binding first, immutable DSH description fallback), and `formation`; roster top level adds `activeFormation`. Member doctrine assembles one compact `seat · function · formation` line; Lead doctrine renders the active definition as seat → function and role/tier alongside the matching naming rule.
