/** Root-owned metadata ledger. Async scoped lock + atomic delta union, never host-thread waits. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {
  CATALOG_ROWS_MAX,CATALOG_BYTES_MAX,CATALOG_SOURCES_PER_ROW_MAX,CATALOG_PROJECT_PATHS_PER_SKILL_MAX,
  CATALOG_IMPORT_RECORDS_MAX,CATALOG_WRITE_DEBOUNCE_MS,CATALOG_RECONCILE_MS,EXPOSURE_TEXT_MAX_LENGTH,
} from './bbff-contract.js'
const kinds=new Set(['tool','mcp','skill'])
const fields=new Set(['kind','name','description','sources','latestSource','firstSeenAt','lastSeenAt','sessionLocal','projectPaths','sourcesTruncated'])
const key=row=>row.kind+'\0'+row.name
const clone=value=>JSON.parse(JSON.stringify(value))
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
const unique=values=>[...new Set(values)].sort()
const diagnostic=(code,reason,extra={})=>({code,inference:'ledger',severity:'warning',reason,...extra})
const source=value=>{
  if(typeof value!=='string'||!value)return false
  if(['host','session-local','configured','resource-prompt'].includes(value))return true
  const index=value.indexOf(':')
  return index>0&&['preset','bbff','mcp','project'].includes(value.slice(0,index))&&index<value.length-1
}
function timestamp(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid observation timestamp');return new Date(value).toISOString()}
function normalize(raw,{maxSources,maxPaths}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(name=>!fields.has(name)))throw new Error('Observation contains unsupported fields')
  if(!kinds.has(raw.kind)||typeof raw.name!=='string'||!raw.name.trim()||raw.name!==raw.name.trim()||raw.name.length>256||typeof raw.description!=='string')throw new Error('Invalid observation identity/description')
  if(!Array.isArray(raw.sources)||Array.from(raw.sources).some(item=>!source(item)))throw new Error('Invalid observation sources')
  if(raw.latestSource!==undefined&&!source(raw.latestSource))throw new Error('Invalid latest observation source')
  if(raw.sessionLocal!==undefined&&typeof raw.sessionLocal!=='boolean')throw new Error('Invalid own-layer fact')
  if(raw.projectPaths!==undefined&&(raw.kind!=='skill'||!Array.isArray(raw.projectPaths)||Array.from(raw.projectPaths).some(item=>typeof item!=='string'||!item.trim())))throw new Error('Invalid project path metadata')
  const firstSeenAt=timestamp(raw.firstSeenAt),lastSeenAt=timestamp(raw.lastSeenAt)
  if(firstSeenAt>lastSeenAt)throw new Error('Observation timestamps are reversed')
  const sources=unique(raw.sources),projectPaths=unique(raw.projectPaths||[])
  return {kind:raw.kind,name:raw.name,description:raw.description.slice(0,EXPOSURE_TEXT_MAX_LENGTH),sources:sources.slice(0,maxSources),...(raw.latestSource?{latestSource:raw.latestSource}:{}),firstSeenAt,lastSeenAt,...(raw.sessionLocal!==undefined?{sessionLocal:raw.sessionLocal}:{}),...(raw.kind==='skill'?{projectPaths:projectPaths.slice(0,maxPaths)}:{}),sourcesTruncated:raw.sourcesTruncated===true||sources.length>maxSources||projectPaths.length>maxPaths}
}
const empty=()=>({version:1,entries:[],tombstones:[],persistentDiagnostics:[]})
const sortedRows=rows=>[...rows].sort((a,b)=>key(a).localeCompare(key(b)))
function merge(document,records,tombstoneWrites,limits,{live=false}={}){
  const entries=new Map(document.entries.map(row=>[key(row),clone(row)])),tombstones=new Map(document.tombstones.map(row=>[key(row),clone(row)]))
  for(const row of tombstoneWrites){const id=key(row),old=tombstones.get(id);if(!old||row.forgottenAt>old.forgottenAt)tombstones.set(id,{...row});entries.delete(id)}
  let changed=0,fenced=0
  for(const row of records){
    const id=key(row),tombstone=tombstones.get(id)
    if(tombstone&&row.lastSeenAt<=tombstone.forgottenAt){fenced++;continue}
    if(tombstone)tombstones.delete(id)
    const old=entries.get(id)
    if(!old){entries.set(id,clone(row));changed++;continue}
    const sources=unique([...old.sources,...row.sources]),paths=unique([...(old.projectPaths||[]),...(row.projectPaths||[])])
    const newest=row.lastSeenAt>old.lastSeenAt||(live&&row.lastSeenAt===old.lastSeenAt)
    const next={...old,firstSeenAt:old.firstSeenAt<row.firstSeenAt?old.firstSeenAt:row.firstSeenAt,lastSeenAt:old.lastSeenAt>row.lastSeenAt?old.lastSeenAt:row.lastSeenAt,sources:sources.slice(0,limits.maxSources),sourcesTruncated:old.sourcesTruncated||row.sourcesTruncated||sources.length>limits.maxSources||paths.length>limits.maxPaths,...(old.kind==='skill'?{projectPaths:paths.slice(0,limits.maxPaths)}:{}),...(old.sessionLocal||row.sessionLocal?{sessionLocal:true}:{})}
    if(newest){if(row.description)next.description=row.description;if(row.latestSource)next.latestSource=row.latestSource}
    if(JSON.stringify(next)!==JSON.stringify(old))changed++
    entries.set(id,next)
  }
  return {document:{version:1,entries:sortedRows(entries.values()),tombstones:sortedRows(tombstones.values()),persistentDiagnostics:document.persistentDiagnostics.slice()},changed,fenced}
}
export function createCatalogLedger({dir,now=()=>new Date().toISOString(),onChange=()=>{},maxRows=CATALOG_ROWS_MAX,maxBytes=CATALOG_BYTES_MAX,maxSources=CATALOG_SOURCES_PER_ROW_MAX,maxPaths=CATALOG_PROJECT_PATHS_PER_SKILL_MAX,writeDebounceMs=CATALOG_WRITE_DEBOUNCE_MS,reconcileMs=CATALOG_RECONCILE_MS,lockWaitMs=150}={}){
  if(typeof dir!=='string'||!path.isAbsolute(dir))throw new Error('Ledger directory must be absolute')
  if(process.platform==='win32'&&/^\/(?!\/)/.test(dir))throw new Error('Refusing POSIX path on Windows')
  dir=path.resolve(dir)
  if(dir===path.parse(dir).root||path.dirname(dir)===path.parse(dir).root)throw new Error('Refusing shallow/drive-root ledger directory')
  const file=path.join(dir,'catalog.json'),lock=file+'.lock',limits={maxRows,maxBytes,maxSources,maxPaths}
  let document=empty(),snapshotCache,initialized=false,initializing,disposed=false,closing=false,debounce,retry,reconcileTimer,flushing,queue=Promise.resolve(),signature=null,pendingSince=null,retryDelay=25,revision=0
  const pending=new Map(),diagnostics=new Map(),fingerprints=new Map()
  const counts={observations:0,unchanged:0,accepted:0,writes:0}
  const fingerprint=row=>JSON.stringify([row.kind,row.name,row.description,row.sources,row.latestSource||'',row.sessionLocal===true,row.projectPaths||[],row.sourcesTruncated===true])
  const index=doc=>{fingerprints.clear();for(const row of doc.entries)fingerprints.set(key(row),fingerprint(row))}
  const serialize=doc=>JSON.stringify(doc,null,2)+'\n'
  const full=doc=>doc.entries.length+doc.tombstones.length>maxRows||Buffer.byteLength(serialize(doc),'utf8')>maxBytes
  function signal(){snapshotCache=null;revision++;try{onChange()}catch{}}
  function report(code,reason,extra){diagnostics.set(code,diagnostic(code,reason,extra));signal()}
  function pendingDiagnostic(){
    const before=diagnostics.has('pending-durability')
    if(!pending.size){pendingSince=null;diagnostics.delete('pending-durability');return before!==diagnostics.has('pending-durability')}
    pendingSince||=now()
    diagnostics.set('pending-durability',diagnostic('pending-durability','Catalog rows are pending durability; the normal one-second loss bound does not apply.',{pendingRows:pending.size,pendingSince,transient:true}))
    return !before
  }
  function snapshot(){
    if(snapshotCache)return snapshotCache
    const view=merge(document,[...pending.values()],[],limits,{live:true}).document
    const rows=[...document.persistentDiagnostics,...diagnostics.values()]
    if(view.entries.some(row=>row.sourcesTruncated))rows.push(diagnostic('sources-truncated','Some catalog source or project-path metadata exceeds the64-item cap.'))
    snapshotCache=freeze({entries:view.entries,tombstones:view.tombstones,diagnostics:rows,initialized,revision})
    return snapshotCache
  }
  async function persist(next,{beforeCommit}={}){
    if(full(next))throw Object.assign(new Error('Catalog capacity reached'),{code:'LEDGER_FULL'})
    await fs.mkdir(dir,{recursive:true})
    const temporary=file+'.'+randomUUID()+'.tmp'
    try{await fs.writeFile(temporary,serialize(next),{encoding:'utf8',flag:'wx'});const blocked=beforeCommit?.();if(blocked)throw Object.assign(new Error('Catalog mutation is no longer admissible'),{code:blocked});await fs.rename(temporary,file)}
    catch(error){try{await fs.unlink(temporary)}catch{};throw error}
    const stat=await fs.stat(file);signature=stat.mtimeMs+':'+stat.size;counts.writes++
  }
  async function recoverCorrupt(underLock){
    if(underLock)return quarantine()
    const token=await acquire()
    if(!token)throw Object.assign(new Error('Busy corruption recovery'),{code:'BUSY'})
    // Re-read under the lock. A concurrent writer may already have replaced the
    // bytes observed by the original failed read; never quarantine newer data.
    try{return await readDocument({underLock:true})}finally{await release(token)}
  }
  async function readDocument({underLock=false}={}){
    let stat,bytes
    try{stat=await fs.stat(file);if(stat.size>maxBytes)throw Object.assign(new Error('Oversize ledger'),{code:'CORRUPT'});bytes=await fs.readFile(file)}
    catch(error){if(error.code==='ENOENT')return empty();if(error.code!=='CORRUPT')throw error;return recoverCorrupt(underLock)}
    try{
      if(bytes.length>maxBytes)throw new Error('Oversize ledger')
      const raw=JSON.parse(bytes.toString('utf8'))
      if(!raw||raw.version!==1||!Array.isArray(raw.entries)||!Array.isArray(raw.tombstones)||!Array.isArray(raw.persistentDiagnostics)||Object.keys(raw).some(name=>!['version','entries','tombstones','persistentDiagnostics'].includes(name)))throw new Error('Invalid ledger envelope')
      const entries=raw.entries.map(row=>normalize(row,limits)),ids=new Set(entries.map(key))
      if(ids.size!==entries.length)throw new Error('Duplicate observations')
      const tombstones=raw.tombstones.map(row=>{if(!row||!kinds.has(row.kind)||typeof row.name!=='string'||!row.name||Object.keys(row).some(name=>!['kind','name','forgottenAt'].includes(name)))throw new Error('Invalid tombstone');return {kind:row.kind,name:row.name,forgottenAt:timestamp(row.forgottenAt)}})
      if(new Set(tombstones.map(key)).size!==tombstones.length||tombstones.some(row=>ids.has(key(row))))throw new Error('Duplicate/fenced observations')
      const persistentDiagnostics=raw.persistentDiagnostics.filter(row=>row&&row.code==='ledger-corrupt'&&typeof row.reason==='string').map(row=>diagnostic('ledger-corrupt',row.reason))
      const next={version:1,entries:sortedRows(entries),tombstones:sortedRows(tombstones),persistentDiagnostics}
      if(full(next))throw new Error('Ledger capacity exceeded')
      signature=stat.mtimeMs+':'+stat.size
      return next
    }catch{return recoverCorrupt(underLock)}
  }
  async function quarantine(){
    const target=file+'.corrupt-'+new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()
    try{await fs.rename(file,target)}catch(error){if(error.code==='ENOENT')return readDocument({underLock:true});throw error}
    const next=empty();next.persistentDiagnostics.push(diagnostic('ledger-corrupt','Catalog ledger was corrupt and quarantined at '+target))
    await persist(next)
    return next
  }
  function alive(pid){if(!Number.isInteger(pid)||pid<=0)return true;try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}}
  async function acquire(){
    await fs.mkdir(dir,{recursive:true})
    const token=randomUUID(),started=Date.now()
    while(true){
      if(disposed)return null
      try{
        const handle=await fs.open(lock,'wx')
        try{await handle.writeFile(JSON.stringify({pid:process.pid,token,createdAt:now()}),'utf8')}finally{await handle.close()}
        diagnostics.delete('ledger-lock-busy')
        return token
      }catch(error){
        if(error.code!=='EEXIST')throw error
        let owner,stat
        try{stat=await fs.stat(lock);owner=JSON.parse(await fs.readFile(lock,'utf8'))}catch{}
        if(owner&&typeof owner.token==='string'&&Number.isInteger(owner.pid)&&!alive(owner.pid)){
          try{
            const again=JSON.parse(await fs.readFile(lock,'utf8')),current=await fs.stat(lock)
            if(again.token===owner.token&&again.pid===owner.pid&&current.mtimeMs===stat.mtimeMs&&current.size===stat.size&&!alive(owner.pid)){await fs.unlink(lock);continue}
          }catch{}
        }
        diagnostics.set('ledger-lock-busy',diagnostic('ledger-lock-busy','Catalog lock is busy (including possible PID reuse); file '+lock+'; PID '+(owner?.pid??'unknown')+'. It is never broken by age.'))
        if(Date.now()-started>=lockWaitMs)return null
        await new Promise(resolve=>setTimeout(resolve,Math.min(15,Math.max(1,lockWaitMs-(Date.now()-started)))))
      }
    }
  }
  async function release(token){
    try{const owner=JSON.parse(await fs.readFile(lock,'utf8'));if(owner.token===token&&owner.pid===process.pid)await fs.unlink(lock)}catch{}
  }
  async function locked(operation){const token=await acquire();if(!token){pendingDiagnostic();signal();return {ok:false,code:'busy'}}try{return await operation()}finally{await release(token)}}
  const exclusive=operation=>{const value=queue.then(operation);queue=value.catch(()=>{});return value}
  async function initialize(){
    if(disposed)return snapshot()
    if(initialized)return snapshot()
    if(initializing)return initializing
    initializing=(async()=>{try{document=await readDocument();index(document);initialized=true;diagnostics.delete('ledger-storage-error');diagnostics.delete('ledger-pending')}catch{report('ledger-storage-error','Catalog ledger could not be read; existing facts were preserved.')}finally{initializing=null;signal()}if(!reconcileTimer&&reconcileMs>0&&!disposed){reconcileTimer=setInterval(()=>{void reconcile()},reconcileMs);reconcileTimer.unref?.()}return snapshot()})()
    return initializing
  }
  function schedule(){
    if(disposed||closing||debounce)return
    debounce=setTimeout(()=>{debounce=null;void flush()},writeDebounceMs);debounce.unref?.()
  }
  function scheduleRetry(){
    if(disposed||closing||retry)return
    retry=setTimeout(()=>{retry=null;void flush()},retryDelay);retry.unref?.();retryDelay=Math.min(1000,retryDelay*2)
  }
  function observe(records){
    if(disposed)return {accepted:0,rejected:Array.isArray(records)?records.length:0,unchanged:0,disposed:true}
    if(!initialized){const rejected=Array.isArray(records)?records.length:0;report('ledger-pending','Observation storage is not initialized; no capacity admission or durability was claimed. Retry after successful bootstrap.');return {accepted:0,rejected}}
    diagnostics.delete('ledger-pending')
    let accepted=0,rejected=0,unchanged=0
    for(const raw of Array.isArray(records)?records:[]){
      let row
      try{row=normalize(raw,limits)}catch{rejected++;report('invalid-observation','A catalog observation was invalid and was not stored.');continue}
      counts.observations++
      const id=key(row),nextFingerprint=fingerprint(row),prior=pending.get(id)
      // Cheap no-op: an identical observation (same content fields) neither clones
      // nor schedules a write; timestamps alone do not force durability work.
      if(prior?fingerprint(prior)===nextFingerprint:fingerprints.get(id)===nextFingerprint){unchanged++;continue}
      if(prior)row=merge(empty(),[prior,row],[],limits,{live:true}).document.entries[0]
      const proposal=new Map(pending);proposal.set(id,row)
      const next=merge(document,[...proposal.values()],[],limits,{live:true}).document
      if(full(next)){rejected++;report('ledger-full','Catalog is full; new names are refused and no existing name is evicted.');continue}
      pending.set(id,row);fingerprints.set(id,fingerprint(row));accepted++;counts.accepted++
    }
    if(!accepted){counts.unchanged+=unchanged;return {accepted:0,rejected,unchanged}}
    pendingSince||=now()
    signal();schedule()
    return {accepted,rejected,unchanged}
  }
  async function flush(){
    if(disposed&&!closing)return {ok:true,changed:false,disposed:true}
    if(flushing)return flushing
    if(debounce){clearTimeout(debounce);debounce=null}
    flushing=exclusive(async()=>{
      await initialize()
      if(!pending.size){if(pendingDiagnostic())signal();return {ok:true,changed:false}}
      const batch=new Map(pending)
      try{
        const response=await locked(async()=>{
          const latest=await readDocument({underLock:true}),merged=merge(latest,[...batch.values()],[],limits,{live:true})
          if(full(merged.document)){report('ledger-full','Catalog capacity changed before union commit; deltas remain pending without eviction.');return {ok:false,code:'ledger-full'}}
          // Cheap change test first: only clone/serialize/atomic-write when the
          // merged document actually differs from what is on disk.
          if(merged.changed>0)await persist(merged.document)
          document=merged.document;index(document);initialized=true;diagnostics.delete('ledger-pending')
          for(const [id,row]of batch)if(pending.get(id)===row)pending.delete(id)
          return {ok:true,changed:merged.changed>0}
        })
        if(!response.ok){pendingDiagnostic();scheduleRetry();signal()}else{retryDelay=25;if(retry){clearTimeout(retry);retry=null}diagnostics.delete('ledger-storage-error');const diagChanged=pendingDiagnostic();if(response.changed||diagChanged)signal()}
        return response
      }catch{pendingDiagnostic();report('ledger-storage-error','Catalog write failed; rows remain pending durability.');scheduleRetry();return {ok:false,code:'storage-error'}}
    }).finally(()=>{flushing=null})
    return flushing
  }
  async function importObservations(records,{isCurrent=()=>true}={}){
    if(disposed)return {ok:false,code:'disposed'}
    let rows
    try{if(!Array.isArray(records)||records.length>CATALOG_IMPORT_RECORDS_MAX||records.some(row=>row&&Object.hasOwn(row,'sourcesTruncated')))throw new Error('Import bound/fields');rows=records.map(row=>normalize(row,limits));if(new Set(rows.map(key)).size!==rows.length)throw new Error('Duplicate import keys')}
    catch{return {ok:false,code:'invalid-records'}}
    return exclusive(async()=>{
      await initialize()
      try{return await locked(async()=>{
        const batch=new Map(pending),latest=await readDocument({underLock:true}),buffered=merge(latest,[...batch.values()],[],limits,{live:true}).document,merged=merge(buffered,rows,[],limits)
        if(full(merged.document))return {ok:false,code:'ledger-full'}
        const before=new Set(buffered.entries.map(key))
        if(!isCurrent())return {ok:false,code:'invalid-module'}
        if(serialize(merged.document)!==serialize(latest))await persist(merged.document,{beforeCommit:()=>isCurrent()?undefined:'INVALID_MODULE'})
        document=merged.document;index(document);initialized=true;diagnostics.delete('ledger-pending');for(const [id,row]of batch)if(pending.get(id)===row)pending.delete(id);pendingDiagnostic();signal()
        const imported=rows.filter(row=>!before.has(key(row))&&document.entries.some(item=>key(item)===key(row))).length
        return {ok:true,imported,merged:Math.max(0,merged.changed-imported),unchanged:rows.length-merged.changed,revision:String(revision)}
      })}catch(error){if(error.code==='INVALID_MODULE')return {ok:false,code:'invalid-module'};report('ledger-storage-error','Catalog import failed without durable acknowledgment.');return {ok:false,code:'storage-error'}}
    })
  }
  async function forget(kind,name,{canForget=()=>undefined}={}){
    if(disposed)return {ok:false,code:'disposed'}
    if(!kinds.has(kind)||typeof name!=='string'||!name)return {ok:false,code:'unsupported-kind'}
    return exclusive(async()=>{
      await initialize()
      try{return await locked(async()=>{
        const latest=await readDocument({underLock:true}),batch=new Map(pending),buffered=merge(latest,[...batch.values()],[],limits,{live:true}).document,id=kind+'\0'+name
        if(!buffered.entries.some(row=>key(row)===id))return {ok:true,changed:false,revision:String(revision)}
        const forgottenAt=timestamp(now()),merged=merge(buffered,[],[{kind,name,forgottenAt}],limits)
        if(full(merged.document))return {ok:false,code:'ledger-full'}
        const blocked=canForget();if(blocked)return {ok:false,code:blocked}
        await persist(merged.document,{beforeCommit:()=>canForget()});document=merged.document;index(document);initialized=true;diagnostics.delete('ledger-pending')
        for(const [id,row]of batch)if(pending.get(id)===row)pending.delete(id)
        for(const [id,row]of pending)if(id===kind+'\0'+name&&row.lastSeenAt<=forgottenAt)pending.delete(id)
        pendingDiagnostic();signal();return {ok:true,changed:true,revision:String(revision)}
      })}catch(error){if(['present','declared','exclusive','reserved','incomplete','unsupported-kind'].includes(error.code))return {ok:false,code:error.code};report('ledger-storage-error','Catalog forget failed without durable acknowledgment.');return {ok:false,code:'storage-error'}}
    })
  }
  async function reconcile(){
    if(disposed)return snapshot()
    return exclusive(async()=>{await initialize();try{const stat=await fs.stat(file),current=stat.mtimeMs+':'+stat.size;if(current!==signature){document=await readDocument();index(document);signal()}}catch(error){if(error.code!=='ENOENT')report('ledger-storage-error','Catalog reconciliation failed; last-success metadata retained.')}return snapshot()})
  }
  async function dispose(){
    if(disposed)return
    closing=true
    for(const timer of [debounce,retry])if(timer)clearTimeout(timer)
    debounce=null;retry=null;if(reconcileTimer)clearInterval(reconcileTimer);reconcileTimer=null
    // Let an in-flight union commit finish, persist any buffered rows once, then
    // mark the generation disposed so nothing (timer or queued job) can write again.
    if(flushing)await flushing
    if(pending.size)try{await flush()}catch{}
    await queue.catch(()=>{})
    disposed=true
  }
  return Object.freeze({file,initialize,snapshot,observe,flush,importObservations,forget,reconcile,dispose,counts})
}
