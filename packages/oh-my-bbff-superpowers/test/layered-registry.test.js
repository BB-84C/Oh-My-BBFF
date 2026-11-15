import assert from 'node:assert/strict'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry, renderSkillContent } from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'
import * as filesystem from '@deepseek-ai/dsh-skill-filesystem'
import * as entry from '../index.js'
import { RELEASE_SKILLS } from '../scripts/package-gate.js'

async function registry(t) {
  const ctx = new Context()
  new SkillRegistry(ctx)
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(entry)
  return ctx
}

test('native scoped registration shadows a host runtime duplicate and restores on disposal', async t => {
  const ctx = await registry(t)
  const removeGlobal = ctx.skills.register({ name: 'writing-plans', description: 'Global runtime override.', content: 'Global body.', source: 'runtime' })
  assert.equal((await ctx.skills.get('writing-plans')).content, 'Global body.')
  const key = {}, scope = createScope(ctx, key)
  await scope.ctx.plugin(entry)
  const scoped = await ctx.skills.get('writing-plans', { scope: key })
  assert.equal(scoped.provider, 'oh-my-bbff-superpowers')
  assert.match(scoped.content, /Durable Plans/)
  assert.equal((await ctx.skills.get('writing-plans')).content, 'Global body.')
  await scope.dispose()
  assert.equal((await ctx.skills.get('writing-plans', { scope: key })).content, 'Global body.')
  removeGlobal()
  assert.equal((await ctx.skills.snapshot()).complete, true)
  assert.deepEqual((await ctx.skills.list()).map(item => item.name).sort(), RELEASE_SKILLS)
})

test('installed Creator dsh-doc catalog coexists with exactly eight Superpowers skills', async t => {
  const ctx = await registry(t)
  const presetRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-agent-preset'))))
  await ctx.plugin(filesystem, { includeDefaultRoots: false, bundledSkillDir: join(presetRoot, 'skills'), watch: false })
  const snapshot = await ctx.skills.snapshot()
  assert.equal(snapshot.complete, true)
  assert.deepEqual(snapshot.skills.map(item => item.name).sort(), [...RELEASE_SKILLS, 'dsh-doc'].sort())
  const native = await ctx.skills.get('dsh-doc')
  assert.notEqual(native.provider, 'oh-my-bbff-superpowers')
  assert.equal(native.name, 'dsh-doc')
  assert.match(renderSkillContent(native), /<skill_content name="dsh-doc">/)
  for (const name of RELEASE_SKILLS) assert.equal((await ctx.skills.get(name)).provider, 'oh-my-bbff-superpowers')
})
