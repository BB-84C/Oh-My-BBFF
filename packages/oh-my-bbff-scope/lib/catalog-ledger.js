// Governance only. Discovery history is exclusively owned by the family catalog.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicJson, readJson, withFileLock } from './persistence.js'
import { isMessageRef } from './bbff-contract.js'

const copy = value => JSON.parse(JSON.stringify(value))
const keyOf = record => record.moduleId + '\0' + record.name
function recordsOf(value) {
  const records = value?.records || value?.exclusiveRecords || []
  if (!Array.isArray(records)) throw new Error('invalid governance records')
  return records.map(record => {
    const reasonOk = isMessageRef(record?.reason) || (typeof record?.reason === 'string' && !!record.reason.trim())
    if (!record || typeof record.name !== 'string' || typeof record.moduleId !== 'string' || !reasonOk || typeof record.lastDeclaredAt !== 'string') throw new Error('invalid governance record')
    // Old files repeatedly re-stamped lastDeclaredAt; they cannot prove the first declaration.
    return { ...record, firstDeclaredAt: Object.hasOwn(record, 'firstDeclaredAt') ? record.firstDeclaredAt : null, lastConfirmedAt: record.lastConfirmedAt || record.lastDeclaredAt }
  })
}
function apply(records, modules, at) {
  const result = new Map(records.map(record => [keyOf(record), { ...record }]))
  for (const module of modules) {
    const tools = new Set(module.exclusiveTools?.tools || [])
    for (const record of result.values()) if (record.moduleId === module.id && !tools.has(record.name) && !record.releasedAt && (record.lastConfirmedAt || '') <= at) record.releasedAt = at
    for (const name of tools) {
      const key = keyOf({ moduleId: module.id, name }), old = result.get(key)
      if ((old?.lastConfirmedAt || '') > at || (old?.releasedAt || '') > at) continue
      result.set(key, { name, moduleId: module.id, moduleTitle: module.title, reason: module.exclusiveTools.reason,
        ...(module.exclusiveTools.reasonLocales ? { reasonLocales: { ...module.exclusiveTools.reasonLocales } } : {}),
        firstDeclaredAt: old ? old.firstDeclaredAt : at, lastDeclaredAt: old?.lastDeclaredAt || at, lastConfirmedAt: at })
    }
  }
  return [...result.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
}
export function createGovernanceStore({ home, now = () => new Date().toISOString(), warn = () => {}, retryMs = 1000 }) {
  const dir = join(home, 'oh-my-bbff-scope'), file = join(dir, 'governance.json'), legacy = join(dir, 'catalog.json')
  let records = [], queue = Promise.resolve(), signature = '', diagnostic = null
  try {
    let data
    try { data = JSON.parse(readFileSync(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error; try { data = JSON.parse(readFileSync(legacy, 'utf8')) } catch (missing) { if (missing.code !== 'ENOENT') throw missing } }
    records = recordsOf(data)
  } catch (error) { diagnostic = error.bbffRef || ('Governance records unavailable: ' + error.message); warn(error.message) }
  function applyDeclarations(modules, { confirm = false } = {}) {
    const current = copy(modules), nextSignature = JSON.stringify(current), at = now()
    if (nextSignature === signature && !confirm) return
    signature = nextSignature
    records = apply(records, current, at) // synchronous dispatch barrier; persistence never blocks
    const seed = copy(records)
    queue = queue.catch(() => {}).then(() => withFileLock(file, async () => {
      const disk = await readJson(file, null)
      const committed = apply(disk ? recordsOf(disk) : seed, current, at)
      await atomicJson(file, { version: 1, records: committed })
      return committed
    }, retryMs)).then(committed => {
      const byKey = new Map(records.map(record => [keyOf(record), record]))
      const clock = record => [record.lastConfirmedAt || '', record.releasedAt || ''].sort().at(-1)
      for (const record of committed) {
        const local = byKey.get(keyOf(record))
        if (!local || clock(record) > clock(local) || clock(record) === clock(local) && record.releasedAt) byKey.set(keyOf(record), record)
      }
      records = [...byKey.values()]; diagnostic = null
    }).catch(error => { diagnostic = error.bbffRef || error.message; warn(error.message) })
  }
  return { file, applyDeclarations, exclusives: () => copy(records), diagnostics: () => diagnostic ? [diagnostic] : [], flush: () => queue }
}
