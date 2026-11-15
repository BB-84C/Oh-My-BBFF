/** Read-only installed-native registration enumerator for the SDK coverage gate. */
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const slash=value=>value.replaceAll('\\','/')
export function enumerateNativeTools({nativeRoot,parser}={}){
 if(typeof nativeRoot!=='string'||!path.isAbsolute(nativeRoot))throw new TypeError('Pass the installed @deepseek-ai package directory explicitly')
 const require=createRequire(path.resolve(nativeRoot,'../../package.json')),ts=parser||require('typescript'),records=[],packages=[],corpus=[],errors=[]
 const definitionName=node=>{const expr=node.expression;return ts.isIdentifier(expr)?/^define(?:Content)?Tool(?:\$\d+)?$/.test(expr.text):ts.isPropertyAccessExpression(expr)&&expr.name.text==='defineTool'}
 const registration=node=>ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='register'&&(node.expression.expression.getText().endsWith('.tools')||node.expression.expression.getText()==='tools')
 function valueOf(node,source){
  if(!node)return {form:'missing',expression:''}
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return {form:'literal',name:node.text,expression:node.getText(source)}
  if(ts.isCallExpression(node)&&(definitionName(node)||(node.arguments[0]&&ts.isCallExpression(node.arguments[0])&&definitionName(node.arguments[0]))))return valueOf(node.arguments[0],source)
  if(ts.isObjectLiteralExpression(node)){
   const prop=node.properties.find(prop=>(ts.isPropertyAssignment(prop)||ts.isShorthandPropertyAssignment(prop))&&(prop.name?.text==='name'))
   if(prop)return valueOf(ts.isShorthandPropertyAssignment(prop)?prop.name:prop.initializer,source)
  }
  return {form:'dynamic',expression:node.getText(source)}
 }
 function walkFiles(dir,base,output){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const full=path.join(dir,entry.name),relative=slash(path.relative(base,full))
   if(entry.isDirectory()){if(!['client','devtools','dist','assets','node_modules'].includes(entry.name))walkFiles(full,base,output);continue}
   if(!entry.isFile()||!entry.name.endsWith('.js')||/^(client(?:\.|$)|typert\.)/.test(entry.name))continue
   output.push({full,relative})
  }
 }
 for(const entry of fs.readdirSync(nativeRoot,{withFileTypes:true})){
  if(!entry.isDirectory()||!entry.name.startsWith('dsh'))continue
  const dir=path.join(nativeRoot,entry.name),manifest=path.join(dir,'package.json')
  if(!fs.existsSync(manifest))continue
  const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));if(!pkg.name?.startsWith('@deepseek-ai/dsh'))continue
  packages.push({packageName:pkg.name,packageVersion:pkg.version})
  const configurations=[]
  const collectConfigs=(base)=>{for(const item of fs.readdirSync(base,{withFileTypes:true})){const full=path.join(base,item.name);if(item.isDirectory()){if(!['lib','node_modules','locale','dist','assets'].includes(item.name))collectConfigs(full)}else if(item.isFile()&&/\.ya?ml$/.test(item.name))configurations.push(full)}}
  collectConfigs(dir)
  for(const full of configurations){
   try{
    const yaml=require('yaml'),text=fs.readFileSync(full,'utf8'),lines=new yaml.LineCounter(),document=yaml.parseDocument(text,{lineCounter:lines})
    corpus.push({packageName:pkg.name,packageVersion:pkg.version,file:slash(path.relative(dir,full)),sha256:createHash('sha256').update(text).digest('hex')})
    if(document.errors.length)throw new Error('YAML parse diagnostics')
    yaml.visit(document,{Map(_key,node){
     const owner=node.get('name',true),config=node.get('config',true),toolName=config?.get?.('toolName',true)
     if(typeof owner?.value!=='string'||!owner.value.startsWith('@deepseek-ai/dsh')||toolName===undefined)return
     const ownerPackage=owner.value.split('/').slice(0,2).join('/'),ownerDir=path.join(nativeRoot,ownerPackage.split('/')[1]),ownerManifest=JSON.parse(fs.readFileSync(path.join(ownerDir,'package.json'),'utf8')),relative=slash(path.relative(dir,full)),line=lines.linePos(toolName.range[0]).line
     records.push({packageName:ownerPackage,packageVersion:ownerManifest.version,file:pkg.name+'/'+relative,line,kind:'configuration',sha256:createHash('sha256').update(String(toolName.value)).digest('hex'),form:typeof toolName.value==='string'?'literal':'dynamic',...(typeof toolName.value==='string'?{name:toolName.value}:{}),expression:'config.toolName',declarerPackage:pkg.name})
    }})
   }catch{errors.push({packageName:pkg.name,file:slash(path.relative(dir,full)),reason:'Bundled configuration aliases could not be parsed'})}
  }
  const files=[];if(fs.existsSync(path.join(dir,'lib')))walkFiles(path.join(dir,'lib'),dir,files)
  for(const {full,relative}of files){
   const text=fs.readFileSync(full,'utf8');corpus.push({packageName:pkg.name,packageVersion:pkg.version,file:relative,sha256:createHash('sha256').update(text).digest('hex')});if(!/define(?:Content)?Tool|\.tools\.register|\btools\.register/.test(text))continue
   const source=ts.createSourceFile(full,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
   if(source.parseDiagnostics.length){errors.push({packageName:pkg.name,file:relative,reason:'JavaScript parser diagnostics'});continue}
   function visit(node){
    if(ts.isCallExpression(node)&&(definitionName(node)||registration(node))){
     const kind=definitionName(node)?'definition':'registration',line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,arg=node.arguments[0]
     let identity=valueOf(arg,source)
     if(kind==='definition'&&arg&&ts.isObjectLiteralExpression(arg))identity=valueOf(arg,source)
     const record={packageName:pkg.name,packageVersion:pkg.version,file:relative,line,kind,sha256:createHash('sha256').update(node.getText(source)).digest('hex'),...identity}
     if(identity.form==='dynamic'){
      // Text is a bounded locator only, not executable data or raw config.
      record.expression=identity.expression.slice(0,180)
     }
     records.push(record)
    }
    ts.forEachChild(node,visit)
   }
   visit(source)
  }
 }
 return {packages:packages.sort((a,b)=>a.packageName.localeCompare(b.packageName)),corpus:corpus.sort((a,b)=>a.packageName.localeCompare(b.packageName)||a.file.localeCompare(b.file)),records:records.sort((a,b)=>a.packageName.localeCompare(b.packageName)||a.file.localeCompare(b.file)||a.line-b.line||a.kind.localeCompare(b.kind)),errors}
}
export function verifyNativeToolCoverage(inventory,manifest,baseline){
 const rows=Array.isArray(manifest)?manifest:[],sites=new Map(),uncovered=[],mismatched=[],errors=[...(inventory.errors||[])]
 const key=site=>site.packageName+'\0'+site.file+'\0'+site.line+'\0'+site.kind
 for(const row of rows){
  if(!['read','write','delegate','unknown'].includes(row.effect)||typeof row.reason!=='string'||!row.reason.trim()||!Array.isArray(row.names)||!Array.isArray(row.sites))errors.push({id:row.id,reason:'Effect coverage entry needs a class, reason, explicit names and evidence sites'})
  for(const site of row.sites||[]){const id=key({...site,packageName:row.ownerPackage});if(sites.has(id))errors.push({id,reason:'Duplicate coverage site'});sites.set(id,{row,site})}
 }
 const actual=new Set()
 for(const record of inventory.records||[]){
  const id=key(record);actual.add(id);const found=sites.get(id)
  if(!found){uncovered.push(record);continue}
  const {row,site}=found
  if(row.packageVersion!==record.packageVersion||site.sha256!==record.sha256||(record.form==='literal'&&!row.names.includes(record.name)))mismatched.push({record,id:row.id,reason:'Owning version, exact source call or literal tool identity changed'})
 }
 const obsolete=[...sites].filter(([id])=>!actual.has(id)).map(([id,entry])=>({id,entry:entry.row.id}))
 const sourceChanges=[]
 if(!baseline||!Array.isArray(baseline.packages)||!Array.isArray(baseline.corpus))errors.push({reason:'Reviewed complete native source corpus baseline is required'})
 else{
  for(const field of ['packages','corpus']){
   const id=row=>row.packageName+(field==='corpus'?'\0'+row.file:'')
   const before=new Map(baseline[field].map(row=>[id(row),row])),after=new Map((inventory[field]||[]).map(row=>[id(row),row]))
   for(const key of new Set([...before.keys(),...after.keys()]))if(JSON.stringify(before.get(key))!==JSON.stringify(after.get(key)))sourceChanges.push({kind:field,id:key,reason:!before.has(key)?'new':!after.has(key)?'removed':'changed'})
  }
 }
 return {complete:!errors.length&&!uncovered.length&&!mismatched.length&&!obsolete.length&&!sourceChanges.length,uncovered,mismatched,obsolete,sourceChanges,errors}
}
// Canonical comparison: a symlinked/junctioned checkout must still run the inventory.
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href){
 const nativeRoot=process.argv[2]
 console.log(JSON.stringify(enumerateNativeTools({nativeRoot}),null,2))
}
