# Oh-My-BBFF Widgets

The family root of [Oh-My-BBFF](../../README.md) for the DeepSeek Harness Web UI. It adds the
right-sidebar status panel (cards), the global notes panel, and the **BBFF settings** page where
every installed Oh-My-BBFF module contributes its own settings section. It also publishes the
family contract that the other modules register into, so a module that is installed and enabled
shows up as a card and a settings section without any extra wiring.

## Requirements

- DeepSeek Harness **0.2.2 or newer** (`engines.dsh`).
- No other Oh-My-BBFF package is required to use Widgets itself. The other modules need Widgets
  for their cards and settings.

## Install

```sh
dsh plugin --profile <profile> add oh-my-bbff-widgets
```

Or in the DSH Web UI: **Plugins → Add plugin**, paste the package name (or a local path or
tarball), then **Install** and **Enable now**. Changes apply without restarting DSH.

To install the whole family in one step, use the meta bundle instead:
`dsh plugin --profile <profile> add oh-my-bbff`. It installs this package and the other four
together ([oh-my-bbff](../oh-my-bbff/README.md)).

## What you get

- **Status panel** — a right-sidebar tab with one card per installed Oh-My-BBFF module (Team,
  Memory, Scope, Goal, Todos, History, Skills/Tools/MCP exposure, and others). Cards can be shown
  or hidden, reordered, and docked like any other DSH tab.
- **Notes** — a private checklist in the left sidebar. Notes are never injected into a prompt.
  The model can read them only when you explicitly ask, through the `read_user_notes` tool.
- **BBFF settings** — one page for the whole family: Widgets' own options plus a section from
  each enabled module (Team roles and models, Memory and Dreaming, Scope rules, diagnostics).
- **Language files** — the UI follows DSH's language setting (Settings → General → Language).
  Chinese shows Chinese. Every other language shows English. Add another language by exporting
  the template here, translating the values, and reloading. No restart is needed.

## Settings you are likely to change

| Setting | What it does |
|---|---|
| Language files | Export the translation template, drop a translated JSON file in `$DSH_HOME/oh-my-bbff/locale/`, reload. |
| Cards | Choose which cards are visible and adjust their order and height. |
| Open goals automatically | Open the panel when a goal is detected. |
| Note limits | Maximum note length and note count. |

Everything else (refresh intervals, snapshot bounds, per-card visibility) lives under the
collapsed **Advanced settings** block in the same section.

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, install matrix, screenshots.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — the full development history (preserved verbatim).
- License: MIT, see [LICENSE](LICENSE).
