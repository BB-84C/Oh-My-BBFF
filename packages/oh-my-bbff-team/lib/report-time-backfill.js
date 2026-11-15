// One-time metadata correction for legacy-migrated report rows: recover the real event time
// from the member's own persisted session log, never invent one. Read-only on session logs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import zlib from 'node:zlib'
import { assistantMessageFacts, sessionEventFacts } from './dsh-adapter.js'
const MARKER='report-time-backfill-v1'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
function decode(file){
  const raw=readFileSync(file)
  if(file.endsWith('.zstd')){
    if(typeof zlib.zstdDecompressSync!=='function')throw new Error('This Node runtime cannot decompress zstd session logs')
    return zlib.zstdDecompressSync(raw).toString('utf8')
  }
  return raw.toString('utf8')
}
export function createReportTimeBackfill({reports,sessionRoot,logger,sessionRootFallback=null}) {
  let status={status:'not-applicable',reason:'No durable report checkpoint store is available',rows:[]}
  const findStore=(id)=>{
    const roots=[sessionRoot,sessionRootFallback].filter(root=>typeof root==='string'&&root)
    for(const root of roots){
      let dirs=[]
      try{dirs=readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name)}catch{continue}
      for(const dir of dirs){
        if(!dir||dir.includes('..'))continue
        for(const name of ['session.v4.jsonl.zstd','session.v4.jsonl']){
          const file=join(root,dir,id,name)
          if(existsSync(file))return file
        }
      }
    }
    return null
  }
  const matchEvent=(file,text)=>{
    let events
    try{events=decode(file).split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean)}
    catch(error){return {error:String(error?.message||error)}}
    const hits=new Map()
    for(const event of events){
      const message=assistantMessageFacts(event,{view:'event'})
      const candidate=message.value?.text
      if(!candidate||!candidate.startsWith(text))continue
      const envelope=sessionEventFacts(event).value
      if(!envelope||!Number.isSafeInteger(envelope.time))continue
      const key=String(envelope.seq)
      if(!hits.has(key))hits.set(key,{seq:envelope.seq,time:envelope.time,originalTextChars:candidate.length})
    }
    const matches=[...hits.values()]
    if(matches.length===1&&Number.isFinite(matches[0].time))return {match:matches[0],events:events.length}
    return {matches,events:events.length}
  }
  const remainingNull=()=>{try{return reports.allRows().filter(({row})=>row&&row.timestamp===null&&typeof row.report?.text==='string'&&row.report.text.trim()).map(({id})=>id)}catch{return []}}
  const flight=(async()=>{
    if(!reports||typeof reports.allRows!=='function')return
    const existing=reports.fix(MARKER)
    if(existing){status={status:'ready',reason:'The one-time report time backfill marker is already stored; no session log was read',marker:MARKER,rows:existing.updated||[],skipped:existing.skipped||[],backup:existing.backup||null,noop:true,remainingNullTimes:remainingNull().length,remainingNullIds:remainingNull()};return}
    const candidates=reports.allRows().filter(({row})=>row&&row.timestamp===null&&typeof row.report?.text==='string'&&row.report.text.trim())
    if(!candidates.length){status={status:'ready',reason:'No persisted report record is missing a time',marker:MARKER,rows:[],skipped:[],remainingNullTimes:0};return}
    status={status:'pending',reason:'Recovering real report times from member session events',marker:MARKER,rows:[]}
    try{
      const updates=[],reportRows=[],issues=[]
      for(const {id,row} of candidates){
        const text=row.report.text
        if(!UUID.test(id)){issues.push({id,reason:'not a native session identity'});reportRows.push({id,decision:'skipped',reason:'not a native session identity'});continue}
        const file=findStore(id)
        if(!file){issues.push({id,reason:'no persisted session store was found for this member'});reportRows.push({id,decision:'skipped',reason:'no persisted session store'});continue}
        const matched=matchEvent(file,text)
        if(matched.match){
          updates.push({id,timestamp:new Date(matched.match.time).toISOString(),source:{timeSource:'member-session-event',eventSeq:matched.match.seq,eventTime:new Date(matched.match.time).toISOString(),sessionFile:file,matchedChars:text.length,originalTextChars:matched.match.originalTextChars,backfilledAt:new Date().toISOString()},report:{truncated:matched.match.originalTextChars>text.length,totalChars:matched.match.originalTextChars}})
          reportRows.push({id,decision:'event-time',seq:matched.match.seq,time:new Date(matched.match.time).toISOString(),originalTextChars:matched.match.originalTextChars,sessionFile:file})
          continue
        }
        const captured=row.source?.capturedAt
        if(typeof captured==='string'&&ISO.test(captured)&&Number.isFinite(Date.parse(captured))){
          const why=matched.error?('session log unreadable: '+matched.error):`no unique assistant event matched (${matched.matches?.length??0} candidate events in ${matched.events??0})`
          updates.push({id,timestamp:captured,source:{timeSource:'capture-time',timeSourceReason:why,backfilledAt:new Date().toISOString()}})
          reportRows.push({id,decision:'capture-time',time:captured,reason:why,sessionFile:file})
          continue
        }
        issues.push({id,reason:'no unique assistant event and no credible capture time'})
        reportRows.push({id,decision:'skipped',reason:'no unique event and no credible capture time',sessionFile:file})
      }
      if(!updates.length){status={status:'ready',reason:'No report row could be corrected with a real time',marker:MARKER,rows:reportRows,skipped:issues,backup:null,remainingNullTimes:remainingNull().length,remainingNullIds:remainingNull()};if(issues.length)logger?.error?.('Team report time backfill incomplete: '+JSON.stringify(issues));return}
      if(typeof logger?.info==='function')logger.info('Team report time backfill plan: '+JSON.stringify({marker:MARKER,corrections:updates.map(update=>({id:update.id,timestamp:update.timestamp,timeSource:update.source.timeSource,eventSeq:update.source.eventSeq??null})),unresolved:issues}))
      const result=reports.applyTimeBackfill(MARKER,updates)
      status={status:'ready',reason:'Real report times were restored from member session events (or the documented capture time)',marker:MARKER,rows:reportRows,skipped:issues,backup:result.backup||null,beforeSha256:result.beforeSha256||null,afterSha256:result.afterSha256||null,atomicWrites:result.atomicWrites??0,recordBytesPreserved:result.recordBytesPreserved===true,noop:result.noop===true,remainingNullTimes:remainingNull().length,remainingNullIds:remainingNull()}
      logger?.info?.('Team report time backfill done: '+JSON.stringify({marker:MARKER,updated:result.updated,skipped:result.skipped,backupSha256:result.backup?.sha256??null,afterSha256:result.afterSha256??null}))
    }catch(error){status={status:'unavailable',reason:String(error?.message||error),marker:MARKER,rows:status.rows,skipped:status.skipped};logger?.error?.('Team report time backfill failed (not retried automatically): '+status.reason)}
  })()
  return {flight,diagnostics:()=>({...status,rows:(status.rows||[]).map(row=>({...row})),skipped:(status.skipped||[]).map(row=>({...row}))})}
}
