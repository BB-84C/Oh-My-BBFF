# Root Cause Tracing

Trace backward from a deep symptom when the original trigger is unclear: record
the observed failure, identify its immediate cause, then follow the relevant
value, state, or call boundary until evidence identifies the source or a real
unknown. Prefer the strongest suitable evidence: a focused reproduction, stack
trace, boundary log, bisection, or readback.

Fix at the source when that is known. If an urgent containment is needed first,
label it as containment, document what it does not solve, and keep the root-cause
investigation open. A boundary guard is useful when it addresses a distinct
failure mode; it is not a substitute for evidence about the original trigger.

Example: an empty directory reaches a deep `git init`. Trace the value through
the workspace call chain to the test/setup that supplied it, fix that source, and
verify the intended workspace behavior. A guard rejecting dangerous directories
can contain collateral damage while the source is investigated.
