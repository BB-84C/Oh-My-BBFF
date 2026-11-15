# Oh-My-BBFF Team

Role-based organization for DeepSeek Harness teams. DSH already gives an agent a team. Team adds
the **staffing**: a role catalog in which each role carries a leader-facing briefing, its own
identity prompt, mechanically enforced permissions, an optional model route, and a reuse policy.
The Lead hires seats by role, changes a member's role or model, checks what each member is doing,
and keeps a durable roster across a long project.

## Requirements

- DeepSeek Harness **0.2.2 or newer** (`engines.dsh`).
- [oh-my-bbff-widgets](../oh-my-bbff-widgets/README.md) for the Team card and the settings page.
- The conversation must be in a mode where **Agent Teams is on** before the Lead can hire core
  seats.
- DSH's **standard** or **cordis (Creator)** agent preset. Other presets warn and will not work.

## Install

```sh
dsh plugin --profile <profile> add oh-my-bbff-widgets
dsh plugin --profile <profile> add oh-my-bbff-team
```

Or in the DSH Web UI: **Plugins → Add plugin** → **Install** → **Enable now**.

To install the whole family in one step, use the meta bundle instead:
`dsh plugin --profile <profile> add oh-my-bbff`. It installs Widgets and this package together
([oh-my-bbff](../oh-my-bbff/README.md)).

## What you get

- **Roles are a contract, not a prompt.** Each role has a leader briefing, a member identity
  prompt, a permission set enforced in the tool layer (a read-only role cannot write files, a
  non-delegating role cannot dispatch), an optional model route, and a reuse policy.
- **Models follow roles.** One role can take a cheap model for broad reading, another a stronger
  model for review. The Lead sees the routing guidance and picks explicitly. Members never switch
  models on their own.
- **Lead management tools.** The Lead uses `bbff_team_roster`, `bbff_team_activity`,
  `bbff_team_assign`, `bbff_team_dispatch` and `bbff_team_steer`, compacts idle members, and runs
  the shared team task board.
- **Core seats and outsourced work.** Core seats are long-lived seats with a role. Outsourced
  agents are one-off dispatches. Both are visible in one Team card, ordered by recent activity.

## The built-in roles

The built-in roles are inspired by
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim): explorer, librarian,
oracle, designer and fixer follow its role division, and Oh-My-BBFF adds writer and laborer.
Every role is editable, and you can add your own roles.

## Settings you are likely to change

| Setting | What it does |
|---|---|
| Member work mode | Nested delegation (core members may hire helpers) or Lead-assigned helpers only. |
| Team roles | The role catalog: per-role model route, permissions, reuse policy, briefing and identity text. |
| Member naming | Name members by standing function or by seat. |
| Session mode | In the Team card: auto, orchestrator, or off for the current conversation. |

Shipped prompts and defaults are English. User-written text in any language is kept verbatim.

## Changing a member's model

The Lead changes a member's model through the role catalog or `bbff_team_assign`, which is the
single model authority. Deprecated per-member override data is ignored, and there is no
manual-override precedence. The change applies from the member's **next** turn. If the Lead
switches a running task between different model vendors, that task stops because the new model
rejects the earlier steps. The Lead re-sends the task after the switch.

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, install matrix, screenshots.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — the full development history (preserved verbatim).
- License: MIT, see [LICENSE](LICENSE).
