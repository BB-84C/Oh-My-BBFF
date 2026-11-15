/** Pure packaged skill generation: one text source, replacement and newline normalization only. */
import { createHash } from 'node:crypto'
export const skillHash = value => createHash('sha256').update(value).digest('hex')
export function generatePackagedSkill(template, data) {
  if (typeof template !== 'string') throw new Error('Shipped skill source must be text.')
  const variables = { globalMemoryPath: '$DSH_HOME/' + data.storage.globalMemoryDirectory, workspaceMemoryDirs: data.fields.workspaceMemoryDirs.default.map(path => '<cwd>/' + path).join(', '), intervalHours: data.fields.wakeIntervalHours.default, budgetRatio: data.fields.budgetWindowRatio.default }
  const content = template.replace(/\{\{([^}]+)\}\}/g, (all, key) => Object.hasOwn(variables, key.trim()) ? String(variables[key.trim()]) : all).replace(/\r\n?/g, '\n')
  if (/\{\{[^}]+\}\}/.test(content)) throw new Error('Packaged skill has unresolved placeholders.')
  if (/(?:[A-Za-z]:[\\/]|\\\\[^\s]+\\|\/Users\/|\/home\/[^\s/]+\/|\bAdministrator\b)/.test(content)) throw new Error('Packaged skill contains a machine-specific path or username.')
  return Buffer.from(content.endsWith('\n') ? content : content + '\n', 'utf8')
}
