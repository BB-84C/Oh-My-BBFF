# Oh-My-BBFF family contract (v1, design)

> **Superseded (0.14.0):** the authoritative specification is now
> `packages/oh-my-bbff-sdk/CONTRACT.md` (open SDK). This document is kept
> as the original design record only. P3 removed the last hardcoded module UI
> (memory/dreaming) from the root; the SDK spec is the single source of truth.

Status: proposed by the owner's instruction of 2026-11-05 ("widget 作为家族的根…把他们变成 contract"). Widget is the family root; every other `oh-my-bbff-*` module discovers itself into it through the two services below. No module id, package name, card id or setting name may be hardcoded in the root.

## 1. Identity

| Thing | Rule |
|---|---|
| Family display name | `Oh-My-BBFF` |
| Family slug | `oh-my-bbff` |
| Package names | `oh-my-bbff-<module>` (lowercase; also the future public npm name) |
| Display titles | `Oh-My-BBFF <Module>` (e.g. `Oh-My-BBFF Memory`, `Oh-My-BBFF Widgets`) |
| Module id | lowercase `[a-z][a-z0-9-]{0,31}`, unique inside the family (`memory`, `widgets`) |
| Root | `oh-my-bbff-widgets` — owns the services, the sidebar status panel, notes, and the BBFF settings seat |

`package.json` metadata for the plugin list and contract diagnostics:

```json
{
  "name": "oh-my-bbff-memory",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "platform": "web", "immediately": true } },
  "bbff": { "contract": 1, "id": "memory", "title": "Oh-My-BBFF Memory" }
}
```

`bbff.title` is the short module title; the full display title is `Oh-My-BBFF <bbff.title>`. The locale `meta.title` / `meta.description` in `locale/{en,zh}.json` is what the plugin list shows and must match.

## 2. Host half — `bbffFamily` service (root-provided, contract v1)

The root host plugin provides a Cordis service:

```ts
const family = ctx.provide('bbffFamily', {
  contract: 1,
  root: { packageName: 'oh-my-bbff-widgets', version: '0.14.0' },
  register(descriptor): () => void,      // disposer, idempotent
  list(): readonly BbffModuleDescriptor[],
  get(id): BbffModuleDescriptor | undefined,
  subscribe(listener): () => void,        // called on every change
})

interface BbffModuleDescriptor {
  contract: 1
  id: string                    // 'memory'
  title: string                 // 'Oh-My-BBFF Memory'
  description: string           // one sentence, plugin-list copy
  version: string               // module package version
  packageName: string           // 'oh-my-bbff-memory'
  apiBase?: string              // e.g. '/oh-my-bbff-memory/api'
  ui?: { cards?: string[]; settings?: boolean }  // declared UI contributions (diagnostics only)
  compatible: boolean           // root sets this from contract negotiation
}
```

Module rule (registration must survive load order and HMR):

```js
ctx.inject(['bbffFamily'], (scope) => {
  const registry = scope.get('bbffFamily')
  scope.effect(() => registry.register(descriptor), 'bbff: memory module')
})
```

- Root absent → `ctx.inject` never fires; the module keeps working standalone (memory's route, tools, injection, dreaming must not depend on the widget).
- Root later appears/reloads → injection fires, module re-registers.
- Duplicate id, bad id, empty title/description, or `contract !== 1` → root logs a warning and still records the descriptor with `compatible: false` (diagnostics row), without throwing inside the module's fiber.
- Root never enumerates, scans, or names modules; `list()` is the only source of truth.

Root host route adds `action: 'family'` to `/oh-my-bbff-widgets/v6/api`:

```json
{ "ok": true, "contract": 1, "root": { "packageName": "...", "version": "..." },
  "modules": [ { "id": "memory", "title": "...", "compatible": true, "ui": { "cards": ["memory", "dreaming"], "settings": true } } ] }
```

## 3. Client half — `bbffUi` service (root-provided, contract v1)

The root client module provides a client Cordis service. A module's own client module injects it, exactly like the host half:

```js
ctx.inject(['bbffUi'], (scope) => {
  const ui = scope.get('bbffUi')
  scope.effect(() => ui.registerCard({ id: 'memory', title: { zh: '记忆与指令', en: 'Memory' }, order: 10,
    defaultHeight: 320, component: MemoryCard }), 'bbff: memory card')
})
```

```ts
interface BbffUiService {
  contract: 1
  registerCard(def: BbffCard): () => void
  registerSettingsSection(def: BbffSettingsSection): () => void
  readonly kit: BbffUiKit
}

interface BbffCard {
  id: string                        // card id inside the module, e.g. 'memory'
  title: string | { zh: string; en: string }
  order?: number                    // default 100; core cards are < 100
  defaultHeight?: number            // px, clamped 80..900
  component: React.ComponentType<BbffCardProps>   // body only; the root renders chrome
}

interface BbffSettingsSection {
  id: string
  title: string | { zh: string; en: string }
  order?: number
  component: React.ComponentType<BbffSettingsProps>
}
```

`BbffCardProps` / `BbffSettingsProps`:

```ts
{
  moduleId: string
  sessionId: string | null          // current session; root re-renders on switch
  kit: BbffUiKit                    // shared primitives
  t: (key: string, fallback?: string) => string
}
```

`BbffUiKit` is the only root UI surface a module may use (no imports from the root package, no root CSS classes guessed):

- layout primitives: `CardShell`, `Section`, `Row`, `Checkbox`, `Badge`, `Hint`, `Empty`, `Spinner`, `ErrorText`
- data: `postJson(path, body)`, `getJson(path)`, `usePoll(fn, ms)`, `useSession()`
- theming: `tokens` (the current theme token names/values)
- card chrome, drag/dock, max-height, resize, collapse and layout persistence are the root's job; module cards get them for free
- card ids are namespaced `moduleId/cardId` in the layout document; existing core ids (`memory` → `memory/memory` after migration) keep their saved slot at migration time only through an explicit layout migration table (one release, then removed)

Root rendering rules:

- status panel = core cards (goal/history/team/subagents/todos/exposure/notes) + every registered card sorted by `order`, then `id`
- settings panel = core general settings + every registered section sorted by `order`, then `id`
- module unload/HMR → its cards and sections disappear; layout keeps the ids (hidden retention) and restores them on re-registration
- module client not loaded while host module is registered → settings overview shows the module with `ui: missing`; no crash

## 4. Discovery semantics ("自动发现")

Discovery is **activation-based registration**, not filesystem scanning and not a hardcoded list:

1. BBFF module host plugin applies → optional `bbffFamily` injection fires when the widget root exists → registers descriptor.
2. BBFF module client module loads (same bundle, `dsh.client`) → optional `bbffUi` injection fires → registers cards/sections.
3. Root renders whatever is registered; enabling/disabling/removing a module changes the UI with no root code change.
4. Widget root absent → modules are fully functional standalone.
5. Widget root present, module absent → no cards/sections for it; settings lists only registered modules.

## 5. Versioning and compatibility

- Services carry `contract: 1`. Root accepts `contract === 1`; other values are recorded as `compatible: false` and surfaced in the settings diagnostics, never thrown.
- Additive fields are backward compatible; removing/renaming a field or changing a signature bumps the contract.
- The root and modules ship their contract version in `package.json` `bbff.contract` and in the service value.

## 6. Migration plan

| Phase | Repo | Work |
|---|---|---|
| P0 | both | naming + descriptions (this round): display titles `Oh-My-BBFF Memory` / `Oh-My-BBFF Widgets`, real descriptions, package names stay `oh-my-bbff-*` |
| P1 | widgets 0.14.0 | host `bbffFamily` service + `family` API + client `bbffUi` service + generic card/settings hosts; layout migration table; contract unit tests; no memory-specific code added |
| P2 | memory 0.6.0 | host registration + new `client.js` (`dsh.client` manifest) that moves the memory card, dreaming card and memory settings section out of the widgets client into the memory bundle; memory registers `cards: ['memory','dreaming']`, `settings: true` |
| P3 | widgets | delete hardcoded memory/dreaming card + settings implementations; grep gate test asserting the root source contains no `oh-my-bbff-memory`, `dreaming`, `memory` UI strings; live acceptance: disable memory bundle → those cards/settings disappear; enable → return |

Acceptance for P1–P3:

- contract unit tests: register/dispose/subscribe/duplicate/invalid/version-mismatch/root-absent/late-root
- client tests: fake module registers a card and a settings section; ordering; namespaced layout persistence; module unload removes them; unavailable kit degrades
- installed-bundle readback for both packages; memory 0.5.x standalone behavior unchanged when widgets is absent
- live: the widget panel still shows all existing cards; memory cards/settings come from the memory bundle, not from widget code

## 7. Decisions taken (unless the owner overrides)

- Root is `oh-my-bbff-widgets`; backend-only capabilities stay in their own module host plugins (widget is only the family root, not a backend hub).
- Both halves are required for UI contribution; modules may ship host-only and skip `dsh.client`.
- Public/third-party modules are allowed by the contract but not promised in v1: ids and versions are validated, unknown packages get a warning, nothing is auto-installed.
- Core harness cards (goal/history/team/todos/exposure/notes) remain in the root; only module-owned UI moves out.
