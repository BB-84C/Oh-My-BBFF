---
name: verification-before-completion
description: Consult before making or accepting a substantive completion claim; require current trustworthy evidence and semantic acceptance.
---

# Verification Before Completion

## Purpose

User-relevant correctness and completion claims require current trustworthy
evidence. Decide what evidence is needed from the claimed capability and risk,
then compare it internally against semantic acceptance; do not turn an internal
checklist into the user's report. When acting as a Team Lead, treat a member's
report as a claim to be checked rather than as evidence itself (see
[references/bbff-evidence.md](<references/bbff-evidence.md>)).

## Judge evidence freshness

Before relying on preserved or reported evidence, reason about what state
changed after it was produced: source, dependencies, configuration, generated
artifacts, environment, data, deployment boundary, or the scenario itself.
Evidence is stale when a relevant change could invalidate its meaning, not
merely because time passed.

When freshness is uncertain, run or request a focused probe that tests the
disputed state. Use that result to decide whether preserved evidence remains
trustworthy or a broader test, build, readback, or production-shaped scenario
must be regenerated. Match verification breadth to the breadth and risk of the
claim.

## Verify semantic acceptance

Identify the real scenario and observable result before declaring success:

- frontend work: inspect rendered visual state and exercise relevant interaction;
- persistence: save, restart or reload, and read back intended state;
- API, CLI, or automation: exercise meaningful arguments and failure paths, then
  inspect resulting state rather than only a response envelope;
- benchmarks or agents: inspect actual task performance, abnormal behavior, and
  behavioral trajectory rather than an aggregate score alone; and
- compatibility or migration: exercise a representative existing consumer or
  artifact across the promised boundary.

Unit tests, compilation, linting, and static checks support these claims but do
not replace semantic acceptance. If evidence cannot reach the user-relevant
scenario, report the limitation plainly instead of overstating completion.

## Closeout reporting

Before drafting the closeout, inspect project materials for defined consumers,
operational context, and module relationships. Do not claim there are no dependent
modules or no remaining risk until that investigation supports the statement.
Absent evidence is not evidence of no dependency or risk.

Lead the closeout with the capability or product behavior now working. Then state:

1. the project architecture or operational logic learned;
2. how affected modules and boundaries relate;
3. the current construction stage and completed milestone;
4. meaningful behavioral evidence, including real UX interaction, benchmark
   agent behavior, or observed abnormal behavior when relevant; and
5. remaining blockers, risks, or the next meaningful milestone.

Do not lead with filenames, function names, variables, tool calls, or test
inventories unless the user requests engineering detail or an identifier is
needed to explain a real blocker. This is not a reason to remove useful detail:
state concrete business, product, operational, semantic, and architectural
evidence where it explains the outcome.

## Before the claim

Confirm internally that available current trustworthy evidence supports the
specific claim, material semantic acceptance scenarios have been exercised, and
any remaining gap is stated in the closeout. A team member's report or a green
support signal alone is not a substitute for that judgment.
