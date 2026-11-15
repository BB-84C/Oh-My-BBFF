import { wmsg as msg } from './locale-keys.js'
/** Root exposure controls. Catalog discovery lives ONLY in catalog-discovery.js. */
import pkg from '../package.json' with {type:'json'}
import {EXPOSURE_KINDS,disabledFor,exposurePaths,loadExposure,saveExposure,setDisabled} from './exposure-store.js'
import {createRootResolver} from './root-session.js'
import {createExposureSnapshots} from './exposure-snapshots.js'
import {parseMcpToolName as decodeMcp,unknownRestrictionNames,reservedTool,SKILL_NAME_PATTERN,sessionHeaderFacts,resourceServerArgument,skillNameArgument,serverFromMcpSectionName,rewriteResourceSection,MCP_RESOURCE_SECTION_NAME} from './dsh-adapter.js'
export const HIDE_PROVIDER='bbff-exposure-hide'
export function parseMcpToolName(name){const value=decodeMcp(name).value;return value?{server:value.server,tool:value.suffix}:null}
export function unknownNamesFrom(error){return unknownRestrictionNames(String(error?.message||error)).value||[]}
const sorted=values=>[...new Set(values)].sort()
const byName=(a,b)=>a.name.localeCompare(b.name)
const issue=(code,reason)=>({code,inference:'exposure',severity:'warning',reason})
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index])
export function createExposureEngine(ctx,options={}){
 const get=name=>{try{return ctx.get(name)}catch{return undefined}},home=options.home,paths=exposurePaths({home}),provider=options.catalogProvider
 const rootResolver=options.rootResolver||createRootResolver({getSessionQuery:()=>get('sessionQuery'),getPersistence:()=>get('sessionPersistence'),getAgents:()=>get('agents')})
 // Cold session metadata (preset/cwd) is read only when the cheap persistence
 // revision changed; the derived fact is cached per (sessionId, revision),
 // bounded, and concurrent callers share one in-flight read.
 const coldMetaCache=new Map(),coldMetaFlights=new Map()
 async function coldSessionMeta(sessionId){
  const persistence=get('sessionPersistence');if(!persistence?.stat)return null
  const inflight=coldMetaFlights.get(sessionId);if(inflight)return inflight
  const run=(async()=>{let snapshot;try{snapshot=await persistence.stat(sessionId)}catch{return null};if(!snapshot)return null
   const cached=coldMetaCache.get(sessionId);if(cached&&cached.revision===snapshot.revision)return cached.value
   let observation;try{observation=await get('sessionQuery')?.observeSession?.(sessionId)}catch{return null};if(!observation)return null
   let value;try{value={presetId:observation.projections?.values?.agentPreset??sessionHeaderFacts(observation.header).value.presetId,cwd:observation.projections?.values?.workingDirectory}}finally{observation[Symbol.dispose]?.()}
   coldMetaCache.delete(sessionId);coldMetaCache.set(sessionId,{revision:snapshot.revision,value});while(coldMetaCache.size>64)coldMetaCache.delete(coldMetaCache.keys().next().value);return value})()
  coldMetaFlights.set(sessionId,run)
  try{return await run}finally{coldMetaFlights.delete(sessionId)}
 }
 const snapshots=createExposureSnapshots({home,logger:options.logger,getSettings:options.getSettings}),apps=new Map(),caches=new Map(),subscriptions=[]
 let disposed=false,installed=false,timer,running,again=false,writes=Promise.resolve()
 const warn=reason=>{try{options.logger?.warn?.('Widgets exposure: '+reason)}catch{}}
 const family=()=>get('bbffFamily')
 const attribute=(name,hints=[])=>provider?.catalog?.attributeTool(name,{serverHints:hints})||(()=>{const decoded=decodeMcp(name,[],hints);return decoded.value||{basis:'none',candidates:[],diagnostics:decoded.diagnostics}})()
 const denied=(name,disabled)=>{
  if(reservedTool(name))return false
  if(disabled.tools.has(name))return true
  const value=attribute(name,[...disabled.mcp]),candidates=value.candidates?.length?value.candidates.map(row=>row.server):value.server?[value.server]:[]
  return candidates.some(server=>disabled.mcp.has(server))
 }
 function cacheFor(id){if(!caches.has(id))caches.set(id,{skills:new Map(),tools:new Map(),mcp:new Map()});return caches.get(id)}
 const loadStore=()=>loadExposure({file:paths.file})
 function mutatePreference(rootSessionId,kind,name,enabled){const run=writes.then(()=>saveExposure({file:paths.file,store:setDisabled({store:loadStore(),rootSessionId,kind,name,disabled:!enabled})}));writes=run.catch(()=>{});return run}
 function traced(agent,name){
  const target=agent?.ctx?.get?.(name)
  if(!target)return undefined
  if(typeof agent.ctx.reflect?.trace!=='function')throw new Error('Agent-context trace unavailable')
  return agent.ctx.reflect.trace(target)
 }
 function appFor(agent){if(!apps.has(agent))apps.set(agent,{denied:[],skillNames:[],disabled:{tools:new Set(),skills:new Set(),mcp:new Set()},diagnostics:[]});return apps.get(agent)}
 function parentKey(agent){const key=options.scopeAPI?.scopeOf?.(agent.ctx)||agent;return options.scopeAPI?.scopeParentOf?.(key)}
 function ownMaskName(){const root=family()?.root;return family()?.get?.(root?.id)?.skillMaskProviders?.[0]||root?.skillMaskProviders?.[0]}
 function maskFactory(app,name){return control=>{
  app.skillControl=control
  return {name,list:async()=>({complete:true,candidates:app.skillNames.filter(value=>SKILL_NAME_PATTERN.test(value)).map(value=>({name:value,description:app.cache?.skills.get(value)?.description||'Hidden by this session exposure setting',source:'runtime',provider:name,invocation:{modelInvocable:false,userInvocable:false},rank:0,locator:null}))}),get:async()=>undefined}
 }}
 async function applyAgent(agent){
  if(disposed||!agent?.ctx||typeof agent.id!=='string')return {applied:false}
  await options.settingsReady?.()
  const app=appFor(agent),resolution=await rootResolver.resolve(agent.id,{header:agent.session?.header})
  if(!resolution.resolved&&app.resolved){app.diagnostics=[issue('root-policy-stale','Root ancestry cannot be reconfirmed; the previous applied deny/mask is retained without a new ancestry claim.')];return {applied:false,cached:true,rootSessionId:app.rootSessionId,diagnostics:app.diagnostics}}
  app.rootSessionId=resolution.rootSessionId||agent.id;app.resolved=resolution.resolved;app.diagnostics=[];app.cache=cacheFor(agent.id)
  app.disabled=disabledFor(loadStore(),app.rootSessionId)
  let tools,skills
  try{tools=traced(agent,'tools');skills=traced(agent,'skills')}catch{app.diagnostics.push(issue('unsupported-agent-trace','Agent-owned mutation tracing is unavailable; no raw registry mutation was attempted.'));return {applied:false,rootSessionId:app.rootSessionId,diagnostics:app.diagnostics}}
  const needsTools=app.disabled.tools.size||app.disabled.mcp.size||app.disabled.skills.size
  if(needsTools&&tools){
   if(!app.guard&&typeof tools.guard==='function')app.guard=tools.guard(exec=>denied(exec.name,app.disabled)||app.disabled.mcp.has(resourceServerArgument(exec.name,exec.arguments))||app.disabled.skills.has(skillNameArgument(exec.name,exec.arguments))?'Disabled by the root session exposure setting':undefined)
  }
  if(app.disabled.mcp.size&&!app.sectionFilter&&typeof agent.ctx.on==='function')app.sectionFilter=agent.ctx.on('system-prompt/assemble',async(_assembly,context,next)=>{
   const value=await next()
   if(disposed||apps.get(agent)!==app||context.scope!==agent)return value
   return {contexts:value.contexts,variables:value.variables,sections:value.sections.flatMap(section=>{
    const server=serverFromMcpSectionName(section.name).value
    if(server&&app.disabled.mcp.has(server))return []
    if(section.name!==MCP_RESOURCE_SECTION_NAME)return [section]
    const rewritten=rewriteResourceSection(section,[...app.disabled.mcp]);for(const diagnostic of rewritten.diagnostics)if(!app.diagnostics.some(row=>row.code===diagnostic.code))app.diagnostics.push(diagnostic)
    return rewritten.value===null?[]:[{...section,...rewritten.value}]
   })}
  })
  let inherited=[]
  try{if(tools?.schemas)inherited=tools.schemas(parentKey(agent)).map(row=>row.name)}catch{app.diagnostics.push(issue('enforcement-view-error','Inherited tool definitions could not be read; previous restrictions are retained.'))}
  const names=sorted(inherited.filter(name=>denied(name,app.disabled)))
  if(!same(app.denied,names)||(names.length&&!app.restriction)){
   app.restriction?.();app.restriction=undefined;app.denied=[]
   if(names.length&&tools?.restrict){
    let remaining=names
    while(remaining.length){try{app.restriction=tools.restrict({deny:remaining});app.denied=remaining;break}catch(error){const unknown=unknownNamesFrom(error),next=remaining.filter(name=>!unknown.includes(name));if(!unknown.length||next.length===remaining.length){app.diagnostics.push(issue('restriction-error','Native restriction could not be applied; the monotonic body guard remains authoritative.'));break}remaining=next}}
   }
  }
  if(needsTools&&!app.guard)app.diagnostics.push(issue('body-guard-unavailable','The native monotonic tool guard is unavailable; scoped own-layer bodies are not claimed protected.'))
  const hidden=sorted([...app.disabled.skills].filter(name=>SKILL_NAME_PATTERN.test(name)))
  if(!same(hidden,app.skillNames)||(!app.skillDispose&&hidden.length)){
   app.skillNames=hidden
   if(!hidden.length){app.skillDispose?.();app.skillDispose=undefined;app.skillControl=undefined}
   else if(skills?.registerProvider){
    if(!app.skillDispose){const name=ownMaskName();if(name)app.skillDispose=skills.registerProvider(maskFactory(app,name));else app.diagnostics.push(issue('mask-provider-undeclared','Root mask identity is absent from its current descriptor; no undeclared provider was registered.'))}
    app.skillControl?.invalidate?.()
   }else app.diagnostics.push(issue('skill-mask-unavailable','The operational skill registry cannot install this Agent-owned mask.'))
  }
  provider?.recordMasks?.(agent,ownMaskName(),app.skillDispose?app.skillNames:[])
  return {applied:!app.diagnostics.length,rootSessionId:app.rootSessionId,deny:app.denied.slice(),skills:app.skillNames.slice(),diagnostics:app.diagnostics}
 }
 function allAgents(){try{return get('agents')?.list?.()||[]}catch{return []}}
 async function refreshAll(){if(disposed)return[];const result=[];for(const agent of allAgents()){if(disposed)break;try{result.push(await applyAgent(agent))}catch{warn('Agent enforcement refresh failed')}}return result}
 async function reapplyRoot(id){const result=[];for(const agent of allAgents()){const resolved=await rootResolver.resolve(agent.id,{header:agent.session?.header});if(resolved.rootSessionId===id)result.push(await applyAgent(agent))}return result}
 function disposeAgent(agent){const app=apps.get(agent);if(!app)return;for(const key of ['restriction','guard','skillDispose','sectionFilter'])try{app[key]?.()}catch{};apps.delete(agent);provider?.recordMasks?.(agent,undefined,[])}
 function schedule(){if(disposed||timer)return;timer=setTimeout(()=>{timer=undefined;if(running){again=true;return}running=refreshAll().finally(()=>{running=undefined;if(again){again=false;schedule()}})},0);timer.unref?.()}
 const sourceOf=row=>row.owner.kind==='bbff'?{source:'bbff',module:row.owner.module.id,moduleTitle:row.owner.module.title}:row.owner.kind==='mcp'?{source:'mcp',mcpServer:row.owner.server}:{source:row.owner.kind}
 async function inventory(sessionId,{cold=false}={}){
  if(disposed)return {ok:false,status:503,error:msg('error.exposure-disposed')}
  if(typeof sessionId!=='string'||!sessionId)return {ok:false,status:400,error:msg('error.session-required')}
  if(!provider?.sessionView)return {ok:false,status:503,error:msg('error.exposure-view-unavailable')}
  await options.settingsReady?.()
  const resolution=await rootResolver.resolve(sessionId),rootSessionId=resolution.rootSessionId||sessionId,agent=cold?undefined:get('agents')?.get?.(sessionId)
  const header=sessionHeaderFacts(agent?.session?.header||await rootResolver.headerOf(sessionId)).value
  let cwd=resolution.cwd||header.cwd,presetId=header.presetId
  try{const session=agent?.session;if(session)cwd=get('workingDirectory')?.get?.(session)||cwd}catch{}
  if(options.readSessionMeta){const meta=options.readSessionMeta(sessionId);if(meta?.ready){presetId=meta.presetId||presetId;cwd=meta.cwd||cwd}if(agent)try{const presets=agent.ctx?.get?agent.ctx.get('agentPresets'):get('agentPresets');presetId=presets?.composedPreset?.(agent.ctx)||presetId}catch{}}else try{const meta=await coldSessionMeta(sessionId);if(meta){presetId=meta.presetId||presetId;cwd=meta.cwd||cwd}}catch{}
  const view=provider.sessionView({agent,presetId,cwd}),snapshot=view.snapshot,cache=cacheFor(sessionId),disabled=disabledFor(loadStore(),rootSessionId),localKeys=new Set(view.entries.map(row=>row.kind+'\0'+row.name)),rows=new Map(snapshot.entries.map(row=>[row.kind+'\0'+row.name,row]))
  for(const row of view.entries)if(!rows.has(row.kind+'\0'+row.name))rows.set(row.kind+'\0'+row.name,row)
  const visible=new Set(view.visibleNames),globalNames=new Set(view.globalNames),diagnostics=[...snapshot.diagnostics,...view.diagnostics,...snapshots.diagnostics(),...(apps.get(agent)?.diagnostics||[])]
  const tools=[],skills=[],mcp=[]
  for(const row of rows.values()){
   const current=localKeys.has(row.kind+'\0'+row.name),base={name:row.name,description:row.description,owner:row.owner,ownerBasis:row.ownerBasis,present:row.present,stale:row.stale,seenThisRun:row.seenThisRun,sources:row.sources,...sourceOf(row)}
   if(row.kind==='tool'&&!row.reserved){
    if(!current&&!denied(row.name,disabled))continue
    const rootOff=denied(row.name,disabled),entry={...base,enabled:current&&!rootOff,inventoryOrigin:row.sessionLocal?'agent':globalNames.has(row.name)?'global':'preset',...(row.mcpServer?{mcpServer:row.mcpServer}:{})}
    if(!current||(agent&&!visible.has(row.name)&&!rootOff)){entry.available=false;entry.enabled=false;entry.reason=msg('exposure.not-exposed')}
    if(row.exclusive){entry.exclusive=row.exclusive;entry.toggleable=false;entry.reason=row.exclusive.reason;entry.reasonLocales=row.exclusive.reasonLocales}
    tools.push(entry);cache.tools.set(row.name,{description:row.description})
   }else if(row.kind==='skill'){
    const exact=view.skills.find(value=>value.name===row.name)
    if(exact?.modelInvocable||disabled.skills.has(row.name)){skills.push({...base,skillSource:exact?.skillSource,skillProvider:exact?.skillProviders?.length===1?exact.skillProviders[0]:undefined,source:row.latestSource||row.sources[0]||'runtime',enabled:!!exact?.modelInvocable&&!disabled.skills.has(row.name),...(exact?{}:{available:false,reason:msg('exposure.not-in-mask-free-view')})});if(exact)cache.skills.set(row.name,{description:exact.description,source:exact.latestSource||exact.sources[0]})}
   }else if(row.kind==='mcp'){
    if(!current&&!disabled.mcp.has(row.name))continue
    const names=view.tools.filter(tool=>attribute(tool.name).server===row.name).map(tool=>tool.name).sort(),entry={...base,server:row.name,connected:names.length>0,connectionState:'unverified',connectionBasis:'Current tool schemas are observed; transport connection state is not independently verified.',toolCount:names.length,currentToolCount:names.length,tools:names,enabled:current&&row.present!==false&&!disabled.mcp.has(row.name),configured:row.configured,configuredEnabled:row.configuredEnabled}
    if(!current||row.present===false){entry.available=false;entry.reason=msg('exposure.not-present')}
    mcp.push(entry)
   }
  }
  let mode=view.mode,snapshotAt
  if(agent&&view.complete){snapshots.put(sessionId,{preset:presetId,tools:view.tools.filter(row=>!row.reserved).map(row=>({name:row.name,description:row.description,origin:row.sessionLocal?'agent':globalNames.has(row.name)?'global':'preset'}))})}
  else if(!agent){
    const previous=snapshots.get(sessionId)
    if(previous&&(!presetId||!previous.preset||previous.preset===presetId)){
      snapshotAt=previous.at;mode='snapshot'
      for(const row of previous.tools){
        if(reservedTool(row.name))continue
        const current=localKeys.has('tool\0'+row.name),rootOff=denied(row.name,disabled)
        if(row.origin!=='agent'&&(current||!rootOff))continue
        const index=tools.findIndex(tool=>tool.name===row.name),prior=index>=0?tools[index]:{},meta=snapshot.entries.find(entry=>entry.kind==='tool'&&entry.name===row.name)
        const entry={...prior,name:row.name,description:row.description,enabled:!rootOff,available:true,inventoryOrigin:'snapshot',lastLiveAt:previous.at,snapshotOnly:true,owner:meta?.owner||prior.owner||{kind:'unknown'},ownerBasis:meta?.ownerBasis||prior.ownerBasis||{kind:'adapter',source:'Private last-live snapshot; current ownership is unknown.',inference:'registration-provenance',packageName:''},...(meta?sourceOf(meta):{source:prior.source||'unknown'})}
        if(!entry.exclusive){delete entry.reason;delete entry.reasonLocales;delete entry.by}
        if(index>=0)tools[index]=entry;else tools.push(entry)
      }
    }
  }
  const f=family(),input={sessionId,rootSessionId,...(cwd?{cwd}:{})}
  let contributions=[]
  if(f?.collectExposureContributions){const value=await f.collectExposureContributions(input);contributions=value.items;diagnostics.push(...value.diagnostics.map(row=>({...row,inference:'family-callback',severity:'warning'})))}
  else if(f?.contributeExposure)try{contributions=await f.contributeExposure(input)}catch{diagnostics.push(issue('contributor-error',msg('exposure.contributor-error')))}
  const contributed=new Set()
  for(const contribution of contributions)for(const tool of contribution.tools||[]){if(contributed.has(tool.name)||reservedTool(tool.name))continue;contributed.add(tool.name);const index=tools.findIndex(row=>row.name===tool.name),module={id:contribution.module,title:contribution.moduleTitle},entry={name:tool.name,description:tool.description,source:'bbff',module:module.id,moduleTitle:module.title,owner:{kind:'bbff',module},ownerBasis:{kind:'contract',source:msg('catalog.owner.session-contribution',{module:module.title}),module},inventoryOrigin:'contributor',available:true,enabled:contribution.toggleable?!disabled.tools.has(tool.name):true,toggleable:contribution.toggleable===true};if(index<0)tools.push(entry);else tools[index]={...tools[index],...entry}}
  const exclusive=contributions.find(row=>row.exclusive)
  const items=[...tools.map(row=>({kind:'tool',name:row.name,...(row.mcpServer?{server:row.mcpServer}:{})})),...skills.map(row=>({kind:'skill',name:row.name})),...mcp.map(row=>({kind:'mcp',name:row.server}))]
  let annotations=[]
  if(f?.collectExposureAnnotations){const value=await f.collectExposureAnnotations({...input,items});annotations=value.items;diagnostics.push(...value.diagnostics.map(row=>({...row,inference:'family-callback',severity:'warning'})))}
  else if(f?.annotateExposure)try{annotations=await f.annotateExposure({...input,items})}catch{diagnostics.push(issue('annotator-error',msg('exposure.annotator-error')))}
  const denyEntry=(entry,value)=>Object.assign(entry,{available:false,enabled:false,reason:value.reason,reasonLocales:value.reasonLocales,by:value.by})
  for(const annotation of annotations){const list=annotation.kind==='tool'?tools:annotation.kind==='skill'?skills:mcp;for(const entry of list)if((entry.server||entry.name)===annotation.name)denyEntry(entry,annotation);if(annotation.kind==='mcp')for(const entry of tools)if(attribute(entry.name,[annotation.name]).candidates?.some(candidate=>candidate.server===annotation.name)||entry.mcpServer===annotation.name)denyEntry(entry,annotation)}
  if(exclusive){const allowed=new Set((exclusive.tools||[]).map(row=>row.name));for(const entry of tools)if(!allowed.has(entry.name))Object.assign(entry,{available:false,enabled:false,toggleable:false,reason:exclusive.reason||msg('exposure.exclusive-reason'),reasonLocales:exclusive.reasonLocales,by:exclusive.module});for(const entry of [...skills,...mcp])Object.assign(entry,{available:false,enabled:false,toggleable:false,reason:exclusive.reason||msg('exposure.exclusive-reason'),reasonLocales:exclusive.reasonLocales,by:exclusive.module})}
  for(const row of snapshots.diagnostics())if(!diagnostics.some(value=>value.code===row.code&&value.reason===row.reason))diagnostics.push(row)
  tools.sort(byName);skills.sort(byName);mcp.sort((a,b)=>a.server.localeCompare(b.server))
  return {ok:true,exposure:{sessionId,rootSessionId,mcpCompleteness:{affectsVisibleList:view.mcpComplete===false},toolView:{mode,live:!!agent,rootAgentId:agent?.id||null,coldRequested:cold,preset:presetId||null,...(snapshotAt?{snapshotAt}:{}),complete:view.complete},catalog:{revision:snapshot.revision,generatedAt:snapshot.generatedAt,origin:snapshot.origin,complete:snapshot.complete,diagnostics:snapshot.diagnostics},diagnostics,provenance:{method:'shared-root-catalog',unknownTools:tools.filter(row=>row.owner?.kind==='unknown').map(row=>row.name)},skills,tools,mcp,counts:{skills:skills.length,skillsEnabled:skills.filter(row=>row.enabled).length,skillsUnavailable:skills.filter(row=>row.available===false).length,tools:tools.length,toolsEnabled:tools.filter(row=>row.enabled).length,toolsUnavailable:tools.filter(row=>row.available===false).length,mcp:mcp.length,mcpEnabled:mcp.filter(row=>row.enabled).length,mcpUnavailable:mcp.filter(row=>row.available===false).length}}}
 }
 async function toggle({sessionId,kind,name,enabled}={}){
  if(typeof sessionId!=='string'||!sessionId||!EXPOSURE_KINDS.includes(kind)||typeof name!=='string'||!name||name.length>256||typeof enabled!=='boolean')return {ok:false,status:400,error:msg('error.exposure-toggle-invalid')}
  const current=await inventory(sessionId);if(!current.ok)return current
  const list=kind==='tool'?current.exposure.tools:kind==='skill'?current.exposure.skills:current.exposure.mcp,target=list.find(row=>(row.server||row.name)===name)
  if(!target)return {ok:false,status:400,error:msg('error.exposure-name-unknown')}
  if(target.available===false||target.toggleable===false)return {ok:false,status:409,error:target.reason||msg('exposure.entry-controlled'),reasonLocales:target.reasonLocales,by:target.by||target.module}
  const resolution=await rootResolver.resolve(sessionId);if(!resolution.resolved)return {ok:false,status:409,error:msg('error.exposure-root-unresolved')}
  try{await mutatePreference(resolution.rootSessionId,kind,name,enabled)}catch{return {ok:false,status:500,error:msg('error.exposure-persist-failed')}}
  await reapplyRoot(resolution.rootSessionId)
  return inventory(sessionId)
 }
 function install(){if(installed)return;installed=true;for(const [event,callback]of [['agent/created',async({agent})=>{try{await applyAgent(agent)}catch{warn('Initial Agent enforcement failed')}}],['agent/disposed',({agent})=>disposeAgent(agent)],['tools/change',schedule]]){const dispose=ctx.on?.(event,callback);if(typeof dispose==='function')subscriptions.push(dispose)}if(provider?.catalog?.subscribe)subscriptions.push(provider.catalog.subscribe(schedule));if(family()?.subscribe)subscriptions.push(family().subscribe(schedule));ctx.effect?.(()=>()=>disposeAll());schedule()}
 async function disposeAll(){disposed=true;if(timer)clearTimeout(timer);for(const dispose of subscriptions.splice(0))dispose();for(const agent of [...apps.keys()])disposeAgent(agent);if(running)await running;await writes;caches.clear()}
 return {paths,rootResolver,inventory,toggle,applyAgent,disposeAgent,reapplyRoot,refreshAll,disposeAll,install,HIDE_PROVIDER,cacheFor}
}
