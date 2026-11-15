/** The ONE native catalog reader. Never assembles an Agent scope or starts an Agent. */
import path from 'node:path'
import {parseResourceSection,MCP_RESOURCE_SECTION_NAME,serversFromSections,sessionHeaderFacts,reservedTool} from './dsh-adapter.js'
import {readCatalogEvidence} from './catalog-evidence.js'
const get=(ctx,name)=>{try{return ctx.get(name)}catch{return undefined}}
const diagnostic=(code,reason,inference=code)=>({code,inference,severity:'warning',reason})
const normalize=value=>{if(typeof value!=='string'||!path.isAbsolute(value))return undefined;const normalized=path.normalize(value),root=path.parse(normalized).root;return normalized===root?root:normalized.replace(/[\\/]+$/,'')}
export function createNativeCatalogDiscovery(ctx,{scopeAPI,getModules=()=>[],readContributions,readEvidence=readCatalogEvidence}={}){
  const ids=new WeakMap(),lastCurrent=new Map();let sequence=0
  const identity=key=>{if(!ids.has(key))ids.set(key,'view:'+ ++sequence);return ids.get(key)}
  const discover=async function({projectPaths:requested=[],signal}={}){
    const presets=get(ctx,'agentPresets'),slices=[],views=new Map(),diagnostics=[],privateViews=new Map(),projectPaths=new Set(requested.map(normalize).filter(Boolean)),leases=[],borrowed=[]
    let authoritative=true,defaultViewId,agents=[],roster=[]
    const add=(key,view)=>{const old=views.get(key);if(old){for(const role of view.roles)old.roles.add(role);return old}const next={...view,roles:new Set(view.roles)};views.set(key,next);return next}
    const host=add(undefined,{viewId:'host',key:undefined,roles:['host'],service:name=>get(ctx,name)})
    try{
      try{const registry=get(ctx,'agents');if(!registry||typeof registry.list!=='function')throw new Error('Agents unavailable');agents=registry.list()}catch{authoritative=false;diagnostics.push(diagnostic('retained-composition-incomplete','Live composition enumeration is unavailable.','retained-composition'))}
      try{const registry=get(ctx,'workspaceRegistry');if(!registry||typeof registry.list!=='function')throw new Error('Workspaces unavailable');for(const workspace of registry.list()){const cwd=normalize(workspace.path);if(cwd)projectPaths.add(cwd)}}catch{diagnostics.push(diagnostic('workspace-paths-incomplete','Registered workspace paths are unavailable.','project-skills'))}
      for(const agent of agents){const facts=sessionHeaderFacts(agent?.session?.header);if(facts.value.cwd){const cwd=normalize(facts.value.cwd);if(cwd)projectPaths.add(cwd)}}
      if(!presets||typeof presets.acquireScope!=='function'||typeof presets.inspectCompositions!=='function'||typeof scopeAPI?.createScope!=='function'){
        authoritative=false;diagnostics.push(diagnostic('retained-composition-incomplete','Public preset/scope readers are unavailable.','retained-composition'))
      }else{
        try{roster=await presets.list()}catch{authoritative=false;diagnostics.push(diagnostic('preset-roster-incomplete','Current preset roster could not be read.','retained-composition'))}
        for(const preset of roster){
          try{
            const lease=await presets.acquireScope(preset.id);leases.push(lease)
            if(!lease?.key||typeof lease.key!=='object')throw new Error('Invalid lease')
            // A non-Agent child exists only to resolve services from the leased
            // isolated generation. All discovery reads use the PARENT key.
            const child=scopeAPI.createScope(ctx,{}, {parent:lease.key});borrowed.push(child)
            const inspection=presets.inspectCompositions(child.ctx)
            if(!inspection.some(row=>row.id===preset.id))throw new Error('Unconfirmed composition')
            const viewId=identity(lease.key)
            const view=add(lease.key,{viewId,key:lease.key,presetId:preset.id,roles:['current'],service:name=>presets.serviceFor({ctx:child.ctx},name)||get(ctx,name)})
            lastCurrent.set(preset.id,viewId)
            if(preset.id===presets.defaultId)defaultViewId=viewId
            if(preset.broken||inspection.some(row=>row.leakedServices?.length))diagnostics.push(diagnostic('preset-composition-incomplete','A current preset reports activation/isolation diagnostics.','retained-composition'))
            view.current=true
          }catch{
            authoritative=false
            const old=lastCurrent.get(preset.id)
            if(old)for(const part of ['tools','sections','skills'])slices.push({id:old+':'+part,viewId:old,presetId:preset.id,roles:['current'],part,complete:false,failed:true,facts:[],diagnostics:[diagnostic('preset-view-error','A current preset view could not be read.','retained-composition')]})
            diagnostics.push(diagnostic('preset-view-error','A current preset view could not be confirmed/read.','retained-composition'))
          }
        }
        // Current lease B cannot stand in for a surviving Agent's revision A.
        for(const agent of agents){
          try{
            const key=scopeAPI.scopeOf(agent.ctx),parent=key&&scopeAPI.scopeParentOf(key),inspection=presets.inspectCompositions(agent.ctx)
            if(!inspection.length){if(parent||sessionHeaderFacts(agent.session?.header).value.presetId)throw new Error('Unconfirmed retained composition');continue}
            if(!parent||inspection.length!==1||!inspection[0].id)throw new Error('Missing retained parent')
            add(parent,{viewId:identity(parent),key:parent,presetId:inspection[0].id,roles:['retained'],service:name=>presets.serviceFor(agent,name)||get(ctx,name)})
          }catch{authoritative=false;diagnostics.push(diagnostic('retained-composition-incomplete','A retained live composition has no confirmed mask-free preset-parent view.','retained-composition'))}
        }
      }
      if(!defaultViewId)diagnostics.push(diagnostic('default-preset-unavailable','The native current default preset could not be confirmed.','project-skills'))
      const sectionViews=[],allSchemas=[],nonNativeToolSchemas=[]
      for(const view of views.values()){
        const source=view.presetId?'preset:'+view.presetId:'host',base={viewId:view.viewId,presetId:view.presetId,roles:[...view.roles]}
        try{
          const tools=view.service('tools');if(!tools||typeof tools.schemas!=='function')throw new Error('Tools unavailable')
          const schemas=tools.schemas(view.key);if(!Array.isArray(schemas))throw new Error('Malformed schemas')
          view.tools=tools;view.schemas=schemas;allSchemas.push(...schemas)
          slices.push({...base,id:view.viewId+':tools',part:'tools',complete:true,diagnostics:[],facts:schemas.map(row=>({kind:'tool',name:row.name,description:row.description,sources:[source]}))})
        }catch{slices.push({...base,id:view.viewId+':tools',part:'tools',complete:false,failed:true,facts:[],diagnostics:[diagnostic('tool-view-error','A mask-free tool view could not be read.','tools')]})}
        try{
          const prompt=view.service('systemPrompt');if(!prompt||typeof prompt.assemble!=='function')throw new Error('Prompt unavailable')
          const assembly=await prompt.assemble({...view.key?{scope:view.key}:{},...(signal?{signal}:{})})
          if(!Array.isArray(assembly?.sections))throw new Error('Malformed sections')
          const projected=assembly.sections.map(row=>({name:row.name,text:row.text})),sectionView={view:view.viewId,complete:true,sections:projected},roster=serversFromSections([sectionView]),resources=projected.filter(row=>row.name===MCP_RESOURCE_SECTION_NAME).map(parseResourceSection)
          sectionViews.push(sectionView)
          nonNativeToolSchemas.push(...(Array.isArray(assembly.tools)?assembly.tools:[]))
          const errors=[...roster.diagnostics,...resources.flatMap(row=>row.diagnostics)],resourceServers=[...new Set(resources.flatMap(row=>row.value))]
          slices.push({...base,id:view.viewId+':sections',part:'sections',complete:!errors.length,diagnostics:errors,sections:projected.map(row=>row.name),resourceServers,facts:[...roster.value.map(name=>({kind:'mcp',name,sources:[source]})),...resourceServers.filter(name=>!roster.value.includes(name)).map(name=>({kind:'mcp',name,sources:[source,'resource-prompt']}))]})
        }catch{sectionViews.push({view:view.viewId,complete:false,sections:[]});slices.push({...base,id:view.viewId+':sections',part:'sections',complete:false,failed:true,facts:[],diagnostics:[diagnostic('section-view-error','A mask-free section view could not be read.','mcp-section-name')]})}
        try{
          const manager=view.service('mcpManager')
          if(manager?.list){const rows=manager.list();if(!Array.isArray(rows))throw new Error('Malformed manager list');slices.push({...base,id:view.viewId+':mcp-manager',part:'mcp',complete:true,diagnostics:[],facts:rows.filter(row=>typeof row.name==='string').map(row=>({kind:'mcp',name:row.name,sources:[source],present:row.configured===true,configured:row.configured===true,configurationAuthority:'manager',...(row.status?{connectionState:row.status.state}:{} )}))})}
        }catch{slices.push({...base,id:view.viewId+':mcp-manager',part:'mcp',complete:false,failed:true,facts:[],diagnostics:[diagnostic('mcp-manager-view-error','A native MCP manager list could not be read.','configured-mcp')]})}
        for(const cwd of [undefined,...projectPaths]){
          const id=view.viewId+':skills'+(cwd?':'+cwd:'')
          try{
            const skills=view.service('skills');if(!skills||typeof skills.snapshot!=='function')throw new Error('Skills unavailable')
            const observed=await skills.snapshot({...view.key?{scope:view.key}:{},...(cwd?{cwd}:{}),...(signal?{signal}:{})})
            if(!Array.isArray(observed?.skills))throw new Error('Malformed skills')
            const maskProviders=new Set(getModules().filter(row=>row.compatible!==false).flatMap(row=>row.skillMaskProviders||[]))
            const facts=observed.skills.filter(row=>!maskProviders.has(row.provider)).map(row=>({kind:'skill',name:row.name,description:row.description,skillSource:row.source,skillProvider:row.provider,sources:[source,...(cwd?['project:'+cwd]:[])],...(cwd?{projectPath:cwd}:{}),modelInvocable:row.invocation?.modelInvocable!==false,userInvocable:row.invocation?.userInvocable!==false}))
            slices.push({...base,id,part:'skills',...(cwd?{cwd}:{}),complete:observed.complete===true,diagnostics:observed.complete===true?[]:[diagnostic('project-skills-incomplete','A mask-free skill provider returned partial discovery.','project-skills')],facts})
          }catch{slices.push({...base,id,part:'skills',...(cwd?{cwd}:{}),complete:false,failed:true,facts:[],diagnostics:[diagnostic('project-skills-error','A mask-free skill view could not be read.','project-skills')]})}
        }
      }
      // Live definitions are read, not assembled. Identity comparison catches an
      // own-layer shadow even when its public NAME equals an inherited tool.
      for(const agent of agents){
        const facts=sessionHeaderFacts(agent.session?.header),key=scopeAPI?.scopeOf?.(agent.ctx)||agent,parent=scopeAPI?.scopeParentOf?.(key),parentView=views.get(parent)||host,id='local:'+identity(agent)
        try{
          if(parent&&!views.has(parent))throw new Error('Unconfirmed live parent')
          const tools=get(agent.ctx,'tools');if(!tools?.schemas||!tools?.get)throw new Error('Live tools unavailable')
          const schemas=tools.schemas(key),own=[]
          for(const schema of schemas){const definition=tools.get(schema.name,key),inherited=tools.get(schema.name,parent);if(definition&&definition!==inherited)own.push({kind:'tool',name:schema.name,description:schema.description,sources:['session-local'],sessionLocal:true})}
          slices.push({id,viewId:id,roles:['session'],part:'tools',complete:true,diagnostics:[],facts:own})
          privateViews.set(agent,{tools:schemas.map(row=>({name:row.name,description:row.description})),viewId:parentView.viewId,...(facts.value.cwd?{cwd:facts.value.cwd}:{})})
        }catch{slices.push({id,viewId:id,roles:['session'],part:'tools',complete:false,failed:true,facts:[],diagnostics:[diagnostic('live-tool-view-error','A live definition view could not be read.','tools')]})}
        if(readContributions){
          try{
            const contributions=await readContributions(agent)
            slices.push({id:id+':contributions',viewId:id,roles:['session'],part:'tools',complete:!contributions.diagnostics?.length,diagnostics:(contributions.diagnostics||[]).map(row=>diagnostic(row.code,row.reason,'family-contributions')),facts:(contributions.items||[]).flatMap(row=>(row.tools||[]).map(tool=>({kind:'tool',name:tool.name,description:tool.description,sources:['session-local','bbff:'+row.module],sessionLocal:true,moduleId:row.module})))})
          }catch{slices.push({id:id+':contributions',viewId:id,roles:['session'],part:'tools',complete:false,failed:true,facts:[],diagnostics:[diagnostic('contribution-error','Live session contributions could not be read.','family-contributions')]})}
        }
      }
      const evidence=readEvidence(ctx,getModules())
      slices.push({id:'configured',roles:[],part:'configured',complete:evidence.configured.complete,diagnostics:evidence.configured.diagnostics,facts:evidence.configured.value.map(row=>({kind:'mcp',name:row.name,sources:['configured'],present:false,configured:true,...(row.enabled!==undefined?{configuredEnabled:row.enabled}:{})}))})
      return {slices,authoritative,defaultViewId,projectPaths:[...projectPaths],privateViews,packageVersions:evidence.packageVersions,nativeResidueProven:evidence.nativeResidueProven,diagnostics:[...diagnostics,...evidence.diagnostics],adapterEvidence:{...evidence.adapterEvidence,toolSchemas:allSchemas,nonNativeToolSchemas,sectionViews,conventionEvidence:{'retained-composition':{complete:authoritative}}}}
    }finally{
      // Never dispose/rebind borrowed preset-parent keys or any real Agent.
      for(const child of borrowed.reverse())try{await child.dispose()}catch{}
      for(const lease of leases.reverse())try{await lease[Symbol.asyncDispose]()}catch{}
    }
  }
  // Private exposure reads only the exact current tool schema. It never assembles
  // an Agent prompt/skill view, writes observations or treats union as callable.
  discover.readLiveView=agent=>{
    try{
      const presets=get(ctx,'agentPresets'),key=scopeAPI?.scopeOf?.(agent.ctx)||agent,parent=scopeAPI?.scopeParentOf?.(key),inspection=presets?.inspectCompositions?.(agent.ctx)||[]
      const tools=get(agent.ctx,'tools')
      if(!tools?.schemas)throw new Error('Live tools unavailable')
      const schemas=tools.schemas(key)
      if(!Array.isArray(schemas))throw new Error('Malformed schemas')
      const complete=parent?inspection.length===1:!sessionHeaderFacts(agent.session?.header).value.presetId
      return {viewId:parent?identity(parent):'host',tools:schemas.map(row=>{const definition=tools.get?.(row.name,key),inherited=tools.get?.(row.name,parent);return {name:row.name,description:row.description,sessionLocal:!!definition&&definition!==inherited}}),complete,diagnostics:complete?[]:[diagnostic('retained-composition-incomplete','Current exposure has no confirmed retained parent.','retained-composition')]}
    }catch{return {tools:[],complete:false,diagnostics:[diagnostic('live-tool-view-error','Current session tool definitions are unavailable.','tools')]}}
  }
  return discover
}
