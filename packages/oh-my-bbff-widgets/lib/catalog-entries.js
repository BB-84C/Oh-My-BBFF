/** Pure aggregation of current view facts, historical observations and current descriptors. */
import {nativeToolTrait,reservedTool,DSH_CONVENTIONS} from './dsh-adapter.js'
import {CATALOG_SOURCES_PER_ROW_MAX,CATALOG_PROJECT_PATHS_PER_SKILL_MAX,EXPOSURE_TEXT_MAX_LENGTH} from './bbff-contract.js'
import { wmsg as msg } from './locale-keys.js'
export const catalogKey=(kind,name)=>kind+'\0'+name
export const catalogSource=(kind,value)=>kind+':'+value
const unique=values=>[...new Set(values)].sort()
const moduleInfo=module=>({id:module.id,title:module.title})
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
export function inferenceBasis(inference,source,packageVersions={}){
  const convention=DSH_CONVENTIONS.find(row=>row.inference===inference)
  return {kind:'adapter',source,inference,packageName:convention?.ownerPackage||'',...(packageVersions[convention?.ownerPackage]?{packageVersion:packageVersions[convention.ownerPackage]}:{})}
}
export function buildCatalogEntries({observations=[],facts=[],modules=[],seenThisRun=new Set(),attributeTool,packageVersions={},nativeResidueProven=false}={}){
  const contextKeys=new WeakMap()   // per entry: the JSON of the contexts already pushed (a Set lookup instead of comparing against every earlier context)
  const entries=new Map(),compatible=modules.filter(module=>module?.compatible!==false),managedConfiguration=new Map(facts.filter(fact=>fact.kind==='mcp'&&fact.configurationAuthority==='manager').map(fact=>[fact.name,fact.configured]))
  // Prebuilt lookups: the per-entry loop used find() over modules and facts for every tool entry,
  // which is quadratic once entries and facts are both large. First-in-order wins, exactly find().
  const ownerByTool=new Map(),exclusiveByTool=new Map(),contributorByTool=new Map()
  for(const module of compatible)for(const name of module.tools||[])if(!ownerByTool.has(name))ownerByTool.set(name,module)
  for(const module of compatible)for(const name of module.exclusiveTools?.tools||[])if(!exclusiveByTool.has(name))exclusiveByTool.set(name,module)
  for(const fact of facts)if(fact?.kind==='tool'&&typeof fact.name==='string'&&fact.moduleId&&!contributorByTool.has(fact.name))contributorByTool.set(fact.name,fact)
  function ensure(kind,name,description=''){
    const id=catalogKey(kind,name)
    if(!entries.has(id))entries.set(id,{kind,name,description,sources:[],sourcesTruncated:false,owner:{kind:'unknown'},ownerBasis:inferenceBasis('registration-provenance',msg('catalog.owner.no-evidence'),packageVersions),declaredBy:[],present:false,stale:false,seenThisRun:seenThisRun.has(id),firstSeenAt:null,lastSeenAt:null,...(kind==='tool'?{sessionLocal:false}:kind==='skill'?{modelInvocable:false,userInvocable:false,projectPaths:[],contexts:[],skillSources:[],skillProviders:[]}:{toolCount:0,currentToolCount:0,zeroCurrentTools:true,coldCatalog:false})})
    return entries.get(id)
  }
  const capSources=entry=>{const values=unique(entry.sources);if(values.length>CATALOG_SOURCES_PER_ROW_MAX)entry.sourcesTruncated=true;entry.sources=values.slice(0,CATALOG_SOURCES_PER_ROW_MAX)}
  for(const row of observations){
    const entry=ensure(row.kind,row.name,row.description)
    entry.description=row.description;entry.sources.push(...row.sources);entry.sourcesTruncated||=row.sourcesTruncated===true
    entry.firstSeenAt=row.firstSeenAt;entry.lastSeenAt=row.lastSeenAt
    if(row.latestSource)entry.latestSource=row.latestSource
    if(row.kind==='tool')entry.sessionLocal=row.sessionLocal===true
    if(row.kind==='skill')entry.projectPaths=[...(row.projectPaths||[])]
  }
  for(const fact of facts){
    if(!fact||!['tool','mcp','skill'].includes(fact.kind)||typeof fact.name!=='string'||!fact.name)continue
    const entry=ensure(fact.kind,fact.name)
    if(fact.description)entry.description=String(fact.description).slice(0,EXPOSURE_TEXT_MAX_LENGTH)
    entry.sources.push(...(fact.sources||[]));entry.sourcesTruncated||=fact.sourcesTruncated===true
    entry.present||=fact.present!==false;entry.stale||=fact.stale===true
    entry.seenThisRun||=fact.observed!==false
    if(fact.at){entry.firstSeenAt=!entry.firstSeenAt||fact.at<entry.firstSeenAt?fact.at:entry.firstSeenAt;if(!entry.lastSeenAt||fact.at>=entry.lastSeenAt){entry.lastSeenAt=fact.at;if(fact.sources?.length)entry.latestSource=fact.sources[0]}}
    if(fact.kind==='tool')entry.sessionLocal||=fact.sessionLocal===true
    else if(fact.kind==='mcp'){
      if(fact.configured!==undefined)entry.configured=fact.configured
      if(fact.configuredEnabled!==undefined)entry.configuredEnabled=fact.configuredEnabled
    }else{
      const modelInvocable=fact.modelInvocable!==false,userInvocable=fact.userInvocable!==false
      entry.modelInvocable||=modelInvocable;entry.userInvocable||=userInvocable
       if(typeof fact.skillSource==='string')entry.skillSources.push(fact.skillSource)
       if(typeof fact.skillProvider==='string')entry.skillProviders.push(fact.skillProvider)
      if(fact.projectPath)entry.projectPaths.push(fact.projectPath)
      const sources=(fact.sources||[]).slice(),context={...(fact.projectPath?{projectPath:fact.projectPath}:{}),sources,modelInvocable,userInvocable}
      const contextKey=JSON.stringify(context),seenContexts=contextKeys.get(entry)||contextKeys.set(entry,new Set()).get(entry)
      if(!seenContexts.has(contextKey)){seenContexts.add(contextKey);entry.contexts.push(context)}
    }
  }
  for(const module of compatible)for(const name of module.tools||[]){
    const entry=ensure('tool',name)
    entry.sources.push(catalogSource('bbff',module.id))
    entry.declaredBy.push(moduleInfo(module))
  }
  for(const entry of [...entries.values()]){
    if(entry.kind!=='tool')continue
    const owner=ownerByTool.get(entry.name)
    const contributorOwner=contributorByTool.get(entry.name)
    const reserved=reservedTool(entry.name)
    const attributed=attributeTool?.(entry.name)
    if(attributed?.server)entry.mcpServer=attributed.server
    if(reserved){entry.reserved=reserved;entry.owner={kind:'dsh'};entry.ownerBasis=inferenceBasis('reserved-transport',msg('catalog.owner.reserved-transport'),packageVersions)}
    else if(owner){entry.owner={kind:'bbff',module:moduleInfo(owner)};entry.ownerBasis={kind:'contract',source:msg('catalog.owner.declared-by',{module:owner.title}),module:moduleInfo(owner)}}
    else if(contributorOwner){const module=compatible.find(row=>row.id===contributorOwner.moduleId);if(module){entry.owner={kind:'bbff',module:moduleInfo(module)};entry.ownerBasis={kind:'contract',source:msg('catalog.owner.session-contribution',{module:module.title}),module:moduleInfo(module)}}}
    else if(attributed?.server){entry.owner={kind:'mcp',server:attributed.server};entry.ownerBasis=inferenceBasis('mcp-tool-name',msg('catalog.owner.mcp-attribution',{basis:attributed.basis}),packageVersions)}
    else if(nativeResidueProven){entry.owner={kind:'dsh'};entry.ownerBasis=inferenceBasis('registration-provenance',msg('catalog.owner.registration-audit'),packageVersions)}
    const exclusive=exclusiveByTool.get(entry.name)
    if(exclusive)entry.exclusive={module:moduleInfo(exclusive),reason:exclusive.exclusiveTools.reason,...(exclusive.exclusiveTools.reasonLocales?{reasonLocales:exclusive.exclusiveTools.reasonLocales}:{})}
    const trait=owner?.toolTraits?.[entry.name]
    if(trait){entry.effect=trait.effect;entry.effectBasis={kind:'contract',source:msg('catalog.owner.tool-effect',{module:owner.title}),module:moduleInfo(owner)}}
    else if(entry.owner.kind==='dsh'){
      const native=nativeToolTrait(entry.name)
      if(native.value.effect){entry.effect=native.value.effect;entry.effectBasis=inferenceBasis('native-tool-classes',msg('catalog.owner.native-effect'),packageVersions)}
    }
    if(entry.mcpServer){
      const server=ensure('mcp',entry.mcpServer)
      server.sources.push(catalogSource('mcp',entry.mcpServer));server.toolCount++
      if(entry.present){server.currentToolCount++;server.present=true}
      server.stale||=entry.stale;server.seenThisRun||=entry.seenThisRun
      if(entry.firstSeenAt&&(!server.firstSeenAt||entry.firstSeenAt<server.firstSeenAt))server.firstSeenAt=entry.firstSeenAt
      if(entry.lastSeenAt&&(!server.lastSeenAt||entry.lastSeenAt>server.lastSeenAt))server.lastSeenAt=entry.lastSeenAt
    }
  }
  for(const entry of entries.values()){
    capSources(entry)
    if(entry.kind==='mcp'){
      if(managedConfiguration.has(entry.name))entry.configured=managedConfiguration.get(entry.name)
      entry.zeroCurrentTools=entry.currentToolCount===0;entry.coldCatalog=!entry.present
      entry.owner={kind:'mcp',server:entry.name};entry.ownerBasis=inferenceBasis('mcp-section-name',msg('catalog.owner.mcp-section'),packageVersions)
    }else if(entry.kind==='skill'){
      const paths=unique(entry.projectPaths);if(paths.length>CATALOG_PROJECT_PATHS_PER_SKILL_MAX)entry.sourcesTruncated=true
      entry.projectPaths=paths.slice(0,CATALOG_PROJECT_PATHS_PER_SKILL_MAX)
       entry.skillSources=unique(entry.skillSources);entry.skillProviders=unique(entry.skillProviders)
       if(entry.skillSources.length===1)entry.skillSource=entry.skillSources[0]
      entry.contexts.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }
  }
  return freeze([...entries.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)))
}
