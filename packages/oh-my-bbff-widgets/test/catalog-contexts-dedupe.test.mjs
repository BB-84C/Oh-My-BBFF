// A skill that discovery finds in N project slices has N facts, and each of them becomes one `contexts` item of the
// skill's catalog entry unless an identical item is already there. The check used to compare the new item with every
// item pushed before it (two JSON.stringify calls per comparison), which is quadratic in N; it now looks the
// item's JSON up in a Set that is kept per entry.
//
// The previous implementation is kept as `fixtures/old-catalog-entries.js` (the oracle of the attribution test); the
// output of the two must be identical, and the number of JSON.stringify calls a build makes must grow linearly with N.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCatalogEntries } from '../lib/catalog-entries.js'
import { buildCatalogEntries as oldBuildCatalogEntries } from './fixtures/old-catalog-entries.js'

const skillFact = (name, project, extra = {}) => ({
  kind: 'skill', name, description: 'Skill ' + name,
  sources: project ? ['host', 'project:' + project] : ['host'], ...(project ? { projectPath: project } : {}),
  skillSource: 'user', skillProvider: 'filesystem', modelInvocable: true, userInvocable: true, ...extra,
})

/** `skills` skills, each seen from the host and from every one of `projects` project slices. */
function slices(skills, projects) {
  const facts = []
  for (let skill = 0; skill < skills; skill += 1) {
    facts.push(skillFact('skill-' + skill))
    for (let project = 0; project < projects; project += 1) facts.push(skillFact('skill-' + skill, '/work/p' + project))
  }
  return facts
}

function countStringify(work) {
  const original = JSON.stringify
  let calls = 0
  JSON.stringify = function (...args) { calls += 1; return original.apply(this, args) }
  try { work() } finally { JSON.stringify = original }
  return calls
}

test('the entries are identical to the previous implementation, repeated and differing contexts included', () => {
  const facts = slices(6, 20)
  // The same fact again (discovery can report one twice): it must not add a second context.
  facts.push(skillFact('skill-0', '/work/p3'), skillFact('skill-0', '/work/p3'), skillFact('skill-0'))
  // Same project, different flags or a different source list: these are different contexts.
  facts.push(skillFact('skill-1', '/work/p3', { modelInvocable: false }))
  facts.push(skillFact('skill-1', '/work/p3', { userInvocable: false }))
  facts.push(skillFact('skill-1', '/work/p3', { sources: ['project:/work/p3', 'host'] }))
  facts.push(skillFact('skill-1', '/work/p3', { sources: ['host', 'project:/work/p3', 'preset:standard'] }))
  // A context without a project path next to one with.
  facts.push(skillFact('skill-2', undefined, { sources: ['preset:standard'] }))
  const actual = buildCatalogEntries({ facts })
  const expected = oldBuildCatalogEntries({ facts })
  assert.deepEqual(actual, expected)
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), 'the same entries in the same order and key order')
  const entry = actual.find((row) => row.name === 'skill-1')
  assert.equal(entry.contexts.length, 1 + 20 + 4, 'skill-1: host, 20 projects, 4 variants of one project')
  assert.equal(actual.find((row) => row.name === 'skill-0').contexts.length, 1 + 20, 'skill-0: the repeats were dropped')
})

test('two entries with identical contexts do not share a set of seen contexts', () => {
  const facts = [skillFact('first', '/work/a'), skillFact('second', '/work/a'), skillFact('first', '/work/b'), skillFact('second', '/work/b'), skillFact('first', '/work/a'), skillFact('second', '/work/a')]
  const entries = buildCatalogEntries({ facts })
  for (const name of ['first', 'second']) {
    const entry = entries.find((row) => row.kind === 'skill' && row.name === name)
    assert.deepEqual(entry.contexts.map((context) => context.projectPath), ['/work/a', '/work/b'], name)
  }
  assert.deepEqual(entries, oldBuildCatalogEntries({ facts }))
})

test('a build does not compare every context with all earlier ones: JSON.stringify calls grow linearly with the project slices', () => {
  const calls = (build, projects) => { const facts = slices(3, projects); return countStringify(() => build({ facts })) }
  const small = calls(buildCatalogEntries, 96), large = calls(buildCatalogEntries, 192)
  // Doubling the slices doubles the work (the final sort of the contexts adds a logarithmic factor); a quadratic check quadruples it.
  assert.ok(large < 3 * small, 'stringify calls: ' + small + ' at 96 slices, ' + large + ' at 192 slices')
  assert.ok(large < 192 * 3 * 20, 'at most about twenty stringify calls per fact: ' + large)
  // The probe has to see the old quadratic behaviour, otherwise the bound above proves nothing.
  const oldSmall = calls(oldBuildCatalogEntries, 96), oldLarge = calls(oldBuildCatalogEntries, 192)
  assert.ok(oldLarge > 3.5 * oldSmall, 'the previous implementation is quadratic: ' + oldSmall + ' -> ' + oldLarge)
})
