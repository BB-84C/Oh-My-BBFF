/** One ancestry resolver for every BBFF consumer. Reads only; never resumes an Agent. */
import {ROOT_RESOLVE_MAX_DEPTH} from './bbff-contract.js'
import {sessionHeaderFacts} from './dsh-adapter.js'
export const MAX_PARENT_DEPTH=ROOT_RESOLVE_MAX_DEPTH
export function createRootResolver({getSessionQuery,getPersistence,getAgents}={}){
  const valid=id=>typeof id==='string'&&id.length>0
  const matches=(header,id)=>header&&sessionHeaderFacts(header).value.sessionId===id
  async function headerOf(id){
    if(!valid(id))return null
    try{const header=getAgents?.()?.get?.(id)?.session?.header;if(matches(header,id))return header}catch{}
    try{const header=(await getPersistence?.()?.stat?.(id))?.header;if(matches(header,id))return header}catch{}
    try{const header=(await getSessionQuery?.()?.readSession?.(id))?.session;if(matches(header,id))return header}catch{}
    return null
  }
  async function resolve(sessionId,hint={}){
    const own=valid(sessionId)?sessionId:null,chain=own?[own]:[]
    const ownHeader=own?(matches(hint?.header,own)?hint.header:await headerOf(own)):null
    const failure=reason=>({sessionId:own,rootSessionId:own,header:ownHeader,cwd:null,resolved:false,reason,chain})
    if(!own)return failure('Invalid session identity.')
    let current=own,header=ownHeader,depth=0
    while(true){
      if(!header)return failure('Session ancestry header unavailable.')
      const decoded=sessionHeaderFacts(header)
      if(!decoded.complete||decoded.value.sessionId!==current)return failure('Session ancestry header malformed.')
      const parent=decoded.value.parentId
      if(!parent)return {sessionId:own,rootSessionId:current,header:ownHeader,cwd:decoded.value.cwd||null,resolved:true,reason:decoded.value.cwd?'Resolved root session.':'Resolved root session; root workspace unknown.',chain}
      if(depth>=ROOT_RESOLVE_MAX_DEPTH)return failure('Session ancestry exceeds the contract depth bound.')
      if(chain.includes(parent))return failure('Session ancestry cycle detected.')
      chain.push(parent);current=parent;depth++;header=await headerOf(parent)
    }
  }
  async function resolveRoot(sessionId){
    const {rootSessionId,cwd,resolved,reason}=await resolve(sessionId)
    return Object.freeze({rootSessionId:rootSessionId??String(sessionId||''),cwd,resolved,reason})
  }
  return Object.freeze({resolve,resolveRoot,headerOf})
}
