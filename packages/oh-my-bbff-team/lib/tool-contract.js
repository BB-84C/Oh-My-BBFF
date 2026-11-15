// Team owns these effects and authority scopes. Native names/classes are adapter data, not listed here.
export const TEAM_TOOL_EFFECTS = Object.freeze({
  bbff_team_roles:'read', bbff_team_dispatch:'delegate', bbff_team_hire:'delegate', bbff_team_assign:'write',
  bbff_team_roster:'read', bbff_team_steer:'write', bbff_team_compact:'write', bbff_team_formation:'write',
  bbff_team_activity:'read', bbff_team_job_kill:'write',
  bbff_team_config_read:'read', bbff_team_config_stage:'write', bbff_team_config_commit:'write', bbff_team_config_discard:'write',
})
export const TEAM_DELEGATION_CONTROLS = Object.freeze(['bbff_team_dispatch','bbff_team_hire','bbff_team_assign'])
export const TEAM_ROOT_ONLY_TOOLS = Object.freeze(['bbff_team_config_read','bbff_team_config_stage','bbff_team_config_commit','bbff_team_config_discard','bbff_team_formation','bbff_team_activity','bbff_team_job_kill'])
export function teamToolTraits(definitions) {
  const traits={}
  for(const definition of definitions) {
    const effect=TEAM_TOOL_EFFECTS[definition.name]
    if(!effect)throw new Error('Team tool has no declared effect: '+definition.name)
    traits[definition.name]={effect}
  }
  return traits
}
