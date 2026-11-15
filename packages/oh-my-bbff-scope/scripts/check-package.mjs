// Prepack checks run without apply(): no owner state, catalog activity or native services.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');assert.notEqual(root,path.parse(root).root)
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),host=await import(pathToFileURL(path.join(root,'index.js')).href)
assert.equal(manifest.private,undefined,'release gate: the manifest must be publishable (no "private" flag)');assert.equal(manifest.engines.dsh,'>=0.2.2-rc.2')
assert.equal(host.name,manifest.name);assert.equal(host.VERSION,manifest.version);assert.equal(host.FAMILY_DESCRIPTOR.version,manifest.version);assert.equal(host.FAMILY_DESCRIPTOR.packageName,manifest.name);assert.equal(host.FAMILY_DESCRIPTOR.id,manifest.bbff.id)
assert.equal(manifest.exports['./icon'],'./icon.svg','the package must export ./icon for the Plugins page');assert(manifest.files.includes('icon.svg'),'icon.svg must ship in the package');assert(/^<svg[\s>]/.test(fs.readFileSync(path.join(root,'icon.svg'),'utf8').trim()),'icon.svg must be an SVG document')
const source=fs.readFileSync(path.join(root,'index.js'),'utf8');assert(/import\s+packageInfo\s+from\s+['"]\.\/package\.json['"]\s+with\s*\{\s*type:\s*['"]json['"]\s*\}/.test(source),'Static manifest dependency is required for HMR identity')
let registered;vm.runInNewContext(fs.readFileSync(path.join(root,'client.js'),'utf8'),{window:{__ModuleLoader__:{load:value=>{registered=value}}}},{timeout:1000});assert.equal(registered.id,manifest.name);assert.equal(typeof registered.factory,'function');console.log('PASS manifest/Host/family/client identities '+manifest.name+'@'+manifest.version)
const shipped=['index.js',...fs.readdirSync(path.join(root,'lib')).filter(name=>name.endsWith('.js')).map(name=>'lib/'+name)]
for(const file of shipped){const text=fs.readFileSync(path.join(root,file),'utf8');assert(!/\.on\(\s*['"]agent\/request['"]/.test(text),'Removed model mutation seam: '+file);assert(!/\.stateOf\s*\(/.test(text),'Deprecated projection API: '+file)}
const engine=fs.readFileSync(path.join(root,'lib/engine.js'),'utf8'),rules=fs.readFileSync(path.join(root,'lib/rules.js'),'utf8');assert(!/assembly\.tools|\btools\s*:/.test(rules.slice(rules.indexOf('export function filterAssembly'))),'Presentation waterfall must not read or return tool declarations')
const callback=engine.match(/ctx\.on\('agent\/created',\s*(async\s*\([^\n]+?\}\s*)\);/);assert(callback,'Serial agent/created fixture must remain explicit');for(const value of [true,false,{ok:true}]){const fn=vm.runInNewContext('('+callback[1]+')',{applyAgent:async()=>value});assert.equal(await fn({agent:{}}),undefined,'Serial notification must not leak a return value')}
const {filterAssembly}=await import(pathToFileURL(path.join(root,'lib/rules.js')).href);const presentation=new Proxy({sections:[],contexts:[],variables:{}},{get:(value,key)=>{assert.notEqual(key,'tools','Forbidden assembly tools access');return Reflect.get(value,key)}});assert(!Object.hasOwn(filterAssembly(presentation,[]),'tools'))
console.log('PASS0.2.2 presentation-only filter; no removed model/projection seams; serial notification returns void')
// i18n gate: shipped dictionaries are the only copy source (DESIGN.md §6 a-c).
const localeDir=path.join(root,'locale'),readLocale=name=>JSON.parse(fs.readFileSync(path.join(localeDir,name+'.json'),'utf8'))
const en=readLocale('en'),zh=readLocale('zh');assert(en.meta?.title&&en.meta?.description&&zh.meta?.title&&zh.meta?.description,'locale meta is required')
const flat=(name,dict)=>{assert(dict&&typeof dict==='object'&&!Array.isArray(dict),name+' ui must be a flat object');for(const [key,value] of Object.entries(dict)){assert(typeof value==='string'&&value.trim(),name+'.ui.'+key+' must be a non-empty string');assert(!/[\u4e00-\u9fff]/.test(value)||name==='zh','no CJK in en values: '+key)}}
flat('en',en.ui);flat('zh',zh.ui)
const enKeys=Object.keys(en.ui).sort(),zhKeys=Object.keys(zh.ui).sort();assert.deepEqual(enKeys,zhKeys,'en/zh key sets must match')
const placeholders=text=>[...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m=>m[1]).sort();for(const key of enKeys)assert.deepEqual(placeholders(en.ui[key]),placeholders(zh.ui[key]),'placeholder mismatch: '+key)
// Vendored SDK copies are checked by `sync-into --check`, not here; foreign
// legacy `{ en, … }` maps are passed through, never authored by Scope.
const VENDORED=new Set(['lib/bbff-contract.js','lib/dsh-adapter.js'])
const PASS_THROUGH=[/\.\.\.\(module\.exclusiveTools\.reasonLocales \? \{ reasonLocales: \{ \.\.\.module\.exclusiveTools\.reasonLocales \} \} : \{\}\)/,/\.\.\.\(module\.exclusiveTools\.reasonLocales \? \{ reasonLocales: module\.exclusiveTools\.reasonLocales \} : \{\}\)/,/reason: module\.requiredTools\.reasonLocales \|\| module\.requiredTools\.reason/,/record\.reasonLocales \|\| record\.reason/]
const owned=[...shipped.filter(file=>!VENDORED.has(file)),'client.js'].map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')])
for(const [file,text] of owned){
  for(const match of text.matchAll(/\b(?:tr|t|msg)\(\s*'([A-Za-z0-9_.-]+)'/g)){if(match[1].endsWith('_'))continue;assert(Object.hasOwn(en.ui,match[1]),'key used but missing from locale/en.json: '+file+' '+match[1])}
  assert(!/[\u4e00-\u9fff]/.test(text),'no CJK in shipped code: '+file)
  const cleaned=PASS_THROUGH.reduce((value,pattern)=>value.replace(pattern,''),text)
  assert(!/reasonLocales\s*:|titleLocales\s*:|\bdetectLang\b|\bconst DICT\b|kit\.locale\s*\(/.test(cleaned),'no legacy locale shapes: '+file)
}
console.log('PASS i18n dictionaries: '+enKeys.length+' keys, en/zh parity, keys used by code, no CJK/legacy shapes in shipped code')
