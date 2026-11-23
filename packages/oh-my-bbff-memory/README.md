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
- **Bounded Resident context** — before a wake whose request would exceed the model window, the
  Resident rotates onto a fresh session with a handoff note (previous session, checkpoint position,
  what was in flight). The same rotation is available on demand from the Dreaming card.
- **History and revert** — every committed change keeps its previous version. Archived entries are
  restored from the same panel.

## Settings you are likely to change

| Setting | What it does |
|---|---|
| Default session mode | `full` or `routed` memory injection for new sessions. |
| Memory injection | Turn automatic injection on or off. |
| Enable Dreaming | Start or stop automatic memory reviews. Existing memory stays usable. |
| Budget window ratio | Share of the model context window the injected memory may use (default 10%). |
| Rotate Resident session | Rotate the Dreaming Resident at a context threshold instead of sending a request the window would reject (advanced). |
| Rotation threshold | Share of the session context window that triggers rotation (advanced, default 40%). |
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

## Bounded Resident context

The Resident keeps one long-lived session, and DSH never compacts a session past the request budget:
a model that reserves a large completion (for example 256,000 tokens of a 1,048,576 window) leaves a
message budget the compaction threshold is capped at, so a request dies exactly where compaction
would have fired. Memory rotates the session before that line.

- **Automatic** — before each wake the Resident reads the session's native context pressure. Above
  the threshold it rotates onto a fresh session, retires the old one (kept on disk, retitled), and
  re-points the adopted native schedule task at the new session. The first review of the new session
  carries a handoff note: previous session, checkpoint position, and any review that was unresolved.
  The wake is re-delivered once the interrupted turn settles, so no review is silently lost.
- **Manual** — *Rotate session* on the Dreaming card (explicit confirmation) does the same on demand.
  Nobody has to hand-edit the Resident state file.
- **Route continuity** — the replacement session inherits the retired session's model route
  (provider, model, reasoning effort), so the owner's pin survives a rotation. If that route cannot
  be read, the rotation record and the handoff say so explicitly instead of silently falling back to
  the shared DSH default; the retired route is never rewritten.
- **Threshold** — default 40% of the window. The effective value is capped at
  `100% − the route's reserved completion − 5%`, because a request also needs room for its own
  completion; the settings tooltip states the reasoning. Memory never changes the Resident's
  model/route pin — that stays the owner's setting.

- **Rotation never costs a wake or a turn** — being over the threshold is not the same as not
  fitting: a wake whose request still fits the window runs normally and the rotation happens at the
  next idle boundary. An unfittable wake is refused, the rotation runs after the turn, and that wake
  is re-delivered. A `running` status with no open turn in the session's durable boundary is treated
  as stale (`stale-running`, recorded in the handoff); a genuinely open turn is never interrupted.
  Repeated identical rotation failures are recorded once and escalate to an operator diagnostic
  instead of repeating every tick.

## Session-read budget

DSH decompresses a whole session log even for a logical read, so reading many historical logs can
saturate the machine. Memory therefore obeys the family session-read policy (BBFF advanced → limits,
defaults 30 MB **and** 7 days): a log larger than the size limit *and* untouched longer than the age
limit is never decoded by the Dreaming review, the delta or the read models. Such a session appears as
a diagnostic with its id, size and age, the review is told its coverage is partial, and its checkpoint
is left untouched — never a fabricated empty result. An explicit page request may still read a
targeted session: the log is decoded at most once per review and the decode cost is reported with the
page. Thresholds come from the family settings; when that store is unavailable the contract defaults
apply and the diagnostics say so. Memory never deletes, moves or archives a session log.

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, install matrix, screenshots.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — the full development history (preserved verbatim).
- [Third-party notices](THIRD_PARTY_NOTICES.md) — vendored tokenizer and YAML parser licences.
- License: MIT, see [LICENSE](LICENSE).
