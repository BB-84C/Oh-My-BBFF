import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { SCOPE_DISPLAY_LABEL_DEFAULTS, normalizeDisplayLabels } from './settings-metadata.js'
import { msg } from './bbff-contract.js'

/** Display-label defaults are message refs; only user-edited labels are text. */
export const SCOPE_DEFAULTS = Object.freeze({ unknownCwd: 'open', showDiagnostics: false, displayLabels: SCOPE_DISPLAY_LABEL_DEFAULTS })
const object = value => !!value && typeof value === 'object' && !Array.isArray(value)
const fail = key => { const error = new Error(key); error.bbffRef = msg(key); throw error }
function normalize(value) {
  if (!object(value) || Object.keys(value).some(key => !Object.hasOwn(SCOPE_DEFAULTS, key))) fail('error.settingsInvalid')
  const next = {}
  if (Object.hasOwn(value, 'unknownCwd')) { if (!['open', 'hide-all'].includes(value.unknownCwd)) fail('error.settingsUnknownCwd'); next.unknownCwd = value.unknownCwd }
  if (Object.hasOwn(value, 'showDiagnostics')) { if (typeof value.showDiagnostics !== 'boolean') fail('error.settingsDiagnostics'); next.showDiagnostics = value.showDiagnostics }
  if (Object.hasOwn(value, 'displayLabels')) next.displayLabels = normalizeDisplayLabels(value.displayLabels)
  return next
}
export function createScopeSettings(dir) {
  const file = join(dir, 'settings.json')
  const raw = () => { try { return readFileSync(file, 'utf8') } catch (error) { if (error.code === 'ENOENT') return ''; throw error } }
  const revision = () => createHash('sha256').update(raw()).digest('hex')
  /** Shipped label texts per path: a stored label equal to any of them is the default. */
  const SHIPPED_LABELS = (() => {
    try {
      const read = language => JSON.parse(readFileSync(new URL('../locale/' + language + '.json', import.meta.url), 'utf8')).ui
      const en = read('en'), zh = read('zh'), map = new Map()
      for (const key of Object.keys(en)) if (key.startsWith('label.')) map.set(key.slice('label.'.length), new Set([en[key], zh[key]]))
      return map
    } catch { return new Map() }
  })()
  /** A stored label that equals a shipped dictionary text is the default, not an override. */
  const withoutShippedDefaults = labels => {
    const kept = {}
    for (const [path, text] of Object.entries(labels || {})) {
      if (SHIPPED_LABELS.get(path)?.has(text)) continue
      kept[path] = text
    }
    return kept
  }
  /** Stored labels only: defaults stay refs in code and are never written to disk. */
  const storedLabels = () => { try { const text = raw(); const data = text ? JSON.parse(text) : null; return object(data?.displayLabels) ? data.displayLabels : {} } catch { return {} } }
  function read() {
    const text = raw()
    // No document yet: the in-code defaults are message refs and are never
    // validated as stored text. An existing document must still supply its
    // availability policy; additive presentation defaults never repair it.
    if (!text) return { ...SCOPE_DEFAULTS, displayLabels: { ...SCOPE_DISPLAY_LABEL_DEFAULTS } }
    const data = JSON.parse(text)
    if (!object(data) || !Object.hasOwn(data, 'unknownCwd')) fail('error.settingsInvalid')
    const normalized = normalize(data)
    const overrides = withoutShippedDefaults(normalized.displayLabels)
    return { ...SCOPE_DEFAULTS, ...normalized, displayLabels: { ...SCOPE_DISPLAY_LABEL_DEFAULTS, ...overrides } }
  }
  function save(value, expectedRevision) {
    if (expectedRevision !== undefined && expectedRevision !== revision()) fail('error.settingsRevision')
    const patch = normalize(value), current = read()
    const next = { ...current, ...patch, displayLabels: { ...current.displayLabels, ...patch.displayLabels } }
    const document = { ...next, displayLabels: { ...storedLabels(), ...patch.displayLabels } }
    mkdirSync(dir, { recursive: true })
    const temporary = file + '.' + randomUUID() + '.tmp'
    writeFileSync(temporary, JSON.stringify(document, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, file)
    return read()
  }
  return { read, save, revision, defaults: SCOPE_DEFAULTS }
}
