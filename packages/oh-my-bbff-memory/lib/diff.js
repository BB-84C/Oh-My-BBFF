/** Readable line diff; omitted-line summaries are explicit, never a full-diff claim. */
import { DEFAULT_DATA } from './defaults.js'
export function simpleDiff(before, after) {
  if (before === after) return '(no change)'
  const a = String(before ?? '').split('\n'), b = String(after ?? '').split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length - 1, endB = b.length - 1
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--;endB-- }
  const removed = a.slice(start, endA + 1), added = b.slice(start, endB + 1), context = DEFAULT_DATA.structuralLimits.diffContextLines
  const out = a.slice(Math.max(0, start - context), start).map(line => '  ' + line)
  if (removed.length + added.length > DEFAULT_DATA.structuralLimits.diffMaxLines) out.push(`- (${removed.length} line(s) removed; diff summarized)`, `+ (${added.length} line(s) added; diff summarized)`)
  else { out.push(...removed.map(line => '- ' + line), ...added.map(line => '+ ' + line)) }
  out.push(...a.slice(endA + 1, Math.min(a.length, endA + 1 + context)).map(line => '  ' + line))
  return out.join('\n')
}
