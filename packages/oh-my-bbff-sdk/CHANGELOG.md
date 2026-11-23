# Changelog — Oh-My-BBFF SDK

## 1.0.1 — session-read budget contract

- The family contract gains the session-read budget policy: `SESSION_READ_SKIP_CODE`, `SESSION_READ_SKIP_REASON_KEY`, `SESSION_READ_LIMIT_DEFAULTS` (30 MB / 7 days), `sessionReadLimits(settings)`, `skippableSessionLog(stats, now, limits)`, `sessionReadSkipParams(verdict)`, `statSessionLog(sessionsRoot, sessionId)` and `createSessionReadBudget(...)`.
- First-party bundles vendor these bytes unchanged; the policy is applied per package with its own settings resolver.

## 1.0.0 — first public release

- First public release of the Oh-My-BBFF SDK. Family-wide version reset to 1.0.0. The contract surface is unchanged from 0.1.16.
- Requires DeepSeek Harness 0.2.2 or newer.
- The user-facing README was rewritten. The development log below is preserved unchanged.
- `CHANGELOG.md` is new. The former README is this history, moved verbatim.

# Oh-My-BBFF SDK

Open contract SDK for **Oh-My-BBFF** modules running in the DSH Web UI.

An Oh-My-BBFF module is a normal DSH plugin bundle plus two optional halves:

- **host half** — registers a module descriptor with the family root (`bbffFamily`);
- **client half** — registers sidebar cards and BBFF settings sections (`bbffUi`).

The root (`oh-my-bbff-widgets`) provides both services and the UI seats around
them. It never names, scans, or special-cases a module; anything that registers
shows up automatically.

```js
import { registerFamilyModule, registerUiAdditions } from 'oh-my-bbff-sdk'
```

## Status

SDK **0.1.15** supports the reviewed DSH0.2.2-rc.2 convention surface. It retains
0.1.14's native tool inventory and named catalog-v3 decoder, and adds source-backed
verification of the shared catalog, event, navigation, instruction and goal-default
contracts. Unverified conventions still fail closed. See the 0.1.15 amendment in
[DSH_ADAPTER.md](./DSH_ADAPTER.md).

### Previous 0.1.13 baseline

SDK **0.1.13** adds the owner-requested `activityEventFacts` recent-activity decoder, with no change to existing exports. Canonical contract stays `72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115`; final adapter is **134,182 B / `c4a91aae7f2912b3b1656a54502f52f8923710f0375a255b018ff73ecb130556`**. This intentionally replaces the four-plugin adapter baseline `915027cb…` / 122,322 B. See [the additive amendment](./DSH_ADAPTER.md#additive-amendment--2026-11-09-sdk0113) for faithful optional fields, extensibility and old-export regression evidence.

Contract v1 with additive v1.5 capabilities (SDK `0.1.6`). Optional
`descriptor.exclusiveTools: { tools, reason, reasonLocales? }` statically declares
exact tools whose visibility belongs to module-owned sessions; workspace-scope
rules do not apply to them. The non-empty unique list must be a subset of the
same descriptor's valid `tools`. Invalid declarations are dropped atomically
with warnings, without rejecting the module or discarding valid ownership.
Consumers feature-detect the copied/frozen field on `bbffFamily.list()` entries;
the root only forwards it. See [v1.5 static exclusive tools](./CONTRACT.md#24-static-exclusive-tools-v15-additive--feature-detect).

The v1.4 capabilities remain: contributors and
annotators may supply `reasonLocales: Record<string,string>`; the client selects
its locale key and falls back to `reason` without root-owned module strings. Feature-detected
`registerExposureContributor(moduleId, fn)` supplies session-only tools and an
optional exclusive tool surface, with isolated 500ms calls and read-only-by-default
toggles; see [v1.4 contributors](./CONTRACT.md#23-session-exposure-contributors-v14-additive--feature-detect).

The v1.3 capabilities remain: optional exact
`descriptor.tools` ownership declarations and feature-detected
`registerExposureAnnotator(moduleId, fn)` / `annotateExposure(input)` for
workspace-unavailable tool/MCP/skill diagnostics. Older v1/v1.2 modules keep
working; see [the v1.3 shapes and merge/deadline rules](./CONTRACT.md#22-tool-ownership-and-exposure-annotators-v13-additive--feature-detect).

First-party bundles vendor `contract.js`
byte-for-byte so profile installs stay dependency-free; external modules may
vendor it too or bundle this SDK into their client half.

## Quick start (module author)

1. Package name `oh-my-bbff-<module>`, display title `Oh-My-BBFF <Module>`:

```json
{
  "name": "oh-my-bbff-hello",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.js",
  "exports": { ".": "./index.js", "./client": "./client.js", "./locale/*.json": "./locale/*.json" },
  "bbff": { "contract": 1, "id": "hello", "title": "Oh-My-BBFF Hello" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true }
  }
}
```

2. Host half (`index.js`):

```js
import { registerFamilyModule } from 'oh-my-bbff-sdk'

export function apply(ctx) {
  registerFamilyModule(ctx, {
    contract: 1,
    id: 'hello',
    title: 'Oh-My-BBFF Hello',
    description: 'One sentence shown in BBFF settings diagnostics.',
    version: '0.1.0',
    packageName: 'oh-my-bbff-hello',
    apiBase: '/oh-my-bbff-hello/api',
    ui: { cards: ['hello'], settings: true },
  })
}
```

3. Client half (`client.js`, source for the DSH client module loader; bundle it
   with React external, or register directly if you consume the loader API):

```js
import { registerUiAdditions } from 'oh-my-bbff-sdk'

export function apply(ctx, { h, React }) {
  const HelloCard = ({ sessionId }) => h('div', null, 'hello from ' + (sessionId || 'no session'))
  const HelloSettings = () => h('div', null, 'settings body')
  registerUiAdditions(ctx, {
    cards: [{ id: 'hello', title: { zh: '示例', en: 'Hello' }, order: 100, defaultHeight: 200, component: HelloCard }],
    sections: [{ id: 'hello', title: { zh: 'Hello 设置', en: 'Hello settings' }, order: 100, component: HelloSettings }],
  })
}
```

4. `cordis.patch.yml` inserts your host plugin; `locale/{en,zh}.json` provides
   `meta.title` / `meta.description` for the plugin list.

The root gives each registered card its chrome for free: collapse, resize, max
height, drag/dock, N-way split and persisted layout. Card ids are namespaced
`moduleId/cardId` in storage; use `legacyIds` if a card predates namespacing.

The shared `bbffUi.kit` covers `Row`, `Checkbox`, `Badge`, `Hint`, `Empty`,
`Spinner`, `ErrorText`, `Button`, `Input`, `postJson`, `getJson`, `useSession`,
`usePoll`, `openSession`, `openFile`, `locale`, `t` and `tokens`; modules never
import root internals.

## Root guarantees

| Area | Guaranteed by the root |
|---|---|
| Status panel | core cards + registered cards ordered by `order`, then `id` |
| Settings panel | core general settings + registered sections ordered by `order`, then `id` |
| Card chrome | title/collapse/resize/max-height/drag/dock/split/persistence |
| Session context | `sessionId` prop plus `useSession()`; re-render on switch |
| Load order | `ctx.inject`-based registration; root absent/late is safe |
| Unload/HMR | module cards and sections disappear; layout slots are retained |
| Compatibility | `contract: 1`; incompatible descriptors listed, never thrown |

## Identity rules

- family display name `Oh-My-BBFF`, slug/package prefix `oh-my-bbff`;
- package `oh-my-bbff-<module>`; display title `Oh-My-BBFF <Module>`;
- module id lowercase `[a-z][a-z0-9-]{0,31}` and unique per profile;
- `bbff: { contract, id, title }` in `package.json`; locale metadata matches.

Full specification: [CONTRACT.md](./CONTRACT.md). Reference implementation of a
minimal module: [examples/hello-card](./examples/hello-card).

## First-party bundles

The source of truth is this package. First-party bundles vendor
`contract.js` as `lib/bbff-contract.js` and import it relatively; keep the copies
byte-identical:

```sh
node scripts/sync-into.mjs --target packages/oh-my-bbff-widgets
node scripts/sync-into.mjs --target packages/oh-my-bbff-memory
node scripts/sync-into.mjs --check --target <bundle-dir>   # verify only
```

## License

MIT.
