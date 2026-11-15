// Bounded excerpts, never native logs. Member reports survive unload/restart without replay.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, copyFileSync, constants } from 'node:fs'
import { msg } from './bbff-contract.js'
import { createHash } from 'node:crypto'
import { dirname, basename, join, isAbsolute, parse, resolve } from 'node:path'
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
// UI placeholder (message ref into locale/<lang>.json) and the English text agents see.
export const REPORT_PLACEHOLDER=Object.freeze({ui:msg('report.placeholder'),model:'No report yet'})
// Older Team versions wrote the placeholder TEXT into report data, in a shipped language. Every shipped
// locale file's report.placeholder is therefore a legacy placeholder, never a real report.
const LEGACY_PLACEHOLDER_TEXTS=Object.freeze((()=>{const dir=new URL('../locale/',import.meta.url),texts=new Set([REPORT_PLACEHOLDER.model]);try{for(const name of readdirSync(dir))if(name.endsWith('.json')){try{const text=JSON.parse(readFileSync(new URL(name,dir),'utf8'))?.ui?.['report.placeholder'];if(typeof text==='string'&&text.trim())texts.add(text.trim())}catch{}}}catch{}return [...texts]})())
export function hasLegacyReportText(member,limit=Infinity){const raw=typeof member?.lastReport==='string'?member.lastReport:'',text=raw.trim();return !!text&&!!raw.slice(0,limit).trim()&&member.reportStatus!=='none'&&text!==String(member.reportPlaceholder||'').trim()&&!LEGACY_PLACEHOLDER_TEXTS.some(value=>value.toLowerCase()===text.toLowerCase())}
export function createReportCheckpoints(file) {
  let loaded=false,error=null,rows={},imports={},fixes={}
  const runtimeIdentity=new Map()
  function load(){if(loaded)return;loaded=true;try{if(file&&existsSync(file)){const value=JSON.parse(readFileSync(file,'utf8'));if(!value||value.version!==1||!value.reports||typeof value.reports!=='object'||Array.isArray(value.reports))throw new Error('Invalid report checkpoint document');rows=value.reports;imports=value.imports&&typeof value.imports==='object'&&!Array.isArray(value.imports)?value.imports:{};fixes=value.fixes&&typeof value.fixes==='object'&&!Array.isArray(value.fixes)?value.fixes:{}}}catch(reason){error=String(reason?.message||reason)}}
  const document=()=>JSON.stringify({version:1,reports:rows,...(Object.keys(imports).length?{imports}:{}),...(Object.keys(fixes).length?{fixes}:{})},null,2)
  function persist(){if(!file||error)return;try{mkdirSync(dirname(file),{recursive:true});const temporary=file+'.tmp';writeFileSync(temporary,document(),'utf8');renameSync(temporary,file)}catch(reason){error=String(reason?.message||reason)}}
  function recordNeedle(id,row){return Buffer.from(JSON.stringify(id)+': '+JSON.stringify(row,null,2).replace(/\n/g,'\n    '),'utf8')}
  return {
    record(header,seq,text,limit){load();const report={text:text.slice(0,limit),totalChars:text.length,truncated:text.length>limit,limit};const value={identity:JSON.parse(JSON.stringify(header)),revision:null,seq,report,timestamp:new Date().toISOString()};rows[String(header.id)]=value;runtimeIdentity.delete(String(header.id));persist();return value},
    importLegacy(header,member,source,limit,{dryRun=false,deferPersist=false}={}){
      load();if(error)throw new Error(error)
      const id=String(header?.id||'')
      if(!id||id!==String(member?.id)||!Number.isFinite(header?.createdAt))throw new Error('Legacy report identity is unavailable or mismatched')
      if(rows[id]||!hasLegacyReportText(member,limit))return false
      const captured=source?.capturedAt?Date.parse(source.capturedAt):null
      if(captured!==null&&(!Number.isFinite(captured)||header.createdAt>captured))throw new Error('Legacy report predates the current session lifecycle')
      const supplied=member.reportAt??member.lastReportAt??null
      if(supplied!==null&&(typeof supplied!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(supplied)))throw new Error('Legacy report timestamp is invalid')
      const reported=supplied===null?null:Date.parse(supplied)
      if(reported!==null&&(!Number.isFinite(reported)||reported<header.createdAt||(captured!==null&&reported>captured)))throw new Error('Legacy report timestamp is invalid')
      if(dryRun)return true
      const value={identity:JSON.parse(JSON.stringify(header)),revision:null,seq:null,report:{text:member.lastReport.slice(0,limit),totalChars:member.lastReport.length,truncated:member.lastReport.length>limit,limit},timestamp:reported===null?null:new Date(reported).toISOString(),source:{kind:'legacy-roster',version:source.version,capturedAt:source.capturedAt??null,importedAt:new Date().toISOString()}}
      rows[id]=value;runtimeIdentity.delete(id);if(!deferPersist)persist();if(error)throw new Error(error);return true
    },
    backupBeforeImport(digest,directory){
      load();if(error)throw new Error(error)
      if(!file||!/^[a-f0-9]{64}$/.test(digest)||typeof directory!=='string'||!isAbsolute(directory)||resolve(directory)===parse(resolve(directory)).root)throw new Error('An explicit non-root artifacts backup directory, durable checkpoint path and exact digest are required')
      const backup=join(directory,basename(file)+'.before-import.'+digest+'.bak'),manifest=backup+'.json'
      if(existsSync(manifest)){const saved=JSON.parse(readFileSync(manifest,'utf8'));if(saved.existed&&(!existsSync(backup)||hash(readFileSync(backup))!==saved.sha256))throw new Error('Legacy report backup failed verification');return saved}
      mkdirSync(directory,{recursive:true})
      const existed=existsSync(file),bytes=existed?readFileSync(file):null
      if(existed){if(!existsSync(backup))copyFileSync(file,backup,constants.COPYFILE_EXCL);if(hash(readFileSync(backup))!==hash(bytes))throw new Error('Legacy report backup does not match the pre-import checkpoint')}
      const saved={existed,path:existed?backup:null,manifest,original:file,sha256:existed?hash(bytes):null,at:new Date().toISOString()}
      writeFileSync(manifest,JSON.stringify(saved,null,2)+'\n',{encoding:'utf8',flag:'wx'});return saved
    },
    applyLegacyBatch(digest,plan,source,limit,result,backup){
      load();if(error)throw new Error(error);if(imports[digest])return imports[digest]
      const before=file&&existsSync(file)?readFileSync(file):null,beforeRows=rows,beforeImports=imports,preserved=[]
      if((before?hash(before):null)!==backup.sha256)throw new Error('Checkpoint changed after backup; no migration applied')
      // The writer's canonical format makes each unchanged record's exact raw byte range stable.
      if(before&&!before.equals(Buffer.from(JSON.stringify(JSON.parse(before.toString('utf8')),null,2))))throw new Error('Noncanonical checkpoint formatting needs review before a byte-preserving migration')
      for(const [id,row] of Object.entries(beforeRows)){const needle=recordNeedle(id,row);if(!before?.includes(needle))throw new Error('Cannot verify the original report record bytes');preserved.push({id,sha256:hash(needle)})}
      rows={...beforeRows};imports={...beforeImports};let committed=false
      try{
        let imported=0;const added=[]
        for(const {header,member} of plan)if(this.importLegacy(header,member,source,limit,{deferPersist:true})){imported++;added.push(member.id)}
        if(imported!==result.wouldImport)throw new Error('Migration addition count changed before commit; no report write was performed')
        const complete={...result,imported,skipped:result.skipped+plan.length-imported,kind:'legacy-roster-import',sourceVersion:'0.5.4',backup,preserved,added,at:new Date().toISOString()}
        imports[digest]=complete
        const proposed=Buffer.from(document())
        for(const [id,row] of Object.entries(beforeRows))if(!same(row,rows[id])||!proposed.includes(recordNeedle(id,row)))throw new Error('Existing report record changed before commit')
        persist();if(error)throw new Error(error);committed=true
        const after=readFileSync(file);if(!after.equals(proposed))throw new Error('Atomic migration readback differs from the proposed bytes')
        for(const [id,row] of Object.entries(beforeRows))if(!after.includes(recordNeedle(id,row)))throw new Error('Existing report record byte readback failed')
        return {...complete,beforeSha256:before?hash(before):null,afterSha256:hash(after),atomicWrites:1,recordBytesPreserved:true}
      }catch(reason){rows=beforeRows;imports=beforeImports;if(committed)error=String(reason?.message||reason);throw reason}
    },
    completedLegacyImport(){load();const found=Object.entries(imports).find(([,row])=>row.kind==='legacy-roster-import'&&row.sourceVersion==='0.5.4');return found?{...found[1],digest:found[0]}:null},
    allRows(){load();return Object.entries(rows).map(([id,row])=>({id,row}))},
    fix(marker){load();return fixes[String(marker)]?{...fixes[String(marker)]}:null},
    // One-time metadata correction: only the listed records may change, every other record's
    // raw bytes are verified before and after a single atomic replacement that also stores the marker.
    applyTimeBackfill(marker,updates,directory){
      load();if(error)throw new Error(error)
      if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(String(marker)))throw new Error('A durable fix marker id is required')
      if(fixes[String(marker)])return {...fixes[String(marker)]}
      if(!file||!existsSync(file))throw new Error('No durable report checkpoint exists for a time backfill')
      if(!Array.isArray(updates)||!updates.length)throw new Error('At least one metadata correction is required')
      const before=readFileSync(file),beforeRows=rows,beforeFixes=fixes,beforeHash=hash(before)
      if(!before.equals(Buffer.from(JSON.stringify(JSON.parse(before.toString('utf8')),null,2))))throw new Error('Noncanonical checkpoint formatting needs review before a byte-preserving fix')
      const preserved=[]
      for(const [id,row] of Object.entries(beforeRows)){const needle=recordNeedle(id,row);if(!before.includes(needle))throw new Error('Cannot verify the original report record bytes');preserved.push({id,sha256:hash(needle)})}
      const backupFile=file+'.before-fix.'+marker+'.'+beforeHash.slice(0,16)+'.bak',manifest=backupFile+'.json'
      if(!existsSync(backupFile))copyFileSync(file,backupFile,constants.COPYFILE_EXCL)
      if(hash(readFileSync(backupFile))!==beforeHash)throw new Error('Time-fix backup does not match the pre-fix checkpoint')
      if(!existsSync(manifest))writeFileSync(manifest,JSON.stringify({path:backupFile,original:file,sha256:beforeHash,marker,at:new Date().toISOString()},null,2)+'\n',{encoding:'utf8',flag:'wx'})
      const backup={path:backupFile,manifestPath:manifest,sha256:beforeHash}
      rows={...beforeRows};fixes={...beforeFixes};let committed=false
      try{
        const updated=[],skipped=[]
        for(const update of updates){
          const id=String(update.id||''),row=rows[id]
          if(!row||row.timestamp!==null||!row.report?.text?.trim()){skipped.push({id,reason:row?'already has a time or empty report':'unknown record'});continue}
          const timestamp=String(update.timestamp||'')
          if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)||!Number.isFinite(Date.parse(timestamp)))throw new Error('Backfilled time is not an exact ISO timestamp')
          const next={...row,timestamp,source:{...(row.source||{}),...(update.source||{})},report:{...row.report,...(update.report||{})}}
          rows[id]=next;updated.push({id,timestamp,timeSource:next.source.timeSource||null,eventSeq:next.source.eventSeq??null})
        }
        if(!updated.length){rows=beforeRows;fixes=beforeFixes;return {marker,updated,skipped,noop:true,reason:'No record still needed a time',preserved}}
        const record={marker,kind:'report-time-backfill',updated,skipped,backup,beforeSha256:beforeHash,at:new Date().toISOString()}
        fixes[String(marker)]=record
        const proposed=Buffer.from(document())
        for(const [id,row] of Object.entries(beforeRows)){if(updated.some(entry=>entry.id===id))continue;if(!same(row,rows[id])||!proposed.includes(recordNeedle(id,row)))throw new Error('An untouched report record changed during the time fix')}
        persist();if(error)throw new Error(error);committed=true
        const after=readFileSync(file);if(!after.equals(proposed))throw new Error('Atomic time-fix readback differs from the proposed bytes')
        for(const [id,row] of Object.entries(beforeRows)){if(updated.some(entry=>entry.id===id))continue;if(!after.includes(recordNeedle(id,row)))throw new Error('Untouched report record byte readback failed')}
        for(const {id} of updated)if(!after.includes(recordNeedle(id,rows[id])))throw new Error('Backfilled report record byte readback failed')
        return {...record,afterSha256:hash(after),atomicWrites:1,recordBytesPreserved:true,preserved}
      }catch(reason){rows=beforeRows;fixes=beforeFixes;if(committed)error=String(reason?.message||reason);throw reason}
    },
    importStatus(digest){load();return imports[digest]||null},
    completeImport(digest,result){load();if(error)throw new Error(error);if(imports[digest])return;imports[digest]={...result,at:new Date().toISOString()};persist();if(error)throw new Error(error)},
    revision(id,seq,revision,identity){load();const row=rows[String(id)];if(!row||row.seq!==seq)return;row.revision=revision;runtimeIdentity.set(String(id),identity);persist()},
    get(header){load();const row=rows[String(header?.id||'')];return row&&same(row.identity,header)?row:null},
    getById(id){load();return rows[String(id)]||null},
    current(row,revision,identity){return !!row&&runtimeIdentity.get(String(row.identity.id))===identity&&row.revision!==null&&row.revision===revision},
    diagnostics(){load();return {status:error?'unavailable':'ready',reason:error||'Persisted per-member excerpts; native logs are never replayed',count:Object.keys(rows).length}},
  }
}
