// Formation definitions are configuration; active seating is per-Lead operational state.
import { readFileSync, existsSync } from 'node:fs'
import { assertPosition } from './classify.js'
import { validateFormations } from './config-store.js'
import { normalizeTeamSettings, teamCapacity } from './team-settings.js'
import { preflightModel, bindingRouteFields, bindingSelection } from './models.js'
import { modelTier } from './catalog.js'
import { createTree } from './tree.js'

import { MEMBER_NAME_RE, EXISTING_MEMBER_NAME_RE } from './member-names.js'
export { MEMBER_NAME_RE } from './member-names.js'
export function nextSeatName(members) {
  const names = new Set(members.map(member => String(member.name)))
  for (let index = 1; ; index++) if (!names.has(`seat-${index}`)) return `seat-${index}`
}

export function formationDiagnostics(formation, catalog, settings = {}, capacity = {}) {
  const errors = validateFormations({ version: 1, formations: [formation] })
  if (errors.length) return errors
  const seats = new Map(formation.seats.map(seat => [seat.seat, seat]))
  const helperCounts = new Map()
  for (const seat of formation.seats) {
    const role = catalog.byId.get(seat.role)
    if (!role) errors.push(`${seat.seat}: unknown role "${seat.role}"`)
    else {
      if (role.kind === 'oneshot') errors.push(`${seat.seat}: role "${seat.role}" is not member-capable`)
      if (seat.model != null && !(role.models || []).some(tier => tier.label === seat.model)) errors.push(`${seat.seat}: unknown tier label "${seat.model}" for role "${seat.role}"`)
    }
    if (seat.assist) {
      const main = seats.get(seat.assist)
      if (!main) errors.push(`${seat.seat}: assist target "${seat.assist}" is missing`)
      else if (main.assist) errors.push(`${seat.seat}: assist target "${seat.assist}" is another helper`)
      if (seat.assist === seat.seat) errors.push(`${seat.seat}: a helper cannot serve itself`)
      helperCounts.set(seat.assist, (helperCounts.get(seat.assist) || 0) + 1)
    }
  }
  const normalized = normalizeTeamSettings(settings)
  if (helperCounts.size && normalized.nestingMode !== 'helpers') errors.push('formation helper seats require nestingMode helpers (the same policy as bbff_team_hire assist)')
  for (const [main, count] of helperCounts) if (count > normalized.helpersPerMember) errors.push(`${main}: ${count} helpers exceeds helpersPerMember ${normalized.helpersPerMember}`)
  for (const key of ['dshCap', 'bbffCap']) if (capacity[key] !== null && capacity[key] !== undefined && formation.seats.length > capacity[key]) errors.push(`seat count ${formation.seats.length} exceeds ${key} ${capacity[key]}`)
  return errors
}

export function createFormationManager(ctx, { path = null, bindings, getCatalog, getTeamSettings = () => ({}), enforcer, ops, sessionModes, tree = null }) {
  const get = key => { try { return ctx.get(key) } catch { return undefined } }
  const nativeTree = tree || createTree(get, { bindings })
  const settings = () => normalizeTeamSettings(getTeamSettings())
  const active = caller => {
    const leadId = caller ? nativeTree.leadOf(caller)?.id || caller.id : ''
    return bindings.getActiveFormation?.(String(leadId)) || null
  }
  const membersOf = caller => {
    // Seats map to agents that can hold a member binding: continuable children that are not one-shot role dispatches.
    return nativeTree.membersOf(caller).filter(member => member.role !== 'lead' && member.kind !== 'oneshot' && member.mode !== 'external')
  }
  const assertLead = caller => {
    if (!caller) throw new Error('only the Team Lead may manage formations; a calling agent is required')
    assertPosition(caller, get, settings(), 'manage formations')
  }
  function list(caller) {
    const catalog = getCatalog(caller), currentSettings = settings(), capacity = teamCapacity(get, currentSettings)
    let document = { version: 1, formations: [] }, diagnostics = []
    try {
      if (path && existsSync(path)) document = JSON.parse(readFileSync(path, 'utf8'))
      diagnostics = validateFormations(document)
    } catch (error) { diagnostics = [String(error?.message || error)] }
    const formations = (Array.isArray(document?.formations) ? document.formations : []).map(formation => ({
      ...(formation && typeof formation === 'object' ? formation : {}),
      seatCount: Array.isArray(formation?.seats) ? formation.seats.length : 0,
      diagnostics: formationDiagnostics(formation, catalog, currentSettings, capacity),
    }))
    return { version: 1, formations, diagnostics, activeFormation: active(caller), roles: catalog.roles.filter(role => role.kind !== 'oneshot').map(role => ({ id: role.id, title: role.title, models: (role.models || []).map((tier, index) => ({ ...tier, index: index + 1 })) })), ...capacity }
  }
  function plan(caller, { id, map = {}, compact = 'changed' } = {}) {
    assertLead(caller)
    if (!['changed', 'all', 'none'].includes(compact)) throw new Error('compact must be changed|all|none')
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('map must be a seat-to-member-name object')
    const overview = list(caller), formation = overview.formations.find(item => item.id === id)
    if (!formation) throw new Error(`unknown formation "${id}"`)
    const selectedIndex = overview.formations.indexOf(formation)
    const diagnostics = [...overview.diagnostics.filter(message => !/^formations\[\d+\]/.test(message) || message.startsWith(`formations[${selectedIndex}]`)), ...formation.diagnostics]
    const structureErrors = validateFormations({ version: 1, formations: [formation && { id: formation.id, label: formation.label, ...(formation.description === undefined ? {} : { description: formation.description }), seats: formation.seats }] })
    if (structureErrors.length) return { id, label: formation.label, compact, valid: false, diagnostics, assignments: [], skipped: [], vacancies: [], unseated: membersOf(caller).map(member => ({ name: String(member.name), memberId: String(member.id) })), activeFormation: active(caller), dshCap: overview.dshCap, bbffCap: overview.bbffCap, headroom: null, dshHeadroom: null, bbffHeadroom: null, vacanciesExceedHeadroom: null }
    const names = new Set((formation.seats || []).map(seat => seat.seat))
    for (const [seat, name] of Object.entries(map)) if (!names.has(seat) || typeof name !== 'string' || !EXISTING_MEMBER_NAME_RE.test(name)) diagnostics.push(`invalid mapping ${seat}: ${String(name)}`)
    const members = membersOf(caller)
    for (const [seat, name] of Object.entries(map)) if (!members.some(member => String(member.name) === name)) diagnostics.push(`invalid mapping ${seat}: member "${String(name)}" does not exist; map targets must be existing members`)
    const selected = new Set(), occupied = new Set(), assignments = [], skipped = [], vacancies = []
    const catalog = getCatalog(caller)
    // An unmapped seat matches the member with that name, else the member whose binding already
    // holds that seat (a renamed or unnamed 0.2.1 member keeps its seat; never a duplicate hire).
    const named = new Set((formation.seats || []).map(seat => Object.hasOwn(map, seat.seat) ? map[seat.seat] : seat.seat))
    const seatHolder = seatId => members.find(item => bindings.get(String(item.id))?.seat === seatId && !named.has(String(item.name)))
    for (const seat of formation.seats || []) {
      const mapped = Object.hasOwn(map, seat.seat)
      const member = members.find(item => String(item.name) === (mapped ? map[seat.seat] : seat.seat)) || (mapped ? undefined : seatHolder(seat.seat))
      const name = member ? String(member.name) : mapped ? map[seat.seat] : seat.seat
      if (selected.has(name)) diagnostics.push(`member "${name}" occupies more than one seat`)
      selected.add(name)
      const assist = seat.assist ? (Object.hasOwn(map, seat.assist) ? map[seat.assist] : seat.assist) : null
      if (!member) {
        vacancies.push({ seat: seat.seat, mappedName: name, hire: { role: seat.role, ...(seat.model ? { model: seat.model } : {}), name: seat.seat, description: seat.function, ...(assist ? { assist } : {}) }, needsBrief: true })
        continue
      }
      occupied.add(String(member.id))
      const live = get('agents')?.get?.(String(member.id))
      if (member.status === 'running' || live?.status === 'running') { skipped.push({ seat: seat.seat, name, reason: `member is ${live?.status === 'running' ? 'running' : member.status}; never interrupt` }); continue }
      const previous = bindings.get(String(member.id))
      const role = catalog.byId.get(seat.role)
      let model = seat.model ?? null
      try { if (role) model = modelTier(role, seat.model).selection } catch {}
      const changed = previous?.role !== seat.role || (previous?.function || String(member.description || '')) !== seat.function
      assignments.push({ memberId: String(member.id), name, seat: seat.seat, function: seat.function, role: seat.role, model, assist, changed, overrideRetained: null, legacyOverrideIgnored: !!previous?.override, compact: compact === 'all' || (compact === 'changed' && changed) })
    }
    // Only role-bound members count toward the BBFF soft cap (unbound native children do not).
    const memberCount = members.filter(member => bindings.get(String(member.id))).length
    const dshHeadroom = overview.dshCap === null ? null : Math.max(0, overview.dshCap - memberCount)
    const bbffHeadroom = overview.bbffCap === null ? null : Math.max(0, overview.bbffCap - memberCount)
    // Each known cap limits headroom; DSH 0.2.2 exposes no member cap, so the soft cap alone may apply.
    const knownHeadroom = [dshHeadroom, bbffHeadroom].filter(value => value !== null)
    const headroom = knownHeadroom.length ? Math.min(...knownHeadroom) : null
    // Validate final helper ownership too: busy/unseated bindings are retained.
    const future = new Map(members.map(member => [String(member.name), bindings.get(String(member.id))?.assist || null]))
    for (const assignment of assignments) future.set(assignment.name, assignment.assist)
    const counts = new Map()
    for (const [name, assist] of future) if (assist) {
      if (!future.has(assist) || future.get(assist)) diagnostics.push(`${name}: retained helper owner "${assist}" would not be a main member`)
      counts.set(assist, (counts.get(assist) || 0) + 1)
    }
    for (const [name, count] of counts) if (count > settings().helpersPerMember) diagnostics.push(`${name}: final roster exceeds helpersPerMember ${settings().helpersPerMember}`)
    return { id, label: formation.label, compact, valid: diagnostics.length === 0, diagnostics, assignments, skipped, vacancies, unseated: members.filter(member => !occupied.has(String(member.id))).map(member => ({ name: String(member.name), memberId: String(member.id) })), activeFormation: active(caller), memberCount, dshCap: overview.dshCap, bbffCap: overview.bbffCap, dshHeadroom, bbffHeadroom, headroom, vacanciesExceedHeadroom: headroom === null ? null : vacancies.length > headroom }
  }
  async function apply(caller, args, signal) {
    const mode = sessionModes?.get?.(caller?.id) || 'auto'
    if (mode === 'off' || mode === 'orchestrator') throw new Error(`this session runs in team mode "${mode}"; formation apply is disabled`)
    let result = plan(caller, args)
    if (!result.valid) return { ...result, applied: false }
    const catalog = getCatalog(caller), prepared = new Map()
    for (const row of result.assignments) {
      const role = catalog.byId.get(row.role)
      const selected = await preflightModel(role, row.model, get, signal)
      prepared.set(row.memberId, { signature: JSON.stringify({ role, model: row.model, function: row.function, seat: row.seat, assist: row.assist }), binding: bindingRouteFields(role, selected.route) })
    }
    signal?.throwIfAborted?.()
    // Re-observe after awaited metadata validation. Never use a stale idle sample
    // or assign a newly-idle/changed target whose selection was not preflighted.
    result = plan(caller, args)
    if (!result.valid) return { ...result, applied: false }
    const currentCatalog = getCatalog(caller)
    for (const row of result.assignments) if (prepared.get(row.memberId)?.signature !== JSON.stringify({ role: currentCatalog.byId.get(row.role), model: row.model, function: row.function, seat: row.seat, assist: row.assist })) return { ...result, valid: false, diagnostics: [...result.diagnostics, 'formation/catalog/member selection changed during preflight; plan and apply again'], applied: false }
    const updates = result.assignments.map(row => {
      return { sessionId: row.memberId, role: row.role, kind: 'member', ...prepared.get(row.memberId).binding, ownerId: String(caller.id), name: row.name, seat: row.seat, function: row.function, formation: result.id, ...(row.assist ? { assist: row.assist } : {}) }
    })
    if (bindings.applyFormation) bindings.applyFormation(String(caller.id), result.id, updates)
    else { for (const update of updates) bindings.set(update.sessionId, update); bindings.setActiveFormation?.(String(caller.id), result.id) }
    const compactions = [], warnings = []
    for (const row of result.assignments) {
      const live = get('agents')?.get?.(row.memberId)
      try { if (live) enforcer.reinstall(live) } catch (error) { warnings.push(`${row.name}: role reapply: ${String(error?.message || error)}`) }
      if (row.compact) {
        try { compactions.push({ name: row.name, ...ops.scheduleCompact(caller, row.name) }) }
        catch (error) { compactions.push({ name: row.name, scheduled: false, error: String(error?.message || error) }) }
      }
    }
    return { ...result, applied: true, appliedMembers: result.assignments.map(row => row.name), compactions, warnings, activeFormation: result.id }
  }
  function draft(caller, args = {}) {
    assertLead(caller)
    const members = membersOf(caller), diagnostics = []
    const seats = []
    for (const member of members) {
      const binding = bindings.get(String(member.id))
      if (!binding?.role) { diagnostics.push(`${member.name}: no role binding; omitted from draft`); continue }
      const role = getCatalog(caller).byId.get(binding.role)
      let model
      if (role && (binding.model != null || binding.route)) {
        try {
          const selected = bindingSelection(binding, role)
          model = typeof selected === 'string' ? selected : undefined
          if (!model && typeof selected === 'number' && selected > 1) diagnostics.push(`${member.name}: selected tier has no label; draft cannot represent this non-preferred tier until it is labeled`)
        } catch (error) { diagnostics.push(`${member.name}: ${String(error?.message || error)}`) }
      }
      if (binding.override) diagnostics.push(`${member.name}: deprecated override field is ignored; the binding/catalog supplies the model`)
      if (member.status === 'failed') diagnostics.push(`${member.name}: failed member included as a durable seat; apply will skip it`)
      seats.push({ seat: String(member.name), function: binding.function || String(member.description || ''), role: binding.role, ...(model ? { model } : {}), ...(binding.assist ? { assist: binding.assist } : {}) })
    }
    const formation = { id: args.id || 'team-draft', label: args.label || 'Current team', seats }
    diagnostics.push(...formationDiagnostics(formation, getCatalog(caller), settings(), teamCapacity(get, settings())))
    return { formation, diagnostics, activeFormation: active(caller), written: false }
  }
  async function execute(caller, args, signal) {
    assertLead(caller)
    if (args.action === 'list') { const result = list(caller); return { ...result, formations: result.formations.map(({ id, label, description, seatCount, diagnostics }) => ({ id, label, ...(description===undefined?{}:{description}), seatCount, diagnostics })) } }
    if (args.action === 'plan') return plan(caller, args)
    if (args.action === 'apply') return apply(caller, args, signal)
    if (args.action === 'draft') return draft(caller, args)
    throw new Error('action must be list|plan|apply|draft')
  }
  return { list, plan, apply, draft, execute, active }
}
