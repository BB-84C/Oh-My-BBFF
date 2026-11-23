# Changelog — oh-my-bbff

## 1.0.2 — Widgets 1.0.2, Team 1.0.2, Memory 1.0.4, SDK 1.0.1

- **Widgets 1.0.2:** the sidebar no longer slows down as the session catalog grows (the catalog ledger decides admission from per-row deltas instead of rebuilding the whole document on every observation), the MCP completeness note no longer crashes the panel, and the advanced settings sections (高级设置) open again for Team, Scope and Memory.
- **Team 1.0.2:** hydrating members and scanning their sessions now honors the session-read budget. A session log larger than 30 MB that has not been written for 7 days is skipped and recorded in the team ledger instead of being decoded, so the team panel stays responsive on a long history.
- **Memory 1.0.4:** fixes a deadlock in the Dreaming Resident session rotation. A resident that reaches the context limit now continues on a fresh session with a short handoff note, and a wake that had to be deferred for rotation is re-delivered instead of being lost. Memory also applies the session-read budget, so cold oversized logs are never decompressed.
- **SDK 1.0.1:** the family contract publishes the session-read policy (defaults, ranges and helpers), so third-party modules can apply the same rule to their own reads.
- Scope and Superpowers stay at 1.0.0. Requires DeepSeek Harness 0.2.2 or newer. The bundle adds no tools, cards or settings of its own.

## 1.0.1 — Team 1.0.1

- Pins `oh-my-bbff-team` to 1.0.1, which ships the Orchestrator tree-activity and job-kill fix, actionable position refusals, and the Team card's session-mode switch now driving native Agent Teams. The other four packages stay at 1.0.0.
- Requires DeepSeek Harness 0.2.2 or newer. The bundle adds no tools, cards or settings of its own.

## 1.0.0 — first public release

- First public release of the `oh-my-bbff` meta bundle. It installs and enables the five family packages together: `oh-my-bbff-widgets`, `oh-my-bbff-team`, `oh-my-bbff-memory`, `oh-my-bbff-scope` and `oh-my-bbff-superpowers`, each pinned exactly to the same 1.0.0 release.
- Requires DeepSeek Harness 0.2.2 or newer.
- The bundle adds no tools, cards or settings of its own. All of its effect is one loader patch that inserts the five plugin rows with the same ids and `inject` lists their own packages use, so a mixed install converges on one row per plugin.
- This release supersedes the earlier 0.0.1 name reservation for this package.
