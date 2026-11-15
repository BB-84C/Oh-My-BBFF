import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { msg } from './bbff-contract.js'

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}
export async function atomicJson(file, value) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = file + '.' + randomUUID() + '.tmp'
  const handle = await open(temporary, 'wx')
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8') } finally { await handle.close() }
  try { await rename(temporary, file) } catch (error) { await unlink(temporary).catch(() => {}); throw error }
}
/** Cooperative scoped lock. Never guesses owner death/age and never blocks the host thread. */
export async function withFileLock(file, operation, retryMs = 1000) {
  await mkdir(dirname(file), { recursive: true })
  const lock = file + '.lock', until = Date.now() + retryMs
  let handle
  const token = randomUUID()
  for (;;) {
    try { handle = await open(lock, 'wx'); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (Date.now() >= until) {
        const owner = await readJson(lock, null).catch(() => null)
        const error = new Error('Scope storage busy'); error.bbffRef = msg('error.storageBusy', { lock, pid: owner?.pid || 'unknown' })
        error.code = 'SCOPE_STORAGE_BUSY'; throw error
      }
      await delay(20)
    }
  }
  try { await handle.writeFile(JSON.stringify({ token, pid: process.pid }), 'utf8'); return await operation() }
  finally {
    await handle.close()
    const owner = await readJson(lock, null).catch(() => null)
    if (owner?.token === token) await unlink(lock)
  }
}
