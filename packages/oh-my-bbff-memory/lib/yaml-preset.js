/**
 * Semantic comparison for the managed preset-budget block.
 *
 * DSH parses and re-serializes the profile patch with js-yaml and its own patch dialect
 * (`JSON_SCHEMA` plus a `!!js` scalar that keeps the expression text), so a *text*
 * comparison reports drift after DSH merely re-wraps a long scalar. Both sides are parsed
 * with that same dialect here and compared as values: folding, reflow, quoting style and
 * comments cannot matter, while a real content change in the installed presets still does.
 *
 * The profile patch is also where DSH appends its own entries (for example the `locale`
 * preference). An entry that the projection does not own may end up inside the managed
 * markers; it is the user's patch, never a preset change, and the caller keeps it.
 *
 * The parser is vendored (see `lib/vendor/js-yaml/`): a profile install cannot resolve
 * host packages from a plugin, so importing js-yaml at runtime would fail on a user machine.
 */
import * as yaml from './vendor/js-yaml/js-yaml.mjs'

/** DSH's `!!js` scalar: the expression text is kept as written, on both sides. */
const JsExpression = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: data => typeof data === 'string',
  construct: data => ({ __jsExpr: data }),
  predicate: value => !!value && typeof value === 'object' && typeof value.__jsExpr === 'string',
  represent: data => data.__jsExpr,
})

/** The profile-patch dialect DSH reads and writes. */
export const ENTRY_LIST_SCHEMA = yaml.JSON_SCHEMA.extend(JsExpression)

/** Parse a patch fragment into its declared entries (comments and formatting are not values). */
export function parsePresetEntries(text) {
  const value = yaml.load(String(text ?? ''), { schema: ENTRY_LIST_SCHEMA })
  return value === undefined || value === null ? [] : value
}

/**
 * `maxBytes` is the one declaration preview/apply is allowed to change; a different cap is
 * a requested change, not drift in the installed presets.
 */
function withoutBudget(value) {
  if (Array.isArray(value)) return value.map(withoutBudget)
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, item] of Object.entries(value)) result[key] = key === 'maxBytes' ? 0 : withoutBudget(item)
  return result
}

/** Stable comparison form: mapping order cannot matter, sequence order can. */
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (!value || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value)
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
}

/** True when two parsed declarations carry the same values (budget numbers excepted). */
export function samePresetValue(left, right) {
  return canonical(withoutBudget(left)) === canonical(withoutBudget(right))
}

/** Split a patch fragment into top-level entry texts, keeping each entry's own lines (and the comments directly above it). */
export function splitTopLevelEntries(text) {
  const segments = []
  let current = null, pending = []
  for (const line of String(text ?? '').replaceAll('\r\n', '\n').split('\n')) {
    if (/^-(\s|$)/.test(line)) {
      if (current) segments.push(current)
      current = [...pending, line];pending = []
    } else if (current) current.push(line)
    else pending.push(line)
  }
  if (current) segments.push(current)
  if (pending.some(line => line.trim())) segments.push(pending)
  return segments.map(lines => lines.join('\n').replace(/\s+$/, '')).filter(segment => segment.trim())
}

const identityOf = entry => entry && typeof entry === 'object' ? (entry.id ?? entry.name ?? null) : null

/**
 * Compare the managed region against the projection of the installed presets.
 *
 * @param presentText - the region between the managed markers.
 * @param expectedText - the projection generated from the installed presets.
 * @returns `{ equal, foreign }`: `equal` ignores entries the projection does not own,
 *   `foreign` is the raw text of those entries so the caller can keep them.
 */
export function comparePresetEntries(presentText, expectedText) {
  const expected = parsePresetEntries(expectedText).filter(entry => entry && typeof entry === 'object')
  const expectedIds = new Set(expected.map(entry => entry.id).filter(Boolean))
  const expectedNames = new Set(expected.map(entry => entry.name).filter(Boolean))
  const owned = new Map(), foreign = []
  for (const segment of splitTopLevelEntries(presentText)) {
    let entry
    try { entry = parsePresetEntries(segment)[0] } catch { entry = undefined }
    const isObjectEntry = !!entry && typeof entry === 'object' && !Array.isArray(entry)
    // An entry is ours when it shares an identity with the projection. A stale projection
    // entry whose identity disappeared is treated as ours too (by package name) so that it
    // counts as drift instead of being preserved forever.
    const ours = isObjectEntry && ((entry.id && expectedIds.has(entry.id)) || (entry.name && expectedNames.has(entry.name)))
    if (ours) owned.set(identityOf(entry), entry)
    else foreign.push(segment)
  }
  let equal = owned.size === expected.length
  if (equal) for (const entry of expected) { const present = owned.get(identityOf(entry)); if (!present || !samePresetValue(present, entry)) { equal = false; break } }
  return { equal, foreign }
}
