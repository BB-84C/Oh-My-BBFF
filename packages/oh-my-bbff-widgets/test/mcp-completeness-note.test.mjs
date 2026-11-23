// Regression for the second defect in community issue #1: the MCP card passed
// `exposureData.display.mcpCompletenessNote` — a host message reference object — as a
// React child, which React rejects with error #31 ("objects are not valid as a React
// child") and the `sidebar.right.pane.tab` slot crashed. The note is host text and must
// be resolved to a string before it reaches the tree.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { decorateExposure } from '../lib/presentation.js'
import { invalidChildren, loadWidgetsClient, widgetRoot } from './support/client-harness.mjs'

const dictionaries = {}
for (const language of ['en', 'zh']) {
  const file = path.join(widgetRoot, 'locale', language + '.json')
  dictionaries['oh-my-bbff-widgets/' + language] = JSON.parse(fs.readFileSync(file, 'utf8')).ui
}

/** The real host payload shape: `decorateExposure` turns an incomplete server list into a reference. */
function incompleteExposureNote() {
  const decorated = decorateExposure({ ok: true, exposure: { skills: [], tools: [], mcp: [], mcpCompleteness: { affectsVisibleList: true } } }, {})
  return decorated.exposure.display.mcpCompletenessNote
}

test('the MCP completeness note renders as resolved text, never as a reference object', async () => {
  const note = incompleteExposureNote()
  assert.ok(note && note.$bbff === 'bbff-message', 'the host sends the note as a message reference')
  const client = await loadWidgetsClient({ active: 'en', dictionaries })
  for (const language of ['en', 'zh']) {
    client.locales.setActive(language)
    const row = client.internals.mcpCompletenessRow(note)
    assert.ok(row, 'the note row renders when the host sends a note')
    assert.equal(row.props['data-mcp-completeness-note'], 'true')
    const children = (row.props.children || []).filter((child) => child !== null && child !== undefined)
    assert.equal(children.length, 1, 'the row has exactly one child')
    assert.equal(typeof children[0], 'string', 'the child is text, not a reference object (React child contract)')
    assert.equal(children[0], dictionaries['oh-my-bbff-widgets/' + language]['exposure.mcp-incomplete'], 'the note renders its dictionary text (' + language + ')')
    assert.deepEqual(invalidChildren(row), [], 'the rendered row contains no invalid React child')
  }
  assert.equal(client.internals.mcpCompletenessRow(null), null, 'no note means no row')
})

test('the card wires the note through the text helper', () => {
  const source = fs.readFileSync(path.join(widgetRoot, 'client.js'), 'utf8')
  assert.match(source, /mcpCompletenessRow\(exposureData\?\.display\?\.mcpCompletenessNote\)/,
    'the MCP card must render the note through the text helper')
  assert.doesNotMatch(source, /'data-mcp-completeness-note': 'true' \}, exposureData/,
    'the MCP card must not pass the reference object straight to h()')
})
