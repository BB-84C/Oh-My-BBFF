/** Managed preset budget: generated from INSTALLED bytes by text projection only.
 * No profile write at startup, no preset copy frozen into the profile.
 *
 * A fresh profile has no managed block yet. That is a normal "not configured" state, not
 * a failure: `status()` reports it as such (with the installed presets' own cap as a
 * suggestion and the action that configures it) so no raw error key ever reaches the UI.
 *
 * Drift is decided SEMANTICALLY (`lib/yaml-preset.js`): DSH re-serializes the profile patch
 * and may re-wrap long scalars, which is not a change in the declared presets.
 */
import { readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { msg } from './host-ref.js'
import { localeError, messageOf } from './locale-message.js'
import { comparePresetEntries, parsePresetEntries } from './yaml-preset.js'
const OPEN = '# >>> oh-my-bbff-memory:preset-budget'
const CLOSE = '# <<< oh-my-bbff-memory:preset-budget'
const NAME = /^\s*name:\s*['"]?@deepseek-ai\/dsh-agent-instructions['"]?\s*$/
/** Marker on the thrown error that means "this profile has no managed cap yet". */
const NOT_CONFIGURED = 'preset-budget-not-configured'
export const MANAGED_BUDGET_SOURCE = 'memory-managed-presets'
const digest = value => createHash('sha256').update(value).digest('hex')
const normalize = text => text.replaceAll('\r\n', '\n').replace(/^\uFEFF/, '')
const indentOf = line => line.length - line.trimStart().length

/**
 * Caps declared by the managed region's own instruction entries. A patch entry DSH appended
 * inside the region (e.g. the `locale` preference) is not part of the projection and its
 * numbers never count. An unparseable region still reports the cap the user wrote.
 */
function managedCaps(region) {
  if (region === null) return []
  const values = []
  const walk = value => {
    if (Array.isArray(value)) { for (const item of value) walk(item); return }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) { if (key === 'maxBytes' && Number.isSafeInteger(item)) values.push(item); else walk(item) }
  }
  const declaresInstructions = value => Array.isArray(value) ? value.some(declaresInstructions)
    : !value || typeof value !== 'object' ? false
    : typeof value.name === 'string' && value.name.includes('dsh-agent-instructions') ? true : Object.values(value).some(declaresInstructions)
  try {
    for (const entry of parsePresetEntries(region)) if (declaresInstructions(entry)) walk(entry)
    return [...new Set(values)]
  } catch { return [...new Set([...region.matchAll(/maxBytes:\s*(\d+)/g)].map(match => Number(match[1])))] }
}

/**
 * Find the instruction entry of an installed preset patch and its declared `maxBytes`.
 * Shared by the projection and by the fresh-profile suggestion so both read one way.
 */
function locate(file) {
  const bytes = readFileSync(file), text = normalize(bytes.toString('utf8')), lines = text.split('\n'), start = lines.indexOf('- insert:')
  if (start < 0) throw new Error('Installed preset has no `- insert:` envelope: ' + file)
  const raw = lines.slice(start + 1), content = raw.filter(line => line.trim() && !/^\s*#/.test(line))
  if (!content.length) throw new Error('Installed preset insert list is empty: ' + file)
  const base = Math.min(...content.map(indentOf))
  const body = raw.map(line => !line.trim() ? '' : indentOf(line) >= base ? line.slice(base) : line.trimEnd())
  const at = body.findIndex(line => NAME.test(line))
  if (at < 0) return { body, found: false, maxBytesIndex: -1, maxBytes: null }
  const headerIndent = indentOf(body[at])
  for (let index = at + 1; index < body.length; index++) {
    const line = body[index]
    if (!line.trim()) continue
    // A new plugin row ends the current entry; `config:` shares the name's indent.
    if (/^\s*- id:/.test(line) && indentOf(line) <= headerIndent) break
    if (/^\s*maxBytes:\s*\d+\s*$/.test(line)) return { body, found: true, maxBytesIndex: index, maxBytes: Number(/maxBytes:\s*(\d+)/.exec(line)[1]) }
  }
  return { body, found: true, maxBytesIndex: -1, maxBytes: null }
}

function project(file, maxBytes) {
  const found = locate(file)
  if (!found.found) return null
  if (found.maxBytesIndex < 0) throw new Error('Installed preset must declare exactly one instruction maxBytes: ' + file)
  found.body[found.maxBytesIndex] = found.body[found.maxBytesIndex].replace(/maxBytes:\s*\d+/, 'maxBytes: ' + maxBytes)
  return found.body.join('\n').trimEnd()
}

export function installedPresetBudget({ presetDirectory, maxBytes }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('maxBytes must be a nonnegative integer.')
  const files = [], fragments = []
  for (const name of readdirSync(presetDirectory).filter(name => name.endsWith('.patch.yml')).sort()) {
    const file = join(presetDirectory, name), bytes = readFileSync(file), fragment = project(file, maxBytes)
    if (fragment === null) continue
    fragments.push(fragment);files.push({ path: file, sha256: digest(bytes) })
  }
  if (!files.length) throw new Error('No installed instruction preset declarations were found.')
  return { block: [OPEN + ' (generated from installed DSH presets; explicit preview/apply only)', '# maxBytes applies independently to the global and project instruction chains.', ...fragments, CLOSE].join('\n'), files, maxBytes, perChainMaxBytes: maxBytes, combinedChainCeilingBytes: maxBytes * 2 }
}

/** The cap the installed presets declare today: the honest suggestion for a fresh profile. */
export function declaredPresetBudget({ presetDirectory }) {
  const values = []
  for (const name of readdirSync(presetDirectory).filter(name => name.endsWith('.patch.yml')).sort()) {
    const found = locate(join(presetDirectory, name))
    if (found.found && found.maxBytes !== null) values.push(found.maxBytes)
  }
  return { maxBytes: values.length && new Set(values).size === 1 ? values[0] : null, values }
}

function splitManaged(text) {
  const lines = normalize(text).split('\n'), open = lines.map((line, i) => line.startsWith(OPEN) ? i : -1).filter(i => i >= 0), close = lines.map((line, i) => line.startsWith(CLOSE) ? i : -1).filter(i => i >= 0)
  if (!open.length && !close.length) return { before: lines.join('\n').trimEnd(), body: null, after: '' }
  if (open.length !== 1 || close.length !== 1 || close[0] <= open[0]) throw new Error('Managed budget block markers are ambiguous; no rewrite is safe.')
  return { before: lines.slice(0, open[0]).join('\n'), body: lines.slice(open[0] + 1, close[0]).join('\n'), after: lines.slice(close[0] + 1).join('\n') }
}

/** Atomic replacement without a profile-wide lock dependency; a crash leaves the old file. */
function writeAtomic(path, content) {
  const temporary = path + '.' + process.pid + '.' + randomUUID() + '.tmp'
  try { writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });renameSync(temporary, path) }
  catch (error) { try { unlinkSync(temporary) } catch {} ; throw error }
}

export function createPresetBudgetManager({ getProfile, getPresetDirectory = () => join(dirname(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-web-app/package.json'))), 'presets') }) {
  function inspect(maxBytes) {
    const profile = getProfile()
    if (!profile?.patchPath || !profile?.dir) throw localeError(msg('error.presetProfileUnavailable'))
    const path = resolve(profile.patchPath), before = readFileSync(path, 'utf8'), parts = splitManaged(before)
    if (maxBytes === undefined) {
      const caps = managedCaps(parts.body)
      if (caps.length !== 1) throw Object.assign(localeError(msg('error.presetNoCap')), { code: NOT_CONFIGURED })
      maxBytes = caps[0]
    }
    const installed = installedPresetBudget({ presetDirectory: getPresetDirectory(), maxBytes })
    const generated = installed.block.split('\n').filter(line => !line.startsWith(OPEN) && !line.startsWith(CLOSE)).join('\n')
    // Semantic, not textual: DSH re-serializes this file and re-wraps long scalars, which is
    // not a change in the declared presets. Entries the projection does not own are kept.
    let comparison = { equal: false, foreign: [] }
    if (parts.body !== null) { try { comparison = comparePresetEntries(parts.body, generated) } catch { comparison = { equal: false, foreign: [] } } }
    const drift = parts.body === null || !comparison.equal
    // A patch entry DSH appended inside the managed region belongs to the profile, not to the
    // budget: keep it below the block instead of deleting it on the next apply.
    const kept = comparison.foreign.join('\n\n').trim()
    const after = [kept, parts.after.trimStart()].filter(part => part && part.trim()).join('\n\n')
    const content = [parts.before.trimEnd(), installed.block, after].filter(Boolean).join('\n') + '\n'
    return { path, before, content, installed, drift, managed: parts.body !== null, maxBytes, keptEntries: comparison.foreign.length, previewToken: digest(JSON.stringify({ path, before, content, files: installed.files })) }
  }
  function suggestion() { try { return declaredPresetBudget({ presetDirectory: getPresetDirectory() }).maxBytes } catch { return null } }
  /** Neutral fresh-profile state: nothing is wrong, the managed block simply does not exist yet. */
  function notConfigured() {
    return { available: false, configured: false, state: 'not-configured', sourceId: MANAGED_BUDGET_SOURCE, drift: null, managed: false, maxBytes: null, perChainMaxBytes: null, combinedChainCeilingBytes: null, installedPresets: [], suggestedMaxBytes: suggestion(), reason: msg('preset.state.notConfigured'), action: msg('preset.action.configure') }
  }
  function status() {
    try {
      const value = inspect()
      return { available: true, configured: true, state: 'configured', sourceId: MANAGED_BUDGET_SOURCE, drift: value.drift, managed: value.managed, maxBytes: value.maxBytes, perChainMaxBytes: value.maxBytes, combinedChainCeilingBytes: value.maxBytes * 2, installedPresets: value.installed.files, suggestedMaxBytes: null, action: null, reason: value.drift ? msg('preset.reason.drift') : msg('preset.reason.matched') }
    } catch (error) {
      if (error?.code === NOT_CONFIGURED) return notConfigured()
      return { available: false, configured: null, state: 'unavailable', sourceId: MANAGED_BUDGET_SOURCE, drift: null, managed: null, maxBytes: null, perChainMaxBytes: null, combinedChainCeilingBytes: null, installedPresets: [], suggestedMaxBytes: null, action: null, reason: messageOf(error) }
    }
  }
  function preview({ maxBytes } = {}) {
    const value = inspect(maxBytes)
    return { sourceId: MANAGED_BUDGET_SOURCE, maxBytes: value.maxBytes, before: value.maxBytes, drift: value.drift, previewToken: value.previewToken, path: value.path, installedPresets: value.installed.files, perChainMaxBytes: value.maxBytes, combinedChainCeilingBytes: value.maxBytes * 2, content: value.content, copyingInherited: false, restartRequired: true, keptEntries: value.keptEntries, appliesTo: msg('preset.appliesTo') }
  }
  async function apply(input) {
    const value = inspect(input.maxBytes)
    if (input.previewToken !== value.previewToken) throw localeError(msg('error.presetStale'))
    writeAtomic(value.path, value.content)
    return { ...preview(input), applied: true, restartRequired: true }
  }
  return { status, preview, apply }
}
