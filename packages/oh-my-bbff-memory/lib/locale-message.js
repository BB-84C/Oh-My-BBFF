/**
 * Host text travels as locale message references (`msg(key)`), never literals.
 *
 * Some host failures are user-facing text but still travel through `throw`/`catch`.
 * These helpers carry the reference through that channel so no layer has to
 * stringify a message ref into a locale-agnostic string. Every reference keeps this
 * package's locale namespace, including references that arrive here from elsewhere.
 */
import { isMessageRef } from './bbff-contract.js'
import { withNamespace } from './host-ref.js'

export const localeError = reference => Object.assign(new Error(reference.key), { reference: withNamespace(reference) })
/** The reference when the failure is user-facing text, otherwise the raw technical message. */
export const messageOf = error => (error && error.reference) || String(error && error.message !== undefined ? error.message : error)
/** Human-readable text for a diagnostics log line, without ever printing a reference object. */
export const logText = value => typeof value === 'string' ? value : isMessageRef(value) ? value.key : String(value && value.message !== undefined ? value.message : value)
