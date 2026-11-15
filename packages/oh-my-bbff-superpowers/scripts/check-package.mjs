import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildPayloadManifest, inspectPackage, verifyPackedInventory } from './package-gate.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const release = process.argv.includes('--release')
const result = await inspectPackage(root, { release })
if (result.errors.length) {
  console.error(result.errors.join('\n'))
  process.exitCode = 1
} else {
  const manifest = await buildPayloadManifest(root)
  const target = new URL('../payload-manifest.json', import.meta.url)
  if (process.argv.includes('--write-manifest')) await writeFile(target, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  if (process.argv.includes('--verify-manifest')) assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), manifest, 'payload manifest is stale')
  const packlistIndex = process.argv.indexOf('--verify-packlist')
  if (packlistIndex !== -1) {
    assert(process.argv[packlistIndex + 1], '--verify-packlist requires an npm pack --json inventory path')
    verifyPackedInventory(manifest, JSON.parse(await readFile(process.argv[packlistIndex + 1], 'utf8')))
  }
  console.log(JSON.stringify({ gate: release ? 'release' : 'draft', ...result, payloadFiles: manifest.files.length, manifest: process.argv.includes('--write-manifest') ? 'written' : 'not modified' }, null, 2))
}
