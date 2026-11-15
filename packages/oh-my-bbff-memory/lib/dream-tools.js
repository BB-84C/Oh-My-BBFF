/** Seven private Dreaming tools; dynamic limits and effective policy are exposed by status/settings. */
import { defineTool } from '@deepseek-ai/dsh-tools'
export const DREAM_TOOL_TRAITS = Object.freeze({ dream_status: { effect: 'read' }, dream_delta: { effect: 'read' }, dream_page: { effect: 'read' }, dream_read: { effect: 'read' }, dream_stage: { effect: 'write' }, dream_discard: { effect: 'write' }, dream_commit: { effect: 'write' } })
export const DREAM_TOOL_NAMES = Object.freeze(Object.keys(DREAM_TOOL_TRAITS))
const jsonOutput = { schema: { type: 'object', additionalProperties: true, properties: {} }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
const scopeParameter = { type: 'string', description: 'Memory scope: global or workspace; workspace operations require an absolute workspaceDir.', enum: ['global', 'workspace'] }
const workspaceParameter = { type: 'string', description: 'Absolute workspace root from the review manifest; never a drive root.' }
const directoryParameter = { type: 'string', description: 'Optional exact configured workspace memory-directory label from inventory.' }
export function registerDreamTools(ctx, options) {
  const service = options.tools || ctx.get('tools')
  const tools = options.tools || (typeof ctx.reflect?.trace === 'function' ? ctx.reflect.trace(service) : null)
  if (!tools?.register) throw new Error('Resident scoped tools.register is unavailable.')
  const definitions = new Map(), disposers = []
  let disposed = false
  const dispose = () => { if (disposed) return;disposed = true;for (const release of disposers.reverse()) { try { release?.() } catch {} } }
  try { for (const definition of options.definitions || createDreamToolDefinitions(options)) { const release = tools.register(definition);if (typeof release === 'function') disposers.push(release);definitions.set(definition.name, definition) } }
  catch (error) { dispose();throw error }
  Object.defineProperty(dispose, 'definitions', { value: definitions });return dispose
}
export function createDreamToolDefinitions(options) {
  const kernel = options.kernel
  const mutation = args => {
    if (!kernel.settings().dreamEnabled) throw new Error('Dreaming Resident is disabled; mutations are denied.')
    if (!options.lease?.describe?.().holder) throw new Error('Dreaming mutation requires the machine lease.')
    const active = kernel.readState().state.activeRun
    if (!active || (args?.runId && args.runId !== active.runId)) throw new Error('Mutation requires the current scheduled or explicitly authorized review.')
    return () => { if (!options.lease.describe().holder || kernel.readState().state.activeRun?.runId !== active.runId) throw new Error('Machine lease or review identity changed; further mutations denied.') }
  }
  const tool = (name, description, parameters, execute) => defineTool({ name, description, parameters, output: jsonOutput, execute, presentCall: args => ({ card: 'generic', title: name, kind: 'other', rawInput: args || {} }) })
  return [
    tool('dream_status', 'Report real execution outcome, last error, schedule, lease, stage, candidate counts, budget and paths. Read-only; call first.', {}, async () => {
      const { settings, ...result } = await kernel.status({ lease: options.lease?.describe?.() || null })
      const schedule = options.getSchedule ? await options.getSchedule() : null
      return { ...result, ...(schedule ? { schedule, nextDueAt: schedule.nextDueAt, due: schedule.available && schedule.status === 'active' && schedule.nextDueAt <= kernel.now() } : {}), files: kernel.reviewInventory().files, limits: { pageBytes: kernel.pageBytes, manifestPageSize: settings.deltaManifestPageSize, input: { maxSessions: settings.deltaMaxSessions, maxMessagesPerSession: settings.deltaMaxMessagesPerSession, maxBytesPerSession: settings.deltaMaxBytesPerSession, maxBytesTotal: settings.deltaMaxBytesTotal }, includeSubagentSessions: settings.includeSubagentSessions } }
    }),
    tool('dream_delta', 'Read a paginated manifest of genuine human increments, never raw text. Follow nextCursor until null. Omitted and unscanned counts are explicit; an active review keeps its bound delta.', {
      refresh: { type: 'boolean', description: 'Refresh only before an active review; never swap an active evidence window.' },
      cursor: { type: 'integer', description: 'Manifest page offset; starts at the beginning when omitted.' },
      limit: { type: 'integer', description: 'Requested entries, capped by the visible manifest-page setting.' },
    }, async args => kernel.delta({ force: args?.refresh === true, cursor: args?.cursor, maxEntries: args?.limit })),
    tool('dream_page', 'Read bounded UTF-8 user-text fragments. Use both nextCursor and nextByteOffset until done. Body bytes are bounded and source positions retained. Unread input is not silently checkpointed.', {
      sessionId: { type: 'string', description: 'Session id from the current manifest; required when it has several sessions.' },
      cursor: { type: 'integer', description: 'Message-fragment cursor from the previous page.' },
      byteOffset: { type: 'integer', description: 'UTF-8 continuation offset from nextByteOffset; never invent a mid-character offset.' },
      maxBytes: { type: 'integer', description: 'Requested body bytes, capped by the configured limit shown by dream_status.' },
    }, async args => kernel.page(args || {})),
    tool('dream_read', 'Read a memory file, list configured memory directories, or inspect untrusted candidate proposals by opaque candidateId. Candidate evidence must be verified; proposals are not accepted memory.', {
      scope: scopeParameter, workspaceDir: workspaceParameter, directory: directoryParameter,
      file: { type: 'string', description: 'Plain Markdown filename; omit to list memory inventory.' },
      candidateId: { type: 'string', description: 'Opaque id from candidate inventory.' },
      candidates: { type: 'boolean', description: 'List candidate proposals instead of memory.' },
      includeReviewed: { type: 'boolean', description: 'Include reviewed/rejected proposals.' },
      cursor: { type: 'integer', description: 'Candidate inventory cursor.' },
    }, async args => {
      if (args?.candidateId) return kernel.read({ candidateId: args.candidateId })
      if (args?.candidates) return kernel.candidates({ cursor: args.cursor, includeReviewed: args.includeReviewed })
      if (!args?.file) return { files: kernel.inventory({ scope: args?.scope || 'global', workspaceDir: args?.workspaceDir }), candidates: kernel.candidates() }
      return kernel.read(args)
    }),
    tool('dream_stage', 'Stage an evidence-backed replacement or archive. Nothing live changes until commit. Workspace changes go only to .dsh/memory; legacy directories stay read-only (copy-on-write or archive shadow). Hashes and lease are validated; limits come from settings.', {
      scope: scopeParameter, workspaceDir: workspaceParameter, directory: directoryParameter,
      file: { type: 'string', required: true, description: 'Safe plain Markdown filename.' },
      content: { type: 'string', description: 'Whole proposed UTF-8 text; required unless remove is true.' },
      remove: { type: 'boolean', description: 'Propose archive-and-remove.' },
      reason: { type: 'string', required: true, description: 'Reason within the published character limit.' },
      evidence: { type: 'string', required: true, description: 'Genuine evidence within the published limit.' },
      runId: { type: 'string', description: 'Must match the active review; normally omit.' },
    }, async (args, exec) => { mutation(args)();return kernel.stage({ ...args, actor: exec?.agent?.id || kernel.readState().state.residentSessionId || 'BBFF Dreaming Resident' }) }),
    tool('dream_discard', 'Discard staged proposals or mark one untrusted candidate reviewed/rejected with a reason. Candidate decisions do not write accepted memory.', {
      runId: { type: 'string', description: 'Current review id; normally omit.' },
      opId: { type: 'string', description: 'One staged operation; omit to discard all.' },
      candidateId: { type: 'string', description: 'Candidate decision instead of stage discard.' },
      status: { type: 'string', enum: ['reviewed', 'rejected'], description: 'Review metadata only, not acceptance/commit.' },
      reason: { type: 'string', description: 'Required for a candidate decision.' },
    }, async args => {
      mutation(args)()
      if (args?.candidateId) {
        if (typeof args.reason !== 'string' || !args.reason.trim() || args.reason.length > kernel.settings().stageReasonMaxChars) throw new Error('Candidate decision needs a bounded reason.')
        return kernel.decideCandidate({ ids: [args.candidateId], status: args.status || 'reviewed', reason: args.reason, runId: args.runId })
      }
      return kernel.discard(args || {})
    }),
    tool('dream_commit', 'Apply the validated stage with snapshots, archive, recovery journal and changelog. Close review and checkpoint only delivered contiguous input. No-change commits are valid; unread input remains. Next due uses the configured interval.', {
      runId: { type: 'string', description: 'Current review id; normally omit.' },
      note: { type: 'string', description: 'Review summary.' },
    }, async args => kernel.commit({ ...args, verifyLease: mutation(args) })),
  ]
}
