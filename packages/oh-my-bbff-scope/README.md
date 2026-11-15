# Oh-My-BBFF Scope

Workspace availability rules for DeepSeek Harness. A single DSH profile shares its tools, MCP
servers and skills across every workspace, so Scope lets you say which of them are available in
which workspace. Rules are stored in the BBFF settings data and enforced when a session starts.
Scope adds settings only. It does not register model tools of its own.

## Requirements

- DeepSeek Harness **0.2.2 or newer** (`engines.dsh`).
- [oh-my-bbff-widgets](../oh-my-bbff-widgets/README.md) for the settings section.

## Install

```sh
dsh plugin --profile <profile> add oh-my-bbff-widgets
dsh plugin --profile <profile> add oh-my-bbff-scope
```

Or in the DSH Web UI: **Plugins → Add plugin** → **Install** → **Enable now**.

To install the whole family in one step, use the meta bundle instead:
`dsh plugin --profile <profile> add oh-my-bbff`. It installs Widgets and this package together
([oh-my-bbff](../oh-my-bbff/README.md)).

## What you get

- **Per-workspace rules** for tools, MCP servers and skills. A rule can allow or hide an entry in
  one workspace without changing any other workspace.
- **Unknown-workspace policy** — decide whether rule-managed entries stay available or are hidden
  when a session's workspace has no rules yet.
- **Diagnostics** — see which rules applied to the current session and why an entry was hidden.

Scope is an availability control, not a sandbox and not a secrecy boundary. It decides what a
workspace exposes, not what a process may read or execute. Path matching is textual, so symlinks
and junctions are not resolved, and matching is case-insensitive on Windows. A session's root scope
is fixed when the session starts.

## Settings you are likely to change

| Setting | What it does |
|---|---|
| Unknown workspace | Allow or hide rule-managed tools and skills when the workspace has no rules. |
| Rules | Create per-workspace allow/hide rules for tools, MCP servers and skills. |
| Show diagnostics | Show troubleshooting details for the current session. |

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, install matrix, screenshots.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — the full development history (preserved verbatim).
- License: MIT, see [LICENSE](LICENSE).
