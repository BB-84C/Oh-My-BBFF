---
name: test-driven-development
description: Consult before implementing an observable behavior change when a meaningful automated test seam exists; use proportional red-green evidence.
---

# Test-Driven Development

## Purpose

TDD obtains discriminating evidence: a test should demonstrate that it detects
the missing or broken behavior, not merely pass against current implementation.
Red-green is the preferred foundation for behavior changes with a meaningful
automated test seam; it is not a reason to discard useful existing code or
mistake literal ordering for correctness.

## Choose the validation path

1. Identify the real product, business, or operational semantic behavior that
   the change must produce, including meaningful failure or boundary cases.
2. If it has a meaningful automated test seam, write or refine a focused test
   and obtain counterfactual evidence that the test fails for the intended
   missing or broken behavior. Then implement or repair the behavior and verify
   the test passes.
3. When an implementation already exists, preserve it while constructing a
   regression test and counterfactual evidence. Use a pre-fix reproduction,
   controlled fixture, focused mutation, or another honest demonstration that
   the assertion distinguishes the defect; do not delete working code solely to
   reconstruct an order of operations.
4. For configuration, generated output, documentation, or an existing repair
   without a useful automated seam, choose the strongest suitable validation:
   parse and read back configuration, inspect the generated artifact, render and
   exercise the documented workflow, or run the narrow production-shaped check.

## Red-green where it applies

For a meaningful automated seam:

- **Red:** state expected behavior, run the focused test, and inspect why it
  fails. An infrastructure error is not evidence of the intended defect.
- **Green:** implement the smallest behavior change that satisfies the scenario,
  then rerun the focused test.
- **Refactor:** improve code or tests only while preserving their ability to
  distinguish behavior. Add cases for a different real risk, not a count.

Unit tests, compilation, linting, and type checks are support signals. Pair
them with semantic behavior evidence appropriate to the task: rendered visual
and interaction checks for frontend work, restart/readback for persistence,
actual arguments and resulting state for APIs or automation, and representative
consumer artifacts for compatibility work. When writing or reviewing mocks, see
[testing-anti-patterns.md](<testing-anti-patterns.md>).

## Evidence record

Record the scenario, counterfactual or red evidence where available, the green
result, and the semantic readback that supports the completion claim. If the
test cannot prove the user-relevant behavior by itself, state what readback
closes that gap.

## Red flags

- A test passes but no one knows whether it could have caught the defect.
- A green unit suite substitutes for a user-visible, persistence, operational,
  or compatibility outcome that was never exercised.
- Deleting or rewriting useful implementation only to satisfy a procedural
  ordering rule.
- Treating configuration, generated artifacts, documentation, or repairs as
  untestable when a stronger suitable validation path exists.
