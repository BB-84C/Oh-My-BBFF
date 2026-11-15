# Oh-My-BBFF SDK

The open contract for Oh-My-BBFF modules in the DeepSeek Harness Web UI. It is a **library**, not a
DSH plugin bundle. You install it as a dependency when you write your own Oh-My-BBFF module, or you
vendor the two runtime files so a profile install stays dependency-free.

An Oh-My-BBFF module is a normal DSH plugin bundle plus two optional halves:

- **host half** — registers a module descriptor with the family root (`bbffFamily` service).
- **client half** — registers sidebar cards and BBFF settings sections (`bbffUi` service).

The root (`oh-my-bbff-widgets`) provides both services and the UI seats. It never names, scans or
special-cases a module. Anything that registers shows up automatically.

## Requirements

- DeepSeek Harness **0.2.2 or newer** (`engines.dsh`).
- Node.js ESM (`"type": "module"`). No build step is required by the SDK.
- [oh-my-bbff-widgets](../oh-my-bbff-widgets/README.md) at runtime for the family root services.

## Install

As a dependency of your module:

```sh
npm install oh-my-bbff-sdk
```

The SDK is not installed with `dsh plugin add`. It has no `dsh.bundle` and registers nothing by
itself. First-party bundles instead vendor `contract.js` (and, where needed, `dsh-adapter.js`)
byte-for-byte so a profile install needs no extra dependency. External modules may vendor them
too.

The family meta bundle `oh-my-bbff` does not include the SDK, because modules vendor these files
([oh-my-bbff](../oh-my-bbff/README.md)).

## What it provides

- `registerFamilyModule` — host half: publish your descriptor (id, title, version, cards,
  settings, tools, locale) to the family root.
- `registerUiAdditions` — client half: register sidebar cards and BBFF settings sections.
- Locale dictionaries — ship `locale/<lang>.json` with `ui` keys. The root resolves message
  references against your namespace and falls back to English.
- `dsh-adapter.js` — verified read-only helpers over the DSH public conventions (tool inventory,
  event and catalog shapes), with unverified conventions failing closed.
- Contract documentation: [CONTRACT.md](CONTRACT.md), [DSH_ADAPTER.md](DSH_ADAPTER.md),
  [NATIVE_TOOL_EFFECTS.md](NATIVE_TOOL_EFFECTS.md) and runnable examples under
  [examples/](examples/).

## Settings

None. The SDK is a library. The settings it lets a module declare appear in the module's own BBFF
settings section.

## See also

- [Oh-My-BBFF root README](../../README.md) — the family, install matrix, screenshots.
- [Known limitations](../../docs/KNOWN-LIMITATIONS.md) — what does not work yet, and why.
- [Changelog](CHANGELOG.md) — the full development history (preserved verbatim).
- License: MIT, see [LICENSE](LICENSE).
