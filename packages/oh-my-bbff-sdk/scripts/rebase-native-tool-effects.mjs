/**
 * Rebase the reviewed NATIVE_TOOL_EFFECTS table onto an installed DSH release.
 *
 * Effects are human-reviewed facts (native tool definitions carry no effect field), so this
 * script never invents one: it carries every reviewed effect forward by exact tool identity,
 * re-derives evidence sites, package versions and the source baseline from the installed
 * packages (scripts/native-tool-inventory.mjs), and stops when a name has no reviewed effect
 * unless the --review file supplies it. Rows whose package or names left the release are dropped
 * and listed. The coverage gate (verifyNativeToolCoverage) must pass before anything is written.
 *
 *   node scripts/rebase-native-tool-effects.mjs --native <...>/node_modules/@deepseek-ai --review review.json [--write]
 *
 * review.json: { "nativeVersion": "0.2.2-rc.2", "rows": { "<ownerPackage>:<name>": { "effect", "reason", "conditions"? } },
 *                "dropConditions": ["<exact condition reason to drop>"] }
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enumerateNativeTools, verifyNativeToolCoverage } from './native-tool-inventory.mjs'
import { NATIVE_TOOL_EFFECTS } from '../dsh-adapter.js'

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined }
const nativeRoot = arg('--native'), reviewPath = arg('--review'), write = argv.includes('--write')
if (!nativeRoot || !path.isAbsolute(nativeRoot) || !reviewPath) { console.error('usage: --native <abs @deepseek-ai dir> --review <json> [--write]'); process.exit(2) }
const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
const inventory = enumerateNativeTools({ nativeRoot })
if (inventory.errors.length) { console.error(JSON.stringify(inventory.errors, null, 2)); process.exit(1) }
const versions = new Map(inventory.packages.map(row => [row.packageName, row.packageVersion]))
const dropConditions = new Set(review.dropConditions || [])
const siteOf = record => ({ file: record.file, line: record.line, kind: record.kind, sha256: record.sha256 })
const oldByKey = new Map(NATIVE_TOOL_EFFECTS.map(row => [row.id, row]))
const rows = new Map(), unmatched = [], dropped = []

function rowFor(ownerPackage, oldRow, names, extra = {}) {
  const id = extra.id || (oldRow && oldRow.ownerPackage === ownerPackage ? oldRow.id : ownerPackage + ':' + names.join('+'))
  let row = rows.get(id)
  if (!row) {
    const base = oldRow ? JSON.parse(JSON.stringify(oldRow)) : { kind: 'tool', names, naming: 'literal', conditions: [] }
    row = { ...base, ...extra, id, ownerPackage, packageVersion: versions.get(ownerPackage), sites: [] }
    row.conditions = (row.conditions || []).filter(condition => !dropConditions.has(condition.reason))
    rows.set(id, row)
  }
  return row
}
// 1. Literal identities carry the reviewed effect of the same owner+name, else of the same name
//    (an identity that moved packages), else the explicit review entry.
for (const record of inventory.records.filter(record => record.form === 'literal' && record.name)) {
  const sameOwner = NATIVE_TOOL_EFFECTS.find(row => row.ownerPackage === record.packageName && row.names.includes(record.name))
  const reviewed = review.rows?.[record.packageName + ':' + record.name]
  const moved = !sameOwner && !reviewed ? NATIVE_TOOL_EFFECTS.filter(row => row.names.includes(record.name) && !versions.has(row.ownerPackage)) : []
  if (sameOwner) rowFor(record.packageName, sameOwner, sameOwner.names).sites.push(siteOf(record))
  else if (reviewed) rowFor(record.packageName, null, [record.name], { effect: reviewed.effect, reason: reviewed.reason, ...(reviewed.conditions ? { conditions: reviewed.conditions } : {}) }).sites.push(siteOf(record))
  else if (moved.length === 1) {
    const { id: _id, ownerPackage: _owner, ...carried } = moved[0]
    rowFor(record.packageName, null, [record.name], { ...carried, names: [record.name] }).sites.push(siteOf(record))
  } else unmatched.push(record)
}
// 2. A dynamic site belongs to the only reviewed row of its owner with sites in the same file and
//    kind; when several rows share that file, the review file names the row per exact site
//    ("dynamicSites": { "<owner>:<file>:<line>:<kind>": "<reviewed row id>" }).
for (const record of inventory.records.filter(record => record.form !== 'literal')) {
  const mapped = review.dynamicSites?.[[record.packageName, record.file, record.line, record.kind].join(':')]
  const owners = new Set(NATIVE_TOOL_EFFECTS.filter(row => row.ownerPackage === record.packageName && row.sites.some(site => site.file === record.file && site.kind === record.kind)).map(row => row.id))
  if (mapped && typeof mapped === 'object') {
    // A reviewed new dynamic identity (new package, factory or moved transport).
    const { names = [], ...fields } = mapped
    rowFor(record.packageName, null, names, { names, ...fields }).sites.push(siteOf(record))
    continue
  }
  const id = mapped || (owners.size === 1 ? [...owners][0] : undefined)
  const old = id && oldByKey.get(id)
  if (old) rowFor(record.packageName, old, old.names).sites.push(siteOf(record))
  else unmatched.push(record)
}
for (const row of NATIVE_TOOL_EFFECTS) if (![...rows.values()].some(next => next.id === row.id || (next.ownerPackage === row.ownerPackage && row.names.length && row.names.every(name => next.names.includes(name))))) dropped.push({ id: row.id, reason: versions.has(row.ownerPackage) ? 'no matching registration in the installed release' : 'owner package is not installed in this release' })
const next = [...rows.values()].map(row => ({ ...row, sites: row.sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind)) }))
  .sort((a, b) => a.ownerPackage.localeCompare(b.ownerPackage) || a.id.localeCompare(b.id))
const baseline = { nativeVersion: review.nativeVersion, verifiedAt: new Date().toISOString().slice(0, 10), packages: inventory.packages, corpus: inventory.corpus }
const coverage = verifyNativeToolCoverage(inventory, next, baseline)
const summary = { nativeVersion: review.nativeVersion, rows: next.length, sites: next.reduce((n, row) => n + row.sites.length, 0), unmatched: unmatched.map(record => [record.packageName, record.file + ':' + record.line, record.kind, record.form, record.name || (record.expression || '').slice(0, 60)]), dropped, coverage: { complete: coverage.complete, uncovered: coverage.uncovered.length, mismatched: coverage.mismatched.length, obsolete: coverage.obsolete.length, sourceChanges: coverage.sourceChanges.length, errors: coverage.errors } }
console.log(JSON.stringify(summary, null, 2))
if (unmatched.length || !coverage.complete) { console.error('Refusing to write: unreviewed names/sites or incomplete coverage.'); process.exit(1) }
if (!write) process.exit(0)
const adapterPath = path.join(sdkRoot, 'dsh-adapter.js'), source = fs.readFileSync(adapterPath, 'utf8')
const open = 'export const NATIVE_TOOL_EFFECTS = /* @__PURE__ */ freeze([', close = '\n])\nconst NATIVE_ROWS'
const start = source.indexOf(open), end = source.indexOf(close, start)
if (start < 0 || end < 0) throw new Error('NATIVE_TOOL_EFFECTS block not found')
const body = JSON.stringify(next, null, 2).slice(1, -2)
fs.writeFileSync(adapterPath, source.slice(0, start + open.length) + body + source.slice(end))
fs.writeFileSync(path.join(sdkRoot, 'NATIVE_TOOL_SOURCE_BASELINE.json'), JSON.stringify(baseline, null, 2) + '\n')
const cell = value => String(value).replaceAll('|', '\\|').replace(/\s+/g, ' ')
const table = next.map(row => `| ${row.names.length ? row.names.join(', ') : '(' + row.naming + ' ' + row.kind + ')'} | ${row.effect} | ${row.ownerPackage}@${row.packageVersion} | ${row.sites.map(site => site.file + ':' + site.line + ' ' + site.kind).join('<br>')} | ${cell(row.reason)} |`)
const notes = next.filter(row => row.conditions?.length).map(row => `### ${row.names.join(', ') || row.id} — ${row.ownerPackage}\n` + row.conditions.map(condition => `- ${condition.reason} Source: ${condition.source}`).join('\n'))
fs.writeFileSync(path.join(sdkRoot, 'NATIVE_TOOL_EFFECTS.md'), `# Native tool effect coverage — DSH ${review.nativeVersion}, ${baseline.verifiedAt}\n\nInstalled packages: ${inventory.packages.length}; evidence sites: ${summary.sites}; definition/class rows: ${next.length}. Generated by scripts/rebase-native-tool-effects.mjs; effects are carried forward from reviewed rows or the explicit review file. Condition source line numbers were reviewed on the release that introduced them and may drift.\n\nNo role entitlement is implied. Unknown factories are explicit; fixed/configured native names have reviewed effects.\n\n| Names / factory | Effect | Owner / version | Evidence | Reason |\n|---|---|---|---|---|\n${table.join('\n')}\n\n## Activation, conditional effects and shadowing\n\n${notes.join('\n\n')}\n`)
console.log('written')
