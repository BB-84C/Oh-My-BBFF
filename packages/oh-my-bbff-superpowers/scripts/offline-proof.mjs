import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry, renderSkillContent } from '@deepseek-ai/dsh-skill'
import * as entry from '../index.js'
import { parseSkill } from '../lib/content.js'
import { inspectPackage } from './package-gate.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const gate = await inspectPackage(root, { release: process.argv.includes('--release') })
assert.deepEqual(gate.errors, [], 'shipped drafts must pass the authoring gate')
const ctx = new Context()
new SkillRegistry(ctx)
try {
  const mount = await ctx.plugin(entry)
  const catalog = await ctx.skills.list()
  assert.deepEqual(catalog.map(item => item.name).sort(), gate.skills)
  const definitions = []
  for (const summary of catalog) {
    const path = join(root, 'skills', summary.name, 'SKILL.md')
    const raw = await readFile(path, 'utf8')
    const expected = parseSkill(raw, summary.name, path)
    const loaded = await ctx.skills.get(summary.name)
    assert.equal(loaded.content, expected.content)
    assert.deepEqual(loaded.resourceBase, { kind: 'directory', path: join(root, 'skills', summary.name).split(sep).join('/') })
    const rendered = renderSkillContent(loaded)
    assert(rendered.includes(loaded.resourceBase.path) && rendered.includes(loaded.content))
    definitions.push({ name: loaded.name, provider: loaded.provider, source: loaded.source, contentCharacters: loaded.content.length, contentSHA256: createHash('sha256').update(loaded.content).digest('hex'), resourceBase: loaded.resourceBase, rendered: true })
  }
  await mount.dispose()
  assert.deepEqual(await ctx.skills.list(), [])
  const registryUrl = import.meta.resolve('@deepseek-ai/dsh-skill')
  const registryInfo = JSON.parse(await readFile(new URL('../package.json', registryUrl), 'utf8'))
  console.log(JSON.stringify({ isolated: true, liveProfileTouched: false, nativeRegistry: { path: fileURLToPath(registryUrl), version: registryInfo.version }, catalogNames: catalog.map(item => item.name), definitions, providerDisposed: true }, null, 2))
} finally { await ctx.fiber.dispose() }
