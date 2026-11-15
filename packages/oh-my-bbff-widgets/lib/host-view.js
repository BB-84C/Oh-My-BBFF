import { wmsg as msg } from './locale-keys.js'
/** Host display DTOs. Incremental goals/todos and deferred native collaboration reads. */
import {sessionHeaderFacts} from './dsh-adapter.js'
import {createCollabReader,readNativeTeam,readAgentRoute} from './collab.js'
import {latestTasks,recentChildren} from './list-order.js'
const get=(ctx,name)=>{try{return ctx.get(name)}catch{return undefined}}
const agentService=(ctx,agent,name)=>{try{return agent?.ctx?.get?agent.ctx.get(name):get(ctx,name)}catch{return undefined}}
const goalData=value=>value?{id:String(value.id),revision:Number(value.revision)||0,objective:String(value.objective||''),phase:String(value.phase||''),roundsStarted:value.roundsStarted,maxGoalRounds:value.maxGoalRounds,activation:value.activation,blockedReason:value.blockedReason||null,createdAt:value.createdAt,updatedAt:value.updatedAt}:null
/** Trailing coalescer: many pushes in one window produce one flush. The timer is
 * injected so tests can count flushes without real waiting. */
export function createCoalescer({delayMs=1000,onFlush=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let timer=null,pending=false,disposed=false,flushes=0
 function flush(){if(disposed||!pending)return;if(timer!==null){clearTimer(timer);timer=null}pending=false;flushes++;try{onFlush()}catch{}}
 function push(){if(disposed)return;pending=true;if(delayMs<=0){flush();return}if(timer!==null)return;timer=setTimer(()=>{timer=null;flush()},delayMs);timer?.unref?.()}
 return {push,flush,dispose(){disposed=true;if(timer!==null){clearTimer(timer);timer=null}},counts:()=>({flushes})}
}
export function readLiveRuntime(ctx,id,{teamSource}={}){
 const agent=get(ctx,'agents')?.get?.(id);if(!agent)return undefined
 const goals=agentService(ctx,agent,'goals');let presetId
 try{presetId=agentService(ctx,agent,'agentPresets')?.composedPreset?.(agent.ctx)}catch{}
 const cwd=agentService(ctx,agent,'workingDirectory')?.get?.(agent.session)||sessionHeaderFacts(agent.session?.header).value.cwd||null
 return {goal:goals?.get?goalData(goals.get(agent)):undefined,team:readNativeTeam(ctx,agent,teamSource),route:readAgentRoute(agent),cwd,presetId:presetId||sessionHeaderFacts(agent.session?.header).value.presetId||null}
}
export function createHostView(ctx,{views,settingsStore,getHuman=()=>[],humanReady=()=>false,getGoalDefaults=()=>({value:{},complete:false,diagnostics:[]}),family,catalogProvider,teamSource,coalesceMs=0}={}){
 const node=id=>views.track?views.track(id):views.request(id)
 const reader=createCollabReader(ctx,{family,teamSource,getSettings:settingsStore.current,readRoute:id=>{const value=node(id);return value.runtime?.route||value.data.route}})
 // Event bursts (one committed event each) must not each invalidate a card.
 const invalidation=createCoalescer({delayMs:coalesceMs,onFlush:()=>reader.invalidate()})
 let disposed=false
 const disposedDto=()=>({ok:false,disposed:true,error:msg('diag.host-view-disposed')})
 function state(id){
  if(disposed)return disposedDto()
  const started=performance.now(),value=views.request(id),live=!!get(ctx,'agents')?.get?.(id),settings=settingsStore.peek(),collaboration=reader.request(id),enabled=settings.settings.showDiagnostics===true
  const collaborationIssues=collaboration.part.state==='error'?[{code:'collaboration-read',reason:collaboration.part.reason}]:[]
  const entries=[...value.diagnostics.entries,...collaboration.data.diagnostics,...collaborationIssues],deduped=[...new Map(entries.map(row=>[row.key||[row.code,row.inference,row.reason].join('\0'),{...row,key:row.key||[row.code,row.inference,row.reason].join('\0')}])).values()]
  const collab={...collaboration.data,team:collaboration.data.team?{...collaboration.data.team,tasks:latestTasks(collaboration.data.team.tasks)}:null,subagents:recentChildren(collaboration.data.subagents)}
  const result={ok:true,session:{id,title:'',live,cwd:value.runtime?.cwd||value.data.cwd||sessionHeaderFacts(get(ctx,'agents')?.get?.(id)?.session?.header||value.header).value.cwd||null},goal:value.runtime?.goal??value.data.goal??null,goalHistory:value.data.goalHistory,todos:value.data.todos,humanTodos:humanReady()?getHuman():[],collab,settings,goalDefaults:getGoalDefaults(),display:{ready:{goal:value.ready,history:value.ready,todos:value.ready,team:collaboration.ready,subagents:collaboration.ready,settings:true},diagnosticsEnabled:enabled},diagnostics:{enabled,entries:enabled?deduped:[],timings:{lastRead:value.diagnostics.lastReadMs,lastStat:value.diagnostics.lastStatMs,total:performance.now()-started},revisions:enabled?{view:value.revision,offset:value.offset,source:value.diagnostics.sourceRevision}:{},nativeBackendLimitation:value.diagnostics.nativeBackendLimitation,counts:{members:collab.team?.members.length||0,children:collab.subagents.length,trackedViews:views.counts,collaborationLoads:reader.counts?.collaborationLoads||0},checkpointPending:value.diagnostics.checkpointPending}}
  if(enabled&&catalogProvider){const snapshot=catalogProvider.catalog.snapshot();result.diagnostics.entries.push(...snapshot.diagnostics.map(row=>({...row,key:[row.code,row.inference,row.reason].join('\0')})));result.diagnostics.catalog={revision:snapshot.revision,complete:snapshot.complete};result.diagnostics.entries=[...new Map(result.diagnostics.entries.map(row=>[row.key,row])).values()]}
  return result
 }
 return {state,changed(){if(!disposed)invalidation.push()},flushChanged(){if(!disposed)invalidation.flush()},pacing:()=>invalidation.counts(),settled:id=>reader.settled(id),dispose:()=>{if(disposed)return;disposed=true;invalidation.dispose();reader.dispose()},sessionMeta(id){if(disposed)return {ready:false,presetId:null,cwd:null};const value=node(id);return {ready:value.ready,presetId:value.runtime?.presetId||value.data.presetId||sessionHeaderFacts(value.header).value.presetId,cwd:value.runtime?.cwd||value.data.cwd||sessionHeaderFacts(value.header).value.cwd}}}
}
