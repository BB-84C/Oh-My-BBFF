import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
test('Chinese plugin metadata matches English keys and resolves through the package export', async () => {
  const en = JSON.parse(await readFile(join(root, 'locale/en.json'), 'utf8'))
  const zh = JSON.parse(await readFile(join(root, 'locale/zh.json'), 'utf8'))
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  assert.deepEqual(Object.keys(zh.meta).sort(), Object.keys(en.meta).sort())
  for (const [key, value] of Object.entries(zh.meta)) {
    assert.equal(typeof value, 'string', key)
    assert(value.trim(), key)
    assert.match(value, /\p{Script=Han}/u, key)
  }
  const info = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(info.exports['./locale/*.json'], './locale/*.json')
  assert(info.files.includes('locale/'))
  assert.equal(fileURLToPath(import.meta.resolve('oh-my-bbff-superpowers/locale/zh.json')), join(root, 'locale/zh.json'))
})
