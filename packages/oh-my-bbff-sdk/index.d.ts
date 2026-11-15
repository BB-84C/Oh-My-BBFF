/**
 * Oh-My-BBFF family contract v1 — public SDK types.
 *
 * The root `oh-my-bbff-widgets` plugin provides two Cordis services; modules
 * register into them through `registerFamilyModule` (host) and
 * `registerUiAdditions` (client). Import the runtime helpers from
 * `oh-my-bbff-sdk`.
 */

export const CONTRACT_VERSION: 1
/** Default package-relative directory holding `locale/<language>.json` dictionaries. */
export const DEFAULT_LOCALE_DIR: 'locale'
/** Package-relative locale directory pattern (one or two plain segments, no traversal). */
export const LOCALE_DIR_PATTERN: RegExp
/** Directory relative to `$DSH_HOME` holding user language files. */
export const USER_LOCALE_DIR: 'oh-my-bbff/locale'
/** File name of the exported translation template inside {@link USER_LOCALE_DIR}. */
export const LOCALE_TEMPLATE_FILE: 'template.en.json'
/** Language id pattern for dictionary file names and user language files. */
export const LANGUAGE_ID_PATTERN: RegExp
/** Locale namespace owning the SDK's own dictionaries (`locale/*.json`). */
export const SDK_NAMESPACE: 'oh-my-bbff-sdk'

/**
 * A locale message reference produced by {@link msg}. Host code emits references
 * instead of text; the client resolves them through the owning package dictionary.
 */
export interface BbffMessageRef {
  readonly $bbff: 'bbff-message'
  readonly key: string
  readonly params?: Readonly<Record<string, string | number>>
  /** Owning locale namespace (package name); omitted for same-package references. */
  readonly ns?: string
}
export function msg(key: string, params?: Record<string, string | number>, ns?: string): BbffMessageRef
export function isMessageRef(value: unknown): value is BbffMessageRef
export function resolveMessage(
  value: string | BbffMessageRef | LocalizedText | Record<string, string> | undefined | null,
  options?: {
    t?: (key: string, params?: Record<string, unknown>) => string
    bind?: (ns: string) => (key: string, params?: Record<string, unknown>) => string
    legacy?: (text: Record<string, string>) => string
  },
): string
/** FROZEN v1.6 exported contract policy data; runtime exports added only after freeze. */
export const AGENT_ANNOTATOR_TIMEOUT_MS: 800
export const EXPOSURE_ANNOTATOR_TIMEOUT_MS: 500
export const EXPOSURE_CONTRIBUTOR_TIMEOUT_MS: 500
export const AGENT_ANNOTATIONS_PER_ID_MAX: 4
export const EXPOSURE_TEXT_MAX_LENGTH: 300
export const REASON_LOCALES_MAX_ENTRIES: 16
export const REASON_LOCALE_KEY_MAX_LENGTH: 32
export const ROOT_RESOLVE_MAX_DEPTH: 64
export const CATALOG_ROWS_MAX: 20000
export const CATALOG_BYTES_MAX: 8388608
export const CATALOG_SOURCES_PER_ROW_MAX: 64
export const CATALOG_PROJECT_PATHS_PER_SKILL_MAX: 64
export const CATALOG_IMPORT_RECORDS_MAX: 10000
export const CATALOG_WRITE_DEBOUNCE_MS: 1000
export const CATALOG_RECONCILE_MS: 30000
export const FAMILY_SERVICE: 'bbffFamily'
export const UI_SERVICE: 'bbffUi'
export const MODULE_ID_PATTERN: RegExp
export const CARD_ID_PATTERN: RegExp
export const TOOL_NAME_PATTERN: RegExp
export function validateModuleTools(tools: unknown): { ok: boolean; errors: string[] }
export function validateModuleExclusiveTools(value: unknown, tools: unknown): { ok: boolean; errors: string[] }
export const MODULE_TITLE_MAX_LENGTH: number
export const MODULE_DESCRIPTION_MAX_LENGTH: number
export const CARD_TITLE_MAX_LENGTH: number
export const CARD_HEIGHT_MIN: number
export const CARD_HEIGHT_MAX: number
export const CORE_CARD_ORDER: number
export const MODULE_CARD_ORDER_DEFAULT: number

export interface LocalizedText {
  zh: string
  en: string
}

export function isModuleId(value: unknown): boolean
export function isCardId(value: unknown): boolean
export function isLocalizedText(value: unknown): boolean
export function namespacedCardId(moduleId: string, cardId: string): string

export interface BbffModuleUiDeclaration {
  cards?: string[]
  settings?: boolean
}

/** v1.5: visibility is owned by the module; workspace-scope rules do not apply. */
export interface BbffExclusiveToolsDeclaration {
  /** Non-empty unique exact names, all contained in descriptor.tools. */
  tools: string[]
  /** Nonblank, trimmed; at most 300 characters. */
  reason: string
  /** At most 16 nonempty entries; keys at most 32, values at most 300 characters. */
  reasonLocales?: Record<string, string>
}

/** Host-side descriptor every family module registers. */
export interface BbffLocaleDeclaration {
  /** Package-relative dictionary directory; defaults to `locale`. */
  dir?: string
}

export interface BbffFamilyModuleDescriptor {
  contract: 1
  /** Module id, e.g. `memory`; namespaces its card ids and settings section ids. */
  id: string
  /** Display title: a message reference in this package's namespace, or legacy text. */
  title: string | BbffMessageRef | LocalizedText
  /** One-sentence description shown in diagnostics/settings. */
  description: string | BbffMessageRef | LocalizedText
  /** Module package version. */
  version: string
  /** Module package name (`oh-my-bbff-...`). */
  packageName: string
  /** Locale dictionaries this package ships; the root reads `<dir>/<language>.json` and registers them. */
  locale?: BbffLocaleDeclaration
  /** Host route base, e.g. `/oh-my-bbff-memory/api`, when the module serves an API. */
  apiBase?: string
  /** Declared UI contributions (diagnostics; registration itself is client-side). */
  ui?: BbffModuleUiDeclaration
  /** v1.3: exact owned tool names; /^[A-Za-z0-9_-]{1,64}$/, unique. Invalid lists are dropped with diagnostics. */
  tools?: string[]
  /** v1.5: tools exist only in module-owned sessions; feature-detect this field on list() entries. */
  exclusiveTools?: BbffExclusiveToolsDeclaration
  /** FROZEN v1.6: exact synthetic/masking skill provider ids; data-only, copied/frozen by root. */
  skillMaskProviders?: string[]
  /** FROZEN v1.6: exact keys must be a subset of this descriptor's tools. */
  toolTraits?: Record<string, { effect: 'read' | 'write' | 'delegate' }>
  /** Native/other tools needed by this module's sessions; NOT an ownership declaration. */
  requiredTools?: { tools: string[]; reason: string; reasonLocales?: Record<string, string> }
  /** A module-owned restriction layer; optional link targets its settings section. */
  permissionLayer?: { title: string; titleLocales?: Record<string, string>; settingsSectionId?: string }
}

export interface BbffExposureItem {
  kind: 'tool' | 'mcp' | 'skill'
  name: string
  server?: string
}
export interface BbffExposureInput {
  sessionId: string
  rootSessionId: string
  cwd?: string
  items: readonly BbffExposureItem[]
}
export interface BbffExposureAnnotation {
  kind: 'tool' | 'mcp' | 'skill'
  name: string
  available: false
  reason: string
  reasonLocales?: Record<string, string>
  by?: string
}
export type BbffExposureAnnotator = (input: BbffExposureInput) => BbffExposureAnnotation[] | Promise<BbffExposureAnnotation[]>
export interface BbffExposureSession {
  sessionId: string
  rootSessionId: string
  cwd?: string
}
export interface BbffExposureContribution {
  tools?: { name: string; description: string }[]
  exclusive?: boolean
  reason?: string
  reasonLocales?: Record<string, string>
  /** Defaults false: the module, not a session checkbox, controls these tools. */
  toggleable?: boolean
}
export type BbffExposureContributor = (input: BbffExposureSession) => BbffExposureContribution | null | Promise<BbffExposureContribution | null>
export function validateExposureContribution(value: unknown): { ok: boolean; errors: string[] }
export interface BbffAgentAnnotation {
  label: string | Record<string, string>
  tone?: 'default' | 'info' | 'warning' | 'success'
  title?: string
}

export interface BbffRootResolution {
  readonly rootSessionId: string
  readonly cwd: string | null
  readonly resolved: boolean
  readonly reason: string
}
export interface BbffFamilyDiagnostic extends BbffCatalogReason {
  readonly code: 'invalid-descriptor' | 'incompatible-descriptor' | 'optional-field-dropped' | 'duplicate-module' | 'timeout' | 'callback-error' | 'invalid-result' | 'result-truncated'
  readonly moduleId?: string
  readonly feature: 'descriptor' | 'agent-annotator' | 'exposure-annotator' | 'exposure-contributor'
}
export interface BbffCollectionOutcome {
  readonly moduleId: string
  readonly status: 'ok' | 'not-applicable' | 'timeout' | 'error' | 'invalid'
}
export interface BbffCollection<T> {
  readonly items: T
  readonly outcomes: readonly BbffCollectionOutcome[]
  readonly diagnostics: readonly BbffFamilyDiagnostic[]
}

/** Root-provided registry service (`bbffFamily`). */
export interface BbffFamilyService {
  contract: 1
  /** v1.6 root.id is also the self-registered descriptor id; optional only for older-root detection. */
  root: { id?: string; packageName: string; version: string; title?: string; apiBase?: string; tools?: readonly string[]; skillMaskProviders?: readonly string[] }
  /** FROZEN v1.6 optional on older roots: shared header-chain resolver, never activates a session. */
  resolveRoot?(sessionId: string): Promise<BbffRootResolution>
  diagnostics?(): readonly BbffFamilyDiagnostic[]
  /** FROZEN v1.6: root-only discovery provider. Feature-detect; not implemented by SDK0.1.6. */
  readonly catalog?: BbffCatalogService
  register(descriptor: BbffFamilyModuleDescriptor): () => void
  /** v1.2/v1.3 additive capabilities: feature-detect on older roots. */
  registerAgentAnnotator?(moduleId: string, annotate: (ids: string[]) => Record<string, BbffAgentAnnotation | BbffAgentAnnotation[]> | Promise<Record<string, BbffAgentAnnotation | BbffAgentAnnotation[]>>): () => void
  annotateAgents?(ids: string[]): Promise<Record<string, (BbffAgentAnnotation & { module: string })[]>>
  registerExposureAnnotator?(moduleId: string, annotate: BbffExposureAnnotator): () => void
  annotateExposure?(input: BbffExposureInput): Promise<readonly BbffExposureAnnotation[]>
  /** v1.4: session-scoped contributions; feature-detect registration on old roots. */
  registerExposureContributor?(moduleId: string, fn: BbffExposureContributor): () => void
  contributeExposure?(input: BbffExposureSession): Promise<readonly (BbffExposureContribution & { module: string; moduleTitle: string })[]>
  /** v1.6 detailed collectors distinguish timeout/error/invalid from contributor null. */
  collectAgentAnnotations?(ids: string[]): Promise<BbffCollection<Readonly<Record<string, readonly (BbffAgentAnnotation & { module: string })[]>>>>
  collectExposureAnnotations?(input: BbffExposureInput): Promise<BbffCollection<readonly BbffExposureAnnotation[]>>
  collectExposureContributions?(input: BbffExposureSession): Promise<BbffCollection<readonly (BbffExposureContribution & { module: string; moduleTitle: string })[]>>
  list(): readonly (BbffFamilyModuleDescriptor & { compatible: boolean; readonly warnings?: readonly string[]; readonly errors?: readonly string[] })[]
  get(id: string): (BbffFamilyModuleDescriptor & { compatible: boolean; readonly warnings?: readonly string[]; readonly errors?: readonly string[] }) | undefined
  subscribe(listener: (modules: readonly (BbffFamilyModuleDescriptor & { compatible: boolean; readonly warnings?: readonly string[]; readonly errors?: readonly string[] })[]) => void): () => void
}

/** FROZEN v1.6 catalog surface. No runtime implementation or package export is added in phase1. */
export type BbffCatalogKind = 'tool' | 'mcp' | 'skill'
export type BbffCatalogSource = 'host' | `preset:${string}` | 'session-local'
  | `bbff:${string}` | `mcp:${string}` | 'configured' | 'resource-prompt' | `project:${string}`
export interface BbffCatalogModule { readonly id: string; readonly title: string }
export interface BbffCatalogReason {
  readonly reason: string
  readonly reasonLocales?: Readonly<Record<string, string>>
}
export interface BbffCatalogDiagnostic extends BbffCatalogReason {
  readonly code: string
  /** Stable adapter inference id, or provider source id such as project-skills/ledger. */
  readonly inference: string
  readonly severity: 'warning' | 'error'
  /** Added by root when merging a compatible module's reported inference failure. */
  readonly module?: BbffCatalogModule
  /** Pending-durability diagnostics expose buffered count and the oldest unflushed timestamp. */
  readonly pendingRows?: number
  readonly pendingSince?: string
}
export interface BbffCatalogAdapterDiagnostic extends BbffCatalogReason {
  readonly code: import('./dsh-adapter.js').DshInferenceId
  readonly inference: import('./dsh-adapter.js').DshInferenceId
  readonly severity: 'warning' | 'error'
}
export type BbffFactBasis =
  | { readonly kind: 'setting'; readonly source: string; readonly settingPath: string; readonly default: string }
  | { readonly kind: 'contract'; readonly source: string; readonly module: BbffCatalogModule }
  | { readonly kind: 'adapter'; readonly source: string; readonly inference: import('./dsh-adapter.js').DshInferenceId; readonly packageName: string; readonly packageVersion?: string }
export type BbffCatalogOwner =
  | { readonly kind: 'dsh' }
  | { readonly kind: 'bbff'; readonly module: BbffCatalogModule }
  | { readonly kind: 'mcp'; readonly server: string }
  | { readonly kind: 'unknown' }
export interface BbffCatalogExclusive extends BbffCatalogReason {
  /** Current live descriptor only; root persists no declarations or release facts. */
  readonly module: BbffCatalogModule
}
export interface BbffCatalogKey { readonly kind: BbffCatalogKind; readonly name: string }
export interface BbffCatalogEntryBase extends BbffCatalogKey {
  readonly description: string
  readonly sources: readonly BbffCatalogSource[]
  /** Sources/project paths overflowed their64-element cap; accompanied by diagnostics. */
  readonly sourcesTruncated: boolean
  /** Most recent actual observation source, not a declaration or current-presence claim. */
  readonly latestSource?: BbffCatalogSource
  readonly owner: BbffCatalogOwner
  /** Per-row attribution evidence, including an honest unknown inference result. */
  readonly ownerBasis: BbffFactBasis
  readonly declaredBy: readonly BbffCatalogModule[]
  /** Present at the last successful refresh of this slice; declarations/import alone are not presence. */
  readonly present: boolean
  /** Last-success facts retained after a failed refresh. Successful empty slices remove presence. */
  readonly stale: boolean
  /** Observed at least once since this provider started, including entries subsequently unloaded. */
  readonly seenThisRun: boolean
  readonly firstSeenAt: string | null
  readonly lastSeenAt: string | null
}
export interface BbffCatalogTool extends BbffCatalogEntryBase {
  readonly kind: 'tool'
  readonly mcpServer?: string
  readonly reserved?: BbffCatalogReason
  readonly exclusive?: BbffCatalogExclusive
  /** At least one own-layer definition, including a same-name shadow by definition identity. */
  readonly sessionLocal: boolean
  readonly effect?: 'read' | 'write' | 'delegate'
  readonly effectBasis?: BbffFactBasis
}
export interface BbffCatalogMcpServer extends BbffCatalogEntryBase {
  readonly kind: 'mcp'
  /** Omitted means unknown, never inferred from the presence of some tool. */
  readonly configured?: boolean
  readonly configuredEnabled?: boolean
  readonly toolCount: number
  readonly currentToolCount: number
  /** No current tools: may be disconnected, failed, or tool-less; not proof of resource-only behavior. */
  readonly zeroCurrentTools: boolean
  readonly coldCatalog: boolean
}
export interface BbffCatalogSkillContext {
  readonly projectPath?: string
  readonly sources: readonly BbffCatalogSource[]
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}
export interface BbffCatalogSkill extends BbffCatalogEntryBase {
  readonly kind: 'skill'
  /** Independent OR summaries across contexts; not a promise of invocation in every context. */
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly projectPaths: readonly string[]
  readonly contexts: readonly BbffCatalogSkillContext[]
}
export type BbffCatalogEntry = BbffCatalogTool | BbffCatalogMcpServer | BbffCatalogSkill
export interface BbffCatalogNewRoot {
  readonly cwd: string
  readonly state: 'pending' | 'ready' | 'error'
  readonly complete: boolean
  readonly diagnostics: readonly BbffCatalogDiagnostic[]
  readonly defaultPresetId?: string
  /** Keys of entries actually present for host + default preset + this project's skills. */
  readonly entries: readonly BbffCatalogKey[]
  /** Exact invocation flags for this projection, rather than the full-catalog OR summary. */
  readonly skills: readonly { readonly name: string; readonly modelInvocable: boolean; readonly userInvocable: boolean }[]
  readonly resourceServers: readonly string[]
  readonly sections: readonly string[]
}
export interface BbffCatalogSnapshot {
  readonly contract: 1
  /** Opaque equality token; not a wall-clock number and not ordered across providers/processes. */
  readonly revision: string
  readonly generatedAt: string
  readonly origin: 'live' | 'cached'
  /** Root-normalized absolute cwd/cache key, when requested. */
  readonly cwd?: string
  readonly complete: boolean
  readonly diagnostics: readonly BbffCatalogDiagnostic[]
  readonly entries: readonly BbffCatalogEntry[]
  /** Present when snapshot({cwd}) requested; a pending projection never falls back to all entries. */
  readonly newRoot?: BbffCatalogNewRoot
}
export interface BbffCatalogChange {
  readonly revision: string
  readonly reasons: readonly ('tools' | 'agents' | 'presets' | 'family' | 'skills' | 'projects' | 'ledger' | 'forget' | 'import' | 'diagnostics')[]
  readonly projectPaths: readonly string[]
}
export interface BbffCatalogToolAttribution {
  readonly server?: string
  readonly basis: 'known' | 'hint' | 'fallback' | 'none'
  /** Hints/fallbacks are uncertain; a hint never overrides a known-server prefix. */
  readonly uncertain: boolean
  /** Every known/hint prefix match, not just the display winner. Enforcement checks ANY hidden candidate. */
  readonly candidates: readonly { readonly server: string; readonly basis: 'known' | 'hint' }[]
  readonly ambiguous: boolean
  readonly diagnostics: readonly BbffCatalogDiagnostic[]
}
/** The only shape accepted by importObservations; no owner/declaration/presence/executable fields. */
export interface BbffCatalogObservationRecord {
  readonly kind: BbffCatalogKind
  readonly name: string
  readonly description: string
  readonly sources: readonly BbffCatalogSource[]
  readonly latestSource?: BbffCatalogSource
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly sessionLocal?: boolean
  readonly projectPaths?: readonly string[]
}
export type BbffCatalogForgetResult =
  | { readonly ok: true; readonly changed: boolean; readonly revision: string }
  | { readonly ok: false; readonly code: 'present' | 'declared' | 'exclusive' | 'reserved' | 'incomplete' | 'unsupported-kind' | 'busy' | 'storage-error'; readonly diagnostic: BbffCatalogDiagnostic }
export type BbffCatalogImportResult =
  | { readonly ok: true; readonly imported: number; readonly merged: number; readonly unchanged: number; readonly revision: string }
  | { readonly ok: false; readonly code: 'invalid-module' | 'invalid-records' | 'ledger-full' | 'busy' | 'storage-error'; readonly diagnostic: BbffCatalogDiagnostic }
export interface BbffCatalogService {
  /** Cache-only, synchronous, deeply frozen; a new cwd queues work and returns pending/incomplete. */
  snapshot(options?: { readonly cwd?: string }): BbffCatalogSnapshot
  /** Debounced display/inventory invalidation, including an initial scheduled notification. */
  subscribe(listener: (change: BbffCatalogChange) => void): () => void
  forget(kind: BbffCatalogKind, name: string): Promise<BbffCatalogForgetResult>
  /** Provider resolves known prefix, then non-observation rule hints, then adapter fallback. */
  attributeTool(name: string, options?: { readonly serverHints?: readonly string[] }): BbffCatalogToolAttribution
  /** Cooperative compatible registered module id; at most10,000 records, atomic union, no digest bookkeeping. */
  importObservations(moduleId: string, records: readonly BbffCatalogObservationRecord[]): Promise<BbffCatalogImportResult>
  /** Replaces this module's inference-id-only set; disposer/unregister clears it, never root failures. */
  reportAdapterDiagnostics(moduleId: string, diagnostics: readonly BbffCatalogAdapterDiagnostic[]): () => void
}

export type BbffComponent<P = Record<string, unknown>> = (props: P) => unknown

/** Card body registered into the status panel; the root owns the card chrome. */
export interface BbffCardDefinition {
  id: string
  title: LocalizedText | BbffMessageRef | string
  /** Default 100; core cards are lower. */
  order?: number
  /** Initial card body height in px (80...900). */
  defaultHeight?: number
  /** Component rendered as the card body. */
  component: BbffComponent<BbffCardProps>
  /**
   * Card ids used before namespacing existed (e.g. `memory`); the root migrates
   * persisted layout ids to `moduleId/cardId` once, using this declaration.
   */
  legacyIds?: string[]
}

/** Settings section registered into the BBFF settings panel. */
export interface BbffSettingsSectionDefinition {
  /** v1.6 registrations must supply this; omitted legacy sections render as unattributed with diagnostics. */
  moduleId?: string
  id: string
  title: LocalizedText | BbffMessageRef | string
  order?: number
  component: BbffComponent<BbffSettingsProps>
}

export interface BbffCardProps {
  moduleId: string
  sessionId: string | null
  kit: BbffUiKit
  /** Translate in this module's package namespace: `t(key, params)`. */
  t: (key: string, params?: Record<string, unknown>) => string
}

export interface BbffSettingsProps {
  moduleId: string
  kit: BbffUiKit
  /** Translate in this module's package namespace: `t(key, params)`. */
  t: (key: string, params?: Record<string, unknown>) => string
}

/**
 * The only UI surface a module may rely on. The root wraps cards in its own
 * chrome and applies layout/drag/collapse/resize/persistence.
 */
export interface BbffUiKit {
  Row: BbffComponent<{ children?: unknown; compact?: boolean }>
  Checkbox: BbffComponent<{ checked: boolean; disabled?: boolean; label?: unknown; onChange?: (checked: boolean) => void }>
  Badge: BbffComponent<{ children?: unknown; tone?: 'default' | 'info' | 'success' | 'warning' | 'danger'; title?: string; explain?: { source: string; settingPath?: string; default?: string } }>
  Hint: BbffComponent<{ children?: unknown }>
  Empty: BbffComponent<{ children?: unknown }>
  Spinner: BbffComponent<{ label?: string }>
  ErrorText: BbffComponent<{ children?: unknown }>
  /** Primary/ghost action button owned by the root chrome. */
  Button: BbffComponent<{
    children?: unknown
    onClick?: () => void
    disabled?: boolean
    variant?: 'primary' | 'ghost'
    title?: string
  }>
  /** Text/number input; onChange receives the raw string value. */
  Input: BbffComponent<{
    value?: string | number
    onChange?: (value: string) => void
    type?: 'text' | 'number'
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    label?: string
  }>
  postJson(path: string, body: unknown): Promise<any>
  getJson(path: string): Promise<any>
  useSession(): string | null
  usePoll(callback: () => void, intervalMs: number): void
  /** Open a session in the main conversation view (no-op when unavailable). */
  openSession(sessionId: string): void
  /** v1.6 navigation to a contract-declared permission/settings section; feature-detect on older roots. */
  openSettingsSection?(moduleId: string, settingsSectionId: string): void
  /** Open a file in the right-sidebar preview; relative paths resolve against the session cwd. */
  openFile(path: string, options?: { kind?: 'text' }): void
  /** Translate in the rendering module's package namespace (reads the active locale at call time). */
  t(key: string, params?: Record<string, unknown>): string
  /**
   * Resolve Host-produced text: a message reference resolves through its namespace,
   * a legacy `{ en, … }` map through DSH's `resolveText`, a string verbatim.
   */
  resolveText(value: unknown): string
  /**
   * Current theme token values. Keys are the `--dsw-alias-*` names available in
   * the UI shell (e.g. `--dsw-alias-bg-layer-1`, `--dsw-alias-border-l1`,
   * `--dsw-alias-label-primary`); missing keys are `undefined`.
   */
  tokens: Record<string, string>
}

/** Root-provided client registration service (`bbffUi`). */
export interface BbffUiService {
  contract: 1
  registerCard(definition: BbffCardDefinition): () => void
  registerSettingsSection(definition: BbffSettingsSectionDefinition): () => void
  readonly kit: BbffUiKit
}

export function validateModuleDescriptor(descriptor: unknown): { ok: boolean; errors: string[]; warnings?: string[] }
export function validateCard(card: unknown): { ok: boolean; errors: string[] }
export function validateSettingsSection(section: unknown): { ok: boolean; errors: string[] }

/** Register the host-half descriptor; safe when the root is absent or loads later. */
export function registerFamilyModule(ctx: unknown, descriptor: BbffFamilyModuleDescriptor): () => void

/** Register the client-half cards and settings sections. */
export function registerUiAdditions(
  ctx: unknown,
  additions: { cards?: BbffCardDefinition[]; sections?: BbffSettingsSectionDefinition[] },
): () => void
