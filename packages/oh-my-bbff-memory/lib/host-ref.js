/**
 * Package-owned message references.
 *
 * Every user-visible reference the host emits carries this package's locale
 * namespace (`{ $bbff: 'bbff-message', key, params, ns: 'oh-my-bbff-memory' }`).
 * A namespace-less reference can only be resolved by whoever happens to render it
 * with this module's translator; with the namespace attached, the family root's
 * `bind(ns)`, the owning card and any generic error surface all resolve the same
 * key through `locale/{en,zh}.json` instead of showing a raw key.
 *
 * The vendored SDK stays untouched: this is the package's own binding of the
 * contract's `msg()`.
 */
import { msg as contractMessage } from './bbff-contract.js'
import { PACKAGE_NAME } from './identity.js'

export const LOCALE_NAMESPACE = PACKAGE_NAME

/** Build a locale message reference owned by this package. */
export function msg(key, params) {
  return contractMessage(key, params, LOCALE_NAMESPACE)
}

/** Attach this package's namespace to a reference that lacks one. */
export function withNamespace(reference) {
  if (!reference || typeof reference !== 'object' || reference.$bbff !== 'bbff-message') return reference
  return reference.ns ? reference : contractMessage(reference.key, reference.params, LOCALE_NAMESPACE)
}
