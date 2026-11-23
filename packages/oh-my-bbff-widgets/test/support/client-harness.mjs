// Test support: load the REAL Widgets client bundle into a DSH-locale stand-in and a
// minimal React runtime (function components + persistent `useState`), so the
// browser-only code paths (settings layout interaction, card rendering) can be driven
// and asserted headlessly. Nothing here re-implements product logic: the bundle, its
// dictionaries and its resolution rules are the real ones.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

export const widgetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Minimal React: function components, persistent hook slots keyed by tree path, re-render on state. */
export function createRuntime() {
  const instances = new Map()
  let root = null
  let hooks = null
  let cursor = 0
  let dirty = false

  const reserve = () => {
    if (!hooks) throw new Error('hook called outside a component render')
    return cursor++
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children }, children }),
    useState(initial) {
      const index = reserve()
      const slot = (hooks.slots[index] ??= {})
      if (!Object.hasOwn(slot, 'value')) slot.value = typeof initial === 'function' ? initial() : initial
      return [slot.value, (next) => {
        slot.value = typeof next === 'function' ? next(slot.value) : next
        dirty = true
      }]
    },
    useRef(value) {
      const index = reserve()
      const slot = (hooks.slots[index] ??= {})
      if (!Object.hasOwn(slot, 'value')) slot.value = { current: value }
      return slot.value
    },
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useEffect() { reserve() },
    useLayoutEffect() { reserve() },
    Fragment: 'fragment',
  }

  function renderNode(node, at) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (typeof node === 'string' || typeof node === 'number') return node
    if (Array.isArray(node)) return node.map((child, index) => renderNode(child, at + '.' + index))
    if (typeof node !== 'object' || !Object.hasOwn(node, 'type')) return node
    const { type, props } = node
    if (typeof type === 'function') {
      const key = at + '#' + (type.name || 'anonymous')
      let instance = instances.get(key)
      if (!instance) { instance = { slots: [] }; instances.set(key, instance) }
      const outerHooks = hooks, outerCursor = cursor
      hooks = instance
      cursor = 0
      let output
      try { output = type(props || {}) } finally { hooks = outerHooks; cursor = outerCursor }
      return renderNode(output, at + '/' + (type.name || 'component'))
    }
    return { type, props: { ...props, children: (props.children || []).map((child, index) => renderNode(child, at + '.' + index)) } }
  }

  return {
    react,
    render(element) { root = element; dirty = false; return renderNode(element, 'root') },
    rerender() { return renderNode(root, 'root') },
    /** Run a handler and re-render once, like a browser event round trip. */
    act(handler) { const value = handler(); dirty = false; const tree = renderNode(root, 'root'); return { value, tree } },
    get dirty() { return dirty },
  }
}

/** Depth-first element lookup over a rendered tree. */
export function find(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) { const hit = find(child, predicate); if (hit) return hit }
    return null
  }
  if (predicate(node)) return node
  for (const child of node.props?.children || []) { const hit = find(child, predicate); if (hit) return hit }
  return null
}

/** Every string reachable in a rendered tree (text nodes and text-bearing attributes). */
export function strings(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { for (const child of node) strings(child, out); return out }
  if (typeof node !== 'object') return out
  for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
    if (typeof node.props?.[attribute] === 'string') out.push(node.props[attribute])
  }
  for (const child of node.props?.children || []) strings(child, out)
  return out
}

/** React's child contract: null/boolean/string/number/element/array of those. */
export function invalidChildren(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') return out
  if (Array.isArray(node)) { for (const child of node) invalidChildren(child, out); return out }
  if (typeof node === 'object' && Object.hasOwn(node, 'type')) {
    for (const child of node.props?.children || []) invalidChildren(child, out)
    return out
  }
  out.push(node)
  return out
}

/** DSH locale service stand-in over the real dictionaries of the packages the test registers. */
export function createLocaleService({ active = 'en', dictionaries = {}, languages = ['en', 'zh'] } = {}) {
  const chain = (id) => {
    const order = []
    let current = id
    while (current) { order.push(current); current = current === 'en' ? undefined : 'en' }
    return order
  }
  let current = active
  const translate = (namespace) => (key, params) => {
    let text
    for (const language of chain(current)) {
      const dictionary = dictionaries[namespace + '/' + language]
      if (dictionary && Object.hasOwn(dictionary, key)) { text = dictionary[key]; break }
    }
    if (text === undefined) text = key
    if (params) for (const [name, value] of Object.entries(params)) text = text.split('{' + name + '}').join(String(value))
    return text
  }
  const service = {
    getSnapshot: () => ({ active: current, locales: languages.map((id) => ({ id })), revision: 1 }),
    subscribe: () => () => {},
    register: () => () => {},
    addLanguage: () => () => {},
    bind: (namespace) => translate(namespace),
  }
  return { service, setActive: (id) => { current = id }, getActive: () => current }
}

const MARKER = /    return \{\n      inject: \[[^\n]*\],/
const EXPOSE = ['kitFor', 'renderSettingsLayout', 'SettingsLayout', 'SettingHelp', 'syncModuleNamespaces',
  'mcpCompletenessRow', 'hostText', 'messageRef', 'stampRefs', 'producerNamespaceOf']

/**
 * Load the real bundle and apply it with the services a browser host provides.
 * `modules` populates the family registry view the client keys namespaces from.
 */
export async function loadWidgetsClient({ active = 'en', dictionaries = {}, modules = [], getResponse, clientPath } = {}) {
  const runtime = createRuntime()
  const warnings = []
  const sandbox = {
    window: {}, fetch: null, setInterval, clearInterval, setTimeout, clearTimeout,
    console: { warn: (...parts) => warnings.push(parts.join(' ')), log: () => {}, error: (...parts) => warnings.push(parts.join(' ')) },
  }
  sandbox.globalThis = sandbox
  const definitions = new Map()
  sandbox.window.__ModuleLoader__ = { load: (definition) => { definitions.set(definition.id, definition) } }
  vm.createContext(sandbox)
  const locales = createLocaleService({ active, dictionaries })
  const source = fs.readFileSync(clientPath || path.join(widgetRoot, 'client.js'), 'utf8').replace(/\r\n/g, '\n')
  const marker = source.match(MARKER)
  if (!marker) throw new Error('client module marker not found')
  const exposure = EXPOSE.map((name) => name + ':(typeof ' + name + '==="undefined"?undefined:' + name + ')').join(',')
  const instrumented = source.replace(marker[0], '    globalThis.__widgetsTest={' + exposure + '};\n' + marker[0])
  vm.runInContext(instrumented, sandbox, { filename: 'oh-my-bbff-widgets-client.js' })
  const definition = definitions.get('oh-my-bbff-widgets')
  if (!definition) throw new Error('the Widgets client bundle did not register')
  const module = definition.factory((name) => {
    if (name === 'react') return runtime.react
    throw new Error('unexpected client require: ' + name)
  })
  const services = {
    locale: locales.service,
    sidebarRight: { openResource: () => true, openTab: () => true },
    uiWorkspace: { openSession: () => true },
    sidebarRightTabs: { register: () => () => {} },
    layout: { selectPanel: () => true },
  }
  const cleanups = []
  const effect = (fn) => { const value = fn(); if (typeof value === 'function') cleanups.push(value); return value }
  const ctx = {
    get: (name) => services[name],
    provide: (name, value) => { services[name] = value },
    effect,
    slots: { inject: (name, callback) => { try { callback() } catch {} return () => {} }, register: () => () => {} },
    inject: (names, callback) => callback({ get: (name) => services[name], effect }),
    on: () => {}, logger: { warn: (message) => warnings.push(String(message)), error: () => {} }, fiber: { uid: 1 },
  }
  const settingsResponse = { ok: true, settings: {}, descriptors: { settings: [], cardFields: [], displayLabels: [] }, defaults: {}, limits: {}, settingsSectionRule: {}, fixedContracts: [], diagnostics: [] }
  sandbox.fetch = async (url, options) => {
    let body = {}
    try { body = JSON.parse((options && options.body) || '{}') } catch {}
    const value = (getResponse && getResponse(body)) || settingsResponse
    return { ok: true, status: 200, json: async () => value }
  }
  await module.apply(ctx)
  const internals = sandbox.__widgetsTest
  if (modules.length) internals.syncModuleNamespaces({ modules })
  return { module, internals, runtime, locales, services, sandbox, warnings, cleanups }
}
