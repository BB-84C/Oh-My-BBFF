// Single writer for Team roles/settings/formations. Dreaming-style durable stage -> commit:
// validate + preflight, optimistic concurrency, immutable before snapshots, atomic
// file replacement, shared provenance log. Workspace overlays are always read-only.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { buildCatalog, SEED_ROLES, RETIRED_ROLE_IDS, catalogPaths, readOverlayFile, migrateRoleText } from './catalog.js'
import { DEFAULT_TEAM_SETTINGS, normalizeTeamSettings, readDshMemberCap, validateTeamSettingsPatch } from './team-settings.js'
import { DEFAULT_DOCTRINE_TEMPLATES } from './doctrine-templates.js'
import { routeOptions } from './models.js'
import { MEMBER_NAME_RE as MEMBER_NAME } from './member-names.js'

const FILES = ['roles.json', 'settings.json', 'formations.json']
const ID = /^[0-9a-f-]{36}$/
const ROLE_FIELDS = new Set(['id','title','kind','leaderBrief','identityPrompt','readOnly','models','concurrency','tools','skills','mcp','delegation','reuse','route','fallback','substitution','purpose','prompt'])
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const clone = (value) => JSON.parse(JSON.stringify(value))
const encode = (value) => JSON.stringify(value, null, 2) + '\n'
const digest = (raw) => raw === null ? null : createHash('sha256').update(raw).digest('hex')
const requireText = (value, key) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`); return value.trim() }
const optionalText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null

// Formations are a STRUCTURAL contract only. A seat names a catalog role and may
// pin a model tier, but an unknown role/provider/model is a stale-reference
// diagnostic owned by the runtime — it is never a reason to refuse a write here.
const FORMATION_FIELDS = new Set(['id','label','description','seats'])
const SEAT_FIELDS = new Set(['seat','function','role','model','assist'])
const FORMATION_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const FORMATION_LABEL_MAX = 120
const FORMATION_DESCRIPTION_MAX = 2000
const emptyFormations = () => ({version:1,formations:[]})

function modelErrors(value, where) {
  return optionalText(value) ? [] : [`${where}: must be a non-empty role tier label`]
}

function seatErrors(seat, where, seats) {
  if (!object(seat)) return [`${where}: must be an object`]
  const errors = []
  for (const key of Object.keys(seat)) if (!SEAT_FIELDS.has(key)) errors.push(`${where}.${key}: unknown key (${[...SEAT_FIELDS].join('|')})`)
  if (typeof seat.seat !== 'string' || !MEMBER_NAME.test(seat.seat)) errors.push(`${where}.seat: must be a lower-kebab member name (the native subagent start validates the final name)`)
  else if (seats.has(seat.seat)) errors.push(`${where}.seat: duplicate seat ${seat.seat}`)
  else seats.add(seat.seat)
  if (!optionalText(seat.function)) errors.push(`${where}.function: required non-empty string`)
  if (!optionalText(seat.role)) errors.push(`${where}.role: required non-empty string`)
  if (seat.model !== undefined && seat.model !== null) errors.push(...modelErrors(seat.model, `${where}.model`))
  if (seat.assist !== undefined && (typeof seat.assist !== 'string' || !MEMBER_NAME.test(seat.assist))) errors.push(`${where}.assist: must be a main seat name`)
  return errors
}

/** Structural diagnostics for a formations document (empty array = valid). */
export function validateFormations(doc) {
  if (!object(doc)) return ['formations.json: must contain an object']
  const errors = []
  if (doc.version !== undefined && doc.version !== 1) errors.push('formations.json: version must be 1')
  if (!Array.isArray(doc.formations)) return errors.concat('formations.json: formations must be an array')
  const ids = new Set()
  doc.formations.forEach((formation, index) => {
    const where = `formations[${index}]`
    if (!object(formation)) { errors.push(`${where}: must be an object`); return }
    for (const key of Object.keys(formation)) if (!FORMATION_FIELDS.has(key)) errors.push(`${where}.${key}: unknown key (${[...FORMATION_FIELDS].join('|')})`)
    const id = optionalText(formation.id)
    if (!id || !FORMATION_ID.test(id)) errors.push(`${where}.id: must match ${FORMATION_ID}`)
    else if (ids.has(id)) errors.push(`${where}.id: duplicate formation id ${JSON.stringify(id)}`)
    else ids.add(id)
    const label = optionalText(formation.label)
    if (!label) errors.push(`${where}.label: required non-empty string`)
    else if (label.length > FORMATION_LABEL_MAX) errors.push(`${where}.label: must be at most ${FORMATION_LABEL_MAX} characters`)
    if (formation.description !== undefined) {
      const description = optionalText(formation.description)
      if (!description) errors.push(`${where}.description: must be a non-empty string`)
      else if (description.length > FORMATION_DESCRIPTION_MAX) errors.push(`${where}.description: must be at most ${FORMATION_DESCRIPTION_MAX} characters`)
    }
    if (!Array.isArray(formation.seats)) errors.push(`${where}.seats: must be an array`)
    else {
      const seats = new Set()
      formation.seats.forEach((seat, seatIndex) => errors.push(...seatErrors(seat, `${where}.seats[${seatIndex}]`, seats)))
    }
  })
  return errors
}

function normalizeSeat(seat) {
  const value = {seat:seat.seat,function:optionalText(seat.function),role:optionalText(seat.role)}
  if (seat.model !== undefined && seat.model !== null) {
    value.model = optionalText(seat.model)
  }
  if (seat.assist !== undefined) value.assist = optionalText(seat.assist)
  return value
}

function normalizeFormation(formation) {
  const value = {id:optionalText(formation.id),label:optionalText(formation.label)}
  const description = optionalText(formation.description)
  if (description) value.description = description
  value.seats = formation.seats.map(normalizeSeat)
  return value
}

/** Canonical {version:1,formations:[...]} document; throws on invalid structure. */
export function normalizeFormations(doc) {
  const errors = validateFormations(doc)
  if (errors.length) throw new Error(errors.join('; '))
  return {version:1,formations:doc.formations.map(normalizeFormation)}
}

function formationOf(value, where) {
  if (!object(value)) throw new Error(`${where} must be an object`)
  return normalizeFormations({version:1,formations:[value]}).formations[0]
}

export function validateSettingsPatch(patch) {
  return validateTeamSettingsPatch(patch)
}

export function createConfigStore(ctx, { home, seeds = SEED_ROLES, onCommit = () => {} } = {}) {
  const dir = join(home,'oh-my-bbff-team')
  const historyDir = join(dir,'.history')
  const stageDir = join(dir,'.staged')
  const changelog = join(dir,'changelog.jsonl')
  const get = (key) => { try { return ctx.get(key) } catch { return undefined } }
  let queue = Promise.resolve()
  let historyWarnings = []
  const capOf = (text) => { try { return JSON.parse(text)?.memberCap ?? null } catch { return null } }
  const diffValue = (text) => { if(text===null)return {};try{return JSON.parse(text)}catch{return {_invalidJson:true}} }
  const serial = (fn) => { const result = queue.then(fn); queue = result.catch(() => {}); return result }

  function raw(file) { const path = join(dir,file); return existsSync(path) ? readFileSync(path,'utf8') : null }
  function document(file, text = raw(file)) {
    if (text === null) return file === 'roles.json' ? {version:3,roles:[],remove:[]} : file === 'formations.json' ? emptyFormations() : {...DEFAULT_TEAM_SETTINGS}
    const value = JSON.parse(text)
    if (!object(value)) throw new Error(`${file} must contain an object`)
    if (file === 'formations.json') return normalizeFormations(value)
    return value
  }
  function atomic(path,text) {
    const temporary = path + '.' + randomUUID() + '.tmp'
    writeFileSync(temporary,text,'utf8')
    try { renameSync(temporary,path) } catch(error) { try { unlinkSync(temporary) } catch {} ; throw error }
  }
  function metaOf(meta = {}) {
    const source = meta.source || 'tool'
    if (!['tool','settings-ui'].includes(source)) throw new Error('source must be settings-ui|tool')
    if(source==='tool')requireText(meta.userInstruction,'userInstruction')
    return { source, reason:requireText(meta.reason,'reason'), userInstruction:typeof meta.userInstruction==='string'?meta.userInstruction:'', sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : '' }
  }
  function rolePatch(role) {
    if (!object(role)) throw new Error('role must be an object')
    for (const key of Object.keys(role)) if (!ROLE_FIELDS.has(key)) throw new Error(`unknown role field: ${key}`)
    // Schema v3: legacy purpose/prompt are accepted from older clients and stored
    // as leaderBrief.summary / identityPrompt. The upgrade happens in memory only.
    return migrateRoleText(clone(role), [], 'config-write')
  }
  function normalizeRoles(file) {
    if (!Array.isArray(file.roles) || !Array.isArray(file.remove || [])) throw new Error('roles.json requires roles/remove arrays')
    return {...file,version:3,roles:file.roles.slice(),remove:(file.remove||[]).slice()}
  }
  function applyChange(candidate, change) {
    if (!object(change)) throw new Error('change must be an object')
    const op = change.op
    if (op === 'patch-settings') {
      const patch = change.settings || change.patch
      validateSettingsPatch(patch)
      const current = normalizeTeamSettings(candidate['settings.json'])
      candidate['settings.json'] = { ...current, ...patch, ...(patch.doctrineTemplates ? { doctrineTemplates: { ...current.doctrineTemplates, ...patch.doctrineTemplates } } : {}) }
      validateSettingsPatch(candidate['settings.json'])
      return 'settings.json'
    }
    if (op === 'reset-doctrine-template') {
      if (typeof change.key !== 'string' || !Object.hasOwn(DEFAULT_DOCTRINE_TEMPLATES, change.key)) throw new Error('unknown doctrine template: ' + String(change.key))
      const current = normalizeTeamSettings(candidate['settings.json'])
      const overrides = { ...current.doctrineTemplates }
      delete overrides[change.key]
      candidate['settings.json'] = { ...current, doctrineTemplates: overrides }
      return 'settings.json'
    }
    if (op === 'replace-file') {
      // Internal/public whole-global-file edits still cannot choose arbitrary paths.
      if (!FILES.includes(change.file)) throw new Error('file must be roles.json|settings.json|formations.json (workspace writes are forbidden)')
      if (change.value !== null && !object(change.value)) throw new Error('file value must be an object or null')
      if (change.file === 'settings.json' && change.value !== null) validateSettingsPatch(change.value)
      if (change.file === 'formations.json' && change.value !== null) normalizeFormations(change.value)
      candidate[change.file] = clone(change.value)
      return change.file
    }
    if (op === 'put-formation' || op === 'remove-formation') {
      const file = normalizeFormations(candidate['formations.json'] || emptyFormations())
      if (op === 'put-formation') {
        // Whole upsert by id: the stored formation is replaced, never merged.
        const formation = formationOf(change.formation,'formation')
        const index = file.formations.findIndex(item=>item.id===formation.id)
        if (index >= 0) file.formations[index] = formation
        else file.formations.push(formation)
      } else {
        const id = requireText(change.id,'formation id')
        const index = file.formations.findIndex(item=>item.id===id)
        if (index < 0) throw new Error(`unknown formation "${id}"`)
        file.formations.splice(index,1)
      }
      candidate['formations.json'] = normalizeFormations(file)
      return 'formations.json'
    }
    const file = normalizeRoles(candidate['roles.json'] || {version:3,roles:[],remove:[]})
    const id = requireText(change.id || change.role?.id,'role id')
    if (RETIRED_ROLE_IDS.includes(id)) throw new Error(`role "${id}" was retired in 0.8.0 and cannot be edited, removed or restored; it no longer exists in the shipped roster`)
    const index = file.roles.findIndex(role=>role && role.id===id)
    if(['remove-role','restore-role','reset-role-models'].includes(op) && index<0 && !seeds.some(role=>role.id===id) && !file.hiddenRoles?.[id])throw new Error(`unknown role "${id}"`)
    if (op === 'patch-role' || op === 'replace-role') {
      const patch = rolePatch(change.role || change.patch)
      if (patch.id && patch.id !== id) throw new Error('role id cannot change')
      let next
      if (op === 'replace-role') {
        // Fill missing seed fields explicitly so a replacement is not a shallow
        // patch over an older global custom definition.
        const base = seeds.find(role=>role.id===id) || {}
        next = {...base,...patch,id}
      } else next = {...(index>=0?file.roles[index]:{}),...patch,id}
      if(Object.hasOwn(patch,'models'))for(const key of ['route','fallback','substitution'])delete next[key]
      if (index>=0) file.roles[index]=next; else file.roles.push(next)
      file.remove=file.remove.filter(value=>value!==id)
      if(file.hiddenRoles?.[id]){file.hiddenRoles={...file.hiddenRoles};delete file.hiddenRoles[id]}
    } else if (op === 'reset-role') {
      if (!seeds.some(role => role.id === id)) throw new Error(`role "${id}" has no shipped role default; edit or remove the custom role explicitly`)
      if (index >= 0) file.roles.splice(index, 1)
      file.remove = file.remove.filter(value => value !== id)
      if (file.hiddenRoles?.[id]) { file.hiddenRoles = { ...file.hiddenRoles }; delete file.hiddenRoles[id] }
    } else if (op === 'reset-role-models') {
      if (index>=0) {
        const next={...file.roles[index]}
        for(const key of ['models','route','fallback','substitution']) delete next[key]
        if(seeds.some(role=>role.id===id) && Object.keys(next).every(key=>key==='id')) file.roles.splice(index,1)
        else file.roles[index]=next
      }
    } else if (op === 'remove-role') {
      if(index>=0){ file.hiddenRoles={...(file.hiddenRoles||{}),[id]:file.roles[index]};file.roles.splice(index,1) }
      if(!file.remove.includes(id))file.remove.push(id)
    } else if (op === 'restore-role') {
      file.remove=file.remove.filter(value=>value!==id)
      if(file.hiddenRoles && file.hiddenRoles[id]) {
        file.roles.push(file.hiddenRoles[id]);file.hiddenRoles={...file.hiddenRoles};delete file.hiddenRoles[id]
      }
    } else throw new Error(`unknown config operation: ${String(op)}`)
    candidate['roles.json']=file
    return 'roles.json'
  }

  async function validate(candidate,cwd,signal,{checkCap=true,beforeRoles,preflightWarnings=[]}={}) {
    const roleFile=candidate['roles.json'] || {roles:[],remove:[]}
    normalizeRoles(roleFile)
    const ids=new Set()
    for(const role of roleFile.roles){rolePatch(role);if(ids.has(role.id))throw new Error(`duplicate role id: ${role.id}`);ids.add(role.id)}
    const globalOverlay={label:'global',path:join(dir,'roles.json'),roles:roleFile.roles,remove:roleFile.remove||[]}
    const base=buildCatalog(seeds,[globalOverlay],[])
    if(base.errors.length)throw new Error(base.errors.join('; '))
    const errors=[]
    const workspace=catalogPaths({home,cwd}).workspace
    const ws=readOverlayFile(workspace,errors)
    const effective=buildCatalog(seeds,[globalOverlay,...(ws?[{...ws,label:'workspace'}]:[])],errors)
    if(effective.errors.length)throw new Error(effective.errors.join('; '))
    const settings=candidate['settings.json'] || {...DEFAULT_TEAM_SETTINGS}
    validateSettingsPatch(settings)
    // Structural only: formations may reference roles/models this store cannot
    // resolve; the runtime reports those as stale-catalog diagnostics.
    if(candidate['formations.json'])normalizeFormations(candidate['formations.json'])
    if (checkCap && settings.memberCap !== null && settings.memberCap !== undefined) {
      // DSH 0.2.2 has no readable member cap; the BBFF soft cap is then the only limit.
      const cap=readDshMemberCap(get)
      if(cap!==null&&settings.memberCap>cap)throw new Error(`BBFF memberCap ${settings.memberCap} exceeds the DSH member cap ${cap}; raising the DSH limit requires a user-managed profile change, not this plugin`)
    }
    const llm=get('llm')
    const previous = beforeRoles === undefined ? diffValue(raw('roles.json')) : beforeRoles
    const previousOverlay = { ...globalOverlay, roles: Array.isArray(previous?.roles) ? previous.roles : [], remove: Array.isArray(previous?.remove) ? previous.remove : [] }
    const previousCatalog = buildCatalog(seeds, [previousOverlay], [])
    const seen = new Set()
    for (const role of base.roles) {
      const oldRoutes = new Set((previousCatalog.byId.get(role.id)?.models || []).map(model => JSON.stringify(routeOptions(model))))
      for (const model of role.models || []) {
        const key = JSON.stringify(routeOptions(model))
        if (oldRoutes.has(key) || seen.has(key)) continue
        seen.add(key)
        if (signal?.aborted) throw signal.reason || new Error('configuration validation cancelled')
        let problem
        if (!llm || typeof llm.resolveCallConfig !== 'function') problem = 'LLM model preflight service is unavailable'
        else {
          try { await llm.resolveCallConfig(routeOptions(model), signal) }
          catch (error) {
            if (signal?.aborted) throw signal.reason || error
            problem = String(error?.message || error)
          }
        }
        if (problem) preflightWarnings.push({ code: 'model-preflight', role: role.id, provider: model.provider, model: model.model, reason: problem })
      }
    }
    return effective
  }
  function summarize(before,after) {
    const result=[]
    for(const file of FILES){
      if(before[file]===after[file])continue
      const previous=diffValue(before[file])
      const next=diffValue(after[file])
      const keys=[...new Set([...Object.keys(previous),...Object.keys(next)])].filter(key=>JSON.stringify(previous[key])!==JSON.stringify(next[key]))
      const item={file,keys,bytesBefore:before[file]===null?0:Buffer.byteLength(before[file]),bytesAfter:after[file]===null?0:Buffer.byteLength(after[file])}
      if(file==='roles.json') {
        const oldRoles=new Map((previous.roles||[]).map(role=>[role.id,role]))
        const newRoles=new Map((next.roles||[]).map(role=>[role.id,role]))
        item.roles=[...new Set([...oldRoles.keys(),...newRoles.keys()])].filter(id=>JSON.stringify(oldRoles.get(id))!==JSON.stringify(newRoles.get(id))).map(id=>({id,fields:[...new Set([...Object.keys(oldRoles.get(id)||{}),...Object.keys(newRoles.get(id)||{})])].filter(key=>JSON.stringify(oldRoles.get(id)?.[key])!==JSON.stringify(newRoles.get(id)?.[key]))}))
      }
      if(file==='formations.json') {
        const oldFormations=new Map((Array.isArray(previous.formations)?previous.formations:[]).filter(object).map(formation=>[formation.id,formation]))
        const newFormations=new Map((Array.isArray(next.formations)?next.formations:[]).filter(object).map(formation=>[formation.id,formation]))
        item.formations=[...new Set([...oldFormations.keys(),...newFormations.keys()])].filter(id=>JSON.stringify(oldFormations.get(id))!==JSON.stringify(newFormations.get(id))).map(id=>({id,fields:[...new Set([...Object.keys(oldFormations.get(id)||{}),...Object.keys(newFormations.get(id)||{})])].filter(key=>JSON.stringify(oldFormations.get(id)?.[key])!==JSON.stringify(newFormations.get(id)?.[key]))}))
      }
      result.push(item)
    }
    return result
  }
  const stableValue = value => Array.isArray(value) ? value.map(stableValue) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])])) : value
  const sameValue = (a,b) => JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b))
  function assertExpectedBaseline(expected,before,cwd) {
    if (expected === undefined) return
    if (!object(expected) || Object.keys(expected).some(key => !['roles','removedRoles','settings','doctrineTemplates','formations'].includes(key))) throw new Error('invalid expected configuration baseline')
    const conflict = target => { throw new Error('configuration changed before stage: ' + target + '; refresh and compare the affected fields') }
    if (expected.removedRoles) {
      if(!object(expected.removedRoles))throw new Error('invalid expected removed-role baseline')
      const file=document('roles.json',before['roles.json']) || {roles:[],remove:[]}
      for(const [id,value]of Object.entries(expected.removedRoles))if(typeof value!=='boolean' || ((file.remove||[]).includes(id)||Object.hasOwn(file.hiddenRoles||{},id))!==value)conflict('removed role '+id)
    }
    if (expected.roles) {
      if (!Array.isArray(expected.roles)) throw new Error('expected roles baseline must be an array')
      const file = document('roles.json',before['roles.json']) || {roles:[],remove:[]}
      const overlays = [{label:'global',path:join(dir,'roles.json'),roles:file.roles||[],remove:file.remove||[]}]
      const errors=[],workspace=readOverlayFile(catalogPaths({home,cwd}).workspace,errors)
      if(workspace)overlays.push({...workspace,label:'workspace'})
      const catalog=buildCatalog(seeds,overlays,errors)
      for(const entry of expected.roles) {
        if(!object(entry)||typeof entry.id!=='string'||typeof entry.exists!=='boolean')throw new Error('invalid expected role baseline')
        const current=catalog.byId.get(entry.id)
        if(!entry.exists) {
          if(current || seeds.some(role=>role.id===entry.id) || (file.remove||[]).includes(entry.id) || Object.hasOwn(file.hiddenRoles||{},entry.id))conflict('role '+entry.id)
        } else {
          if(!current || !object(entry.fields))conflict('role '+entry.id)
          for(const [key,value]of Object.entries(entry.fields)) {
            if(!ROLE_FIELDS.has(key))throw new Error('invalid expected role field: '+key)
            if(!sameValue(current[key],value))conflict('role '+entry.id+'.'+key)
          }
        }
      }
    }
    if(expected.settings || expected.doctrineTemplates) {
      const current=normalizeTeamSettings(document('settings.json',before['settings.json']))
      if(expected.settings) {
        if(!object(expected.settings))throw new Error('invalid expected settings baseline')
        for(const [key,value]of Object.entries(expected.settings)) {
          if(!Object.hasOwn(DEFAULT_TEAM_SETTINGS,key))throw new Error('invalid expected settings field: '+key)
          if(!sameValue(current[key],value))conflict('settings.'+key)
        }
      }
      if(expected.doctrineTemplates) {
        if(!object(expected.doctrineTemplates))throw new Error('invalid expected doctrine baseline')
        for(const [key,entry]of Object.entries(expected.doctrineTemplates)) {
          if(!Object.hasOwn(DEFAULT_DOCTRINE_TEMPLATES,key)||!object(entry)||typeof entry.exists!=='boolean')throw new Error('invalid expected doctrine template')
          const exists=Object.hasOwn(current.doctrineTemplates,key)
          if(exists!==entry.exists || exists&&!sameValue(current.doctrineTemplates[key],entry.value))conflict('settings.doctrineTemplates.'+key)
        }
      }
    }
    if(expected.formations) {
      if(!Array.isArray(expected.formations))throw new Error('invalid expected formation baseline')
      const current=document('formations.json',before['formations.json']) || emptyFormations()
      for(const entry of expected.formations) {
        if(!object(entry)||typeof entry.id!=='string'||typeof entry.exists!=='boolean')throw new Error('invalid expected formation baseline')
        const found=current.formations.find(value=>value.id===entry.id)
        if(!!found!==entry.exists || found&&!sameValue(found,entry.value))conflict('formation '+entry.id)
      }
    }
  }
  const reviewDocument = raw => { if(raw===null)return null;try{return JSON.parse(raw)}catch{return {raw}} }
  const publicStage=(value)=>({id:value.id,summary:value.summary,source:value.meta.source,sessionId:value.meta.sessionId,createdAt:value.createdAt,warnings:Array.isArray(value.warnings)?value.warnings:[],review:{before:Object.fromEntries(value.summary.map(item=>[item.file,reviewDocument(value.before[item.file])])),after:Object.fromEntries(value.summary.map(item=>[item.file,reviewDocument(value.after[item.file])]))}})
  function stagePath(id){if(typeof id!=='string'||!ID.test(id))throw new Error('invalid staged id');return join(stageDir,id+'.json')}
  function readStage(id){
    const path=stagePath(id);if(!existsSync(path))throw new Error('staged change not found')
    const value=JSON.parse(readFileSync(path,'utf8'))
    if(value.id!==id||!object(value.before)||!object(value.after))throw new Error('invalid staged manifest')
    for(const section of [value.before,value.after]){
      if(Object.keys(section).some(file=>!FILES.includes(file)))throw new Error('invalid staged file target')
      // Stages written by releases that knew fewer files omit the newer keys.
      // Normalize exactly those to the current bytes so an old manifest stays
      // readable (and digest-comparable) instead of being rejected.
      for(const file of FILES)if(!Object.hasOwn(section,file))section[file]=raw(file)
      for(const file of FILES)if(section[file]!==null && typeof section[file]!=='string')throw new Error('invalid staged file content')
    }
    // Do not trust persisted summary paths: derive them only from the fixed file
    // whitelist. Even a manually edited stage cannot target a workspace file.
    value.summary=summarize(value.before,value.after)
    value.meta=metaOf(value.meta)
    return value
  }

  async function stage(change,meta={}) {
    const provenance=metaOf(meta)
    const before=Object.fromEntries(FILES.map(file=>[file,raw(file)]))
    assertExpectedBaseline(meta.expected,before,meta.cwd)
    const operations=Array.isArray(change)?change:[change]
    if(operations.length===0)throw new Error('at least one change is required')
    const candidate=Object.fromEntries(FILES.map(file=>{
      try{return [file,document(file,before[file])]}catch(error){
        if(file==='formations.json' && !operations.some(item=>['put-formation','remove-formation'].includes(item?.op)||(item?.op==='replace-file'&&item.file===file)))return [file,null]
        if(!operations.some(item=>item?.op==='replace-file'&&item.file===file))throw error
        return [file,file==='roles.json'?{version:3,roles:[],remove:[]}:file==='formations.json'?emptyFormations():{...DEFAULT_TEAM_SETTINGS}]
      }
    }))
    const touched=new Set(operations.map(item=>applyChange(candidate,item)))
    const nextCap=candidate['settings.json']?.memberCap??null
    const warnings = []
    await validate(candidate,meta.cwd,meta.signal,{checkCap:touched.has('settings.json')&&capOf(before['settings.json'])!==nextCap,beforeRoles:diffValue(before['roles.json']),preflightWarnings:warnings})
    const after=Object.fromEntries(FILES.map(file=>[file,touched.has(file)?(candidate[file]===null?null:encode(candidate[file])):before[file]]))
    const summary=summarize(before,after)
    const value={version:1,id:randomUUID(),createdAt:Date.now(),meta:provenance,cwd:meta.cwd||'',before,after,summary,warnings}
    mkdirSync(stageDir,{recursive:true});atomic(stagePath(value.id),encode(value))
    return publicStage(value)
  }
  function history(){
    historyWarnings=[]
    if(!existsSync(changelog))return []
    const lines=readFileSync(changelog,'utf8').split('\n').filter(Boolean),entries=[]
    for(let index=0;index<lines.length;index++){
      try{
        const entry=JSON.parse(lines[index])
        if(!object(entry)||typeof entry.id!=='string'||!Array.isArray(entry.files))throw new Error('invalid entry')
        entries.push(entry)
      }catch(error){
        if(index===lines.length-1){historyWarnings.push(`Ignored malformed trailing config changelog line ${index+1}`);break}
        throw new Error(`corrupt config changelog line ${index+1}`)
      }
    }
    return entries.reverse()
  }
  async function commit(id) {
    return serial(async()=>{
      const staged=readStage(id)
      for(const file of FILES)if(digest(raw(file))!==digest(staged.before[file]))throw new Error('configuration changed since stage; stage again before committing')
      const candidate=Object.fromEntries(FILES.map(file=>{
        if(staged.after[file]===null)return [file,null]
        try{return [file,document(file,staged.after[file])]}catch(error){if(file==='formations.json'&&staged.after[file]===staged.before[file])return [file,null];throw error}
      }))
      if(staged.summary.length===0){try{unlinkSync(stagePath(id))}catch{};return {id,at:null,summary:[],entry:null,changed:false}}
      const warnings = []
      await validate(candidate,staged.cwd,undefined,{checkCap:capOf(staged.before['settings.json'])!==capOf(staged.after['settings.json']),beforeRoles:diffValue(staged.before['roles.json']),preflightWarnings:warnings})
      for(const file of FILES)if(digest(raw(file))!==digest(staged.before[file]))throw new Error('configuration changed during preflight; stage again before committing')
      mkdirSync(historyDir,{recursive:true})
      const at=new Date().toISOString(),stamp=at.replace(/[:.]/g,'-')+'-'+id
      const files=[]
      for(const item of staged.summary){
        const snapshot=stamp+'-'+item.file
        atomic(join(historyDir,snapshot),staged.before[item.file]===null?'null\n':staged.before[item.file])
        files.push({file:item.file,snapshot,beforeExists:staged.before[item.file]!==null,afterDigest:digest(staged.after[item.file])})
      }
      const applied=[]
      try{
        for(const item of files){
          const target=join(dir,item.file),next=staged.after[item.file]
          if(next===null){if(existsSync(target))unlinkSync(target)}else atomic(target,next)
          applied.push(item.file)
        }
        const entry={id,at,...staged.meta,summary:staged.summary,files,...(warnings.length?{warnings}:{})}
        const entries=history().reverse()
        atomic(changelog,entries.map(item=>JSON.stringify(item)).concat(JSON.stringify(entry)).join('\n')+'\n')
        // The changelog is the commit boundary. A failed stage cleanup must not
        // roll back live files after the durable entry already says committed.
        try{unlinkSync(stagePath(id))}catch{}
        try{onCommit(entry)}catch{}
        return {id,at,summary:staged.summary,entry,warnings}
      }catch(error){
        for(const file of applied){const target=join(dir,file);if(staged.before[file]===null){if(existsSync(target))unlinkSync(target)}else atomic(target,staged.before[file])}
        throw error
      }
    })
  }
  function discard(id){const path=stagePath(id);const existed=existsSync(path);if(existed)unlinkSync(path);return {id,discarded:existed}}
  async function revert(entryId,meta={}) {
    const entry=history().find(item=>item.id===entryId)
    if(!entry)throw new Error('history entry not found')
    const originals={}
    const operations=entry.files.map(item=>{
      if(!FILES.includes(item.file)||typeof item.snapshot!=='string'||basename(item.snapshot)!==item.snapshot)throw new Error('invalid snapshot identity')
      const original=item.beforeExists?readFileSync(join(historyDir,item.snapshot),'utf8'):null
      originals[item.file]=original
      return {op:'replace-file',file:item.file,value:original===null?null:JSON.parse(original)}
    })
    if(!operations.length)throw new Error('history entry contains no changed files')
    const staged=await stage(operations,{...meta,reason:meta.reason||`Revert ${entryId}`})
    // Restore exact prior bytes (including whitespace), not merely equivalent
    // JSON. stage validated the parsed values; commit will validate them again.
    const manifest=readStage(staged.id)
    for(const [file,text] of Object.entries(originals))manifest.after[file]=text
    manifest.summary=summarize(manifest.before,manifest.after)
    atomic(stagePath(staged.id),encode(manifest))
    return commit(staged.id)
  }
  function read({cwd}={}) {
    const errors=[],rawFiles=Object.fromEntries(FILES.map(file=>[file,raw(file)]))
    let roles,settings,formations
    try{roles=document('roles.json',rawFiles['roles.json'])}catch(error){errors.push(`roles.json: ${error.message}`);roles={version:3,roles:[],remove:[]}}
    try{settings=document('settings.json',rawFiles['settings.json'])}catch(error){errors.push(`settings.json: ${error.message}`);settings={...DEFAULT_TEAM_SETTINGS}}
    try{formations=document('formations.json',rawFiles['formations.json'])}catch(error){errors.push(`formations.json: ${error.message}`);formations=emptyFormations()}
    const overlays=[{label:'global',path:join(dir,'roles.json'),roles:roles.roles||[],remove:roles.remove||[]}]
    const ws=readOverlayFile(catalogPaths({home,cwd}).workspace,errors);if(ws)overlays.push({...ws,label:'workspace'})
    const catalog=buildCatalog(seeds,overlays,errors)
    let entries=[]
    try{entries=history()}catch(error){errors.push(error.message)}
    return {roles,settings:normalizeTeamSettings(settings),defaults:{roles:catalog.defaults,settings:clone(DEFAULT_TEAM_SETTINGS)},formations,catalog:{roles:catalog.roles,errors:catalog.errors,sources:catalog.sources,migrations:catalog.migrations,retired:catalog.retired,removed:[...new Set([...(roles.remove||[]),...catalog.removed])].filter(id=>!RETIRED_ROLE_IDS.includes(id))},history:entries,historyWarnings:historyWarnings.slice(),raw:rawFiles}
  }
  return {stage,commit,discard,history,revert,read,paths:{dir,historyDir,stageDir,changelog},validate}
}
