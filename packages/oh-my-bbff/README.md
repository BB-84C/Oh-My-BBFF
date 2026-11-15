# oh-my-bbff

One-step install for the whole Oh-My-BBFF family on DeepSeek Harness. This package is a bundle. It
installs and enables five packages together and adds no tools, cards or settings of its own.

- `oh-my-bbff-widgets` — the family root: the BBFF panel, cards, notes and the BBFF settings page.
- `oh-my-bbff-team` — role-based team organization and the Lead management tools.
- `oh-my-bbff-memory` — routed memory and the Dreaming Resident.
- `oh-my-bbff-scope` — per-workspace availability rules for tools, MCP servers and skills.
- `oh-my-bbff-superpowers` — eight method skills for the team.

Each package is also installable on its own, in the same order. Install either the bundle or the
individual packages, not both.

## Requirements

- DeepSeek Harness **0.2.2 or newer** (`engines.dsh`).
- Node.js **24.9 or newer** for the package's own checks.
- A workspace selected in DSH, and Agent Teams on in the conversation before the Lead hires core
  seats.

## Install

```sh
dsh plugin --profile <profile> add oh-my-bbff
```

Or in the DSH Web UI: **Plugins → Add plugin**, enter `oh-my-bbff`, then **Install** and **Enable
now**. No restart is needed.

The bundle pins all five packages to this release. To update the family later, update
`oh-my-bbff` rather than the individual packages.

## What you get

The same result as installing the five packages in order: the BBFF panel and the BBFF settings page
from Widgets, the Team card and the Lead tools, the Memory and Dreaming cards, the Scope settings,
and the eight method skills. The Plugins page lists the bundle and the five packages. The bundle
itself has no entry of its own in the BBFF panel.

## Settings

None here. Every setting lives in the package that owns it. Open **BBFF Settings** and pick the
module you want to change.

## The Plugins page and removal

The Plugins page lists `oh-my-bbff` as one installed plugin. The five member packages do not get
their own rows there, because they are dependencies of the bundle. To switch a single module off,
add a disable entry for its row to the profile patch (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`),
or install that module on its own instead of the bundle.

Removing `oh-my-bbff` removes the bundle selection, and the package manager also removes the five
member packages from the profile. Nothing of the family stays loaded.

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, screenshots and the full install matrix.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — release history.
- License: MIT, see [LICENSE](LICENSE).
