import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshRuntime, findDshRuntime } from '../scripts/dsh-runtime.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
test('runtime helper discovers installed DSH without a required environment override', async () => {
  assert(dshRuntime, 'an installed DSH is required for this suite')
  const info = JSON.parse(await readFile(join(dshRuntime.root, 'package.json'), 'utf8'))
  assert.equal(info.name, '@deepseek-ai/dsh')
  assert.equal(info.version, dshRuntime.version)
  assert.equal(findDshRuntime([]), undefined, 'absent runtime is explicit, not fabricated')
  assert.equal(findDshRuntime([join(root, 'package.json')]), undefined, 'a non-DSH package is not a runtime')
  assert(dshRuntime.modules.get('@deepseek-ai/dsh-skill').startsWith('file:'))
})

test('old local test preloader is only a compatibility import, not a packaging dependency', async () => {
  const shim = await readFile(join(root, 'scripts/dsh-test-runtime.mjs'), 'utf8')
  assert(shim.includes("import './dsh-runtime.mjs'"))
  const info = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert(!info.files.includes('scripts/dsh-test-runtime.mjs'))
  assert(info.files.includes('scripts/dsh-runtime.mjs'))
})
