# Oh-My-BBFF Superpowers

Eight on-demand method skills for DeepSeek Harness, registered as one native skill provider:
`bbff-team-leading`, `bbff-team-member`, `brainstorming`, `writing-plans`, `independent-review`,
`test-driven-development`, `systematic-debugging`, and `verification-before-completion`.

The bundle adds skills only: no tools, no cards, no settings, no client code. It works without
Widgets or Team. Skill descriptions appear in DSH's native skill catalog. Bodies and references
load on demand, and an edited installed body takes effect on the next load.

## Requirements

- DeepSeek Harness **0.2.2 or newer** (`engines.dsh`).
- Node.js **24.9 or newer** (used by the package's own checks).
- The bundle declares no dependencies. `@deepseek-ai/dsh-skill` and `yaml` resolve from the DSH
  installation.

## Install

```sh
dsh plugin --profile <profile> add oh-my-bbff-superpowers
```

Or in the DSH Web UI: **Plugins → Add plugin** → **Install** → **Enable now**. Install
[oh-my-bbff-widgets](../oh-my-bbff-widgets/README.md) as well if you want the BBFF panel and
settings page for the rest of the family. The skills themselves do not need it.

To install the whole family in one step, use the meta bundle instead:
`dsh plugin --profile <profile> add oh-my-bbff` ([oh-my-bbff](../oh-my-bbff/README.md)).

## The skills

| Skill | Use it for |
|---|---|
| `bbff-team-leading` | Leading an Oh-My-BBFF Team: staffing, task briefing, review, reporting. |
| `bbff-team-member` | Working as a team member or one-shot child: intake, boundaries, reporting. |
| `brainstorming` | Genuinely open design or product decisions before implementation. |
| `writing-plans` | Turning an accepted design into a bounded implementation plan. |
| `independent-review` | Deciding when a change needs review, and evaluating review findings. |
| `test-driven-development` | Observable behavior changes with a meaningful automated test seam. |
| `systematic-debugging` | Unclear root cause, repeated failures, interacting components. |
| `verification-before-completion` | Before making or accepting a completion claim. |

## Settings

None. The skills appear in DSH's skill catalog and are loaded on demand. There is no BBFF settings
section for this package.

## Development checks

The package's checks run offline against an installed DeepSeek Harness: `npm test`,
`npm run check-package`, and `npm pack` (whose `prepack` runs the release gate and regenerates
`payload-manifest.json`). Tests write only under a workspace-local artifact directory.

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, install matrix, screenshots.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — the full development history (preserved verbatim).
- [Third-party notices](THIRD_PARTY_NOTICES.md) — the MIT licence of the upstream skills this
  package adapts.
- License: MIT, see [LICENSE](LICENSE).
