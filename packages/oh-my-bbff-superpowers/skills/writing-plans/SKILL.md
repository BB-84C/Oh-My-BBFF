---
name: writing-plans
description: Use when multi-round implementation, context compaction, team delegation, or worker handoff requires a durable execution contract, or when executing a written plan inline.
---

# Writing and Executing Durable Plans

## Purpose

A plan is a durable execution contract for work that spans multiple rounds,
context compaction, or handoff between the main agent and workers. It preserves
what a future implementer cannot safely reconstruct from a task title alone:

- user intent and the real product, business, or operational behavior;
- architecture and module relationships;
- exact constraints, interfaces, values, compatibility boundaries, and files;
- necessary technical and code details;
- dependency and construction order;
- semantic acceptance scenarios, evidence, and readback;
- repository-operation preferences; and
- recovery state needed to resume after interruption.

Assume the implementer is capable but starts with no conversation context. Give
them enough specific information to construct and verify the intended result,
not a generic principles document or a micro-step transcript.

## Structure

Every plan must start with a comprehensive header that establishes the boundaries and context for the work. This header is the single source of truth for any implementer picking up the task.

- Goal: A concise, unambiguous statement of the primary objective. This should focus on the desired end-state rather than the steps to get there.
- Stable References: Pointers to persistent documentation, architectural specifications, or shared memory files that ground this work. Avoid ephemeral references; link to durable project assets.
- Repository Operations: Record existing commit, push, branch, and worktree preferences after inspecting the current context, plus required filesystem setup or cleanup. When a preference is absent and changes execution, ask once; never push without clear authority.
- Recovery State: The current status or checkpoint for resuming interrupted tasks. This ensures that if a session is terminated or a handoff occurs, the next agent can resume without losing context or repeating work.

### Grounding and Constraints

Before drafting tasks, ground the plan in the actual codebase and environment.
- Do not assume file structures or APIs; verify them first.
- Negative constraints (what *not* to do) are not substitutes for positive design decisions.
- If a design decision is still open or blocked, mark it explicitly as `OPEN` or `BLOCKER` in the header rather than guessing or leaving it implicit.

## Task Specifications

Tasks must represent meaningful semantic deliverables, not arbitrary time boxes or micro-steps. A capable zero-context implementer should be able to read a single task specification and understand both what to build and how to verify it.

For every task, you must explicitly define the following fields:

- Project Meaning: Explain why this task matters to the overall goal. Connect the deliverable to the user's intent or system capability.
- Architecture Relationship: Describe how this task fits into the existing system structure. Identify which modules, services, or boundaries are touched and how they interact.
- Technical Contract: Define the exact interface, API signatures, data structures, or state transitions expected. Be precise enough that downstream tasks can rely on this contract.
- Dependencies: List all prerequisites, including other tasks in the plan, external libraries, or specific environment states that must exist before starting.
- Implementation Notes: Provide specific constraints, patterns to follow, or pitfalls to avoid. Reference existing code idioms where applicable.
- Semantic Acceptance: Define concrete, falsifiable criteria for success. This is not just "tests pass," but a verification that the deliverable actually works as intended in its target scenario.
- Recovery Checkpoint: Specify the exact state to check before starting and the state to record upon completion. This allows any interrupted execution to verify whether the task is partially done, complete, or needs a clean reset.

## Six Self-Review Checks

Before finalizing the plan or beginning execution, run through these six checks to ensure the contract is sound:

1. Goal Clarity: Is the primary goal clear, self-contained, and independent of conversational history?
2. Positive Design: Have all negative constraints been paired with positive design choices, or else marked explicitly as `OPEN` / `BLOCKER` decisions?
3. Semantic Deliverables: Is every task a meaningful semantic deliverable rather than a mechanical chore or a vague time box?
4. Verifiable Contracts: Are the technical contracts specific enough that an implementer knows the exact inputs, outputs, and side effects?
5. Unambiguous Recovery: Could a fresh agent read the Recovery State and Recovery Checkpoints and know exactly where to resume without guessing?
6. Falsifiable Acceptance: Does every task have semantic acceptance criteria that would actually fail if the implementation were broken or incomplete?

## Execution Choice

Once the plan is written and reviewed, the execution path depends on the operating environment:

- In a BBFF Team: If the current session is the Lead of a BBFF Team, do not ask the user whether to run inline or via subagents. Instead, place the plan's tasks on the Team task board: create one unowned pending task per semantic deliverable with `team_task_create` (acceptance criteria in `description`, write scopes in `write_scopes`, dependencies in `blocked_by`). Assign ownership with `team_task_update` using `action: "reassign"`, the `owner`'s native name (`lead` for the root), and the latest `expected_revision`, or have the delegated member claim the task. Then delegate the work to the appropriate team members. Task-board changes do not wake or start agents; send `send_message({agent: name, message})` when the owner must act.
- Outside a Team: If operating as a standalone session outside a BBFF Team, ask the user to choose between delegated execution (via subagents) and inline execution. Present your recommended approach first, along with a brief rationale based on the plan's complexity and task independence.

## Executing a plan inline (outside a Team)

When executing a plan inline outside of a managed Team, treat the plan as a living contract and follow this discipline:

1. Read Before Acting: Always read both the plan file and the current workspace state before making changes. Never rely on memory alone when resuming or stepping into a new deliverable.
2. Execute by Semantic Deliverable: Work through the plan one deliverable at a time. Complete the implementation, run its semantic acceptance checks, and update the recovery checkpoint before moving to the next task.
3. Adapt Stale Steps Transparently: Real codebases surface surprises. If a planned step is stale or contradicted by reality, adapt the approach, update the plan file, and record why the change was necessary.
4. Escalate Only Load-Bearing Blockers: Keep moving through ordinary implementation friction. Stop and ask the user only when you hit a load-bearing blocker or genuine authority ambiguity that changes intent, scope, or safety.
5. Use Extra Workflow Proportionally: Bring in helper subagents, independent reviews, or extra verification loops only when they materially improve confidence or speed. Avoid ceremony for routine steps.
6. Close Out with Evidence: When the plan is complete, report the capability delivered, the architectural relationships established, the concrete verification evidence gathered, and any remaining risks or open items.

## Recovery and Persistence

Recovery state lives directly in the plan file and in the task's `STATE.md` or handoff file within the artifacts directory.
- Do not rely on git-only history, commit messages, or ephemeral session transcripts as the sole recovery mechanism.
- Update the plan's Recovery State header and the completed task's Recovery Checkpoint after each deliverable settles.
- If a session must pause or hand off mid-task, record the exact in-flight state, what has been verified so far, and the immediate next step so a zero-context successor can continue without redoing completed work.

## Location

Default plan location: 
- The project's own documentation directory (if it exists).
- Otherwise, the task's artifacts directory: `.dsh/artifacts/<task>/`.
Do not hardcode a specific plan directory like `docs/superpowers/plans/`.

## Strategic Planning

Planning is the process of translating intent into verifiable reality. It forces the Lead to resolve ambiguity early, articulate the desired end-state, and identify the gaps between current capability and the objective.

### The Lead's Responsibility
The Lead must define the "what" and the "why" with total clarity. The implementer (worker) should never have to guess the intent. If the Lead cannot articulate the semantic goal, they have not yet planned the task.

### Managing Open Decisions
A plan is not a static document; it is a repository of decisions. Mark all unresolved choices clearly:
- `OPEN`: Decisions that the worker can make based on local evidence.
- `BLOCKER`: Ambiguities that *only* the user or higher-level authority can resolve.

## Team Task Delegation

In a BBFF Team, the Lead is the force multiplier. The Team task board is the central registry for work.

- Task Creation: Use `team_task_create` for each semantic deliverable.
- Assignment: Map tasks to members based on their role, capacity, and current workload.
- Ownership: Each task must have a single assigned owner. If a task requires multiple roles, split it into smaller tasks that allow for independent ownership and verification.
- Dependencies: Explicitly define task chains. A task must not be in `in_progress` until its dependencies are verified and accepted.

## Verification and Proof

The Lead must define the "proof" before the work begins.
- Production Scenario: What does success look like in the real environment?
- Artifact Inspection: What readback artifact, log, or state transition proves that the task is semantically correct?
- Independent Validation: When the outcome is high-stakes or the path is complex, delegate review to the `oracle` role.

## Maintaining Momentum

Implementation often hits friction. The plan must distinguish between:
- Routine Friction: Easily resolved by the worker.
- Load-Bearing Blockers: Issues that require the Lead to rethink the plan or consult the user.

Always document the pivot. If the plan changes, update the document immediately. An outdated plan is more dangerous than no plan at all.

## Professional Standards

Adherence to these standards ensures the plan is useful to anyone:
- Brevity: Do not write essays where specifications suffice.
- Precision: Use schemas, exact values, and absolute paths.
- Verification: Ensure every task can be audited by someone else using the plan alone.

## Plan Evolution

A plan is a living artifact.
1. Draft phase: Focus on the Goal, Stable References, and Semantic Acceptance.
2. Review phase: Lead and implementer (or peer) review the Task Specifications.
3. Execution phase: Continuous updates to the Recovery Checkpoint.
4. Closeout phase: Final readback of the deliverable and cleanup of the plan and artifacts.

## Common Pitfalls

- Over-Planning: Creating tasks that are too small and require excessive management.
- Under-Planning: Leaving the implementation strategy to chance, leading to rework.
- Assumption Decay: Treating old specs as current without verifying them.
- Ignoring Boundaries: Starting work without verifying access to the required modules or services.
- Ambiguous Handoffs: Resuming work without understanding the previous agent's internal state.

By strictly adhering to these guidelines, you turn planning from a procedural requirement into a competitive advantage, ensuring that work is predictable, auditable, and resilient to failure.
