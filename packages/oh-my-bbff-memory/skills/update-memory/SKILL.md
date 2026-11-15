---
name: update-memory
description: Use when the agent identifies a recurring mistake, a user-issued correction implying a stable preference, or any moment a lesson should be sedimented into persistent memory (global $DSH_HOME/memory and $DSH_HOME/AGENTS.md; workspace .dsh/memory and AGENTS.local.md). Auto-trigger when the same kind of failure occurs twice in a session, or when the user explicitly says remember this / always do X / never do Y / 你应该记住 / 下次不许 X.
whenToUse: A correction, repeated failure, or explicit remember instruction should become durable memory or a standing instruction.
---

# Update Memory (DSH)

## Overview

Two scopes, two file kinds:

- **Global**: memory entries in `$DSH_HOME/memory/*.md`, standing instructions in `$DSH_HOME/AGENTS.md`.
- **Workspace**: memory entries in `<cwd>/.dsh/memory/*.md`, workspace instructions in `<cwd>/AGENTS.local.md`
  (the tracked workspace `AGENTS.md` is never written — it may be a collaborator's file).

Memory settings select full or routed injection; the card reports the effective mode and actual byte budget. Native instruction files load through the harness instruction chain, with loader evidence shown separately. Both are durable, so an edit is a standing decision, not a note.

Core rule: every edit is evidence-backed, routed to exactly one target, checked against existing entries for
duplication/contradiction, and **previewed as a diff before it is applied**. Never fabricate a lesson because it
sounds useful, never silently overwrite, never rewrite a whole memory file as the working agent.

## When to use

- The same failure or missed rule occurred **at least twice** and the user corrected it.
- The user explicitly asks to remember/codify something (`remember this`, `always do X`, `你应该记住`, `下次不许`).
- A correction touches a topic no loaded memory covers.
- A correction contradicts a loaded rule: that is a rewrite — propose it, the Dreaming Resident or the user decides.

Do not use it for one-off task instructions, brainstorming, or acceptance planning.

## Tools

`memory_list` / `memory_read` / `memory_search` — read-only inventory.
`memory_write` / `memory_delete` / `agentsmd_write` — **dry run by default**; they return a unified diff.
`agentsmd_read` — read the current instruction file.
`memory_candidate` — subagents propose an entry instead of writing.

## Procedure

1. **Find evidence.** Quote the exact correction or the two occurrences. No evidence, no entry.
2. **Pick one target** (two stages):
   - *Scope*: true across projects → global; project-specific → workspace.
   - *Kind*: canonical commands, paths, environment facts, tool/agent conventions → `AGENTS.md` /
     `AGENTS.local.md`; principles, red flags, verification rules, standing constraints → a `memory/*.md`.
3. **Check duplication and contradiction** with `memory_search` / `memory_read`. Merge into an existing file
   instead of creating a near-duplicate; if it contradicts a rule, say so explicitly in the proposal.
4. **Preview**: call the write tool without `apply`. Show the returned diff in your reply and ask for confirmation
   (or, when the user already said "remember this", treat that as the confirmation and apply in the same turn —
   state what you are writing).
5. **Apply** with `apply: true` and the exact `previewToken` returned by the inspected dry run, then report the target path and, when present, the backup path. A changed actor, target, content or current source invalidates the token: inspect a fresh diff, never bypass it.
6. **Style**: constraints, norms, standing rules; one line per rule; no per-decision status entries, no file paths
   that will rot, no secrets. Keep entries short — the whole store is injected into every session.

## Hard boundaries

- Never edit a tracked workspace `AGENTS.md`; workspace instructions belong in `AGENTS.local.md`.
- Never rewrite or delete a memory file wholesale; propose smaller merges. Dreaming owns consolidation.
- Never put secrets, tokens, credentials, or personal data into memory.
- Subagents: read only, or `memory_candidate`; direct writes are rejected.
- After context compaction, re-read the affected files before editing — do not rely on remembered content.

## Self-application

If this skill has a gap, it may be updated through the same procedure: declare `Self-modification: yes`, show the
diff, and keep the user's confirmation gate.
