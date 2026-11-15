/** Shared UTF-8 accounting; no minimum-byte padding. */
export const byteLength = text => Buffer.byteLength(text, 'utf8')
export function truncateUtf8(text, maxBytes) {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length <= maxBytes) return text
  let end = Math.max(0, Math.trunc(maxBytes))
  while (end > 0 && (bytes[end] & 192) === 128) end--
  return bytes.subarray(0, end).toString('utf8')
}
