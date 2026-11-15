import { msg } from './bbff-contract.js'

/** The package namespace that owns the Widgets dictionaries. */
export const WIDGETS_NAMESPACE = 'oh-my-bbff-widgets'

/**
 * A message reference created by the Widgets host always names its producer, so a
 * consumer that renders it inside another module's card still resolves it in the
 * Widgets dictionaries (a bare ref would be resolved in the consumer's namespace).
 */
export const wmsg = (key, params) => msg(key, params, WIDGETS_NAMESPACE)
