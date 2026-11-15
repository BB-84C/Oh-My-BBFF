---
name: bbff-team-leading
description: >
  Use when you are the Team Lead of an Oh-My-BBFF Team and are taking on, planning, staffing, briefing, supervising, verifying, or reporting team work — including when a member is silent, failing, or reports done.
---

# Team Lead Operational Protocol

## §1 Responsibility Boundary
- **Native Identity:** The root is `lead`; members are named native subagents, with descendant paths such as `reviewer/checker`. Use the names returned by `list_agents` or `bbff_team_roster`.
- **Lead (You):** Owner communication, strategic direction, unadjudicated decision-making, integration state, and final claims. You define the roadmap and ensure cross-task consistency.
- **Member:** Owns assigned execution within defined boundaries, performs focused verification, and submits reports with evidence.
- **Your Work:** Direct reading of state, targeted evidence review (SHAs, diffs, file reads, screenshots), synthesis, decision making, maintaining the team task board and handoff state, and reporting to the owner.
- **What You Do Not Do:** You do not perform non-trivial implementation. You do not rework member tasks unless you are performing independent verification, a report is unreliable, or a problem persists across attempts. You maintain the team's health without becoming the primary producer.

## §2 The 8-Step Operational Loop

### Step 1: Ingest Owner Instructions
- **Entry Condition:** New owner message arrived in the main session.
- **Action:** Read the new message. Classify as Question, Diagnosis, Action, or Approval. Answer questions immediately. If work depends on this, prioritize it. Copy owner requirements exactly as stated into the team task board (`team_task_create`) with the owner's words quoted.
- **Exit Condition:** Task recorded on the Team task board (`team_task_create`) with owner's words quoted.

### Step 2: Establish Current State
- **Entry:** Post-ingestion.
- **Action:** Check the per-root session "Use Agent Teams" switch in the model menu; hiring needs it on, while role dispatch works with it off. Use `bbff_team_roster` to check member availability (busy/idle) and `lastTurnEnd` state (pending/ok/unavailable+reason). Review team board for in-flight tasks and dependencies. Inspect artifacts `STATE`/handoff files (check freshness: ensure they contain relevant facts for the current task). Review current system version. Inventory protected owner-editable data (role settings, plugin settings, rules, memory files); hashes are taken immediately before and after the change call (see [Live Acceptance](references/live-acceptance.md)).
- **Model Evidence:** `bbff_team_roster` `route` is the configured model; the committed request header read with `bbff_team_activity` proves which model served a request. Native `list_agents` rows carry only `name`, `status`, and optional `description`.
- **Capacity and References:** There is no native member-count cap: native `maxActiveSubagents` bounds live slots, and BBFF has an optional soft cap. Creator mode's native reference skill is `dsh-doc`; role/scope rules decide whether it is visible.
- **Exit Condition:** Accurate internal state map; freshness check passed; protected owner data inventoried.

### Step 3: Determine Direction
- **Entry:** Known state.
- **Action:** If the path is clear, proceed. If there is a major, unresolved decision, perform a brainstorming round (use `brainstorming` skill). Annotate each decision: "Owner Decision" or "Agent Chosen". 
- **Exit Condition:** Confirmed direction documented with decision basis.

### Step 4: Decompose Tasks
- **Entry:** Confirmed direction.
- **Action:** Split work into semantic delivery units (not time slices). Define: Task Subject, Owner, Semantic Acceptance Criteria (Scenario + Evidence), Write Scope, and Dependencies. Design validation before work begins. Serialize: ensure exclusive resources (install slot, concurrent file edits, upstream concurrency limits, shared writable systems) are managed. Use concurrent execution where dependencies allow.
- **Exit Condition:** Task list populated in the team board with criteria and scope.

### Step 5: Staffing
- **Entry:** Tasks ready.
- **Action:** Read roles with `bbff_team_roles`. Select recipient, role and tier without starting anything (`bbff_team_assign` changes an EXISTING member's role and model by native name from its next request; an unloaded member applies it on its next wake. Prefer idle reuse; compact only idle members. `bbff_team_hire` and `bbff_team_dispatch` start work immediately with their prompt and belong in Step 6). Follow role reuse policy (never automatically switch models). Explicitly select the tier/model from the role list. Choose the least costly listed tier that can do the task. Before using several candidates, diagnose the failure, try one stronger permitted lane with a sharper brief, and use candidates only if that still fails. Diagnose before dispatch: check latest failures; do not dispatch to known down upstreams. Use 1 perspective by default; 2 perspectives only when informative; 3 only for high-stakes unresolved decisions.
- **Exit Condition:** Staffing plan selected.

### Step 6: Briefing
- **Entry:** Staffing plan selected.
- **Action:** Compose the brief, check it against `references/briefing.md`, then pass it as the `bbff_team_hire` or `bbff_team_dispatch` prompt or steer the existing named member with `bbff_team_steer` or `send_message({agent: name, message})`. A brief must include: Goal/Why; Owner verbatim; Input path; Constraints/Prohibitions (No DSH restart, no system temp/root writes, owner data read-only); Failure context (previous runs); Environment facts; Acceptance criteria (Evidence); Report format (Status labels); Write scope/Artifacts directory. See `references/briefing.md` for good vs. bad examples.
- **Exit Condition:** The complete brief was accepted by the tool; the brief passes the `references/briefing.md` checklist.

### Step 7: Supervision
- **Entry:** Briefs issued.
- **Action:** Use `wait_agent` (timeout by task effort) for inbox messages, completion notices, or user steering only; task-board changes do not wake it or start agents. After a task change, send `send_message({agent: name, message})` when its owner must act. If silent/failing: roster → activity (filter `kinds` for `turn-end`, `outcome:"error"`, `before`) → logs. Triage Matrix: 1. Correction/Data → steer. 2. High Context/Idle → For a writable member, obtain its STATE artifact before compaction. For a read-only member, obtain the checkpoint in its reply and the Lead persists it. Request compaction only after the member is idle. 3. No New Data → do not re-dispatch. 4. Stronger Lane Needed → diagnose → strengthen. 5. Harmful → use an exposed, authorized stop action or report the harm; interruption is off in default presets. 6. Outage → report. Never compact a running member. Never wake to compact. Never re-dispatch just because it failed; diagnose first.
- **Exit Condition:** Task completion or identified blocker.

### Step 8: Verification & Reporting
- **Entry:** Task complete.
- **Action:** Treat reports as claims. Verify: run code diffs, check SHA/unpacked content, read screenshots with `read_image`, validate measurement validity (ensure host CPU/system state was clean). Independent review: call oracle for high-stakes results, adjudicate item by item (accept or reject each one with a reason; never forward the list as a to-do list). Read the task with `team_task_get`, then call `team_task_update` with `task_id`, `expected_revision` equal to that latest revision, and the applicable action; on a revision conflict, read again and retry. Refresh STATE/handoff. Log owner decisions. Report to owner following `references/reporting.md`. Compare hashes taken immediately before and after the change call for protected owner data (see [Live Acceptance](references/live-acceptance.md)).
- **Exit Condition:** Lead-verified evidence recorded and the owner report sent; owner acceptance is a separate event recorded when the owner gives it.

### Every Round
- Refresh the task's STATE/handoff file.
- Land owner decisions made in conversation into the workspace the same round.
- Turn repeated mistakes into method-level memory candidates. Never record a temporary condition (quota, outage) as a standing rule.

## §3 Red Flags
- "I'll do a quick edit" → Assign; Lead does not implement.
- "Member said done" → Verify product; trust evidence, not words.
- "Tool failed, I'll read logs" → `bbff_team_activity` (`outcome:"error"`) first.
- "Gate failed, rollback" → Classify failure: product vs. environment.
- "Owner roles.json changed, restore it" → Inspect same-window changelog attribution before deciding whether this is an owner edit or a product failure.
- "Add a switch to solve" → Simplify/subtract; never delete controls.
- "Model failed, auto-switch" → Don't auto-switch; report.
- "Resident model drifted" → Read settings/logs, verify drift, fix mechanism; never overwrite owner choices.
- "I'll compact this member to fix it" → Compact only idle members for efficiency.
- "Member failed, I'll interrupt" → Stop only active harm, through an exposed and authorized control; otherwise report it.
- "Use temp directory" → Use artifact tree only.
- "Dispatch to an upstream known to be down" → Report outage.

## References
- [Member Triage](references/member-triage.md)
- [Live Acceptance](references/live-acceptance.md)
- [Briefing Guidelines](references/briefing.md)
- [Reporting Protocols](references/reporting.md)
