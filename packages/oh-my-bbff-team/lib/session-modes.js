// Per-root modes. Ancestry is resolved by the shared family service, never this store.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_TEAM_SETTINGS } from './team-settings.js'
export const SESSION_MODES = Object.freeze(['auto','orchestrator','leader','off'])
export const DEFAULT_SESSION_MODE = SESSION_MODES[0]
export function createSessionModes(path,{getLimit=()=>DEFAULT_TEAM_SETTINGS.sessionModeLimit,isProtected=()=>false}={}) {
  let loaded=false,loadError=null,modes={},retention={evicted:0,blocked:0,lastEvicted:[]}
  const limitOf=()=>{const value=getLimit();return Number.isSafeInteger(value)&&value>0?value:DEFAULT_TEAM_SETTINGS.sessionModeLimit}
  function load() {
    if(loaded)return
    loaded=true
    try {
      if(path && existsSync(path)) {
        const parsed=JSON.parse(readFileSync(path,'utf8'))
        if(!parsed?.modes || typeof parsed.modes!=='object' || Array.isArray(parsed.modes))throw new Error('Mode storage has no valid modes object')
        for(const [id,value]of Object.entries(parsed.modes))if(!value || typeof value!=='object' || !SESSION_MODES.includes(value.mode))throw new Error('Invalid stored mode: '+id)
        modes=parsed.modes
        if(parsed?.retention && typeof parsed.retention==='object')retention={...retention,...parsed.retention}
      }
    } catch(error) { modes={};loadError=String(error?.message||error);retention.lastError=loadError }
  }
  function assertReadable(){load();if(loadError)throw new Error('Session mode storage is unreadable; repair it before changes: '+loadError)}
  function persist(admitted) {
    assertReadable()
    const limit=limitOf(),ids=Object.keys(modes)
    if(ids.length>limit) {
      const candidates=ids.filter(id=>{if(id===admitted)return false;try{return !isProtected(id)}catch{return false}}).sort((a,b)=>(modes[a].at||0)-(modes[b].at||0))
      const removed=candidates.slice(0,ids.length-limit),lastEvicted=removed.map(id=>({rootId:id,mode:modes[id]?.mode}))
      for(const id of removed)delete modes[id]
      retention={...retention,limit,evicted:(Number(retention.evicted)||0)+removed.length,blocked:Math.max(0,Object.keys(modes).length-limit),lastEvicted:removed.length?lastEvicted:retention.lastEvicted,lastEvictedAt:removed.length?new Date().toISOString():retention.lastEvictedAt,at:new Date().toISOString()}
    } else retention.blocked=0
    if(!path)return
    try {
      mkdirSync(dirname(path),{recursive:true})
      const tmp=path+'.tmp'
      writeFileSync(tmp,JSON.stringify({version:1,modes,retention},null,2),'utf8');renameSync(tmp,path)
    } catch(error) { retention.lastError=String(error?.message||error) }
  }
  return {
    assertReadable,
    get(rootId) { load();if(loadError)return null;const mode=modes[String(rootId||'')]?.mode;return SESSION_MODES.includes(mode)?mode:DEFAULT_SESSION_MODE },
    set(rootId,mode) {
      load();if(!SESSION_MODES.includes(mode))throw new Error('mode must be one of '+SESSION_MODES.join(', '))
      const id=String(rootId||'');if(!id)throw new Error('session id required')
      if(mode===DEFAULT_SESSION_MODE)delete modes[id];else modes[id]={mode,at:Date.now()}
      persist(id);return mode
    },
    diagnostics() { load();return {...retention,failedLoad:!!loadError,complete:!loadError,loadError,limit:limitOf(),count:loadError?null:Object.keys(modes).length,overTarget:loadError?null:Math.max(0,Object.keys(modes).length-limitOf()),settingPath:'settings.sessionModeLimit'} },
  }
}
export function effectiveRootMode(mode,teamAvailable) {
  if(mode==='off')return 'off'
  if(mode==='orchestrator')return 'orchestrator'
  return teamAvailable?'leader':'orchestrator'
}
