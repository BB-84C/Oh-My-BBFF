// One-time, non-destructive crew -> team state migration.
// Existing destinations always win. Keep legacy files intact for rollback; only
// copy the three documented data files, never scan/copy arbitrary user content.
import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function migrateLegacyData(home, logger) {
  const source = join(home, 'oh-my-bbff-crew')
  const destination = join(home, 'oh-my-bbff-team')
  const copied = []
  const errors = []
  for (const name of ['bindings.json', 'session-modes.json', 'roles.json']) {
    const from = join(source, name)
    const to = join(destination, name)
    if (!existsSync(from) || existsSync(to)) continue
    try {
      mkdirSync(destination, { recursive: true })
      copyFileSync(from, to, constants.COPYFILE_EXCL)
      copied.push(name)
    } catch (error) {
      if (error && error.code === 'EEXIST') continue
      errors.push(`${name}: ${String(error && error.message || error)}`)
    }
  }
  if (errors.length) {
    try { logger?.warn?.(`oh-my-bbff-team migration: ${errors.join('; ')}`) } catch {}
  }
  return { copied, errors }
}
