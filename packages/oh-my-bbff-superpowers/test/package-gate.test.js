import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inspectPackage, buildPayloadManifest, verifyPackedInventory } from '../scripts/package-gate.js'
import { addPackage, addSkill, fixture, put, skill } from './fixtures.js'

test('valid package, YAML block scalars, relative inline/reference/HTML links and payload hashes', async t => {
  const root = await fixture(t)
  await addPackage(root)
  await put(root, 'skills/fixture-skill/references/guide (one).md', '# Guide\n')
  await addSkill(root, '[Guide](<references/guide%20(one).md>)\n[Again][guide]\n\n[guide]: <references/guide%20(one).md>\n<a href="references/guide%20(one).md">Guide</a>\n[External](https://example.invalid/missing)\n[Heading](#fixture)')
  assert.deepEqual((await inspectPackage(root)).errors, [])
  const manifest = await buildPayloadManifest(root)
  assert.deepEqual(manifest.skills, ['fixture-skill'])
  assert(manifest.files.some(file => file.path === 'skills/fixture-skill/references/guide (one).md' && /^[a-f0-9]{64}$/.test(file.sha256)))
  const block = '---\nname: fixture-skill\ndescription: >-\n  Use when checking\n  folded YAML.\n---\n# Body\n'
  await put(root, 'skills/fixture-skill/SKILL.md', block)
  assert.deepEqual((await inspectPackage(root)).errors, [])
})

for (const [label, raw, expected] of [
  ['missing frontmatter', '# No metadata', /frontmatter/],
  ['invalid YAML', '---\nname: [\n---\nBody', /YAML/],
  ['duplicate YAML key', '---\nname: fixture-skill\nname: fixture-skill\ndescription: Use when testing.\n---\nBody', /YAML/],
  ['invalid name', skill('Bad_Name'), /name/],
  ['directory mismatch', skill('another-name'), /directory/],
  ['empty description', skill('fixture-skill', '# Body', ' '), /description/],
  ['long description', skill('fixture-skill', '# Body', 'x'.repeat(501)), /500/],
  ['CJK default', skill('fixture-skill', '# Body\n\u4e2d'), /CJK/],
  ['missing link', skill('fixture-skill', '[Missing](references/missing.md)'), /missing/],
  ['missing link after code with exact line', skill('fixture-skill', '```md\n[Example](references/ok-in-code.md)\n```\nSee `[x](y.md)`.\n\n[Missing](references/missing.md)'), /SKILL\.md:11: missing relative link target/],
  ['missing reference link', skill('fixture-skill', '[Missing][ref]\n\n[ref]: references/missing.md'), /missing/],
  ['missing HTML link', skill('fixture-skill', '<img src="references/missing.png">'), /missing/],
  ['escaping link', skill('fixture-skill', '[Escape](../../../outside.md)'), /outside/],
  ['encoded escaping link', skill('fixture-skill', '[Escape](%2e%2e/%2e%2e/%2e%2e/outside.md)'), /outside/],
  ['absolute file link', skill('fixture-skill', '[Escape](file:///C:/outside.md)'), /absolute/],
]) test(`gate rejects ${label}`, async t => {
  const root = await fixture(t)
  await addPackage(root)
  await put(root, 'skills/fixture-skill/SKILL.md', raw)
  assert.match((await inspectPackage(root)).errors.join('\n'), expected)
})

test('gate scans supporting text and follows real paths when checking containment', async t => {
  const root = await fixture(t)
  await addPackage(root)
  await put(root, 'skills/fixture-skill/references/details.md', '# Details\n\u4e2d\n[Missing](absent.md)')
  const errors = (await inspectPackage(root)).errors.join('\n')
  assert.match(errors, /CJK/)
  assert.match(errors, /absent/)
  const outside = await fixture(t)
  await put(outside, 'outside.md', '# Outside')
  await symlink(outside, join(root, 'skills/fixture-skill/escape'), 'junction')
  await addSkill(root, '[Escaped](escape/outside.md)')
  assert.match((await inspectPackage(root)).errors.join('\n'), /symlink|outside/)
})

test('draft gate accepts partial inventory; release gate requires the approved eight', async t => {
  const root = await fixture(t)
  await addPackage(root)
  assert.deepEqual((await inspectPackage(root)).errors, [])
  assert.match((await inspectPackage(root, { release: true })).errors.join('\n'), /eight|8/)
})

test('packed inventory rejects both omitted resources and unintended files', async t => {
  const root = await fixture(t)
  await addPackage(root)
  const manifest = await buildPayloadManifest(root)
  const files = [...manifest.files.map(file => ({ path: file.path })), { path: 'payload-manifest.json' }]
  assert.doesNotThrow(() => verifyPackedInventory(manifest, [{ files }]))
  assert.throws(() => verifyPackedInventory(manifest, [{ files: files.slice(1) }]), /mismatch/)
  assert.throws(() => verifyPackedInventory(manifest, [{ files: [...files, { path: 'private.txt' }] }]), /mismatch/)
})

test('payload manifest is deterministic and changes with payload bytes', async t => {
  const root = await fixture(t)
  await addPackage(root)
  const before = await buildPayloadManifest(root)
  assert.deepEqual(await buildPayloadManifest(root), before)
  await writeFile(join(root, 'index.js'), 'export function apply() { return 1 }\n')
  assert.notDeepEqual(await buildPayloadManifest(root), before)
})
