// Local checks borrow an installed DSH read-only; this helper is shipped for prepack.
import { createRequire, registerHooks } from 'node:module'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Compare canonical paths: a symlinked or junctioned checkout (pnpm stores, linked
// workspaces) would otherwise make this helper a silent no-op instead of a gate.
function sameFile(a, b) {
  try { return realpathSync(a) === realpathSync(b) } catch { return resolve(a) === resolve(b) }
}

function runtimeCandidates() {
  if (process.env.DSH_RUNTIME_ROOT) return [resolve(process.env.DSH_RUNTIME_ROOT, 'package.json')]
  const candidates = []
  try { candidates.push(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')) } catch {}
  for (const directory of [dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter).filter(Boolean)]) {
    candidates.push(resolve(directory, 'node_modules/@deepseek-ai/dsh/package.json'))
    candidates.push(resolve(directory, '../lib/node_modules/@deepseek-ai/dsh/package.json'))
  }
  return [...new Set(candidates)]
}

export function findDshRuntime(candidates = runtimeCandidates()) {
  for (const manifest of candidates) {
    if (!existsSync(manifest)) continue
    let info
    try { info = JSON.parse(readFileSync(manifest, 'utf8')) } catch { continue }
    if (info.name !== '@deepseek-ai/dsh') continue
    const require = createRequire(pathToFileURL(manifest))
    const modules = new Map()
    try {
      for (const name of ['yaml', '@deepseek-ai/dsh-skill', '@deepseek-ai/cordis', '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-skill-filesystem', '@deepseek-ai/dsh-agent-preset']) {
        modules.set(name, pathToFileURL(require.resolve(name)).href)
      }
    } catch { continue }
    return { root: dirname(manifest), version: info.version, modules }
  }
}

export const dshRuntime = findDshRuntime()
if (process.env.DSH_RUNTIME_ROOT && !dshRuntime) throw new Error('DSH_RUNTIME_ROOT must point to an installed DSH with its skill dependencies.')
if (dshRuntime) {
  // Resolve every URL before registering: require.resolve inside this hook would recurse.
  registerHooks({ resolve(specifier, context, nextResolve) {
    if (dshRuntime.modules.has(specifier)) return { url: dshRuntime.modules.get(specifier), shortCircuit: true }
    return nextResolve(specifier, context)
  } })
}

const main = Boolean(process.argv[1]) && sameFile(process.argv[1], fileURLToPath(import.meta.url))
if (!dshRuntime) {
  const message = 'Cannot locate an installed DSH. Install its CLI on PATH or optionally set DSH_RUNTIME_ROOT to its package directory.'
  if (main && process.argv.includes('--write-manifest')) console.warn(`SKIPPED Superpowers prepack authoring gate: ${message} Payload manifest was not regenerated; this package is not release-verified.`)
  else throw new Error(message)
} else if (main) {
  await import('./check-package.mjs')
}
