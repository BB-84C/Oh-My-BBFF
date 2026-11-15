/**
 * BBFF UI locale source (host).
 *
 * The family root is the only reader of dictionaries: every family module
 * declares `locale: { dir }` in its descriptor and ships `locale/<language>.json`
 * with a flat `ui` map. This module also reads the user directory
 * `$DSH_HOME/oh-my-bbff/locale/<language>.json` and exports the translation
 * template. Nothing here names a package: the family registry is the list.
 *
 * All diagnostics are locale message references in this package's namespace.
 */
import { promises as fsp } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ROOT_PACKAGE from '../package.json' with {type:'json'}
import {
  DEFAULT_LOCALE_DIR, LANGUAGE_ID_PATTERN, LOCALE_DIR_PATTERN, LOCALE_TEMPLATE_FILE,
  SDK_NAMESPACE, USER_LOCALE_DIR,
} from './bbff-contract.js'
import { wmsg as msg } from './locale-keys.js'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIDGETS_NAMESPACE = ROOT_PACKAGE.name
/** SDK dictionaries are vendored next to the contract; they are not a family module. */
const SDK_LOCALE_DIR = join(PACKAGE_ROOT, 'lib', 'bbff-sdk-locale')
const require_ = createRequire(import.meta.url)

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

/** A dictionary is a flat map of non-empty keys to template strings. */
function cleanDictionary(value) {
  if (!isPlainObject(value)) return null
  const entries = []
  for (const [key, text] of Object.entries(value)) {
    if (typeof key !== 'string' || !key.trim() || key.length > 160) return null
    if (typeof text !== 'string' || !text.trim()) return null
    entries.push([key.trim(), text])
  }
  return Object.fromEntries(entries)
}

function cleanMeta(value) {
  if (!isPlainObject(value)) return undefined
  const meta = {}
  if (typeof value.title === 'string' && value.title.trim()) meta.title = value.title
  if (typeof value.description === 'string' && value.description.trim()) meta.description = value.description
  return Object.keys(meta).length ? meta : undefined
}

/** Read `<dir>/*.json` dictionaries for one package, skipping unusable files with diagnostics. */
async function readDictionaryDir({ packageName, dir, diagnostics }) {
  const languages = {}
  let names
  try {
    names = await fsp.readdir(dir)
  } catch (error) {
    if (error && error.code === 'ENOENT') return languages
    diagnostics.push(msg('diag.locales.directory-unreadable', { packageName, detail: String(error && error.code || error) }))
    return languages
  }
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -'.json'.length)
    if (!LANGUAGE_ID_PATTERN.test(id)) continue
    let parsed
    try {
      parsed = JSON.parse(await fsp.readFile(join(dir, name), 'utf8'))
    } catch (error) {
      diagnostics.push(msg('diag.locales.file-unreadable', { packageName, file: name, detail: String(error && error.code || error) }))
      continue
    }
    const ui = cleanDictionary(parsed && parsed.ui)
    if (!ui) {
      diagnostics.push(msg('diag.locales.file-malformed', { packageName, file: name }))
      continue
    }
    languages[id] = { ui, ...(cleanMeta(parsed && parsed.meta) ? { meta: cleanMeta(parsed && parsed.meta) } : {}) }
  }
  return languages
}

/** Locate an installed family package directory from its package name. */
function packageDirectory(packageName) {
  const sibling = join(dirname(PACKAGE_ROOT), packageName)
  try {
    const manifest = require_(join(sibling, 'package.json'))
    if (manifest && manifest.name === packageName) return sibling
  } catch {}
  try {
    return dirname(require_.resolve(packageName + '/package.json'))
  } catch {}
  return null
}

/**
 * Create the host-side locale source.
 *
 * @param {object} options
 * @param {() => string} options.home `$DSH_HOME` resolver.
 * @param {() => Array<object>} options.getModules Family registry module list.
 * @param {object} [options.logger] Host logger (diagnostics are also returned).
 */
export function createLocaleSource({ home, getModules, logger } = {}) {
  const userDir = () => join(home(), USER_LOCALE_DIR)
  let revision = 0
  const warn = (message) => { try { logger?.warn?.(message) } catch {} }

  /** Every dictionary source: the root itself, the vendored SDK, then family modules. */
  function sources() {
    const list = [
      { packageName: WIDGETS_NAMESPACE, dir: join(PACKAGE_ROOT, DEFAULT_LOCALE_DIR) },
      { packageName: SDK_NAMESPACE, dir: SDK_LOCALE_DIR },
    ]
    for (const module of Array.isArray(getModules?.()) ? getModules() : []) {
      if (!module || typeof module.packageName !== 'string' || !module.packageName) continue
      if (list.some((row) => row.packageName === module.packageName)) continue
      const declared = module.locale && typeof module.locale.dir === 'string' ? module.locale.dir : DEFAULT_LOCALE_DIR
      if (!LOCALE_DIR_PATTERN.test(declared)) {
        list.push({ packageName: module.packageName, dir: null, invalidDir: declared })
        continue
      }
      const base = packageDirectory(module.packageName)
      if (!base) { list.push({ packageName: module.packageName, dir: null, unresolved: true }); continue }
      list.push({ packageName: module.packageName, dir: join(base, declared) })
    }
    return list
  }

  /** Read the user language directory; user files may not override shipped languages. */
  async function readUserLanguages(shipped, diagnostics) {
    const dir = userDir()
    const languages = []
    const sections = {}
    let names
    try {
      names = await fsp.readdir(dir)
    } catch (error) {
      if (error && error.code === 'ENOENT') return { languages, sections }
      diagnostics.push(msg('diag.locales.user-directory-unreadable', { detail: String(error && error.code || error) }))
      return { languages, sections }
    }
    for (const name of names.sort()) {
      if (!name.endsWith('.json')) continue
      // The exported template is a copy source, not a language of its own.
      if (name.startsWith('template.')) continue
      const stem = name.slice(0, -'.json'.length)
      if (!LANGUAGE_ID_PATTERN.test(stem)) continue
      let parsed
      try {
        parsed = JSON.parse(await fsp.readFile(join(dir, name), 'utf8'))
      } catch (error) {
        diagnostics.push(msg('diag.locales.user-file-unreadable', { file: name, detail: String(error && error.code || error) }))
        continue
      }
      const language = parsed && parsed.language
      const id = isPlainObject(language) && typeof language.id === 'string' ? language.id.trim() : stem
      const label = isPlainObject(language) && typeof language.label === 'string' ? language.label.trim() : ''
      if (!LANGUAGE_ID_PATTERN.test(id) || !label) {
        diagnostics.push(msg('diag.locales.user-file-malformed', { file: name }))
        continue
      }
      const packages = parsed && parsed.packages
      if (!isPlainObject(packages)) {
        diagnostics.push(msg('diag.locales.user-file-malformed', { file: name }))
        continue
      }
      const cleaned = {}
      let usable = false
      for (const [packageName, section] of Object.entries(packages)) {
        const ui = cleanDictionary(section && section.ui)
        if (!ui) {
          diagnostics.push(msg('diag.locales.user-file-malformed', { file: name, packageName }))
          continue
        }
        if (shipped[packageName] && shipped[packageName][id]) {
          diagnostics.push(msg('diag.locales.user-overrides-shipped', { file: name, packageName, language: id }))
          continue
        }
        cleaned[packageName] = { ui, ...(cleanMeta(section && section.meta) ? { meta: cleanMeta(section && section.meta) } : {}) }
        usable = true
      }
      if (!usable) continue
      if (!languages.some((row) => row.id === id)) languages.push({ id, label, fallback: 'en', user: true })
      sections[id] = { ...(sections[id] || {}), ...cleaned }
    }
    return { languages, sections }
  }

  /**
   * Read every dictionary: shipped package files, the vendored SDK and user files.
   * @returns {Promise<{ok:true,revision:number,userDir:string,templateFile:string,packages:object,languages:object[],diagnostics:object[]}>}
   */
  async function read() {
    const diagnostics = []
    const packages = {}
    for (const source of sources()) {
      if (source.invalidDir !== undefined) {
        diagnostics.push(msg('diag.locales.declaration-invalid', { packageName: source.packageName, dir: String(source.invalidDir) }))
        continue
      }
      if (!source.dir) {
        diagnostics.push(msg('diag.locales.package-unresolved', { packageName: source.packageName }))
        continue
      }
      const languages = await readDictionaryDir({ packageName: source.packageName, dir: source.dir, diagnostics })
      if (Object.keys(languages).length) packages[source.packageName] = languages
      else if (source.packageName !== SDK_NAMESPACE) diagnostics.push(msg('diag.locales.package-empty', { packageName: source.packageName }))
    }
    const user = await readUserLanguages(packages, diagnostics)
    for (const [language, byPackage] of Object.entries(user.sections)) {
      for (const [packageName, section] of Object.entries(byPackage)) {
        packages[packageName] = packages[packageName] || {}
        packages[packageName][language] = section
      }
    }
    revision += 1
    for (const entry of diagnostics) warn('oh-my-bbff-widgets: locale ' + entry.key + ' ' + JSON.stringify(entry.params || {}))
    return {
      ok: true,
      revision,
      userDir: userDir(),
      templateFile: join(userDir(), LOCALE_TEMPLATE_FILE),
      packages,
      languages: user.languages,
      diagnostics,
    }
  }

  /**
   * Write the combined English template users copy to start a new language.
   * @returns {Promise<{ok:boolean,path?:string,bytes?:number,error?:object}>}
   */
  async function writeTemplate() {
    const value = await read()
    const packages = {}
    for (const [packageName, languages] of Object.entries(value.packages)) {
      if (!languages.en) continue
      packages[packageName] = { ...(languages.en.meta ? { meta: languages.en.meta } : {}), ui: languages.en.ui }
    }
    const document = { language: { id: 'en', label: 'English' }, packages }
    const path = value.templateFile
    try {
      await fsp.mkdir(dirname(path), { recursive: true })
      const text = JSON.stringify(document, null, 2) + '\n'
      await fsp.writeFile(path, text, 'utf8')
      return { ok: true, path, bytes: Buffer.byteLength(text) }
    } catch (error) {
      return { ok: false, error: msg('diag.locales.template-write-failed', { detail: String(error && error.code || error) }) }
    }
  }

  return { read, writeTemplate, userDir }
}
