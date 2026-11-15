// UI meaning for all 24 assembly fragments. Never injected as model instructions.
// Text lives in locale/<lang>.json (ui keys doctrine.<key>.audience/.title/.trigger/.effect and
// doctrineGroup.<group>); this module emits message references only.
import { msg } from './bbff-contract.js'
const groups = {
  sharedRules: 'rules', orchestrator: 'positions', leader: 'positions', member: 'positions', child: 'positions',
  rootWithTeam: 'fragments', rootWithoutTeam: 'fragments', nativeEscape: 'fragments', namingFunction: 'fragments', namingSeat: 'fragments',
  leaderNested: 'fragments', leaderHelpers: 'fragments', memberReporting: 'rules', memberReadonlyReporting: 'rules', memberNested: 'rules',
  memberDepthLimited: 'fragments', memberHelpers: 'rules', assignedHelpers: 'fragments', assist: 'rules', memberRole: 'fragments',
  memberUnbound: 'fragments', childReadOnly: 'rules', childWritable: 'rules', targets: 'fragments',
}
export const DOCTRINE_CATALOG = Object.freeze(Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, Object.freeze({
  key, group, editable: true,
  audience: msg(`doctrine.${key}.audience`), title: msg(`doctrine.${key}.title`), trigger: msg(`doctrine.${key}.trigger`), effect: msg(`doctrine.${key}.effect`),
})])))
export const DOCTRINE_GROUPS = Object.freeze(Object.fromEntries(['rules', 'fragments', 'positions'].map(group => [group, msg(`doctrineGroup.${group}`)])))
