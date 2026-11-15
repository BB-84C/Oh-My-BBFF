/** Read-only text measurements. Byte caps remain byte caps; token figures are density estimates. */
import { createHash } from 'node:crypto'
import { msg } from './host-ref.js'
const unavailable = reason => ({ readable: false, reason })
function readableReason(error) {
  const code = String(error?.code || '')
  if (['ENOENT','ENOTDIR','FS_NOT_FOUND'].includes(code)) return msg('native.measure.missing')
  if (['EACCES','EPERM','FS_PERMISSION_DENIED','FS_ACCESS_DENIED'].includes(code)) return msg('native.measure.denied')
  if (code === 'FS_TOO_LARGE') return msg('native.measure.tooLarge')
  return msg('native.measure.failed', { error: String(error?.message || error) })
}
export function estimateByteCap(maxBytes, measurements) {
  const readable = measurements.filter(row => row?.readable), bytes = readable.reduce((sum,row)=>sum+row.bytes,0), tokens = readable.reduce((sum,row)=>sum+row.tokens,0)
  if (!Number.isFinite(maxBytes) || maxBytes < 0) return { available: false, reason: msg('native.estimate.invalidBudget') }
  if (maxBytes === 0) return { available: true, tokens: 0, estimated: true, bytesPerToken: null, basis: msg('native.estimate.zeroBudget') }
  if (bytes <= 0 || tokens <= 0) return { available: false, reason: msg('native.estimate.noText') }
  return { available: true, tokens: Math.ceil(maxBytes * tokens / bytes), estimated: true, basis: msg('native.estimate.basis'), sourceBytes: bytes, sourceTokens: tokens }
}
export function createInstructionDisplayReader(counter, { maxReadBytes = 1048576 } = {}) {
  const worlds = new WeakMap()
  return async function measureFile(fs, hostPath, { signal, nativeMaxSourceBytes } = {}) {
    if (!fs?.resolve || !fs?.readBytes || !fs?.stat) return unavailable(msg('native.measure.noFs'))
    let mapped
    try { mapped = fs.processPathFromHostPath?.(hostPath) } catch (error) { return unavailable(readableReason(error)) }
    if (!mapped) return unavailable(msg('native.measure.unmapped'))
    let cache = worlds.get(fs);if (!cache) { cache = new Map();worlds.set(fs,cache) }
    try {
      const target = await fs.resolve(mapped,{signal}), stat = await fs.stat(target,signal)
      if (!stat || stat.type !== 'file') return unavailable(msg('native.measure.notFile'))
      const old = cache.get(target.targetKey)
      if (old?.version === stat.version) return { ...old.value, cached: true }
      const limit = Number.isSafeInteger(nativeMaxSourceBytes) && nativeMaxSourceBytes > 0 ? Math.min(nativeMaxSourceBytes,maxReadBytes) : maxReadBytes
      const raw = await fs.readBytes(target,signal,limit), text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw)
      if (text.includes('\0')) return unavailable(msg('native.measure.notUtf8'))
      const count = await counter.count(text,{signal}), after = await fs.stat(target,signal)
      if (!after || after.version !== stat.version) return unavailable(msg('native.measure.changed'))
      const value = { readable:true,readLimitBytes:limit,bytes:raw.byteLength,tokens:count.tokens,estimated:true,countMethod:count.method,sha256:createHash('sha256').update(raw).digest('hex'),tokenizer:counter.basis(null),cached:false }
      cache.set(target.targetKey,{version:stat.version,value});while(cache.size>512)cache.delete(cache.keys().next().value)
      return value
    } catch(error) { if(signal?.aborted)throw error;return unavailable(readableReason(error)) }
  }
}
