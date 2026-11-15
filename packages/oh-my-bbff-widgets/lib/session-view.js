/** Root-owned incremental read model. Native event layouts are SDK-only. */
import {sessionEventFacts} from './dsh-adapter.js'
import {recentGoals} from './list-order.js'
const dictionary=()=>Object.create(null)
export const SESSION_VIEW_SCHEMA=2
export function emptySessionView(){return {goals:dictionary(),currentGoalId:null,todos:null,usedRoute:null,pendingRoute:null,members:dictionary(),children:dictionary(),team:null,cwd:null,presetId:null}}
export function restoreSessionView(value){
 if(!value||typeof value!=='object'||!value.goals||!value.members||!value.children)throw new Error('Invalid view checkpoint state')
 const state={...emptySessionView(),...value};for(const key of ['goals','members','children'])state[key]=Object.assign(dictionary(),value[key]);return state
}
const sameRoute=(a,b)=>a&&b&&a.provider===b.provider&&a.model===b.model&&a.effort===b.effort
export function foldSessionEvent(state,event,{inheritedEventCount=0}={}){
 const decoded=sessionEventFacts(event),fact=decoded.value;let changed=false,discovered
 if(fact?.kind==='goal-change'){
  if(!fact.goal){if(fact.clearedId){changed=Object.hasOwn(state.goals,fact.clearedId);delete state.goals[fact.clearedId]}if(!fact.clearedId||state.currentGoalId===fact.clearedId){changed=changed||state.currentGoalId!==null;state.currentGoalId=null}}
  else if(fact.goal.id){const goal=fact.goal,previous=state.goals[goal.id],phase=goal.status||'',observedCompletion=previous&&previous.phase!=='complete'&&phase==='complete'&&Number.isSafeInteger(fact.time)&&fact.time>=0,completedAt=phase==='complete'?(observedCompletion?fact.time:previous?.phase==='complete'?previous.completedAt:undefined):undefined;state.goals[goal.id]={id:goal.id,revision:goal.revision,objective:goal.objective||'',phase,maxGoalRounds:goal.maxRounds,createdAt:goal.createdAt,updatedAt:goal.updatedAt,...(completedAt!==undefined?{completedAt,completionBasis:'observed-goal-transition'}:{})};state.currentGoalId=goal.id;changed=true}
 }else if(fact?.kind==='turn-start'){changed=state.todos!==null;state.todos=null}
 else if(fact?.kind==='todo-write'){state.todos=fact.todos;changed=true}
 else if(fact?.kind==='model-selection'){state.pendingRoute=fact.route;changed=true}
 else if(fact?.kind==='request-header'){state.usedRoute=fact.route;if(sameRoute(state.pendingRoute,fact.route))state.pendingRoute=null;changed=true}
 else if(fact?.kind==='team-member'){state.members[fact.member.sessionId]={...fact.member,id:fact.member.sessionId};changed=true}
 else if(fact?.kind==='subagent-catalog'&&event.seq>=inheritedEventCount){
  const child=fact.child
  // Native descendant traversal visits each id once in parent-event order.
  if(child.sessionId&&!Object.hasOwn(state.children,child.sessionId)){state.children[child.sessionId]={id:child.sessionId,createdAt:child.createdAt,mode:child.mode,label:child.label||'',...(child.name?{name:child.name}:{})};discovered=state.children[child.sessionId];changed=true}
 }
 return {changed,discovered,diagnostics:decoded.diagnostics}
}
export function sessionViewData(state){
 const goal=state.currentGoalId?state.goals[state.currentGoalId]||null:null
 return {goal,goalHistory:recentGoals(Object.values(state.goals)),todos:state.todos,route:state.pendingRoute||state.usedRoute,members:Object.values(state.members),children:Object.values(state.children),team:state.team,cwd:state.cwd,presetId:state.presetId}
}
