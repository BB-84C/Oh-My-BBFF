---
name: independent-review
description: Use when deciding whether a change needs independent review, when requesting a review (in a BBFF Team, dispatching the oracle role), or when evaluating review findings you received before acting on them.
---

# Independent Review

## Requesting Review

Independent review supplies a perspective that implementation reports cannot. Place it where it changes confidence: user-visible behavior, API or compatibility boundaries, cross-module logic, security, data integrity, permissions, or concurrency — and as a final whole-change review for substantive work. Short changes in those risk areas still get a review. Low-risk mechanical work that repeats an already-reviewed pattern may be grouped or verified by its acceptance evidence instead. Do not add a review merely to find style issues or to show process.

### How to request
Supply the smallest durable package:
1. Requirement and binding constraints.
2. The implementer's report as evidence to inspect.
3. The exact changed files or diff package.
4. Scenario and acceptance criteria.
5. Named risks.

### Reviewer Role
With Oh-My-BBFF Team installed, the reviewer is the `oracle` role. Dispatch it using `bbff_team_dispatch`, which works even when the root session's Use Agent Teams switch is off. Continue the returned native name with `send_message({agent: name, message})`. Instruct it to report only material findings and not to accumulate new requirements each round.

Reviewers are read-only and return evidence-backed findings with location and severity tied to impact. Fix Critical/Important findings before relying on the behavior. Request another review only when the fix changes semantic, risk, or integration confidence.

## Receiving Review

Review comments are evidence to evaluate, not orders.

1. Verify: Check each comment against the code, requirements, and current behavior.
2. Evaluate: Accept or reject each finding with a reason. Do not forward the entire list as a to-do list.
3. Clarify: Ask for clarification only when ambiguity changes intent, coupling, or safety.
4. Proceed: Independent clear items may proceed.
5. Push Back: Use evidence to push back when a finding conflicts with contracts, compatibility, architecture, or real usage.

---
### Reviewer Prompt Template
Use [reviewer-prompt.md](reviewer-prompt.md) as the core of the reviewer's brief; add the package listed above.
