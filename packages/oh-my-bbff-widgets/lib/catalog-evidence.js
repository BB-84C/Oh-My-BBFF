/** Read-only projections of public Loader/Fiber/package APIs for the pure adapter. */
import {DSH_CONVENTIONS,auditRegistrationEvidence,scanConfiguredServers} from './dsh-adapter.js'
const get=(ctx,name)=>{try{return ctx.get(name)}catch{return undefined}}
export function readCatalogEvidence(ctx,modules=[]){
  const packages=get(ctx,'pluginPackages'),anchors=[...new Set([ctx.baseUrl,ctx.root?.baseUrl].filter(Boolean))],versions={}
  function packageOf(name,extra=[]){for(const base of [...new Set([...extra,...anchors])])try{const info=packages?.packageOf(name,base);if(info?.name)return info}catch{};return undefined}
  for(const name of new Set(DSH_CONVENTIONS.map(row=>row.ownerPackage))){const info=packageOf(name);if(typeof info?.version==='string')versions[name]=info.version}
  const loaderRows=[]
  let loaderTraversalComplete=true,registrationTraversalComplete=true
  try{
    const loader=get(ctx,'loader')
    if(typeof loader?.entries!=='function')throw new Error('Loader unavailable')
    for(const entry of loader.entries()){
      try{
        const info=packageOf(entry.options.name,[entry.parent?.tree?.ctx?.baseUrl,entry.ctx?.baseUrl].filter(Boolean))
        if(!info&&(entry.subgroup||entry.subtree))continue // public tree carriers are not unresolved leaf registrations
        if(!info)loaderTraversalComplete=false
        loaderRows.push({...(info?{packageName:info.name}:{}),moduleName:entry.options.name,enabled:!entry.disabled,config:entry.options.config,source:'configured'})
      }catch{loaderTraversalComplete=false}
    }
  }catch{loaderTraversalComplete=false}
  const effects=[],fibers=new Set(),tops=new Map(),trees=[],visited=new Set()
  try{for(const runtime of ctx.registry.values())for(const fiber of runtime.fibers)fibers.add(fiber);if(ctx.root?.fiber)fibers.add(ctx.root.fiber)}catch{registrationTraversalComplete=false}
  for(const fiber of fibers)try{for(const effect of fiber.getEffects()){tops.set(effect,fiber);trees.push([fiber,effect])}}catch{registrationTraversalComplete=false}
  function owner(start){
    const entry=start?.entry
    // Agent-owned effects may have a native loop as an ancestor while their
    // registering module is unknown. Never promote that ancestor to tool owner.
    return entry?packageOf(entry.options.name,[entry.parent?.tree?.ctx?.baseUrl].filter(Boolean))?.name:undefined
  }
  function walk(fiber,meta){
    if(!meta||visited.has(meta))return
    visited.add(meta);const direct=tops.get(meta)||fiber
    effects.push({label:meta.label,packageName:owner(direct)})
    for(const child of meta.children||[])walk(direct,child)
  }
  for(const [fiber,tree]of trees)try{walk(fiber,tree)}catch{registrationTraversalComplete=false}
  const compatible=modules.filter(row=>row.compatible!==false),familyPackages=compatible.map(row=>row.packageName),declaredFamilyPackages=compatible.filter(row=>Array.isArray(row.tools)).map(row=>row.packageName)
  const audit=auditRegistrationEvidence(effects,{traversalComplete:registrationTraversalComplete,familyPackages,declaredFamilyPackages}),configured=scanConfiguredServers(loaderRows,{traversalComplete:loaderTraversalComplete})
  return {packageVersions:versions,configured,nativeResidueProven:audit.value.nativeResidueProven,diagnostics:[...configured.diagnostics,...audit.diagnostics],adapterEvidence:{packageVersions:versions,loaderRows,loaderTraversalComplete,registrationEffects:effects,registrationTraversalComplete,familyPackages,declaredFamilyPackages}}
}
