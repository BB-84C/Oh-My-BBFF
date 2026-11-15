// check-package.mjs — the meta bundle's publish gate.
//
// A meta bundle has no runtime code, so the gate checks the three things that carry all of its
// effect: the manifest is a bundle, the dependency set pins exactly the five family packages to
// this release, and the patch inserts exactly their rows with the same id and inject list that
// each package's own patch uses (a divergence would create a duplicate loader row instead of
// converging in a mixed install).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = path => readFileSync(join(root, path), 'utf8')
const manifest = JSON.parse(read('package.json'))
const FAMILY = [
  'oh-my-bbff-widgets',
  'oh-my-bbff-team',
  'oh-my-bbff-memory',
  'oh-my-bbff-scope',
  'oh-my-bbff-superpowers'
]

// 1. manifest shape
assert.equal(manifest.name, 'oh-my-bbff', 'package name must be oh-my-bbff')
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'version must be semver')
assert.equal(manifest.license, 'MIT')
assert.equal(manifest.type, 'module')
assert.equal(manifest.main, './index.js')
assert.equal(manifest.engines?.dsh, '>=0.2.2-rc.2', 'engines.dsh must match the family baseline')
assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml', 'must declare dsh.bundle.patch')
assert.equal(manifest.repository?.url, 'git+https://github.com/BB-84C/Oh-My-BBFF.git')
assert.equal(manifest.repository?.directory, 'packages/oh-my-bbff')
assert.equal(manifest.homepage, 'https://github.com/BB-84C/Oh-My-BBFF#readme')
assert.equal(manifest.bugs?.url, 'https://github.com/BB-84C/Oh-My-BBFF/issues')
for (const file of ['index.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
  assert(manifest.files.includes(file), 'files must ship ' + file)
}
// The Plugins page renders a package icon from an exported ./icon (the mechanism Widgets and
// Superpowers use). The bundle reuses the family-root icon, no separate artwork.
assert.equal(manifest.exports?.['./icon'], './icon.svg', 'must export ./icon so the Plugins page shows the family icon')
assert(/^<svg[\s>]/.test(read('icon.svg').trim()), 'icon.svg must be an SVG document')
for (const script of ['prepack', 'check']) {
  assert.equal(manifest.scripts?.[script], 'node scripts/check-package.mjs', script + ' must run this gate')
}

// 2. the entry module is a no-op
const entry = read('index.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim()
assert.equal(entry, 'export {};', 'index.js must be an empty module (no runtime side effects)')

// 3. dependencies pin exactly the five family packages to this release
const deps = Object.entries(manifest.dependencies ?? {})
assert.deepEqual(deps.map(([name]) => name).sort(), [...FAMILY].sort(), 'dependencies must be exactly the five family packages')
for (const [name, range] of deps) {
  assert.equal(range, manifest.version, name + ' must be pinned exactly to the bundle release, like the official dsh bundles pin their packages')
}

// 4. patch rows: one per family package, same id/name/inject as that package's own row
const patchRows = rows(read('cordis.patch.yml'), 'cordis.patch.yml')
assert.deepEqual(patchRows.map(row => row.id), FAMILY, 'patch must insert the five rows in family order')
for (const row of patchRows) {
  const own = rows(read(join('..', row.id, 'cordis.patch.yml')), row.id + '/cordis.patch.yml')
  assert.equal(own.length, 1, row.id + ' must declare exactly one row in its own patch')
  assert.equal(row.name, own[0].name, row.id + ': name must match the package own row')
  assert.deepEqual(row.inject, own[0].inject, row.id + ': inject must match the package own row')
  const sibling = JSON.parse(read(join('..', row.id, 'package.json')))
  assert.equal(sibling.name, row.id)
  assert.equal(sibling.version, manifest.version, row.id + ' must be released at the same version as the bundle')
  assert.equal(sibling.dsh?.bundle?.patch, './cordis.patch.yml', row.id + ' must itself be a bundle')
}

// 5. docs exist and carry this release
assert(read('README.md').trim().length > 200, 'README.md must be a real page')
assert.match(read('CHANGELOG.md'), new RegExp('^## ' + manifest.version.replaceAll('.', '\\.') + ' ', 'm'), 'CHANGELOG.md must open with this release')

console.log('PASS oh-my-bbff meta bundle gate: bundle manifest, five exact pins, five patch rows matching each package own row, docs present at ' + manifest.version)

// A deliberately strict line parser: the patch format here is fixed, and a strict parse fails on
// any unexpected shape instead of silently accepting it.
function rows(text, label) {
  const lines = text.split(/\r?\n/)
  const result = []
  let current
  let inject
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (line === '- insert:') continue
    const id = line.match(/^ {4}- id: (\S+)$/)
    if (id) {
      if (current) result.push(current)
      current = { id: id[1], name: undefined, inject: [] }
      inject = undefined
      continue
    }
    if (!current) throw new Error(label + ': unexpected line outside a row: ' + line)
    const name = line.match(/^ {6}name: '([^']+)'$/)
    if (name) {
      if (current.name !== undefined) throw new Error(label + ': duplicate name in ' + current.id)
      current.name = name[1]
      continue
    }
    if (line === '      inject:') {
      if (inject) throw new Error(label + ': duplicate inject block in ' + current.id)
      inject = current.inject
      continue
    }
    const item = line.match(/^ {8}- (\S+)$/)
    if (item) {
      if (!inject) throw new Error(label + ': inject item before inject: in ' + current.id)
      inject.push(item[1])
      continue
    }
    if (/^ {6}\S/.test(line) || /^ {8}\S/.test(line)) throw new Error(label + ': unexpected row field: ' + line)
    throw new Error(label + ': unexpected line: ' + line)
  }
  if (current) result.push(current)
  for (const row of result) if (!row.name) throw new Error(label + ': row without name: ' + row.id)
  return result
}