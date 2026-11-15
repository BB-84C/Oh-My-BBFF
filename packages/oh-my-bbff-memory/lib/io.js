/** Bounded local Memory reads; missing is not the same thing as a read failure. */
import { openSync, readSync, closeSync, fstatSync } from 'node:fs'
export function readUtf8Bounded(path, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Read limit must be a positive finite integer.')
  let descriptor
  try { descriptor = openSync(path, 'r') } catch (error) { if (error.code === 'ENOENT') return { path, exists: false, bytes: 0, includedBytes: 0, truncated: false, content: '', validUtf8: true };throw error }
  try {
    const info = fstatSync(descriptor)
    if (!info.isFile()) throw new Error('Memory source is not a regular file.')
    const buffer = Buffer.alloc(Math.min(info.size, maxBytes + 4)), read = readSync(descriptor, buffer, 0, buffer.length, 0)
    let end = Math.min(maxBytes, read)
    while (end > 0 && end < read && (buffer[end] & 192) === 128) end--
    const prefix = buffer.subarray(0, end), content = prefix.toString('utf8')
    return { path, exists: true, bytes: info.size, includedBytes: prefix.length, truncated: prefix.length < info.size, content, validUtf8: Buffer.from(content, 'utf8').equals(prefix), mtimeMs: info.mtimeMs }
  } finally { closeSync(descriptor) }
}
