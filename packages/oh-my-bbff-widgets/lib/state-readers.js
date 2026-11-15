/** Low-risk0.17.2 read recipes with native envelopes decoded only by the SDK.
 * Baseline folds are pure; there is no native Session replay and no retained raw
 * log. Reuse and per-part lifecycle belong to state-parts, not the HTTP request.
 */
import {sessionEventFacts} from './dsh-adapter.js'
import {ROOT_SETTINGS_DEFAULTS} from './settings.js'
 export function createStateReaders(ctx,{getSettings=()=>ROOT_SETTINGS_DEFAULTS,now=Date.now}={}){
 const get=name=>{try{return ctx.get(name)}catch{return undefined}},routes=new Map(),rosters=new Map(),histories=new Map(),todos=new Map(),flights=new Map(),counts={stats:0,decodes:0,statReuses:0}
 const reuse=()=>getSettings().historyReuseIntervalMs??ROOT_SETTINGS_DEFAULTS.historyReuseIntervalMs
 const cap=cache=>cache===routes?getSettings().stateRouteMaxEntries??ROOT_SETTINGS_DEFAULTS.stateRouteMaxEntries:getSettings().stateMaxSessions??ROOT_SETTINGS_DEFAULTS.stateMaxSessions
 async function withEvents(id,read,{coldOnly=false,signal}={}){
  const live=!coldOnly&&(get('agents')?.get?.(id)?.session||get('sessions')?.get?.(id))
  if(live){const observation=await get('sessionQuery')?.observeSession?.(id,{projectionMode:'none',...(signal?{signal}:{})});if(!observation)throw new Error('Live async Session observation unavailable.');try{return read(observation.events)}finally{observation[Symbol.dispose]?.()}}
  const persistence=get('sessionPersistence');if(!persistence?.open)throw new Error('Read-only Session persistence is unavailable.')
  const handle=await persistence.open(id,'read',...(signal?[{signal}]:[]));try{return read((await handle.read(0,undefined,...(signal?[{signal}]:[]))).events)}finally{await handle.close()}
 }
 async function historyOf(id,signal){const fold=events=>{
  const byId=new Map()
  for(const event of events){const fact=sessionEventFacts(event).value;if(fact?.kind!=='goal-change')continue;if(!fact.goal){if(fact.clearedId)byId.delete(fact.clearedId);continue}const goal=fact.goal;if(goal.id)byId.set(goal.id,{id:goal.id,revision:goal.revision,objective:goal.objective||'',phase:goal.status||'',maxGoalRounds:goal.maxRounds,createdAt:goal.createdAt,updatedAt:goal.updatedAt})}
  return [...byId.values()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))
 };return get('agents')?.get?.(id)?.session||get('sessions')?.get?.(id)?withEvents(id,fold,{signal}):memo(histories,id,fold,signal)}
 async function todosOf(id,signal){const fold=events=>{let todos=null;for(const event of events){const fact=sessionEventFacts(event).value;if(fact?.kind==='turn-start')todos=null;else if(fact?.kind==='todo-write')todos=fact.todos}return todos};return get('agents')?.get?.(id)?.session||get('sessions')?.get?.(id)?withEvents(id,fold,{signal}):memo(todos,id,fold,signal)}
 const put=(cache,id,value)=>{cache.delete(id);cache.set(id,value);while(cache.size>cap(cache))cache.delete(cache.keys().next().value)}
 async function memo(cache,id,fold,signal){
  const persistence=get('sessionPersistence'),identity=persistence?.identity??persistence,old=cache.get(id)
  if(old&&old.identity===identity&&now()-old.at<reuse())return old.value
  const key=cache===routes?'route:':cache===histories?'history:':'roster:',flight=key+id;if(flights.has(flight))return flights.get(flight)
  const run=(async()=>{
   // Cheap stat first: a cold decode happens only when the source revision moved.
   const snapshot=await persistence?.stat?.(id,...(signal?[{signal}]:[]));counts.stats++
   if(old&&old.identity===identity&&snapshot?.revision!==undefined&&old.revision===snapshot.revision){counts.statReuses++;put(cache,id,{...old,at:now()});return old.value}
   counts.decodes++
   const value=await withEvents(id,fold,{coldOnly:true,signal});put(cache,id,{identity,revision:snapshot?.revision,value,at:now()});return value
  })().finally(()=>flights.delete(flight));flights.set(flight,run);return run
 }
 const equal=(a,b)=>a&&b&&a.provider===b.provider&&a.model===b.model&&(a.effort||'')===(b.effort||'')
 async function coldRoute(id,signal){return memo(routes,id,events=>{let used=null,pending=null;for(const event of events){const fact=sessionEventFacts(event).value;if(fact?.kind==='model-selection')pending=fact.route;else if(fact?.kind==='request-header'){used=fact.route;if(equal(pending,used))pending=null}}return pending||used},signal)}
 async function coldRoster(id,signal){return memo(rosters,id,events=>{const rows=new Map();for(const event of events){const fact=sessionEventFacts(event).value;if(fact?.kind==='team-member')rows.set(fact.member.sessionId,{...fact.member,id:fact.member.sessionId})}return [...rows.values()]},signal)}
 return Object.freeze({historyOf,todosOf,coldRoute,coldRoster,counts,dispose(){routes.clear();rosters.clear();histories.clear();todos.clear()},clear(){routes.clear();rosters.clear();histories.clear();todos.clear()}})
}
