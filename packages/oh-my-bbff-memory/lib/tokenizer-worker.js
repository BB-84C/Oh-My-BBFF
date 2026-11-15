/** Offline tokenizer isolate: pinned local JSON + pure JS; no networking or remote code. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parentPort, workerData } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
// Deliberately deny fetch in this isolate, including in dependency code. Assets are local only.
globalThis.fetch = () => { throw new Error('Memory tokenizer is offline; network access is disabled') }
const start=performance.now()
let tokenizer
try {
  const { record, assets, runtime }=workerData
  const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'),'utf8')),vendor=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json'),'utf8'))
  if(manifest.schemaVersion!==1||manifest.id!==record.id||manifest.revision!==record.revision||vendor.name!==record.runtime.name||vendor.version!==record.runtime.version)throw new Error('Tokenizer/runtime version mismatch')
  const contents={}
  for(const row of manifest.files){const b=fs.readFileSync(path.join(assets,row.path));if(b.length!==row.bytes||createHash('sha256').update(b).digest('hex')!==row.sha256)throw new Error('Tokenizer asset checksum mismatch: '+row.path);contents[row.path]=b}
  for(const row of vendor.files){const b=fs.readFileSync(path.join(runtime,row.path));if(b.length!==row.bytes||createHash('sha256').update(b).digest('hex')!==row.sha256)throw new Error('Tokenizer runtime checksum mismatch: '+row.path)}
  const { Tokenizer }=await import(pathToFileURL(path.join(runtime,'tokenizers.mjs')).href)
  tokenizer=new Tokenizer(JSON.parse(contents['tokenizer.json'].toString('utf8')),JSON.parse(contents['tokenizer_config.json'].toString('utf8')))
  parentPort.postMessage({kind:'ready',initMs:performance.now()-start})
}catch(error){parentPort.postMessage({kind:'unavailable',reason:String(error?.message||error)});parentPort.close()}
if(tokenizer)parentPort.on('message',({id,text})=>{try{const t=performance.now(),tokens=tokenizer.encode(text,{add_special_tokens:false}).ids.length;parentPort.postMessage({id,tokens,encodeMs:performance.now()-t})}catch(error){parentPort.postMessage({id,error:String(error?.message||error)})}})
