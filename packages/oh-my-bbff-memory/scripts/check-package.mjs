#!/usr/bin/env node
/** Read-only prepack identity/default/vendor/native-boundary gate. Imports declarations, never invokes apply. */
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, relative, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { generatePackagedSkill, skillHash } from '../lib/skill-package.js'
import { shippedSettings, effectiveBudget, reviewInventoryBudget } from '../lib/defaults.js'
import { memorySettingDescriptors } from '../lib/settings-metadata.js'
import * as identity from '../lib/identity.js'
import { LOCALE_NAMESPACE, msg as hostMessage } from '../lib/host-ref.js'
import { FAMILY_DESCRIPTOR } from '../index.js'
const HOST_REF_PROBE = hostMessage('error.presetStale')

export function identityErrors(pkg, exportedIdentity, descriptor) {
  const errors = [], expected = { MODULE_ID: pkg.bbff.id, PACKAGE_NAME: pkg.name, MODULE_TITLE: pkg.bbff.title, VERSION: pkg.version, API_BASE: '/' + pkg.name + '/api', SETTINGS_SECTION: pkg.bbff.id + '-settings' }
  for (const [key, value] of Object.entries(expected)) if (exportedIdentity[key] !== value) errors.push('Manifest-derived identity differs: ' + key)
  if (JSON.stringify(exportedIdentity.PACKAGE) !== JSON.stringify(pkg)) errors.push('Exported PACKAGE differs from the current manifest.')
  if (descriptor?.version !== pkg.version) errors.push('FAMILY_DESCRIPTOR.version differs from package.version.')
  if (descriptor?.packageName !== pkg.name || descriptor?.id !== pkg.bbff.id || descriptor?.apiBase !== expected.API_BASE) errors.push('FAMILY_DESCRIPTOR identity differs from the current manifest.')
  return errors
}

export const prohibited = [
  ['reserved native transport name', /\brun_code\b/],
  ['native MCP name codec', /mcp__/],
  ['native resource section identity', /mcp-resource-servers/],
  ['native resource dispatch names', /\b(?:list_mcp_resources|list_mcp_resource_templates|read_mcp_resource)\b/],
  ['raw native parent/depth decoding', /\.(?:parentSession|delegationDepth)\b/],
  ['native section order key copy', /\b(?:SUBAGENT_DELEGATION|DEPLOYMENT_PERSONA_PREFIX)\b/],
  ['blocking host wait', /Atomics\.wait|SharedArrayBuffer/],
  ['global model mutation', /\.selectModel\s*\(/],
  ['deployment-specific native root', /[A-Za-z]:[\\/]Users[\\/][^\n]+npm[\\/]node_modules/],
  ['full native session query', /\.(?:readSession|readSurface|listEvents)\s*\(/],
  ['deprecated/full session content access', /\.(?:eventAt|snapshotEvents|deriveMessages)\s*\(/],
  ['copied client default authority', /\bSETTINGS_(?:DEFAULTS|LIMITS)\b/],
]
export function scan(text) { return prohibited.filter(([, pattern]) => pattern.test(text)).map(([name]) => name) }
function files(root) { return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(root, entry.name)) : ['.js','.mjs'].includes(extname(entry.name)) ? [join(root, entry.name)] : []) }
export function check(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), client = readFileSync(join(root, 'client.js'), 'utf8'), errors = identityErrors(pkg, identity, FAMILY_DESCRIPTOR), results = [{ identity: { manifestVersion: pkg.version, exportedVersion: identity.VERSION, descriptorVersion: FAMILY_DESCRIPTOR.version } }]
  const identitySource = readFileSync(join(root, 'lib/identity.js'), 'utf8')
  if (!/import\s+\w+\s+from\s+['"]\.\.\/package\.json['"]\s+with\s*\{\s*type:\s*['"]json['"]\s*\}/.test(identitySource)) errors.push('Identity must declare a static JSON manifest dependency for native HMR.')
  const id = /window\.__ModuleLoader__\.load\(\{\s*id:\s*['"]([^'"]+)['"]/.exec(client)?.[1]
  if (id !== pkg.name) errors.push('Client factory id does not match package name.')
  // Every host-emitted message reference carries this package's locale namespace, so a raw key
  // cannot surface in a renderer that does not own this module's translator.
  const factory = 'host-ref.js'
  for (const file of [join(root, 'index.js'), join(root, 'client.js'), ...files(join(root, 'lib'))]) {
    if (['bbff-contract.js', 'dsh-adapter.js', factory].includes(file.split(/[\\/]/).pop())) continue
    if (/import\s*\{[^}]*\bmsg\b[^}]*\}\s*from\s*['"][^'"]*bbff-contract\.js['"]/.test(readFileSync(file, 'utf8'))) errors.push('Host module imports msg from the vendored contract instead of lib/' + factory + ': ' + relative(root, file).replaceAll('\\', '/'))
  }
  if (LOCALE_NAMESPACE !== pkg.name || HOST_REF_PROBE?.ns !== pkg.name || HOST_REF_PROBE?.$bbff !== 'bbff-message') errors.push('Host message references are not namespaced to this package.')
  const data = JSON.parse(readFileSync(join(root, 'lib/defaults.json'), 'utf8')), prompts = JSON.parse(readFileSync(join(root, 'lib/prompt-defaults.json'), 'utf8'))
  // Every readable string lives in locale/*.json; the shipped data files keep structure only.
  const dictionaries = { en: JSON.parse(readFileSync(join(root, 'locale/en.json'), 'utf8')).ui, zh: JSON.parse(readFileSync(join(root, 'locale/zh.json'), 'utf8')).ui }, uiKeys = new Set(Object.keys(dictionaries.en))
  const refKey = value => value && typeof value === 'object' && value.$bbff === 'bbff-message' ? String(value.key) : null
  const presentationData = JSON.parse(readFileSync(join(root, 'lib/settings-presentation.json'), 'utf8'))
  if ('groups' in data || Object.values(data.fields).some(field => 'label' in field) || 'effects' in presentationData || 'labels' in presentationData || (presentationData.basicGroups || []).some(group => 'title' in group)) errors.push('Shipped settings/presentation data still carries display text; it belongs in locale/*.json.')
  if (!Object.keys(dictionaries.en).length || Object.keys(dictionaries.en).length !== Object.keys(dictionaries.zh).length) errors.push('Locale dictionaries are empty or out of parity.')
  if (!Object.keys(pkg.exports || {}).some(key => key.includes('locale'))) errors.push('Package must export locale/*.json for the DSH plugin list and the BBFF locale transport.')
  if (!Object.keys(data.fields).length || !Object.keys(prompts).length || !data.policies || !data.storage) errors.push('Shipped settings/prompt contract data is empty/incomplete.')
  const groupIds = [...new Set(Object.values(data.fields).map(field => field.group))]
  for (const [key, field] of Object.entries(data.fields)) if (!Object.hasOwn(field, 'default') || !field.group || !groupIds.includes(field.group)) errors.push('Missing default/group for ' + key)
  for (const group of groupIds) if (!uiKeys.has('settings.group.' + group)) errors.push('Missing locale group title: ' + group)
  const vendors = new Map([['lib/bbff-contract.js','contract.js'],['lib/dsh-adapter.js','dsh-adapter.js']]), candidates = [join(root,'index.js'),join(root,'client.js'),join(root,'scripts/patch-profile-budget.mjs'),...files(join(root,'lib'))]
  for (const file of candidates) {
    const name = relative(root,file).replaceAll('\\','/')
    if (vendors.has(name)) continue
    const violations = scan(readFileSync(file,'utf8'));if (violations.length) errors.push(name+': '+violations.join(', '))
  }
  const sdk = resolve(root,'../oh-my-bbff-sdk')
  for (const [destination, source] of vendors) {
    const actual = readFileSync(join(root,destination)), canonical = join(sdk,source)
    if (!existsSync(canonical)) errors.push('Canonical SDK checkout required for source/prepack verification: '+source)
    else if (!actual.equals(readFileSync(canonical))) errors.push('Vendor differs from canonical SDK: '+destination)
    results.push({file:destination,sha256:createHash('sha256').update(actual).digest('hex')})
  }
  // Drift between the managed preset-budget block and the installed presets is decided on the
  // PARSED values, with the same YAML dialect DSH reads and writes the profile patch in.
  const yamlVendor = join(root,'lib/vendor/js-yaml')
  let yamlProvenance = null
  try { yamlProvenance = JSON.parse(readFileSync(join(yamlVendor,'provenance.json'),'utf8')) } catch { errors.push('Vendored js-yaml provenance is missing.') }
  if (yamlProvenance) {
    if (yamlProvenance.version !== '4.3.2' || yamlProvenance.name !== 'js-yaml') errors.push('Vendored js-yaml provenance names an unexpected parser version.')
    for (const row of yamlProvenance.files || []) { const bytes = readFileSync(join(yamlVendor,row.path));if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) errors.push('Vendored js-yaml payload mismatch: '+row.path) }
  }
  const presetBudgetSource = readFileSync(join(root,'lib/preset-budget.js'),'utf8'), yamlPresetSource = readFileSync(join(root,'lib/yaml-preset.js'),'utf8')
  if (!/comparePresetEntries/.test(presetBudgetSource) || /\bsignature\(/.test(presetBudgetSource)) errors.push('Preset-budget drift is not decided on parsed preset values.')
  if (!/vendor\/js-yaml/.test(yamlPresetSource) || !/JSON_SCHEMA\.extend/.test(yamlPresetSource) || !/tag:yaml\.org,2002:js/.test(yamlPresetSource)) errors.push('Semantic preset comparison does not use the DSH js-yaml dialect.')
  if (!/js-yaml/.test(readFileSync(join(root,'THIRD_PARTY_NOTICES.md'),'utf8'))) errors.push('Vendored js-yaml has no third-party notice.')
  const skillPath = join(root,'skills/update-memory/SKILL.md'), expectedSkill = generatePackagedSkill(prompts.skill,data)
  if (!existsSync(skillPath) || !readFileSync(skillPath).equals(expectedSkill)) errors.push('Packaged SKILL.md differs byte-for-byte from generator output.')
  const skillLedger = JSON.parse(readFileSync(join(root,'lib/skill-releases.json'),'utf8'))
  if (skillLedger.current?.sha256 !== skillHash(expectedSkill) || !skillLedger.entries.some(entry=>entry.sha256===skillHash(expectedSkill)&&entry.version===pkg.version)) errors.push('This pack skill hash is missing from generated release history.')
  // settings-metadata v1: the Host owns every readable title/default row; the Client must not fall back to raw ids or copied JSON.
  const shipped = shippedSettings(), descriptors = memorySettingDescriptors({ defaults: shipped, readonlyPrompts: ['skill'] })
  if (descriptors.status !== 'ready' || descriptors.counts.settings !== Object.keys(data.fields).length || descriptors.counts.groups !== groupIds.length || descriptors.counts.prompts !== Object.keys(prompts).length || descriptors.counts.readonlyItems !== 1) errors.push('Settings presentation descriptors are incomplete for the shipped settings/prompt data.')
  for (const entry of descriptors.settings) {
    const expected = ['setting.' + entry.path + '.label', 'setting.' + entry.path + '.description', 'setting.' + entry.path + '.effect'], actual = [refKey(entry.displayLabel), refKey(entry.description), refKey(entry.effect)]
    if (JSON.stringify(actual) !== JSON.stringify(expected) || !entry.group || !refKey(entry.source?.contract) || JSON.stringify(entry.default) !== JSON.stringify(shipped[entry.path])) { errors.push('Unreadable or non-derived presentation descriptor for ' + entry.path); break }
    for (const option of entry.options || []) if (refKey(option.displayLabel) !== 'option.' + option.value) errors.push('Option label is not a locale reference: ' + entry.path + '/' + option.value)
    if (entry.unit && refKey(entry.unit.displayLabel) !== 'unit.' + entry.unit.code) errors.push('Unit label is not a locale reference: ' + entry.path)
  }
  for (const entry of descriptors.prompts) if (refKey(entry.displayLabel) !== 'prompt.' + entry.path + '.label' || refKey(entry.description) !== 'prompt.' + entry.path + '.description') { errors.push('Unreadable prompt presentation label for ' + entry.path); break }
  if (descriptors.readonlyItems.length !== 1 || descriptors.readonlyItems[0].path !== 'prompts.skill' || refKey(descriptors.readonlyItems[0].note) !== 'prompt.skill.note') errors.push('The read-only packaged skill is not kept visible in diagnostics.')
  for (const group of descriptors.groups) if (refKey(group.displayLabel) !== 'settings.group.' + group.id) errors.push('Group title is not a locale reference: ' + group.id)
  const descriptorRefs = []
  const collectRefs = value => { if (!value || typeof value !== 'object') return; if (value.$bbff === 'bbff-message') { descriptorRefs.push(String(value.key)); for (const param of Object.values(value.params || {})) collectRefs(param); return } for (const child of Object.values(value)) collectRefs(child) }
  collectRefs(descriptors)
  const missingRefKeys = [...new Set(descriptorRefs)].filter(key => !uiKeys.has(key))
  if (missingRefKeys.length) errors.push('Descriptor message references missing from locale/en.json: ' + missingRefKeys.slice(0, 5).join(', '))
  if (FAMILY_DESCRIPTOR.locale?.dir !== 'locale') errors.push('Family descriptor must declare the package-relative locale directory.')
  for (const key of [refKey(FAMILY_DESCRIPTOR.title), refKey(FAMILY_DESCRIPTOR.description), refKey(FAMILY_DESCRIPTOR.permissionLayer?.title), refKey(FAMILY_DESCRIPTOR.exclusiveTools?.reason)]) if (!key || !uiKeys.has(key)) errors.push('Descriptor message reference missing from locale/en.json: ' + key)
  if (/\{\{/.test(JSON.stringify(descriptors))) errors.push('An unrendered placeholder leaked into the settings presentation descriptors.')
  if (/JSON\.stringify\(view\.defaults/.test(client)) errors.push('Client still serializes defaults into the settings content area.')
  if (!/settingDescriptors/.test(client)) errors.push('Client does not consume the Host-owned settings presentation descriptors.')
  // Injection budget basis: the cap must come from the session model window × visible ratio, never from discovered content bytes.
  const budgetRatio = data.fields.budgetWindowRatio
  if (!budgetRatio || budgetRatio.default !== 0.1 || budgetRatio.unit !== 'percent' || budgetRatio.min !== 0.01 || budgetRatio.max !== 0.5) errors.push('The visible budget ratio field is missing its 10% default or bounds.')
  const budgetPolicy = data.policies || {}
  if (!Number.isSafeInteger(budgetPolicy.budgetFallbackWindowTokens) || budgetPolicy.budgetFallbackWindowTokens <= 0 || !Number.isFinite(budgetPolicy.budgetWindowCacheMs)) errors.push('The shipped fallback window/cache facts are missing.')
  if ('budgetAutoFactor' in budgetPolicy) errors.push('The retired content-relative injection factor is still published as a budget policy.')
  if (!/createBudgetResolver/.test(readFileSync(join(root,'index.js'),'utf8')) || !/resolveBudget/.test(readFileSync(join(root,'lib/injection.js'),'utf8'))) errors.push('Injection is not wired to the session-model budget resolver.')
  if (!/budgetWindowRatio/.test(readFileSync(join(root,'lib/defaults.js'),'utf8')) || !/windowTokens \* ratio/.test(readFileSync(join(root,'lib/defaults.js'),'utf8'))) errors.push('The injection cap does not compute window × ratio.')
  if (!/budget-auto-semantics-changed/.test(readFileSync(join(root,'lib/settings.js'),'utf8'))) errors.push('The legacy auto semantics change has no explicit migration diagnostic.')
  if (!/data-single-readout/.test(client) || !/injectedTokens/.test(client) || !/fullMemoryTokens/.test(client) || !/nextWakeInMinutes/.test(client)) errors.push('Memory/Dreaming are missing their coherent current-mode/countdown readouts.')
  const cards = [...client.matchAll(/ui\.registerCard\(\{ id: '([^']+)'/g)].map(match => match[1])
  if (JSON.stringify(FAMILY_DESCRIPTOR.ui.cards) !== JSON.stringify(['memory','dreaming']) || JSON.stringify(cards) !== JSON.stringify(['memory','dreaming'])) errors.push('The descriptor and Client must register exactly memory,dreaming; Native belongs inside Memory.')
  for (const marker of ['data-memory-inject-toggle','memoryModeLabel','data-memory-file-list','data-native-region','data-dreaming-actions']) if (!client.includes(marker)) errors.push('Essential visible interaction missing: '+marker)
  for (const action of ['memory-settings','memory-mode','memory-toggle','dream-wake','dream-revert-preview','candidate-review']) if (!client.includes(action)) errors.push('Existing interaction handler missing: '+action)
  results.push({presentation: descriptors.counts, readOnly: descriptors.readonlyItems.map(item => item.path), budget: { ratioDefault: budgetRatio.default, fallbackWindowTokens: budgetPolicy.budgetFallbackWindowTokens }})
  const presentation = descriptors.presentation, basic = descriptors.settings.filter(field=>field.importance==='basic').sort((a,b)=>a.basicOrder-b.basicOrder)
  // Bounded context: the Resident must never send a request the route window would reject.
  for (const key of ['rotationEnabled', 'rotationContextRatio']) if (!data.fields[key] || data.fields[key].group !== 'dreaming') errors.push('Resident rotation setting is missing or misfiled: ' + key)
  const rotationSource = readFileSync(join(root, 'lib/dreaming/rotation.js'), 'utf8'), residentSource = readFileSync(join(root, 'lib/dreaming/resident.js'), 'utf8')
  if (!/rotationBudget/.test(rotationSource) || !/reservedCompletionTokens/.test(rotationSource) || !/messageBudgetTokens/.test(rotationSource)) errors.push('Rotation arithmetic does not subtract the route-reserved completion.')
  if (!/contextPressure/.test(residentSource) || !/projectionKey\('context-pressure'\)/.test(residentSource)) errors.push('Rotation does not read the native context-pressure projection.')
  if (!/carriedRoute/.test(residentSource) || !/carried-from-retired-session/.test(residentSource)) errors.push('Rotation does not carry the retired session route into the replacement.')
  // P0 2026-11-22: a rotation attempted inside a running turn rejected every wake forever.
  if (!/turnBoundary/.test(residentSource) || !/stale-running/.test(residentSource)) errors.push('Rotation cannot distinguish a stale running status from an open turn.')
  if (!/rotationCapacity/.test(residentSource) || !/capacity\.fits/.test(residentSource)) errors.push('The wake path is gated behind rotation without a fit check.')
  if (!/rotationFailures/.test(residentSource) || !/rotationEscalateAfter/.test(residentSource)) errors.push('Repeated rotation failures never escalate to an operator diagnostic.')
  if (!/maintain\(\)/.test(residentSource) || !/idle-boundary/.test(residentSource)) errors.push('Rotation does not run at an idle boundary.')
  if (!/rotationFailures/.test(readFileSync(join(root, 'lib/dreaming/state.js'), 'utf8'))) errors.push('The durable state cannot record rotation failures.')
  if (!/dream-rotate/.test(readFileSync(join(root, 'index.js'), 'utf8')) || !/rotateSession/.test(readFileSync(join(root, 'client.js'), 'utf8'))) errors.push('The operator rotation action is not exposed on the host and the card.')
  // Session-read budget: every cold-log decode site consumes the family contract's policy.
  const budgetSource = readFileSync(join(root, 'lib/session-budget.js'), 'utf8'), sessionsSource = readFileSync(join(root, 'lib/dreaming/sessions.js'), 'utf8'), readsSource = readFileSync(join(root, 'lib/session-reads.js'), 'utf8')
  if (!/createSessionReadBudget/.test(budgetSource) || !/sessionReadLimits/.test(budgetSource) || !/family-settings/.test(budgetSource)) errors.push('Session-read limits are not resolved from the family settings through the contract.')
  if (!/sessionsSkipped/.test(sessionsSource) || !/sessionCheck/.test(sessionsSource) || !/sessionReadSkipFacts/.test(sessionsSource)) errors.push('The dream delta does not report skipped logs as first-class diagnostics.')
  if (!/sessionBudget/.test(readsSource) || !/allowSkipped/.test(readsSource)) errors.push('The read-model path does not consume the session-read budget.')
  if (!/pageCost\(/.test(sessionsSource) || !/reviewCost/.test(sessionsSource)) errors.push('Page reads do not reuse one decoded log per review.')
  if (/(maxSizeMb\s*:\s*30|maxAgeDays\s*:\s*7|30\s*\*\s*1024\s*\*\s*1024)/.test(budgetSource + sessionsSource + readsSource)) errors.push('Session-read thresholds are duplicated as literals; they must come from the family contract.')
  if (!/diag\.sessionReadSkipped/.test(readFileSync(join(root, 'locale/en.json'), 'utf8'))) errors.push('The session-read skip diagnostic is not localized.')
  if (presentation?.version !== 2 || basic.map(field=>field.path).join(',') !== 'defaultMode,injectEnabled,dreamEnabled' || descriptors.settings.filter(field=>field.importance==='advanced').length !== 52 || presentation.advancedGroups.length !== 7) errors.push('Memory basic3/advanced52 shared presentation data is incomplete.')
  for (const field of descriptors.settings) { const effectKey = refKey(field.effect), en = dictionaries.en[effectKey], zh = dictionaries.zh[effectKey];if (!en || !zh || [...zh].length > 60 || /[\r\n]/.test(zh)) errors.push('Missing/oversized effect: '+field.path);if(client.includes(zh))errors.push('Client owns a copied effect sentence: '+field.path) }
  if (!/h\(kit\.SettingsLayout/.test(client) || !/h\(kit\.SettingHelp/.test(client) || /gb-advanced-settings/.test(client)) errors.push('Memory must consume the shared widgets layout/help, not own folding.')
  if (/source\.maxBytes \?\? ['"]\?/.test(client) || /badge\(kit, file\.status/.test(client)) errors.push('Native instruction data still exposes mystery placeholders/status enums.')
  const tokenCap = effectiveBudget(shipped, [], { windowTokens: 1000000 })
  if (tokenCap.capTokens !== 100000 || tokenCap.budgetBytes !== null || tokenCap.unit !== 'tokens') errors.push('Auto cap is not unambiguously token-based.')
  if (reviewInventoryBudget({...shipped,budgetMode:'fixed',budgetFixedBytes:4096},[{content:'x'.repeat(1000)}]).budgetBytes !== 4096 || reviewInventoryBudget(shipped,[{content:'x'.repeat(1000)}]).budgetBytes !== 1300) errors.push('Review budgets changed with injection tokenization.')
  if (!/data-memory-tokenizer-basis/.test(client) || !/basisLine/.test(client)) errors.push('The tokenizer basis is missing from visible settings content.')
  const registry = JSON.parse(readFileSync(join(root,'lib/tokenizer-assets/registry.json'),'utf8')), record = registry.tokenizers.find(row=>row.key===registry.defaultTokenizer)
  const assets = join(root,'lib/tokenizer-assets',record.directory), asset = JSON.parse(readFileSync(join(assets,'manifest.json'),'utf8'))
  if (asset.id !== record.id || asset.revision !== record.revision || asset.schemaVersion !== 1) errors.push('Tokenizer revision/schema mismatch.')
  if (JSON.stringify(asset.files.map(row=>row.path).sort()) !== JSON.stringify(['LICENSE','tokenizer.json','tokenizer_config.json'])) errors.push('Unexpected tokenizer payload; model weights are forbidden.')
  for (const row of asset.files) { const bytes = readFileSync(join(assets,row.path));if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256 || row.url !== 'https://huggingface.co/'+record.id+'/resolve/'+record.revision+'/'+row.path) errors.push('Tokenizer data provenance mismatch: '+row.path) }
  const runtime = join(root,'lib',record.runtime.directory), runtimeManifest = JSON.parse(readFileSync(join(runtime,'manifest.json'),'utf8'))
  if (runtimeManifest.name !== record.runtime.name || runtimeManifest.version !== record.runtime.version) errors.push('Tokenizer runtime version mismatch.')
  for (const row of runtimeManifest.files) { const bytes = readFileSync(join(runtime,row.path));if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) errors.push('Vendored tokenizer runtime mismatch: '+row.path) }
  if (!pkg.files.includes('THIRD_PARTY_NOTICES.md') || !existsSync(join(root,'THIRD_PARTY_NOTICES.md')) || readFileSync(join(assets,'LICENSE')).length < 1000 || readFileSync(join(runtime,'LICENSE')).length < 1000) errors.push('Third-party notices or original licenses are not distributed.')
  results.push({tokenizer:{id:record.id,revision:record.revision,runtime:runtimeManifest.version,dataFiles:asset.files,runtimeFiles:runtimeManifest.files},tokenCap:tokenCap.capTokens})
  if (pkg.files.some(path=>path==='node_modules'||path.startsWith('node_modules/'))) errors.push('Package files includes development dependencies.')
  const iconSvg = readFileSync(join(root,'icon.svg'),'utf8')
  if (pkg.exports?.['./icon'] !== './icon.svg') errors.push('Package must export ./icon for the Plugins page.')
  if (!pkg.files.includes('icon.svg')) errors.push('icon.svg must ship in the package.')
  if (!/^<svg[\s>]/.test(iconSvg.trim())) errors.push('icon.svg must be an SVG document.')
  return {ok:errors.length===0,packageName:pkg.name,version:pkg.version,clientId:id,fields:Object.keys(data.fields).length,prompts:Object.keys(prompts).length,checkedSourceFiles:candidates.length-vendors.size,results,errors}
}
// Canonical comparison: a symlinked/junctioned checkout must still run the gate.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href===import.meta.url) {const result=check();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1}
