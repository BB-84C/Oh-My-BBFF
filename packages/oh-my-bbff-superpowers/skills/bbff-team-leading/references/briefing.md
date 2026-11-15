# Briefing Protocol and Checklist

A brief must be fully self-contained. Dispatched workers do not see the parent conversation. Supervision stays with the Lead: never put a wait, poll, or time quantity in a worker brief. The worker starts something, reads it back once, and returns handles and evidence.

## Briefing Checklist
Every item must be explicitly covered (or justified why omitted):
1. **Goal and Why**: The core objective and purpose behind the task.
2. **Owner's Words Quoted**: Verbatim requirements to prevent drift and misunderstanding.
3. **Exact Input Paths**: Explicit absolute or workspace-relative file paths.
4. **Hard Constraints**: Non-negotiable boundaries (no DSH restart or process kill, no writes to drive roots or system temp tree, owner settings and model choices are read-only).
5. **Known Traps**: Why the previous attempt failed or pitfalls to avoid.
6. **Hidden Environment Facts**: Critical platform or runtime details the worker cannot discover itself.
7. **Feasible Deliverable**: Deliverable shape the role can produce (read-only roles deliver conclusions in their reply text only).
8. **Semantic Acceptance Evidence**: Concrete verification criteria rather than superficial signals.
9. **Report Shape & Status Label**: Expected closing format (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`).
10. **Write Scope & Artifacts Directory**: Explicit directory boundaries where modifications or artifacts are allowed.

## Example Comparison: Fix a Plugin Bug and Install Fix

### BAD Brief
"Fix the memory leak in the dreaming resident plugin, install the new package, and verify it works. Wait for 5 minutes after install to check if CPU is stable. If anything fails, restart DSH and retry. Report when done."

*Consequences of the BAD brief:*
- The worker hangs in a polling sleep wait inside its execution turn.
- It attempts unauthorized life-cycle operations (restarting DSH).
- It guesses target paths and mutates files outside its assigned scope.
- It overwrites owner-editable data or model tier selections.
- It reports a vague "done" with no verifiable hashes, CPU baselines, or diffs.

### GOOD Brief
"**Goal**: Fix unclosed event stream handles in `oh-my-bbff-memory` during compaction cycles.
**Owner Instruction**: 'Fix the memory leak when dreaming compacts.'
**Input Paths**: Target source `plugins/oh-my-bbff-memory/src/compaction.ts`.
**Constraints**: Do not restart DSH or kill any process. Drive roots and `%LOCALAPPDATA%\Temp` are strictly read-only. Owner settings in `~/.dsh/` and resident model choices are read-only. No sleep or poll loops.
**Known Trap**: Prior attempt hung waiting on unhandled stream completion. Ensure event listener cleanup in `finally`.
**Deliverable**: Code fix, unit test passing evidence, build artifact tarball under `.dsh/artifacts/<task>/`. Do not perform live installation; output `INSTALL-REQUEST` with file path, SHA-256, byte count, and rollback target.
**Report**: Return status (`DONE` or `BLOCKED`), changed files with before/after hashes, test run readback, and the exact `INSTALL-REQUEST` text."
