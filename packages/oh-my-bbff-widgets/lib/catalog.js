import { wmsg as msg } from './locale-keys.js'
/** Root-owned catalog materializer. Discovery is async; every public read is cache-only. */
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createCatalogLedger} from './catalog-ledger.js'
import {buildCatalogEntries,catalogKey} from './catalog-entries.js'
import {parseMcpToolName,DSH_CONVENTIONS,selfCheck} from './dsh-adapter.js'
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
const diagnostic=(code,reason,inference=code)=>({code,inference,severity:'warning',reason})
const sorted=values=>[...new Set(values)].sort()
const cleanFact=fact=>({...fact,sources:[...(fact.sources||[])]})
const normalizeCwd=cwd=>{
  if(typeof cwd!=='string'||!path.isAbsolute(cwd)||(process.platform==='win32'&&/^\/(?!\/)/.test(cwd)))throw new TypeError('Catalog cwd must be a fully qualified absolute path')
  const value=path.normalize(cwd),root=path.parse(value).root
  return value===root?value:value.replace(/[\\/]+$/,'')
}
export function createCatalogProvider({dir,getModules=()=>[],readDiscovery,now=()=>new Date().toISOString(),notifyMs=25,ledgerOptions={}}={}){
  const identity=randomUUID(),listeners=new Set(),requested=new Set(),scannedProjects=new Set(),seenThisRun=new Set(),slices=new Map(),moduleReports=new Map(),maskRecords=new Map(),cache=new Map(),reasons=new Set(),changedProjects=new Set()
  let modules=getModules(),sequence=0,revision=identity+':0',generatedAt=now(),initial=true,maskCoverageComplete=false,disposed=false,notification,scheduled,refreshing,rerun=false,discoveryDiagnostics=[],defaultViewId,packageVersions={},nativeResidueProven=false,privateViews=new Map()
  let refreshTiming={state:'pending',reason:msg('diag.catalog-pending'),startedAt:null,completedAt:null,durationMs:null,ledgerMs:null,discoveryMs:null}
  const ledger=createCatalogLedger({...ledgerOptions,dir,now,onChange:()=>changed('ledger')})
  const compatible=id=>modules.find(row=>row.id===id&&row.compatible!==false)
  const allFacts=()=>[...slices.values()].flatMap(slice=>slice.facts||[])
  const knownServers=()=>sorted([...ledger.snapshot().entries.filter(row=>row.kind==='mcp').map(row=>row.name),...allFacts().filter(row=>row.kind==='mcp').map(row=>row.name)])
  function attributeTool(name,options={}){
    const decoded=parseMcpToolName(name,knownServers(),options?.serverHints||[])
    return decoded.value||freeze({basis:'none',uncertain:false,candidates:[],ambiguous:false,diagnostics:decoded.diagnostics})
  }
  function diagnostics(){
    const rows=[...discoveryDiagnostics,...ledger.snapshot().diagnostics,...[...slices.values()].flatMap(slice=>slice.diagnostics||[])]
    const skillSlices=[...slices.values()].filter(slice=>slice.part==='skills'),maskNames=new Set(modules.filter(module=>module.compatible!==false).flatMap(module=>module.skillMaskProviders||[]))
    if(!initial&&maskCoverageComplete&&[...requested].every(cwd=>scannedProjects.has(cwd))&&skillSlices.length&&skillSlices.every(slice=>slice.complete)){
      const base=new Set(skillSlices.flatMap(slice=>(slice.facts||[]).map(fact=>fact.name)))
      for(const record of maskRecords.values())if(maskNames.has(record.provider))for(const name of record.names)if(!base.has(name))rows.push(diagnostic('own-layer-masked','Declared mask covers '+name+' but no mask-free view currently establishes a base skill.','project-skills'))
    }
    if(initial)rows.push(diagnostic('source-pending','Initial catalog discovery has not completed.'))
    if(!ledger.snapshot().initialized)rows.push(diagnostic('ledger-pending','Historical catalog loading has not completed.','ledger'))
    for(const [id,report]of moduleReports){const module=compatible(id);if(module)rows.push(...report.diagnostics.map(row=>({...row,module:{id:module.id,title:module.title}})))}
    const unique=new Map(rows.map(row=>[JSON.stringify(row),row]))
    return [...unique.values()]
  }
  function projection(cwd){
    if(!scannedProjects.has(cwd))return {cwd,state:'pending',complete:false,diagnostics:[diagnostic('project-pending','Project skill discovery is pending.','project-skills')],entries:[],skills:[],resourceServers:[],sections:[]}
    const selected=[...slices.values()].filter(slice=>(slice.roles?.includes('host')||slice.viewId===defaultViewId)&&(!slice.cwd||slice.cwd===cwd))
    const errors=selected.flatMap(slice=>slice.diagnostics||[])
    if(!defaultViewId)errors.push(diagnostic('default-preset-unavailable','Current default preset is not known.','project-skills'))
    if(selected.some(slice=>!slice.complete))errors.push(diagnostic('project-incomplete','Project/default source contains last-success or partial data.','project-skills'))
    // An effective default×cwd skill snapshot already contains its winning host/
    // preset layers. Do not OR a shadowed host summary back into that projection.
    const effectiveSkills=selected.filter(slice=>slice.part==='skills'&&slice.viewId===defaultViewId&&slice.cwd===cwd)
    const facts=selected.flatMap(slice=>(slice.facts||[]).filter(fact=>fact.present!==false&&(fact.kind!=='skill'||!effectiveSkills.length))),skillFacts=effectiveSkills.flatMap(slice=>slice.facts||[])
    facts.push(...skillFacts.filter(fact=>fact.present!==false))
    const keys=new Map(),skills=new Map()
    for(const fact of facts){keys.set(catalogKey(fact.kind,fact.name),{kind:fact.kind,name:fact.name});if(fact.kind==='skill'){const old=skills.get(fact.name);skills.set(fact.name,{name:fact.name,modelInvocable:!!old?.modelInvocable||fact.modelInvocable!==false,userInvocable:!!old?.userInvocable||fact.userInvocable!==false})}}
    const defaultPresetId=selected.find(slice=>slice.viewId===defaultViewId)?.presetId
    return {cwd,state:errors.length?'error':'ready',complete:!errors.length,diagnostics:errors,...(defaultPresetId?{defaultPresetId}:{}),entries:[...keys.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)),skills:[...skills.values()].sort((a,b)=>a.name.localeCompare(b.name)),resourceServers:sorted(selected.flatMap(slice=>slice.resourceServers||[])),sections:sorted(selected.flatMap(slice=>slice.sections||[]))}
  }
  function snapshot(options={}){
    const cwd=options?.cwd===undefined?undefined:normalizeCwd(options.cwd)
    if(cwd&&!requested.has(cwd)){requested.add(cwd);changedProjects.add(cwd);changed('projects');schedule()}
    const key=cwd||''
    if(cache.has(key))return cache.get(key)
    const rows=diagnostics(),newRoot=cwd?projection(cwd):undefined
    if(newRoot)rows.push(...newRoot.diagnostics)
    const entries=buildCatalogEntries({observations:ledger.snapshot().entries,facts:allFacts(),modules,seenThisRun,attributeTool,packageVersions,nativeResidueProven})
    const value=freeze({contract:1,revision,generatedAt,origin:'live',...(cwd?{cwd}:{}),complete:rows.length===0,diagnostics:rows,entries,...(newRoot?{newRoot}:{})})
    cache.set(key,value);return value
  }
  function changed(reason){
    if(disposed)return
    revision=identity+':'+(++sequence);generatedAt=now();cache.clear();reasons.add(reason)
    if(!notification){notification=setTimeout(()=>{notification=null;const change=freeze({revision,reasons:[...reasons],projectPaths:[...changedProjects]});reasons.clear();changedProjects.clear();for(const listener of [...listeners])try{listener(change)}catch{}},notifyMs);notification.unref?.()}
  }
  function declarationsChanged(next=getModules()){
    modules=next
    for(const [id,report]of moduleReports)if(compatible(id)!==report.registration)moduleReports.delete(id)
    // Pure overlays happen now, before the family registry invokes its listeners.
    changed('family')
    schedule()
  }
  function mergeSlice(old,incoming){
    const at=now(),nextFacts=(incoming.facts||[]).map(fact=>({...cleanFact(fact),at:fact.at||at}))
    if(incoming.complete)return {...incoming,facts:nextFacts}
    const facts=new Map((old?.facts||[]).map(fact=>[catalogKey(fact.kind,fact.name),{...fact,stale:true}]))
    for(const fact of nextFacts)facts.set(catalogKey(fact.kind,fact.name),fact)
    return {...old,...incoming,facts:[...facts.values()],diagnostics:incoming.diagnostics?.length?incoming.diagnostics:[diagnostic('source-incomplete','A source is incomplete; last-success facts are retained.')]}
  }
  async function refresh(){
    if(disposed)return snapshot()
    if(refreshing){rerun=true;return refreshing}
    if(scheduled){clearTimeout(scheduled);scheduled=null}
    refreshing=(async()=>{
      const started=performance.now();refreshTiming={state:'running',reason:msg('diag.catalog-running'),startedAt:Date.now(),completedAt:null,durationMs:null,ledgerMs:null,discoveryMs:null}
      await ledger.initialize();refreshTiming.ledgerMs=performance.now()-started
      try{
        const submittedPaths=[...requested]
        const discoveryStarted=performance.now(),result=await readDiscovery({projectPaths:submittedPaths});refreshTiming.discoveryMs=performance.now()-discoveryStarted
        if(disposed)return snapshot()
        const active=new Set()
        for(const incoming of result.slices||[]){if(typeof incoming.id!=='string')continue;active.add(incoming.id);slices.set(incoming.id,mergeSlice(slices.get(incoming.id),incoming))}
        for(const [id,old]of slices)if(!active.has(id)){
          if(result.authoritative===true)slices.delete(id)
          else slices.set(id,{...old,complete:false,facts:old.facts.map(fact=>({...fact,stale:true})),diagnostics:[diagnostic('source-unconfirmed','Source coverage could not be reconfirmed; last-success data retained.')]})
        }
        defaultViewId=result.defaultViewId;maskCoverageComplete=result.authoritative===true;packageVersions=result.packageVersions||{};nativeResidueProven=result.nativeResidueProven===true
        privateViews=result.privateViews||new Map();discoveryDiagnostics=result.diagnostics||[]
        if(result.adapterEvidence){const report=selfCheck(result.adapterEvidence);discoveryDiagnostics.push(...report.diagnostics)}
        for(const cwd of [...submittedPaths,...(result.projectPaths||[])])scannedProjects.add(cwd)
        initial=false
        const observations=[]
        for(const incoming of result.slices||[])for(const fact of incoming.facts||[]){
          if(fact.observed===false)continue
          const id=catalogKey(fact.kind,fact.name);seenThisRun.add(id)
          const at=fact.at||now()
          observations.push({kind:fact.kind,name:fact.name,description:String(fact.description||''),sources:fact.sources||[],...(fact.sources?.[0]?{latestSource:fact.sources[0]}:{}),firstSeenAt:at,lastSeenAt:at,...(fact.sessionLocal?{sessionLocal:true}:{}),...(fact.kind==='skill'?{projectPaths:fact.projectPath?[fact.projectPath]:[]}:{})})
        }
        if(observations.length)ledger.observe(observations)
        changed('tools')
      }catch{initial=false;discoveryDiagnostics=[diagnostic('discovery-error','Catalog discovery failed; previous successful sources are retained.')];for(const [id,old]of slices)slices.set(id,{...old,complete:false,facts:old.facts.map(fact=>({...fact,stale:true}))});changed('diagnostics')}
      refreshTiming={...refreshTiming,state:discoveryDiagnostics.some(row=>row.code==='discovery-error')?'error':'ready',reason:discoveryDiagnostics.some(row=>row.code==='discovery-error')?'Catalog discovery failed; last-success metadata is retained.':'',completedAt:Date.now(),durationMs:performance.now()-started}
      return snapshot()
    })().finally(()=>{refreshing=null;if(rerun&&!disposed){rerun=false;schedule()}})
    return refreshing
  }
  function schedule(){if(disposed||scheduled)return;scheduled=setTimeout(()=>{scheduled=null;void refresh()},0);scheduled.unref?.()}
  function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);changed('diagnostics');return()=>listeners.delete(listener)}
  function reportAdapterDiagnostics(id,rows){
    const registration=compatible(id),allowed=new Set(DSH_CONVENTIONS.map(row=>row.inference))
    if(!registration)return()=>{}
    const diagnostics=(Array.isArray(rows)?rows:[]).filter(row=>row&&allowed.has(row.code)&&allowed.has(row.inference)&&['warning','error'].includes(row.severity)&&typeof row.reason==='string').map(row=>({code:row.code,inference:row.inference,severity:row.severity,reason:row.reason,...(row.reasonLocales?{reasonLocales:{...row.reasonLocales}}:{})}))
    const report={registration,diagnostics};moduleReports.set(id,report);changed('diagnostics')
    return()=>{if(moduleReports.get(id)===report){moduleReports.delete(id);changed('diagnostics')}}
  }
  const failure=(code,reason)=>freeze({ok:false,code,diagnostic:diagnostic(code,reason,'ledger')})
  async function importObservations(id,records){
    const registration=compatible(id)
    if(!registration)return failure('invalid-module','Observation import requires a currently registered compatible module.')
    const response=await ledger.importObservations(records,{isCurrent:()=>compatible(id)===registration})
    if(!response.ok)return failure(response.code,'Observation import was not committed: '+response.code)
    changed('import');return freeze({...response,revision})
  }
  function forgetBlock(kind,name){
    if(!['tool','mcp','skill'].includes(kind))return 'unsupported-kind'
    const view=snapshot(),row=view.entries.find(row=>row.kind===kind&&row.name===name)
    if(row?.declaredBy.length)return 'declared'
    if(row?.exclusive)return 'exclusive'
    if(row?.reserved)return 'reserved'
    if(row?.present)return 'present'
    if(!view.complete)return 'incomplete'
  }
  async function forget(kind,name){
    const blocked=forgetBlock(kind,name)
    if(blocked)return failure(blocked,'Catalog row is protected: '+blocked)
    const response=await ledger.forget(kind,name,{canForget:()=>forgetBlock(kind,name)})
    if(!response.ok)return failure(response.code==='ledger-full'?'storage-error':response.code,'Catalog forget was not committed: '+response.code)
    changed('forget');return freeze({...response,revision})
  }
  function sessionView({agent,presetId,cwd}={}){
    const current=snapshot(cwd?{cwd}:{}),errors=[]
    let live=agent?(readDiscovery.readLiveView?.(agent)||privateViews.get(agent)):undefined
    if(agent&&live?.complete===false&&!live.tools?.length&&privateViews.has(agent))live={...privateViews.get(agent),...live,tools:privateViews.get(agent).tools,stale:true}
    if(live?.tools?.length)privateViews.set(agent,{...live})
    const currentPreset=[...slices.values()].find(slice=>slice.part==='tools'&&slice.roles?.includes('current')&&slice.presetId===presetId&&slice.complete)
    const viewId=agent?live?.viewId:presetId?currentPreset?.viewId:defaultViewId
    const selected=[...slices.values()].filter(slice=>(slice.roles?.includes('host')||slice.viewId===viewId)&&(!slice.cwd||slice.cwd===cwd)&&!slice.roles?.includes('session'))
    if(!viewId)errors.push(diagnostic('session-view-pending','The exact session/preset view is not yet confirmed.'))
    if(cwd&&!scannedProjects.has(normalizeCwd(cwd)))errors.push(diagnostic('project-pending','The session project view is pending.','project-skills'))
    errors.push(...selected.flatMap(slice=>slice.diagnostics||[]),...(live?.diagnostics||[]))
    const effectiveSkills=selected.filter(slice=>slice.part==='skills'&&slice.viewId===viewId&&(cwd?slice.cwd===cwd:!slice.cwd))
    const skillFacts=(effectiveSkills.length?effectiveSkills:selected.filter(slice=>slice.part==='skills'&&!slice.cwd)).flatMap(slice=>slice.facts||[])
    const toolFacts=selected.filter(slice=>slice.part==='tools').flatMap(slice=>slice.facts||[])
    const sectionFacts=selected.filter(slice=>['sections','mcp'].includes(slice.part)).flatMap(slice=>slice.facts||[])
    const liveFacts=(live?.tools||[]).map(row=>({kind:'tool',name:row.name,description:row.description,sources:[row.sessionLocal?'session-local':viewId==='host'?'host':'preset:'+(presetId||'current')],sessionLocal:row.sessionLocal===true,stale:live.stale===true}))
    const facts=[...toolFacts,...sectionFacts,...skillFacts,...liveFacts],keys=new Set(facts.map(fact=>catalogKey(fact.kind,fact.name)))
    const entries=buildCatalogEntries({facts,modules,attributeTool,packageVersions,nativeResidueProven}).filter(entry=>keys.has(catalogKey(entry.kind,entry.name))||(entry.kind==='mcp'&&facts.some(fact=>fact.kind==='tool'&&attributeTool(fact.name).server===entry.name)))
    const visibleNames=agent?(live?.tools||[]).map(row=>row.name):toolFacts.filter(row=>selected.some(slice=>slice.viewId===viewId&&slice.part==='tools'&&slice.facts?.includes(row))).map(row=>row.name)
    return {snapshot:current,entries,skills:entries.filter(row=>row.kind==='skill'),tools:entries.filter(row=>row.kind==='tool'),mcp:entries.filter(row=>row.kind==='mcp'),visibleNames,globalNames:selected.filter(slice=>slice.roles?.includes('host')&&slice.part==='tools').flatMap(slice=>(slice.facts||[]).map(row=>row.name)),complete:!initial&&!!viewId&&!errors.length&&selected.every(slice=>slice.complete)&&(!agent||live?.complete===true),diagnostics:errors,live:!!agent,mode:agent?'live':viewId?'preset':'error',mcpComplete:!initial&&!!viewId&&selected.filter(slice=>['sections','mcp'].includes(slice.part)).every(slice=>slice.complete)}
  }
  const catalog=Object.freeze({snapshot,subscribe,attributeTool,importObservations,reportAdapterDiagnostics,forget})
  async function dispose(){disposed=true;for(const timer of [scheduled,notification])if(timer)clearTimeout(timer);listeners.clear();if(refreshing)await refreshing;return ledger.dispose()}
  return Object.freeze({catalog,status:()=>({...refreshTiming,hasValue:!initial,revision,elapsedMs:refreshTiming.startedAt===null?0:refreshTiming.completedAt===null?Date.now()-refreshTiming.startedAt:refreshTiming.durationMs}),declarationsChanged,refresh,invalidate(reason='tools'){changed(reason);schedule()},start:schedule,privateView:agent=>privateViews.get(agent),sessionView,recordMasks(agent,provider,names){const old=maskRecords.get(agent),next={provider,names:[...names].sort()};if(!names.length){if(maskRecords.delete(agent))changed('diagnostics')}else if(JSON.stringify(old)!==JSON.stringify(next)){maskRecords.set(agent,next);changed('diagnostics')}},readLiveView:agent=>typeof readDiscovery.readLiveView==='function'?readDiscovery.readLiveView(agent):{tools:[],complete:false,diagnostics:[diagnostic('live-tool-view-error','Root discovery does not expose a live view.')]},dispose})
}
