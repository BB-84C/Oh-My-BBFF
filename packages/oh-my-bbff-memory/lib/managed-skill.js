/** Packaged skill lifecycle: create, recognized-release update, same, or preserve local edits. */
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, renameSync, lstatSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep, join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { DEFAULT_DATA } from './defaults.js'
import { skillHash } from './skill-package.js'
import { readUtf8Bounded } from './io.js'
import { simpleDiff } from './diff.js'
import { withMutationLock } from './mutation-lock.js'
import { msg } from './host-ref.js'
/** Skill lifecycle status to dictionary key (the status id itself stays data). */
const NOTE_KEYS = Object.freeze({ installed: 'installed', updated: 'updated', current: 'current', 'local-modified': 'localModified', failed: 'failed' })
export function createManagedSkill({ home, paths, packagedBytes, releaseManifest }) {
  const path = resolve(home, DEFAULT_DATA.storage.managedSkillRelativePath), owned = relative(resolve(home), path)
  if (!owned || isAbsolute(owned) || owned === '..' || owned.startsWith('..' + sep)) throw new Error('Packaged skill target escapes its home.')
  const content = packagedBytes ? Buffer.from(packagedBytes) : readFileSync(fileURLToPath(new URL('../skills/update-memory/SKILL.md', import.meta.url))), ledger = releaseManifest || JSON.parse(readFileSync(new URL('./skill-releases.json',import.meta.url),'utf8')), desiredHash = skillHash(content), published = new Set((ledger.entries || []).map(entry => entry.sha256))
  if (ledger.current?.sha256 && ledger.current.sha256 !== desiredHash) throw new Error('Packaged skill differs from its generated release receipt.')
  let outcome = null
  const read = () => { const value = readUtf8Bounded(path, DEFAULT_DATA.promptTextMaxBytes), complete = !value.truncated && value.validUtf8;return { ...value, complete, currentHash: value.exists && complete ? skillHash(Buffer.from(value.content,'utf8')) : null } }
  const classify = before => !before.exists ? 'installed' : before.currentHash === desiredHash ? 'current' : before.complete && published.has(before.currentHash) ? 'updated' : 'local-modified'
  const note = status => msg('skill.note.' + NOTE_KEYS[status])
  function status() { const before = read(), current = classify(before);return { path, exists: before.exists, currentHash: before.currentHash, desiredHash, bytes: before.bytes, packagedBytes: content.length, status: current === 'current' && outcome ? outcome.status : current, autoUpdated: outcome?.status === 'updated', note: note(current === 'current' && outcome ? outcome.status : current), source: 'packaged skills/update-memory/SKILL.md', nativeRegistrationKnown: false, ...(outcome?.backup ? { backup: outcome.backup } : {}) } }
  function ensure() {
    try {
      const before = read(), decision = classify(before)
      if (decision === 'current' || decision === 'local-modified') { outcome = { status: decision };return status() }
      return withMutationLock(paths, () => {
        const current = read(), next = classify(current)
        if (next === 'current' || next === 'local-modified') { outcome = { status: next };return status() }
        if (existsSync(path) && lstatSync(path).isSymbolicLink()) { outcome = { status: 'local-modified' };return { ...status(),status:outcome.status,note:note(outcome.status) } }
        const backup = current.exists ? join(paths.historyRoot,'skill-'+randomUUID(),basename(path)) : null
        if (backup) { mkdirSync(dirname(backup),{recursive:true});copyFileSync(path,backup) }
        mkdirSync(dirname(path),{recursive:true});const temporary=path+'.'+randomUUID()+'.tmp';writeFileSync(temporary,content,{flag:'wx'});renameSync(temporary,path);outcome={status:next,backup};return status()
      })
    } catch (error) { outcome = { status:'failed' };return { path,status:'failed',note:note('failed'),error:String(error.message),desiredHash,source:'packaged skills/update-memory/SKILL.md' } }
  }
  function preview() { const before=read();return { ...status(), content:content.toString('utf8'), changed:!before.exists||before.currentHash!==desiredHash, bytesBefore:before.bytes,bytesAfter:content.length,diff:before.complete?simpleDiff(before.content,content.toString('utf8')):'',readOnly:true,localModified:before.exists&&classify(before)==='local-modified' } }
  return { ensure,status,preview }
}
