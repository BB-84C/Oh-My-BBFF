// Team doctrine is rendered from visible shipped templates plus audited settings overrides.
// Runtime facts/role prompts are substituted as data, never evaluated as templates or code.
import { modelTier, roleTitle, routeText } from './catalog.js'
import { DEFAULT_TEAM_SETTINGS } from './team-settings.js'
import { renderDoctrineTemplate, DOCTRINE_VARIABLES } from './doctrine-templates.js'
function delegationText(role) {
  const delegation=role?.delegation || {mode:'none'}
  if(delegation.mode==='none')return 'may not delegate'
  if(delegation.mode==='any')return 'may delegate to any role'
  return 'may delegate one-shot work to: '+(delegation.roles?.length?delegation.roles.join(', '):'any one-shot role')
}
// Shipped defaults are English; user-authored text is never filtered by language.
export function modelRoleTitle(role) {
  return roleTitle(role,'en')
}
export function modelTierGuidance(use) {
  return String(use||'')
}
const tierLine=(tier,index)=>(index+1)+'. '+(tier.label?'('+tier.label+') ':'')+routeText(tier)+' — '+modelTierGuidance(tier.use)
export function modelTiersText(role) { return role?.models?.length?role.models.map(tierLine).join('; '):'none configured — DSH current default' }
function reuseMeaning(role) {
  if(role.reuse==='amend-same')return 'For corrections to the same task, continue the original agent via steer/message; do not start another.'
  if(role.reuse==='pool')return 'Prefer an existing idle member or child with the same role; start a new agent only when none is idle.'
  return 'Start a new agent for every new object/task (useful for reviews; avoids context carry-over).'
}
export function roleTable(roles,{kinds}={}) {
  return roles.filter(role=>!kinds||kinds.includes(role.kind)||role.kind==='both').map(role=>{
    const brief=role.leaderBrief||{},extra=[['use when',brief.whenToUse],['do not use for',brief.whenNotToUse],['deliverable',brief.deliverable],['boundaries',brief.boundaries]].filter(([,text])=>typeof text==='string'&&text.trim())
    return [
      '- '+role.id+' ('+modelRoleTitle(role)+'): '+String(brief.summary||''),
      ...extra.map(([label,text])=>'  '+label+': '+String(text).replace(/\s+/g,' ').trim()),
      ...(role.models?.length?['  models:',...role.models.map((tier,index)=>'    '+tierLine(tier,index))]:['  models: none configured — DSH current default']),
      '  policy: '+[role.kind,role.readOnly?'read-only':'can write',delegationText(role),...(role.concurrency?['max '+role.concurrency+' concurrent one-shot dispatches']:[])].join(' · '),
      '  reuse: '+role.reuse+' — '+reuseMeaning(role),
    ].join('\n')
  }).join('\n')
}
function render(key,variables,settings) { return renderDoctrineTemplate(key,{...Object.fromEntries(DOCTRINE_VARIABLES.map(name=>[name,''])),...variables},settings.doctrineTemplates || {}) }
function context(catalog,settings,values={}) {
  // The root's native name is runtime data (quoted); without a live tree it points to the roster.
  return {leadName:settings.leadName||'shown by bbff_team_roster',roles:roleTable(catalog.roles),maxDepth:settings.maxDepth??DEFAULT_TEAM_SETTINGS.maxDepth,configuredDepth:settings.configuredDepth??settings.maxDepth??DEFAULT_TEAM_SETTINGS.maxDepth,nativeDepth:settings.nativeDepth??'unavailable',delegationReason:settings.delegationReason||'',helpersPerMember:settings.helpersPerMember??DEFAULT_TEAM_SETTINGS.helpersPerMember,...values}
}
function memberModelText(member,catalog) {
  if(member.route)return routeText(member.route)
  const role=member.role && catalog.byId.get(member.role)
  if(!role)return member.model==null?'':String(member.model)
  if(!role.models?.length)return 'DSH current default'
  if(member.model==null)return ''
  try { const chosen=modelTier(role,member.model);return chosen.selection+' · '+routeText(chosen.route) } catch { return String(member.model) }
}
function targetRoles(role,catalog,settings) {
  if(!role || settings.delegationBlocked || settings.nestingMode==='helpers' || !role.delegation || role.delegation.mode==='none')return ''
  const targets=catalog.roles.filter(candidate=>candidate.kind!=='member' && (role.delegation.mode==='any'||!role.delegation.roles||role.delegation.roles.includes(candidate.id)))
  return targets.length?render('targets',{targetRoles:roleTable(targets)},settings):''
}
function roleContext(role,catalog,settings) {
  // leaderBrief never reaches the member/child; they get the identity prompt only.
  return {roleId:role?.id||'',rolePurpose:role?.leaderBrief?.summary||'',rolePrompt:role?.identityPrompt||'',modelTiers:modelTiersText(role),delegation:settings.nestingMode==='helpers'?'disabled by helpers mode; ask the Team Lead for helpers':settings.delegationBlocked?'unavailable at this depth: '+settings.delegationReason:delegationText(role),dispatchTargets:targetRoles(role,catalog,settings)}
}
export function orchestratorDoctrine(catalog,{nativeSubagent=true,teamAvailable=false,settings={}}={}) {
  const values=context(catalog,settings)
  values.rootContext=render(teamAvailable?'rootWithTeam':'rootWithoutTeam',values,settings)
  values.nativeEscapeText=nativeSubagent?render('nativeEscape',values,settings):''
  return render('orchestrator',values,settings)
}
export function leaderDoctrine(catalog,{roster=[],settings={},activeFormation=null,formation=null}={}) {
  // Only configuration belongs in the stable prefix. Status, pressure and reports
  // remain live tool data; changing them must not invalidate the prompt cache.
  const rosterText=roster.length?[...roster].sort((a,b)=>String(a.name).localeCompare(String(b.name),'en')).map(member=>{
    const model=memberModelText(member,catalog),standingFunction=String(member.function||'').replace(/\s+/g,' ').trim()
    return '- '+member.name+(member.role?' ['+member.role+']':' [no role]')+(model?' · '+model:'')+(standingFunction?' · function: '+standingFunction:'')+(member.assist?' · helper for '+member.assist:'')+(member.address&&member.address!==member.name?' · native address '+member.address+' (Team alias; use it with send_message)':'')
  }).join('\n'):'- (no teammates yet)'
  const values=context(catalog,settings,{roster:rosterText,activeFormation:(activeFormation||'(none)')+(formation?' · '+formation.seats.map(seat=>seat.seat+' → '+String(seat.function).replace(/\s+/g,' ')+' ['+seat.role+'/'+(seat.model||'preferred')+']').join('; '):'')})
  values.namingRule=render(settings.memberNaming==='seat'?'namingSeat':'namingFunction',values,settings)
  values.leaderMode=render(settings.nestingMode==='helpers'?'leaderHelpers':'leaderNested',values,settings)
  return render('leader',values,settings)
}
export function memberDoctrine(role,catalog,{settings={},helpers=[],assist=null,seat=null,function:standingFunction='',formation=null}={}) {
  const values=context(catalog,settings,{...roleContext(role,catalog,settings),seat:seat||'(unseated)',standingFunction:String(standingFunction).replace(/\s+/g,' '),formation:formation||'(none)',helpers:helpers.join(', '),assist:assist||''})
  values.memberMode=render(settings.nestingMode==='helpers'?'memberHelpers':settings.delegationBlocked?'memberDepthLimited':'memberNested',values,settings)
  values.reportingRules=render(role?.readOnly?'memberReadonlyReporting':'memberReporting',values,settings)
  values.assignedHelpersText=helpers.length?render('assignedHelpers',values,settings):''
  values.assistText=assist?render('assist',values,settings):''
  values.memberRoleText=render(role?'memberRole':'memberUnbound',values,settings)
  return render('member',values,settings)
}
export function childDoctrine(role,catalog,{settings={}}={}) {
  const values=context(catalog,settings,roleContext(role,catalog,settings))
  values.readOnlyRule=render(role.readOnly?'childReadOnly':'childWritable',values,settings)
  return render('child',values,settings)
}
