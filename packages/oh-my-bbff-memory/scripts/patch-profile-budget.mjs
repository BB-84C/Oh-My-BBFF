#!/usr/bin/env node
/** Explicit client of Memory's public native-budget preview/apply API.
 * No profile/preset/package paths, deployment defaults or direct file writes.
 */
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DEFAULT_DATA } from '../lib/defaults.js'
export async function run({ argv = process.argv.slice(2), request = fetch, output = value => console.log(value) } = {}) {
  const take = name => { const index = argv.indexOf(name);return index >= 0 ? argv[index + 1] : undefined }
  const url = take('--url'), sessionId = take('--session'), requested = take('--max-bytes')
  if (argv.includes('--help') || !url || !sessionId || requested === undefined) {
    output('Usage: node scripts/patch-profile-budget.mjs --url <Memory API URL> --session <already-live session id> --max-bytes <nonnegative integer> [--source <source id>] [--apply --preview-token <inspected token> --confirm-inherited-freeze] [--authorization-env <environment variable>] [--timeout-ms <integer; shipped contract deadline by default>]')
    output('Default is read-only preview. Actual native sources/targets come from the live contract; no preset/profile/deployment value is guessed.');return { previewOnly: true, usage: true }
  }
  const timeoutMs = Number(take('--timeout-ms') ?? DEFAULT_DATA.fields.apiReadBackgroundTimeoutMs.default)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeout-ms must be a positive integer; its default comes from shipped contract data.')
  const endpoint = new URL(url), maxBytes = Number(requested)
  endpoint.search = '';endpoint.hash = ''
  if (!['http:', 'https:'].includes(endpoint.protocol) || !Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Provide HTTP(S) API URL and a nonnegative integer byte value.')
  const headers = { 'content-type': 'application/json' }, env = take('--authorization-env')
  if (env) { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(env) || !process.env[env]) throw new Error('Authorization environment variable is invalid/unset.');headers.authorization = process.env[env] }
  const call = (url, options) => request(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  const post = async body => { const response = await call(endpoint.href, { method: 'POST', headers, body: JSON.stringify({ sessionId, ...body }) }), value = await response.json();if (!response.ok || value.ok === false) throw new Error(value.error || 'Memory API rejected the action.');return value }
  let sourceId = take('--source')
  if (!sourceId) {
    const inventoryUrl = new URL(endpoint);inventoryUrl.searchParams.set('inventory', '1');inventoryUrl.searchParams.set('sessionId', sessionId)
    let response = await call(inventoryUrl.href, { headers }), inventory = await response.json()
    const started = Date.now()
    while (inventory.pending) {
      if (Date.now() - started >= timeoutMs) throw new Error('Native metadata background settlement exceeded the explicit CLI deadline.')
      const delay = inventory.readPolicy?.pendingPollMs
      if (!Number.isSafeInteger(delay) || delay < 1) throw new Error('Pending response has no valid published polling policy.')
      await new Promise(resolve => setTimeout(resolve, delay))
      response = await call(inventoryUrl.href, { headers });inventory = await response.json()
    }
    if (inventory.read?.status === 'error') throw new Error(inventory.read.reason || 'Native metadata read failed.')
    const sources = inventory.nativeInstructions?.value?.sources?.filter(source => source.writable) || []
    if (!response.ok || inventory.ok === false || sources.length !== 1) throw new Error('Choose exactly one verified writable source using --source; discovery is incomplete/ambiguous or read-only.')
    sourceId = sources[0].id
  }
  const preview = await post({ action: 'native-budget-preview', sourceId, maxBytes })
  output(JSON.stringify(preview, null, 2))
  if (!argv.includes('--apply')) return preview
  const previewToken = take('--preview-token')
  if (!previewToken || previewToken !== preview.previewToken) throw new Error('Inspect a preview first and pass that exact --preview-token; target/config/requested bytes must remain unchanged.')
  if (preview.copyingInherited && !argv.includes('--confirm-inherited-freeze')) throw new Error('This changes an inherited declaration list. Confirm its explicit-override/future-upgrade effect with --confirm-inherited-freeze.')
  const applied = await post({ action: 'native-budget-apply', sourceId: preview.sourceId || sourceId, maxBytes, previewToken, confirmInheritedFreeze: argv.includes('--confirm-inherited-freeze'), confirm: true })
  output(JSON.stringify(applied, null, 2));return applied
}
// Canonical comparison: a symlinked/junctioned checkout must still run the client.
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) run().catch(error => { console.error(error.message);process.exitCode = 1 })
