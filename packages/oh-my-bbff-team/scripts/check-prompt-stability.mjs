// Pure prepack regression gate: routine live activity must not invalidate the stable prefix.
import assert from 'node:assert/strict'
import { buildCatalog, SEED_ROLES } from '../lib/catalog.js'
import { leaderDoctrine, memberDoctrine } from '../lib/doctrine.js'

export function checkPromptStability({ catalog = buildCatalog(SEED_ROLES, []), leader = leaderDoctrine, member = memberDoctrine } = {}) {
  const role = catalog.roles.find(role => role.kind !== 'oneshot') || catalog.roles[0]
  assert(role, 'Need a role for the stable-prompt gate')
  const stable = { name: 'implementation', role: role.id, model: null, function: 'Own bounded implementation and verification.' }
  let expectedLeader, comparisons = 0
  for (let n = 0; n < 6; n++) {
    const roster = [{ ...stable, status: n % 2 ? 'inactive' : 'running', context: { percent: 59.86 + n * 0.12, used: 500000 + n * 400 }, lastReport: 'Live report ' + n, reportAt: n * 1000 }]
    const rendered = leader(catalog, { roster })
    if (n === 0) expectedLeader = rendered
    else { assert.equal(rendered, expectedLeader, 'Live member status/context/report changed the leader system prompt'); comparisons++ }
  }
  for (const candidate of catalog.roles) {
    const expected = member(candidate, catalog, { seat: stable.name, function: stable.function })
    for (let n = 0; n < 5; n++) {
      const rendered = member(candidate, catalog, { seat: stable.name, function: stable.function, roster: [{ ...stable, status: n % 2 ? 'running' : 'inactive', context: { percent: n * 7.8 }, lastReport: String(n) }] })
      assert.equal(rendered, expected, 'Routine live activity changed the member system prompt for ' + candidate.id)
      comparisons++
    }
  }
  assert(!/context \d+(?:\.\d+)?%/.test(expectedLeader), 'Live context percentage must stay behind bbff_team_roster')
  assert(expectedLeader.includes('bbff_team_roster'), 'Stable prompt must preserve live-status discovery')
  return { leaderRenders: 6, memberRendersPerRole: 6, roleCount: catalog.roles.length, comparisons }
}

/**
 * Low-frequency explicit configuration changes are allowed to invalidate the
 * prefix exactly once: the new text must be stable from then on. Hiring/seat
 * changes are asserted here so a future edit cannot make them per-render.
 */
export function checkConfigChangeInvalidatesOnce({ catalog = buildCatalog(SEED_ROLES, []), leader = leaderDoctrine } = {}) {
  const role = catalog.roles.find(entry => entry.kind !== 'oneshot') || catalog.roles[0]
  const one = [{ name: 'seat-a', role: role.id, model: null, function: 'Own the first assignment.' }]
  const two = [...one, { name: 'seat-b', role: role.id, model: null, function: 'Own the second assignment.' }]
  const before = leader(catalog, { roster: one })
  const hired = leader(catalog, { roster: two })
  assert.notEqual(hired, before, 'Hiring a member must invalidate the prefix once')
  let stableAfterChange = 0
  for (let n = 0; n < 5; n++) {
    const live = two.map((member, index) => ({ ...member, status: (n + index) % 2 ? 'running' : 'inactive', context: { percent: 10 + n }, lastReport: 'r' + n }))
    assert.equal(leader(catalog, { roster: live }), hired, 'After a configuration change the prompt must stay byte-identical across live activity')
    stableAfterChange++
  }
  const renamed = [{ ...one[0], function: 'Own a different assignment.' }]
  const changedFunction = leader(catalog, { roster: renamed })
  assert.notEqual(changedFunction, before, 'Changing a standing function must invalidate the prefix once')
  assert.notEqual(leader(catalog, { roster: two }), leader(catalog, { roster: one }), 'Removing a member must invalidate the prefix once')
  const formation = { id: 'formation-a', seats: [{ seat: 'seat-a', role: role.id, function: 'A stable responsibility.' }] }
  const beforeFormation = leader(catalog, { roster: one, activeFormation: 'formation-a', formation })
  const nextFormation = { ...formation, id: 'formation-b', seats: [{ ...formation.seats[0], function: 'A changed responsibility.' }] }
  const changedFormation = leader(catalog, { roster: one, activeFormation: 'formation-b', formation: nextFormation })
  assert.notEqual(beforeFormation, changedFormation, 'Changing a formation must invalidate the prefix once')
  for (let n = 0; n < 5; n++) {
    assert.equal(leader(catalog, { roster: one.map(item => ({ ...item, status: n % 2 ? 'inactive' : 'running', context: { percent: n * 15 } })), activeFormation: 'formation-b', formation: nextFormation }), changedFormation, 'The new formation must remain byte-stable after its one explicit configuration change')
    stableAfterChange++
  }
  return { configChanges: 4, rendersAfterChange: stableAfterChange }
}
