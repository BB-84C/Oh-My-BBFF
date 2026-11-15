import { fileURLToPath } from 'node:url'
import packageInfo from './package.json' with { type: 'json' }
import { createSkillProvider } from './lib/provider.js'

export const name = packageInfo.name
export const inject = ['skills']

export function apply(ctx) {
  ctx.skills.registerProvider(() => createSkillProvider(
    fileURLToPath(new URL('./skills/', import.meta.url)), name,
  ))
}
