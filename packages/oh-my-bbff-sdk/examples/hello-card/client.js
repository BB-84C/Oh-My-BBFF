// Client half of the minimal Oh-My-BBFF module.
//
// This is the final DSH client-bundle shape: the loader evaluates this classic
// script, the factory receives `require` (React is provided by the UI shell),
// and the returned plugin applies against the client Cordis context.
//
// The three lines inside `apply` are the entire client contract; the SDK's
// `registerUiAdditions(ctx, { cards, sections })` is a typed wrapper around
// exactly this pattern (bundle the SDK into your client half to use it).
window.__ModuleLoader__.load({
  id: 'oh-my-bbff-hello',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const HelloCard = ({ sessionId, kit }) => h('div', null,
      h(kit.Badge, null, 'hello'),
      h(kit.Hint, null, sessionId ? 'session ' + sessionId : 'no active session'))

    const HelloSettings = ({ kit }) => h('div', null,
      h(kit.Hint, null, 'This section comes from the oh-my-bbff-hello module.'))

    return {
      inject: [],
      apply(ctx) {
        ctx.inject(['bbffUi'], (scope) => {
          const ui = scope.get('bbffUi')
          if (!ui || ui.contract !== 1) return
          scope.effect(() => ui.registerCard({
            id: 'hello',
            title: { zh: '示例卡片', en: 'Hello' },
            order: 100,
            defaultHeight: 200,
            component: HelloCard,
          }), 'hello: card')
          scope.effect(() => ui.registerSettingsSection({
            id: 'hello',
            title: { zh: 'Hello 设置', en: 'Hello settings' },
            order: 100,
            component: HelloSettings,
          }), 'hello: settings')
        })
      },
    }
  },
})
