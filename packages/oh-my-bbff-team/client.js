// oh-my-bbff-team — client half (0.5.2).
//
// Registers the Team settings section with the Oh-My-BBFF family root
// through the contract service `bbffUi` (see oh-my-bbff-sdk/CONTRACT.md). All data
// comes from the team host route `/oh-my-bbff-team/api`. Root absent → the
// injection waits; nothing throws and the team host keeps working standalone.
window.__ModuleLoader__.load({
  id: 'oh-my-bbff-team',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/oh-my-bbff-team/api'

    // Team 0.12.0 i18n: every UI text lives in locale/<lang>.json (namespace oh-my-bbff-team) and is
    // read through the BBFF kit: props.t(key, params) for Team keys, kit.resolveText(value, params) for
    // host message references, user strings and legacy maps. No language branch in this file.
    const textOf = (kit, value, params) => typeof kit?.resolveText === 'function' ? String(kit.resolveText(value, params) ?? '') : typeof value === 'string' ? value : ''
    /** Translator for Team keys; a host label map (refs or user overrides) wins over the shipped key. */
    const makeTranslator = (props, labels) => {
      const kit = props?.kit, t = typeof props?.t === 'function' ? props.t : typeof kit?.t === 'function' ? kit.t : null
      return (key, params) => labels && Object.hasOwn(labels, key) ? textOf(kit, labels[key], params) : t ? t(key, params) : key
    }
    /** Text owned by another BBFF package: a same-package ref of that package gets its namespace. */
    const textIn = (kit, value, ns) => value && typeof value === 'object' && typeof value.key === 'string' && !value.ns && ns && typeof kit?.msg === 'function' ? textOf(kit, kit.msg(value.key, value.params, ns)) : textOf(kit, value)
    /** One Team key outside a component translator (helpers that only hold the kit). */
    const msgOf = (kit, key, params) => typeof kit?.t === 'function' ? kit.t(key, params) : key
    const kitOr = (kit, name, fallback) => (kit && typeof kit[name] === 'function' ? kit[name] : fallback)
    const errorMessage = (value) => String((value && (value.error || value.message)) || value || '')

    function tokensOf(kit) {
      const tokens = (kit && kit.tokens) || {}
      return {
        border: tokens['--dsw-alias-border-l1'] || 'rgba(127, 127, 127, 0.45)',
        secondary: tokens['--dsw-alias-label-secondary'] || 'inherit',
        surface: tokens['--dsw-alias-bg-l2'] || 'transparent',
      }
    }

    // Display policy for the report body. The stored excerpt stays the full 400-char summary in
    // the data layer and API; the card renders it completely and only clips it visually.
    const REPORT_RENDER = Object.freeze({ kind: 'safe-react-markdown-subset', maxLines: 3, clamp: 'css' })
    const SAFE_LINK = /^(?:https?:|mailto:)/i
    const SAFE_IMAGE = /^!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/
    const SAFE_LINK_RE = /^\[([^\]]+)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/
    function markdownInline(value, h, keyPrefix) {
      const text = String(value == null ? '' : value), nodes = []
      let index = 0, plain = '', sequence = 0
      const flush = () => { if (plain) { nodes.push(plain); plain = '' } }
      while (index < text.length) {
        const char = text[index], rest = text.slice(index)
        if (char === '`') {
          const close = rest.indexOf('`', 1)
          if (close > 1) { flush(); nodes.push(h('code', { key: keyPrefix + '-c' + (sequence++), className: 'bbff-team-md-code' }, rest.slice(1, close))); index += close + 1; continue }
          index += 1; continue // unclosed marker: never print the raw marker
        }
        if (char === '*' || char === '_') {
          const marker = rest.startsWith('**') || rest.startsWith('__') ? rest.slice(0, 2) : char
          if (rest.startsWith(marker) && text.slice(index + marker.length).includes(marker)) {
            const close = text.indexOf(marker, index + marker.length)
            const inner = text.slice(index + marker.length, close)
            if (inner.trim()) {
              flush()
              nodes.push(marker.length === 2 ? h('strong', { key: keyPrefix + '-b' + (sequence++) }, markdownInline(inner, h, keyPrefix + 'b' + sequence)) : h('em', { key: keyPrefix + '-i' + (sequence++) }, markdownInline(inner, h, keyPrefix + 'i' + sequence)))
              index = close + marker.length; continue
            }
          }
          index += marker.length; continue // unmatched emphasis marker: drop it instead of showing half a marker
        }
        if (char === '!' || char === '[') {
          const image = char === '!' ? rest.match(SAFE_IMAGE) : null
          if (image) { flush(); nodes.push(h('span', { key: keyPrefix + '-img' + (sequence++), className: 'bbff-team-md-image-alt', 'data-team-report-image-alt': 'true' }, image[1] || image[2] || '')); index += image[0].length; continue }
          const link = rest.match(SAFE_LINK_RE)
          if (link) {
            flush()
            const label = link[1], url = link[2] || ''
            if (SAFE_LINK.test(url)) nodes.push(h('a', { key: keyPrefix + '-a' + (sequence++), href: url, target: '_blank', rel: 'noopener noreferrer nofollow', className: 'bbff-team-md-link' }, markdownInline(label, h, keyPrefix + 'a' + sequence)))
            else nodes.push(h('span', { key: keyPrefix + '-a' + (sequence++), className: 'bbff-team-md-link-disabled', 'data-team-report-link-disabled': 'true' }, markdownInline(label, h, keyPrefix + 'd' + sequence)))
            index += link[0].length; continue
          }
          if (char === '!') { nodes.push('!'); plain = ''; index += 1; continue }
        }
        plain += char; index += 1
      }
      flush()
      return nodes
    }
    // Deliberately small, safe Markdown subset rendered as React elements. No HTML injection,
    // no image fetching, and no external markdown dependency.
    function markdownBlocks(value, h) {
      const lines = String(value == null ? '' : value).replace(/\r\n?/g, '\n').split('\n'), blocks = []
      let index = 0, key = 0
      const nextKey = () => 'md' + (key++)
      while (index < lines.length) {
        const line = lines[index], fence = line.match(/^[ \t]{0,3}(```+|~~~+)/)
        if (fence) {
          const marker = fence[1].slice(0, 3), body = []
          index += 1
          while (index < lines.length && !lines[index].trim().startsWith(marker)) { body.push(lines[index]); index += 1 }
          index += 1
          blocks.push(h('pre', { key: nextKey(), className: 'bbff-team-md-pre' }, h('code', null, body.join('\n'))))
          continue
        }
        const heading = line.match(/^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/)
        if (heading) { blocks.push(h('div', { key: nextKey(), className: 'bbff-team-md-heading', 'data-team-md-heading': heading[1].length }, markdownInline(heading[2], h, nextKey()))); index += 1; continue }
        if (/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) { blocks.push(h('hr', { key: nextKey(), className: 'bbff-team-md-rule' })); index += 1; continue }
        if (/^[ \t]{0,3}>/.test(line)) {
          const quote = []
          while (index < lines.length && /^[ \t]{0,3}>/.test(lines[index])) { quote.push(lines[index].replace(/^[ \t]{0,3}>[ \t]?/, '')); index += 1 }
          blocks.push(h('blockquote', { key: nextKey(), className: 'bbff-team-md-quote' }, markdownInline(quote.join(' '), h, nextKey())))
          continue
        }
        const unordered = /^[ \t]{0,3}[-*+][ \t]+/, ordered = /^[ \t]{0,3}\d+[.)][ \t]+/
        if (unordered.test(line) || ordered.test(line)) {
          const isOrdered = ordered.test(line), items = [], pattern = isOrdered ? ordered : unordered
          while (index < lines.length && pattern.test(lines[index])) { items.push(h('li', { key: nextKey() }, markdownInline(lines[index].replace(pattern, ''), h, nextKey()))); index += 1 }
          blocks.push(h(isOrdered ? 'ol' : 'ul', { key: nextKey(), className: 'bbff-team-md-list', 'data-team-md-list': isOrdered ? 'ordered' : 'unordered' }, items))
          continue
        }
        if (!line.trim()) { index += 1; continue }
        const paragraph = []
        while (index < lines.length && lines[index].trim() && !/^[ \t]{0,3}(```|~~~|#{1,6}[ \t]|>|[-*+][ \t]|\d+[.)][ \t])/.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1 }
        if (!paragraph.length) { paragraph.push(line.trim()); index += 1 }
        blocks.push(h('div', { key: nextKey(), className: 'bbff-team-md-paragraph' }, markdownInline(paragraph.join(' '), h, nextKey())))
      }
      return blocks
    }

    function titleOf(kit, role) {
      if (!role) return ''
      return textOf(kit, role.title) || role.id || ''
    }

    function routeLabel(route, tr) {
      if (!route) return tr('inherit')
      return [route.provider, route.model, route.effort].filter(Boolean).join(' · ')
    }

    // Scoped to the settings role catalog; session cards and the host stay unchanged.
    const ROLE_LIST_CSS = `
.bbff-team-role { min-width:0; padding:3px 0; }
.bbff-team-role-head { display:flex; align-items:center; gap:7px; min-width:0; min-height:34px; }
.bbff-team-role-toggle { display:inline-flex; align-items:center; gap:5px; flex:0 0 auto; border:0; padding:4px 0; background:transparent; color:inherit; font:inherit; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
.bbff-team-role-toggle:hover { color:var(--dsw-alias-brand-primary); }
.bbff-team-role-toggle:focus-visible { outline:1px solid var(--dsw-alias-brand-primary); outline-offset:2px; border-radius:4px; }
.bbff-team-chevron { font-size:10px; opacity:.7; }
.bbff-team-role-id { flex:0 0 auto; font-size:10.5px; color:var(--dsw-alias-label-tertiary); }
.bbff-team-role-badges { display:flex; align-items:center; gap:4px; flex:0 0 auto; white-space:nowrap; }
.bbff-team-role-badges .gb-badge { font-size:10px; padding:1px 6px; }
.bbff-team-role-route { flex:1 1 140px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:var(--dsw-alias-label-secondary); }
.bbff-team-role-actions { display:flex; align-items:center; gap:4px; flex:0 0 auto; margin-left:auto; white-space:nowrap; }
.bbff-team-role-actions .gb-btn { padding:3px 7px; font-size:11px; }
.bbff-team-role-details { display:flex; flex-direction:column; gap:5px; padding:3px 0 9px 15px; font-size:11.5px; line-height:1.5; overflow-wrap:anywhere; }
.bbff-team-role-details[hidden] { display:none; }
@media (max-width:760px) {
  .bbff-team-role-head { flex-wrap:wrap; gap:4px 7px; }
  .bbff-team-role-route { order:3; flex-basis:100%; padding-left:15px; }
  .bbff-team-role-badges { flex-wrap:wrap; flex-shrink:1; }
}
`

    const SETTINGS_CSS = `
.bbff-team-editor, .bbff-team-settings-form, .bbff-team-history { min-width:0; }
.bbff-team-editor { display:flex; flex-direction:column; gap:12px; margin:6px 0 12px 15px; padding:14px; border:1px solid var(--dsw-alias-border-l1); border-radius:9px; background:var(--dsw-alias-bg-base); }
.bbff-team-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 14px; }
.bbff-team-field { display:flex; flex-direction:column; min-width:0; gap:5px; font-size:11.5px; color:var(--dsw-alias-label-secondary); }
.bbff-team-field input:not([type=checkbox]), .bbff-team-field textarea { box-sizing:border-box; width:100%; min-width:0; padding:7px 9px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; line-height:1.5; }
.bbff-team-field textarea { resize:vertical; min-height:70px; max-height:60vh; overflow:auto; overflow-wrap:anywhere; }
.bbff-team-field textarea[data-team-field=prompt] { min-height:140px; }
.bbff-team-field input:focus-visible, .bbff-team-field textarea:focus-visible { outline:1px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.bbff-team-check { display:flex; align-items:center; gap:7px; font-size:12px; }
.bbff-team-check input { accent-color:var(--dsw-alias-brand-primary); }
.bbff-team-tier { display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--dsw-alias-border-l1); border-radius:7px; }
.bbff-team-line { display:flex; align-items:center; gap:7px; flex-wrap:wrap; min-width:0; }
.bbff-team-section { margin-top:16px; padding-top:14px; border-top:1px solid var(--dsw-alias-border-l1); }
.bbff-team-section-title { font-size:13px; font-weight:600; margin:0 0 10px; }
.bbff-team-hint { font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.5; overflow-wrap:anywhere; }
.bbff-team-invalid { color:var(--dsw-alias-state-warn-primary); font-size:11.5px; }
.bbff-team-history-row { padding:10px 0; border-top:1px solid var(--dsw-alias-border-l1); min-width:0; }
.bbff-team-history-summary { font-size:11.5px; line-height:1.5; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
.bbff-team-revert-confirm { display:flex; flex-direction:column; gap:8px; margin-top:8px; padding:10px; border:1px solid var(--dsw-alias-state-warn-primary); border-radius:7px; }
.bbff-team-settings-surface { container-type:inline-size; container-name:bbff-team; }
.bbff-team-formation-row { padding:12px 0; border-top:1px solid var(--dsw-alias-border-l1); min-width:0; overflow-wrap:anywhere; }
.bbff-team-formation-editor { margin:10px 0; }
.bbff-team-diff { display:flex; flex-direction:column; gap:9px; padding:12px; border:1px solid var(--dsw-alias-brand-primary); border-radius:8px; min-width:0; background:var(--dsw-alias-bg-base); }
.bbff-team-diff-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; min-width:0; }
.bbff-team-diff pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; line-height:1.5; padding:9px; border:1px solid var(--dsw-alias-border-l1); border-radius:5px; min-width:0; margin:6px 0 0; }
.bbff-team-diff code { overflow-wrap:anywhere; }
.bbff-team-formation-editor select { max-width:100%; }
.bbff-team-setting-row { display:flex; flex-direction:column; gap:4px; min-width:0; padding:3px 0; }
.bbff-team-default-line { margin-top:1px; }
.bbff-team-default-row { min-width:0; max-width:100%; }
.bbff-team-default-row > summary { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
.bbff-team-settings-surface pre { white-space:pre-wrap; overflow-wrap:anywhere; max-width:100%; box-sizing:border-box; }
.bbff-team-settings-surface code { overflow-wrap:anywhere; }
.bbff-team-settings-surface fieldset { min-inline-size:0; }
.bbff-team-settings-surface select { max-width:100%; }
@container bbff-team (max-width:720px) {
  .bbff-team-grid, .bbff-team-diff-grid { grid-template-columns:minmax(0,1fr); }
  .bbff-team-editor { margin-left:0; }
  .bbff-team-role-head { flex-wrap:wrap; gap:4px 7px; }
  .bbff-team-role-route { order:3; flex-basis:100%; padding-left:15px; }
  .bbff-team-role-badges { flex-wrap:wrap; flex-shrink:1; }
}
@media(max-width:760px) { .bbff-team-grid { grid-template-columns:minmax(0,1fr); } .bbff-team-editor { margin-left:0; } }
`

    const effortCache = new Map()
    function useEfforts(kit, provider, model) {
      const key = provider && model ? provider + '\u0000' + model : ''
      const [value, setValue] = React.useState(() => (key && effortCache.get(key)) || null)
      React.useEffect(() => {
        if (!key) { setValue(null); return undefined }
        if (effortCache.has(key)) { setValue(effortCache.get(key)); return undefined }
        let cancelled = false
        const getJson = kitOr(kit, 'getJson', () => Promise.reject(new Error(msgOf(kit, 'error.kitGetJsonUnavailable'))))
        getJson(API + '?action=efforts&provider=' + encodeURIComponent(provider) + '&model=' + encodeURIComponent(model))
          .then((payload) => {
            const efforts = payload && payload.ok ? payload.efforts || [] : []
            effortCache.set(key, efforts)
            if (!cancelled) setValue(efforts)
          })
          .catch(() => { if (!cancelled) setValue([]) })
        return () => { cancelled = true }
      }, [key])
      return value
    }

    function Select(props) {
      const palette = tokensOf(props.kit)
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: palette.secondary, minWidth: 0, flex: props.flex || '1 1 0' } },
        props.label,
        h('select', {
          value: props.value || '',
          disabled: !!props.disabled,
          'data-team-field': props.field,
          onChange: (event) => props.onChange(event.target.value),
          style: { font: 'inherit', fontSize: 12, color: 'var(--dsw-alias-label-primary, inherit)', background: 'transparent', border: '1px solid ' + palette.border, borderRadius: 6, padding: '3px 6px', minWidth: 0 },
        }, (props.options || []).map((option) => h('option', { key: option.value, value: option.value, disabled: !!option.disabled, style: { color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)' } }, option.label))))
    }

    function RoutePicker(props) {
      const { kit, providers, value, onChange, tr } = props
      const route = value || { provider: '', model: '', effort: '' }
      const provider = providers.find((entry) => entry.id === route.provider)
      const providerOptions = [{ value: '', label: '—' }, ...providers.map((entry) => ({ value: entry.id, label: entry.name === entry.id ? entry.id : entry.name + ' (' + entry.id + ')' }))]
      if (route.provider && !provider) providerOptions.push({ value: route.provider, label: route.provider + ' (?)' })
      const models = provider ? provider.models : []
      const modelOptions = [{ value: '', label: '—' }, ...models.map((model) => ({ value: model.id, label: model.name === model.id ? model.id : model.name + ' (' + model.id + ')' }))]
      if (route.model && !models.some((model) => model.id === route.model)) modelOptions.push({ value: route.model, label: route.model + ' (?)' })
      const efforts = useEfforts(kit, route.provider, route.model)
      const effortOptions = [{ value: '', label: tr('effortDefault') }, ...((efforts || []).map((effort) => ({ value: effort.id, label: effort.name })))]
      if (route.effort && !(efforts || []).some((effort) => effort.id === route.effort)) effortOptions.push({ value: route.effort, label: route.effort })
      return h('div', { style: { display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }, 'data-team-route-picker': props.marker || 'route' },
        h(Select, { kit, label: tr('provider'), field: 'provider', value: route.provider, disabled: !!props.disabled, options: providerOptions, onChange: (next) => onChange({ provider: next, model: '', effort: '' }) }),
        h(Select, { kit, label: tr('model'), field: 'model', value: route.model, options: modelOptions, disabled: !!props.disabled || !route.provider, onChange: (next) => onChange({ ...route, model: next, effort: '' }) }),
        h(Select, { kit, label: tr('effort'), field: 'effort', value: route.effort || '', options: effortOptions, disabled: !!props.disabled || !route.model, flex: '0 1 110px', onChange: (next) => onChange({ ...route, effort: next }) }),
        props.onRemove ? h(kitOr(kit, 'Button', 'button'), { variant: 'ghost', onClick: props.onRemove }, tr('remove')) : null)
    }

    async function postChecked(kit, body) {
      const postJson = kitOr(kit, 'postJson', () => Promise.reject(new Error(msgOf(kit, 'error.kitPostJsonUnavailable'))))
      const result = await postJson(API, body)
      if (!result || result.ok === false) throw new Error(errorMessage(result) || msgOf(kit, 'error.apiUnavailable'))
      return result
    }

    /** All global form writes use one audited stage, then commit that exact id. */
    async function commitChange(kit, change, reason) {
      const staged = await postChecked(kit, { action: 'config-stage', change, reason, userInstruction: '' })
      const id = staged.staged && staged.staged.id
      if (!id) throw new Error(msgOf(kit, 'error.stageMissingId'))
      try {
        return await postChecked(kit, { action: 'config-commit', id })
      } catch (error) {
        // Discard only our own failed stage, not files or another caller's draft.
        await postChecked(kit, { action: 'config-discard', id }).catch(() => {})
        throw error
      }
    }

    function TextField(props) {
      return h('label', { className: 'bbff-team-field' },
        h('span', null, props.label),
        h(props.multiline ? 'textarea' : 'input', {
          type: props.multiline ? undefined : (props.type || 'text'),
          value: props.value === undefined || props.value === null ? '' : props.value,
          rows: props.multiline ? (props.rows || 3) : undefined,
          min: props.min, max: props.max, maxLength:props.maxLength, step: props.type === 'number' ? 1 : undefined,
          disabled: !!props.disabled, placeholder: props.placeholder,
          'data-team-field': props.field,
          onChange: (event) => props.onChange(event.target.value),
        }))
    }

    function UiAction(props) {
      const Button = kitOr(props.kit, 'Button', 'button')
      return h('span', { 'data-team-action': props.action }, h(Button, {
        variant: props.variant || 'ghost', disabled: !!props.disabled, title: props.title, onClick: props.onClick,
      }, props.children))
    }

    function roleModels(role) {
      if (Array.isArray(role.models)) return role.models
      return [role.route, ...(role.fallback || [])].filter(Boolean).map((route, index) => ({ ...route, use: index ? 'Explicit alternative' : 'Preferred' }))
    }
    const changedFields = (value, baseline) => Object.fromEntries(Object.entries(value).filter(([key, field]) => JSON.stringify(field) !== JSON.stringify(baseline[key])))
    const cleanTier = (tier) => ({
      ...(String(tier.label || '').trim() ? { label: String(tier.label).trim() } : {}),
      provider: tier.provider, model: tier.model,
      ...(tier.effort ? { effort: tier.effort } : {}), use: String(tier.use || '').trim(),
    })
    function roleDraftError(draft, creating, knownIds) {
      if (creating && !/^[a-z][a-z0-9-]{1,31}$/.test(draft.id)) return 'invalidId'
      if (creating && knownIds.includes(draft.id)) return 'duplicateRole'
      if (!draft.title.trim()) return 'requiredTitle'
      if (!String(draft.leaderBrief?.summary||'').trim() || !String(draft.identityPrompt||'').trim()) return 'requiredFields'
      if (draft.concurrency !== '' && !(Number.isSafeInteger(Number(draft.concurrency)) && Number(draft.concurrency) > 0)) return 'badConcurrency'
      if (draft.models.some((tier) => !tier.provider || !tier.model || !String(tier.use || '').trim())) return 'tierIncomplete'
      const labels = draft.models.map((tier) => String(tier.label || '').trim()).filter(Boolean)
      if (new Set(labels).size !== labels.length) return 'duplicateLabel'
      return ''
    }

    const filterFields = ['tools', 'skills', 'mcp']
    const listNames = value => String(value || '').split(/[,\n]/).map(name => name.trim()).filter(Boolean)
    const filterDraft = value => ({ mode: Array.isArray(value?.allow) ? 'list' : 'inherit', allow: (value?.allow || []).join('\n'), deny: (value?.deny || []).join('\n'), denyEffects: [...(value?.denyEffects||[])] })
    const cleanFilter = value => ({ ...(value.mode === 'list' ? { allow: listNames(value.allow) } : {}), ...(listNames(value.deny).length ? { deny: listNames(value.deny) } : {}), ...(value.denyEffects?.length?{denyEffects:[...value.denyEffects]}:{}) })
    const editableRole = (role, defaults = {}) => ({ title: role.title || '', kind: role.kind ?? defaults.kind, leaderBrief: {...(role.leaderBrief||{summary:role.purpose||''})}, identityPrompt: role.identityPrompt || role.prompt || '', reuse: role.reuse ?? defaults.reuse, models: roleModels(role).map(cleanTier), concurrency: role.concurrency || null, readOnly: !!role.readOnly, delegation: role.delegation || { mode: 'none' }, tools: role.tools || {}, skills: role.skills || {}, mcp: role.mcp || {} })
    function rolePolicyProps(role, field, tr) {
      const fact = role.fieldSources?.[field]
      const source = fact?.source || role.source || 'default'
      const defaultValue = role.defaults ? role.defaults[field] : undefined
      const value = defaultValue && typeof defaultValue === 'object' && !Object.keys(defaultValue).length ? tr('filtersInherited') : defaultValue === undefined ? tr('customNoDefault') : JSON.stringify(defaultValue)
      const explain = { source: tr('source_' + source) + (fact?.path ? ' · ' + fact.path : ''), settingPath: 'roles.' + role.id + '.' + field, default: value }
      return { title: explain.source + ' · ' + tr('factoryDefault') + ': ' + value + ' · ' + tr('policyEdit') + ': ' + explain.settingPath, explain }
    }
    function RoleDefault(props) {
      const {kit,role,field,tr}=props,policy=rolePolicyProps(role,field,tr),value=role.defaults?.[field]
      let label=value===undefined?tr('customNoDefault'):value===null?tr('allowAll'):typeof value==='boolean'?tr(value?'valueOn':'valueOff'):String(value)
      if(field==='kind'&&value)label=tr('kind_'+value)
      else if(field==='reuse'&&value)label=tr('reuse_'+value.replace('-','_'))
      else if(field==='delegation'&&value)label=tr('delegation_'+value.mode)
      else if(field==='models'&&Array.isArray(value))label=value.length?tr('defaultContent'):tr('inherit')
      else if(value&&typeof value==='object')label=field==='title'?(textOf(kit,value)||tr('defaultContent')):Object.keys(value).length?tr('defaultContent'):tr('allowAll')
      else if(typeof value==='string'&&(value.includes('\n')||field==='purpose'||field==='prompt'))label=tr('defaultContent')
      return h('details', { className: 'bbff-team-hint bbff-team-default-row', 'data-team-default': field },
        h('summary', { title: policy.title },tr('labelValue',{label:tr('factoryDefault'),value:label})),
        h('pre',null,typeof value==='string'?value:policy.explain.default),h('div',null,policy.explain.source),h('code',null,policy.explain.settingPath))
    }
    function FilterEditor(props) {
      const { kit, field, value, onChange, tr, role, catalog, disabled } = props
      const kind = field === 'tools' ? 'tool' : field === 'skills' ? 'skill' : 'mcp'
      const entries = (catalog?.entries || []).filter(entry => entry.kind === kind)
      const ownerLabel = entry => entry?.owner?.kind === 'bbff' ? textIn(kit, entry.owner.module.title, entry.owner.module.packageName) : entry?.owner?.kind === 'mcp' ? entry.owner.server : entry?.owner?.kind === 'dsh' ? tr('ownerDsh') : tr('ownerUnknown')
      const names = key => {
        const values = listNames(value[key])
        return h('div', { className: 'bbff-team-field', key },
          h(TextField, { field: field + '-' + key, label: tr(key === 'allow' ? 'allowNames' : 'denyNames'), value: value[key], multiline: true, rows: 2, disabled, onChange: text => onChange({ ...value, [key]: text }) }),
          h(Select, { kit, field: field + '-' + key + '-catalog', label: tr('chooseCatalog'), value: '', disabled, options: [{ value: '', label: tr('chooseCatalog') }, ...entries.map(entry => ({ value: entry.name, label: entry.name + ' · ' + ownerLabel(entry) }))], onChange: name => { if (name && !values.includes(name)) onChange({ ...value, [key]: [...values, name].join('\n') }) } }),
          values.map(name => {
            const entry = entries.find(item => item.name === name)
            const status = !entry ? 'catalogUnknown' : entry.stale ? 'catalogStale' : entry.present ? 'catalogPresent' : entry.seenThisRun ? 'catalogSeen' : 'catalogNotSeen'
            return h('div', { key: name, 'data-team-filter-name': name, className: 'bbff-team-line' }, h('code', null, name), h(kitOr(kit, 'Badge', 'span'), { ...rolePolicyProps(role, field, tr), tone: 'default' }, tr('modified')), field === 'skills' && key === 'deny' && !entry?.present ? null : h('span', null, tr(status) + ' · ' + ownerLabel(entry)), h(UiAction, { kit, action: 'remove-filter-name', disabled, onClick: () => onChange({ ...value, [key]: values.filter(item => item !== name).join('\n') }) }, tr('remove')))
          }))
      }
      return h('fieldset', { className: 'bbff-team-tier', 'data-team-filter': field, disabled },
        h('legend', null, tr('filter_' + field)), h(RoleDefault, { kit, role, field, tr }),
        field==='tools'?h('div',{'data-team-capability-blacklist':'true'},h('strong',null,tr('capabilityBlacklist')),h('p',{className:'bbff-team-hint'},tr('nativeBlacklistHint')),(props.denyCapabilities||[]).map(capability=>h('label',{key:capability,className:'bbff-team-check'},h('input',{type:'checkbox',checked:value.denyEffects.includes(capability),disabled,'data-team-deny-capability':capability,onChange:event=>onChange({...value,denyEffects:event.target.checked?[...value.denyEffects,capability]:value.denyEffects.filter(item=>item!==capability)})}),tr('capability_'+capability)))):null,
        value.mode === 'list' ? h('div',{'data-team-legacy-allow':'true'},h('strong',null,tr('legacyAllow')),names('allow'),h(UiAction,{kit,disabled,action:'remove-legacy-allow',onClick:()=>onChange({...value,mode:'inherit',allow:''})},tr('removeLegacyAllow'))) : null,
        names('deny'), h('div', { className: 'bbff-team-hint' }, tr('manualNames')))
    }

    function RoleEditor(props) {
      const { kit, role, providers, tr, onSaved, onCancel, creating = false } = props
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const baseline = React.useRef(editableRole(role, props.roleSchema?.newRoleDefaults))
      const initialTitle = React.useRef(titleOf(kit, role))
      const initialFilters = React.useRef(Object.fromEntries(filterFields.map(field => [field, filterDraft(role[field])])))
      const [filters, setFilters] = React.useState(() => Object.fromEntries(filterFields.map(field => [field, filterDraft(role[field])])))
      const [draft, setDraft] = React.useState(() => ({
        id: role.id || '', title: titleOf(kit, role), kind: baseline.current.kind,
        leaderBrief: {...baseline.current.leaderBrief}, identityPrompt: baseline.current.identityPrompt, reuse: baseline.current.reuse,
        models: roleModels(role).map((tier) => ({ ...tier })), concurrency: role.concurrency ? String(role.concurrency) : '',
        readOnly: !!role.readOnly, delegation: role.delegation?.mode || 'none', delegationRoles: (role.delegation?.roles || []).join(', '), reason: '',
      }))
      const review = useConfigReview(kit, onSaved)
      const saving = review.locked
      let invalid = roleDraftError(draft, creating, props.knownIds || [])
      for (const field of filterFields) {
        const pattern = props.roleSchema?.filterSyntax?.[field]
        for (const key of ['allow', 'deny']) {
          const names = listNames(filters[field][key])
          if (new Set(names).size !== names.length || (pattern && names.some(name => !new RegExp(pattern).test(name)))) invalid = 'badFilter'
        }
      }
      const title = draft.title === initialTitle.current ? baseline.current.title : draft.title
      const delegationRoles = listNames(draft.delegationRoles)
      const sameDelegation = draft.delegation === baseline.current.delegation.mode && JSON.stringify(delegationRoles) === JSON.stringify(baseline.current.delegation.roles || [])
      const delegation = sameDelegation ? baseline.current.delegation : { mode: draft.delegation, ...(draft.delegation === 'oneshot' && delegationRoles.length ? { roles: delegationRoles } : {}) }
      const candidate = { title, kind: draft.kind, leaderBrief: draft.leaderBrief, identityPrompt: draft.identityPrompt, reuse: draft.reuse, models: draft.models.map(cleanTier), concurrency: draft.concurrency === '' ? null : Number(draft.concurrency), readOnly: draft.readOnly, delegation,
        ...Object.fromEntries(filterFields.map(field => [field, JSON.stringify(filters[field]) === JSON.stringify(initialFilters.current[field]) ? baseline.current[field] : cleanFilter(filters[field])])) }
      const dirty = creating || Object.keys(changedFields(candidate, baseline.current)).length > 0
      const update = (key, value) => { setDraft((current) => ({ ...current, [key]: value })); review.clearError() }
      const updateTier = (index, value) => setDraft((current) => ({ ...current, models: current.models.map((tier, at) => at === index ? { ...tier, ...value } : tier) }))
      const moveTier = (index, delta) => setDraft((current) => {
        const models = current.models.slice(); const other = index + delta
        if (other < 0 || other >= models.length) return current
        ;[models[index], models[other]] = [models[other], models[index]]
        return { ...current, models }
      })
      const save = async () => {
        if (saving || invalid || !dirty) return
        const patch = creating ? { ...candidate, id: draft.id } : changedFields(candidate, baseline.current)
        const before = creating ? null : Object.fromEntries(Object.keys(patch).map(key => [key, baseline.current[key]]))
        await review.prepare({ op: 'patch-role', id: draft.id, role: patch }, draft.reason.trim() || 'Settings UI: ' + (creating ? 'create role ' : 'edit role ') + draft.id, before, creating ? candidate : patch, async () => {
          const current = await getChecked(kit, API + '?action=config-read')
          const latest = current.catalog?.roles?.find(item => item.id === draft.id)
          if (creating && latest) throw new Error(tr('duplicateRole'))
          if (!creating) {
            if (!latest) throw new Error(tr('staleRole'))
            const values = editableRole(latest, props.roleSchema?.newRoleDefaults)
            if (Object.keys(patch).some(key => JSON.stringify(values[key]) !== JSON.stringify(baseline.current[key]))) throw new Error(tr('staleRole'))
          }
        })
      }
      const field = (key, label, extra = {}) => h(TextField, { key, field: key, label, value: draft[key], disabled: saving, onChange: (value) => update(key, value), ...extra })
      return h('div', { 'data-team-editor': creating ? 'new' : role.id, 'data-team-new-role': creating ? 'true' : undefined, className: 'bbff-team-editor' },
        h('strong', null, creating ? tr('newRole') : tr('edit') + ' · ' + titleOf(kit, role)),
        creating ? field('id', tr('roleId')) : h('details',{className:'bbff-team-hint','data-team-role-identity':'true'},h('summary',null,tr('roleId')),h('code',null,role.id)),
        h('div', { className: 'bbff-team-grid' }, h('div', null, field('title', tr('roleTitle')), h(RoleDefault, { kit, role, field: 'title', tr })),
          h('div', null, h(Select, { kit, label: tr('roleKind'), field: 'kind', value: draft.kind, disabled: saving, options: (props.roleSchema?.kinds || [role.kind]).filter(Boolean).map(value => ({ value, label: tr('kind_' + value) })), onChange: value => update('kind', value) }), h(RoleDefault, { kit, role, field: 'kind', tr }))),
        h('section',{'data-team-brief-editor':role.id||'new',className:'bbff-team-tier'},h('strong',null,tr('leaderBrief')),h('p',{className:'bbff-team-hint'},tr('contextEnglish')),
          (props.roleSchema?.leaderBriefFields||Object.keys(draft.leaderBrief)).map(key=>h(TextField,{key,field:'leaderBrief.'+key,label:tr('leaderBrief_'+key),value:draft.leaderBrief[key]||'',multiline:true,rows:key==='summary'?2:2,disabled:saving,onChange:value=>update('leaderBrief',{...draft.leaderBrief,[key]:value})})),h(RoleDefault,{kit, role,field:'leaderBrief',tr})),
        h('div', { className: 'bbff-team-field' },
          h(Select, { kit, label: tr('reuse'), field: 'reuse', value: draft.reuse, disabled: saving, options: (props.roleSchema?.reuseModes || [draft.reuse]).map((value) => ({ value, label: tr('reuse_' + value.replace('-', '_')) })), onChange: (value) => update('reuse', value) }),
          h('div', { className: 'bbff-team-hint', 'data-team-reuse-hint': draft.reuse }, tr('reuseHint_' + draft.reuse.replace('-', '_'))), h(RoleDefault, { kit, role, field: 'reuse', tr })),
        h('details',{'data-team-identity-editor':role.id||'new',className:'bbff-team-tier'},h('summary',null,tr('identityPrompt')),h('p',{className:'bbff-team-hint'},tr('contextEnglish')),field('identityPrompt',tr('identityPrompt'),{multiline:true,rows:7}),h(RoleDefault,{kit, role,field:'identityPrompt',tr})),
        h('div', { className: 'bbff-team-grid' },
          h('div', null, h('label', { className: 'bbff-team-check' }, h('input', { type: 'checkbox', checked: draft.readOnly, disabled: saving, 'data-team-field': 'readOnly', onChange: event => update('readOnly', event.target.checked) }), tr('permissionReadOnly')), h(RoleDefault, { kit, role, field: 'readOnly', tr })),
          h('div', null, h(Select, { kit, label: tr('delegation'), field: 'delegation', value: draft.delegation, disabled: saving, options: (props.roleSchema?.delegationModes || [draft.delegation]).map(value => ({ value, label: tr('delegation_' + value) })), onChange: value => update('delegation', value) }), h(RoleDefault, { kit, role, field: 'delegation', tr })),
          draft.delegation === 'oneshot' ? field('delegationRoles', tr('delegationRoles')) : null),
        h('details', { className: 'bbff-team-section', 'data-team-filters': 'true' }, h('summary', null, tr('filters')),
          !props.permissionCatalog ? h('div', { className: 'bbff-team-hint' }, tr('catalogCapability')) : null,
          props.reportDependencies ? h('details', { className: 'bbff-team-hint', 'data-team-report-dependencies': 'true' }, h('summary', null, tr('reportDependencies')), h('code', null, props.reportDependencies.tools.join(', ')), h('div', null, textOf(kit, props.reportDependencies.reason))) : null,
          filterFields.map(field => h(FilterEditor, { key: field, kit, field, value: filters[field], role, tr, disabled: saving, catalog: props.permissionCatalog, denyCapabilities:props.roleSchema?.denyCapabilities, onChange: value => { setFilters(current => ({ ...current, [field]: value })); review.clearError() } })),
          h('details', { 'data-team-unknown-effects': 'true' }, h('summary', null, tr('unknownEffects')),
            h('div', { className: 'bbff-team-hint' }, tr('unknownEffectsHint')),
            h('div', { className: 'bbff-team-hint' }, tr('unknownPolicy') + ': ' + (props.unknownToolEffectPolicy ? tr(props.unknownToolEffectPolicy.value === 'allow' ? 'policyAllow' : 'policyDeny') + ' · ' + tr('factoryDefault') + ': ' + tr(props.unknownToolEffectPolicy.default === 'allow' ? 'policyAllow' : 'policyDeny') + ' · ' + props.unknownToolEffectPolicy.settingPath : tr('policyUnavailable'))),
            [...new Set([...Object.keys(props.toolEffects || {}), ...listNames(filters.tools.allow), ...listNames(filters.tools.deny)])].filter(name => !props.toolEffects?.[name]?.effects?.length).map(name => h('div', { key: name, 'data-team-unknown-tool': name }, h('code', null, name))))),
        h('div', { className: 'bbff-team-line' }, h('strong', null, tr('models') + ' · ' + draft.models.length),
          h(UiAction, { kit, action: 'add-tier', disabled: saving, onClick: () => update('models', [...draft.models, { label: '', provider: '', model: '', effort: '', use: '' }]) }, tr('addTier'))),
        !draft.models.length ? h('div', { className: 'bbff-team-hint', 'data-team-default-model': 'true' }, tr('inherit')) : null,
        draft.models.map((tier, index) => h('div', { key: index, className: 'bbff-team-tier', 'data-team-tier': String(index) },
          h('div', { className: 'bbff-team-line' }, h('strong', null, String(index + 1) + (index === 0 ? ' · ' + tr('preferred') : '')),
            h(UiAction, { kit, action: 'tier-up', title: tr('moveUp'), disabled: saving || index === 0, onClick: () => moveTier(index, -1) }, '↑'),
            h(UiAction, { kit, action: 'tier-down', title: tr('moveDown'), disabled: saving || index === draft.models.length - 1, onClick: () => moveTier(index, 1) }, '↓'),
            h(UiAction, { kit, action: 'tier-remove', disabled: saving, onClick: () => update('models', draft.models.filter((_item, at) => at !== index)) }, tr('remove'))),
          h(TextField, { label: tr('tierLabel'), field: 'tier-label', value: tier.label || '', disabled: saving, onChange: (value) => updateTier(index, { label: value }) }),
          h(RoutePicker, { kit, providers: providers || [], tr, value: tier, onChange: (value) => updateTier(index, value), marker: 'tier-' + index, disabled: saving }),
          h(TextField, { label: tr('tierUse'), field: 'tier-use', value: tier.use || '', multiline: true, rows: 2, disabled: saving, onChange: (value) => updateTier(index, { use: value }) }))),
        h('div', { className: 'bbff-team-hint' }, tr('defaultModelHint')),
        draft.models.length === 1 ? h('div', { className: 'bbff-team-hint', 'data-team-single-tier-hint': 'true' }, tr('singleTierHint')) : null,
        h(RoleDefault, { kit, role, field: 'models', tr }),
        h('div', { className: 'bbff-team-grid' }, h('div', null, field('concurrency', tr('concurrency'), { type: 'number', min: 1, placeholder: tr('concurrencyHint') }), h('div', { className: 'bbff-team-hint' }, tr('concurrencyHint')), h(RoleDefault, { kit, role, field: 'concurrency', tr })), field('reason', tr('reason'))),
        invalid ? h('div', { className: 'bbff-team-invalid', role: 'status' }, tr(invalid)) : null,
        !review.review ? h('div', { className: 'bbff-team-line' },
          h(UiAction, { kit, action: 'save-role', variant: 'primary', disabled: saving || !!invalid || !dirty, onClick: save }, review.busy ? tr('preparing') : tr('previewChange')),
          h(UiAction, { kit, action: 'cancel-role', disabled: saving, onClick: onCancel }, tr('cancel'))) : null,
        h(ConfigDiff, { kit, tr, state: review }),
        review.error ? h(ErrorText, null, review.error) : null)
    }

    function expectedStageBaseline(change, before) {
      const expected = {}, operations = Array.isArray(change) ? change : [change]
      for (const operation of operations) {
        if (['patch-role','replace-role','reset-role','reset-role-models','remove-role'].includes(operation.op)) {
          const fields = operation.op === 'reset-role-models' ? { models: before?.models } : before
          ;(expected.roles ||= []).push({ id: operation.id, exists: before !== null, ...(before !== null ? { fields } : {}) })
        } else if (operation.op === 'restore-role') {
          expected.removedRoles ||= {}; expected.removedRoles[operation.id] = true
        } else if (operation.op === 'patch-settings' && operation.settings?.doctrineTemplates) {
          expected.doctrineTemplates ||= {}
          for (const key of Object.keys(operation.settings.doctrineTemplates)) expected.doctrineTemplates[key] = Object.hasOwn(before || {}, key) ? { exists: true, value: before[key] } : { exists: false }
        } else if (operation.op === 'reset-doctrine-template') {
          expected.doctrineTemplates ||= {}
          expected.doctrineTemplates[operation.key] = Object.hasOwn(before || {}, operation.key) ? { exists: true, value: before[operation.key] } : { exists: false }
        } else if (operation.op === 'patch-settings') expected.settings = before
        else if (['put-formation','remove-formation'].includes(operation.op)) {
          ;(expected.formations ||= []).push({ id: operation.id || operation.formation.id, exists: before !== null, ...(before !== null ? { value: before } : {}) })
        }
      }
      return Object.keys(expected).length ? expected : undefined
    }

    // Review stages are owned by one form. No global file is changed until the
    // user confirms this exact id; abandoning the form discards only its stage.
    function useConfigReview(kit, onSaved) {
      const [review, setReview] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const stageId = React.useRef(null), running = React.useRef(false), alive = React.useRef(true)
      React.useEffect(() => {
        alive.current = true
        return () => { alive.current = false; if (stageId.current) postChecked(kit, { action: 'config-discard', id: stageId.current }).catch(() => {}) }
      }, [])
      const prepare = async (change, reason, before, after, checkCurrent) => {
        if (running.current || stageId.current) return
        running.current = true; setBusy(true); setError('')
        try {
          if (checkCurrent) await checkCurrent()
          const payload = await postChecked(kit, { action: 'config-stage', change, reason, userInstruction: '', expected: expectedStageBaseline(change, before) })
          if (!payload.staged?.id) throw new Error(msgOf(kit, 'error.stageMissingId'))
          if (!alive.current) { await postChecked(kit, { action: 'config-discard', id: payload.staged.id }); return }
          stageId.current = payload.staged.id
          setReview({ staged: payload.staged, before: payload.staged.review?.before ?? before, after: payload.staged.review?.after ?? after })
        } catch (reason) { if (alive.current) setError(errorMessage(reason)) }
        finally { running.current = false; if (alive.current) setBusy(false) }
      }
      const commit = async () => {
        if (running.current || !stageId.current) return
        running.current = true; setBusy(true); setError('')
        try {
          const payload = await postChecked(kit, { action: 'config-commit', id: stageId.current })
          stageId.current = null
          if (alive.current) { setReview(null); onSaved(payload) }
        } catch (reason) { if (alive.current) setError(errorMessage(reason)) }
        finally { running.current = false; if (alive.current) setBusy(false) }
      }
      const discard = async () => {
        if (running.current || !stageId.current) return
        running.current = true; setBusy(true); setError('')
        try {
          await postChecked(kit, { action: 'config-discard', id: stageId.current })
          stageId.current = null; if (alive.current) setReview(null)
        } catch (reason) { if (alive.current) setError(errorMessage(reason)) }
        finally { running.current = false; if (alive.current) setBusy(false) }
      }
      return { review, busy, error, prepare, commit, discard, locked: busy || !!review, clearError: () => setError('') }
    }

    function ConfigDiff(props) {
      const { kit, tr, state } = props
      if (!state.review) return null
      const { staged, before, after } = state.review
      return h('section', { className: 'bbff-team-diff', 'data-team-diff': staged.id, role: 'region', 'aria-label': tr('diffTitle') },
        h('strong', null, tr('diffTitle')),
        h('div', { className: 'bbff-team-hint' }, props.hint),
        h('div', { className: 'bbff-team-hint' }, tr('stagedId') + ': ', h('code', null, staged.id)),
        h('div', { className: 'bbff-team-hint', 'data-team-diff-summary': 'true' }, tr('diffSummary') + ': ' + (historySummary({ summary: staged.summary }) || tr('noChanges'))),
        staged.warnings?.length ? h('div', { className: 'bbff-team-hint', 'data-team-preflight-warnings': 'true' },
          h('strong', null, tr('preflightWarnings')),
          staged.warnings.map((warning, index) => h('div', { key: index }, [warning.role, warning.provider, warning.model].filter(Boolean).join(' / ') + ': ' + warning.reason))) : null,
        h('div', { className: 'bbff-team-diff-grid' },
          h('div', null, h('strong', null, tr('diffBefore')), h('pre', { 'data-team-diff-before': 'true' }, before === null ? tr('diffNew') : JSON.stringify(before, null, 2))),
          h('div', null, h('strong', null, tr('diffAfter')), h('pre', { 'data-team-diff-after': 'true' }, after === null ? tr('diffRemoved') : JSON.stringify(after, null, 2)))),
        h('div', { className: 'bbff-team-line' },
          h(UiAction, { kit, action: 'commit-stage', variant: 'primary', disabled: state.busy, onClick: state.commit }, state.busy ? tr('saving') : tr('confirmCommit')),
          h(UiAction, { kit, action: 'discard-stage', disabled: state.busy, onClick: state.discard }, tr('discardStage'))))
    }

    async function getChecked(kit, url) {
      const result = await kit.getJson(url)
      if (!result || result.ok === false) throw new Error(errorMessage(result) || msgOf(kit, 'error.apiUnavailable'))
      return result
    }
    const formationText = (value) => typeof value === 'string' ? value : ''
    const formationDefinition = (value) => {
      if (!value) return null
      const { seatCount: _count, diagnostics: _diagnostics, ...definition } = value
      return definition
    }
    const cleanFormation = (draft) => ({
      id: draft.id.trim(), label: draft.label.trim(),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      seats: draft.seats.map((seat) => ({ seat: seat.seat, function: seat.function.trim(), role: seat.role,
        ...(seat.model ? { model: seat.model } : {}), ...(seat.assist ? { assist: seat.assist } : {}) })),
    })
    const SEAT_NAME = /^(?!lead$)(?=.{1,48}$)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
    const FORMATION_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
    function formationValidation(draft, { creating, knownIds = [], roles = [], settings = {}, caps = {} }, tr) {
      const errors = [], warnings = [], seen = new Set(), helpers = new Map()
      if (!FORMATION_NAME.test(draft.id.trim())) errors.push(tr('badFormationId'))
      if (creating && knownIds.includes(draft.id.trim())) errors.push(tr('duplicateFormation'))
      if (!draft.label.trim() || draft.label.trim().length > 120) errors.push(tr('badFormationLabel'))
      if (draft.description.trim().length > 2000) errors.push(tr('badFormationDescription'))
      for (const [index, seat] of draft.seats.entries()) {
        const prefix = tr('seatCount') + ' ' + (index + 1) + ': '
        if (!SEAT_NAME.test(seat.seat)) errors.push(prefix + tr('badSeatName'))
        else if (seen.has(seat.seat)) errors.push(prefix + tr('duplicateSeat'))
        seen.add(seat.seat)
        if (!seat.function.trim()) errors.push(prefix + tr('missingSeatFunction'))
        if (!seat.role) errors.push(prefix + tr('missingSeatRole'))
        const role = roles.find((role) => role.id === seat.role)
        if (seat.role && !role) warnings.push(prefix + tr('diagnosticsRole') + ': ' + seat.role)
        if (seat.model && role && !(role.models || []).some((tier) => tier.label === seat.model)) warnings.push(prefix + tr('diagnosticsTier') + ': ' + seat.model)
        if (seat.assist) {
          if (!SEAT_NAME.test(seat.assist)) errors.push(prefix + tr('badSeatName'))
          const main = draft.seats.find((other) => other.seat === seat.assist)
          if (!main || main === seat || main.assist) warnings.push(prefix + tr('diagnosticsAssist'))
          helpers.set(seat.assist, (helpers.get(seat.assist) || 0) + 1)
        }
      }
      if (helpers.size && settings.nestingMode !== 'helpers') warnings.push(tr('diagnosticsHelpers'))
      for (const [main, count] of helpers) if (count > (settings.helpersPerMember ?? 2)) warnings.push(main + ': ' + tr('diagnosticsQuota'))
      if (['dshCap', 'bbffCap'].some((key) => Number.isSafeInteger(caps[key]) && draft.seats.length > caps[key])) warnings.push(tr('diagnosticsCap'))
      return { errors, warnings }
    }

    function FormationEditor(props) {
      const { kit, tr, formation, payload, settings, creating = false } = props
      const baseline = React.useRef(formationDefinition(formation))
      const [draft, setDraft] = React.useState(() => ({
        id: formationText(formation?.id), label: formationText(formation?.label), description: formationText(formation?.description), reason: '',
        seats: (Array.isArray(formation?.seats) ? formation.seats : []).map((seat) => ({ seat: formationText(seat?.seat), function: formationText(seat?.function), role: formationText(seat?.role), model: formationText(seat?.model), assist: formationText(seat?.assist) })),
      }))
      const review = useConfigReview(kit, props.onSaved)
      const roles = payload.roles || [], candidate = cleanFormation(draft)
      const issues = formationValidation(draft, { creating, knownIds: (payload.formations || []).map((row) => row.id), roles, settings, caps: payload }, tr)
      const dirty = creating || JSON.stringify(candidate) !== JSON.stringify(baseline.current)
      const update = (key, value) => { if (!review.locked) { setDraft((current) => ({ ...current, [key]: value })); review.clearError() } }
      const updateSeat = (index, patch) => { if (!review.locked) { setDraft((current) => ({ ...current, seats: current.seats.map((seat, at) => at === index ? { ...seat, ...patch } : seat) })); review.clearError() } }
      const prepare = () => {
        if (issues.errors.length || !dirty) return
        return review.prepare({ op: 'put-formation', formation: candidate }, draft.reason.trim() || 'Settings UI: ' + (creating ? 'create formation ' : 'edit formation ') + candidate.id, baseline.current, candidate, async () => {
          const current = await getChecked(kit, API + '?action=formations')
          if (current.diagnostics?.length) throw new Error(tr('formationRepair'))
          const found = formationDefinition((current.formations || []).find((row) => row.id === candidate.id))
          if ((creating && found) || (!creating && JSON.stringify(found) !== JSON.stringify(baseline.current))) throw new Error(tr('staleFormation'))
        })
      }
      const field = (key, label, extra = {}) => h(TextField, { field: key === 'reason' ? 'formation-reason' : 'formation-' + key, label, value: draft[key], disabled: review.locked, onChange: (value) => update(key, value), ...extra })
      return h('div', { className: 'bbff-team-editor bbff-team-formation-editor', 'data-team-formation-editor': creating ? 'new' : formation.id },
        h('strong', null, creating ? tr('newFormation') : tr('editFormation') + ' · ' + formation.id),
        h('div', { className: 'bbff-team-grid' }, field('id', tr('formationId'), { disabled: !creating || review.locked, placeholder: 'build-phase' }), field('label', tr('formationLabel'))),
        field('description', tr('formationDescription'), { multiline: true, rows: 2 }),
        h('div', { className: 'bbff-team-line' }, h('strong', null, tr('seatCount') + ' · ' + draft.seats.length), h(UiAction, { kit, action: 'add-seat', disabled: review.locked, onClick: () => update('seats', [...draft.seats, { seat: '', function: '', role: '', model: '', assist: '' }]) }, tr('addSeat'))),
        !draft.seats.length ? h('div', { className: 'bbff-team-hint' }, tr('emptySeats')) : null,
        draft.seats.map((seat, index) => {
          const role = roles.find((role) => role.id === seat.role), models = role?.models || []
          const roleOptions = [{ value: '', label: tr('chooseRole') }, ...roles.map((role) => ({ value: role.id, label: titleOf(kit, role) }))]
          if (seat.role && !role) roleOptions.push({ value: seat.role, label: seat.role + ' · ' + tr('unavailableChoice') })
          const tierOptions = [{ value: '', label: models.length ? tr('preferredTier') + ' · ' + (models[0].use || '') : tr('inherit') }, ...models.map((tier, at) => ({ value: tier.label || '__unlabelled-' + at, label: (tier.label || String(at + 1) + ' · ' + tr('unlabelledTier')) + ' — ' + tier.use, disabled: !tier.label }))]
          if (seat.model && !models.some((tier) => tier.label === seat.model)) tierOptions.push({ value: seat.model, label: seat.model + ' · ' + tr('unavailableChoice') })
          const mains = draft.seats.filter((other, at) => at !== index && !other.assist && SEAT_NAME.test(other.seat))
          const assistOptions = [{ value: '', label: tr('mainSeat') }, ...mains.map((other) => ({ value: other.seat, label: other.seat + (other.function ? ' · ' + other.function : '') }))]
          if (seat.assist && !mains.some((other) => other.seat === seat.assist)) assistOptions.push({ value: seat.assist, label: seat.assist + ' · ' + tr('unavailableChoice') })
          return h('div', { key: index, className: 'bbff-team-tier', 'data-team-seat': String(index) },
            h('div', { className: 'bbff-team-line' }, h('strong', null, tr('seatCount') + ' ' + (index + 1)), h(UiAction, { kit, action: 'remove-seat', disabled: review.locked, onClick: () => update('seats', draft.seats.filter((_seat, at) => at !== index)) }, tr('removeSeat'))),
            h('div', { className: 'bbff-team-grid' },
              h(TextField, { field: 'seat', label: tr('seatName'), placeholder: 'review-desk', value: seat.seat, disabled: review.locked, onChange: (value) => updateSeat(index, { seat: value }) }),
              h(Select, { kit, field: 'seat-role', label: tr('seatRole'), value: seat.role, disabled: review.locked, options: roleOptions, onChange: (value) => updateSeat(index, { role: value, model: '' }) })),
            h(TextField, { field: 'seat-function', label: tr('seatFunction'), value: seat.function, multiline: true, rows: 2, disabled: review.locked, onChange: (value) => updateSeat(index, { function: value }) }),
            h('div', { className: 'bbff-team-grid' }, h(Select, { kit, field: 'seat-model', label: tr('seatTier'), value: seat.model, disabled: review.locked || (!models.length && !seat.model), options: tierOptions, onChange: (value) => updateSeat(index, { model: value }) }),
              h(Select, { kit, field: 'seat-assist', label: tr('seatAssist'), value: seat.assist, disabled: review.locked, options: assistOptions, onChange: (value) => updateSeat(index, { assist: value }) })))
        }),
        h('div', { className: 'bbff-team-hint' }, tr('helperHint')),
        issues.errors.length ? h('ul', { className: 'bbff-team-invalid', 'data-team-formation-errors': 'true', role: 'status' }, issues.errors.map((error, index) => h('li', { key: index }, error))) : null,
        issues.warnings.length ? h('div', { className: 'bbff-team-hint', 'data-team-formation-warnings': 'true' }, tr('runtimeWarning'), h('ul', null, issues.warnings.map((warning, index) => h('li', { key: index }, warning)))) : null,
        field('reason', tr('reason')),
        !review.review ? h('div', { className: 'bbff-team-line' }, h(UiAction, { kit, action: 'stage-formation', variant: 'primary', disabled: review.busy || !!issues.errors.length || !dirty, onClick: prepare }, review.busy ? tr('preparing') : tr('previewChange')),
          h(UiAction, { kit, action: 'cancel-formation', disabled: review.busy, onClick: props.onCancel }, tr('cancel'))) : null,
        h(ConfigDiff, { kit, tr, state: review, hint: tr('formationWholeDefinition') }),
        review.error ? h(kitOr(kit, 'ErrorText', 'div'), { role: 'alert' }, review.error) : null)
    }

    function FormationRemoval(props) {
      const { kit, tr, formation } = props
      const state = useConfigReview(kit, props.onSaved)
      const before = formationDefinition(formation)
      return h('div', { className: 'bbff-team-revert-confirm', 'data-team-formation-removal': formation.id },
        h('strong', null, tr('removeFormation') + ' · ' + (formation.label || formation.id)),
        h('div', { className: 'bbff-team-hint' }, tr('removeFormationWarning')),
        !state.review ? h('div', { className: 'bbff-team-line' },
          h(UiAction, { kit, action: 'stage-remove-formation', disabled: state.busy, onClick: () => state.prepare({ op: 'remove-formation', id: formation.id }, 'Settings UI: remove formation ' + formation.id, before, null, async () => {
            const current = await getChecked(kit, API + '?action=formations')
            if (current.diagnostics?.length) throw new Error(tr('formationRepair'))
            if (JSON.stringify(formationDefinition((current.formations || []).find((row) => row.id === formation.id))) !== JSON.stringify(before)) throw new Error(tr('staleFormation'))
          }) }, state.busy ? tr('preparing') : tr('previewRemoval')),
          h(UiAction, { kit, action: 'cancel-remove-formation', disabled: state.busy, onClick: props.onCancel }, tr('cancel'))) : null,
        h(ConfigDiff, { kit, tr, state, hint: tr('removeFormationWarning') }),
        state.error ? h(kitOr(kit, 'ErrorText', 'div'), { role: 'alert' }, state.error) : null)
    }

    function FormationsPanel(props) {
      const { kit, tr } = props
      const sessionId = typeof kit.useSession === 'function' ? kit.useSession() : null
      const [state, setState] = React.useState({ payload: null, error: '', reload: 0 })
      const [active, setActive] = React.useState({ id: null, unavailable: false, loading: !!sessionId })
      const [editing, setEditing] = React.useState(null), [removing, setRemoving] = React.useState(null)
      React.useEffect(() => {
        let cancelled = false
        getChecked(kit, API + '?action=formations').then((payload) => { if (!cancelled) setState((old) => ({ ...old, payload, error: '' })) }).catch((error) => { if (!cancelled) setState((old) => ({ ...old, error: errorMessage(error) })) })
        return () => { cancelled = true }
      }, [state.reload])
      React.useEffect(() => {
        let cancelled = false
        setActive({ id: null, unavailable: false, loading: !!sessionId })
        if (sessionId) getChecked(kit, API + '?action=formations&sessionId=' + encodeURIComponent(sessionId)).then((payload) => { if (!cancelled) setActive({ id: payload.activeFormation || null, unavailable: false, loading: false }) }).catch(() => { if (!cancelled) setActive({ id: null, unavailable: true, loading: false }) })
        return () => { cancelled = true }
      }, [sessionId, state.reload])
      const reload = () => setState((old) => ({ ...old, reload: old.reload + 1 }))
      const saved = (result) => { setEditing(null); setRemoving(null); reload(); props.onChanged(result) }
      const payload = state.payload, formations = payload?.formations || [], busy = editing !== null || removing !== null, writeBlocked = !!payload?.diagnostics?.length
      return h('section', { className: 'bbff-team-section', 'data-team-formations': 'true' },
        h('div', { className: 'bbff-team-line' }, h('h3', { className: 'bbff-team-section-title' }, tr('formations') + ' · ' + formations.length),
          h(UiAction, { kit, action: 'new-formation', disabled: !payload || busy || writeBlocked, onClick: () => setEditing('@new') }, tr('newFormation')),
          h(UiAction, { kit, action: 'refresh-formations', disabled: busy, onClick: reload }, tr('refresh'))),
        h('p', { className: 'bbff-team-hint' }, tr('formationHint')),
        h('div', { className: 'bbff-team-hint', 'data-team-active-formation': active.id || payload?.activeFormation || '' }, tr('activeFormation') + ': ', h('code', null, active.loading ? tr('loading') : active.unavailable ? '—' : active.id || payload?.activeFormation || tr('noActiveFormation'))),
        active.unavailable ? h('div', { className: 'bbff-team-hint' }, tr('activeUnavailable')) : null,
        state.error ? h(kitOr(kit, 'ErrorText', 'div'), { role: 'alert' }, tr('formationUnavailable') + ': ' + state.error) : null,
        !payload && !state.error ? h(kitOr(kit, 'Spinner', 'span'), { label: tr('loading') }) : null,
        payload?.diagnostics?.length ? h('div', { className: 'bbff-team-invalid', 'data-team-formations-diagnostics': 'true' }, tr('formationRepair'), h('ul', null, payload.diagnostics.map((message, index) => h('li', { key: index }, message)))) : null,
        editing === '@new' && payload ? h(FormationEditor, { key: 'new', kit, tr, creating: true, payload, settings: props.settings, onSaved: saved, onCancel: () => setEditing(null) }) : null,
        !formations.length && payload && !writeBlocked ? h('div', { className: 'bbff-team-hint' }, tr('formationsEmpty')) : null,
        formations.map((formation, index) => h('div', { key: formationText(formation.id) || index, className: 'bbff-team-formation-row', 'data-team-formation': formationText(formation.id) || String(index) },
          h('div', { className: 'bbff-team-line' }, h('strong', null, formationText(formation.label) || formationText(formation.id) || '—'), h('code', null, formationText(formation.id) || '—'),
            h(kitOr(kit, 'Badge', 'span'), null, String(formation.seatCount ?? formation.seats?.length ?? 0) + ' ' + tr('seatCount')),
            h(kitOr(kit, 'Badge', 'span'), { tone: formation.diagnostics?.length ? 'warning' : 'info' }, formation.diagnostics?.length ? tr('formationDiagnostics') + ' ' + formation.diagnostics.length : tr('formationValid')),
            h(UiAction, { kit, action: 'edit-formation', disabled: busy || writeBlocked || typeof formation.id !== 'string' || !formation.id, onClick: () => setEditing(formation.id) }, tr('editFormation')),
            h(UiAction, { kit, action: 'remove-formation', disabled: busy || writeBlocked || typeof formation.id !== 'string' || !formation.id, onClick: () => setRemoving(formation.id) }, tr('removeFormation'))),
          formationText(formation.description) ? h('p', { className: 'bbff-team-hint' }, formation.description) : null,
          formation.diagnostics?.length ? h('ul', { className: 'bbff-team-invalid', 'data-team-formation-diagnostics': formation.id }, formation.diagnostics.map((message, at) => h('li', { key: at }, message))) : null,
          editing === formation.id ? h(FormationEditor, { key: formation.id, kit, tr, formation, payload, settings: props.settings, onSaved: saved, onCancel: () => setEditing(null) }) : null,
          removing === formation.id ? h(FormationRemoval, { key: formation.id, kit, tr, formation, onSaved: saved, onCancel: () => setRemoving(null) }) : null)))
    }

    async function checkSettingsBaseline(kit, baseline, keys, tr) {
      const current = await getChecked(kit, API + '?action=team-settings')
      if (keys.some(key => JSON.stringify(current.settings[key]) !== JSON.stringify(baseline[key]))) throw new Error(tr('staleSettings'))
      return current
    }

    function settingDescriptor(payload, field, kit) {
      const schema=payload.schema?.[field]||{},declared=payload.settingDescriptors?.settings?.find(row=>row.path===field)
      const spec=declared||{path:field,displayLabel:msgOf(kit,'setting.'+field+'.label'),default:schema.default,defaultLabel:schema.default===null?'—':JSON.stringify(schema.default),options:(schema.options||[]).map(value=>({value,displayLabel:msgOf(kit,'setting.'+field+'.option.'+value)})),source:{settingPath:'settings.'+field}}
      // Host descriptors carry message references; Team's own controls render their resolved text.
      return {...spec,displayLabel:textOf(kit,spec.displayLabel),defaultLabel:textOf(kit,spec.defaultLabel),options:(spec.options||[]).map(option=>({...option,displayLabel:textOf(kit,option.displayLabel)})),source:{...spec.source,...(spec.source?.contract!==undefined?{contract:textOf(kit,spec.source.contract)}:{})}}
    }
    function SettingDefault({payload,field,kit,tr}) {
      const spec=settingDescriptor(payload,field,kit)
      const title=[spec.source?.contract,spec.source?.settingPath,spec.source?.labelPath,spec.min!==undefined?'min: '+spec.min:'',spec.max!==undefined?'max: '+spec.max:''].filter(Boolean).join(' · ')
      return h('div',{'data-team-setting-default':field,className:'bbff-team-hint bbff-team-default-line',title},tr('labelValue',{label:tr('factoryDefault'),value:spec.defaultLabel}))
    }
    function SettingControl({payload,field,kit,tr,children}) {
      return h('div',{className:'bbff-team-setting-row','data-team-setting-row':field},children,h(SettingDefault,{payload,field,kit,tr}))
    }
    function TeamSettingField({kit,payload,field,tr,onSaved,basic=false}) {
      const name=field.path,spec=payload.schema[name],initial=payload.settings[name],baseline=React.useRef(initial)
      const [raw,setRaw]=React.useState(initial===null?'':String(initial)),review=useConfigReview(kit,onSaved)
      const value=spec.type==='enum'?raw:spec.type==='nullable-integer'&&raw.trim()===''?null:Number(raw)
      const capKnown=Number.isSafeInteger(payload.dshCap)&&payload.dshCap>0
      const invalid=spec.type==='enum'?!spec.options.includes(value):value!==null&&(!raw.trim()||!Number.isSafeInteger(value)||value<(spec.min??0)||(spec.max!==undefined&&value>spec.max)||(name==='memberCap'&&capKnown&&value>payload.dshCap))
      const dirty=JSON.stringify(value)!==JSON.stringify(baseline.current),disabled=review.locked
      const control=spec.type==='enum'?h(Select,{kit,field:name,label:textOf(kit,field.displayLabel),value:raw,disabled,options:(field.options||[]).map(option=>({value:option.value,label:textOf(kit,option.displayLabel)})),onChange:setRaw}):h(TextField,{field:name,label:textOf(kit,field.displayLabel),type:'number',value:raw,min:spec.min,max:name==='memberCap'&&capKnown?payload.dshCap:spec.max,placeholder:name==='memberCap'?tr('followsDsh'):undefined,disabled,onChange:setRaw})
      const effect=textOf(kit,field.effect)
      return h('div',{'data-team-v2-setting':name},h(SettingControl,{payload,field:name,kit,tr},control),
        typeof kit.SettingHelp==='function'?h(kit.SettingHelp,{field,labels:payload.settingDescriptors.presentation.labels,moduleId:'team'}):null,
        basic&&effect?h('p',{className:'bbff-team-hint','data-team-setting-effect':name},effect):null,
        name==='memberCap'?h('p',{className:'bbff-team-hint','data-team-dsh-cap':String(payload.dshCap??'')},tr('labelValue',{label:tr('dshCap'),value:String(payload.dshCap??'—')})):null,
        invalid?h('div',{role:'status',className:'bbff-team-invalid'},tr('invalidSettings')):null,
        dirty&&!review.review?h(UiAction,{kit,action:'save-setting-'+name,disabled:review.busy||invalid,onClick:()=>review.prepare({op:'patch-settings',settings:{[name]:value}},'Settings UI: '+name,{[name]:baseline.current},{[name]:value},()=>checkSettingsBaseline(kit,{[name]:baseline.current},[name],tr))},tr('previewChange')):null,
        h(ConfigDiff,{kit,tr,state:review}),review.error?h(kitOr(kit,'ErrorText','div'),null,review.error):null)
    }

    function TeamOptionsForm(props) {
      const { kit, payload, tr, onSaved } = props
      const settings = Object.fromEntries(['nestingMode','helpersPerMember','memberCap','superagentYield','memberNaming'].map(key => [key, Object.hasOwn(payload.settings, key) ? payload.settings[key] : payload.defaults?.[key] ?? payload.schema?.[key]?.default]))
      const [draft, setDraft] = React.useState(() => ({ ...settings, helpersPerMember: String(settings.helpersPerMember), memberCap: settings.memberCap === null ? '' : String(settings.memberCap), reason: '' }))
      const baseline = React.useRef(settings)
      const stamp = JSON.stringify(settings)
      React.useEffect(() => {
        baseline.current = settings
        setDraft({ ...settings, helpersPerMember: String(settings.helpersPerMember), memberCap: settings.memberCap === null ? '' : String(settings.memberCap), reason: '' })
      }, [stamp])
      const review = useConfigReview(kit, onSaved)
      const candidate = { nestingMode: draft.nestingMode, helpersPerMember: Number(draft.helpersPerMember), memberCap: draft.memberCap.trim() === '' ? null : Number(draft.memberCap), superagentYield: draft.superagentYield, memberNaming: draft.memberNaming }
      const patch = changedFields(candidate, baseline.current)
      const dshCap = payload.dshCap
      const capKnown = Number.isSafeInteger(dshCap) && dshCap > 0
      const invalid = !String(draft.helpersPerMember).trim() || !Number.isSafeInteger(candidate.helpersPerMember) || candidate.helpersPerMember < 0
        || (Object.hasOwn(patch, 'memberCap') && candidate.memberCap !== null && (!Number.isSafeInteger(candidate.memberCap) || candidate.memberCap < 1 || (capKnown && candidate.memberCap > dshCap)))
        || !['function', 'seat'].includes(candidate.memberNaming)
      const update = (key, value) => { if (!review.locked) { setDraft((current) => ({ ...current, [key]: value })); review.clearError() } }
      const save = () => {
        if (invalid || !Object.keys(patch).length) return
        return review.prepare({ op: 'patch-settings', settings: patch }, draft.reason.trim() || 'Settings UI: change team settings', Object.fromEntries(Object.keys(patch).map((key) => [key, baseline.current[key]])), patch, () => checkSettingsBaseline(kit, baseline.current, Object.keys(patch), tr))
      }
      const row=(field,control)=>h(SettingControl,{payload,field,kit,tr},control)
      const label=field=>settingDescriptor(payload,field,kit).displayLabel
      const options=field=>settingDescriptor(payload,field,kit).options.map(option=>({value:option.value,label:option.displayLabel}))
      return h('section', { className: 'bbff-team-section bbff-team-settings-form', 'data-team-options': 'true' },
        h('h3', { className: 'bbff-team-section-title' }, tr('teamSettings')),

        h('div', { className: 'bbff-team-grid' },
          row('nestingMode',h(Select, { kit, label: label('nestingMode'), field: 'nestingMode', value: draft.nestingMode, disabled: review.locked, options: options('nestingMode'), onChange: (value) => update('nestingMode', value) })),
          row('helpersPerMember',h(TextField, { label: label('helpersPerMember'), field: 'helpersPerMember', type: 'number', min: 0, value: draft.helpersPerMember, disabled: review.locked, onChange: (value) => update('helpersPerMember', value) })),
          h('div', { className: 'bbff-team-field' }, h('span', null, tr('dshCap')), h('output', { 'data-team-dsh-cap': String(dshCap ?? '') }, capKnown ? String(dshCap) : '—')),
          row('memberCap',h(TextField, { label: label('memberCap'), field: 'memberCap', type: 'number', min: 1, max: capKnown ? dshCap : undefined, placeholder: tr('followsDsh'), value: draft.memberCap, disabled: review.locked, onChange: (value) => update('memberCap', value) })),
          row('superagentYield',h(Select, { kit, label: label('superagentYield'), field: 'superagentYield', value: draft.superagentYield, disabled: review.locked, options: options('superagentYield'), onChange: (value) => update('superagentYield', value) })),
          row('memberNaming',h('div', { className: 'bbff-team-field' }, h(Select, { kit, label: label('memberNaming'), field: 'memberNaming', value: draft.memberNaming, disabled: review.locked, options: options('memberNaming'), onChange: (value) => update('memberNaming', value) }), h('div', { className: 'bbff-team-hint', 'data-team-naming-hint': draft.memberNaming }, tr('namingHint_' + draft.memberNaming)))),
          h(TextField, { label: tr('reason'), field: 'settings-reason', value: draft.reason, disabled: review.locked, onChange: (value) => update('reason', value) })),
        h('p', { className: 'bbff-team-hint' }, tr('capHint') + ' ' + tr('effective') + ': ' + String(candidate.memberCap ?? dshCap ?? '—')),
        !capKnown ? h('div', { className: 'bbff-team-hint' }, tr('unknownCap')) : null,
        invalid ? h('div', { className: 'bbff-team-invalid', role: 'status' }, tr('invalidSettings')) : null,
        review.error ? h(kitOr(kit, 'ErrorText', 'div'), { role: 'alert' }, review.error) : null,
        !review.review ? h(UiAction, { kit, action: 'save-settings', variant: 'primary', disabled: review.busy || !!invalid || !Object.keys(patch).length, onClick: save }, review.busy ? tr('preparing') : tr('previewChange')) : null,
        h(ConfigDiff, { kit, tr, state: review }))
    }

    /** Diagnostic dumps keep their technical JSON; message references inside them show their text. */
    const resolveRefs = (kit, value) => Array.isArray(value) ? value.map(item => resolveRefs(kit, item)) : value && typeof value === 'object' ? (typeof value.$bbff === 'string' && typeof value.key === 'string' ? textOf(kit, value) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveRefs(kit, item)]))) : value
    function Diagnostics({ kit, tr, value, children }) {
      return h('details', { className: 'bbff-team-hint', 'data-team-diagnostics': 'true' }, h('summary', null, tr('diagnosticsInfo')), children, value ? h('pre', null, JSON.stringify(resolveRefs(kit, value), null, 2)) : null)
    }

    function ReadParts({ parts, tr, kit }) {
      if(!Object.values(parts||{}).some(part=>part.status==='pending'||part.pending))return null
      return h(kitOr(kit,'Spinner','span'), { 'aria-label':tr('partsLoading'), 'data-team-loading':true })
    }

    function TeamAdvancedSettings(props) {
      const { kit, tr, payload, onSaved } = props
      const schema = payload.schema || {}
      const core = ['nestingMode', 'helpersPerMember', 'memberCap', 'superagentYield', 'memberNaming', 'doctrineTemplates', 'displayLabels']
      const keys = Object.keys(schema).filter(key => !core.includes(key))
      const baseline = React.useRef(payload.settings)
      const [draft, setDraft] = React.useState(() => ({ ...payload.settings }))
      const review = useConfigReview(kit, onSaved)
      const invalid = keys.some(key => schema[key].type === 'integer' && !(String(draft[key]).trim() && Number.isSafeInteger(Number(draft[key])) && Number(draft[key]) >= schema[key].min && (schema[key].max === undefined || Number(draft[key]) <= schema[key].max)))
      const candidate = Object.fromEntries(keys.map(key => [key, schema[key].type === 'integer' ? Number(draft[key]) : draft[key]]))
      const patch = changedFields(candidate, baseline.current)
      return h('details', { className: 'bbff-team-section', 'data-team-advanced': 'true' }, h('summary', null, tr('advancedSettings')),
        payload.configuredDepth !== undefined ? h('div', { className: 'bbff-team-hint', 'data-team-depth-facts': 'true' }, tr('depthFacts') + ': ' + [payload.configuredDepth, payload.nativeDepth, payload.effectiveDepth].map(value => value === null ? '—' : String(value)).join(' / ')) : null,
        keys.map(key => {
          const spec = schema[key],display=settingDescriptor(payload,key,kit)
          return h(SettingControl, { key,payload,field:key,kit,tr },
            spec.type === 'enum' ? h(Select, { kit, field: key, label: display.displayLabel, value: draft[key], disabled: review.locked, options: display.options.map(option => ({ value:option.value,label:option.displayLabel })), onChange: value => setDraft(current => ({ ...current, [key]: value })) })
              : h(TextField, { field: key, label: display.displayLabel, type: 'number', min: spec.min, max: spec.max, value: draft[key], disabled: review.locked, onChange: value => setDraft(current => ({ ...current, [key]: value })) }))
        }),
        invalid ? h('div', { role: 'status' }, tr('invalidAdvanced')) : null,
        !review.review ? h(UiAction, { kit, action: 'save-advanced', variant: 'primary', disabled: review.busy || invalid || !Object.keys(patch).length, onClick: () => review.prepare({ op: 'patch-settings', settings: patch }, 'Settings UI: advanced Team settings', Object.fromEntries(Object.keys(patch).map(key => [key, baseline.current[key]])), patch, () => checkSettingsBaseline(kit, baseline.current, Object.keys(patch), tr)) }, tr('previewChange')) : null,
        h(ConfigDiff, { kit, tr, state: review }), review.error ? h(kitOr(kit, 'ErrorText', 'div'), null, review.error) : null)
    }

    function DisplayLabelEditor({kit,tr,payload,onSaved}) {
      const descriptors=payload.settingDescriptors?.displayLabels||[],baseline=React.useRef({...payload.settings.displayLabels})
      const [draft,setDraft]=React.useState(()=>({...baseline.current})),review=useConfigReview(kit,onSaved)
      const invalid=Object.values(draft).some(value=>typeof value!=='string'||!value.trim()||value.length>payload.settingDescriptors.labelLimit||/[\r\n\x00-\x1f]/.test(value))
      const dirty=JSON.stringify(draft)!==JSON.stringify(baseline.current)
      return h('details',{className:'bbff-team-section','data-team-label-editor':'true'},h('summary',null,tr('displayLabels')),
        descriptors.map(spec=>{const shipped=textOf(kit,spec.default);return h('div',{key:spec.path,className:'bbff-team-setting-row'},
          h(TextField,{field:'display-label-'+spec.path,label:shipped,value:draft[spec.path]??shipped,disabled:review.locked,maxLength:payload.settingDescriptors.labelLimit,onChange:value=>{setDraft(current=>{const next={...current};if(value===shipped)delete next[spec.path];else next[spec.path]=value;return next});review.clearError()}}),
          h('div',{className:'bbff-team-hint','data-team-label-default':spec.path,title:spec.source.settingPath},tr('labelValue',{label:tr('factoryDefault'),value:shipped})))}),
        invalid?h('div',{role:'status',className:'bbff-team-invalid'},tr('invalidSettings')):null,
        !review.review?h(UiAction,{kit,action:'save-display-labels',disabled:review.busy||invalid||!dirty,onClick:()=>review.prepare({op:'patch-settings',settings:{displayLabels:draft}},'Settings UI: edit Team display labels',{displayLabels:baseline.current},{displayLabels:draft},()=>checkSettingsBaseline(kit,{displayLabels:baseline.current},['displayLabels'],tr))},tr('previewChange')):null,
        h(ConfigDiff,{kit,tr,state:review}),review.error?h(kitOr(kit,'ErrorText','div'),null,review.error):null)
    }

    function DoctrineSettings(props) {
      const { kit, tr, payload, onSaved } = props
      const selectedSession=kit.useSession?.()
      const defaults = payload.doctrineDefaults || {}, keys = Object.keys(defaults).filter(name=>!props.group||payload.settingDescriptors?.doctrineTemplates?.find(row=>row.value===name)?.group===props.group)
      const baseline = React.useRef({ ...(payload.settings?.doctrineTemplates || {}) })
      const [draft, setDraft] = React.useState(() => ({ ...baseline.current }))
      const [key, setKey] = React.useState(() => keys[0] || '')
      const [roleId, setRoleId] = React.useState(() => props.roles?.[0]?.id || '')
      const [preview, setPreview] = React.useState(''), [previewError, setPreviewError] = React.useState(''), [previewBusy, setPreviewBusy] = React.useState(false)
      const review = useConfigReview(kit, onSaved)
      const text = Object.hasOwn(draft, key) ? draft[key] : defaults[key] || ''
      const modified = Object.hasOwn(draft, key)
      const meaning=payload.settingDescriptors?.doctrineTemplates?.find(row=>row.value===key)
      const templatePatch = Object.fromEntries(keys.filter(name => Object.hasOwn(draft, name) && draft[name] !== (Object.hasOwn(baseline.current, name) ? baseline.current[name] : defaults[name])).map(name => [name, draft[name]]))
      const changes = [ ...(Object.keys(templatePatch).length ? [{ op: 'patch-settings', settings: { doctrineTemplates: templatePatch } }] : []), ...keys.filter(name => Object.hasOwn(baseline.current, name) && !Object.hasOwn(draft, name)).map(name => ({ op: 'reset-doctrine-template', key: name })) ]
      const showPreview = async () => {
        if (previewBusy) return
        setPreviewBusy(true); setPreviewError('')
        try { const value = await postChecked(kit, { action: 'doctrine-preview', key, roleId, doctrineTemplates: draft, replaceOverrides: true }); setPreview(value.preview) }
        catch (error) { setPreviewError(errorMessage(error)) }
        finally { setPreviewBusy(false) }
      }
      const restore = () => {
        setDraft(current => { const next = { ...current }; delete next[key]; return next }); setPreview('')
      }
      return h('section', { className: 'bbff-team-section', 'data-team-doctrine': 'true' }, h('h3', null, tr('doctrineSettings')), h('div', { className: 'bbff-team-hint' }, tr('doctrineHint')),
        !keys.length ? h('div', { className: 'bbff-team-hint' }, tr('unavailable')) : h('div', null,
          h(Select, { kit, field: 'doctrine-key', label: tr('doctrineKey'), value: key, disabled: review.locked || previewBusy, options: keys.map(value => ({ value, label: textOf(kit, payload.settingDescriptors?.doctrineTemplates?.find(row=>row.value===value)?.displayLabel) || tr('doctrineKey') })), onChange: value => { setKey(value); setPreview(''); setPreviewError('') } }),
          meaning?h('div',{'data-team-doctrine-meaning':key,className:'bbff-team-tier'},[['audience',meaning.audience],['trigger',meaning.trigger],['effect',meaning.effect]].map(([label,value])=>h('p',{key:label,className:'bbff-team-hint'},h('strong',null,tr('labelColon',{label:tr(label)})),textOf(kit,value)))):null,
          h('details', { className: 'bbff-team-hint','data-team-doctrine-info':'true' }, h('summary',null,tr('doctrineInfo')),h('div',null,tr(modified?'modified':'source_builtin')),h('code',null,'settings.doctrineTemplates.'+key)),
          h(TextField, { field: 'doctrine-text', label: tr('doctrineText'), multiline: true, rows: 10, value: text, disabled: review.locked || previewBusy, onChange: value => { setDraft(current => ({ ...current, [key]: value })); setPreview(''); review.clearError() } }),
          h('details', { className: 'bbff-team-hint bbff-team-default-row' }, h('summary', null, tr('labelValue',{label:tr('factoryDefault'),value:tr('defaultContent')})), h('pre', { 'data-team-doctrine-default': key }, defaults[key])),
          h('details', { className: 'bbff-team-hint','data-team-doctrine-variables':'true' },h('summary',null,tr('doctrineVariables')),h('code',null,(payload.doctrineVariables || []).map(name => '{{' + name + '}}').join(', '))),
          h(Select, { kit, field: 'doctrine-role', label: tr('doctrineRole'), value: roleId, disabled: review.locked || previewBusy, options: (props.roles || []).map(role => ({ value: role.id, label: titleOf(kit, role) })), onChange: value => { setRoleId(value); setPreview('') } }),
          h('div', { className: 'bbff-team-line' },
            h(UiAction, { kit, action: 'preview-doctrine', disabled: previewBusy || review.locked, onClick: showPreview }, tr('previewTemplate')),
            selectedSession?h(UiAction,{kit,action:'current-doctrine',disabled:previewBusy||review.locked,title:tr('currentDoctrineHint'),onClick:async()=>{setPreviewBusy(true);setPreviewError('');try{const value=await getChecked(kit,API+'?action=doctrine-current&sessionId='+encodeURIComponent(selectedSession));setPreview(tr('currentDoctrineHint')+'\n\n'+value.preview)}catch(error){setPreviewError(errorMessage(error))}finally{setPreviewBusy(false)}}},tr('currentDoctrine')):null,
            h(UiAction, { kit, action: 'restore-doctrine', disabled: review.locked || previewBusy || (!modified && text === defaults[key]), onClick: restore }, tr('restoreTemplate')),
            !review.review ? h(UiAction, { kit, action: 'save-doctrine', variant: 'primary', disabled: review.busy || previewBusy || !changes.length, onClick: () => review.prepare(changes, 'Settings UI: edit doctrine templates', baseline.current, draft, async () => {
              const current = await getChecked(kit, API + '?action=team-settings')
              const names = new Set([...Object.keys(templatePatch), ...changes.filter(change => change.op === 'reset-doctrine-template').map(change => change.key)])
              for (const name of names) {
                const original = Object.hasOwn(baseline.current, name) ? baseline.current[name] : defaults[name]
                const latest = Object.hasOwn(current.settings.doctrineTemplates || {}, name) ? current.settings.doctrineTemplates[name] : current.doctrineDefaults?.[name]
                if (latest !== original) throw new Error(tr('staleSettings'))
              }
            }) }, tr('previewChange')) : null),
          preview ? h('div', null, h('strong', null, tr('doctrinePreview')), h('pre', { 'data-team-doctrine-preview': key }, preview)) : null,
          previewError ? h(kitOr(kit, 'ErrorText', 'div'), null, previewError) : null),
        h(ConfigDiff, { kit, tr, state: review }), review.error ? h(kitOr(kit, 'ErrorText', 'div'), null, review.error) : null)
    }

    function WorkspaceRolesPanel(props) {
      const { kit, tr } = props
      const sessionId = kit.useSession?.()
      const [cwd, setCwd] = React.useState(''), [state, setState] = React.useState({ busy: false, value: null, error: '' })
      const load = async current => {
        if (state.busy) return
        setState(previous => ({ ...previous, busy: true, error: '' }))
        try {
          const url = API + '?action=effective-catalog&' + (current ? 'sessionId=' + encodeURIComponent(sessionId) : 'cwd=' + encodeURIComponent(cwd.trim()))
          const value = await getChecked(kit, url)
          setState({ busy: false, value, error: '' })
        } catch (error) { setState(previous => ({ ...previous, busy: false, error: errorMessage(error) })) }
      }
      const value = state.value
      return h('details', { className: 'bbff-team-section', 'data-team-workspace-roles': 'true' }, h('summary', null, tr('workspaceRoles')),
        h('div', { className: 'bbff-team-hint' }, tr('workspaceReadOnly')),
        h(TextField, { field: 'workspace-cwd', label: tr('workspacePath'), value: cwd, disabled: state.busy, onChange: setCwd }),
        h('div', { className: 'bbff-team-line' }, h(UiAction, { kit, action: 'view-workspace-roles', disabled: state.busy || !cwd.trim(), onClick: () => load(false) }, tr('viewWorkspace')),
          h(UiAction, { kit, action: 'view-session-workspace-roles', disabled: state.busy || !sessionId, onClick: () => load(true) }, tr('viewCurrentWorkspace'))),
        state.error ? h(kitOr(kit, 'ErrorText', 'div'), { role: 'status' }, state.error) : null,
        value ? h('div', { 'data-team-workspace-result': value.cwd }, h('code', null, value.cwd), h('div', { className: 'bbff-team-hint' }, (value.catalog.sources || []).join(' · ')),
          value.context?.source === 'cached' ? h('div', null, tr('contextCached') + ' · ' + value.context.asOf) : null,
          !value.complete ? h('div', { role: 'status' }, tr('workspaceIncomplete') + ' ' + (value.catalog.errors || []).join('; ')) : null,
          (value.catalog.roles || []).map(role => h(RoleRow, { key: role.id, kit, role, tr, readOnlyPreview: true, onEdit: () => {}, onAction: () => {} }))) : null)
    }

    function historyTime(value) {
      const date = new Date(value)
      return Number.isFinite(date.getTime()) ? { iso: date.toISOString(), label: date.toLocaleString() } : { iso: undefined, label: '—' }
    }

    function historySummary(entry) {
      return (entry.summary || []).map((item) => {
        const definitions = item.roles?.length ? item.roles : item.formations
        return item.file + (definitions?.length ? ' · ' + definitions.map((row) => row.id + ' (' + row.fields.join(', ') + ')').join(' / ') : item.keys?.length ? ' · ' + item.keys.join(', ') : '')
      }).join(' | ')
    }

    function ChangeHistory(props) {
      const { kit, tr, onChanged } = props
      const [limit, setLimit] = React.useState(() => props.settings?.historyInitialLimit ?? props.entries?.length ?? 0)
      const [confirm, setConfirm] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const entries = (props.entries || []).slice().sort((a, b) => (new Date(b.at).getTime() || 0) - (new Date(a.at).getTime() || 0))
      const revert = async (entry) => {
        if (busy || confirm !== entry.id) return
        setBusy(true); setError('')
        try { await postChecked(kit, { action: 'config-revert', id: entry.id, reason: 'Settings UI: revert ' + entry.id, userInstruction: '' }); setConfirm(null); onChanged() }
        catch (reason) { setError(errorMessage(reason)) }
        finally { setBusy(false) }
      }
      return h('section', { className: 'bbff-team-section bbff-team-history', 'data-team-history': 'true' },
        h('h3', { className: 'bbff-team-section-title' }, tr('history') + ' · ' + entries.length),
        !entries.length ? h('div', { className: 'bbff-team-hint' }, tr('historyEmpty')) : null,
        entries.slice(0, limit).map((entry) => h('div', { key: entry.id, className: 'bbff-team-history-row', 'data-team-history-entry': entry.id },
          h('div', { className: 'bbff-team-line' },
            h('time', { dateTime: historyTime(entry.at).iso }, historyTime(entry.at).label),
            h(kitOr(kit, 'Badge', 'span'), null, (entry.source === 'tool' ? tr('sourceTool') : tr('sourceUi')) + ' · ' + entry.source),
            h(UiAction, { kit, action: 'revert', disabled: busy, onClick: () => { setConfirm(entry.id); setError('') } }, tr('revert'))),
          h('div', { className: 'bbff-team-history-summary' }, entry.reason || '—'),
          h('div', { className: 'bbff-team-history-summary' }, historySummary(entry)),
          confirm === entry.id ? h('div', { className: 'bbff-team-revert-confirm', 'data-team-revert-confirm': entry.id },
            h('div', { className: 'bbff-team-hint' }, tr('revertWarning')),
            h('div', { className: 'bbff-team-line' },
              h(UiAction, { kit, action: 'confirm-revert', disabled: busy, onClick: () => revert(entry) }, busy ? tr('saving') : tr('confirmRevert')),
              h(UiAction, { kit, action: 'cancel-revert', disabled: busy, onClick: () => setConfirm(null) }, tr('cancel')))) : null)),
        entries.length > limit ? h(UiAction, { kit, action: 'history-more', onClick: () => setLimit((value) => value + (props.settings?.historyPageSize ?? entries.length)) }, tr('showMore')) : null,
        error ? h(kitOr(kit, 'ErrorText', 'div'), null, error) : null)
    }

    function RoleRow(props) {
      const { kit, role, tr, editing, onEdit, onAction } = props
      const Badge = kitOr(kit, 'Badge', 'span')
      const Button = kitOr(kit, 'Button', 'button')
      const palette = tokensOf(kit)
      const [expanded, setExpanded] = React.useState(false)
      const review = useConfigReview(kit, result => onAction('saved', result))
      const reset = op => review.prepare({ op, id: role.id }, 'Settings UI: ' + op + ' ' + role.id, editableRole(role), op === 'reset-role' ? role.defaults : { ...editableRole(role), models: role.defaults?.models || [] })
      const delegation = role.delegation || { mode: 'none' }
      const delegationText = tr('delegation_' + delegation.mode) + (delegation.mode === 'oneshot' && Array.isArray(delegation.roles) && delegation.roles.length ? ': ' + delegation.roles.join(', ') : '')
      const detailsId = 'bbff-team-role-details-' + encodeURIComponent(role.id)
      const tiers = roleModels(role)
      const routeText = tiers.length ? routeLabel(tiers[0], tr) + (tiers.length > 1 ? ' +' + (tiers.length - 1) : '') : tr('inherit')
      const toggleDetails = () => setExpanded((current) => !current)
      return h('div', { 'data-team-role': role.id, className: 'bbff-team-role', style: { borderTop: '1px solid ' + palette.border } },
        h('div', { className: 'bbff-team-role-head', 'data-team-role-head': role.id },
          h('button', {
            type: 'button', className: 'bbff-team-role-toggle',
            'data-team-details-toggle': role.id,
            'aria-expanded': String(expanded), 'aria-controls': detailsId,
            'aria-label': titleOf(kit, role) + ' · ' + (expanded ? tr('hideDetails') : tr('showDetails')),
            title: expanded ? tr('hideDetails') : tr('showDetails'),
            onClick: toggleDetails,
            onKeyDown: (event) => {
              if (event.repeat || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar')) return
              event.preventDefault()
              toggleDetails()
            },
          }, h('span', { 'aria-hidden': 'true', className: 'bbff-team-chevron' }, expanded ? '▾' : '▸'), titleOf(kit, role)),

          h('div', { className: 'bbff-team-role-badges' },
            h(Badge, rolePolicyProps(role, 'kind', tr), tr('kind_' + role.kind)),
            h('span', { 'data-team-reuse': role.reuse || 'fresh', title: tr('reuse') + ': ' + tr('reuseHint_' + (role.reuse || 'fresh').replace('-', '_')) }, h(Badge, rolePolicyProps(role, 'reuse', tr), tr('reuseBadge_' + (role.reuse || 'fresh').replace('-', '_')))),
            role.readOnly ? h(Badge, rolePolicyProps(role, 'readOnly', tr), tr('readOnly')) : null,
            tiers.length === 1 ? h(Badge, { tone: 'default', ...rolePolicyProps(role, 'models', tr), title: tr('singleTierHint') + ' · ' + rolePolicyProps(role, 'models', tr).title }, tr('singleTier')) : null,
            role.concurrency ? h(Badge, rolePolicyProps(role, 'concurrency', tr), tr('concurrency') + ' ' + role.concurrency) : null,
            h(Badge, { tone: 'info', title: tr('source_' + role.source) + ' · ' + tr('policyEdit') + ': roles.' + role.id, explain: { source: tr('explain.catalogProvenance'), settingPath: 'roles.' + role.id, default: role.defaults ? tr('source_builtin') : tr('customNoDefault') } }, tr('source_' + role.source))),
          h('span', { className: 'bbff-team-role-route', title: tr('labelValue', { label: tr('route'), value: routeText }), 'data-team-route': role.id }, routeText),
          !editing && !props.readOnlyPreview ? h('div', { className: 'bbff-team-role-actions', 'data-team-role-actions': role.id },
            h(Button, { variant: 'ghost', disabled: !!props.busy || review.locked, onClick: () => onEdit(role.id) }, tr('edit')),
            role.source === 'global' ? h(Button, { variant: 'ghost', disabled: !!props.busy || review.locked, onClick: () => reset('reset-role-models') }, tr('resetModels')) : null,
            role.defaults && role.source === 'global' ? h(Button, { variant: 'ghost', disabled: !!props.busy || review.locked, onClick: () => reset('reset-role') }, tr('resetRole')) : null,
            h(Button, { variant: 'ghost', disabled: !!props.busy || review.locked, onClick: () => review.prepare({ op: 'remove-role', id: role.id }, 'Settings UI: hide role ' + role.id, editableRole(role), null) }, tr('hide'))) : null),
        h('div', { id: detailsId, className: 'bbff-team-role-details', hidden: !expanded, 'data-team-role-details': role.id },
          h('code',{className:'bbff-team-role-id',title:tr('roleId')},role.id),
          h('section',{'data-team-leader-brief':role.id,className:'bbff-team-tier'},h('strong',null,tr('leaderBrief')),h('dl',null,Object.entries(role.leaderBrief||{}).map(([key,value])=>h('div',{key,'data-team-brief-section':key},h('dt',null,tr('leaderBrief_'+key)),h('dd',{style:{margin:'2px 0 10px',color:palette.secondary}},value||'—'))))),
          h('details',{'data-team-identity-prompt':role.id,className:'bbff-team-tier'},h('summary',null,tr('identityPrompt')),h('pre',{style:{whiteSpace:'pre-wrap'}},role.identityPrompt||'')),
          h('div', { style: { color: palette.secondary } }, tr('labelColon', { label: tr('models') })),
          tiers.length ? tiers.map((tier, index) => h('div', { key: index, style: { color: palette.secondary } }, String(index + 1) + (tier.label ? ' (' + tier.label + ')' : '') + ' · ' + routeLabel(tier, tr) + ' · ' + tier.use)) : h('div', { style: { color: palette.secondary } }, tr('inherit')),
          h('div', { style: { color: palette.secondary } }, tr('labelValue', { label: tr('delegation'), value: delegationText })),
          filterFields.map(field => h('div', { key: field, 'data-team-effective-filter': field }, h('span', null, tr('filter_' + field) + ': ' + (Object.keys(role[field] || {}).length ? JSON.stringify(role[field]) : tr('filtersInherited'))), h(RoleDefault, { kit, role, field, tr })))),
        editing ? h(RoleEditor, { kit, role, tr, providers: props.providers, roleSchema: props.roleSchema, permissionCatalog: props.permissionCatalog, toolEffects: props.toolEffects, unknownToolEffectPolicy: props.unknownToolEffectPolicy, reportDependencies: props.reportDependencies, onSaved: (result) => onAction('saved', result), onCancel: () => onEdit(null) }) : null,
        h(ConfigDiff, { kit, tr, state: review }),
        review.error ? h(kitOr(kit, 'ErrorText', 'div'), { role: 'alert' }, review.error) : null)
    }

    function TeamRoleList({kit,tr,state,editing,creating,actionBusy,setEditing,setCreating,onAction,listReview,reload}) {
      const catalog=state.catalog
      return h('section',{'data-team-role-editor-item':'true'},
        h('div',{className:'bbff-team-line'},h('strong',null,tr('roles')+' · '+catalog.roles.length),h(UiAction,{kit,action:'new-role',disabled:creating||!!editing||actionBusy,onClick:()=>setCreating(true)},tr('newRole'))),
        creating?h(RoleEditor,{kit,creating:true,role:{...catalog.roleSchema.newRoleDefaults,id:''},providers:state.providers,roleSchema:catalog.roleSchema,permissionCatalog:catalog.permissionCatalog,toolEffects:catalog.toolEffects,unknownToolEffectPolicy:catalog.unknownToolEffectPolicy,reportDependencies:catalog.reportDependencies,tr,knownIds:[...catalog.roles.map(role=>role.id),...(catalog.removed||[])],onSaved:result=>onAction('saved',result),onCancel:()=>setCreating(false)}):null,
        h('div',{'data-team-role-list':'true'},catalog.roles.map(role=>h(RoleRow,{key:role.id,kit,role,tr,providers:state.providers,roleSchema:catalog.roleSchema,permissionCatalog:catalog.permissionCatalog,toolEffects:catalog.toolEffects,unknownToolEffectPolicy:catalog.unknownToolEffectPolicy,reportDependencies:catalog.reportDependencies,editing:editing===role.id,onEdit:id=>{if(!creating&&!actionBusy)setEditing(id)},busy:creating||actionBusy,onAction}))),
        catalog.removed?.length?h('div',{className:'bbff-team-line'},h('span',null,tr('removedRoles')),catalog.removed.map(id=>h(UiAction,{kit,key:id,action:'restore-role',disabled:listReview.locked,onClick:()=>listReview.prepare({op:'restore-role',id},'Settings UI: restore role '+id,{id,removed:true},{id,removed:false})},tr('restore')+' '+id))):null,
        h(ConfigDiff,{kit,tr,state:listReview}),listReview.error?h(kitOr(kit,'ErrorText','div'),null,listReview.error):null)
    }

    function TeamSettingsV2(props) {
      const {kit,state,tr,reload}=props,catalog=state.catalog,payload=state.options,base=payload.settingDescriptors
      const roleValues=roles=>roles.map(role=>({id:role.id,...editableRole(role,catalog.roleSchema.newRoleDefaults)}))
      const descriptors={...base,settings:base.settings.filter(field=>field.path!=='doctrineTemplates').map(field=>field.path==='roles'?{...field,default:roleValues(Object.values(catalog.defaults||{}))}:field.path==='formations'?{...field,default:[]}:field)}
      const values={...payload.settings,roles:roleValues(catalog.roles),formations:state.config.formations?.formations||[],workspaceRoles:null,permissionLayers:null,history:null}
      for(const [path,group]of [['doctrineRules','rules'],['doctrineFragments','fragments'],['doctrinePositions','positions']])values[path]=Object.fromEntries(Object.entries(payload.settings.doctrineTemplates||{}).filter(([key])=>base.doctrineTemplates.find(row=>row.value===key)?.group===group))
      const saved=result=>reload(result?.changed===false?tr('noChanges'):tr('saved'))
      const renderField=(field,context)=>{
        const help=typeof kit.SettingHelp==='function'?h(kit.SettingHelp,{field,labels:base.presentation.labels,moduleId:'team'}):null
        let editor
        if(field.path==='roles')editor=h(TeamRoleList,{...props})
        else if(field.path==='workspaceRoles')editor=h(WorkspaceRolesPanel,{kit,tr})
        else if(field.path==='permissionLayers')editor=h('div',null,(catalog.permissionLayers||[]).map(layer=>h('div',{key:layer.moduleId},textIn(kit,layer.moduleTitle,layer.packageName)+' · '+(textIn(kit,layer.title,layer.packageName)||textOf(kit,layer.titleLocales)),layer.settingsSectionId&&typeof kit.openSettingsSection==='function'?h(UiAction,{kit,action:'open-permission-layer',onClick:()=>kit.openSettingsSection(layer.moduleId,layer.settingsSectionId)},tr('edit')):null)))
        else if(['doctrineRules','doctrineFragments','doctrinePositions'].includes(field.path))editor=h(DoctrineSettings,{kit,tr,payload,roles:catalog.roles,group:{doctrineRules:'rules',doctrineFragments:'fragments',doctrinePositions:'positions'}[field.path],onSaved:saved})
        else if(field.path==='formations')editor=h(FormationsPanel,{kit,tr,settings:payload.settings,onChanged:saved})
        else if(field.path==='displayLabels')editor=h(DisplayLabelEditor,{kit,tr,payload,onSaved:saved})
        else if(field.path==='history')editor=h(ChangeHistory,{kit,tr,settings:payload.settings,entries:state.config.history||[],onChanged:()=>reload(tr('reverted'))})
        else if(payload.schema[field.path])return h(TeamSettingField,{key:field.path+'-'+JSON.stringify(payload.settings[field.path]),kit,payload,field,tr,basic:context.basic,onSaved:saved})
        else editor=h('pre',null,JSON.stringify(values[field.path]??field.default,null,2))
        return h('section',{'data-team-v2-item':field.path,style:{gridColumn:'1 / -1',minWidth:0}},h('div',{className:'bbff-team-line'},h('strong',null,textOf(kit,field.displayLabel)),help),editor)
      }
      return h('div',{'data-team-settings':'true','data-team-settings-v2':'true',className:'bbff-team-settings-surface',style:{fontSize:12,minWidth:0}},h('style',null,ROLE_LIST_CSS+SETTINGS_CSS),state.notice?h('div',{role:'status',className:'bbff-team-hint'},state.notice):null,h('p',{'data-team-preset-requirement':'true',className:'bbff-team-hint'},tr('presetRequirement')),h(ReadParts,{parts:catalog.parts,tr,kit}),h(kit.SettingsLayout,{descriptors,values,renderField}),h(Diagnostics,{kit,tr,value:{parts:catalog.parts,migrations:catalog.migrations,retired:catalog.retired,capabilityBlacklist:catalog.capabilityBlacklist,skillDefaultScope:catalog.skillDefaultScope,settings:payload.diagnostics,error:state.error||null}}))
    }

    function TeamSettings(props) {
      const kit = props.kit
      const [state, setState] = React.useState({ status: 'loading', catalog: null, config: null, options: null, providers: [], modelsError: false, error: '', notice: '', reload: 0 })
      const tr = makeTranslator(props, state.options?.settingDescriptors?.labels)
      const [editing, setEditing] = React.useState(null)
      const [creating, setCreating] = React.useState(false)
      const [actionBusy, setActionBusy] = React.useState(false)

      React.useEffect(() => {
        let cancelled = false
        const getJson = kitOr(kit, 'getJson', () => Promise.reject(new Error(msgOf(kit, 'error.kitGetJsonUnavailable'))))
        Promise.all([
          getJson(API + '?action=catalog'),
          getJson(API + '?action=models').catch(() => ({ providers: [], unavailable: true })),
          getJson(API + '?action=config-read'),
          getJson(API + '?action=team-settings'),
        ]).then(([catalog, models, config, options]) => {
            if (cancelled) return
            const bad = [catalog, config, options].find((value) => !value || value.ok === false)
            if (bad || !catalog || !config || !options) { setState((previous) => ({ ...previous, status: previous.catalog ? 'ready' : 'unavailable', error: errorMessage(bad) || tr('unavailable') })); return }
            const combined = { ...catalog, roles: config.catalog?.roles || catalog.roles, removed: config.catalog?.removed || catalog.removed }
            setState((previous) => ({ ...previous, status: 'ready', catalog: combined, config, options, providers: (models && models.providers) || [], modelsError: !!(models && (models.unavailable || models.ok === false)), error: '' }))
          })
          .catch((reason) => { if (!cancelled) setState((previous) => ({ ...previous, status: previous.catalog ? 'ready' : 'unavailable', error: errorMessage(reason) })) })
        return () => { cancelled = true }
      }, [state.reload])

      const pendingParts = Object.values(state.catalog?.parts || {}).some(part => part.status === 'pending' || part.pending)
      React.useEffect(() => {
        const interval=state.options?.settings?.pendingRefreshMs
        if(!pendingParts || !Number.isSafeInteger(interval) || interval<1 || typeof window.setInterval!=='function')return undefined
        const timer=window.setInterval(()=>setState(previous=>({...previous,reload:previous.reload+1})),interval)
        return()=>window.clearInterval(timer)
      },[pendingParts,state.options?.settings?.pendingRefreshMs])
      const reload = (notice) => setState((previous) => ({ ...previous, reload: previous.reload + 1, notice: notice || '' }))
      const onAction = async (action, id) => {
        if (action === 'saved') { setEditing(null); setCreating(false); reload(id && id.changed === false ? tr('noChanges') : tr('saved')) }
      }

      const listReview = useConfigReview(kit, payload => reload(payload.changed === false ? tr('noChanges') : tr('saved')))
      const Badge = kitOr(kit, 'Badge', 'span')
      const Hint = kitOr(kit, 'Hint', 'div')
      const Spinner = kitOr(kit, 'Spinner', 'span')
      const Empty = kitOr(kit, 'Empty', 'div')
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const Button = kitOr(kit, 'Button', 'button')

      if (state.status === 'loading') return h(Spinner, { 'aria-label': tr('loading') })
      if (state.status === 'unavailable') {
        return h('div', null, h(Spinner, { 'aria-label': tr('loading') }), h(Button, { variant: 'ghost', onClick: () => reload() }, tr('retry')), h(Diagnostics, { kit, tr, value: { error: state.error } }))
      }
      const catalog = state.catalog
      if(typeof kit.SettingsLayout==='function' && state.options?.settingDescriptors?.presentation?.version===2)return h(TeamSettingsV2,{kit,state,tr,reload,editing,creating,actionBusy,setEditing,setCreating,onAction,listReview})
      return h('div', { 'data-team-settings': 'true', className: 'bbff-team-settings-surface', style: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, minWidth: 0 } },
        h('style', null, ROLE_LIST_CSS + SETTINGS_CSS),
        state.notice ? h('div', { className: 'bbff-team-hint', role: 'status', 'aria-live': 'polite', 'data-team-notice': 'true' }, state.notice) : null,


        h(ReadParts, { parts: catalog.parts, tr, kit }),
        h('div', { className: 'bbff-team-line', style: { marginTop: 8 } },
          h('strong', null, tr('roles') + ' · ' + catalog.roles.length),
          h(UiAction, { kit, action: 'new-role', disabled: creating || !!editing || actionBusy || !catalog.roleSchema?.newRoleDefaults, onClick: () => { setCreating(true); setState((current) => ({ ...current, notice: '', error: '' })) } }, tr('newRole')),
          h(UiAction, { kit, action: 'refresh', disabled: actionBusy, onClick: () => reload() }, tr('refresh'))),
        creating && catalog.roleSchema?.newRoleDefaults ? h(RoleEditor, {
          kit, creating: true, role: { ...catalog.roleSchema.newRoleDefaults, id: '' }, providers: state.providers, roleSchema: catalog.roleSchema, permissionCatalog: catalog.permissionCatalog, toolEffects: catalog.toolEffects, unknownToolEffectPolicy: catalog.unknownToolEffectPolicy, reportDependencies: catalog.reportDependencies, tr,
          knownIds: [...catalog.roles.map((role) => role.id), ...(catalog.removed || [])],
          onSaved: (payload) => onAction('saved', payload), onCancel: () => setCreating(false),
        }) : null,
        h('div', { 'data-team-role-list': 'true' }, catalog.roles.map((role) => h(RoleRow, {
          key: role.id, kit, role, tr,
          providers: state.providers, roleSchema: catalog.roleSchema, permissionCatalog: catalog.permissionCatalog, toolEffects: catalog.toolEffects, unknownToolEffectPolicy: catalog.unknownToolEffectPolicy, reportDependencies: catalog.reportDependencies,
          editing: editing === role.id,
          onEdit: (id) => { if (!creating && !actionBusy) { setEditing(id); setState((current) => ({ ...current, notice: '', error: '' })) } },
          busy: creating || actionBusy,
          onAction,
        }))),
        catalog.removed && catalog.removed.length
          ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
            h('span', null, tr('labelColon', { label: tr('removedRoles') })),
            catalog.removed.map((id) => h(Button, { key: id, variant: 'ghost', disabled: listReview.locked, onClick: () => listReview.prepare({ op: 'restore-role', id }, 'Settings UI: restore role ' + id, { id, removed: true }, { id, removed: false }) }, tr('restore') + ' ' + id)))
          : null,
        h(ConfigDiff, { kit, tr, state: listReview }),
        listReview.error ? h(ErrorText, { role: 'alert' }, listReview.error) : null,
        catalog.permissionLayers?.length ? h('details', { className: 'bbff-team-section', 'data-team-permission-layers': 'true' }, h('summary', null, tr('permissionLayers')),
          catalog.permissionLayers.map(layer => h('div', { key: layer.moduleId, className: 'bbff-team-line' }, h('span', null, textIn(kit, layer.moduleTitle, layer.packageName) + ' · ' + (textIn(kit, layer.title, layer.packageName) || textOf(kit, layer.titleLocales))),
            layer.settingsSectionId && typeof kit.openSettingsSection === 'function' ? h(Button, { variant: 'ghost', onClick: () => kit.openSettingsSection(layer.moduleId, layer.settingsSectionId) }, tr('edit')) : null))) : null,
        h(WorkspaceRolesPanel, { kit, tr }),
        h(TeamOptionsForm, { key: 'core-' + JSON.stringify(['nestingMode','helpersPerMember','memberCap','superagentYield','memberNaming'].map(key => state.options.settings[key])), kit, payload: state.options, tr, onSaved: (payload) => reload(payload.changed === false ? tr('noChanges') : tr('saved')) }),
        h(TeamAdvancedSettings, { key: 'advanced-' + JSON.stringify(Object.fromEntries(Object.entries(state.options.settings).filter(([key]) => !['nestingMode','helpersPerMember','memberCap','superagentYield','memberNaming','doctrineTemplates'].includes(key)))), kit, payload: state.options, tr, onSaved: payload => reload(payload.changed === false ? tr('noChanges') : tr('saved')) }),
        h(DisplayLabelEditor,{key:'labels-'+JSON.stringify(state.options.settings.displayLabels),kit,tr,payload:state.options,onSaved:payload=>reload(payload.changed===false?tr('noChanges'):tr('saved'))}),
        h(DoctrineSettings, { key: 'doctrine-' + JSON.stringify([state.options.settings.doctrineTemplates, state.options.doctrineDefaults]), kit, payload: state.options, roles: catalog.roles, tr, onSaved: payload => reload(payload.changed === false ? tr('noChanges') : tr('saved')) }),
        h(FormationsPanel, { kit, tr, settings: state.options.settings, onChanged: (payload) => reload(payload.changed === false ? tr('noChanges') : tr('saved')) }),
        h(ChangeHistory, { key: 'history-' + JSON.stringify([state.options.settings.historyInitialLimit, state.options.settings.historyPageSize]), kit, tr, settings: state.options.settings, entries: state.config.history || [], onChanged: () => reload(tr('reverted')) }),

        h('details',{className:'bbff-team-hint','data-team-setting-help':'true'},h('summary',null,tr('settingDetails')),h(Hint,null,tr('hint'))),
        h(Diagnostics, { kit, tr, value: { parts: catalog.parts, catalogErrors: catalog.errors, modelDirectoryUnavailable: state.modelsError, error: state.error || null, settings: state.options.diagnostics, retention: state.options.retention, history: state.config.historyWarnings, globalFile: catalog.globalFile, deployment:{team:catalog.team,superagent:catalog.superagent}, orchestration: catalog.orchestration, toolEffects: catalog.toolEffects } }))
    }

    function TeamCard(props) {
      const kit = props.kit
      const tr = makeTranslator(props)
      const sessionId = props.sessionId || (kit && typeof kit.useSession === 'function' ? kit.useSession() : null)
      const [state, setState] = React.useState({ status: sessionId ? 'loading' : 'idle', data: null, error: '', busy: false, tick: 0 })
      React.useEffect(() => {
        const pending = Object.values(state.data?.parts || {}).some(part => part.status === 'pending' || part.pending)
        const interval = pending ? state.data?.poll?.pendingMs : state.data?.poll?.intervalMs
        if (!sessionId || !Number.isSafeInteger(interval) || interval < 1 || typeof window.setInterval !== 'function') return undefined
        const timer = window.setInterval(() => setState(previous => ({ ...previous, tick: previous.tick + 1 })), interval)
        return () => window.clearInterval(timer)
      }, [sessionId, state.data?.poll?.intervalMs, state.data?.poll?.pendingMs, JSON.stringify(state.data?.parts || {})])
      React.useEffect(() => {
        if (!sessionId) { setState((previous) => ({ ...previous, status: 'idle' })); return undefined }
        let cancelled = false
        setState(previous => previous.data && previous.data.sessionId !== sessionId ? { ...previous, status: 'loading', data: null } : previous)
        const getJson = kitOr(kit, 'getJson', () => Promise.reject(new Error(msgOf(kit, 'error.kitGetJsonUnavailable'))))
        getJson(API + '?action=overview&sessionId=' + encodeURIComponent(sessionId))
          .then((payload) => {
            if (cancelled) return
            if (!payload || payload.ok === false || payload.sessionId !== sessionId) { setState((previous) => ({ ...previous, status: 'unavailable', error: payload?.sessionId && payload.sessionId !== sessionId ? tr('error.sessionMismatch') : errorMessage(payload) })); return }
            setState((previous) => ({ ...previous, status: 'ready', data: payload, error: '' }))
          })
          .catch((reason) => { if (!cancelled) setState((previous) => ({ ...previous, status: 'unavailable', error: errorMessage(reason) })) })
        return () => { cancelled = true }
      }, [sessionId, state.tick])

      const Badge = kitOr(kit, 'Badge', 'span')
      const Button = kitOr(kit, 'Button', 'button')
      const Hint = kitOr(kit, 'Hint', 'div')
      const Empty = kitOr(kit, 'Empty', 'div')
      const Spinner = kitOr(kit, 'Spinner', 'span')
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      if (state.status === 'idle') return h(Empty, null, tr('noSession'))
      if (state.status === 'loading') return h(Spinner, { 'aria-label': tr('loading') })
      if (state.status === 'unavailable') return h('div', null, h(Spinner, { 'aria-label': tr('loading') }), h(Button, { variant: 'ghost', onClick: () => setState(previous => ({ ...previous, tick: previous.tick + 1 })) }, tr('retry')), h(Diagnostics, { kit, tr, value: { error: state.error } }))
      const data = state.data
      if (!data || data.sessionId !== sessionId) return h(Spinner, { 'aria-label': tr('loading') })
      const setMode = (mode) => {
        if (state.busy || !data.rootResolution?.resolution?.resolved || data.modeState?.failedLoad || data.rootResolution?.part?.pending || mode === data.mode) return
        setState((previous) => ({ ...previous, busy: true }))
        const postJson = kitOr(kit, 'postJson', () => Promise.reject(new Error(msgOf(kit, 'error.kitPostJsonUnavailable'))))
        postJson(API, { action: 'set-session-mode', sessionId, mode })
          .then((payload) => setState((previous) => ({ ...previous, busy: false, error: payload && payload.ok === false ? errorMessage(payload) : '', tick: previous.tick + 1 })))
          .catch((reason) => setState((previous) => ({ ...previous, busy: false, error: errorMessage(reason) })))
      }
      const roles = Object.keys(data.byRole || {}).sort()
      return h('div', { 'data-team-card': 'true', style: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 } },
        h(ReadParts, { parts: data.parts, tr, kit }),
        h('div', { style: { fontSize: 11, opacity: 0.75 } }, tr('cardMode')),
        h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } }, (data.modes || []).map((mode) => h(Button, {
          key: mode,
          variant: mode === data.mode ? 'primary' : 'ghost',
          disabled: state.busy || !data.rootResolution?.resolution?.resolved || data.modeState?.failedLoad || data.rootResolution?.part?.pending,
          title: tr('mode_' + mode),
          onClick: () => setMode(mode),
        }, tr('mode_' + mode)))),
        h('div', { 'data-team-effective': data.effective || '' },
          tr('labelColon', { label: tr('effective') }),
          h(Badge, { tone: data.effective && data.effective !== 'off' ? 'info' : 'default', explain: { source: tr('explain.doctrineState'), settingPath: 'session.mode', default: 'auto' } }, data.effective ? (data.effective === 'off' ? tr('effective_off') : tr('mode_' + data.effective)) : '—')),

        roles.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: { fontSize: 11, opacity: 0.75 }, title: tr('cumulativeHint') }, tr('cumulativeCounts')),
            roles.map((role) => h('div', { key: role, 'data-team-role-count': role, style: { display: 'flex', gap: 6, alignItems: 'center' } },
              h(Badge, {title:role}, data.roleTitles?.[role]?titleOf(kit,{title:data.roleTitles[role]}):tr('roles')),
              h('span', { style: { opacity: 0.8 } }, tr('members') + ' ' + data.byRole[role].member + ' · ' + tr('oneshots') + ' ' + data.byRole[role].oneshot))))
          : data.byRole === null ? h(Spinner, { 'aria-label': tr('loading') }) : null,
        data.memberReports?.length ? h('div', { 'data-team-member-reports': 'true', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, data.memberReports.map(report=>{
          const roleLabel=report.roleTitle?titleOf(kit,{title:report.roleTitle}):report.isLead?tr('reportRoleLead'):tr('reportRoleUnbound')
          return h('div',{key:report.sessionId,'data-team-member-report':report.sessionId,'data-team-member-bound':report.bound?'true':'false','data-team-report-block':'true',style:{display:'flex',flexDirection:'column',border:'1px solid var(--dsw-alias-border-l1)',borderRadius:8,overflow:'hidden',minWidth:0,background:'var(--dsw-alias-bg-layer-1)'}},
            h('div',{'data-team-report-head':'true',style:{display:'flex',alignItems:'baseline',gap:6,flexWrap:'wrap',fontSize:12,minWidth:0,padding:'6px 10px',background:'var(--dsw-alias-bg-layer-2)',borderBottom:'1px solid var(--dsw-alias-border-l1)'}},
              h('strong',{title:report.sessionId},report.name),
              h('span',{style:{opacity:0.75,fontSize:10},'data-team-report-role':report.role||(report.isLead?'lead':'unbound')},'['+roleLabel+']'),
              report.reportStale?h('span',{'aria-label':tr('contextCached'),'data-team-report-stale':true,style:{fontSize:10}},'◷'):null,
              report.reportAt?h('span',{'data-team-report-time-source':report.reportTimeSource||'event',style:{opacity:0.65,fontSize:10}},(report.reportTimeSource==='capture-time'?' '+tr('reportTimeCaptured')+' ':' ')+new Date(report.reportAt).toLocaleTimeString()):report.lastReport?h('span',{'data-team-report-time-unknown':'true',style:{opacity:0.65,fontSize:10}},' '+tr('reportTimeUnknown')):null),
            h('div',{'data-team-report-body':'true','data-team-report-markdown':report.lastReport?'true':'false',style:{display:'-webkit-box',WebkitBoxOrient:'vertical',WebkitLineClamp:REPORT_RENDER.maxLines,overflow:'hidden',padding:'7px 10px',background:'var(--dsw-alias-bg-layer-1)',fontSize:11.5,lineHeight:1.5,color:'var(--dsw-alias-label-secondary)',overflowWrap:'anywhere',wordBreak:'break-word',minWidth:0}},
              report.lastReport?markdownBlocks(report.lastReport,h):tr('noReport')))
        })) : null,
        data.modelOverrides?.length ? h('details', { 'data-team-model-overrides': 'true' }, h('summary', null, tr('modelOverrides')),
          h(Hint, null, tr('overrideHint')),
          data.modelOverrides.map(override => h('div', { key: override.sessionId, 'data-team-model-override': override.sessionId },
            h('strong', {title:override.role}, override.name + ' · ' + (data.roleTitles?.[override.role]?titleOf(kit,{title:data.roleTitles[override.role]}):tr('roles'))), h('code', null, ' ' + [override.route.provider, override.route.model, override.route.effort].filter(Boolean).join(' / ')),
            h(Button, { disabled: true }, tr('clearOverride'))))) : null,
        h(Diagnostics, { kit, tr, value: { parts: data.parts, root: data.rootResolution, doctrine: data.doctrine, effectiveReason: data.effectiveReason, bindingState: data.bindingState, modeState: data.modeState, poll: data.poll, overrides: data.modelOverrides, reportRender: REPORT_RENDER, error: state.error || null } }))
    }

    function withKit(component, kit) {
      return function RegisteredComponent(props) {
        const merged = { ...(props || {}) }
        if (!merged.kit) merged.kit = kit
        return h(component, merged)
      }
    }

    return {
      inject: [],
      apply(ctx) {
        if (!ctx || typeof ctx.inject !== 'function') return
        ctx.inject(['bbffUi'], (scope) => {
          const ui = typeof scope.get === 'function' ? scope.get('bbffUi') : scope.bbffUi
          // SDK 0.1.16 surface: ui.msg builds the card/section title refs; the root binds props.t to this package.
          if (!ui || ui.contract !== 1 || !ui.kit || typeof ui.msg !== 'function') return
          const registerCard = () => ui.registerCard({
            id: 'team',
            moduleId: 'team',
            title: ui.msg('card.title'),
            order: 12,
            defaultHeight: 200,
            legacyIds: ['crew/crew', 'module/crew', 'module/team'],
            component: withKit(TeamCard, ui.kit),
          })
          try {
            if (typeof scope.effect === 'function') scope.effect(registerCard, 'oh-my-bbff-team: card team')
            else registerCard()
          } catch {}
          const register = () => ui.registerSettingsSection({
            moduleId: 'team',
            id: 'team',
            title: ui.msg('settings.title'),
            order: 20,
            component: withKit(TeamSettings, ui.kit),
          })
          try {
            if (typeof scope.effect === 'function') scope.effect(register, 'oh-my-bbff-team: settings team')
            else register()
          } catch {}
        })
      },
    }
  },
})
