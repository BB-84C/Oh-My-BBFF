/** Generic family registry. Module facts are data; callbacks are bounded and diagnostic. */
import pkg from '../package.json' with {type:'json'}
import {CONTRACT_VERSION,FAMILY_SERVICE,validateModuleDescriptor,validateModuleTools,isLocalizedText,isMessageRef,validateModuleExclusiveTools,validateExposureContribution,AGENT_ANNOTATOR_TIMEOUT_MS,EXPOSURE_ANNOTATOR_TIMEOUT_MS,EXPOSURE_CONTRIBUTOR_TIMEOUT_MS,AGENT_ANNOTATIONS_PER_ID_MAX,EXPOSURE_TEXT_MAX_LENGTH,REASON_LOCALES_MAX_ENTRIES,REASON_LOCALE_KEY_MAX_LENGTH} from './bbff-contract.js'
import { wmsg as msg } from './locale-keys.js'
export const FAMILY_SERVICE_KEY = FAMILY_SERVICE
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item)
    Object.freeze(value)
  }
  return value
}
const text = value => typeof value === 'string' ? value.trim() : ''
/** Host text is a message reference (preferred), a legacy localized map, or plain text. */
const textOrRef = value => isMessageRef(value) ? value : (isLocalizedText(value) ? value : text(value))
/** Stamp a collected reference with its producer package (recursively into params). */
const stampRef = (value, ns) => {
  if (!isMessageRef(value)) return value
  const stamped = { ...value, ns: typeof value.ns === 'string' && value.ns ? value.ns : ns }
  if (value.params && typeof value.params === 'object') stamped.params = Object.fromEntries(Object.entries(value.params).map(([name, item]) => [name, stampRef(item, ns)]))
  return stamped
}
const refOrText = (value, ns) => isMessageRef(value) ? stampRef(value, ns) : textOrRef(value)
const bounded = value => text(value).slice(0,EXPOSURE_TEXT_MAX_LENGTH)
function locales(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const pairs=Object.entries(value).filter(([key,value])=>key.trim()&&key.length<=REASON_LOCALE_KEY_MAX_LENGTH&&typeof value==='string'&&value.trim())
    .slice(0,REASON_LOCALES_MAX_ENTRIES).map(([key,value])=>[key,bounded(value)])
  return pairs.length ? freeze(Object.fromEntries(pairs)) : undefined
}
function record(descriptor,compatible,warnings=[],errors=[]) {
  const allowed=field=>!warnings.some(message=>message.startsWith('descriptor.'+field))
  const exclusive=descriptor.exclusiveTools
  return freeze({
    contract:CONTRACT_VERSION,id:text(descriptor.id),title:refOrText(descriptor.title,descriptor.packageName),description:refOrText(descriptor.description,descriptor.packageName),version:text(descriptor.version),packageName:text(descriptor.packageName),
    ...(descriptor.locale&&typeof descriptor.locale==='object'&&typeof descriptor.locale.dir==='string'?{locale:{dir:descriptor.locale.dir}}:{}),
    ...(typeof descriptor.apiBase==='string'?{apiBase:descriptor.apiBase}:{}),
    ...(descriptor.ui&&typeof descriptor.ui==='object'?{ui:{...(Array.isArray(descriptor.ui.cards)?{cards:descriptor.ui.cards.filter(card=>typeof card==='string')}:{}),...(typeof descriptor.ui.settings==='boolean'?{settings:descriptor.ui.settings}:{})}}:{}),
    ...(descriptor.tools!==undefined&&validateModuleTools(descriptor.tools).ok?{tools:descriptor.tools.slice()}:{}),
    ...(exclusive!==undefined&&validateModuleExclusiveTools(exclusive,descriptor.tools).ok?{exclusiveTools:{tools:exclusive.tools.slice(),reason:refOrText(exclusive.reason,descriptor.packageName),...(locales(exclusive.reasonLocales)?{reasonLocales:locales(exclusive.reasonLocales)}:{})}}:{}),
    ...(descriptor.toolTraits!==undefined&&allowed('toolTraits')?{toolTraits:Object.fromEntries(Object.entries(descriptor.toolTraits).map(([name,trait])=>[name,{effect:trait.effect}]))}:{}),
    ...(descriptor.requiredTools!==undefined&&allowed('requiredTools')?{requiredTools:{tools:descriptor.requiredTools.tools.slice(),reason:refOrText(descriptor.requiredTools.reason,descriptor.packageName),...(locales(descriptor.requiredTools.reasonLocales)?{reasonLocales:locales(descriptor.requiredTools.reasonLocales)}:{})}}:{}),
    ...(descriptor.skillMaskProviders!==undefined&&allowed('skillMaskProviders')?{skillMaskProviders:descriptor.skillMaskProviders.slice()}:{}),
    ...(descriptor.permissionLayer!==undefined&&allowed('permissionLayer')?{permissionLayer:{title:refOrText(descriptor.permissionLayer.title,descriptor.packageName),...(locales(descriptor.permissionLayer.titleLocales)?{titleLocales:locales(descriptor.permissionLayer.titleLocales)}:{}),...(descriptor.permissionLayer.settingsSectionId!==undefined?{settingsSectionId:descriptor.permissionLayer.settingsSectionId}:{})}}:{}),
    ...(warnings.length?{warnings:warnings.slice()}:{}),...(errors.length?{errors:errors.slice()}:{}),compatible:!!compatible,
  })
}
/** Package identity is a static JSON dependency, also used by the actual Root self-registration. */
export const FAMILY_DESCRIPTOR=freeze({contract:pkg.bbff.contract,id:pkg.bbff.id,packageName:pkg.name,version:pkg.version,title:pkg.bbff.title,description:pkg.description})
export function createFamilyRegistry({root,logger,catalog,resolveRoot,onDeclarationsChange}={}) {
  const rootInfo=freeze({
    id:root?.id||pkg.bbff?.id,packageName:root?.packageName||pkg.name,version:root?.version||pkg.version,title:root?.title||pkg.bbff?.title||pkg.name,
    ...(root?.apiBase?{apiBase:root.apiBase}:{}),tools:validateModuleTools(root?.tools).ok?root.tools.slice():[],
    ...(Array.isArray(root?.skillMaskProviders)?{skillMaskProviders:root.skillMaskProviders.slice()}:{}),
  })
  const entries=new Map(),listeners=new Set(),diagnosticRows=new Map()
  const annotators=new Map(),exposureAnnotators=new Map(),contributors=new Map()
  const warn=message=>{try{logger?.warn?.(message)}catch{}}
  function diagnostic(feature,moduleId,code,reason) {
    const value=freeze({code,...(moduleId?{moduleId}:{}),feature,reason})
    diagnosticRows.set(feature+'\0'+(moduleId||'')+'\0'+code,value)
    warn('bbff family: '+feature.replaceAll('-',' ')+' '+(moduleId?'"'+moduleId+'"':'(unattributed)')+' '+code+': '+reason)
    return value
  }
  function clearFeature(feature,moduleId) {
    for(const [key,row] of diagnosticRows)if(row.feature===feature&&row.moduleId===moduleId)diagnosticRows.delete(key)
  }
  const diagnostics=()=>freeze([...diagnosticRows.values()])
  const list=()=>freeze([...entries.values()])
  function notify() {
    const snapshot=list()
    // This hook is internal provider orchestration, not a public consumer callback.
    // It commits pure declaration overlays before ANY public family listener.
    try{onDeclarationsChange?.(snapshot)}catch{diagnostic('descriptor',undefined,'callback-error',msg('diag.family.overlay-refresh-failed'))}
    for(const listener of [...listeners])try{listener(snapshot)}catch{diagnostic('descriptor',undefined,'callback-error',msg('diag.family.subscriber-failed'))}
  }
  function remove(id) {
    if(!entries.delete(id))return
    for(const map of [annotators,exposureAnnotators,contributors])map.delete(id)
    for(const [key,row] of diagnosticRows)if(row.moduleId===id)diagnosticRows.delete(key)
    notify()
  }
  function register(descriptor) {
    const candidate=descriptor&&typeof descriptor==='object'&&!Array.isArray(descriptor)?descriptor:{}
    const id=text(candidate.id)
    let validation
    try{validation=validateModuleDescriptor(descriptor)}catch{validation={ok:false,errors:['Descriptor fields could not be read.']}}
    const {ok,errors=[],warnings=[]}=validation
    if(entries.has(id)) {diagnostic('descriptor',id,'duplicate-module',msg('diag.family.duplicate-module'));return()=>{}}
    clearFeature('descriptor',id)
    for(const warning of warnings)diagnostic('descriptor',id||undefined,'optional-field-dropped',warning)
    if(!ok)diagnostic('descriptor',id||undefined,candidate.contract!==undefined&&candidate.contract!==CONTRACT_VERSION?'incompatible-descriptor':'invalid-descriptor',msg(candidate.contract!==undefined&&candidate.contract!==CONTRACT_VERSION?'diag.family.incompatible-descriptor':'diag.family.invalid-descriptor',{detail:errors.join('; ')}))
    if(!id)return()=>{}
    try{entries.set(id,record(candidate,ok,warnings,errors))}catch{
      diagnostic('descriptor',id,'invalid-descriptor',msg('diag.family.descriptor-copy-failed'));return()=>{}
    }
    notify()
    return()=>remove(id)
  }
  function registerCallback(map,feature,moduleId,callback) {
    const id=text(moduleId)
    if(!id||typeof callback!=='function')return()=>{}
    if(map.has(id)){diagnostic(feature,id,'duplicate-module',msg('diag.family.duplicate-callback'));return()=>{}}
    map.set(id,callback)
    if(feature==='exposure-contributor')notify()
    return()=>{if(map.get(id)===callback){map.delete(id);clearFeature(feature,id);if(feature==='exposure-contributor')notify()}}
  }
  async function callOne(feature,moduleId,callback,input,timeoutMs) {
    clearFeature(feature,moduleId)
    let timer
    try{
      const outcome=await Promise.race([
        Promise.resolve().then(()=>callback(input)).then(value=>({status:'ok',value}),()=>({status:'error'})),
        new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout'}),timeoutMs)}),
      ])
      if(outcome.status!=='ok') {
        const row=diagnostic(feature,moduleId,outcome.status==='timeout'?'timeout':'callback-error',outcome.status==='timeout'?msg('diag.family.callback-timeout'):msg('diag.family.callback-failed'))
        return {...outcome,diagnostics:[row]}
      }
      return {...outcome,diagnostics:[]}
    }finally{clearTimeout(timer)}
  }
  const TONES=new Set(['default','info','warning','success'])
  const producerNs = (moduleId) => {
    const entry = entries.get(moduleId)
    return entry && typeof entry.packageName === 'string' && entry.packageName ? entry.packageName : String(moduleId)
  }
  function cleanAgentAnnotation(moduleId,value) {
    if(!value||typeof value!=='object')return null
    const ns = producerNs(moduleId)
    const label=isMessageRef(value.label)?stampRef(value.label,ns):(typeof value.label==='string'?bounded(value.label):locales(value.label))
    if(!label)return null
    return freeze({module:moduleId,label,tone:TONES.has(value.tone)?value.tone:'default',...(isMessageRef(value.title)?{title:stampRef(value.title,ns)}:(typeof value.title==='string'?{title:bounded(value.title)}:{}))})
  }
  async function collectAgentAnnotations(ids,{timeoutMs=AGENT_ANNOTATOR_TIMEOUT_MS}={}) {
    const wanted=[...new Set((Array.isArray(ids)?ids:[]).filter(id=>typeof id==='string'&&id))]
    if(!wanted.length)return freeze({items:{},outcomes:[],diagnostics:[]})
    const batches=await Promise.all([...annotators].map(async([moduleId,callback])=>({moduleId,...await callOne('agent-annotator',moduleId,callback,freeze(wanted.slice()),timeoutMs)})))
    const merged=new Map(),outcomes=[],reported=[]
    for(const batch of batches){
      reported.push(...batch.diagnostics)
      if(batch.status!=='ok'){outcomes.push({moduleId:batch.moduleId,status:batch.status});continue}
      if(!batch.value||typeof batch.value!=='object'||Array.isArray(batch.value)){
        const row=diagnostic('agent-annotator',batch.moduleId,'invalid-result',msg('diag.family.annotator-invalid-result'));reported.push(row);outcomes.push({moduleId:batch.moduleId,status:'invalid'});continue
      }
      outcomes.push({moduleId:batch.moduleId,status:'ok'})
      for(const id of wanted){
        const values=Array.isArray(batch.value[id])?batch.value[id]:batch.value[id]?[batch.value[id]]:[]
        for(const value of values){
          const item=cleanAgentAnnotation(batch.moduleId,value)
          if(!item)continue
          const rows=merged.get(id)||[]
          if(rows.length>=AGENT_ANNOTATIONS_PER_ID_MAX){reported.push(diagnostic('agent-annotator',batch.moduleId,'result-truncated',msg('diag.family.annotation-cap')));continue}
          rows.push(item);merged.set(id,rows)
        }
      }
    }
    return freeze({items:Object.fromEntries(merged),outcomes,diagnostics:reported})
  }
  async function collectExposureAnnotations(input,{timeoutMs=EXPOSURE_ANNOTATOR_TIMEOUT_MS}={}) {
    const kinds=new Set(['tool','mcp','skill'])
    const items=(Array.isArray(input?.items)?input.items:[]).filter(item=>item&&kinds.has(item.kind)&&typeof item.name==='string'&&item.name).map(item=>({kind:item.kind,name:item.name,...(typeof item.server==='string'?{server:item.server}:{})}))
    if(!items.length)return freeze({items:[],outcomes:[],diagnostics:[]})
    const request=freeze({sessionId:input.sessionId,rootSessionId:input.rootSessionId,cwd:input.cwd,items})
    const wanted=new Set(items.map(item=>item.kind+'\0'+item.name))
    const batches=await Promise.all([...exposureAnnotators].map(async([moduleId,callback])=>({moduleId,...await callOne('exposure-annotator',moduleId,callback,request,timeoutMs)})))
    const merged=new Map(),outcomes=[],reported=[]
    for(const batch of batches){
      reported.push(...batch.diagnostics)
      if(batch.status!=='ok'){outcomes.push({moduleId:batch.moduleId,status:batch.status});continue}
      if(!Array.isArray(batch.value)){reported.push(diagnostic('exposure-annotator',batch.moduleId,'invalid-result',msg('diag.family.exposure-annotator-invalid-result')));outcomes.push({moduleId:batch.moduleId,status:'invalid'});continue}
      outcomes.push({moduleId:batch.moduleId,status:'ok'})
      for(const value of batch.value){
        if(!value||!wanted.has(value.kind+'\0'+value.name)||value.available!==false||!(isMessageRef(value.reason)||text(value.reason)))continue
        const key=value.kind+'\0'+value.name
        if(!merged.has(key))merged.set(key,freeze({kind:value.kind,name:value.name,available:false,reason:isMessageRef(value.reason)?stampRef(value.reason,producerNs(batch.moduleId)):bounded(value.reason),...(locales(value.reasonLocales)?{reasonLocales:locales(value.reasonLocales)}:{}),by:text(value.by).slice(0,64)||batch.moduleId}))
      }
    }
    return freeze({items:[...merged.values()],outcomes,diagnostics:reported})
  }
  async function collectExposureContributions(input,{timeoutMs=EXPOSURE_CONTRIBUTOR_TIMEOUT_MS}={}) {
    const request=freeze({sessionId:input?.sessionId,rootSessionId:input?.rootSessionId,cwd:input?.cwd})
    const batches=await Promise.all([...contributors].map(async([moduleId,callback])=>({moduleId,...await callOne('exposure-contributor',moduleId,callback,request,timeoutMs)})))
    const items=[],outcomes=[],reported=[]
    for(const batch of batches){
      reported.push(...batch.diagnostics)
      if(batch.status!=='ok'){outcomes.push({moduleId:batch.moduleId,status:batch.status});continue}
      if(batch.value===null){outcomes.push({moduleId:batch.moduleId,status:'not-applicable'});continue}
      const validation=validateExposureContribution(batch.value)
      if(!validation.ok){reported.push(diagnostic('exposure-contributor',batch.moduleId,'invalid-result',msg('diag.family.invalid-contribution',{detail:validation.errors.join('; ')})));outcomes.push({moduleId:batch.moduleId,status:'invalid'});continue}
      const value=batch.value
      items.push(freeze({module:batch.moduleId,moduleTitle:entries.get(batch.moduleId)?.title||batch.moduleId,tools:(value.tools||[]).map(tool=>({name:tool.name,description:tool.description.slice(0,EXPOSURE_TEXT_MAX_LENGTH)})),exclusive:value.exclusive===true,toggleable:value.toggleable===true,...(isMessageRef(value.reason)?{reason:stampRef(value.reason,producerNs(batch.moduleId))}:(typeof value.reason==='string'?{reason:bounded(value.reason)}:{})),...(locales(value.reasonLocales)?{reasonLocales:locales(value.reasonLocales)}:{})}))
      outcomes.push({moduleId:batch.moduleId,status:'ok'})
    }
    return freeze({items,outcomes,diagnostics:reported})
  }
  return freeze({
    contract:CONTRACT_VERSION,root:rootInfo,
    get catalog(){return typeof catalog==='function'?catalog():catalog},
    resolveRoot:async sessionId=>typeof resolveRoot==='function'?resolveRoot(sessionId):freeze({rootSessionId:String(sessionId||''),cwd:null,resolved:false,reason:msg('diag.family.root-resolver-unavailable')}),
    diagnostics,register,list,get:id=>entries.get(String(id||'')),
    registerAgentAnnotator:(id,callback)=>registerCallback(annotators,'agent-annotator',id,callback),
    registerExposureAnnotator:(id,callback)=>registerCallback(exposureAnnotators,'exposure-annotator',id,callback),
    registerExposureContributor:(id,callback)=>registerCallback(contributors,'exposure-contributor',id,callback),
    collectAgentAnnotations,collectExposureAnnotations,collectExposureContributions,
    annotateAgents:async(ids,options)=>(await collectAgentAnnotations(ids,options)).items,
    annotateExposure:async(input,options)=>(await collectExposureAnnotations(input,options)).items,
    contributeExposure:async(input,options)=>(await collectExposureContributions(input,options)).items,
    subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener)},
  })
}
export function familyPayload(registry) {
  if(!registry)return {ok:false,contract:CONTRACT_VERSION,root:null,modules:[],diagnostics:[]}
  return {ok:true,contract:CONTRACT_VERSION,root:registry.root,modules:registry.list().map(module=>({...module})),diagnostics:registry.diagnostics?.()||[]}
}
