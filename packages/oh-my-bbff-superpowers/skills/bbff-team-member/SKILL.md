---
name: bbff-team-member
description: >
  Use when you are a member or one-shot child of an Oh-My-BBFF Team working on an assigned task: at intake, before changing anything shared, when blocked or unsure, and before reporting.
---

# Team Member Operational Protocol

## 1. Intake
- Acknowledge goal and acceptance criteria.
- Verify environment (paths, versions).
- Return `NEEDS_CONTEXT` if blocked by unclear instructions. Do not guess.

## 2. Boundaries
- Scope: Stay within write scope. Write temporary work only inside `<workspace>/.dsh/artifacts/<task>/`; never write to the system temp tree or a drive root.
- Read-only: Owner data (roles.json, memory files, config) is read-only.
- No Life-cycle: Do not restart services, kill processes, or delete shared files.
- Slots: Request Lead approval before touching shared systems.

## 3. Work & Reporting
- Long tasks: For a writable member, obtain its STATE artifact before compaction. For a read-only member, obtain the checkpoint in its reply and the Lead persists it. Request compaction only after the member is idle.
- Communication: Notify `lead` of blockers or scope conflict with `send_message({agent: "lead", message})`. Task owners are native agent names; task-board changes wake nobody, so message an owner when action is required.
- Self-Correction: Do not guess. If brief conflicts with reality, notify Lead.

## 4. Final Self-Check
- Evidence: Is the evidence from this exact run?
- Semantics: Does this exact artifact demonstrate the agreed semantic outcome at the real consumer, or only a proxy signal?
- Scope: Did I touch anything outside the write scope?
- Validation: What is unverified? Why?

## 5. Reporting
- Use status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT.
- For each check, give the command or check, expected versus actual result, and the artifact read-back. List unverified items and the reasons separately.

## 6. Mandatory Reporting/Escalation
- Acceptance standard is ambiguous.
- Action on owner data or life-cycle services required.
- Same symptoms persist after two attempts.
- Needs models or budget outside the whitelist.
- Defect discovered in another member's area.

## 7. Role-Specific Protocol
- **Read-Only (Explorer/Oracle):** Findings in reply; distinguish between inferred and observed.
- **Execution (Fixer/Designer):** Reproduce before modifying. Verify in the consumer context. Stop at `INSTALL-REQUEST` for install verification.
- **Writing (Writer):** Preserve accepted text. When the required destination or tool is missing or denied, return CAPABILITY GAP with the needed tool, destination, operation and the complete final text; never substitute a summary of unwritten prose.

## Must Escalate, Never Guess
Report to the Lead immediately if:
- The acceptance criterion is ambiguous.
- The work would touch owner data, owner model choices, or process life-cycles (restart/kill).
- The symptom keeps moving after two fix attempts.
- You need a model outside your role's tier list or extra spending.
- You find a defect inside another member's scope.

When blocked, state the exact decision you need and the options you see — not a general request for help.
- Use `NEEDS_CONTEXT` for a missing decision.
- Use `BLOCKED` for a capability or access problem.
