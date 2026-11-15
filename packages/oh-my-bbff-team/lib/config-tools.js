// Root-only config tools. No tool mutation writes a file directly: stage then
// commit with an inspectable diff summary and durable shared UI/tool history.
import { defineTool } from '@deepseek-ai/dsh-tools'
import { classify } from './classify.js'
import { sessionHeaderFacts } from './dsh-adapter.js'

export function createConfigTools(ctx,{store}) {
  const get=(key)=>{try{return ctx.get(key)}catch{return undefined}}
  function root(exec){
    const agent=exec && exec.agent
    if(!agent)throw new Error('config tools require a calling root session')
    const classification=classify(agent,get)
    if(classification.parentId || !['lead','solo-root'].includes(classification.position))throw new Error('bbff_team_config_* tools are root-only; members/children must ask their lead')
    return agent
  }
  const result={schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]}
  const tool=(name,description,parameters,execute)=>defineTool({name,description,parameters,output:result,async execute(args,exec){return JSON.stringify(await execute(args,exec,root(exec)),null,2)}})
  return [
    tool('bbff_team_config_read','Read Team roles, settings, validation diagnostics and shared configuration history. Root sessions only. Mutation tools are reserved for a direct user request to change roles, prompts, models or settings.',{},(_args,_exec,agent)=>store.read({cwd:sessionHeaderFacts(agent.session?.header).value.cwd})),
    tool('bbff_team_config_stage','Stage a Team role/settings/formation change; never applies it. Use ONLY for an explicit user request. Supply the user words verbatim, inspect the diff, then commit or discard. Global files only; workspace overlays are read-only.',{
      change:{type:'object',additionalProperties:true,required:true,description:'One change: {op:"patch-role"|"replace-role",id,role:{fields...}}; {op:"remove-role"|"restore-role",id}; {op:"put-formation",formation:{id,label,seats:[{seat,function,role,model?,assist?}]}}; {op:"remove-formation",id}; or {op:"patch-settings",settings:{keys...}}. A new custom role needs all required role fields.'},
      reason:{type:'string',required:true,description:'Why this requested change is necessary.'},
      user_instruction:{type:'string',required:true,description:'Verbatim user words explicitly asking for this role/prompt/model/settings/formation change.'},
    },(args,exec,agent)=>store.stage(args.change,{reason:args.reason,userInstruction:args.user_instruction,source:'tool',sessionId:agent.id,cwd:sessionHeaderFacts(agent.session?.header).value.cwd,signal:exec.signal})),
    tool('bbff_team_config_commit','Apply an inspected Team config stage, snapshot old files and append the shared changelog. Root only; only for the direct user request recorded when staging. Stale stages must be restaged.',{id:{type:'string',required:true,description:'Exact staged id from bbff_team_config_stage.'}},(args)=>store.commit(args.id)),
    tool('bbff_team_config_discard','Discard an uncommitted Team configuration stage. Root sessions only.',{id:{type:'string',required:true,description:'Exact staged id to discard.'}},(args)=>store.discard(args.id)),
  ]
}
