/** Bounded Memory-owned polled DTOs; never native logs or accepted memory. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, resolve, isAbsolute, parse } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from './defaults.js'
const hash = value => createHash('sha256').update(value).digest('hex'), size = value => Buffer.byteLength(JSON.stringify(value), 'utf8')
export function createSessionCheckpointStore({ directory, getSettings, now = Date.now } = {}) {
  if (!directory) return null
  if (!isAbsolute(directory) || resolve(directory) === parse(resolve(directory)).root) throw new Error('Checkpoint directory must be an owned absolute non-drive-root path.')
  const pathOf = id => join(directory, hash(id) + '.json'), turns = DEFAULT_DATA.fields.routeWindowTurns.max
  function load(id) {
    const path = pathOf(id)
    if (!existsSync(path)) return null
    const maximum = getSettings().sessionReadCheckpointBytes
    if (statSync(path).size > maximum) throw new Error('Persisted polled checkpoint exceeds its published bound.')
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (value.owner !== 'oh-my-bbff-memory' || value.version !== 1 || value.sessionId !== id || !Number.isSafeInteger(value.cursor) || value.cursor < 0 || !Array.isArray(value.recent) || value.recent.length > turns || !Array.isArray(value.owned)) throw new Error('Invalid persisted polled checkpoint; recovery required, not full-log fallback.')
    for (const item of value.recent) if (!Number.isSafeInteger(item.seq) || item.seq < 0 || item.seq >= value.cursor || typeof item.digest !== 'string' || item.text !== undefined && (typeof item.text !== 'string' || hash(item.text) !== item.digest)) throw new Error('Persisted recent-text identity is invalid.')
    for (const frame of value.owned) if (!Number.isSafeInteger(frame.seq) || frame.seq < 0 || frame.seq >= value.cursor || !Number.isSafeInteger(frame.bytes) || frame.bytes < 0) throw new Error('Persisted owned-frame metadata is invalid.')
    return value
  }
  function save(id, state) {
    const settings = getSettings(), recent = state.recent.slice(-turns).map(fact => ({ seq: fact.value.seq, time: fact.value.time ?? null, text: fact.value.text, digest: fact.sourceDigest })), surface = null
    let owned = state.ownedList, ownedComplete = state.ownedComplete !== false
    const value = { owner: 'oh-my-bbff-memory', version: 1, sessionId: id, cursor: state.cursor, revision: state.revision === undefined ? null : String(state.revision), updatedAt: now(), recent, owned, ownedComplete }
    if (size(value) > settings.sessionReadCheckpointBytes) { value.recent = recent.map(({ text, ...item }) => item) }
    if (size(value) > settings.sessionReadCheckpointBytes) { const latest = new Map();for (const frame of owned) if (frame.component) latest.set(frame.component, frame);value.owned = [...latest.values()];value.ownedComplete = false }
    if (size(value) > settings.sessionReadCheckpointBytes) value.owned = value.owned.map(frame => ({ ...frame, trace: null }))
    if (size(value) > settings.sessionReadCheckpointBytes) throw new Error('Polled checkpoint metadata cannot fit its configured bound; existing checkpoint preserved.')
    mkdirSync(directory, { recursive: true });const target = pathOf(id), temp = target + '.' + randomUUID() + '.tmp'
    writeFileSync(temp, JSON.stringify(value), { flag: 'wx', encoding: 'utf8' });renameSync(temp, target)
    // Derived files are explicitly bounded by the same retained-root policy.
    const files = readdirSync(directory).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => ({ path: join(directory,name), at: statSync(join(directory,name)).mtimeMs })).sort((a,b)=>b.at-a.at)
    for (const entry of files.slice(settings.sessionReadMaxRoots)) { if (entry.path === target) continue;const old = JSON.parse(readFileSync(entry.path,'utf8'));if (old.owner === value.owner && old.version === 1) unlinkSync(entry.path) }
    return value
  }
  return Object.freeze({ load, save, directory })
}
