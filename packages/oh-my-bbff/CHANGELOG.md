# Changelog — oh-my-bbff

## 1.0.0 — first public release

- First public release of the `oh-my-bbff` meta bundle. It installs and enables the five family packages together: `oh-my-bbff-widgets`, `oh-my-bbff-team`, `oh-my-bbff-memory`, `oh-my-bbff-scope` and `oh-my-bbff-superpowers`, each pinned exactly to the same 1.0.0 release.
- Requires DeepSeek Harness 0.2.2 or newer.
- The bundle adds no tools, cards or settings of its own. All of its effect is one loader patch that inserts the five plugin rows with the same ids and `inject` lists their own packages use, so a mixed install converges on one row per plugin.
- This release supersedes the earlier 0.0.1 name reservation for this package.
