---
name: systematic-debugging
description: Consult before attempting a fix when root cause or behavior is unclear, failures repeat, components interact, or guessing would be unsafe, including failing or silent agent and team runs in DSH.
---

# Systematic Debugging

Root cause, evidence, reproduction, and semantic verification prevent plausible
patches from becoming recurring failures. Use this workflow when root cause or
behavior is genuinely unclear, a failure repeats, components cross a boundary, or
risk makes a guess unsafe. A known, determined small repair may proceed directly
with suitable verification.

## Investigation lenses

The following are composable investigation lenses, not mandatory consecutive
phases: observe/reproduce the meaningful symptom; inspect recent state and
relevant boundaries; compare a working analogue; trace input or control flow;
form a single hypothesis; run the smallest discriminating experiment. Select the
lenses that reduce the uncertainty at hand and preserve the evidence.

Use a failing automated test when there is a meaningful seam. Otherwise use the
strongest suitable reproduction, counterfactual, or readback. After a root fix,
run semantic verification of the affected behavior and relevant regressions.

## Evidence order for agent and team failures in DSH

For a failing or silent agent, inspect evidence in this order: first read the
team tools as Lead (`bbff_team_roster` for the named member's last turn state
and its reason, then `bbff_team_activity` with `target` set to its native name
or descendant path and `outcome:"error"` or `kinds` such as `turn-end` and
`llm-retry`); members return evidence to `lead` with
`send_message({agent: "lead", message})` when those Lead-only tools are unavailable.
Then inspect session events, and read session logs
last and incrementally (bounded reads, never a whole large log). Upstream errors
in `llm-retry` (4xx/5xx, stream ended, transport) are provider problems: do not
change the agent's model yourself; report them.

## Escalation and containment

When evidence shows shared state, hidden coupling, or each attempted fix moves
the symptom, reassess the architecture before stacking more local changes. This
is evidence-driven, not a fixed failure count.

A clearly labeled containment or mitigation may reduce harm while root cause is
still under investigation. It must state its limitation and must not be
presented as a root fix.

## Supporting references

- [root-cause-tracing.md](<root-cause-tracing.md>) for tracing a deep symptom to its original trigger.
- [defense-in-depth.md](<defense-in-depth.md>) for safeguards across distinct trust boundaries and failure modes.
- [condition-based-waiting.md](<condition-based-waiting.md>) for replacing arbitrary timing with observed conditions.

