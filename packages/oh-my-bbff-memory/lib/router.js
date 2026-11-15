/**
 * Deterministic memory router for oh-my-bbff-memory 0.5.0 (routed recall).
 *
 * Layer model (owner-approved):
 *   L1 — resident: only the natively loaded AGENTS.md / AGENTS.local.md. In routed
 *        mode the plugin additionally injects a router INDEX (metadata) built from
 *        each memory file's frontmatter `name`/`description`, its top-level
 *        headings and its filename tokens. No memory file is hardcoded always-on.
 *   L2 — deterministic per-turn routing: score the recent user turns against the
 *        index metadata (CJK bigrams for Chinese) and inject the top-K matched
 *        files in full under a visible `[routed: key, score, why]` marker, within a
 *        byte budget. No match injects a one-line tool hint.
 *   L3 — tool fallback: memory_read / memory_search remain available.
 *
 * The router is pure: given an index and query texts it returns deterministic
 * scores, so tests can assert exact behaviour without a model.
 *
 * @module oh-my-bbff-memory/router
 */
import { createHash } from 'node:crypto'
import { DEFAULT_DATA, PROMPT_DEFAULTS } from './defaults.js'
import { fileIdentity } from './directories.js'

const CJK_CLASS = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af'
const CJK_RE = new RegExp(`[${CJK_CLASS}]`)
const CJK_RUN_RE = new RegExp(`[${CJK_CLASS}]+`, 'g')
const WORD_RE = /[a-z][a-z0-9]*/g

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'with', 'that', 'this', 'from', 'have', 'has', 'had',
  'not', 'but', 'you', 'your', 'our', 'its', 'can', 'will', 'would', 'should', 'could', 'about',
  'into', 'than', 'then', 'them', 'they', 'their', 'there', 'here', 'when', 'what', 'which', 'who',
  'how', 'why', 'all', 'any', 'each', 'more', 'most', 'some', 'such', 'only', 'also', 'just', 'very',
  'use', 'used', 'using', 'one', 'two', 'new', 'may', 'might', 'must', 'shall', 'does', 'did', 'doing',
  'been', 'being', 'because', 'while', 'where', 'after', 'before', 'over', 'under', 'between',
  'through', 'during', 'within', 'without', 'against', 'upon', 'per', 'via', 'get', 'got', 'make',
  'made', 'like', 'want', 'need', 'please', 'thanks', 'thank', 'ok', 'okay', 'yes', 'let', 'now',
])

function sha1(text) {
  return createHash('sha1').update(text).digest('hex')
}

function byteLength(text) {
  return Buffer.byteLength(String(text ?? ''), 'utf8')
}

function truncateUtf8(text, maxBytes) {
  const bytes = Buffer.from(String(text ?? ''), 'utf8')
  if (bytes.length <= maxBytes) return bytes.toString('utf8')
  let end = Math.max(0, Math.trunc(maxBytes))
  while (end > 0 && (bytes.readUInt8(end) & 192) === 128) end -= 1
  return bytes.subarray(0, end).toString('utf8')
}

/** True when a string contains CJK (Han/kana/hangul) characters. */
export function hasCjk(text) {
  return CJK_RE.test(String(text ?? ''))
}

/**
 * Minimal tolerant YAML frontmatter reader: `key: value` scalar pairs between a
 * leading `---` line and the next `---` line. Anything else is left in the body.
 * @returns {{data: Record<string,string>, body: string}}
 */
export function parseFrontmatter(text) {
  const source = String(text ?? '')
  const lines = source.split(/\r?\n/)
  if (lines.length === 0 || lines[0].trim() !== '---') return { data: {}, body: source }
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') { end = index; break }
  }
  if (end === -1) return { data: {}, body: source }
  const data = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (match === null) continue
    let value = match[2].trim()
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    if (value.length > 0) data[match[1].toLowerCase()] = value
  }
  return { data, body: lines.slice(end + 1).join('\n') }
}

/** Top-level (`# `) headings of a Markdown body. */
export function topLevelHeadings(body) {
  const headings = []
  for (const match of String(body ?? '').matchAll(/^#\s+(.+?)\s*$/gm)) headings.push(match[1].trim())
  return headings
}

function filenameTokens(name) {
  return String(name ?? '')
    .replace(/\.md$/i, '')
    .split(/[-_.\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

function stemToName(name) {
  const tokens = filenameTokens(name)
  if (tokens.length === 0) return String(name ?? '')
  return tokens.join(' ')
}

function firstParagraph(body) {
  const lines = String(body ?? '').split(/\r?\n/)
  const collected = []
  for (const raw of lines) {
    const line = raw.trim()
    if (line.length === 0) {
      if (collected.length > 0) break
      continue
    }
    if (line.startsWith('#') || line.startsWith('```') || line.startsWith('|') || line.startsWith('---')) continue
    collected.push(line)
    if (collected.length >= 3) break
  }
  return collected.join(' ').slice(0, 240)
}

/**
 * Tokenize text for the router: lowercase English words (length >= 2, stopwords
 * removed) plus CJK bigrams (single characters for one-character runs).
 * @returns {string[]}
 */
export function tokenize(text) {
  const source = String(text ?? '').toLowerCase()
  const tokens = new Set()
  for (const match of source.matchAll(WORD_RE)) {
    const word = match[0]
    if (word.length < 2 || STOPWORDS.has(word)) continue
    tokens.add(word)
  }
  for (const run of source.matchAll(CJK_RUN_RE)) {
    const chars = Array.from(run[0])
    if (chars.length === 1) {
      tokens.add(chars[0])
      continue
    }
    for (let index = 0; index + 1 < chars.length; index += 1) tokens.add(`${chars[index]}${chars[index + 1]}`)
  }
  return [...tokens]
}

function addTokens(map, tokens, weight, field) {
  for (const token of tokens) {
    const existing = map.get(token)
    if (existing === undefined || existing.weight < weight) map.set(token, { weight, field })
  }
}

/**
 * Build one index entry from a scanned memory file.
 * @param {{scope: string, name: string, display: string, absPath: string, content: string, sha1: string, bytes: number}} file
 */
export function indexEntry(file) {
  const { data, body } = parseFrontmatter(file.content)
  const headings = topLevelHeadings(body)
  const tokens = new Map()
  const name = (data.name && data.name.length > 0 ? data.name : (headings[0] !== undefined ? headings[0] : stemToName(file.name))).slice(0, 160)
  const description = (data.description && data.description.length > 0 ? data.description : firstParagraph(body)).slice(0, 280)
  addTokens(tokens, tokenize(name), 3, 'name')
  addTokens(tokens, tokenize(description), 2, 'description')
  for (const heading of headings) addTokens(tokens, tokenize(heading), 2, 'heading')
  addTokens(tokens, tokenize(filenameTokens(file.name).join(' ')), 1.5, 'filename')
  return {
    key: file.key || fileIdentity({ scope: file.scope, name: file.name, directory: file.directory }),
    scope: file.scope,
    file: file.name,
    display: file.display,
    path: file.absPath,
    bytes: byteLength(file.content),
    sha1: file.sha1,
    content: file.content,
    name,
    description,
    headings,
    tokens,
  }
}

/**
 * Build the router index (and its deterministic identity) from the active files.
 * Disabled files must already be filtered out by the caller.
 */
export function buildMemoryIndex(files) {
  const entries = files.map(indexEntry)
  const documentFrequency = new Map()
  for (const entry of entries) {
    for (const token of entry.tokens.keys()) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
  }
  const identity = sha1(JSON.stringify(entries.map((entry) => ({
    key: entry.key,
    name: entry.name,
    description: entry.description,
    headings: entry.headings,
    sha1: entry.sha1,
  }))))
  return { entries, documentFrequency, size: entries.length, identity, bytes: byteLength(JSON.stringify(entries.map((entry) => [entry.key, entry.bytes]))) }
}

/**
 * Score index entries against query texts. Deterministic: same index + query →
 * same ordering. Score = Σ(metadata weight × idf); ties break by key ascending.
 * @returns {Array<{entry, score: number, why: Array<{token, field, weight}>}>}
 */
export function scoreIndex(index, queryTexts) {
  const queryTokens = new Set()
  for (const text of queryTexts) for (const token of tokenize(text)) queryTokens.add(token)
  const matches = []
  for (const entry of index.entries) {
    let score = 0
    const why = []
    for (const token of queryTokens) {
      const meta = entry.tokens.get(token)
      if (meta === undefined) continue
      const df = index.documentFrequency.get(token) || 0
      const idf = Math.log((index.size + 1) / (df + 1)) + 1
      score += meta.weight * idf
      why.push({ token, field: meta.field, weight: meta.weight })
    }
    if (score > 0) matches.push({ entry, score: Math.round(score * 1000) / 1000, why: why.sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token)) })
  }
  matches.sort((a, b) => (b.score - a.score) || (a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : 0))
  return matches
}

function whyText(why) {
  return why.slice(0, 4).map((item) => `${item.field}:${item.token}`).join(' ')
}

/**
 * Route one turn: top-K scored entries, each included in full while the byte
 * budget allows; if the first match alone exceeds the budget it is truncated.
 */
export function routeMemory({ index, queryTexts, topK = DEFAULT_DATA.fields.routeTopK.default, maxBytes = DEFAULT_DATA.fields.routeMaxBytes.default }) {
  const scored = scoreIndex(index, queryTexts)
  const candidates = scored.slice(0, Math.max(1, Math.min(DEFAULT_DATA.fields.routeTopK.max, topK)))
  const matches = []
  let totalBytes = 0
  for (const candidate of candidates) {
    const content = candidate.entry.content
    const bytes = byteLength(content)
    if (totalBytes + bytes <= maxBytes) {
      matches.push({ ...candidate, content, includedBytes: bytes, truncated: false, whyText: whyText(candidate.why) })
      totalBytes += bytes
      continue
    }
    if (matches.length === 0) {
      const allowance = Math.max(0, Math.floor(maxBytes - totalBytes))
      const included = truncateUtf8(content, allowance)
      matches.push({ ...candidate, content: included, includedBytes: byteLength(included), truncated: true, whyText: whyText(candidate.why) })
      totalBytes += byteLength(included)
    }
  }
  return { matches, considered: candidates.length, total: scored.length, totalBytes, maxBytes, topK }
}

/** Recent genuine user texts from the normalized incremental read model. */
export function recentUserTexts(model, windowTurns = DEFAULT_DATA.fields.routeWindowTurns.default) {
  const limit = Math.max(DEFAULT_DATA.fields.routeWindowTurns.min, Math.min(DEFAULT_DATA.fields.routeWindowTurns.max, Number(windowTurns) || DEFAULT_DATA.fields.routeWindowTurns.default))
  return [...(model?.human?.values?.() || [])].filter(fact => fact.human && fact.value.text.trim()).map(fact => fact.value.text).slice(-limit)
}

export const ROUTER_INDEX_INTRO = PROMPT_DEFAULTS.routerIndexIntro

/** Render the persistent router-index text (L1 metadata for routed mode). */
export function renderIndexText(index, { intro = ROUTER_INDEX_INTRO } = {}) {
  const lines = [intro]
  if (index.entries.length === 0) lines.push('(no active memory entries)')
  for (const entry of index.entries) {
    const description = entry.description.length > 0 ? ` description: ${entry.description}` : ''
    const headings = entry.headings.length > 0 ? ` headings: ${entry.headings.join(' / ')}` : ''
    lines.push(`- ${entry.key} — name: ${entry.name}${description}${headings}; bytes: ${entry.bytes}`)
  }
  return lines.join('\n')
}

export const ROUTED_INTRO = PROMPT_DEFAULTS.routerRoutedIntro

/** Render the per-turn routed content with visible `[routed: …]` markers. */
export function renderRoutedText(routes, { intro = ROUTED_INTRO } = {}) {
  const parts = [intro]
  for (const match of routes.matches) {
    const note = match.truncated ? ', truncated to fit the route budget' : ''
    parts.push(`[routed: ${match.entry.key}, score=${match.score}, why=${match.whyText}${note}]\n\nInstructions from: ${match.entry.display}\n\n${match.content}`)
  }
  return parts.join('\n\n')
}

export const NO_MATCH_HINT = PROMPT_DEFAULTS.routerNoMatchHint

/** Route all active files for one query window (used by the preview API and tests). */
export function routeFiles({ files, queryTexts, topK, maxBytes }) {
  const index = buildMemoryIndex(files)
  const routes = routeMemory({ index, queryTexts, topK, maxBytes })
  return { index, routes }
}
