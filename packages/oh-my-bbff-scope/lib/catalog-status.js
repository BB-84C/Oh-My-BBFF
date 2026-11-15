import { msg } from './bbff-contract.js'
/** A caveat/status row is `{ reason }`, where reason is a locale message ref or plain text. */
export function catalogStatus(entry) {
  const policy = entry.governance
  let code, label
  if (policy.status === 'reserved') { code = 'reserved'; label = msg('status.reserved', { name: entry.name }) }
  else if (!policy.governable) {
    code = 'module'
    label = msg('status.module', { owner: policy.ownerTitle || policy.owner, reason: policy.reason })
  } else if (!entry.lastSeenAt) { code = 'never-seen'; label = msg(entry.manual ? 'status.neverSeenManual' : 'status.neverSeen') }
  else if (entry.stale) { code = 'stale'; label = msg('status.stale') }
  else if (!entry.loaded) {
    code = 'not-present'
    label = msg(entry.seenThisRun ? 'status.notPresentUnloaded' : 'status.notPresentMissing', { lastSeen: entry.lastSeenAt })
  } else { code = 'present'; label = msg('status.present') }
  return { code, label }
}
export function catalogCaveats(entry) {
  const notes = []
  if (!entry.governance?.governable) return notes
  if (entry.sessionLocal) notes.push({ reason: msg('caveat.sessionLocal') })
  if (entry.kind === 'mcp') notes.push({
    reason: entry.currentToolCount
      ? msg('caveat.mcpToolCount', { known: entry.toolCount, current: entry.currentToolCount })
      : msg('caveat.mcpNoTools'),
  })
  if (entry.kind === 'skill' && entry.invocation?.modelInvocable === false && entry.invocation?.userInvocable === true) notes.push({ reason: msg('caveat.userInvocableOnly') })
  for (const path of entry.projectPaths || []) notes.push({ reason: msg('caveat.projectSkill', { path }) })
  return notes
}
