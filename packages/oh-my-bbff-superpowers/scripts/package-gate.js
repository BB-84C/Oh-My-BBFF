import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { parseSkill } from '../lib/content.js'

export const RELEASE_SKILLS = Object.freeze([
  'bbff-team-leading', 'bbff-team-member', 'brainstorming', 'writing-plans',
  'independent-review', 'test-driven-development', 'systematic-debugging',
  'verification-before-completion',
].sort())
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u
const slash = path => path.split(sep).join('/')
function inside(root, target) {
  const tail = relative(root, target)
  return tail === '' || (!isAbsolute(tail) && tail !== '..' && !tail.startsWith(`..${sep}`))
}
async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`${path}: symlink is not a package payload file`)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (entry.isFile()) files.push(path)
    else throw new Error(`${path}: unsupported package payload entry`)
  }
  return files.sort()
}

// Extract Markdown inline/reference and HTML destinations with 1-based lines,
// respecting balanced parentheses, angle destinations, escaped punctuation and
// code examples. Code is blanked in place so offsets still map to source lines.
export function linkDestinations(raw) {
  const blank = code => code.replace(/[^\n]/g, ' ')
  const text = raw.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, blank)
    .replace(/(`+)[\s\S]*?\1/g, blank)
  const lineAt = index => text.slice(0, index).split('\n').length
  const destinations = []
  const destinationAt = (source, start) => {
    let i = start
    while (/\s/.test(source[i] ?? '') && i < source.length) i++
    if (source[i] === '<') {
      const end = source.indexOf('>', i + 1)
      return end < 0 ? undefined : source.slice(i + 1, end)
    }
    const begin = i
    let depth = 0
    for (; i < source.length; i++) {
      if (source[i] === '\\') { i++; continue }
      if (source[i] === '(') depth++
      else if (source[i] === ')') { if (!depth) break; depth-- }
      else if (/\s/.test(source[i]) && !depth) break
    }
    return source.slice(begin, i)
  }
  for (const match of text.matchAll(/\]\(\s*/g)) {
    const destination = destinationAt(text, match.index + match[0].length)
    if (destination) destinations.push({ destination, line: lineAt(match.index) })
  }
  for (const match of text.matchAll(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(.*)$/gm)) {
    const destination = destinationAt(match[1], 0)
    if (destination) destinations.push({ destination, line: lineAt(match.index) })
  }
  for (const match of text.matchAll(/<(?:a|img|source|link|video|audio)\b[^>]*?\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    destinations.push({ destination: match[1] ?? match[2] ?? match[3], line: lineAt(match.index) })
  }
  return destinations
}
async function checkLink(root, source, destination) {
  let value
  try { value = decodeURIComponent(destination.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, '$1').split(/[?#]/, 1)[0]) }
  catch { throw new Error(`invalid URL encoding: ${destination}`) }
  if (value.startsWith('//')) return // Protocol-relative web URL, not a package resource.
  if (/^file:/i.test(value) || isAbsolute(value) || win32.isAbsolute(value)) throw new Error(`absolute resource link: ${destination}`)
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return
  if (!value) return
  const target = resolve(dirname(source), value)
  if (!inside(root, target)) throw new Error(`link points outside package: ${destination}`)
  let actual
  try { actual = await realpath(target) } catch { throw new Error(`missing relative link target: ${destination}`) }
  if (!inside(root, actual)) throw new Error(`link resolves outside package: ${destination}`)
}

export async function inspectPackage(packageRoot, { release = false } = {}) {
  const root = await realpath(packageRoot)
  const errors = [], skills = []
  let files = []
  try { files = await walk(join(root, 'skills')) }
  catch (error) { if (error.code !== 'ENOENT') errors.push(error.message) }
  for (const path of files.filter(path => path.endsWith('.md'))) {
    const label = slash(relative(root, path))
    const raw = await readFile(path, 'utf8')
    const match = cjk.exec(raw)
    if (match) errors.push(`${label}:${raw.slice(0, match.index).split('\n').length}: CJK in shipped default text`)
    if (basename(path) === 'SKILL.md') {
      const directory = dirname(path)
      if (dirname(directory) !== join(root, 'skills')) errors.push(`${label}: SKILL.md must be directly below skills/<name>/`)
      try {
        const parsed = parseSkill(raw, basename(directory), label)
        if (parsed.description.length > 500) errors.push(`${label}: description exceeds 500 characters`)
        skills.push(parsed.name)
      } catch (error) { errors.push(error.message) }
    }
    for (const { destination, line } of linkDestinations(raw)) {
      try { await checkLink(root, path, destination) }
      catch (error) { errors.push(`${label}:${line}: ${error.message}`) }
    }
  }
  skills.sort()
  if (release && JSON.stringify(skills) !== JSON.stringify(RELEASE_SKILLS)) errors.push(`release requires exactly the approved eight (8) skills; observed: ${skills.join(', ') || '(none)'}`)
  return { errors, skills, skillTextFiles: files.filter(path => path.endsWith('.md')).map(path => slash(relative(root, path))) }
}

export function verifyPackedInventory(manifest, inventory) {
  const observed = inventory[0]?.files?.map(file => file.path).sort()
  const expected = [...manifest.files.map(file => file.path), 'payload-manifest.json'].sort()
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`packed payload inventory mismatch; expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}`)
}

export async function buildPayloadManifest(packageRoot) {
  const root = await realpath(packageRoot)
  const info = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const payload = new Set([join(root, 'package.json')])
  for (const entry of info.files) {
    if (entry === 'payload-manifest.json') continue // A manifest cannot hash itself.
    const target = resolve(root, entry)
    if (!inside(root, target)) throw new Error(`payload entry outside package: ${entry}`)
    let details
    try { details = await lstat(target) } catch (error) {
      if (error.code === 'ENOENT' && entry === 'skills/') continue
      throw error
    }
    if (details.isSymbolicLink()) throw new Error(`payload symlink: ${entry}`)
    if (details.isDirectory()) for (const path of await walk(target)) payload.add(path)
    else payload.add(target)
  }
  const files = []
  for (const path of [...payload].sort()) {
    if (!(await stat(path)).isFile()) throw new Error(`not a regular payload file: ${path}`)
    const bytes = await readFile(path)
    files.push({ path: slash(relative(root, path)), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  const { skills } = await inspectPackage(root)
  return { schemaVersion: 1, packageName: info.name, version: info.version, skills, files }
}
