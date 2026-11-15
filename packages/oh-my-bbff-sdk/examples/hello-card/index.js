/**
 * Host half of the minimal Oh-My-BBFF module.
 *
 * Registering the descriptor is the whole host contract. The module works
 * without the family root; when `oh-my-bbff-widgets` is installed the BBFF
 * settings diagnostics list it and its client half may render cards.
 */
import { registerFamilyModule } from 'oh-my-bbff-sdk'

export const name = 'oh-my-bbff-hello'
export const inject = []

export function apply(ctx) {
  registerFamilyModule(ctx, {
    contract: 1,
    id: 'hello',
    title: 'Oh-My-BBFF Hello',
    description: 'Minimal example module: one status card and one BBFF settings section.',
    version: '0.1.0',
    packageName: 'oh-my-bbff-hello',
    apiBase: '/oh-my-bbff-hello/api',
    ui: { cards: ['hello'], settings: true },
  })
}
