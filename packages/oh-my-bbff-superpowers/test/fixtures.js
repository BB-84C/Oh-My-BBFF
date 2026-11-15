import assert from 'node:assert/strict'
import { after, before } from 'node:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = fileURLToPath(new URL('../', import.meta.url))

// Run in place from any checkout layout: a standalone package directory or
// <repo>/packages/<name> inside the monorepo. Walk up to the repository root,
// identified by pnpm-workspace.yaml, and fall back to the package's parent.
function findWorkspaceRoot(start) {
  let dir = resolve(start)
  for (let depth = 0; depth < 4; depth++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const next = dirname(dir)
    if (next === dir) break
    dir = next
  }
  return resolve(start, '..')
}
export const workspaceRoot = findWorkspaceRoot(packageRoot)
assert.notEqual(workspaceRoot, parse(workspaceRoot).root, 'workspace may not be a drive root')

// Fixtures live in one gitignored directory of the checkout: never inside the
// package tree, never in a shared system temp directory. An explicit override is
// accepted only when it stays inside that same artifact tree.
export const artifactsBase = join(workspaceRoot, '.test-artifacts')
const configuredArtifacts = process.env.BBFF_SUPERPOWERS_TEST_ARTIFACTS
export const artifactsRoot = resolve(configuredArtifacts || join(artifactsBase, 'superpowers'))
assert(isAbsolute(artifactsRoot), 'BBFF_SUPERPOWERS_TEST_ARTIFACTS must be an absolute path when it is set')
const taskDirectory = relative(artifactsBase, artifactsRoot)
assert(taskDirectory && taskDirectory !== '..' && !isAbsolute(taskDirectory) && !taskDirectory.startsWith(`..${sep}`), 'test artifacts must stay under <workspace>/.test-artifacts/')
const driveRoot = parse(packageRoot).root
let rootBefore
before(async () => {
  rootBefore = (await readdir(driveRoot)).sort()
  await mkdir(artifactsBase, { recursive: true })
  const actualBase = await realpath(artifactsBase)
  assert.equal(actualBase, resolve(await realpath(workspaceRoot), '.test-artifacts'), 'artifact base must not resolve outside the workspace artifact tree')
  let current = actualBase
  for (const segment of taskDirectory.split(sep)) {
    current = resolve(current, segment)
    try { await mkdir(current) } catch (error) { if (error.code !== 'EEXIST') throw error }
    assert.equal(await realpath(current), current, 'task root ancestors must not resolve outside the workspace artifact tree')
  }
})
after(async () => {
  const rootAfter = (await readdir(driveRoot)).sort()
  assert.deepEqual(rootAfter, rootBefore, 'tests must not add or remove drive-root entries')
  console.log(`Drive-root guard: before=${rootBefore.length}, after=${rootAfter.length}, unchanged=true`)
})

export async function fixture(t) {
  await mkdir(artifactsRoot, { recursive: true })
  const root = await mkdtemp(join(artifactsRoot, 'fixture-'))
  const owned = await realpath(root)
  t.after(async () => {
    const target = await realpath(root)
    const tail = relative(await realpath(artifactsRoot), target)
    assert.equal(target, owned)
    assert(tail && !tail.startsWith(`..${sep}`) && tail !== '..' && !isAbsolute(tail))
    await rm(target, { recursive: true })
  })
  return root
}

export async function put(root, path, content) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
  return target
}

export const skill = (name = 'fixture-skill', body = '# Fixture\n\nOriginal word.', description = 'Use when validating the bundled provider.') =>
  `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}\n`

export async function addSkill(root, body, description) {
  return put(root, 'skills/fixture-skill/SKILL.md', skill('fixture-skill', body, description))
}

export async function addPackage(root) {
  await put(root, 'package.json', JSON.stringify({ name: 'fixture-package', version: '0.1.0', files: ['index.js', 'skills/', 'payload-manifest.json'] }))
  await put(root, 'index.js', 'export function apply() {}\n')
  await addSkill(root)
}
