#!/usr/bin/env node
/** Build from the single template; release hashes are extracted, never manually listed. */
import fs from 'node:fs'
import {dirname,join,resolve,relative,basename,isAbsolute} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import {generatePackagedSkill,skillHash} from '../lib/skill-package.js'
export function buildSkill({root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),receipt}={}){
 // Receipts belong to one gitignored directory of the development checkout, so the
 // package tree stays clean whether this runs standalone or inside a monorepo.
 const workspace=dirname(root),repoRoot=(()=>{let dir=workspace;for(let depth=0;depth<4;depth++){if(fs.existsSync(join(dir,'pnpm-workspace.yaml')))return dir;const next=dirname(dir);if(next===dir)break;dir=next}return workspace})(),pkg=JSON.parse(fs.readFileSync(join(root,'package.json'),'utf8')),data=JSON.parse(fs.readFileSync(join(root,'lib/defaults.json'),'utf8')),prompts=JSON.parse(fs.readFileSync(join(root,'lib/prompt-defaults.json'),'utf8')),content=generatePackagedSkill(prompts.skill,data),member='package/skills/update-memory/SKILL.md',output=join(root,'skills/update-memory/SKILL.md'),ledgerPath=join(root,'lib/skill-releases.json'),entries=[],skipped=[]
 const rel=path=>relative(workspace,path).replaceAll('\\','/'),tar=(archive,name)=>spawnSync('tar',['-xOf',archive,name],{windowsHide:true,timeout:10000,maxBuffer:data.fields.toolWriteMaxBytes.max,encoding:null})
 // Preserve previously generated provenance when a historical archive is not in this checkout.
 if(fs.existsSync(ledgerPath)){const old=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));if(old.generatedBy==='scripts/generate-skill.mjs'&&Array.isArray(old.entries))entries.push(...old.entries)}
 const archives=fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isFile()&&/^oh-my-bbff-memory-\d+\.\d+\.\d+\.tgz$/.test(entry.name)).map(entry=>join(root,entry.name)).sort()
 for(const archive of archives){
  const body=tar(archive,member)
  if(body.status!==0){skipped.push({packagePath:rel(archive),reason:'No packaged update-memory member in this historical archive.'});continue}
  const metadata=tar(archive,'package/package.json');if(metadata.status!==0)throw new Error('Published package metadata unavailable: '+basename(archive));const old=JSON.parse(metadata.stdout.toString('utf8'))
  if(old.name!==pkg.name)throw new Error('Historical package identity mismatch.')
  entries.push({version:old.version,packagePath:rel(archive),packageSha256:skillHash(fs.readFileSync(archive)),member,sha256:skillHash(body.stdout),bytes:body.stdout.length,origin:'extracted-published-package'})
 }
 if(!entries.some(entry=>entry.version==='0.6.4'&&entry.origin==='extracted-published-package'))throw new Error('At least the actual published0.6.4 skill is required; no handwritten baseline hash fallback.')
 // Required on EVERY pack: next release can recognize this release's exact shipped body.
 const current={version:pkg.version,packagePath:'this-package/'+pkg.name+'@'+pkg.version,member,sha256:skillHash(content),bytes:content.length,origin:'current-pack-generated-from-prompt-defaults'}
 entries.push(current)
 const unique=new Map();for(const entry of entries)unique.set([entry.version,entry.packagePath,entry.sha256].join('\0'),entry)
 const ledger={version:1,generatedBy:'scripts/generate-skill.mjs',template:'lib/prompt-defaults.json#skill',current,entries:[...unique.values()].sort((a,b)=>a.version.localeCompare(b.version,undefined,{numeric:true})||a.packagePath.localeCompare(b.packagePath)||a.sha256.localeCompare(b.sha256))}
 fs.mkdirSync(dirname(output),{recursive:true});fs.writeFileSync(output,content);fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n')
 const result={at:new Date().toISOString(),packageName:pkg.name,version:pkg.version,source:'lib/prompt-defaults.json#skill',output:rel(output),outputBytes:content.length,outputSha256:current.sha256,exactGeneratorBytes:fs.readFileSync(output).equals(content),ledger:rel(ledgerPath),entries:ledger.entries,skipped}
 const receiptPath=receipt||join(repoRoot,'.test-artifacts','memory-build','skill-build-receipt.json');const insideCheckout=(parent,child)=>{const tail=relative(resolve(parent),resolve(child));return Boolean(tail)&&tail!=='..'&&!tail.startsWith('..')&&!isAbsolute(tail)};if(!insideCheckout(repoRoot,receiptPath))throw new Error('Receipt must stay inside the development checkout.');fs.mkdirSync(dirname(receiptPath),{recursive:true});fs.writeFileSync(receiptPath,JSON.stringify(result,null,2)+'\n');return result
}
// Canonical comparison: a symlinked/junctioned checkout must still run the generator.
if(process.argv[1]&&pathToFileURL(fs.realpathSync(process.argv[1])).href===import.meta.url){const index=process.argv.indexOf('--receipt'),result=buildSkill({receipt:index>=0?process.argv[index+1]:undefined});console.log(JSON.stringify({output:result.output,bytes:result.outputBytes,sha256:result.outputSha256,releases:result.entries.length,exactGeneratorBytes:result.exactGeneratorBytes},null,2))}
