/** Team membership display is Team-owned; the tree is native. On 0.2.2 the DSH
 * team is the Lead's whole native subagent tree, and Widgets follows that design:
 * 0.2.2 has no separate teammate set: the team is the Lead's whole native tree.
 * Widgets adds one distinction on top of the native design: `core` seats carry a
 * fixed long-lived responsibility (the pre-0.2.2 team members) and `outsourced`
 * rows are dispatches their Lead or core members can reuse. Team supplies the
 * classification, aliases, roles, dispatch owners and reports; without that
 * contract every child is `outsourced` and names stay native. Widgets never
 * invents a membership or a name.
 */
export const TEAM_TIERS = /* @__PURE__ */ Object.freeze(['core','outsourced'])
const text = value => typeof value === 'string' ? value.trim() : ''
const STATUSES = new Set(['running','idle','inactive','pending','unknown'])
const timestamp = value => Number.isFinite(value) && value >= 0 ? value : undefined
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined
const rowOf = (value,index) => {
 if(!value || typeof value !== 'object' || Array.isArray(value)) return null
 const id = text(value.id) || text(value.sessionId)
 if(!id) return null
 const rawTier = text(value.tier)
 const tier = rawTier === 'core' ? 'core' : rawTier === 'outsourced' || rawTier === 'peripheral' ? 'outsourced' : undefined
 const routeLabel = text(value.routeLabel) || (value.route && typeof value.route === 'object' ? [text(value.route.provider),text(value.route.model),text(value.route.effort)].filter(Boolean).join(' · ') : '')
 const routeText = text(value.route) || routeLabel
 const status = text(value.status)
 return {
  id,
  ...(text(value.name) ? { name: text(value.name) } : {}),
  ...(text(value.alias) ? { alias: text(value.alias) } : {}),
  ...(tier ? { tier } : {}),
  ...(text(value.role) ? { role: text(value.role) } : {}),
  ...(text(value.kind) ? { kind: text(value.kind) } : {}),
  ...(routeText ? { routeLabel: routeText } : {}),
  ...(text(value.description) ? { description: text(value.description) } : {}),
  ...(text(value.seat) ? { seat: text(value.seat) } : {}),
  ...(value.reportAt !== undefined && value.reportAt !== null ? { reportAt: value.reportAt } : {}),
  ...(STATUSES.has(status) ? { status } : {}),
  ...(timestamp(value.createdAt) !== undefined ? { createdAt: timestamp(value.createdAt) } : {}),
  ...(timestamp(value.lastActiveAt) !== undefined ? { lastActiveAt: timestamp(value.lastActiveAt) } : {}),
  ...(timestamp(value.runningSince) !== undefined ? { runningSince: timestamp(value.runningSince) } : {}),
  ...(text(value.dispatchedBy) ? { dispatchedBy: text(value.dispatchedBy) } : {}),
  ...(text(value.parentId) ? { parentId: text(value.parentId) } : {}),
  ...(text(value.mode) ? { mode: text(value.mode) } : {}),
  ...(count(value.outsourcedCount) !== undefined ? { outsourcedCount: count(value.outsourcedCount) } : {}),
  ...(count(value.outsourcedDescendants) !== undefined ? { outsourcedDescendants: count(value.outsourcedDescendants) } : {}),
  ...(text(value.reportExcerpt) ? { reportExcerpt: text(value.reportExcerpt) } : text(value.report) ? { reportExcerpt: text(value.report) } : {}),
  index,
 }
}
/** Validate and detach one declared Team list. Unknown fields are dropped. */
export function normalizeTeamList(input){
 const rows = Array.isArray(input) ? input : [], seen = new Set(), members = []
 for(const [index,value] of rows.entries()){
  const row = rowOf(value,index)
  if(!row || seen.has(row.id)) continue
  seen.add(row.id)
  members.push(Object.freeze(row))
 }
 return Object.freeze(members)
}
/**
 * @param ctx host context
 * @param options.readTeam optional Team-owned reader `rootAgent => {available,members}`.
 *   The production reader is the Team plugin's public overview/roster API. Until it
 *   is composed the seam reports unavailable, so every child stays peripheral.
 */
export function createTeamSource(ctx,options={}){
 const read = options.readTeam
 const settle = value => {
  if(!value || typeof value !== 'object' || value.available === false) return {available:false,members:Object.freeze([]),...(value&&value.reason?{reason:String(value.reason)}:{})}
  const counts = value.counts && typeof value.counts === 'object' ? Object.freeze({core:Number(value.counts.core)||0,outsourced:Number(value.counts.outsourced)||0,outsourcedOmitted:Number(value.counts.outsourcedOmitted)||0}) : undefined
  return {available:true,members:normalizeTeamList(value.members),...(counts?{counts}:{}),...(value.partial?{partial:String(value.partial)}:{}),...(typeof value.enabled==='boolean'?{enabled:value.enabled}:{}),...(value.lead&&typeof value.lead==='object'?{lead:Object.freeze({sessionId:String(value.lead.sessionId||''),name:String(value.lead.name||''),...(STATUSES.has(text(value.lead.status))?{status:text(value.lead.status)}:{}),...(timestamp(value.lead.lastActiveAt)!==undefined?{lastActiveAt:timestamp(value.lead.lastActiveAt)}:{}),...(timestamp(value.lead.runningSince)!==undefined?{runningSince:timestamp(value.lead.runningSince)}:{}),...(count(value.lead.outsourcedCount)!==undefined?{outsourcedCount:count(value.lead.outsourcedCount)}:{}),...(count(value.lead.outsourcedDescendants)!==undefined?{outsourcedDescendants:count(value.lead.outsourcedDescendants)}:{})})}:{})}
 }
 return Object.freeze({
  available:() => typeof read === 'function',
  read(rootAgent,signal){
   if(typeof read !== 'function') return {available:false,members:Object.freeze([])}
   try{
    const value = read(rootAgent,signal)
    // Asynchronous contracts are read by readAsync only; the synchronous live
    // runtime never blocks a request on another plugin.
    if(value && typeof value.then === 'function') return {available:false,members:Object.freeze([])}
    return settle(value)
   }catch{return {available:false,members:Object.freeze([])}}
  },
  async readAsync(rootAgent,signal){
   if(typeof read !== 'function') return {available:false,members:Object.freeze([])}
   try{return settle(await read(rootAgent,signal))}catch{return {available:false,members:Object.freeze([])}}
  },
 })
}
export function teamFactsById(members){
 const map = new Map()
 for(const member of members || []) map.set(member.id, member)
 return map
}
