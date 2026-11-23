// Regression for community issue #2: a member module's 高级设置 (advanced settings)
// never expanded. The per-module kit exposed the layout RENDERER where the stateful
// component was expected, so `open`/`onOpenChange` were undefined: the layout's
// <summary> suppressed the native toggle and then threw
// `TypeError: props.onOpenChange is not a function`.
//
// The test renders the real client bundle's per-module kit layout with real-shaped
// module descriptors and clicks the summary, asserting the advanced block opens in
// both shipped languages. The final block replays the 1.0.0 shape (renderer without
// the stateful component) to prove this test catches the reported defect.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { find, loadWidgetsClient, strings } from './support/client-harness.mjs'

const DICTIONARY = {
  en: {
    'group.one': 'Basics', 'group.two': 'Shape', 'group.three': 'Output', 'group.more': 'More knobs',
    'labels.advancedTitle': 'Advanced settings',
    'labels.advancedChanged': '{count} advanced settings changed',
    'labels.advancedCount': '{count} settings',
    'labels.helpLabel': 'Help',
    'labels.missingEffectNotice': 'No documented effect.',
    'labels.invalidGroupsNotice': 'The declared groups are invalid.',
    'field.a': 'Alpha', 'field.b': 'Beta', 'field.c': 'Gamma', 'field.d': 'Delta',
    'effect.a': 'Changes alpha.', 'effect.b': 'Changes beta.', 'effect.c': 'Changes gamma.', 'effect.d': 'Changes delta.',
  },
  zh: {
    'group.one': '基础一', 'group.two': '基础二', 'group.three': '基础三', 'group.more': '更多设置',
    'labels.advancedTitle': '高级设置',
    'labels.advancedChanged': '高级里有 {count} 项已改',
    'labels.advancedCount': '{count} 项',
    'labels.helpLabel': '帮助',
    'labels.missingEffectNotice': '没有写明后果。',
    'labels.invalidGroupsNotice': '分组声明无效。',
    'field.a': '甲', 'field.b': '乙', 'field.c': '丙', 'field.d': '丁',
    'effect.a': '改变甲。', 'effect.b': '改变乙。', 'effect.c': '改变丙。', 'effect.d': '改变丁。',
  },
}
const DICTIONARIES = { 'demo-pkg/en': DICTIONARY.en, 'demo-pkg/zh': DICTIONARY.zh, 'oh-my-bbff-widgets/en': DICTIONARY.en, 'oh-my-bbff-widgets/zh': DICTIONARY.zh }
const MODULES = [{ id: 'demo', packageName: 'demo-pkg' }]

/** Real-shaped Widgets settings-metadata v2 payload: three basic groups plus one advanced group. */
function descriptors() {
  const ref = (key) => ({ $bbff: 'bbff-message', key })
  const field = (path, extra) => ({ path, control: 'number', displayLabel: ref('field.' + path), effect: ref('effect.' + path), default: 1, ...extra })
  return {
    version: 1,
    presentation: {
      version: 2,
      basicGroups: [
        { id: 'one', title: ref('group.one') },
        { id: 'two', title: ref('group.two') },
        { id: 'three', title: ref('group.three') },
      ],
      advancedGroups: [{ id: 'more', title: ref('group.more') }],
      labels: {
        advancedTitle: ref('labels.advancedTitle'),
        advancedChanged: ref('labels.advancedChanged'),
        advancedCount: ref('labels.advancedCount'),
        helpLabel: ref('labels.helpLabel'),
        missingEffectNotice: ref('labels.missingEffectNotice'),
        invalidGroupsNotice: ref('labels.invalidGroupsNotice'),
      },
    },
    settings: [
      field('a', { importance: 'basic', basicGroup: 'one', basicOrder: 1 }),
      field('b', { importance: 'basic', basicGroup: 'two', basicOrder: 2 }),
      field('c', { importance: 'basic', basicGroup: 'three', basicOrder: 3 }),
      field('d', { advancedGroup: 'more' }),
    ],
  }
}

const advancedBlock = (tree) => find(tree, (node) => node.props?.['data-settings-advanced'] === true)
const summaryOf = (tree) => find(advancedBlock(tree), (node) => node.type === 'summary')
const event = () => ({ prevented: false, preventDefault() { this.prevented = true } })

for (const language of ['en', 'zh']) {
  test('per-module kit SettingsLayout opens its advanced block (' + language + ')', async () => {
    const client = await loadWidgetsClient({ active: language, dictionaries: DICTIONARIES, modules: MODULES })
    const kit = client.internals.kitFor('demo')
    const renderField = (field) => client.runtime.react.createElement('div', { 'data-field': field.path }, kit.resolveText(field.displayLabel), kit.resolveText(field.effect))
    const payload = descriptors()
    let tree = client.runtime.render(client.runtime.react.createElement(kit.SettingsLayout, { descriptors: payload, values: {}, renderField }))

    // Real text, resolved in the module's namespace (a raw key here would be the defect).
    const basic = strings(tree)
    assert.ok(basic.includes(DICTIONARY[language]['group.one']), 'basic group title resolves in the module dictionary')
    assert.ok(!basic.some((text) => /^group\.|^field\.|^effect\./.test(text)), 'no raw dictionary key is rendered: ' + JSON.stringify(basic.filter((text) => /^group\.|^field\.|^effect\./.test(text))))

    const closed = advancedBlock(tree)
    assert.ok(closed, 'the advanced block renders')
    assert.equal(closed.props.open, false, 'the advanced block starts collapsed')

    const click = event()
    tree = client.runtime.act(() => summaryOf(tree).props.onClick(click)).tree
    assert.equal(click.prevented, true, 'the summary handles the click itself (native toggle suppressed)')
    assert.equal(advancedBlock(tree).props.open, true, 'clicking the summary opens the advanced block')

    const opened = advancedBlock(tree)
    assert.ok(strings(opened).includes(DICTIONARY[language]['group.more']), 'the advanced group title renders in the module dictionary')
    assert.ok(strings(tree).includes(DICTIONARY[language]['labels.advancedTitle']), 'the advanced section renders its title')
    assert.ok(strings(tree).includes(DICTIONARY[language]['labels.advancedCount'].replace('{count}', '1')), 'the advanced section renders its counted label')

    tree = client.runtime.act(() => summaryOf(tree).props.onClick(event())).tree
    assert.equal(advancedBlock(tree).props.open, false, 'clicking again collapses the advanced block')

    const changedButton = find(tree, (node) => node.props?.['data-advanced-changed'] !== undefined)
    assert.ok(changedButton, 'the changed-advanced button renders')
    tree = client.runtime.act(() => changedButton.props.onClick()).tree
    assert.equal(advancedBlock(tree).props.open, true, 'the changed-advanced button opens the advanced block')
  })
}

test('the 1.0.0 kit shape (renderer without the stateful component) throws, so this test catches the defect', async () => {
  const client = await loadWidgetsClient({ active: 'en', dictionaries: DICTIONARIES, modules: MODULES })
  const kit = client.internals.kitFor('demo')
  const renderField = (field) => client.runtime.react.createElement('div', { 'data-field': field.path }, kit.resolveText(field.displayLabel))
  // Exactly what `SettingsLayout: (props) => renderSettingsLayout(props)` did: no `open`,
  // no `onOpenChange`, so the summary handler has nothing to call.
  const shadowedRenderer = (props) => client.internals.renderSettingsLayout(props)
  const tree = client.runtime.render(client.runtime.react.createElement(shadowedRenderer, { descriptors: descriptors(), values: {}, renderField }))
  const block = advancedBlock(tree)
  assert.ok(block, 'the shadowed renderer still renders the block')
  assert.equal(block.props.open, false)
  assert.throws(() => summaryOf(tree).props.onClick(event()), /onOpenChange is not a function/)
})
