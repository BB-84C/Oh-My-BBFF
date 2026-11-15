#!/usr/bin/env node
/**
 * Migrate the opencode global memory store into this machine's DSH home.
 *
 *   node scripts/migrate-opencode.mjs              # dry run
 *   node scripts/migrate-opencode.mjs --apply      # copy
 *   node scripts/migrate-opencode.mjs --apply --workspace <workspace>
 *
 * What it copies:
 *   ~/.config/opencode/memory/*.md  ->  $DSH_HOME/memory/*.md
 *   ~/.config/opencode/AGENTS.md    ->  $DSH_HOME/AGENTS.md
 *
 * Workspace memory is NOT copied by default: DSH reads .opencode/memory in place
 * (compat dir). Pass --workspace to opt into copying one workspace's
 * .opencode/memory into <workspace>/.dsh/memory.
 *
 * Idempotent: identical files are skipped; a differing destination gets a
 * `<name>.bak.<timestamp>` backup before it is replaced.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const opencodeHome = process.env.OPENCODE_HOME || join(homedir(), '.config', 'opencode')
const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const workspaceIndex = args.indexOf('--workspace')
const workspace = workspaceIndex >= 0 ? args[workspaceIndex + 1] : null

const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex')
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

const plan = []

function planFile(label, src, dest) {
  if (!existsSync(src)) {
    plan.push({ label, src, dest, action: 'missing-source', bytes: 0 })
    return
  }
  const source = readFileSync(src)
  if (!existsSync(dest)) {
    plan.push({ label, src, dest, action: 'create', bytes: source.length })
    return
  }
  const target = readFileSync(dest)
  if (sha1(source) === sha1(target)) {
    plan.push({ label, src, dest, action: 'same', bytes: source.length })
    return
  }
  plan.push({ label, src, dest, action: 'backup-replace', bytes: source.length, backup: `${dest}.bak.${stamp()}` })
}

function planDirectory(label, srcDir, destDir) {
  if (!existsSync(srcDir)) {
    plan.push({ label, src: srcDir, dest: destDir, action: 'missing-source', bytes: 0 })
    return
  }
  const files = readdirSync(srcDir).filter((name) => name.endsWith('.md')).sort()
  for (const file of files) planFile(`${label}/${file}`, join(srcDir, file), join(destDir, file))
}

// ---- build the plan -------------------------------------------------------
planDirectory('global-memory', join(opencodeHome, 'memory'), join(dshHome, 'memory'))
planFile('global-agents-md', join(opencodeHome, 'AGENTS.md'), join(dshHome, 'AGENTS.md'))
if (workspace) {
  planDirectory(
    'workspace-memory',
    join(workspace, '.opencode', 'memory'),
    join(workspace, '.dsh', 'memory'),
  )
}

// ---- report / apply -------------------------------------------------------
const changes = plan.filter((item) => item.action !== 'same' && item.action !== 'missing-source')
const bytes = changes.reduce((sum, item) => sum + item.bytes, 0)

console.log(`opencode home: ${opencodeHome}`)
console.log(`dsh home:      ${dshHome}`)
console.log(apply ? 'mode:          APPLY' : 'mode:          DRY RUN (pass --apply to copy)')
console.log('')
for (const item of plan) {
  const rel = item.dest.replace(dshHome, '$DSH_HOME')
  console.log(`  ${item.action.padEnd(14)} ${rel}${item.action === 'backup-replace' ? `  (backup -> ${basename(item.backup)})` : ''}`)
}
console.log('')
console.log(`${plan.length} entries, ${changes.length} to write, ${bytes} bytes`)

if (!apply) {
  console.log('dry run only; re-run with --apply to write')
  process.exit(0)
}

for (const item of plan) {
  if (item.action === 'same' || item.action === 'missing-source') continue
  mkdirSync(dirname(item.dest), { recursive: true })
  if (item.action === 'backup-replace') {
    copyFileSync(item.dest, item.backup)
    console.log(`  backed up ${item.dest} -> ${item.backup}`)
  }
  writeFileSync(item.dest, readFileSync(item.src))
}
console.log('done')
