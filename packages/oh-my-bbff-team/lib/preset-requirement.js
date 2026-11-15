// One read-only admission warning shared by Team role dispatch and hiring.
// Never use the profile default: a live Agent retains its own preset revision.
import { sessionHeaderFacts } from './dsh-adapter.js'

export const TEAM_PRESET_REQUIREMENT = Object.freeze({
  supported: Object.freeze(['standard', 'cordis']),
  requirement: 'Oh-My-BBFF Team requires standard or cordis (Creator).',
})

export function teamPresetCheck(agent, get) {
  const source = 'agentPresets.composedPreset(callingAgent.ctx)'
  let reason = '', id
  try {
    const presets = get('agentPresets')
    if (!agent?.ctx) reason = 'The calling Agent context is unavailable.'
    else if (typeof presets?.composedPreset !== 'function') reason = 'The live preset registry is unavailable.'
    else {
      id = presets.composedPreset(agent.ctx)
      if (typeof id !== 'string' || !id.trim()) reason = 'The calling Agent has no observable bound preset.'
    }
  } catch (error) { reason = 'Live preset lookup failed: ' + String(error?.message || error) }
  if (reason) {
    // Header metadata is only a hint, never proof of the current composition.
    const hint = sessionHeaderFacts(agent?.session?.header).value.presetId
    return {
      presetId: 'unknown',
      presetSource: source + '; unverified' + (hint ? '; session header hint: ' + hint : '; no session header preset hint'),
      presetWarning: 'WARNING: ' + TEAM_PRESET_REQUIREMENT.requirement + ' Cannot verify the current session preset. ' + reason + (hint ? ' The session header records ' + hint + ', but its current composition could not be verified.' : '') + ' With ptc, minimal or another unsupported preset this will not work. No preset was changed.',
    }
  }
  return {
    presetId: id,
    presetSource: source,
    ...(!TEAM_PRESET_REQUIREMENT.supported.includes(id) ? {
      presetWarning: 'WARNING: The current session uses ' + id + '. ' + TEAM_PRESET_REQUIREMENT.requirement + ' This will not work with this preset; the role inherits it. No preset was changed.',
    } : {}),
  }
}

export const PRESET_RESULT_PROPERTIES = Object.freeze({
  presetId: { type: 'string', required: true },
  presetSource: { type: 'string', required: true },
  presetWarning: { type: 'string' },
})
export function withPresetWarning(value, summary) {
  return [{ type: 'text', text: (value.presetWarning ? value.presetWarning + '\n' : '') + summary }]
}
