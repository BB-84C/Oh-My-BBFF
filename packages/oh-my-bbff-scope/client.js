// oh-my-bbff-scope — client half.
//
// Registers the Scope settings section with the Oh-My-BBFF family root
// through the contract service `bbffUi` (see oh-my-bbff-sdk/CONTRACT.md). All
// data comes from the scope host route `/oh-my-bbff-scope/api`; this half owns
// no tools and no cards. Root absent → the injection waits; nothing throws and
// the scope host keeps working standalone.
window.__ModuleLoader__.load({
  id: 'oh-my-bbff-scope',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/oh-my-bbff-scope/api'
    const KINDS = ['mcp', 'tool', 'skill']
    const CUSTOM = '__custom__'

    // Host text is a locale message reference (`{ $bbff, key, params?, ns? }`) or a
    // legacy `{ en, … }` map; the family root resolves it against the active DSH
    // locale. A browser bundle has no module imports, so this marker mirrors the
    // SDK's MESSAGE_REF_MARKER constant.
    const MESSAGE_REF = 'bbff-message'
    const msg = (key, params) => ({ $bbff: MESSAGE_REF, key, ...(params ? { params } : {}) })
    const isMessageRef = (value) => !!value && typeof value === 'object' && value.$bbff === MESSAGE_REF && typeof value.key === 'string'
    const kitOr = (kit, name, fallback) => (kit && typeof kit[name] === 'function' ? kit[name] : fallback)
    // Resolve host-produced text at render time; plain strings pass through.
    const makeResolve = (kit) => (value) => {
      if (value === undefined || value === null) return ''
      if (typeof value === 'string') return value
      if (kit && typeof kit.resolveText === 'function') { try { return String(kit.resolveText(value) ?? '') } catch {} }
      if (isMessageRef(value)) return value.key
      return typeof value === 'object' ? String(value.en || value.zh || '') : String(value)
    }

    function errorMessage(value) {
      if (value === undefined || value === null) return ''
      if (typeof value === 'string') return value
      const code = typeof value.error === 'string' ? value.error : value.error ? String(value.error.message || value.error.code || '') : ''
      const message = typeof value.message === 'string' ? value.message : value.message ? String(value.message.message || '') : ''
      if (code && message && code !== message) return code + ': ' + message
      return message || code || ''
    }

    function textOf(value, resolve) {
      if (value === undefined || value === null) return ''
      if (typeof value === 'string') return value
      if (typeof value === 'object' && (value.label || value.name)) return String(value.label || value.name)
      return resolve(value)
    }

    const kindLabel = (tr, kind) => { const key = 'kind_' + String(kind || ''); const text = tr(key); return text === key ? String(kind || '') : text }

    const pathKey = (value) => String(value === undefined || value === null ? '' : value).trim().replace(/[\\/]+$/, '').toLowerCase()

    function cleanPath(value) {
      let text = String(value === undefined || value === null ? '' : value).trim()
      if (!text) return ''
      const quoted = /^(["'])(.*)\1$/.exec(text)
      if (quoted) text = quoted[2].trim()
      if (!text) return ''
      if (text.length > 3) text = text.replace(/[\\/]+$/, '')
      return text
    }

    function pathList(values) {
      const list = []
      const seen = Object.create(null)
      for (const value of Array.isArray(values) ? values : []) {
        const text = cleanPath(value)
        if (!text) continue
        const key = pathKey(text)
        if (seen[key]) continue
        seen[key] = true
        list.push(text)
      }
      return list
    }

    const parseLines = (text) => pathList(String(text === undefined || text === null ? '' : text).split(/\r?\n/))

    // Rule kinds are singular (`tool`, `skill`) while the state inventory keys
    // are `mcp`, `tools`, `skills`; accept either spelling.
    const INVENTORY_KEYS = { mcp: 'mcp', tool: 'tools', skill: 'skills' }
    function inventoryOf(inventory, kind) {
      if (!inventory) return []
      const preferred = INVENTORY_KEYS[kind] || kind
      const source = Array.isArray(inventory[preferred]) ? inventory[preferred] : inventory[kind]
      if (!Array.isArray(source)) return []
      return source.filter((entry) => entry && typeof entry.name === 'string' && entry.name)
    }


    function governanceOf(entry) {
      return entry && entry.governance && typeof entry.governance === 'object' ? entry.governance : {}
    }
    // Only an explicitly non-governable entry is blocked. A missing governance
    // block (legacy inventory payload) stays selectable; an explicit module or
    // reserved layer does not, even if `governable` was not spelled out.
    function governableOf(entry) {
      const governance = governanceOf(entry)
      if (governance.governable === true) return true
      if (governance.governable === false) return false
      const status = String(governance.status || '')
      return !status || status === 'workspace'
    }
    function governanceReason(entry, resolve, tr) {
      const governance = governanceOf(entry)
      const reason = resolve(governance.reason)
      if (!governance.lastKnown) return reason
      return reason + tr('governance.lastConfirmed', { at: governance.lastConfirmedAt || governance.lastDeclaredAt })
    }
    function governanceLabel(entry, tr) {
      const status = String(governanceOf(entry).status || '')
      if (!status) return tr('statusUnknown')
      const key = 'gov_' + status
      const text = tr(key)
      return text === key ? status : text
    }
    // The host owns one status vocabulary: `status: {code, label, locales}`.
    // Its label wins everywhere (catalog, picker, rule row); the governance
    // mapping above is only the fallback for payloads that predate it.
    function statusText(value, resolve) {
      const status = value && value.status
      if (typeof status === 'string') return status
      if (status && typeof status === 'object') return resolve(status.label)
      return ''
    }
    const entryStatusText = (entry, tr, resolve) => statusText(entry, resolve) || governanceLabel(entry, tr)
    function caveatsOf(entry, resolve) {
      if (!entry) return []
      // Non-governable / reserved entries keep only their own status and reason:
      // generic transport caveats never address the user there. Rules whose
      // target is non-governable are flagged `ignored` by the host, and they
      // keep only their warning. This is defensive: even a payload that still
      // carries such caveats has them dropped here.
      if (!governableOf(entry) || entry.ignored === true) return []
      return (Array.isArray(entry.caveats) ? entry.caveats : [])
        .map((caveat) => resolve(caveat && caveat.reason))
        .filter(Boolean)
    }
    // Host statuses already embed the governance reason and sometimes a caveat.
    // Keep the most general string and drop the ones it contains, so a row never
    // repeats the same sentence (the host text itself is never rewritten).
    function mergeNotes(values) {
      const kept = []
      for (const value of values) {
        if (!value) continue
        const text = String(value)
        if (kept.some((other) => other.indexOf(text) >= 0)) continue
        for (let index = kept.length - 1; index >= 0; index -= 1) if (text.indexOf(kept[index]) >= 0) kept.splice(index, 1)
        kept.push(text)
      }
      return kept
    }
    function limitsOf(entry) {
      const limits = entry && entry.limits && typeof entry.limits === 'object' ? entry.limits : {}
      const clauses = (Array.isArray(limits.clauses) ? limits.clauses : [])
        .filter((clause) => clause && typeof clause === 'object')
        .map((clause) => ({
          kind: clause.kind === undefined ? '' : String(clause.kind),
          name: clause.name === undefined ? '' : String(clause.name),
          workspaces: pathList(clause.workspaces),
        }))
      return { workspaces: pathList(limits.workspaces), clauses, ignored: limits.ignored === true }
    }
    // Active-scope clauses are the host's own rule constraints (a tool may be
    // limited directly and through its MCP server rule; both apply). The client
    // lists each one; it never computes the Team/session intersection itself.
    // `limits.workspaces` is only the first-active-clause fallback, and stored
    // paths of an ignored rule are never shown as an active limit.
    function limitClauses(entry) {
      const limits = limitsOf(entry)
      const source = limits.clauses.length ? limits.clauses : (limits.ignored ? [] : [{ workspaces: limits.workspaces }])
      return source.map((clause) => clause.workspaces).filter((workspaces) => workspaces.length)
    }
    function limitsText(entry, tr) {
      if (!entry) return ''
      if (!governableOf(entry)) return tr('ungoverned')
      const clauses = limitClauses(entry)
      if (clauses.length) return clauses.map((workspaces) => tr('limitsOnly') + workspaces.join(tr('listSep'))).join(tr('limitsJoin'))
      return limitsOf(entry).ignored ? tr('limitsIgnoredEverywhere') : tr('limitsEverywhere')
    }
    // whereSeen tokens are host-owned (`host`, `preset:<id>`, `session-local`,
    // `resource-prompt`, `bbff:<id>`). Render them as user words, never as raw
    // prefixes, and never invent a session id: session-local is a label, not an
    // identity the host stores.
    function sourceToken(value, tr) {
      const text = String(value === undefined || value === null ? '' : value)
      if (!text) return ''
      const known = { host: 'sourceHost', 'session-local': 'sourceSessionLocal', 'resource-prompt': 'sourceResourcePrompt', configured: 'sourceConfigured' }
      if (known[text]) return tr(known[text])
      if (text === 'preset:observed') return tr('sourceUnresolved')
      if (text.startsWith('mcp:')) return tr('sourceMcp') + text.slice(4)
      if (text.startsWith('project:')) return tr('sourceProject') + text.slice(8)
      const preset = /^preset:(.+)$/.exec(text)
      if (preset) return tr('sourcePreset') + preset[1]
      const module = /^bbff:(.+)$/.exec(text)
      if (module) return tr('sourceModule') + module[1]
      return text
    }
    function sourceText(entry, tr, resolve) {
      if (!entry) return ''
      const declared = (Array.isArray(entry.declaredBy) ? entry.declaredBy : [])
        .filter((item) => item && (item.title || item.id))
      const titles = declared.map((item) => textOf(item.title, resolve) || String(item.id || '')).filter(Boolean)
      if (titles.length) return titles.join(tr('listSep'))
      const seen = (Array.isArray(entry.whereSeen) ? entry.whereSeen : [])
        .map((value) => sourceToken(value, tr))
        .filter(Boolean)
      return seen.join(tr('listSep'))
    }

    function inventoryHint(entry, tr, resolve) {
      if (!entry) return ''
      const parts = []
      if (entry.description) parts.push(String(entry.description))
      if (Number.isFinite(entry.toolCount)) parts.push(String(entry.toolCount) + ' ' + tr('inventoryToolCount'))
      const status = entryStatusText(entry, tr, resolve)
      if (!governableOf(entry)) parts.push(tr('ungoverned') + (status ? ': ' + status : ''))
      else {
        if (status) parts.push(status)
        parts.push(limitsText(entry, tr))
      }
      if (entry.loaded === false) parts.push(tr('unloaded'))
      for (const caveat of caveatsOf(entry, resolve)) parts.push(caveat)
      return parts.join(' · ')
    }

    // One catalog for the picker, the catalog panel and the preview. New hosts
    // ship `catalog.entries`; only legacy payloads fall back to `inventory`.
    function catalogFor(data) {
      const sortEntries = (entries) => entries.slice().sort((left, right) => {
        const rankLeft = KINDS.indexOf(left.kind), rankRight = KINDS.indexOf(right.kind)
        const byKind = (rankLeft < 0 ? KINDS.length : rankLeft) - (rankRight < 0 ? KINDS.length : rankRight)
        return byKind || String(left.name).localeCompare(String(right.name))
      })
      const catalog = data && data.catalog && typeof data.catalog === 'object' ? data.catalog : null
      if (catalog && Array.isArray(catalog.entries)) {
        const entries = catalog.entries
          .filter((entry) => entry && typeof entry.name === 'string' && entry.name)
          .map((entry) => ({
            ...entry,
            kind: KINDS.indexOf(String(entry.kind)) >= 0 ? String(entry.kind) : String(entry.kind || 'tool'),
            whereSeen: Array.isArray(entry.whereSeen) ? entry.whereSeen : [],
            declaredBy: Array.isArray(entry.declaredBy) ? entry.declaredBy : [],
          }))
        return {
          entries: sortEntries(entries),
          familyAvailable: catalog.familyAvailable !== false,
          providerAvailable: catalog.providerAvailable !== false, complete: catalog.complete, revision: catalog.revision, generatedAt: catalog.generatedAt,
          notes: Array.isArray(catalog.notes) ? catalog.notes : [],
          legacy: false,
        }
      }
      const rules = Array.isArray(data && data.rules) ? data.rules : []
      const entries = []
      const seen = Object.create(null)
      for (const kind of KINDS) {
        for (const item of inventoryOf(data && data.inventory, kind)) {
          const key = String(kind) + '\u0000' + String(item.name)
          if (seen[key]) continue
          seen[key] = true
          const rule = rules.find((candidate) => candidate && candidate.kind === kind && candidate.name === item.name) || null
          entries.push({
            kind,
            name: String(item.name),
            ...(item.description ? { description: String(item.description) } : {}),
            ...(Number.isFinite(item.toolCount) ? { toolCount: item.toolCount } : {}),
            whereSeen: [],
            declaredBy: [],
            governance: { governable: true, status: 'workspace', reason: '' },
            limits: {
              workspaces: pathList(rule && rule.workspaces),
              ...(rule && rule.id ? { ruleId: rule.id } : {}),
              ignored: false,
            },
            canForget: false,
          })
        }
      }
      return { entries: sortEntries(entries), familyAvailable: true, notes: [], legacy: true }
    }

    function workspaceLabel(entry, resolve) {
      if (!entry) return ''
      const title = textOf(entry.title, resolve)
      const path = entry.path ? String(entry.path) : ''
      if (!path) return title
      return title && title !== path ? title + ' — ' + path : path
    }

    function formatTime(value, lang) {
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) return String(value === undefined || value === null ? '—' : value)
      try { return lang ? date.toLocaleString(lang) : date.toISOString() } catch { return date.toISOString() }
    }

    // The kit's postJson can throw a bare HTTP 400 before the JSON body is read,
    // which drops the host's localized reason. Post through native fetch when it
    // exists, parse the body on ANY status, and decide from `ok`. Never retry a
    // mutation: exactly one request is sent per call.
    function responseReason(payload, resolve) {
      const text = resolve(payload && payload.error)
      return text || errorMessage(payload)
    }
    function httpReason(tr, status) {
      const text = status === undefined || status === null || status === '' ? '' : String(status)
      return tr('apiHttpFailed') + (text ? ' ' + text : '')
    }
    async function postAction(kit, body) {
      const fetchImpl = typeof fetch === 'function' ? fetch : null
      if (fetchImpl) {
        const response = await fetchImpl(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        let payload = null
        try { payload = await response.json() } catch {}
        if (!payload || payload.ok === false || response.ok === false) throw new Error(responseReason(payload, makeResolve(kit)) || httpReason(kitOr(kit, 't', key => key), response && response.status))
        return payload
      }
      const postJson = kitOr(kit, 'postJson', null)
      const tr = kitOr(kit, 't', key => key)
      if (!postJson) throw new Error(tr('apiTransport'))
      let result
      try {
        result = await postJson(API, body)
      } catch (reason) {
        throw new Error(errorMessage(reason) || (reason && reason.message) || tr('apiFailed'))
      }
      if (!result || result.ok === false) throw new Error(responseReason(result, makeResolve(kit)) || tr('apiFailed'))
      return result
    }

    const SCOPE_CSS = `
.bbff-scope-root { display:flex; flex-direction:column; gap:8px; font-size:12px; min-width:0; }
.bbff-scope-spinner { display:inline-block; width:0.9em; height:0.9em; flex:none; box-sizing:border-box; border:2px solid var(--dsw-alias-border-l1); border-top-color:var(--dsw-alias-label-secondary); border-radius:50%; animation:bbff-scope-spin .8s linear infinite; }
@keyframes bbff-scope-spin { to { transform:rotate(360deg); } }
.bbff-scope-section { margin-top:14px; padding-top:12px; border-top:1px solid var(--dsw-alias-border-l1); min-width:0; }
.bbff-scope-title { font-size:13px; font-weight:600; margin:0 0 8px; }
.bbff-scope-line { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
.bbff-scope-block { display:flex; flex-direction:column; gap:3px; min-width:0; }
.bbff-scope-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
.bbff-scope-root pre { white-space:pre-wrap; overflow-wrap:anywhere; max-width:100%; min-width:0; }
.bbff-scope-root details, .bbff-scope-root summary { min-width:0; overflow-wrap:anywhere; }
.bbff-scope-root button, .bbff-scope-root label { max-width:100%; overflow-wrap:anywhere; }
.bbff-scope-field > input[type=checkbox] { align-self:flex-start; margin:0; }
.bbff-scope-default { font-size:11px; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
.bbff-scope-diagnostics li { margin-bottom:5px; line-height:1.5; overflow-wrap:anywhere; }
.bbff-scope-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
.bbff-scope-hint { font-size:11px; line-height:1.5; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
.bbff-scope-error { font-size:11.5px; color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere; }
.bbff-scope-invalid { font-size:11.5px; color:var(--dsw-alias-state-warn-primary); overflow-wrap:anywhere; }
.bbff-scope-guidance { display:flex; flex-direction:column; gap:2px; padding:8px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:7px; background:var(--dsw-alias-bg-base); }
.bbff-scope-rule { padding:8px 0; border-top:1px solid var(--dsw-alias-border-l1); min-width:0; }
.bbff-scope-head { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
.bbff-scope-name { font-weight:600; overflow-wrap:anywhere; }
.bbff-scope-paths { font-size:11px; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; min-width:0; }
.bbff-scope-note { font-size:11px; line-height:1.5; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; margin-top:2px; }
.bbff-scope-actions { display:flex; align-items:center; gap:4px; margin-left:auto; }
.bbff-scope-editor { display:flex; flex-direction:column; gap:10px; margin:6px 0 10px; padding:12px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-base); min-width:0; }
.bbff-scope-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 14px; }
.bbff-scope-field input:not([type=checkbox]), .bbff-scope-field textarea { box-sizing:border-box; width:100%; min-width:0; padding:6px 8px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; line-height:1.5; }
.bbff-scope-field textarea { resize:vertical; min-height:64px; max-height:45vh; overflow:auto; overflow-wrap:anywhere; }
.bbff-scope-field input:focus-visible, .bbff-scope-field textarea:focus-visible, .bbff-scope-select:focus-visible { outline:1px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.bbff-scope-select { box-sizing:border-box; width:100%; min-width:0; padding:4px 6px; font:inherit; font-size:12px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; }
.bbff-scope-checklist { display:flex; flex-direction:column; gap:3px; max-height:180px; overflow:auto; padding:6px 8px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:var(--dsw-alias-bg-layer-1); }
.bbff-scope-checkrow { display:flex; align-items:center; gap:6px; min-width:0; }
.bbff-scope-checkrow .gb-kit-label, .bbff-scope-checkrow > span { overflow-wrap:anywhere; font-size:11.5px; }
.bbff-scope-confirm { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:6px; padding:8px 10px; border:1px solid var(--dsw-alias-state-warn-primary); border-radius:7px; }
.bbff-scope-preview { display:flex; flex-direction:column; gap:8px; margin-top:8px; padding:10px; border:1px solid var(--dsw-alias-border-l1); border-radius:7px; min-width:0; }
.bbff-scope-hidden { display:flex; align-items:center; gap:5px; flex-wrap:wrap; min-width:0; padding:2px 0; }
.bbff-scope-code { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:10.5px; color:var(--dsw-alias-label-tertiary); overflow-wrap:anywhere; }
.bbff-scope-catalog { display:flex; flex-direction:column; gap:6px; min-width:0; }
.bbff-scope-catalog { max-height:560px; overflow:auto; }
.bbff-scope-catalog-row { padding:8px 0; border-top:1px solid var(--dsw-alias-border-l1); min-width:0; }
.bbff-scope-catalog-toolbar { display:flex; flex-wrap:wrap; gap:8px 14px; min-width:0; }
.bbff-scope-catalog-toolbar .bbff-scope-field { flex:1 1 180px; }
.bbff-scope-catalog-row .bbff-scope-line { gap:8px; }
@media (max-width:760px) {
  .bbff-scope-grid { grid-template-columns:minmax(0,1fr); }
  .bbff-scope-actions { margin-left:0; }
}
.bbff-scope-entry { display:flex; flex-direction:column; gap:8px; min-width:0; }
.bbff-scope-entry-count { font-size:12.5px; opacity:.85; overflow-wrap:anywhere; }
.bbff-scope-entry-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.bbff-scope-entry-actions button { font:inherit; padding:3px 9px; border:1px solid var(--dsw-alias-border-l1); border-radius:6px; background:transparent; color:inherit; cursor:pointer; }
.bbff-scope-entry-actions button:disabled { opacity:.6; cursor:default; }
.bbff-scope-advanced-footer { display:flex; flex-direction:column; gap:16px; min-width:0; margin-top:10px; }
.bbff-scope-advanced-footer > .bbff-scope-section { margin-top:0; }
`

    function SectionTitle(props) {
      return h('h3', { className: 'bbff-scope-title' }, props.children)
    }

    function Field(props) {
      return h('div', { className: 'bbff-scope-field', 'data-scope-field': props.field },
        h('span', { className: 'bbff-scope-label', title: props.title }, props.label),
        props.children,
        props.hint ? h('span', { className: 'bbff-scope-hint', title: props.hint }) : null)
    }

    function Select(props) {
      return h('select', {
        className: 'bbff-scope-select',
        value: props.value === undefined || props.value === null ? '' : String(props.value),
        disabled: !!props.disabled,
        'data-scope-select': props.field,
        onChange: (event) => props.onChange(event.target.value),
      }, (props.options || []).map((option) => h('option', {
        key: option.value,
        value: option.value,
        disabled: !!option.disabled,
        title: option.title,
        style: { color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)' },
      }, option.label)))
    }

    function TextInput(props) {
      const Input = kitOr(props.kit, 'Input', null)
      if (Input) return h(Input, { value: props.value, onChange: props.onChange, disabled: !!props.disabled })
      return h('input', {
        type: 'text', className: 'bbff-scope-input', value: props.value,
        disabled: !!props.disabled, placeholder: props.placeholder,
        onChange: (event) => props.onChange(event.target.value),
      })
    }

    function TextArea(props) {
      return h('textarea', {
        value: props.value === undefined || props.value === null ? '' : props.value,
        rows: props.rows || 3,
        disabled: !!props.disabled,
        placeholder: props.placeholder,
        'data-scope-field': props.field,
        onChange: (event) => props.onChange(event.target.value),
      })
    }

    function WorkspacePicker(props) {
      const { kit, tr, resolve, registry, workspaces, typed, disabled, onToggle, onTyped } = props
      const Checkbox = kitOr(kit, 'Checkbox', null)
      const checked = new Set((workspaces || []).map(pathKey))
      const row = (isChecked, onChange, label, key) => Checkbox
        ? h(Checkbox, { key, checked: isChecked, disabled: !!disabled, label, onChange: (next) => onChange(next) })
        : h('label', { key, className: 'bbff-scope-checkrow' },
          h('input', { type: 'checkbox', checked: isChecked, disabled: !!disabled, onChange: (event) => onChange(!!event.target.checked) }),
          h('span', null, label))
      return h('div', { className: 'bbff-scope-field', 'data-scope-field': 'workspaces' },
        h('span', { className: 'bbff-scope-label' }, tr('workspaces')),
        registry.length
          ? h('div', { className: 'bbff-scope-checklist', 'data-scope-workspace-registry': 'true' },
            registry.map((entry) => row(checked.has(pathKey(entry.path)), () => onToggle(entry.path), workspaceLabel(entry, resolve), String(entry.id || entry.path))))
          : h('span', { className: 'bbff-scope-hint' }, tr('noRegistry')),
        h('label', { className: 'bbff-scope-field', 'data-scope-field': 'typed-paths' },
          h('span', { className: 'bbff-scope-label' }, tr('typedPaths')),
          h(TextArea, { value: typed, rows: 3, disabled, field: 'typed-paths', placeholder: tr('typedHint'), onChange: onTyped })),
        null)
    }

    function RuleEditor(props) {
      const { kit, tr, resolve, data, rule, onChanged, onCancel } = props
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const Button = kitOr(kit, 'Button', 'button')
      const creating = !rule
      const catalog = catalogFor(data)
      const entriesOf = (value) => catalog.entries.filter((entry) => entry.kind === value)
      const initialPaths = pathList(rule && rule.workspaces)
      const registry = Array.isArray(data.workspaces) ? data.workspaces.filter((entry) => entry && entry.path) : []
      const registryKeys = new Set(registry.map((entry) => pathKey(entry.path)))
      const initialKind = rule && KINDS.indexOf(rule.kind) >= 0 ? rule.kind : 'mcp'
      const initialKnown = entriesOf(initialKind).map((entry) => entry.name)
      const [kind, setKind] = React.useState(initialKind)
      const [name, setName] = React.useState(rule && rule.name ? String(rule.name) : '')
      const [custom, setCustom] = React.useState(!!rule && !!rule.name && initialKnown.indexOf(String(rule.name)) < 0)
      const [checkedPaths, setCheckedPaths] = React.useState(initialPaths.filter((value) => registryKeys.has(pathKey(value))))
      const [typed, setTyped] = React.useState(initialPaths.filter((value) => !registryKeys.has(pathKey(value))).join('\n'))
      const [note, setNote] = React.useState(rule && rule.note ? String(rule.note) : '')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [dependencyCheck, setDependencyCheck] = React.useState(null)

      const entries = entriesOf(kind)
      const knownNames = entries.map((entry) => entry.name)
      const blockedEntries = entries.filter((entry) => !governableOf(entry))
      const selectedEntry = !custom ? entries.find((entry) => entry.name === name) || null : null
      const selectValue = custom ? CUSTOM : (name && knownNames.indexOf(name) >= 0 ? name : '')
      const workspaces = pathList([...checkedPaths, ...parseLines(typed)])

      const changeKind = (next) => {
        setKind(next)
        setError('')
        const names = entriesOf(next).map((entry) => entry.name)
        if (name && names.indexOf(name) < 0) setCustom(true)
      }
      const changeName = (next) => {
        setError('')
        if (next === CUSTOM) { setCustom(true); return }
        // A non-governable entry stays visible but can never enter a rule; an
        // existing rule whose name just became non-governable is left alone.
        const blocked = entries.find((entry) => entry.name === next && !governableOf(entry))
        if (blocked) { setError(governanceReason(blocked, resolve, tr) || tr('ungoverned')); return }
        setCustom(false)
        setName(next)
      }
      const togglePath = (path) => {
        const key = pathKey(path)
        setCheckedPaths((current) => current.some((value) => pathKey(value) === key)
          ? current.filter((value) => pathKey(value) !== key)
          : [...current, path])
        setError('')
      }
      const save = async () => {
        if (busy) return
        const trimmed = name.trim()
        if (!trimmed) { setError(tr('nameRequired')); return }
        setBusy(true)
        setError('')
        try {
          const candidate = { ...(rule && rule.id ? { id: rule.id } : {}), kind, name: trimmed, workspaces, ...(note.trim() ? { note: note.trim() } : {}) }
          if (Array.isArray(data.requiredTools) && data.requiredTools.length) {
            const checked = await postAction(kit, { action: 'check-rule', rule: candidate })
            const warnings = checked.warnings || [], signature = JSON.stringify({ candidate, warnings })
            if (warnings.length && dependencyCheck?.signature !== signature) { setDependencyCheck({ signature, warnings }); return }
          }
          await postAction(kit, { action: 'upsert', ...(data.revision ? { revision: data.revision } : {}), rule: candidate })
          onChanged(tr('saved'))
        } catch (reason) {
          setError(errorMessage(reason) || tr('apiFailed'))
        } finally {
          setBusy(false)
        }
      }

      const nameOptions = [
        { value: '', label: tr('pickName') },
        ...entries.map((entry) => ({
          value: entry.name,
          label: entry.name,
          disabled: !governableOf(entry),
          title: governableOf(entry) ? undefined : governanceReason(entry, resolve, tr) || tr('ungoverned'),
        })),
        { value: CUSTOM, label: tr('customName') },
      ]
      if (name && !custom && knownNames.indexOf(name) < 0) nameOptions.splice(1, 0, { value: name, label: name })

      return h('div', { className: 'bbff-scope-editor', 'data-scope-editor': creating ? 'new' : String(rule.id) },
        h('strong', null, creating ? tr('newRule') : tr('edit') + ' · ' + String(rule.name || '')),
        h('div', { className: 'bbff-scope-grid' },
          h(Field, { label: tr('kind'), field: 'kind' },
            h(Select, {
              field: 'kind', value: kind, disabled: busy,
              options: KINDS.map((value) => ({ value, label: kindLabel(tr, value) })),
              onChange: changeKind,
            })),
          h(Field, { label: tr('name'), field: 'name' },
            h(Select, { field: 'name', value: selectValue, disabled: busy, options: nameOptions, onChange: changeName }))),
        blockedEntries.length
          ? h('div', { className: 'bbff-scope-block', 'data-scope-picker-blocked': 'true' },
            h('span', { className: 'bbff-scope-label' }, tr('pickerBlocked')),
            blockedEntries.map((entry) => {
              const detail = mergeNotes([entryStatusText(entry, tr, resolve), governanceReason(entry, resolve, tr), ...caveatsOf(entry, resolve)]).join(' — ')
              return h('div', {
                key: entry.name,
                className: 'bbff-scope-hint',
                'data-scope-picker-blocked-entry': entry.name, title: detail,
              }, String(entry.name) + (entryStatusText(entry, tr, resolve) ? ' · ' + entryStatusText(entry, tr, resolve) : ''))
            }))
          : null,
        custom
          ? h(Field, { label: tr('customName'), field: 'custom-name' },
            h(TextInput, { kit, value: name, disabled: busy, placeholder: tr('namePlaceholder'), onChange: (value) => { setName(value); setError('') } }))
          : null,
        selectedEntry && inventoryHint(selectedEntry, tr, resolve)
          ? h('span', { className: 'bbff-scope-hint', 'data-scope-inventory-hint': selectedEntry.name, title: inventoryHint(selectedEntry, tr, resolve) })
          : null,
        h(WorkspacePicker, {
          kit, tr, resolve, registry, workspaces: checkedPaths, typed, disabled: busy,
          onToggle: togglePath, onTyped: (value) => { setTyped(value); setError('') },
        }),
        !workspaces.length ? h('span', { className: 'bbff-scope-invalid', 'data-scope-everywhere': 'true' }, tr('noWorkspaces')) : null,
        h(Field, { label: tr('note'), field: 'note' },
          h(TextInput, { kit, value: note, disabled: busy, placeholder: tr('note'), onChange: (value) => { setNote(value); setError('') } })),
        error ? h(ErrorText, null, error) : null,
        dependencyCheck?.warnings?.length ? h('div', { role: 'alert', 'data-scope-required-warning': 'true' }, h('strong', null, tr('dependencyWarning')), dependencyCheck.warnings.map((warning, index) => h('p', { key: String(index) }, resolve(warning.reason)))) : null,
        h('div', { className: 'bbff-scope-line' },
          h(Button, { variant: 'primary', disabled: busy, onClick: save }, busy ? tr('saving') : dependencyCheck?.warnings?.length ? tr('confirmSave') : tr('save')),
          h(Button, { variant: 'ghost', disabled: busy, onClick: onCancel }, tr('cancel'))))
    }

    function RuleRow(props) {
      const { kit, tr, resolve, rule, disabled, onEdit, onDelete } = props
      const Badge = kitOr(kit, 'Badge', 'span')
      const Button = kitOr(kit, 'Button', 'button')
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const [confirming, setConfirming] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const workspaces = pathList(rule.workspaces)
      const warning = resolve(rule.warning)
      const remove = async () => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          await onDelete(rule.id)
          setConfirming(false)
        } catch (reason) {
          setError(errorMessage(reason) || tr('apiFailed'))
        } finally {
          setBusy(false)
        }
      }
      return h('div', {
        className: 'bbff-scope-rule',
        'data-scope-rule': rule.id,
        'data-scope-rule-kind': rule.kind,
        'data-scope-rule-ignored': rule.ignored ? 'true' : 'false',
      },
        h('div', { className: 'bbff-scope-head' },
          h(Badge, null, kindLabel(tr, rule.kind)),
          h('span', { className: 'bbff-scope-name' }, String(rule.name || '')),
          workspaces.length
            ? h('span', { className: 'bbff-scope-paths', title: workspaces.join('\n'), 'data-scope-rule-paths': rule.id }, workspaces.join(tr('listSep')))
            : h(Badge, { title: tr('noWorkspaces'), explain: { source: tr('explain.scopeRule', { id: rule.id }), settingPath: 'rules.' + rule.id + '.workspaces', default: '[]' } }, tr('everywhere')),
          statusText(rule, resolve)
            ? h('span', { 'data-scope-rule-status': rule.id }, h(Badge, { title: warning || statusText(rule, resolve), explain: { source: tr('explain.scopeGovernance', { id: rule.id }) } }, statusText(rule, resolve)))
            : null,
          rule.ignored ? h(Badge, { tone: 'warning', title: warning || tr('ignoredRuleHint'), explain: { source: tr('explain.scopeGovernance', { id: rule.id }) } }, tr('ignoredRule')) : null,
          h('div', { className: 'bbff-scope-actions' },
            h(Button, { variant: 'ghost', disabled: !!disabled || busy, onClick: () => onEdit(rule.id) }, tr('edit')),
            h(Button, { variant: 'ghost', disabled: !!disabled || busy, onClick: () => { setConfirming(true); setError('') } }, tr('delete')))),
        rule.note ? h('div', { className: 'bbff-scope-note' }, String(rule.note)) : null,
        confirming
          ? h('div', { className: 'bbff-scope-confirm', 'data-scope-confirm-delete': rule.id },
            h('span', { className: 'bbff-scope-hint' }, tr('confirmDelete') + ' · ' + String(rule.name || '')),
            h(Button, { variant: 'primary', disabled: busy, onClick: remove }, busy ? tr('saving') : tr('confirmDelete')),
            h(Button, { variant: 'ghost', disabled: busy, onClick: () => setConfirming(false) }, tr('cancel')))
          : null,
        error ? h(ErrorText, null, error) : null)
    }

    function CatalogPanel(props) {
      const { kit, tr, resolve, catalog, onForget, layers = [] } = props
      const Button = kitOr(kit, 'Button', 'button')
      const Badge = kitOr(kit, 'Badge', 'span')
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const [search, setSearch] = React.useState('')
      const [kind, setKind] = React.useState('')
      const [confirming, setConfirming] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')

      const keyOf = (entry) => String(entry.kind) + ':' + String(entry.name)
      const rank = (entry) => { const at = KINDS.indexOf(entry.kind); return at < 0 ? KINDS.length : at }
      const entries = (Array.isArray(catalog.entries) ? catalog.entries : []).slice()
        .sort((left, right) => (rank(left) - rank(right)) || String(left.name).localeCompare(String(right.name)))
      const needle = search.trim().toLowerCase()
      const matches = (entry) => {
        if (kind && entry.kind !== kind) return false
        if (!needle) return true
        const haystack = [
          entry.name,
          entry.description,
          sourceText(entry, tr, resolve),
          governanceReason(entry, resolve, tr),
          entryStatusText(entry, tr, resolve),
          limitsText(entry, tr),
          ...caveatsOf(entry, resolve),
        ].map((value) => String(value === undefined || value === null ? '' : value)).join(' ').toLowerCase()
        return haystack.indexOf(needle) >= 0
      }
      const shown = entries.filter(matches)
      const forget = async (entry) => {
        if (busy) return
        setBusy(keyOf(entry))
        setError('')
        try {
          await onForget(entry.kind, entry.name)
          setConfirming('')
        } catch (reason) {
          setError(errorMessage(reason) || tr('apiFailed'))
        } finally {
          setBusy('')
        }
      }

      const row = (entry) => {
        const key = keyOf(entry)
        const governance = governanceOf(entry)
        const governable = governableOf(entry)
        const statusLabel = entryStatusText(entry, tr, resolve)
        const notes = mergeNotes([statusLabel, governanceReason(entry, resolve, tr), ...caveatsOf(entry, resolve)])
        const source = sourceText(entry, tr, resolve)
        const ownerLayer = layers.find(layer => layer.moduleId === (governance.owner || entry.owner?.module?.id))
        const loadedText = entry.loaded === true ? tr('loaded') : entry.loaded === false ? tr('unloaded') : tr('loadedUnknown')
        return h('div', {
          key,
          className: 'bbff-scope-catalog-row',
          'data-scope-catalog-entry': key,
          'data-scope-catalog-kind': entry.kind,
          'data-scope-governance': String(governance.status || 'unknown'),
          title: [source || tr('noSource'), entry.ownerBasis?.source, ...notes, entry.lastSeenAt ? tr('lastSeen') + ' ' + entry.lastSeenAt : '', entry.firstSeenAt ? tr('firstSeen') + ' ' + entry.firstSeenAt : '', governance.lastDeclaredAt ? tr('declaredBy') + ' ' + (governance.firstDeclaredAt || tr('statusUnknown')) : '', governance.lastConfirmedAt ? tr('confirmedAt') + ' ' + governance.lastConfirmedAt : ''].filter(Boolean).join(' · '),
        },
          h('div', { className: 'bbff-scope-head' },
            h(Badge, null, kindLabel(tr, entry.kind)),
            h('span', { className: 'bbff-scope-name', 'data-scope-catalog-name': key }, String(entry.name)),
            h(Badge, { title: (entry.ownerBasis?.source || source || tr('noSource')) + ' · ' + tr('label.presence'), explain: { source: tr('explain.catalogPresence') } }, loadedText),
            entry.seenThisRun ? h(Badge, { title: tr('seenRunHint'), explain: { source: tr('explain.catalogSeen') } }, tr('seenThisRun')) : null,
            entry.kind === 'mcp' ? h(Badge, { title: tr('sourceConfigured'), explain: { source: tr('explain.catalogConfigured') } }, entry.configured === true ? tr('configured') + ' · ' + (entry.configuredEnabled === true ? tr('enabled') : entry.configuredEnabled === false ? tr('disabled') : tr('configUnknown')) : tr('configUnknown')) : null,
            governance.lastKnown ? h(Badge, { tone: 'warning', title: governanceReason(entry, resolve, tr), explain: { source: String(governance.ownerTitle || governance.owner || tr('explain.governanceFallback')) } }, tr('lastKnown')) : null,
            h('div', { className: 'bbff-scope-actions' },
              entry.canForget
                ? h(Button, { variant: 'ghost', disabled: !!busy, onClick: () => { setConfirming(key); setError('') } }, tr('forget'))
                : null)),
          ownerLayer?.settingsSectionId ? h(Button, { variant: 'ghost', disabled: typeof kit.openSettingsSection !== 'function', 'data-scope-owner-link': key, title: ownerLayer.moduleTitle, onClick: () => kit.openSettingsSection(ownerLayer.moduleId, ownerLayer.settingsSectionId) }, tr('edit') + ' · ' + ownerLayer.moduleTitle) : null,
          h('div', { className: 'bbff-scope-line' },
            h('span', { className: 'bbff-scope-label' }, tr('governance')),
            h(Badge, { tone: governable ? undefined : 'warning', title: governanceReason(entry, resolve, tr), explain: { source: String(governance.ownerTitle || governance.owner || tr('explain.workspaceRulesFallback')) } }, entryStatusText(entry, tr, resolve)),
            null),
          h('div', { className: 'bbff-scope-line' },
            h('span', { className: 'bbff-scope-label' }, tr('limits')),
            h('span', {
              className: 'bbff-scope-hint',
              'data-scope-catalog-limits': key,
              ...(limitsOf(entry).ignored ? { 'data-scope-catalog-ignored': key } : {}),
            }, limitsText(entry, tr))),
          confirming === key
            ? h('div', { className: 'bbff-scope-confirm', 'data-scope-confirm-forget': key },
              h('span', { className: 'bbff-scope-hint' }, tr('confirmForget') + ' · ' + String(entry.name) + ' · ' + tr('forgetHint')),
              h(Button, { variant: 'primary', disabled: !!busy, onClick: () => forget(entry) }, busy === key ? tr('saving') : tr('confirmForget')),
              h(Button, { variant: 'ghost', disabled: !!busy, onClick: () => { setConfirming(''); setError('') } }, tr('cancel')))
            : null)
      }

      return h('div', { className: 'bbff-scope-catalog', 'data-scope-catalog-list': 'true' },
        h('div', { className: 'bbff-scope-catalog-toolbar' },
          h(Field, { label: tr('catalogSearch'), field: 'catalog-search' },
            h(TextInput, {
              kit, value: search, placeholder: tr('catalogSearchPlaceholder'),
              onChange: (value) => { setSearch(value); setError('') },
            })),
          h(Field, { label: tr('catalogFilter'), field: 'catalog-kind' },
            h(Select, {
              field: 'catalog-kind', value: kind,
              options: [{ value: '', label: tr('filterAll') }, ...KINDS.map((value) => ({ value, label: kindLabel(tr, value) }))],
              onChange: (value) => { setKind(value); setError('') },
            }))),
        h('span', {
          className: 'bbff-scope-hint',
          'data-scope-catalog-count': String(shown.length) + '/' + String(entries.length),
        }, tr('catalogCount') + ' ' + String(shown.length) + ' / ' + String(entries.length) + ((needle || kind) ? ' · ' + tr('catalogFiltered') : '')),
        error ? h(ErrorText, null, error) : null,
        !entries.length ? h('p', { className: 'bbff-scope-hint', 'data-scope-catalog-empty': 'true' }, tr('catalogEmpty')) : null,
        entries.length && !shown.length ? h('p', { className: 'bbff-scope-hint', 'data-scope-catalog-no-match': 'true' }, tr('catalogNoMatch')) : null,
        shown.map(row))
    }

    function PreviewPanel(props) {
      const { kit, tr, resolve, registry, onPreview = () => {} } = props
      const Button = kitOr(kit, 'Button', 'button')
      const Badge = kitOr(kit, 'Badge', 'span')
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const [cwd, setCwd] = React.useState(() => (registry.length ? String(registry[0].path || '') : ''))
      const [busy, setBusy] = React.useState(false)
      const [result, setResult] = React.useState(null)
      const [error, setError] = React.useState('')

      const run = async () => {
        const path = cwd.trim()
        if (busy || !path) return
        // The host validates too; a malformed path is an error, never a silent
        // fail-open result. Only fully qualified paths can be a session root.
        if (!/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(path)) {
          setResult(null); onPreview(null)
          setError(tr('previewInvalidPath'))
          return
        }
        setBusy(true)
        setError('')
        try {
          const payload = await postAction(kit, { action: 'preview', cwd: path })
          setResult(payload.preview || null); onPreview(payload.preview || null)
          if (payload.preview?.cwd) setCwd(payload.preview.cwd)
        } catch (reason) {
          setResult(null); onPreview(null)
          setError(errorMessage(reason) || tr('previewFailed'))
        } finally {
          setBusy(false)
        }
      }

      const choice = registry.some((entry) => String(entry.path) === cwd) ? cwd : ''
      const hiddenCount = result && Array.isArray(result.hidden) ? result.hidden.length : 0
      const previewList = (label, field, values) => h('div', { className: 'bbff-scope-block', 'data-scope-preview-list': field },
        h('span', { className: 'bbff-scope-label' }, label + ' · ' + (Array.isArray(values) ? values.length : 0)),
        h('span', { className: 'bbff-scope-hint' }, Array.isArray(values) && values.length ? values.join(tr('listSep')) : tr('none')))
      // One row per entry the host reports at this root (host + default preset
      // + project skills), with its status there. The shared catalog is never
      // merged in: this is a preview of a NEW ROOT, not the whole catalog.
      const entryRows = result && Array.isArray(result.entries) ? result.entries.filter((entry) => entry && entry.name) : []
      const statusOf = (entry) => {
        const workspace = entry.workspaceStatus && typeof entry.workspaceStatus === 'object' ? entry.workspaceStatus : null
        if (!workspace) return { key: 'unknown', label: tr('statusUnknown'), reason: '', ruleId: '' }
        const reason = resolve(workspace.reason)
        const ruleId = workspace.ruleId ? String(workspace.ruleId) : ''
        if (workspace.governed === false) return { key: 'ungoverned', label: tr('previewStatusUngoverned'), reason, ruleId }
        if (workspace.hidden) return { key: 'hidden', label: tr('previewStatusHidden'), reason, ruleId }
        return { key: 'visible', label: tr('previewStatusVisible'), reason, ruleId }
      }
      const entryList = result && Array.isArray(result.entries)
        ? h('div', { className: 'bbff-scope-block', 'data-scope-preview-catalog': 'true' },
          h('span', { className: 'bbff-scope-label' }, tr('previewCatalog') + ' · ' + entryRows.length),
          entryRows.length
            ? entryRows.map((entry, index) => {
              const status = statusOf(entry)
              return h('div', {
                key: String(index),
                className: 'bbff-scope-hidden',
                'data-scope-preview-entry': String(entry.kind) + ':' + String(entry.name),
                'data-scope-preview-kind': String(entry.kind),
                'data-scope-preview-name': String(entry.name),
                'data-scope-preview-status': status.key,
              },
                h(Badge, null, kindLabel(tr, entry.kind)),
                h('span', { className: 'bbff-scope-name' }, String(entry.name)),
                h(Badge, { tone: status.key === 'hidden' ? 'warning' : undefined, title: status.reason, explain: { source: tr('explain.workspacePreview') } }, status.label),
                null)
            })
            : h('span', { className: 'bbff-scope-hint' }, tr('none')))
        : null

      return h('section', { className: 'bbff-scope-section', 'data-scope-preview': 'true' },
        h(SectionTitle, null, tr('preview')),
        busy ? h(ScopeLoading, { name: 'preview', label: tr('loading') }) : null,

        registry.length
          ? h(Field, { label: tr('previewChoose'), field: 'preview-choice' },
            h(Select, {
              field: 'preview-choice', value: choice, disabled: busy,
              options: [{ value: '', label: '—' }, ...registry.map((entry) => ({ value: String(entry.path), label: workspaceLabel(entry, resolve) }))],
              onChange: (value) => { if (value) { setCwd(value); setError('') } },
            }))
          : null,
        h(Field, { label: tr('previewCwd'), field: 'preview-cwd', title: tr('previewRootHint') },
          h(TextInput, { kit, value: cwd, disabled: busy, placeholder: tr('previewCwd'), onChange: (value) => { setCwd(value); setError('') } })),
        h('div', { className: 'bbff-scope-line' },
          h(Button, { variant: 'primary', disabled: busy || !cwd.trim(), onClick: run }, tr('previewRun'))),
        error ? h(ErrorText, null, error) : null,
        result
          ? h('div', { className: 'bbff-scope-preview', 'data-scope-preview-result': 'true' },
            h('div', { className: 'bbff-scope-line' },
              h('span', { className: 'bbff-scope-label' }, tr('previewCwd')),
              h('code', { className: 'bbff-scope-code', 'data-scope-preview-cwd': 'true' }, String(result.cwd || cwd)),
              hiddenCount > 0
                ? h('span', { 'data-scope-preview-scope': 'scoped' }, h(Badge, { tone: 'warning', title: tr('previewRootHint'), explain: { source: tr('explain.matchedRules') } }, tr('previewScoped')))
                : result.state && result.state !== 'ready' ? null
                  : h('span', { 'data-scope-preview-scope': 'unmatched' }, h(Badge, { title: tr('boundary'), explain: { source: tr('explain.rulesOnly') } }, tr('previewUnmatched')))),
            h('div', { className: 'bbff-scope-block', 'data-scope-preview-list': 'hidden' },
              h('span', { className: 'bbff-scope-label' }, tr('hidden') + ' · ' + (Array.isArray(result.hidden) ? result.hidden.length : 0)),
              Array.isArray(result.hidden) && result.hidden.length
                ? result.hidden.map((entry, index) => h('div', { key: String(index), className: 'bbff-scope-hidden', 'data-scope-preview-hidden': String(entry && entry.name) },
                  h(Badge, null, kindLabel(tr, entry && entry.kind)),
                  h('span', { className: 'bbff-scope-name' }, String((entry && entry.name) || '')),
                  null))
                : h('span', { className: 'bbff-scope-hint' }, tr('none'))),
            previewList(tr('previewTools'), 'tools', result.tools),
            previewList(tr('previewSections'), 'sections', result.sections),
            previewList(tr('previewResources'), 'resources', result.resources),
            entryList,
            null)
          : null)
    }

    function ScopeLoading({ name, label }) {
      // Only an actual in-flight request may mount this animation. Catalog
      // completeness is evidence quality, not an async lifecycle signal.
      return h('span', { className: 'bbff-scope-spinner', role: 'status', 'aria-label': label, 'data-scope-loading': name })
    }

    function SessionDetails({ session, kit, tr, resolve }) {
      const [details, setDetails] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const load = async event => {
        if (!event.currentTarget.open || busy || details) return
        setBusy(true); setError('')
        try { setDetails(await postAction(kit, { action: 'diagnostics', sessionId: session.sessionId })) }
        catch (reason) { setError(errorMessage(reason) || tr('apiFailed')) }
        finally { setBusy(false) }
      }
      return h('details', { onToggle: load, 'data-scope-session-diagnostics': session.sessionId },
        h('summary', { title: tr('diagnosticsHint') }, tr('diagnostics')),
        busy ? h('p', null, tr('loading')) : null,
        error ? h('p', { role: 'alert' }, error) : null,
        details ? h('div', null,
          details.rootCached && details.rootCacheNotice ? h('p', { 'data-scope-diagnostics-root-cached': session.sessionId }, resolve(details.rootCacheNotice.reason)) : null,
          h('p', null, resolve(details.reason)),
          (details.enforcementDiagnostics || []).map((note, index) => h('p', { key: String(index), role: 'alert', 'data-scope-enforcement-unsupported': note.service || note.code }, resolve(note.reason))),
          h('strong', null, tr('visibleTools') + ' · ' + (details.visibleTools || []).length),
          h('pre', null, (details.visibleTools || []).join('\n')),
          h('strong', null, tr('sections')),
          (details.sections || []).map(section => h('div', { key: section.name }, h('code', null, section.name), h('pre', null, section.text)))) : null)
    }

    function PermissionLayers({ layers, kit, tr, resolve }) {
      const Button = kitOr(kit, 'Button', 'button')
      return h('div', { className: 'bbff-scope-block', 'data-scope-permission-layers': 'true' },
        (layers || []).map(layer => h('div', { key: layer.moduleId, className: 'bbff-scope-line', 'data-scope-layer': layer.moduleId },
          h('span', null, layer.moduleTitle + ' · ' + resolve(layer.title)),
          h(Button, { variant: 'ghost', disabled: !layer.settingsSectionId || typeof kit.openSettingsSection !== 'function',
            title: !layer.settingsSectionId || typeof kit.openSettingsSection !== 'function' ? tr('unavailableLink') : layer.moduleTitle,
            onClick: () => kit.openSettingsSection(layer.moduleId, layer.settingsSectionId) }, tr('edit')))))
    }

    function HistoryPanel(props) {
      const { kit, tr, lang, entries, page, onRevert } = props
      const Button = kitOr(kit, 'Button', 'button')
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const [selected, setSelected] = React.useState('')
      const [confirming, setConfirming] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [loadedPage, setLoadedPage] = React.useState(null)
      const currentPage = loadedPage || page
      const ordered = (Array.isArray(loadedPage?.entries) ? loadedPage.entries : Array.isArray(entries) ? entries : []).slice()
        .sort((a, b) => (Date.parse(b && b.at) || 0) - (Date.parse(a && a.at) || 0))
      const chosen = ordered.find((entry) => entry && entry.id === selected) || null
      const label = entry => formatTime(entry && entry.at, lang) + ' · ' + tr('history_' + (String(entry.action).startsWith('revert:') ? 'revert' : entry.action)) + ' · ' + (entry.ruleNames || []).join(tr('listSep'))
      const loadPage = async offset => {
        if (busy) return
        setBusy(true); setError('')
        try { const payload = await postAction(kit, { action: 'history', offset, limit: currentPage?.limit || 20 }); setLoadedPage(payload.historyPage); setSelected(''); setConfirming(false) }
        catch (reason) { setError(errorMessage(reason) || tr('apiFailed')) }
        finally { setBusy(false) }
      }
      const revert = async () => {
        if (busy || !chosen) return
        setBusy(true)
        setError('')
        try {
          await onRevert(chosen.id)
          setConfirming(false)
          setSelected('')
        } catch (reason) {
          setError(errorMessage(reason) || tr('apiFailed'))
        } finally {
          setBusy(false)
        }
      }
      return h('section', { className: 'bbff-scope-section', 'data-scope-history': 'true' },
        h(SectionTitle, null, tr('history')),
        h('p', { className: 'bbff-scope-hint', 'data-scope-whole-file-revert': 'true' }, tr('historyHint')),
        currentPage ? h('div', { className: 'bbff-scope-line', 'data-scope-history-page': String(currentPage.offset) },
          h('span', null, String(currentPage.offset + (ordered.length ? 1 : 0)) + '–' + String(currentPage.offset + ordered.length) + ' / ' + String(currentPage.total)),
          h(Button, { variant: 'ghost', disabled: busy || currentPage.offset === 0, onClick: () => loadPage(Math.max(0, currentPage.offset - currentPage.limit)) }, tr('historyPrevious')),
          h(Button, { variant: 'ghost', disabled: busy || currentPage.nextOffset === null, onClick: () => loadPage(currentPage.nextOffset) }, tr('historyNext'))) : null,
        !ordered.length ? h('p', { className: 'bbff-scope-hint' }, tr('historyEmpty')) : null,
        ordered.length
          ? h(Field, { label: tr('historyPick'), field: 'history' },
            h(Select, {
              field: 'history', value: selected, disabled: busy,
              options: [{ value: '', label: '—' }, ...ordered.map((entry) => ({ value: String(entry.id), label: label(entry) }))],
              onChange: (value) => { setSelected(value); setConfirming(false); setError('') },
            }))
          : null,
        ordered.length
          ? h('div', { className: 'bbff-scope-line' },
            h(Button, { variant: 'ghost', disabled: busy || !selected, onClick: () => setConfirming(true) }, tr('revert')))
          : null,
        chosen?.changes ? h('div', { 'data-scope-history-diff': chosen.id }, h('strong', null, tr('historyDiff')),
          chosen.changes.map((change, index) => h('pre', { key: String(index) }, JSON.stringify(change.before, null, 2) + '\n→\n' + JSON.stringify(change.after, null, 2)))) : null,
        chosen?.diagnostic ? h(ErrorText, null, chosen.diagnostic) : null,
        chosen && confirming
          ? h('div', { className: 'bbff-scope-confirm', 'data-scope-confirm-revert': String(chosen.id) },
            h('span', { className: 'bbff-scope-hint' }, tr('historyHint') + ' · ' + label(chosen)),
            h(Button, { variant: 'primary', disabled: busy, onClick: revert }, busy ? tr('saving') : tr('confirmRevert')),
            h(Button, { variant: 'ghost', disabled: busy, onClick: () => setConfirming(false) }, tr('cancel')))
          : null,
        error ? h(ErrorText, null, error) : null)
    }

    function presentationTooltip(field, resolve) {
      const source = field?.source ? JSON.stringify({ ...field.source, contract: resolve(field.source.contract) }) : ''
      return [resolve(field?.description), source, field?.limits && JSON.stringify(field.limits)].filter(Boolean).join('\n')
    }
    function defaultLabel(field, value, resolve) {
      const option = field?.options?.find(candidate => candidate.value === value)
      return option ? resolve(option.displayLabel) : String(value ?? '—')
    }
    function DisplayLabelEditor({ field, limit, tr, resolve, busy, onSave }) {
      // The descriptor label is a message ref (or user text): edit the resolved text.
      const current = resolve(field.displayLabel)
      const [value, setValue] = React.useState(current)
      React.useEffect(() => setValue(current), [current])
      return h('div', { className: 'bbff-scope-field', 'data-scope-label-editor': field.path },
        h('label', { className: 'bbff-scope-label', title: presentationTooltip(field, resolve) }, current,
          h('input', { type: 'text', value, maxLength: limit, disabled: busy, onChange: event => setValue(event.target.value) })),
        h('span', { className: 'bbff-scope-default', 'data-scope-default': 'true', title: presentationTooltip(field, resolve) }, tr('presentation.defaultPrefix') + resolve(field.default)),
        h('button', { disabled: busy || !value.trim() || value === current, onClick: () => onSave({ displayLabels: { [field.path]: value } }) }, tr('save')))
    }
    function PresentationSettings({ data, tr, resolve, busy, onSave }) {
      const descriptors = data.settingDescriptors
      // No client-owned settings schema or enum-to-label fallback: a Host that
      // predates this presentation contract cannot supply editable controls.
      const fields = descriptors?.settings || []
      const controls = {
        select: field => h(Select, { field: field.field, value: data.settings?.[field.path] ?? '', disabled: busy, options: (field.options || []).map(option => ({ value: option.value, label: resolve(option.displayLabel) })), onChange: value => onSave({ [field.path]: value }) }),
        checkbox: field => h('input', { type: 'checkbox', checked: data.settings?.[field.path] === true, disabled: busy, 'aria-label': resolve(field.displayLabel), 'data-scope-select': field.field, onChange: event => onSave({ [field.path]: !!event.target.checked }) }),
      }
      return h('div', { className: 'bbff-scope-block', 'data-scope-presentation-settings': 'true' },
        fields.map(field => h('label', { key: field.path, className: 'bbff-scope-field', 'data-scope-field': field.field, 'data-scope-setting': field.path },
          h('span', { className: 'bbff-scope-label', title: presentationTooltip(field, resolve) }, resolve(field.displayLabel)), controls[field.control]?.(field),
          h('span', { className: 'bbff-scope-default', 'data-scope-default': 'true', title: presentationTooltip(field, resolve) }, tr('presentation.defaultPrefix') + defaultLabel(field, field.default, resolve)))),
        descriptors ? h('details', { 'data-scope-display-labels': 'true' }, h('summary', null, tr('displayLabels')),
          h('div', { className: 'bbff-scope-grid' }, descriptors.displayLabels.map(field => h(DisplayLabelEditor, { key: field.path, field, limit: descriptors.labelLimits?.maxLength, tr, resolve, busy, onSave })))) : null)
    }
    function diagnosticEntries(data, catalog, preview, tr, resolve) {
      const entries = ['intro', 'guidanceCwd', 'guidanceMcp', 'pathMatching', 'seenRunHint', 'boundary', 'firstObservation', 'catalogHint', 'standingNote', 'previewHint', 'previewRootHint'].map(key => ({ key: 'scope:' + key, reason: tr(key) }))
      const add = (key, reason) => { if (reason) entries.push({ key, reason }) }
      for (const note of catalog.notes || []) entries.push(note)
      if (!catalog.familyAvailable) add('scope:family-unavailable', tr('familyUnavailable'))
      for (const rule of data.rules || []) {
        add('rule:' + rule.id + ':warning', rule.warning, rule.warningLocales)
        for (const note of caveatsOf(rule, resolve)) add('rule:' + rule.id + ':' + note, note)
      }
      for (const entry of catalog.entries || []) {
        add('entry:' + entry.kind + ':' + entry.name + ':reason', governanceReason(entry, resolve, tr))
        for (const note of caveatsOf(entry, resolve)) add('entry:' + entry.kind + ':' + entry.name + ':' + note, note)
      }
      for (const session of data.sessions || []) {
        if (session.failOpen) add('session:open:' + session.sessionId, tr('sessionFailOpen'))
        if (session.hideAll) add('session:hide:' + session.sessionId, tr('sessionHideAll'))
        if (session.rootCacheNotice) entries.push(session.rootCacheNotice)
        entries.push(...(session.enforcementDiagnostics || []))
      }
      entries.push(...(preview?.notes || []), ...(preview?.warnings || []))
      for (const entry of preview?.entries || []) if (entry.workspaceStatus) add('preview:' + entry.kind + ':' + entry.name, entry.workspaceStatus.reason)
      return entries
    }
    // Show the sentence as written in the active locale. Chinese multi-sentence
    // reasons keep their established single-sentence view; other scripts are
    // never split or rewritten.
    function localizedSentenceText(entry, resolve) {
      const reason = resolve(entry && entry.reason)
      const text = String(reason).replace(/\s+/g, ' ').trim()
      if (!text) return ''
      return /[。！？]/.test(text) ? text.split(/[。！？]/, 1)[0] + '。' : text
    }
    function diagnosticSentences(entries, resolve) {
      const keys = new Set(), sentences = new Set(), result = []
      for (const entry of entries) {
        if (!entry || entry.transient === true || ['pending', 'running', 'loading'].includes(entry.state)) continue
        const sentence = localizedSentenceText(entry, resolve)
        if (!sentence) continue
        const key = entry.key || [entry.code, entry.inference, sentence].join('\u0000')
        if (keys.has(key) || sentences.has(sentence)) continue
        keys.add(key); sentences.add(sentence); result.push({ key, sentence })
      }
      return result
    }
    function ScopeDiagnostics({ data, catalog, preview, kit, tr, resolve }) {
      if (data.settings?.showDiagnostics !== true) return null
      const entries = diagnosticEntries(data, catalog, preview, tr, resolve)
      return h('section', { className: 'bbff-scope-section', 'data-scope-diagnostics': 'true' },
        h(SectionTitle, null, tr('diagnosticPanel')),
        h('ul', { className: 'bbff-scope-diagnostics', 'data-scope-diagnostic-notices': 'true' }, diagnosticSentences(entries, resolve).map(entry => h('li', { key: entry.key, 'data-scope-diagnostic-key': entry.key }, entry.sentence))),
        h('details', { 'data-scope-diagnostic-raw': 'true' }, h('summary', null, tr('rawData')),
          h('pre', { 'data-scope-raw-data': 'true' }, JSON.stringify({ entries, state: data, preview }, null, 2)),
          h(PermissionLayers, { layers: data.permissionLayers, kit, tr, resolve }),
          (data.sessions || []).map(session => h('div', { key: session.sessionId, 'data-scope-session-raw': session.sessionId },
            h('code', { 'data-scope-session-id': session.sessionId }, session.sessionId),
            h(SessionDetails, { key: session.sessionId, session, kit, tr, resolve })))))
    }

    function ScopeSettings(props) {
      const kit = props.kit
      // Active DSH locale id (raw, for Intl formatting and the shared layout).
      const lang = props.localeId || ''
      const resolve = makeResolve(kit)
      const Empty = kitOr(kit, 'Empty', 'div')
      const ErrorText = kitOr(kit, 'ErrorText', 'div')
      const Hint = kitOr(kit, 'Hint', 'div')
      const Button = kitOr(kit, 'Button', 'button')
      const Badge = kitOr(kit, 'Badge', 'span')

      const [state, setState] = React.useState({ status: 'loading', data: null, error: '', notice: '' })
      // Module strings come from the package dictionary; a user-edited display
      // label (or the host's kind labels) overrides the shipped default.
      const translate = typeof props.t === 'function' ? props.t : kitOr(kit, 't', key => key)
      const labelOverrides = new Map()
      for (const field of state.data?.settingDescriptors?.kinds || []) labelOverrides.set('kind_' + field.value, field.displayLabel)
      for (const field of state.data?.settingDescriptors?.displayLabels || []) labelOverrides.set(field.path, field.displayLabel)
      const tr = (key, params) => labelOverrides.has(key) ? resolve(labelOverrides.get(key)) : translate(key, params)
      const [preview, setPreview] = React.useState(null)
      const [editing, setEditing] = React.useState('')
      const [creating, setCreating] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const rulesSectionRef = React.useRef(null)
      const [rulesFocus, setRulesFocus] = React.useState(0)

      const load = React.useCallback(() => {
        let cancelled = false
        setState((previous) => ({ ...previous, status: 'loading', error: '' }))
        postAction(kit, { action: 'state' })
          .then((payload) => { if (!cancelled) setState({ status: 'ready', data: payload, error: '', notice: '' }) })
          .catch((reason) => { if (!cancelled) setState({ status: 'unavailable', data: null, error: errorMessage(reason) || tr('stateFailed'), notice: '' }) })
        return () => { cancelled = true }
      }, [kit])

      React.useEffect(() => load(), [load])
      // Opening the editor from the basic rules card reveals the real editor below.
      React.useEffect(() => {
        if (!creating) return
        const node = rulesSectionRef.current
        if (node && typeof node.scrollIntoView === 'function') { try { node.scrollIntoView({ block: 'start' }) } catch {} }
      }, [creating])

      const refresh = async (notice) => {
        try {
          const payload = await postAction(kit, { action: 'state' })
          setState({ status: 'ready', data: payload, error: '', notice: notice || '' })
        } catch (reason) {
          setState((previous) => ({
            ...previous,
            status: previous.data ? 'ready' : 'unavailable',
            error: errorMessage(reason) || tr('stateFailed'),
            notice: '',
          }))
        }
      }

      const mutate = async (body, notice) => {
        if (busy) return
        setBusy(true)
        setState((previous) => ({ ...previous, error: '' }))
        try {
          await postAction(kit, { ...body, ...(state.data?.revision ? { revision: state.data.revision } : {}) })
          await refresh(notice)
        } catch (reason) {
          setState((previous) => ({ ...previous, error: errorMessage(reason) || tr('apiFailed') }))
          throw reason
        } finally {
          setBusy(false)
        }
      }

      if (state.status === 'loading') {
        return h('div', { 'data-scope-settings': 'true', className: 'bbff-scope-root' },
          h('style', null, SCOPE_CSS),
          h(ScopeLoading, { name: 'state', label: tr('loading') }))
      }
      if (state.status === 'unavailable') {
        return h('div', { 'data-scope-settings': 'true', className: 'bbff-scope-root' },
          h('style', null, SCOPE_CSS),
          h(Empty, null, tr('unavailable') + (state.error ? ' · ' + state.error : '')),
          h('div', { className: 'bbff-scope-line' },
            h(Button, { variant: 'ghost', onClick: () => load() }, tr('retry'))))
      }

      const data = state.data || {}
      const rules = Array.isArray(data.rules) ? data.rules.filter((rule) => rule && rule.id) : []
      const registry = Array.isArray(data.workspaces) ? data.workspaces.filter((entry) => entry && entry.path) : []
      const editingRule = creating ? null : rules.find((rule) => rule.id === editing) || null
      const catalog = catalogFor(data)
      const sessions = Array.isArray(data.sessions) ? data.sessions : []
      const sessionHiddenCount = (session) => (session && Number.isFinite(session.hiddenCount) ? session.hiddenCount : 0)

      // A forgotten name is a ledger write, not a rule edit: no revision field,
      // and the panel re-reads state from the host afterwards.
      const forget = async (kind, name) => {
        await postAction(kit, { action: 'catalog-forget', kind, name })
        await refresh(tr('forgotten'))
      }

      const openAdd = () => { setCreating(true); setEditing(''); setState((previous) => ({ ...previous, notice: '', error: '' })) }
      const openEdit = (id) => { if (busy) return; setCreating(false); setEditing(id); setState((previous) => ({ ...previous, notice: '', error: '' })) }
      const done = (notice) => { setCreating(false); setEditing(''); refresh(notice) }

      // Host-owned presentation data → the family root's shared SettingsLayout
      // (Widgets metadata v2). Effects, group titles and order stay data; this
      // Client only renders fields and never owns an effect/basic copy table.
      // An older root without the layout keeps the previous flat renderer.
      const descriptors = data.settingDescriptors || null
      const settingsValues = data.settings || {}
      const presentationLabels = descriptors?.presentation?.labels
      const SettingsLayout = kitOr(kit, 'SettingsLayout', null)
      const SettingHelp = kitOr(kit, 'SettingHelp', null)
      const effectText = (field) => resolve(field?.effect)
      const helpFor = (field) => (SettingHelp ? h(SettingHelp, { field, locale: lang, labels: presentationLabels, moduleId: 'scope' }) : null)
      const effectLine = (field, context) => (context?.basic && effectText(field) ? h('p', { className: 'gb-basic-effect', 'data-scope-basic-effect': field.path }, effectText(field)) : null)
      const saveSettings = (patch) => mutate({ action: 'settings-save', settings: patch, settingsRevision: data.settingsRevision }, tr('saved')).catch(() => {})
      const saveSetting = (path, value) => saveSettings({ [path]: value })
      const defaultLine = (field) => h('span', { className: 'bbff-scope-default', 'data-scope-default': 'true', title: presentationTooltip(field, resolve) }, tr('presentation.defaultPrefix') + defaultLabel(field, field.default, resolve))
      const viewRules = () => {
        setCreating(false); setEditing('')
        setRulesFocus((token) => token + 1)
        const node = rulesSectionRef.current
        if (node && typeof node.scrollIntoView === 'function') { try { node.scrollIntoView({ block: 'start' }) } catch {} }
      }
      const renderSetting = (field, context = {}) => {
        if (!field || !field.path) return null
        const name = h('span', { className: 'bbff-scope-label', title: presentationTooltip(field, resolve) }, resolve(field.displayLabel) || field.path)
        if (field.control === 'entry') {
          return h('div', { className: 'bbff-scope-entry', key: field.path, 'data-scope-setting': field.path, 'data-scope-rules-entry': 'true' },
            h('div', { className: 'bbff-scope-entry-count', 'data-scope-rules-count': String(rules.length) }, tr('rules') + ' · ' + rules.length),
            h('div', { className: 'bbff-scope-entry-actions' },
              h('button', { type: 'button', disabled: busy, 'data-scope-entry-action': 'new', onClick: openAdd }, tr('addRule')),
              h('button', { type: 'button', disabled: busy, 'data-scope-entry-action': 'view', onClick: viewRules }, tr('viewRules'))),
            effectLine(field, context))
        }
        if (field.control === 'display-labels') {
          return h('div', { className: 'bbff-scope-display-labels-field', key: field.path, 'data-scope-setting': field.path },
            h('div', { className: 'bbff-scope-line' }, name, helpFor(field)),
            h('details', { 'data-scope-display-labels': 'true' }, h('summary', null, tr('displayLabels')),
              h('div', { className: 'bbff-scope-grid' }, (descriptors?.displayLabels || []).map(entry => h(DisplayLabelEditor, { key: entry.path, field: entry, limit: descriptors?.labelLimits?.maxLength, tr, resolve, busy, onSave: saveSettings })))),
            effectLine(field, context))
        }
        const value = settingsValues[field.path]
        const input = field.control === 'select'
          ? h(Select, { field: field.field, value, disabled: busy, options: (field.options || []).map(option => ({ value: option.value, label: resolve(option.displayLabel) })), onChange: (next) => saveSetting(field.path, next) })
          : field.control === 'checkbox'
            ? h('input', { type: 'checkbox', checked: value === true, disabled: busy, 'aria-label': resolve(field.displayLabel), 'data-scope-select': field.field, onChange: (event) => saveSetting(field.path, !!event.target.checked) })
            : null
        if (!input) return null
        return h('div', { className: 'bbff-scope-setting-row', key: field.path, 'data-scope-setting': field.path },
          h('label', { className: 'bbff-scope-field', 'data-scope-field': field.field }, name, input, helpFor(field)),
          defaultLine(field), effectLine(field, context))
      }
      const advancedFooter = h('div', { className: 'bbff-scope-advanced-footer', 'data-scope-advanced-footer': 'true' },
        Array.isArray(data.sessions)
          ? h('section', { className: 'bbff-scope-section', 'data-scope-sessions': 'true' },
            h(SectionTitle, null, tr('sessions') + ' · ' + sessions.length),
            sessions.length
              ? sessions.map((session, index) => h('div', {
                key: String(index),
                className: 'bbff-scope-block',
                'data-scope-session': String((session && session.sessionId) || ''),
                title: [session.failOpen ? tr('sessionFailOpen') : session.hideAll ? tr('sessionHideAll') : '', session.rootCacheNotice ? resolve(session.rootCacheNotice.reason) : ''].filter(Boolean).join(' · '),
              },
                h('div', { className: 'bbff-scope-line' },
                  session.failOpen ? h('span', { 'data-scope-session-fail-open': session.sessionId, title: tr('sessionFailOpen') }) : null,
                  h('span', { 'data-scope-session-hidden': String((session && session.sessionId) || '') },
                    h(Badge, { title: tr('sessionHidden') + ' · ' + tr('label.scopeRules'), explain: { source: tr('explain.sessionRules') } }, tr('sessionHidden') + ' ' + String(sessionHiddenCount(session))))),
                h('div', { className: 'bbff-scope-line' },
                  h('span', { className: 'bbff-scope-label' }, tr('sessionCwd')),
                  h('code', { className: 'bbff-scope-code', 'data-scope-session-cwd': String((session && session.sessionId) || '') }, String((session && session.cwd) || '—'))),
                null))
              : h('p', { className: 'bbff-scope-hint', 'data-scope-sessions-empty': 'true' }, tr('sessionEmpty')))
          : null,
        h('section', { className: 'bbff-scope-section', 'data-scope-catalog': 'true' },
          h(SectionTitle, null, tr('catalog') + ' · ' + catalog.entries.length),
          h(CatalogPanel, { kit, tr, resolve, catalog, onForget: forget, layers: data.permissionLayers })),
        h(PreviewPanel, { kit, tr, resolve, registry, onPreview: setPreview }),
        h(HistoryPanel, {
          kit, tr, resolve, lang,
          entries: Array.isArray(data.history) ? data.history : [], page: data.historyPage,
          onRevert: (id) => mutate({ action: 'revert', id }, tr('reverted')),
        }),
        h(ScopeDiagnostics, { data, catalog, preview, kit, tr, resolve }))
      const legacySettings = h(PresentationSettings, { data, tr, resolve, busy, onSave: saveSettings })
      const settingsBlock = SettingsLayout && descriptors
        ? h(SettingsLayout, { descriptors, values: settingsValues, locale: lang, renderField: renderSetting, advancedFooter,
            // Own the full legacy feature surface; the shared layout chooses it
            // when grouping metadata is absent/invalid, without copying its UI.
            legacyChildren: h('div', { 'data-scope-legacy-content': 'true' }, legacySettings, advancedFooter) })
        : legacySettings

      return h('div', { 'data-scope-settings': 'true', className: 'bbff-scope-root' },
        h('style', null, SCOPE_CSS),
        settingsBlock,
        state.notice ? h('div', { className: 'bbff-scope-hint', role: 'status', 'aria-live': 'polite', 'data-scope-notice': 'true' }, state.notice) : null,
        state.error ? h(ErrorText, null, state.error) : null,
        h('div', { ref: rulesSectionRef, 'data-scope-rules-section': 'true', 'data-scope-rules-focus': String(rulesFocus) },
          h('div', { className: 'bbff-scope-line' },
            h('strong', null, tr('rules') + ' · ' + rules.length),
            h(Button, { variant: 'ghost', disabled: creating || !!editingRule || busy, onClick: openAdd }, tr('addRule')),
            h(Button, { variant: 'ghost', disabled: busy, onClick: () => refresh() }, tr('refresh'))),
          !rules.length && !creating ? h(Hint, null, tr('noRules')) : null,
          creating
            ? h(RuleEditor, { key: 'new', kit, tr, resolve, data, rule: null, onChanged: done, onCancel: () => setCreating(false) })
            : null,
          h('div', { 'data-scope-rule-list': 'true' }, rules.map((rule) => (editing === rule.id
            ? h(RuleEditor, { key: rule.id, kit, tr, resolve, data, rule, onChanged: done, onCancel: () => setEditing('') })
            : h(RuleRow, {
              key: rule.id, kit, tr, resolve, rule,
              disabled: busy || creating,
              onEdit: openEdit,
              onDelete: (id) => mutate({ action: 'delete', id }, tr('deleted')),
            }))))),
        SettingsLayout && descriptors ? null : advancedFooter)
    }

    function withKit(component, kit, activeLocale) {
      return function RegisteredScopeSettings(props) {
        const merged = { ...(props || {}) }
        if (!merged.kit) merged.kit = kit
        if (!merged.localeId) merged.localeId = activeLocale()
        return h(component, merged)
      }
    }

    return {
      inject: ['locale'],
      apply(ctx) {
        if (!ctx || typeof ctx.inject !== 'function') return
        const locale = ctx.locale
        const activeLocale = () => { try { const snapshot = locale?.getSnapshot?.(); return snapshot && typeof snapshot.active === 'string' ? snapshot.active : '' } catch { return '' } }
        ctx.inject(['bbffUi'], (scope) => {
          const ui = scope && typeof scope.get === 'function' ? scope.get('bbffUi') : scope && scope.bbffUi
          if (!ui || ui.contract !== 1 || !ui.kit) return
          const register = () => ui.registerSettingsSection({
            id: 'scope',
            title: msg('module.title'),
            moduleId: 'scope',
            component: withKit(ScopeSettings, ui.kit, activeLocale),
          })
          try {
            if (typeof scope.effect === 'function') scope.effect(register, 'oh-my-bbff-scope: settings scope')
            else register()
          } catch {}
        })
      },
    }
  },
})
