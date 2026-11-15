# Oh-My-BBFF Memory

Markdown memory for DeepSeek Harness, with a budget instead of a hard file-size cap. Memory files
are plain Markdown in `$DSH_HOME/memory` (global) and `<workspace>/.dsh/memory` (per workspace).
They are either injected in full or retrieved on demand by a deterministic router, always within a
token budget measured with a real tokenizer (default: 10% of the model's context window). The
in-process **Dreaming Resident** reviews your memory every six hours, on DSH's native schedule,
and can merge, rewrite or archive entries while keeping history and a revert path.

## Requirements

- DeepSeek Harness **0.2.2 or newer** (`engines.dsh`).
- [oh-my-bbff-widgets](../oh-my-bbff-widgets/README.md) for the Memory and Dreaming cards and the
  settings page.
- A DSH model route for the Resident if you want Dreaming to run. It uses your current DSH model
  unless you pin one.

## Install

```sh
dsh plugin --profile <profile> add oh-my-bbff-widgets
dsh plugin --profile <profile> add oh-my-bbff-memory
```

Or in the DSH Web UI: **Plugins → Add plugin** → **Install** → **Enable now**.

To install the whole family in one step, use the meta bundle instead:
`dsh plugin --profile <profile> add oh-my-bbff`. It installs Widgets and this package together
([oh-my-bbff](../oh-my-bbff/README.md)).

## What you get

- **Injection modes** — `full` injects every enabled memory file, bounded by the budget. `routed`
  injects an index plus the top matching files per turn. Choose a default for new sessions and
  override it per session.
- **Tools** — `memory_read`, `memory_write`, `memory_search`, `memory_list`, `memory_delete` and
  the candidate tools, plus the seven `dream_*` tools for the Resident only.
- **Dreaming Resident** — one dedicated session (`BBFF Dreaming Resident 🌙`) wakes every six
  hours through DSH's native schedule, reviews human-written increments, and commits changes with
  archive and changelog. A wake that writes nothing is a normal outcome.
- **History and revert** — every committed change keeps its previous version. Archived entries are
  restored from the same panel.

## Settings you are likely to change

| Setting | What it does |
|---|---|
| Default session mode | `full` or `routed` memory injection for new sessions. |
| Memory injection | Turn automatic injection on or off. |
| Enable Dreaming | Start or stop automatic memory reviews. Existing memory stays usable. |
| Budget window ratio | Share of the model context window the injected memory may use (default 10%). |
| Workspace memory directories | Which workspace folders are read, and in what order (advanced). |

## Directories and writes

`<workspace>/.dsh/memory` is the only directory Memory writes. The compatibility directories
(`.opencode/memory`, `.agent/memory`) are read-only sources. Archiving one of their files writes a
tombstone in `.dsh/memory` that shadows the legacy file, and the legacy file's bytes are never
modified. `AGENTS.md` and `AGENTS.local.md` are handled by DSH's native instruction chain, not by
the memory budget.

## Instruction budget (managed preset)

Memory can raise the native instruction budget by writing a managed block into the profile patch.
Preview it, confirm, and then **restart DSH** for the new cap to take effect. If the profile patch
is later re-serialized (for example by installing another plugin), the settings page reports a
drift and offers a regenerate preview. The cap in effect is shown next to it.

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, install matrix, screenshots.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — the full development history (preserved verbatim).
- [Third-party notices](THIRD_PARTY_NOTICES.md) — vendored tokenizer and YAML parser licences.
- License: MIT, see [LICENSE](LICENSE).
