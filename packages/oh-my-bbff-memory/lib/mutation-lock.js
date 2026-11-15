/** Cooperative cross-process Memory writer exclusion. No waiting or foreign-lock age break. */
import { mkdirSync, writeFileSync, openSync, closeSync, readFileSync, unlinkSync } from 'node:fs'
import { join, resolve, relative, isAbsolute, sep, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from './defaults.js'
export function withMutationLock(paths, operation) {
  const root = resolve(paths.dreamingRoot), file = resolve(join(root, DEFAULT_DATA.storage.mutationLockFile)), inside = relative(root, file)
  if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep) || (paths.home && resolve(paths.home) === parse(resolve(paths.home)).root)) throw new Error('Unsafe Memory mutation lock target.')
  mkdirSync(root, { recursive: true })
  const token = randomUUID()
  let descriptor
  try { descriptor = openSync(file, 'wx') }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Memory writer lock is busy; retry after inspecting its owner. No foreign lock was removed: ' + file);throw error }
  try {
    writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid, at: Date.now() }) + '\n', 'utf8');closeSync(descriptor);descriptor = undefined
    return operation()
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    try { if (JSON.parse(readFileSync(file, 'utf8')).token === token) unlinkSync(file) } catch {}
  }
}
