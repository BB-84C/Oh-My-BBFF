import { wmsg as msg } from './locale-keys.js'
/** Native named tree + per-root Team board. Only public services/projections;
 * BBFF role labels are family annotations, never private Team persistence.
 *
 * Performance contract (incident 2026-11-13): the Team card never walks the tree
 * and never reads cold parent catalogs. Team's public `bbffTeam.members()` view
 * is the single source for members (it carries createdAt/dispatchedBy); without
 * Team only the Lead's own live subagent catalog is shown. No `observeSession`,
 * `persistence.open` or per-parent catalog read happens on this path.
 */
import {resourceAddress} from './dsh-adapter.js'
import {createStateReaders} from './state-readers.js'
import {createRootResolver} from './root-session.js'
import {createStateParts} from './state-parts.js'
import {ROOT_SETTINGS_DEFAULTS} from './settings.js'
import {teamFactsById} from './team-source.js'
const get=(ctx,name)=>{try{return ctx.get(name)}catch{return undefined}}
const own=(ctx,agent,name)=>get(agent?.ctx||ctx,name)||get(ctx,name)
const route=value=>value&&typeof value.provider==='string'&&typeof value.model==='string'?{provider:value.provider,model:value.model,...(typeof value.reasoningEffort==='string'?{effort:value.reasoningEffort}:{})}:null
const navigation=input=>{const value=resourceAddress(input);return {resource:value.value,resourceDiagnostics:value.diagnostics}}
const problem=(code,reason)=>({code,inference:'collaboration',severity:'warning',reason})
export function readAgentRoute(agent){return route(agent?.model?.current?.())||route(agent?.session?.requestHeader?.()?.config)||route(agent?.options)}
/** 0.2.2 does not separate team members from ordinary subagents: the team is the
 * Lead's whole native tree. Widgets follows that design and shows every row,
 * grouped as core (Team-classified BBFF seats) and peripheral (one-shot dispatches
 * and unbound subagents). Classification, aliases, roles and reports are Team data;
 * without that contract every child is peripheral and names stay native. */
export function readNativeTeam(ctx,agent,teamSource){
 if(!agent)return null
 const subs=own(ctx,agent,'subagents'),root=subs?.rootOf?.(agent);if(!root)return null
 const projections=own(ctx,root,'sessionProjections'),view=projections?.snapshot?.(root.session,['agentTeam','subagentCatalog'])?.values
 // No board is not a reason to cold-read: without Team the Lead's own live
 // catalog is the whole answer (all rows are outsourced/unbound).
 const board=view?.agentTeam||null,leadId=String(root.id),name=subs.namesOf(root).self,source=teamSource?.read?.(root)||{available:false,members:[]},facts=teamFactsById(source.members),liveAgent=id=>get(ctx,'agents')?.get?.(id)
 const enabled=own(ctx,root,'agentTeams')?.isEnabled?.(root)??source.enabled??board?.enabled??false
 const statusOf=id=>get(ctx,'agents')?.get?.(id)?.status||'inactive'
 const runningStatus=status=>status==='running'||status==='busy'
 const activityOf=(fact,id)=>{
  const raw=fact.lastActiveAt??fact.reportAt
  const numeric=typeof raw==='number'&&Number.isFinite(raw)?raw:typeof raw==='string'&&Number.isFinite(Date.parse(raw))?Date.parse(raw):undefined
  if(numeric!==undefined)return numeric
  return Number.isFinite(fact.createdAt)?fact.createdAt:undefined
 }
 // Running rows first, then most-recently-active, createdAt only as final tie-breaker.
 const activityOrder=(a,b)=>Number(runningStatus(b.status))-Number(runningStatus(a.status))||(b.lastActiveAt??-1)-(a.lastActiveAt??-1)||(b.createdAt??-1)-(a.createdAt??-1)
 const decorate=(fact,id)=>{
  const live=liveAgent(id),status=live?.status||fact.status||statusOf(id),lastActiveAt=activityOf(fact,id)
  return {id,name:fact.name||id,...(fact.alias?{alias:fact.alias}:{}),tier:fact.tier||'outsourced',kind:fact.kind||'unbound',...(fact.role?{role:fact.role}:{}),status,running:runningStatus(status),...(lastActiveAt!==undefined?{lastActiveAt}:{}),dispatchedBy:fact.dispatchedBy||leadId,...(fact.parentId?{parentId:fact.parentId}:{}),...(fact.mode?{mode:fact.mode}:{}),...(Number.isFinite(fact.outsourcedCount)?{outsourcedCount:fact.outsourcedCount}:{}),...(Number.isFinite(fact.outsourcedDescendants)?{outsourcedDescendants:fact.outsourcedDescendants}:{}),...(readAgentRoute(live)?{route:readAgentRoute(live)}:{}),...(fact.routeLabel?{routeLabel:fact.routeLabel}:{}),...(Number.isFinite(fact.createdAt)?{createdAt:fact.createdAt}:{}),...(fact.reportExcerpt?{reportExcerpt:fact.reportExcerpt}:{}),...(fact.description?{description:fact.description}:{}),...(fact.seat?{seat:fact.seat}:{}),...(fact.reportAt!==undefined?{reportAt:fact.reportAt}:{})}
 }
 const leadFact=facts.get(leadId)||{},leadAgent=get(ctx,'agents')?.get?.(leadId),leadStatus=leadAgent?.status||source.lead?.status||leadFact.status||statusOf(leadId),leadActive=source.lead?.lastActiveAt??activityOf(leadFact,leadId)
 const lead={id:leadId,name:leadFact.name||source.lead?.name||name,...(leadFact.alias?{alias:leadFact.alias}:{}),role:leadFact.role||'lead',tier:'core',kind:'lead',status:leadStatus,running:runningStatus(leadStatus),...(leadActive!==undefined?{lastActiveAt:leadActive}:{}),...(readAgentRoute(leadAgent)?{route:readAgentRoute(leadAgent)}:{}),...(leadFact.routeLabel?{routeLabel:leadFact.routeLabel}:{}),...(leadFact.reportExcerpt?{reportExcerpt:leadFact.reportExcerpt}:{}),...(leadFact.description?{description:leadFact.description}:{}),...(leadFact.seat?{seat:leadFact.seat}:{}),...(leadFact.reportAt!==undefined?{reportAt:leadFact.reportAt}:{}),...(Number.isFinite(source.lead?.outsourcedCount)?{outsourcedCount:source.lead.outsourcedCount}:Number.isFinite(leadFact.outsourcedCount)?{outsourcedCount:leadFact.outsourcedCount}:{}),...(Number.isFinite(source.lead?.outsourcedDescendants)?{outsourcedDescendants:source.lead.outsourcedDescendants}:Number.isFinite(leadFact.outsourcedDescendants)?{outsourcedDescendants:leadFact.outsourcedDescendants}:{})} // Team's view is the single member source (it already covers every depth and
 // carries createdAt/dispatchedBy). Without it only the Lead's own live catalog
 // is shown; no descendant walk and no cold parent catalog read happens here.
 const children=source.available
  ?source.members.filter(fact=>fact.id!==leadId).map(fact=>decorate(fact,fact.id))
  :(view?.subagentCatalog||[]).map(row=>{const id=String(row.id);return decorate({...(facts.get(id)||{}),name:row.name||id,...(Number.isFinite(row.createdAt)?{createdAt:row.createdAt}:{})},id)})
 const newestFirst=(a,b)=>(b.createdAt??-1)-(a.createdAt??-1)
 // Lead stays pinned first in the core column; both columns then use the
 // running-first / most-recently-active order so working agents are always on top.
 const members=[lead,...children.filter(row=>row.tier==='core').sort(activityOrder),...children.filter(row=>row.tier!=='core').sort(activityOrder)]
 // Team 0.10.4 already returns running-first/lastActiveAt order, but the card
 // splits by tier and re-applies the same comparator inside each column; the Lead
 // row stays pinned first regardless of Team's list order.
 return {id:leadId,leadId,role:agent.id===leadId?'lead':'teammate',name:subs.namesOf(agent).self,enabled,memberSource:source.available?'team-contract':'native',members,...(source.counts?{counts:source.counts}:{}),...(source.partial?{partial:source.partial}:{}),tasks:board?.tasks||[],...(board?.failure?{failure:board.failure}:{})}
}
export function createCollabReader(ctx,{family,teamSource,getSettings=()=>ROOT_SETTINGS_DEFAULTS,now=Date.now,readers=createStateReaders(ctx,{getSettings,now}),readRoute,rootResolver=createRootResolver({getAgents:()=>get(ctx,'agents'),getPersistence:()=>get(ctx,'sessionPersistence'),getSessionQuery:()=>get(ctx,'sessionQuery')})}={}){
 const opened=new Set(),liveAgent=id=>get(ctx,'agents')?.get?.(id),parts=createStateParts({now,maxEntries:()=>getSettings().stateMaxSessions||ROOT_SETTINGS_DEFAULTS.stateMaxSessions})
 let disposed=false
 const idle=()=>({rootId:'',team:null,teamIds:[],diagnostics:[]})
 // Measured guard counters: these must stay at zero for an unchanged live tree.
 const counts={collaborationLoads:0,teamReads:0,coldObservations:0,descendantWalks:0,coldParentReads:0}
 /** One Team-contract read per collaboration refresh; no per-parent or per-row
  * observation. The reader is async because Team walks native descendants itself. */
 async function teamSourceFor(rootAgent,signal){
  if(disposed||!teamSource?.readAsync||!rootAgent)return teamSource
  counts.teamReads++
  try{const value=await teamSource.readAsync(rootAgent,signal);return {read:()=>value}}catch{return {read:()=>({available:false,members:[]})}}
 }
 async function membersOf(sessionId,signal){
  if(disposed)return idle()
  const agent=liveAgent(sessionId)
  // A cold session has no live catalog; showing an empty Team card is correct and
  // far cheaper than decoding its log just to render a spinner.
  if(!agent)return {rootId:sessionId,team:null,teamIds:[],diagnostics:[]}
  const subs=own(ctx,agent,'subagents'),root=subs?.rootOf?.(agent)||agent,rootId=String(root.id),source=await teamSourceFor(root,signal),live=disposed?null:readNativeTeam(ctx,agent,source)
  if(!live)return {rootId,team:null,teamIds:[],diagnostics:[]}
  return {rootId,team:live,teamIds:live.members.map(row=>row.id),diagnostics:live.failure?[problem('team-board-incomplete',live.failure)]:[]}
 }
 /** Kept as a public diagnostic reader only: the Team card does not call it.
  * It walks the public native tree and never reads a cold parent catalog; the
  * createdAt fact comes from the Team view (single source). */
 async function childrenOf(sessionId,members,signal){
  if(disposed)return {subagents:[],memberResources:{},diagnostics:[]}
  const subs=get(ctx,'subagents');if(!subs?.listDescendants)throw Error('Native descendant service unavailable')
  const rootId=members.rootId||members.team?.leadId||sessionId
  counts.descendantWalks++
  const descendants=await subs.listDescendants(rootId,signal),facts=teamFactsById(members.team?.members||[]),byId=new Map(descendants.filter(row=>row.kind==='child').map(row=>[String(row.id),row])),memberResources={}
  for(const member of members.team?.members||[]){const entry=byId.get(member.id);memberResources[member.id]=navigation({kind:'subagent',parentId:entry?.parentId||rootId,childId:member.id,mode:entry?.mode})}
  const subagents=descendants.filter(row=>row.kind==='child').map(row=>{const id=String(row.id),fact=facts.get(id);return {id,name:row.path||id,label:row.path||id,description:row.label||'',...(Number.isFinite(fact?.createdAt)?{createdAt:fact.createdAt}:{}),mode:row.mode,modeSource:'Native subagent tree',activity:liveAgent(id)?(liveAgent(id).status==='running'?'running':'idle'):'inactive',...(fact?.alias?{alias:fact.alias}:{}),...(fact?.role?{teamRole:fact.role}:{}),...(fact?.tier?{tier:fact.tier}:{}),parentId:String(row.parentId),owner:row.depth>1?String(row.path||'').split('/').slice(0,-1).join('/'):'',depth:row.depth,hasChildren:!!row.hasChildren,...navigation({kind:'subagent',parentId:row.parentId,childId:row.id,mode:row.mode})};})
  return {subagents,memberResources,diagnostics:descendants.filter(row=>row.kind==='diagnostic').map(row=>problem('subagent-branch-incomplete','Native descendant branch '+row.id+' is '+row.reason+'.'))}
 }
 /** Only live Agent routes are read; Team rows already carry `routeLabel` and a
  * cold row's log is never decoded for display. */
 async function routeOf(id,signal){const current=readAgentRoute(liveAgent(id))||(readRoute?readRoute(id):await readers.coldRoute(id,signal));return current?{...current,live:!!liveAgent(id),inherited:false}:null}
 async function routesOf(members,signal){
  if(disposed)return {routes:{},annotations:{},diagnostics:[]}
  const ids=[...new Set((members.team?.members||[]).map(row=>row.id))],routes={}
  for(const id of ids){const current=readAgentRoute(liveAgent(id));if(current)routes[id]={...current,live:!!liveAgent(id),inherited:false}}
  const annotations=family?.collectAgentAnnotations?await family.collectAgentAnnotations(ids):{items:{},diagnostics:[]}
  return {routes,annotations:annotations.items,diagnostics:annotations.diagnostics||[]}
 }
 function compose(members,children,routes){
  const row=value=>({...value,route:routes?.routes?.[value.id]||null,current:value.id===members.sessionId,display:{annotations:routes?.annotations?.[value.id]||[]}})
  let team=null
  if(members?.team){
   // Every non-Lead row gets the native subagentchat resource so the per-row
   // "Open in sidebar" button can render. Team 0.11.0 supplies parentId/mode;
   // without them a direct child of the Lead falls back to (Lead, continuable),
   // and anything else keeps the plain session resource (row click still works,
   // sidebar button stays hidden) — never a cold read to find a parent.
   const leadId=members.team.leadId,leadIds=new Set([String(leadId)])
   for(const member of members.team.members)if(member.kind==='lead'){leadIds.add(String(member.id));if(member.name)leadIds.add(String(member.name));if(member.alias)leadIds.add(String(member.alias))}
   const modeOf=value=>value==='one-shot'||value==='continuable'||value==='unknown'?value:value==='external'?'unknown':'continuable'
   const memberResources={}
   for(const member of members.team.members){
    if(member.kind==='lead'||member.id===leadId){memberResources[member.id]=navigation({kind:'session',sessionId:member.id});continue}
    const direct=member.dispatchedBy!==undefined&&leadIds.has(String(member.dispatchedBy))
    const parentId=member.parentId||(direct?leadId:undefined)
    memberResources[member.id]=parentId?navigation({kind:'subagent',parentId,childId:member.id,mode:modeOf(member.mode)}):navigation({kind:'session',sessionId:member.id})
   }
   team={...members.team,members:members.team.members.map(member=>row({...member,...memberResources[member.id]}))}
  }
  return {team,subagents:(children?.subagents||[]).map(row),diagnostics:[...(members?.diagnostics||[]),...(children?.diagnostics||[]),...(routes?.diagnostics||[])]}
 }
 async function collabOf(id,signal){if(disposed)return {team:null,subagents:[],diagnostics:[]};const members=await membersOf(id,signal);if(disposed)return {team:null,subagents:[],diagnostics:[]};members.sessionId=id;const routes=await routesOf(members,signal);return compose(members,null,routes)}
 function request(id){
  if(disposed)return {data:{team:null,subagents:[],diagnostics:[]},ready:false,part:{state:'error',reason:msg('diag.collab-disposed'),hasValue:false,revision:null}}
  opened.delete(id);opened.add(id)
  while(opened.size>(getSettings().stateMaxSessions||ROOT_SETTINGS_DEFAULTS.stateMaxSessions))opened.delete(opened.values().next().value)
  // Coalesced recompute window: one Team-card refresh per 1-2 s, never per
  // committed event. The lower bound keeps bursts from decoding anything.
  const configured=Number(getSettings().refreshIntervalMs)||ROOT_SETTINGS_DEFAULTS.refreshIntervalMs,recomputeMs=Math.min(2000,Math.max(1000,configured))
  const result=parts.request(id,'collaboration',{revision:Math.floor(now()/recomputeMs),reuseMs:recomputeMs,reason:msg('diag.team-refresh'),load:signal=>{counts.collaborationLoads++;return collabOf(id,signal)}})
  return {data:result.value||{team:null,subagents:[],diagnostics:[]},ready:result.part.hasValue,part:result.part}
 }
 return {collabOf,routeOf,membersOf,childrenOf,routesOf,compose,request,counts,settled:id=>parts.settled(id),invalidate:id=>{if(disposed)return;for(const current of id?[id]:opened)parts.invalidate(current)},dispose:()=>{disposed=true;opened.clear();parts.dispose();readers.dispose?.()}}
}
export function routeLabel(value){return value?[value.provider,value.model,value.effort].filter(Boolean).join(' · '):''}
