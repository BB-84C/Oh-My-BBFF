// Explicit normalized-roster plan/apply. Approval covers rules; snapshot numbers are advisory.
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { hasLegacyReportText } from './report-checkpoints.js'
export function createReportImport({file,reports,headerFor,getLimit,signal,logger}) {
  let status={status:'not-applicable',reason:'No normalized legacy roster import was supplied',imported:0,skipped:0,unknownTimes:0,errors:[],rows:[]}
  const flight=(async()=>{
    const completed=reports.completedLegacyImport?.()
    if(completed){status={...completed,status:completed.errors?.length?'partial':'ready',reason:'The one-time legacy migration marker is already loaded; no source, header or write IO repeated'};return}
    if(!file||!existsSync(file))return
    status={...status,status:'pending',reason:'Reading the supplied normalized roster migration plan'}
    try {
      const value=JSON.parse(readFileSync(file,'utf8'))
      if(value?.version!==1||value.source?.kind!=='normalized-team-roster'||value.source?.version!=='0.5.4'||!Array.isArray(value.members))throw new Error('Expected a version1 normalized Team0.5.4 roster import')
      const digest=createHash('sha256').update(JSON.stringify({version:value.version,source:value.source,members:value.members})).digest('hex'),previous=reports.importStatus(digest)
      if(previous){status={...previous,status:previous.errors?.length?'partial':'ready',reason:'This normalized roster import was already processed',digest};return}
      const source={version:value.source.version,capturedAt:value.source.capturedAt??null}
      if(source.capturedAt!==null&&!Number.isFinite(Date.parse(source.capturedAt)))throw new Error('Invalid roster capture time')
      const seen=new Set(),members=[],headers=new Map(),headerErrors=new Map()
      for(const member of value.members){
        signal?.throwIfAborted()
        if(!member||typeof member.id!=='string'||!member.id||seen.has(member.id))throw new Error('Invalid or duplicate member identity')
        seen.add(member.id);members.push(member)
        // Existing reports are authoritative and need no legacy identity lookup.
        if(reports.getById(member.id)||!hasLegacyReportText(member,getLimit()))continue
        try {const header=await headerFor(member.id,signal);signal?.throwIfAborted();headers.set(member.id,header)}catch(error){if(signal?.aborted)throw error;headerErrors.set(member.id,String(error?.message||error))}
      }
      function planNow(limit){
        const plan=[],result={wouldImport:0,imported:0,skipped:0,unknownTimes:0,errors:[],rows:[]}
        for(const member of members){
          const row={id:member.id,name:member.name||null,originalTime:member.reportAt??member.lastReportAt??null}
          if(reports.getById(member.id)){result.skipped++;result.rows.push({...row,decision:'preserve-existing'});continue}
          if(!hasLegacyReportText(member,limit)){result.skipped++;result.rows.push({...row,decision:'skip-empty-or-placeholder'});continue}
          try{
            if(headerErrors.has(member.id))throw new Error(headerErrors.get(member.id))
            const header=headers.get(member.id)
            if(member.identity&&!isDeepStrictEqual(member.identity,header))throw new Error('Supplied report identity no longer matches the session lifecycle')
            if(reports.importLegacy(header,member,source,limit,{dryRun:true})){plan.push({member,header});result.wouldImport++;if(row.originalTime===null)result.unknownTimes++;result.rows.push({...row,decision:'import',sourceTextChars:member.lastReport.length,sourceNonWhitespaceChars:member.lastReport.trim().length})}
            else {result.skipped++;result.rows.push({...row,decision:'preserve-existing'})}
          }catch(error){result.errors.push({id:member.id,reason:String(error?.message||error)})}
        }
        return {plan,result}
      }
      const initial=planNow(getLimit())
      signal?.throwIfAborted()
      if(value.apply!==true){status={...initial.result,status:'preview',reason:'Read-only migration preview; no backup, marker or report was written',digest};return}
      // Recompute synchronously immediately before the write sequence. No await follows this cut.
      const limit=getLimit(),{plan,result}=planNow(limit),approved=value.approvedSnapshot||value.expectedPlan||null,approvedIds=new Set(approved?.missingIds||approved?.addIds||initial.plan.map(row=>row.member.id))
      const comparison={approvedSnapshot:approved,actual:{wouldImport:result.wouldImport,preserveExisting:result.rows.filter(row=>row.decision==='preserve-existing').length,unknownTimes:result.unknownTimes},becamePreserved:result.rows.filter(row=>row.decision==='preserve-existing'&&approvedIds.has(row.id)).map(({id,name})=>({id,name})),countsDiffer:!!approved&&(approved.wouldImport!==result.wouldImport||approved.unknownTimes!==result.unknownTimes)}
      if(result.errors.length)throw new Error('Migration row or identity verification failed; no live report was written: '+JSON.stringify(result.errors))
      if(typeof logger?.info!=='function')throw new Error('Migration audit logger is unavailable; no live report was written')
      logger.info('Team report import: final plan before writing (approved rules; snapshot counts only warn): '+JSON.stringify({digest,added:result.rows.filter(row=>row.decision==='import').map(({id,name})=>({id,name})),preserved:result.rows.filter(row=>row.decision==='preserve-existing').map(({id,name})=>({id,name})),timeUnknown:result.rows.filter(row=>row.decision==='import'&&row.originalTime===null).map(({id,name})=>({id,name})),versusApprovedSnapshot:comparison}))
      const backup=reports.backupBeforeImport(digest,value.backupDirectory)
      signal?.throwIfAborted()
      const applied=reports.applyLegacyBatch(digest,plan,source,limit,{...result,comparison},backup)
      status={...applied,status:'ready',reason:'Final live missing-only report plan completed and atomically verified',digest}
      logger.info('Team report import: verification after writing: '+JSON.stringify({digest,added:applied.added,preservedBytesVerified:applied.preserved,backupSha256:backup.sha256,afterSha256:applied.afterSha256,atomicWrites:applied.atomicWrites,versusApprovedSnapshot:comparison}))
    } catch(error){status={...status,status:signal?.aborted?'cancelled':'unavailable',reason:String(error?.message||error)};try{logger?.error?.('Team report import failed (not retried automatically): '+status.reason)}catch{}}
  })()
  return {flight,diagnostics:()=>({...status,errors:status.errors.map(row=>({...row})),rows:(status.rows||[]).map(row=>({...row}))})}
}
