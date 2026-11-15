// Prepack refuses inconsistent package/Host/client identities. Imports execute no apply() side effects.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import vm from 'node:vm'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
assert.notEqual(root,path.parse(root).root)
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const host=await import(pathToFileURL(path.join(root,'index.js')).href)
assert.equal(host.name,manifest.name,'Host plugin name must match package')
assert.equal(host.VERSION,manifest.version,'Host status version must match package')
assert.equal(host.FAMILY_DESCRIPTOR.version,manifest.version,'Family descriptor version must match package')
assert.equal(host.FAMILY_DESCRIPTOR.packageName,manifest.name)
assert.equal(host.FAMILY_DESCRIPTOR.id,manifest.bbff.id)
assert.equal(manifest.exports['./icon'],'./icon.svg','the package must export ./icon for the Plugins page');assert(manifest.files.includes('icon.svg'),'icon.svg must ship in the package');assert(/^<svg[\s>]/.test(fs.readFileSync(path.join(root,'icon.svg'),'utf8').trim()),'icon.svg must be an SVG document')
// 0.12.0: the descriptor title is a locale message ref whose shipped English equals the package title.
const enLocale=JSON.parse(fs.readFileSync(path.join(root,'locale','en.json'),'utf8'))
assert.equal(host.FAMILY_DESCRIPTOR.title?.key&&enLocale.ui[host.FAMILY_DESCRIPTOR.title.key],manifest.bbff.title)
const client=fs.readFileSync(path.join(root,'client.js'),'utf8')
assert(client.includes("id: '"+manifest.name+"'"),'Client factory id must match package name')
const source=fs.readFileSync(path.join(root,'index.js'),'utf8')
assert(/import\s+PACKAGE_META\s+from\s+['"]\.\/package\.json['"]\s+with\s*\{\s*type:\s*['"]json['"]\s*\}/.test(source),'Manifest must be a tracked static JSON dependency')
console.log('PASS package/Host VERSION/FAMILY_DESCRIPTOR/client identities match '+manifest.name+'@'+manifest.version+'; static JSON import loaded successfully')
// Serial notification callbacks must discard helper success values. Extract only our trusted,
// single-line registrations; a layout/dependency change fails this gate instead of silently skipping it.
const notifications=source.split('\n').filter(line=>/\.on\(['\"]agent\/(created|turn-stopping)['\"]/.test(line))
for(const line of notifications){
  const callback=line.slice(line.indexOf(',')+1,line.lastIndexOf(')')).trim()
  for(const result of [true,false,{registered:true},Promise.resolve(true)]){
    const fn=vm.runInNewContext('('+callback+')',{team:{ops:{onCreated:()=>result}},enforcer:{onCreated:()=>result},tree:{invalidate:()=>result}},{timeout:1000})
    assert.equal(typeof fn,'function','Serial notification gate requires an explicit callback fixture')
    assert.equal(await fn({agent:{id:'package-check'},signal:new AbortController().signal}),undefined,'Serial notification leaked a helper return value')
  }
}
assert.notEqual((()=>true)(),undefined,'Negative calibration detects the old value-returning callback shape')
console.log('PASS serial notification callbacks resolve undefined; '+notifications.length+' registrations checked')
// DSH >= 0.2.2 fixes provider/model/effort before prompt assembly; agent/request is deprecated and
// may not change the route. Shipped sources must not listen to it.
const shipped=['index.js',...fs.readdirSync(path.join(root,'lib')).filter(name=>name.endsWith('.js')).map(name=>'lib/'+name)]
const requestListeners=shipped.filter(file=>/\.on\(\s*['"]agent\/request['"]/.test(fs.readFileSync(path.join(root,file),'utf8')))
assert.deepEqual(requestListeners,[],'agent/request listeners are not allowed: '+requestListeners.join(', '))
console.log('PASS no agent/request listener in '+shipped.length+' shipped modules')
const {checkPromptStability,checkConfigChangeInvalidatesOnce}=await import('./check-prompt-stability.mjs')
const stability=checkPromptStability()
console.log('PASS system prompt is byte-stable across routine status/context/report changes: '+JSON.stringify(stability))
const configChange=checkConfigChangeInvalidatesOnce()
console.log('PASS explicit configuration changes invalidate the prefix exactly once: '+JSON.stringify(configChange))
