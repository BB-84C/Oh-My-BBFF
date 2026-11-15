import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { BUNDLED_SKILL_RANK, SkillRegistry, renderSkillContent } from '@deepseek-ai/dsh-skill'
import * as entry from '../index.js'
import { parseSkill } from '../lib/content.js'
import { createSkillProvider } from '../lib/provider.js'
import { inspectPackage } from '../scripts/package-gate.js'
import { addSkill, fixture, packageRoot, put, skill } from './fixtures.js'

async function registry(t, provider) {
  const ctx = new Context()
  new SkillRegistry(ctx)
  t.after(() => ctx.fiber.dispose())
  const mount = await ctx.plugin({ name: 'isolated-fixture-provider', inject: ['skills'], apply(ctx) {
    ctx.skills.registerProvider(() => provider)
  } })
  return { ctx, mount }
}

test('one bundled candidate, actual registry list/get/render, fresh body reads and disposal', async t => {
  const root = await fixture(t)
  await addSkill(root)
  const provider = createSkillProvider(join(root, 'skills'), 'fixture-provider')
  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].rank, BUNDLED_SKILL_RANK)
  assert.equal(candidates[0].rank, 600)
  assert.equal(candidates[0].source, 'bundled')
  assert.equal(candidates[0].locator, join(root, 'skills/fixture-skill/SKILL.md'))
  const { ctx, mount } = await registry(t, provider)
  const firstCatalog = await ctx.skills.list()
  assert.deepEqual(firstCatalog.map(item => item.name), ['fixture-skill'])
  assert.equal(Object.hasOwn(firstCatalog[0], 'content'), false)
  const loaded = await ctx.skills.get('fixture-skill')
  assert.equal(loaded.content, '# Fixture\n\nOriginal word.')
  assert.deepEqual(loaded.resourceBase, { kind: 'directory', path: join(root, 'skills/fixture-skill').split(sep).join('/') })
  const rendered = renderSkillContent(loaded)
  assert.match(rendered, /<skill_content name="fixture-skill">/)
  assert(rendered.includes(loaded.resourceBase.path))
  await addSkill(root, '# Fixture\n\nChanged word.\n\u4e2d')
  const edited = await ctx.skills.get('fixture-skill')
  assert.equal(edited.content, '# Fixture\n\nChanged word.\n\u4e2d')
  assert.deepEqual(await ctx.skills.list(), firstCatalog, 'body edits do not need catalog invalidation')
  assert.equal(await ctx.skills.get('not-present'), undefined)
  await mount.dispose()
  assert.deepEqual(await ctx.skills.list(), [])
})

test('runtime does not apply shipped-default CJK or description-length filters', async t => {
  const root = await fixture(t)
  await addSkill(root, '# User text\n\u4e2d', 'x'.repeat(501))
  const { ctx } = await registry(t, createSkillProvider(join(root, 'skills'), 'user-edited-package'))
  assert.equal((await ctx.skills.get('fixture-skill')).description.length, 501)
  assert.match((await ctx.skills.get('fixture-skill')).content, /\u4e2d/)
})

test('provider propagates cancellation and malformed frontmatter', async t => {
  const root = await fixture(t)
  await addSkill(root)
  const provider = createSkillProvider(join(root, 'skills'), 'fixture-provider')
  const candidate = (await provider.list())[0]
  const signal = AbortSignal.abort()
  await assert.rejects(provider.list({ signal }), { name: 'AbortError' })
  await assert.rejects(provider.get(candidate, { signal }), { name: 'AbortError' })
  await put(root, 'skills/fixture-skill/SKILL.md', '# Invalid metadata')
  await assert.rejects(provider.get(candidate), /frontmatter/)
})

test('package entry mounts against native registry and loads every current draft with its resource base', async t => {
  const gate = await inspectPackage(packageRoot)
  assert.deepEqual(gate.errors, [], 'current shipped drafts must pass authoring checks')
  const ctx = new Context()
  new SkillRegistry(ctx)
  t.after(() => ctx.fiber.dispose())
  const mount = await ctx.plugin(entry)
  const catalog = await ctx.skills.list()
  assert.deepEqual(catalog.map(item => item.name).sort(), gate.skills)
  for (const item of catalog) {
    assert.equal(item.provider, 'oh-my-bbff-superpowers')
    const path = join(packageRoot, 'skills', item.name, 'SKILL.md')
    const expected = parseSkill(await readFile(path, 'utf8'), item.name, path)
    const loaded = await ctx.skills.get(item.name)
    assert.equal(loaded.content, expected.content)
    assert.deepEqual(loaded.resourceBase, { kind: 'directory', path: join(packageRoot, 'skills', item.name).split(sep).join('/') })
  }
  await mount.dispose()
  assert.deepEqual(await ctx.skills.list(), [])
})

test('entry makes exactly one provider registration and no family contribution', () => {
  const calls = []
  entry.apply({ skills: { registerProvider(create) { calls.push(create({ signal: new AbortController().signal, invalidate() {} })) } } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, entry.name)
  assert.deepEqual(entry.inject, ['skills'])
})
