import { randomUUID, createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { validateDocument, validateRule } from './rules.js'
import { reservedTool } from './dsh-adapter.js'
import { msg } from './bbff-contract.js'

const encode = value => JSON.stringify(value, null, 2) + '\n'
const hash = text => createHash('sha256').update(text || '').digest('hex')
export function createRuleStore({ home, platform = process.platform } = {}) {
  const dir = join(home, 'oh-my-bbff-scope'), historyDir = join(dir, '.history')
  const file = join(dir, 'rules.json'), changelog = join(dir, 'changelog.jsonl')
  let queue = Promise.resolve()
  let validateUpsert = candidate => {
    const reserved = candidate.kind !== 'skill' && reservedTool(candidate.name)
    if (reserved) throw new Error(reserved.reason)
  }
  function raw() { try { return readFileSync(file, 'utf8') } catch (error) { if (error.code === 'ENOENT') return ''; throw error } }
  function read() { const text = raw(); return text.trim() ? validateDocument(JSON.parse(text), platform) : { version: 1, rules: [] } }
  function atomic(target, text) {
    const temporary = target + '.' + randomUUID() + '.tmp'
    writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' })
    try { renameSync(temporary, target) } catch (error) { try { unlinkSync(temporary) } catch {} ; throw error }
  }
  function history() {
    if (!existsSync(changelog)) return []
    return readFileSync(changelog, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).reverse()
  }
  function commit(action, transform, expectedRevision) {
    const operation = queue.then(() => {
      const before = raw(), previous = read()
      if (expectedRevision !== undefined && expectedRevision !== hash(before)) { const error = new Error('error.rulesRevision'); error.bbffRef = msg('error.rulesRevision'); throw error }
      const next = validateDocument(transform(previous), platform)
      const after = encode(next)
      if (encode(previous) === after) return { changed: false, document: previous }
      const id = randomUUID(), at = new Date().toISOString()
      mkdirSync(historyDir, { recursive: true })
      // Snapshot and audit intent precede the atomic replacement. A process crash
      // can leave a prepared entry, but can never lose the before-image.
      atomic(join(historyDir, id + '.json'), encode({ id, at, action, before: previous, after: next }))
      appendFileSync(changelog, JSON.stringify({ id, at, action, beforeSha256: hash(before), afterSha256: hash(after), phase: 'prepared' }) + '\n', 'utf8')
      atomic(file, after)
      appendFileSync(changelog, JSON.stringify({ id, at, action, beforeSha256: hash(before), afterSha256: hash(after), phase: 'committed' }) + '\n', 'utf8')
      return { changed: true, id, document: next }
    })
    queue = operation.catch(() => {})
    return operation
  }
  function upsert(rule, expectedRevision) {
    const candidate = validateRule({ ...rule, id: rule?.id || randomUUID() }, platform)
    return commit('upsert', previous => {
      validateUpsert(candidate)
      const found = previous.rules.findIndex(value => value.id === candidate.id)
      if (rule?.id && found < 0) { const error = new Error('error.unknownRule'); error.bbffRef = msg('error.unknownRule'); throw error }
      const rules = previous.rules.slice()
      if (found < 0) rules.push(candidate); else rules[found] = candidate
      return { version: 1, rules }
    }, expectedRevision)
  }
  function remove(id, expectedRevision) {
    return commit('delete', previous => {
      if (!previous.rules.some(rule => rule.id === id)) { const error = new Error('error.unknownRule'); error.bbffRef = msg('error.unknownRule'); throw error }
      return { version: 1, rules: previous.rules.filter(rule => rule.id !== id) }
    }, expectedRevision)
  }
  function revert(id, expectedRevision) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) { const error = new Error('error.historyId'); error.bbffRef = msg('error.historyId'); throw error }
    if (!history().some(entry => entry.id === id && entry.phase === 'committed')) { const error = new Error('error.historyNotCommitted'); error.bbffRef = msg('error.historyNotCommitted'); throw error }
    const snapshot = JSON.parse(readFileSync(join(historyDir, id + '.json'), 'utf8'))
    return commit('revert:' + id, () => snapshot.before, expectedRevision)
  }
  function historyPage({ offset = 0, limit = 20 } = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) { const error = new Error('error.historyPage'); error.bbffRef = msg('error.historyPage'); throw error }
    const committed = history().filter(entry => entry.phase === 'committed')
    const entries = committed.slice(offset, offset + limit).map(entry => {
      try {
        if (typeof entry.id !== 'string' || !/^[a-f0-9-]{36}$/.test(entry.id)) throw new Error('invalid history snapshot id')
        const snapshot = JSON.parse(readFileSync(join(historyDir, entry.id + '.json'), 'utf8'))
        const before = validateDocument(snapshot.before, platform), after = validateDocument(snapshot.after, platform)
        const ids = new Set([...before.rules, ...after.rules].map(rule => rule.id))
        const changes = [...ids].map(id => ({ before: before.rules.find(rule => rule.id === id) || null, after: after.rules.find(rule => rule.id === id) || null }))
          .filter(change => JSON.stringify(change.before) !== JSON.stringify(change.after))
        return { ...entry, ruleNames: [...new Set(changes.flatMap(change => [change.before?.name, change.after?.name]).filter(Boolean))], changes, wholeFileRevert: true }
      } catch (error) {
        return { ...entry, ruleNames: [], changes: [], wholeFileRevert: true, diagnostic: msg('diagnostic.historySnapshot', { message: error.message }) }
      }
    })
    return { entries, total: committed.length, offset, limit, nextOffset: offset + entries.length < committed.length ? offset + entries.length : null }
  }
  return { file, dir, read, revision: () => hash(raw()), upsert, remove, revert, historyPage,
    setRuleValidator: validator => { validateUpsert = validator },
    history: () => historyPage().entries }
}
