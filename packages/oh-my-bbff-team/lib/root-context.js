// Shared family ancestry only. No local parent walker, discovery, resume or child-cwd fallback.
import { FAMILY_SERVICE } from './bbff-contract.js'
import { DEFAULT_TEAM_SETTINGS } from './team-settings.js'
export function createRootContext(get, { getLimit = () => DEFAULT_TEAM_SETTINGS.reportCacheEntries } = {}) {
  const cache=new WeakMap(),disposed=new WeakSet(),polls=new Map()
  const unresolved=(sessionId,reason)=>({resolution:{rootSessionId:String(sessionId),cwd:null,resolved:false,reason},source:'unresolved',asOf:null})
  function attached(sessionId) { try { const agent=get('agents')?.get?.(String(sessionId));return agent&&!disposed.has(agent)?agent:undefined } catch { return undefined } }
  const api = {
    poll(sessionId) {
      const id=String(sessionId||''),agent=attached(id),family=get(FAMILY_SERVICE),previous=agent&&cache.get(agent)
      if(family?.contract!==1 || typeof family.resolveRoot!=='function')return {...(previous?{resolution:previous.resolution,source:'cached',asOf:previous.asOf}:unresolved(id,'The shared root resolver is unavailable')),part:{status:previous?'stale':'unavailable',reason:'Shared resolver is unavailable; only an exact previous attached-Agent result may be reused',durationMs:0}}
      let frame=polls.get(id)
      if(frame?.agent!==agent || frame?.family!==family){frame={agent,family,value:null,flight:null,durationMs:0};polls.set(id,frame)}
      if(!frame.flight && !frame.value?.resolution.resolved){const start=performance.now();frame.flight=new Promise(resolve=>setImmediate(resolve)).then(()=>api.resolve(id)).then(value=>{if(polls.get(id)===frame){frame.value=value;frame.durationMs=performance.now()-start}}).finally(()=>{frame.flight=null;while(polls.size>getLimit()){const entry=[...polls].find(([,value])=>!value.flight);if(!entry)break;polls.delete(entry[0])}})}
      const value=frame.value||(previous?{resolution:previous.resolution,source:'cached',asOf:previous.asOf}:unresolved(id,'Shared root resolution is loading in the background'))
      return {...value,part:{pending:!!frame.flight,status:frame.flight?(frame.value||previous?'stale':'pending'):value.resolution.resolved?'ready':'unavailable',reason:frame.flight?'Shared root lookup is loading in one background flight':value.resolution.reason,durationMs:frame.durationMs}}
    },
    async resolve(sessionId) {
      const id=String(sessionId||''),agent=attached(id)
      let family
      try { family=get(FAMILY_SERVICE) } catch {}
      if(family?.contract!==1 || typeof family.resolveRoot!=='function') {
        const previous=agent && cache.get(agent)
        return previous?{resolution:previous.resolution,source:'cached',asOf:previous.asOf}:unresolved(id,'The shared family root resolver is unavailable; this agent has no successful cached resolution.')
      }
      try {
        const value=await family.resolveRoot(id)
        if(!value || typeof value.rootSessionId!=='string' || !value.rootSessionId || typeof value.resolved!=='boolean' || !(value.cwd===null||typeof value.cwd==='string') || typeof value.reason!=='string')throw new Error('Invalid shared root resolution')
        const resolution=Object.freeze({...value}),asOf=new Date().toISOString()
        if(agent&&!disposed.has(agent)) { if(resolution.resolved)cache.set(agent,{resolution,asOf});else cache.delete(agent) }
        const result={resolution,source:'live',asOf},frame=polls.get(id)
        if(frame?.agent===agent&&frame.family===family)frame.value=result
        return result
      } catch(error) {
        if(agent)cache.delete(agent)
        return unresolved(id,'Shared root resolution failed: '+String(error?.message||error))
      }
    },
    dispose(agent) { disposed.add(agent);cache.delete(agent);const frame=polls.get(String(agent.id));if(frame?.agent===agent)polls.delete(String(agent.id)) },
  }
  return api
}
