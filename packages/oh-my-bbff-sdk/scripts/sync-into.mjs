// Copy the authoritative contract runtime into a consumer bundle
// (`<target>/lib/bbff-contract.js`) and report the sha256. First-party bundles
// vendor this file byte-for-byte so profile installs need no runtime deps.
//
//   node scripts/sync-into.mjs --target packages/oh-my-bbff-widgets
//   node scripts/sync-into.mjs --check --target packages/oh-my-bbff-memory
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sdkRoot = resolve(here, '..')
// [source, destination] pairs relative to the SDK root and the target bundle.
// `lib/bbff-sdk-locale/` carries the SDK-owned dictionaries (namespace
// `oh-my-bbff-sdk`) so a bundle can register them without a package dependency.
const files = [
  ['contract.js','bbff-contract.js'],
  ['dsh-adapter.js','dsh-adapter.js'],
  ['locale/en.json','bbff-sdk-locale/en.json'],
  ['locale/zh.json','bbff-sdk-locale/zh.json'],
]

const args = process.argv.slice(2)
const check = args.includes('--check')
const targetIndex = args.indexOf('--target')
if (targetIndex === -1 || !args[targetIndex + 1]) {
  console.error('usage: node scripts/sync-into.mjs [--check] --target <bundle-dir>')
  process.exit(2)
}
const rawTarget = args[targetIndex + 1]
if (process.platform === 'win32' && /^\/(?!\/)/.test(rawTarget)) {
  console.error('Refusing POSIX-style absolute target on Windows'); process.exit(2)
}
const target = resolve(rawTarget)
if (!existsSync(join(target,'package.json'))) {
  console.error('Target must be an existing bundle with package.json'); process.exit(2)
}
const realTarget = realpathSync(target)
const forbidden = process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA,'Temp','opencode').toLowerCase() : null
if (realTarget === parse(realTarget).root || (forbidden && (realTarget.toLowerCase() === forbidden || realTarget.toLowerCase().startsWith(forbidden + '\\')))) {
  console.error('Refusing drive-root or forbidden system-temp target'); process.exit(2)
}
for (const [sourceName] of files) {
  if (!existsSync(join(sdkRoot,sourceName))) { console.error('Canonical runtime is incomplete: ' + sourceName); process.exit(2) }
}
let failed = false
for (const [sourceName,destinationName] of files) {
  const source = join(sdkRoot,sourceName), destination = join(realTarget,'lib',destinationName)
  if (!existsSync(source)) { console.error('Canonical runtime is incomplete: ' + sourceName); process.exit(2) }
  const sha = createHash('sha256').update(readFileSync(source)).digest('hex')
  if (check) {
    if (!existsSync(destination)) { console.error(`MISSING ${destination}`); failed = true; continue }
    const installed = createHash('sha256').update(readFileSync(destination)).digest('hex')
    if (installed !== sha) { console.error(`MISMATCH ${destination}\n  sdk:      ${sha}\n  consumer: ${installed}`); failed = true; continue }
    console.log(`OK ${destination} sha256=${sha}`)
  } else {
    mkdirSync(dirname(destination),{recursive:true})
    copyFileSync(source,destination)
    console.log(`synced ${destination} sha256=${sha}`)
  }
}
process.exitCode = failed ? 1 : 0
