#!/usr/bin/env node
// Release gate for the repository-root DSH bundle. The root package.json is what a user installs
// when they paste the plain GitHub address or the local clone directory into Add plugin, so it must
// stay the same bundle as packages/oh-my-bbff: same five exact pins, same patch rows, same icon,
// and no lifecycle scripts (a git install must not run a build step).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const manifest = JSON.parse(read('package.json'))
const meta = JSON.parse(read('packages/oh-my-bbff/package.json'))
const FAMILY = ['oh-my-bbff-widgets', 'oh-my-bbff-team', 'oh-my-bbff-memory', 'oh-my-bbff-scope', 'oh-my-bbff-superpowers']

assert.equal(manifest.name, 'oh-my-bbff', 'the root bundle keeps the family name')
assert.equal(manifest.version, '1.0.0', 'the root bundle ships the same version as the npm bundle')
assert.equal(manifest.private, undefined, 'a private package cannot be installed from a git address')
assert.equal(manifest.type, 'module')
assert.equal(manifest.main, './index.js')
assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml', 'the root must declare its loader patch')
assert.equal(manifest.exports?.['.'], './index.js')
assert.equal(manifest.exports?.['./cordis.patch.yml'], './cordis.patch.yml')
assert.equal(manifest.exports?.['./icon'], './icon.svg')
assert.equal(manifest.engines?.dsh, meta.engines?.dsh, 'the root and the npm bundle accept the same DSH range')
for (const file of ['index.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  assert(manifest.files?.includes(file), 'files must ship ' + file)
}
assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), [...FAMILY].sort(), 'the root depends on exactly the five family packages')
for (const name of FAMILY) {
  assert.equal(manifest.dependencies[name], '1.0.0', name + ' is pinned exactly')
  assert.equal(meta.dependencies[name], manifest.dependencies[name], name + ' must match the npm bundle pin')
}
// A git install must not run a build: no lifecycle script may exist here.
for (const script of ['prepare', 'prepack', 'prepublishOnly', 'install', 'postinstall', 'postpack']) {
  assert.equal(manifest.scripts?.[script], undefined, 'the root must not declare the ' + script + ' lifecycle script')
}
// The entry module is a no-op and the patch is byte-identical to the npm bundle's patch.
const entry = read('index.js').replace(/^\s*\/\/.*$/gm, '').trim()
assert.equal(entry, 'export {};', 'the bundle entry module must only export nothing')
const patch = read('cordis.patch.yml')
assert.equal(patch, read('packages/oh-my-bbff/cordis.patch.yml'), 'the root patch must equal the npm bundle patch')
const rows = [...patch.matchAll(/^ {4}- id: (\S+)$/gm)].map(match => match[1])
assert.deepEqual(rows, FAMILY, 'the root patch inserts the five family rows in order')
assert(/^<svg[\s>]/.test(read('icon.svg').trim()), 'icon.svg must be an SVG document')
console.log('PASS root bundle gate: ' + manifest.name + '@' + manifest.version + ' — five exact pins, the npm bundle patch, the family icon, no lifecycle scripts')
