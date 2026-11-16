// Session facts come from the canonical adapter; the Lead position comes from the native per-root
// Agent Teams selection (DSH >= 0.2.2: Team members are named subagents of the root).
import { sessionHeaderFacts, superagentIdentity, orchestratorServiceName } from './dsh-adapter.js'
export function orchestrationFacts(agent,get) {
  let service,serviceError
  try { service=get(orchestratorServiceName()) } catch(error) { serviceError=String(error?.message||error) }
  const header=agent?sessionHeaderFacts(agent.session?.header):{value:{},diagnostics:[]}
  const identity=superagentIdentity({sessionId:agent?.id,presetId:header.value.presetId,orchestrator:service})
  return {observedService:service!==undefined && service!==null,foreign:identity.value.foreign,basis:identity.value.basis,complete:identity.complete && !serviceError,
    diagnostics:[...header.diagnostics,...identity.diagnostics,...(serviceError?[{code:'orchestration-service',reason:serviceError}]:[])]}
}
/** Compatibility presence field: observes a public service, not installation/identity proof. */
export function superagentPresent(get) { return orchestrationFacts(undefined,get).observedService }
export function isForeign(agent,get) { return orchestrationFacts(agent,get).foreign }
export function depthOf(agent) {
  const facts=sessionHeaderFacts(agent?.session?.header).value
  return facts.depth ?? (facts.parentId || facts.isSubagent ? null : 0)
}
export function parentIdOf(agent) { return sessionHeaderFacts(agent?.session?.header).value.parentId || null }
/** Native Agent Teams selection of a root; null when the native service cannot answer. */
export function teamEnabled(root,get) {
  const teams=get('agentTeams')
  if(!teams || typeof teams.isEnabled!=='function')return {enabled:false,reason:'The native Agent Teams service is not loaded'}
  try { return {enabled:teams.isEnabled(root)===true,reason:'Native Agent Teams selection of this conversation'} }
  catch(error) { return {enabled:null,reason:String(error?.message||error)} }
}
/**
 * Positions: foreign (yielded), unknown (uncorroborated), lead (root with Agent Teams on),
 * solo-root (root with Agent Teams off), child (any descendant). The enforcer upgrades a child
 * with a durable member binding from its Lead to `member`.
 */
export function classify(agent,get,settings={}) {
  const header=sessionHeaderFacts(agent?.session?.header),parentId=header.value.parentId || null,depth=header.value.depth ?? (parentId || header.value.isSubagent ? null : 0)
  const orchestration=orchestrationFacts(agent,get)
  const facts={depth,parentId,orchestration,diagnostics:[...header.diagnostics,...orchestration.diagnostics]}
  if(orchestration.foreign || (settings.superagentYield==='all' && orchestration.observedService))return {...facts,position:'foreign',membership:undefined,reason:orchestration.foreign?orchestration.basis:'Team setting superagentYield=all yields to the observed orchestration service'}
  if(!header.complete || !orchestration.complete)return {...facts,position:'unknown',membership:undefined,reason:'Native session/orchestration identity is not corroborated; Team does not decorate an unclassified session'}
  if(parentId || header.value.isSubagent)return {...facts,position:'child',membership:undefined,reason:'Adapter-decoded parent relationship'}
  const mode=teamEnabled(agent,get)
  if(mode.enabled===null)return {...facts,position:'unknown',membership:undefined,reason:mode.reason}
  return {...facts,position:mode.enabled?'lead':'solo-root',membership:mode.enabled?{role:'lead',root:agent}:undefined,reason:mode.enabled?'Root conversation with native Agent Teams on':'Root conversation with native Agent Teams off: '+mode.reason}
}

// ---- Position guards (one wording for every Team refusal) ----
/** Positions that own a subagent tree: the Team Lead and an Orchestrator root (Agent Teams off). */
export const TREE_ROOT_POSITIONS=Object.freeze(['lead','solo-root'])
const diagnosticsText=cls=>(cls?.diagnostics||[]).slice(0,4).map(item=>[item?.code,item?.reason].filter(Boolean).join(': ')).filter(Boolean).join(' | ')||'none reported'
/** What the user or agent can do about a refused position. */
export function positionRemedy(cls) {
  const position=cls?.position||'unknown'
  if(position==='solo-root')return 'Turn on "Use Agent Teams" in this conversation (model menu) to act as the Team Lead.'
  if(position==='child')return 'Only a root conversation can do this; report to the agent that dispatched you instead.'
  if(position==='foreign')return 'Oh-My-BBFF Team yields this session to another orchestration plugin.'
  return 'The native session/orchestration identity of this conversation is not corroborated (diagnostics: '+diagnosticsText(cls)+').'
}
/**
 * The refusal for a caller whose position may not do `action`: the classified position, its reason
 * and the remedy. `allowed` names the positions that may (default: the Team Lead only).
 */
export function positionRefusal(cls,action,{allowed=['lead'],alternative=''}={}) {
  const who=allowed.includes('solo-root')?'a tree root (the Team Lead or an Orchestrator root conversation)':'the Team Lead'
  const position=cls?.position||'unknown'
  const error=new Error('only '+who+' may '+action+'. This conversation is classified "'+position+'": '+(cls?.reason||'no classification reason')+'. '+positionRemedy(cls)+(alternative?' '+alternative:''))
  error.code='bbff-team-position'
  error.position=position
  return error
}
/** Classify the caller and refuse unless its position is allowed; returns the classification. */
export function assertPosition(agent,get,settings,action,options={}) {
  if(!agent)throw new Error('a calling agent is required')
  const cls=classify(agent,get,settings)
  if(!(options.allowed||['lead']).includes(cls.position))throw positionRefusal(cls,action,options)
  return cls
}
