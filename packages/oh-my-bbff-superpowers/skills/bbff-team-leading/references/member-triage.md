# Member Triage Protocol

When a member is silent, failing, or terminates without a clear report, investigate with structured tools before touching logs or taking disruptive action. Do not guess and do not start shell investigations on session files when BBFF tools provide direct evidence.

## 1. Tool Investigation Order

Follow this exact sequence:

1. **`bbff_team_roster`**: Check the high-level member state by native name. The root is `lead`; descendants have paths such as `reviewer/checker`. Native `list_agents` reports names and turn activity, not completion or model evidence.
   - `busy` vs `idle`: Is the member actively executing a turn?
   - `lastTurnEnd.state`:
     - `ok`: a committed turn-end fact is available; inspect `lastTurnEnd.reasonKind` and the failure message to determine the outcome.
     - `pending`: the summary lookup is still loading in the background — not a failure; read again later.
     - `unavailable`: the lookup could not supply a committed fact; read `reason` without inferring task success or failure.
   - `context.percent`: Check context window usage.
2. **`bbff_team_activity`**: Examine recent committed events using `target` set to the member's native name or descendant path.
   - Inspect the default activity window first to see the newest events, timestamps, and tool/turn pairs.
   - Query with `outcome:"error"` to filter directly to failed tool results, error `turn-end` events, and `llm-retry` occurrences.
   - Use `kinds` to narrow the investigation (e.g., `["turn-end", "llm-retry", "tool-result"]`).
   - Use `before` with sequence numbers to page backward into history when earlier context is missing.
3. **Session Logs**: Resort to raw session logs only when `bbff_team_roster` and `bbff_team_activity` cannot explain the failure. Always read logs incrementally with bounded line offsets and limits; never dump or ingest an entire multi-megabyte log file.

## 2. Symptom Table

Thresholds listed below are starting defaults — tune to the task.

| State / Symptom | Evidence Pattern | Diagnosis | Action |
|---|---|---|---|
| Busy, recent event minutes old | `busy: true`, newest event timestamp is < 5–10 min ago | Normal execution latency under heavy reasoning or standard commands | Normal; keep waiting. |
| Busy, running long command | `busy: true`, last event is a `tool-call` for a known long task (build, test suite, packaging) | Command is actively executing inside its allotted budget | Normal; keep waiting until expected command duration elapses. |
| Busy, stalled without command | `busy: true`, no new event for ≥ 10 minutes, last event is not a known long command | Repeating command loop, huge file read blocking memory, stalled reasoning, or upstream 4xx/5xx network stall | Run `bbff_team_activity` with `kinds:["tool-result", "llm-retry"]`. Identify stalled call; inspect the call and steer with the verified correction; request a stop only for destructive cycling, out-of-scope writes, or other active harm, using an exposed and authorized control; otherwise report it. |
| Error `turn-end` with message | `lastTurnEnd.state: "ok"`, `reasonKind: "error"` or error `turn-end` event containing a descriptive failure string | Turn-end logic signaled a failure, or the last turn-end contained an error message | Read the failure message. Correct root cause (update brief, fix permission, or re-bind via `bbff_team_assign`), then steer the member. |
| Upstream error retries | ≥ 3 `llm-retry` events in activity naming upstream 429/500/503 or overload errors | Provider outage, service rate limit, or upstream degradation | Do not re-dispatch to the same provider. Report the outage to the owner; do not switch model providers independently. |
| Idle with no closing report | `busy: false`, last event is `turn-end` without a final deliverable report in task artifacts | Member finished turn early, hit turn limit, or stopped without final answer | Inspect the last `turn-end` and recent tool results in activity. Steer the member with a direct message requesting the missing report. |
| Idle with high context | `busy: false`, `context.percent` ≥ 75–80% | Context window nearing saturation; member risks failure on next large task | For a writable member, obtain its STATE artifact before compaction. For a read-only member, obtain the checkpoint in its reply and the Lead persists it. Request compaction only after the member is idle. |
| Running with high context | `busy: true`, `context.percent` ≥ 75–80% | Active computation in a large context | Never compact a running member. Wait until the member transitions to idle, have it persist state, then compact. |
| Runaway child background job | Member turn complete or stalled, background job continues consuming resources | Background job loop or hung subprocess | Locate `jobId` in activity, verify native ownership, and call `bbff_team_job_kill`. |

## 3. Response Matrix

Apply the least disruptive intervention that resolves the verified root cause:

- **Steer**: Use `bbff_team_steer` with `target: name`, or `send_message({agent: name, message})`, to send corrections, clarifications, or missing context. Running targets receive messages at the next step boundary; idle targets start a new turn. Task updates do neither; `wait_agent` wakes only for inbox input.
- **Persist STATE then Compact**: For a writable member, obtain its STATE artifact before compaction. For a read-only member, obtain the checkpoint in its reply and the Lead persists it. Request compaction only after the member is idle.
- **Repeat Dispatch**: Only re-dispatch with changed parameters or new information. Never re-dispatch an identical brief expecting a different outcome.
- **Higher Tier**: Escalate to a more capable model tier only after a specific diagnosis shows the task complexity exceeds the current tier's capabilities.
- **Interrupt Agent**: `interrupt_agent` is off by default in shipped presets. Only if it is actually exposed and authorized, use `interrupt_agent({agent: name})` for destructive loops, out-of-scope writes, or active harm; otherwise report the harm and request an available stop action. Do not assume steering cancels running work.
- **Job Kill**: Use `bbff_team_job_kill` for runaway background jobs associated with that member.
- **Report Outage**: When a provider suffers an upstream outage or severe degradation, report the situation to the owner. Do not switch models or providers without explicit owner instruction.

## 4. Worked Example: Historical Tier Label Invalidation

Current bindings use provider/model/effort identity, so renaming a display label alone does not cause this historical failure.

**Incident Facts:**
The owner renamed model-tier labels in the Settings UI (for example, renaming tier label `sol` to a new label). Members previously assigned to the old label string failed on their next turn request with:
`unknown model selector "sol"`
Because the turn failed during model resolution before turn execution, members left no closing report and appeared silently broken.

**Anti-Pattern (Wrong Order):**
The Lead used PowerShell commands (`pwsh`) to search and read raw session log files on disk. This was slow, parsed unformatted JSON lines, bypassed team tooling, and delayed diagnosis.

**Correct Triage Order:**
1. Call `bbff_team_roster`: Observe that the member is idle, and the roster shows `lastTurnEnd.state: "ok"` with `lastTurnEnd.reasonKind: "error"` and the failure message.
2. Call `bbff_team_activity` with `target: "<member-name>"` and `outcome: "error"`: The single call returns the failing `turn-end` event containing the exact error: `unknown model selector "sol"`. Diagnosis takes seconds.
3. **Immediate Fix**: Re-bind each affected member using `bbff_team_assign` specifying a tier currently listed in the role's configuration (either a valid 1-based index or the updated tier label).
4. **Class Fix**: Prevent future drift by referencing model bindings through stable provider/model/effort identity rather than mutable UI display labels.
