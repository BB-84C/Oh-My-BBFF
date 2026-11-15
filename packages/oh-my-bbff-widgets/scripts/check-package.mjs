// Publish gate: exercise package identity declarations without profile access, timers or data-file writes.
import assert from 'node:assert/strict'
import {readFileSync,realpathSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import manifest from '../package.json' with {type:'json'}
import {FAMILY_DESCRIPTOR,createFamilyRegistry,familyPayload} from '../lib/family.js'
import {createRootSettingsStore} from '../lib/settings.js'

export function checkPackageIdentity(){
 const registry=createFamilyRegistry();registry.register(FAMILY_DESCRIPTOR)
 const payload=familyPayload(registry),settings=createRootSettingsStore({dir:path.dirname(fileURLToPath(import.meta.url)),root:FAMILY_DESCRIPTOR}).peek()
 const versions={FAMILY_DESCRIPTOR:FAMILY_DESCRIPTOR.version,registryRoot:registry.root.version,familyRoot:payload.root.version,selfModule:payload.modules.find(row=>row.id===manifest.bbff.id)?.version,settingsRoot:settings.root.version}
 for(const [name,version]of Object.entries(versions))assert.equal(version,manifest.version,name+' must equal package.version')
 assert.equal(FAMILY_DESCRIPTOR.packageName,manifest.name);assert.equal(FAMILY_DESCRIPTOR.id,manifest.bbff.id)
 const files=['index.js','lib/exposure.js','lib/exposure-store.js','lib/exposure-snapshots.js','lib/family.js']
 for(const name of files){const code=readFileSync(new URL('../'+name,import.meta.url),'utf8');assert.match(code,/^import (?:ROOT_PACKAGE|pkg) from ['"]\.\.?\/package\.json['"] with\s*\{\s*type:\s*['"]json['"]\s*\}/m,name+' needs a tracked static JSON manifest edge');assert.doesNotMatch(code,/readFileSync\([^\n]*package\.json/,name+' must not hide identity behind untracked filesystem IO')}
 const entry=readFileSync(new URL('../index.js',import.meta.url),'utf8');assert.match(entry,/family\.register\(\{\.\.\.FAMILY_DESCRIPTOR,/,'Actual Root registration must consume the guarded descriptor')
 const client=readFileSync(new URL('../client.js',import.meta.url),'utf8');assert.ok(client.includes("id: '"+manifest.name+"'"),'Classic Client factory id must equal package.name')
 return {name:manifest.name,version:manifest.version,versions,staticManifestEdges:files,profileAccess:false,dataWrites:false}
}
// Canonical comparison: a symlinked/junctioned checkout must still run the gate.
if(process.argv[1]&&realpathSync(path.resolve(process.argv[1]))===realpathSync(fileURLToPath(import.meta.url))){const result=checkPackageIdentity();console.log('PASS publish identity gate '+JSON.stringify(result))}
