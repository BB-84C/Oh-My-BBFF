import { msg } from './bbff-contract.js'
import { reservedTool } from './dsh-adapter.js'

/** Non-governable target error. The API answers with the message ref it carries. */
export function governanceError(policy, name) {
  const error = new Error('SCOPE_NOT_GOVERNED')
  error.code = 'SCOPE_NOT_GOVERNED'
  error.bbffRef = msg('error.notGoverned', { name, reason: policy.reason })
  return error
}
/** Host text may be a locale message ref or a legacy `{ en, … }` map (foreign module). */
const foreignText = record => record.reasonLocales || record.reason
export function createGovernance(getFamily, ledger, attributeTool, warn = () => {}, isDisposed = () => false) {
  let familyAvailable = false, modules = []
  function refresh(confirm = false) {
    const family = getFamily()
    familyAvailable = !!(family?.contract === 1 && typeof family.list === 'function')
    try { modules = familyAvailable ? family.list().filter(module => module.compatible !== false) : [] }
    catch (error) { familyAvailable = false; modules = []; warn(error.message) }
    // A disposed generation must not enqueue another governance write.
    if (familyAvailable && !isDisposed()) ledger.applyDeclarations(modules.map(({ id, title, tools, exclusiveTools }) => ({ id, title, tools, exclusiveTools })), { confirm })
    return modules
  }
  function policy(kind, name) {
    const reserved = kind !== 'skill' && reservedTool(name)
    if (reserved) return { status: 'reserved', governable: false, owner: 'DSH', ...reserved }
    const previous = ledger.exclusives()
    // A loaded owner's live declaration always wins; absent owners retain their last-known facts.
    const active = previous.filter(record => !record.releasedAt && !modules.some(module => module.id === record.moduleId))
    for (const module of modules) for (const tool of module.exclusiveTools?.tools || []) {
      const old = previous.find(record => record.name === tool && record.moduleId === module.id)
      active.push({ name: tool, moduleId: module.id, moduleTitle: module.title, reason: module.exclusiveTools.reason,
        ...(module.exclusiveTools.reasonLocales ? { reasonLocales: module.exclusiveTools.reasonLocales } : {}),
        firstDeclaredAt: old?.firstDeclaredAt, lastDeclaredAt: old?.lastDeclaredAt, lastConfirmedAt: old?.lastConfirmedAt })
    }
    const record = active.find(record => kind === 'tool' ? record.name === name : kind === 'mcp' && (record.name === name || (() => {
      const attribution = attributeTool(record.name, [name])
      // Governance follows the catalog's attributed server; tool enforcement separately
      // checks every ambiguous candidate but always exempts an exclusive tool itself.
      return attribution.server === name
    })()))
    if (!record) return { status: 'workspace', governable: true, reason: msg('status.governable') }
    const lastKnown = !familyAvailable || !modules.some(module => module.id === record.moduleId)
    return { status: 'module', governable: false, owner: record.moduleId, ownerTitle: record.moduleTitle,
      reason: foreignText(record), lastKnown, firstDeclaredAt: record.firstDeclaredAt, lastDeclaredAt: record.lastDeclaredAt, lastConfirmedAt: record.lastConfirmedAt }
  }
  function info() {
    return { familyAvailable, modules, notes: [
      ...(!familyAvailable ? [{ reason: msg('governance.familyUnavailable') }] : []),
      ...ledger.diagnostics().map(reason => ({ reason })),
    ] }
  }
  return { refresh, policy, info }
}
