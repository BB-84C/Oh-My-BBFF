/** FROZEN v1.6 API for future dsh-adapter.js; no runtime/export yet.
 * Pure projected-data primitives only: no Context, I/O, service calls or discovery orchestration.
 */
import type { BbffCatalogDiagnostic, BbffCatalogReason, BbffCatalogSource, BbffCatalogToolAttribution } from './index.js'
export type DshInferenceId = 'mcp-tool-name' | 'reserved-transport' | 'configured-mcp'
  | 'resource-section' | 'mcp-section-name' | 'resource-tool-names' | 'registration-provenance'
  | 'restriction-error' | 'skill-dispatch' | 'native-tool-classes' | 'superagent-identity'
  | 'subagent-provider' | 'compact-command' | 'session-header' | 'session-log-events'
  | 'prompt-sections' | 'system-reminder-wrapper' | 'native-presentation'
  | 'resource-address' | 'instruction-loader' | 'goal-defaults' | 'skill-name' | 'model-selection'
  | 'context-pressure' | 'retained-composition'
export interface DshConventionBasis {
  readonly inference: DshInferenceId
  readonly convention: string
  readonly ownerPackage: string
  readonly verifiedPackageVersions: readonly string[]
  readonly evidenceRequired: string
}
export interface DshAdapterCheck {
  readonly inference: DshInferenceId
  readonly ownerPackage: string
  readonly actualVersion?: string
  readonly state: 'pass' | 'fail' | 'not-observed'
  readonly evidence: string
}
export interface DshAdapterResult<T> {
  readonly value: T
  readonly complete: boolean
  readonly diagnostics: readonly BbffCatalogDiagnostic[]
}
export const DSH_ADAPTER_CONTRACT: 1
/** Locale namespace owning the adapter's own dictionaries (`locale/*.json` in the SDK). */
export const SDK_NAMESPACE: 'oh-my-bbff-sdk'
/** Marker value of a locale message reference. */
export const MESSAGE_REF_MARKER: 'bbff-message'
/** Build a locale message reference; host code emits references instead of text. */
export function msg(key: string, params?: Record<string, string | number>, ns?: string): { readonly $bbff: 'bbff-message'; readonly key: string; readonly params?: Readonly<Record<string, string | number>>; readonly ns?: string }
export function isMessageRef(value: unknown): boolean
export const DSH_CONVENTIONS: readonly DshConventionBasis[]
/** Each value is resolved from pluginPackages.packageOf(...).version; no global CLI-version switch. */
export type DshPackageVersions = Readonly<Record<string, string | undefined>>
export const VERIFIED_PACKAGE_VERSIONS: Readonly<Record<string, readonly string[]>>
export const MCP_RESOURCE_TOOL_NAMES: readonly string[]
export const MCP_RESOURCE_SECTION_NAME: string
export const MCP_SECTION_ORDER_KEY: string
export const SKILL_TOOL_NAME: string
export const SKILL_NAME_PATTERN: RegExp
export const MCP_SERVER_NAME_PATTERN: RegExp
export const TOOL_NAME_PATTERN: RegExp
export interface DshMcpToolAttribution extends BbffCatalogToolAttribution {
  readonly server: string
  /** Opaque public suffix; NEVER an original wire rawName. */
  readonly suffix: string
  readonly basis: 'known' | 'hint' | 'fallback'
}
/** Active consumers use catalog.attributeTool; provider/cached fallback share this implementation. */
export function parseMcpToolName(name: string, knownServers?: readonly string[], serverHints?: readonly string[]): DshAdapterResult<DshMcpToolAttribution | null>
export function reservedTool(name: string): BbffCatalogReason | undefined
export function mcpSectionName(server: string): string
export function serverFromMcpSectionName(name: string): DshAdapterResult<string | null>
export function isMcpResourceTool(name: string): boolean
export function resourceServerArgument(name: string, args: unknown): string | undefined
export function skillNameArgument(name: string, args: unknown): string | undefined
export interface DshLoaderEvidenceRow {
  readonly moduleName: string
  readonly packageName?: string
  /** Input-only; never returned/serialized/logged. Adapter reads only recognized fields. */
  readonly config?: unknown
  readonly enabled?: boolean
  readonly source: BbffCatalogSource
}
export interface DshConfiguredServer { readonly name: string; readonly enabled?: boolean; readonly sources: readonly BbffCatalogSource[] }
/** Configured/disabled metadata ONLY, never negative roster evidence. */
export function scanConfiguredServers(rows: readonly DshLoaderEvidenceRow[], options: { readonly traversalComplete: boolean }): DshAdapterResult<readonly DshConfiguredServer[]>
export interface DshPromptSection { readonly name: string; readonly text: string }
/** Retained tags identify preset provenance only; actual parent keys remain provider-private slices. */
export type DshMaskFreeView = 'unscoped' | `preset:${string}` | `retained-preset:${string}`
export interface DshSectionEvidence { readonly view: DshMaskFreeView; readonly sections: readonly DshPromptSection[]; readonly complete: boolean }
/** Primary roster from unscoped/current/retained-preset-parent identities; includes zero-tool servers. */
export function serversFromSections(evidence: readonly DshSectionEvidence[]): DshAdapterResult<readonly string[]>
export function parseResourceSection(section: DshPromptSection | undefined): DshAdapterResult<readonly string[]>
/** Failure returns original unchanged; null only after successful parse leaves no names. */
export function rewriteResourceSection(section: DshPromptSection, hiddenServers: readonly string[]): DshAdapterResult<DshPromptSection | null>
export interface DshRegistrationEffect { readonly label: string; readonly packageName?: string }
export interface DshRegistrationAudit {
  readonly nativeResidueProven: boolean
  readonly unknownRegistrations: number
  readonly thirdPartyPackages: readonly string[]
  readonly undeclaredFamilyPackages: readonly string[]
}
export function auditRegistrationEvidence(effects: readonly DshRegistrationEffect[], options: {
  readonly traversalComplete: boolean; readonly familyPackages: readonly string[]; readonly declaredFamilyPackages: readonly string[]
}): DshAdapterResult<DshRegistrationAudit>
export function unknownRestrictionNames(message: string): DshAdapterResult<readonly string[] | null>
export interface DshNativeToolTrait extends BbffCatalogReason {
  readonly effect?: 'read' | 'write' | 'delegate'
  readonly ownerPackage?: string
}
/** Unknown effect stays unknown with diagnostics, NEVER defaults to read. */
export function nativeToolTrait(name: string): DshAdapterResult<DshNativeToolTrait>
export function nativeToolGroup(group: 'write' | 'delegate' | 'team-report' | 'team-spawn'): DshAdapterResult<readonly string[]>
/** SDK0.1.10 exhaustive installed-native source coverage. Factories name no tool identities. */
export interface DshNativeToolEffectEvidence {
  readonly id: string
  readonly kind: 'tool' | 'factory' | 'transport'
  readonly ownerPackage: string
  readonly packageVersion: string
  readonly names: readonly string[]
  readonly effect: 'read' | 'write' | 'delegate' | 'unknown'
  readonly reason: string
  readonly naming: 'literal' | 'configured' | 'reserved' | 'upstream' | 'caller' | 'fixture'
  readonly groups?: readonly ['team-spawn']
  readonly defaultName?: string; readonly configProperty?: string
  readonly reserved?: true
  readonly conditional?: { readonly configProperty: string; readonly configured: 'write'; readonly absent: 'read' }
  readonly conditions: readonly { readonly source: string; readonly reason: string }[]
  readonly sites: readonly { readonly file: string; readonly line: number; readonly kind: 'definition' | 'registration' | 'configuration'; readonly sha256: string }[]
}
export const NATIVE_TOOL_EFFECTS: readonly DshNativeToolEffectEvidence[]
export function nativeToolSource(name: string): DshAdapterResult<{ readonly packageName?: string }>
export function nativeSubagentProvider(): string
export function nativeCompactCommand(): { readonly name: string; readonly definitionId: string }
export function isNativeCompactCommand(definition: unknown): DshAdapterResult<boolean>
export interface DshHeaderFacts {
  readonly sessionId?: string; readonly parentId?: string; readonly cwd?: string
  readonly isSubagent: boolean; readonly depth?: number; readonly presetId?: string
}
export function sessionHeaderFacts(header: unknown): DshAdapterResult<DshHeaderFacts>
export function superagentIdentity(input: { readonly sessionId?: string; readonly presetId?: string; readonly orchestrator?: unknown }): DshAdapterResult<{ readonly foreign: boolean; readonly basis: string }>
export function orchestratorServiceName(): string
export interface DshRouteFact { readonly provider: string; readonly model: string; readonly effort?: string }
export interface DshAssistantMessageFact { readonly text: string }
export const DSH_PROJECTION_KEYS: Readonly<Record<'context-pressure' | 'model-selection', string>>
export function projectionKey(kind: keyof typeof DSH_PROJECTION_KEYS): string
export interface DshContextPressureFacts {
  readonly usedTokens: number | null
  readonly windowTokens: number | null
  readonly percent: number | null
  readonly pressureTokens: number | null
  readonly basis: 'projected' | 'last-request' | 'unavailable'
  readonly independentSlots: true
}
/** Explicit native STATE vs WIRE. Formula/schema belongs to dsh-token-meter, not a consumer. */
export function contextPressureFacts(projection: unknown, options: { readonly view: 'state' | 'wire' }): DshAdapterResult<DshContextPressureFacts>
/** Event wrapper and direct derived-message shape decode to the same normalized text. No excerpt cap. */
export function assistantMessageFacts(input: unknown, options: { readonly view: 'event' | 'message' }): DshAdapterResult<DshAssistantMessageFact | null>
/** SDK0.1.8 additive goal-history facts; timestamps are epoch milliseconds. */
export interface DshGoalFact {
  readonly id?: string; readonly revision?: number
  readonly objective?: string; readonly maxRounds?: number; readonly status?: string
  readonly createdAt?: number; readonly updatedAt?: number
}
/** SDK0.1.9 additive native envelope metadata; absent evidence remains absent. */
export interface DshEventMetadata { readonly seq?: number; readonly time?: number }
export type DshEventFacts = DshEventMetadata & (
  | { readonly kind: 'user-message'; readonly text: string; readonly source: string; readonly isHuman: boolean }
  | { readonly kind: 'turn-start'; readonly turn: number }
  | { readonly kind: 'todo-write'; readonly todos: readonly { readonly content: string; readonly status: 'pending' | 'in_progress' | 'completed' }[] }
  | { readonly kind: 'goal-change'; readonly goal: DshGoalFact | null; readonly clearedId?: string; readonly revision?: number; readonly updatedAt?: number }
  | { readonly kind: 'request-header'; readonly route?: DshRouteFact }
  | { readonly kind: 'model-selection'; readonly route: DshRouteFact }
  | { readonly kind: 'assistant-message'; readonly message: DshAssistantMessageFact }
  | { readonly kind: 'subagent-catalog'; readonly child: { readonly sessionId: string; readonly createdAt: number; readonly mode: 'one-shot' | 'continuable' | 'external' | 'unknown'; readonly label?: string; /** Catalog v3 (DSH 0.2.2) sibling-unique agent name. */ readonly name?: string } }
  | { readonly kind: 'subagent-descriptor'; readonly childId: string; readonly description?: string; readonly mode: 'one-shot' | 'continuable' | 'unknown' }
  | { readonly kind: 'team-member'; readonly member: { readonly sessionId: string; readonly name?: string; readonly role?: string; readonly status?: string } }
)
/** Raw native event keys/layouts are decoded here; consumers receive normalized DTOs. */
export function sessionEventFacts(event: unknown): DshAdapterResult<DshEventFacts | null>
/** SDK0.1.13 additive activity decoding for the Lead recent-activity query; recorded fields only. */
export interface DshLlmFailureFact {
  readonly message: string; readonly code: string
  readonly status?: number; readonly providerRetryAfterMs?: number; readonly requestId?: string; readonly offloadImages?: number
}
export interface DshFinishFact { readonly kind: string; readonly failure?: DshLlmFailureFact }
export type DshActivityFacts = DshEventMetadata & (
  | { readonly kind: 'tool-call'; readonly turn: number; readonly step: number; readonly callId: string; readonly name: string; readonly arguments: string }
  | { readonly kind: 'tool-result'; readonly turn: number; readonly step: number; readonly callId: string; readonly isError: boolean; readonly text: string; readonly blockKinds?: readonly string[]; readonly error?: { readonly name: string; readonly code: string; readonly reason?: string } }
  | { readonly kind: 'job-registered'; readonly jobId: string; readonly owner: string; readonly producerKind: string; readonly label: string; readonly startedAt: number; readonly toolCall?: { readonly callId: string; readonly rootCallId: string } }
  | { readonly kind: 'job-settled'; readonly jobId: string; readonly owner: string; readonly producerKind: string; readonly label: string; readonly startedAt: number; readonly finishedAt: number; readonly status: 'completed' | 'killed' | 'failed'; readonly cause: 'producer' | 'kill' | 'teardown'; readonly producerReported: boolean; readonly detail?: string; readonly toolCall?: { readonly callId: string; readonly rootCallId: string } }
  | { readonly kind: 'assistant-message'; readonly turn: number; readonly step: number; readonly blockKinds: readonly string[]; readonly text: string; readonly reasoning: string; readonly textLength: number; readonly reasoningLength: number; readonly toolCalls: readonly { readonly id: string; readonly name?: string }[]; readonly finish: DshFinishFact | null; readonly interrupted: boolean }
  | { readonly kind: 'assistant-attempt'; readonly turn: number; readonly step: number; readonly blockKinds: readonly string[]; readonly textLength: number; readonly reasoningLength: number; readonly toolCalls: readonly { readonly id: string; readonly name?: string }[]; readonly finish: DshFinishFact | null }
  | { readonly kind: 'turn-end'; readonly turn: number; readonly reason: { readonly kind: string; readonly failure?: DshLlmFailureFact; readonly cause?: { readonly kind: string; readonly reason?: string } } }
  | { readonly kind: 'llm-retry'; readonly retryId: string; readonly turn: number; readonly step: number; readonly provider: string; readonly mode: 'normal' | 'always'; readonly policyKey: string; readonly retry: number; readonly maxRetries?: number; readonly delayMs: number; readonly failure: DshLlmFailureFact }
  | { readonly kind: 'llm-retry-started'; readonly retryId: string; readonly turn: number; readonly step: number; readonly retry: number }
  | Exclude<DshEventFacts, { readonly kind: 'assistant-message' }>
  | { readonly kind: 'other'; readonly eventType: string }
)
/** Additive SDK0.1.13 decoder: raw-but-faithful activity fields, no verdict/health classification. */
export function activityEventFacts(event: unknown): DshAdapterResult<DshActivityFacts | null>
export function promptSectionConvention(kind: 'team-policy' | 'deployment-persona' | 'subagent-delegation' | 'mcp'): { readonly key: string; readonly orderKey: string }
export function wrapSystemReminder(text: string): string
export function nativePresentationMode(): string
export interface DshResourceAddressInput {
  readonly kind: 'session' | 'subagent' | 'file'
  readonly sessionId?: string; readonly parentId?: string; readonly childId?: string
  readonly path?: string
  readonly mode?: 'one-shot' | 'continuable' | 'unknown'
}
export type DshNavigationTarget = string | { readonly parentSessionId: string; readonly childSessionId: string; readonly mode: 'one-shot' | 'continuable' | 'unknown' }
export interface DshResourceAddressFact {
  readonly address?: string
  readonly resourceKind?: string
  readonly navigationTarget?: DshNavigationTarget
  readonly openable: boolean
}
/** HOST ONLY. Root sessions return navigationTarget, never a fake resource URI/kind. */
export function resourceAddress(input: DshResourceAddressInput): DshAdapterResult<DshResourceAddressFact>
export interface DshInstructionFileFact {
  readonly path: string
  readonly status: 'loaded' | 'truncated' | 'over-budget' | 'missing' | 'unknown'
  readonly bytes?: number; readonly loadedBytes?: number
  readonly reason: string
}
export interface DshInstructionFacts {
  readonly candidates: readonly string[]
  readonly maxBytes?: number
  readonly files: readonly DshInstructionFileFact[]
}
/** Inputs include resolved native config + genuine read/assembly receipts. Existence alone never means loaded. */
export function instructionLoaderFacts(input: { readonly resolvedConfig?: unknown; readonly fileEvidence?: readonly unknown[]; readonly loadEvidence?: unknown }): DshAdapterResult<DshInstructionFacts>
export function resolvedGoalDefaults(resolvedConfig: unknown): DshAdapterResult<{ readonly maxGoalRounds?: number }>
/** Wire next may be lastUsed; never reinterpret it as a pending user override. */
export function modelSelectionFacts(projection: unknown, options: { readonly view: 'state' | 'wire' }): DshAdapterResult<{ readonly pending?: DshRouteFact; readonly next?: DshRouteFact; readonly mutationSupport: 'unverified' }>
export interface DshAdapterLiveEvidence {
  readonly packageVersions: DshPackageVersions
  readonly toolSchemas: readonly { readonly name: string; readonly parameters?: Readonly<Record<string, unknown>> }[]
  /** Corroborates reserved transport only when it actually appears; empty means not-observed, not failure. */
  readonly nonNativeToolSchemas: readonly { readonly name: string }[]
  readonly loaderRows: readonly DshLoaderEvidenceRow[]
  readonly loaderTraversalComplete: boolean
  readonly sectionViews: readonly DshSectionEvidence[]
  readonly registrationEffects: readonly DshRegistrationEffect[]
  readonly registrationTraversalComplete: boolean
  readonly familyPackages: readonly string[]
  readonly declaredFamilyPackages: readonly string[]
  readonly restrictionFailureMessage?: string
  /** Other package-specific facts (header/log/instruction/goal/etc.) projected by host readers. */
  readonly conventionEvidence?: Readonly<Partial<Record<DshInferenceId, unknown>>>
}
export interface DshAdapterReport {
  readonly complete: boolean
  readonly checks: readonly DshAdapterCheck[]
  readonly diagnostics: readonly BbffCatalogDiagnostic[]
}
/** Pure evaluator; package mismatch affects only that package's inferences. No active Agent probe. */
export function selfCheck(evidence: DshAdapterLiveEvidence): DshAdapterReport
