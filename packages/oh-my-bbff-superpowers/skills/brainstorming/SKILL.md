---
name: brainstorming
description: Use for genuinely open, load-bearing product or architecture decisions after inspecting the project.
---

# Resolve Open Design Decisions

## When this workflow helps

Use brainstorming when product behavior, architecture, interaction design, a
contract, or another load-bearing choice remains genuinely open after inspecting
the project. The goal is to resolve uncertainty that would otherwise change the
construction path or user-visible result.

Do not create a separate design ceremony for a specified local change with one
reasonable path. Explain why that path is determined, then implement directly.

## Ground the decision first

1. Inspect the relevant project structure, existing behavior, constraints, and
   durable instructions before asking the user to choose.
2. Identify only the missing information that affects the decision. Bundle
   related questions when one answer depends on the others; avoid a question
   sequence that does not change the outcome.
3. Compare approaches only when multiple materially viable approaches remain
   after investigation. Do not invent weak alternatives to reach a count.
4. If one path remains, recommend it plainly and explain what made it
   determined.

## Explain at the right level

Explain a real choice through the overall project architecture, the logical
relationship between modules, construction consequences, and the product or
operational behavior affected. Use an accessible analogy when it clarifies the
relationship. Do not lead with code symbols unless the user asks for code detail
or an identifier is needed to explain a blocker.

For an unresolved load-bearing decision, present one coherent approval request
that covers the decision, trade-offs, and consequences. Do not split a single
approval into repeated process gates. In a BBFF Team the Lead brings the open
decision to the owner; members return the decision to the Lead with
`NEEDS_CONTEXT` instead of choosing for the owner.

## Repository operations and durable artifacts

Before recommending or taking commit, push, branch, or worktree actions, inspect
the current context for an existing preference. Ask once when the preference is
absent and the choice changes the workflow. Never push without clear authority.

Write a design document when it provides durable value for multi-step execution,
handoff, or future maintenance. A brief determined change does not need one.

## After the decision

After approval, choose the lightest suitable execution path for the task shape:

- direct implementation for a bounded determined change;
- a focused plan when dependencies or durable handoff need one; or
- delegated execution when bounded worker context improves the work.

Keep the decision connected to the product outcome during implementation rather
than turning the design into a second set of ceremony requirements.

