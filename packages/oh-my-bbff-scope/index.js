import { homedir } from 'node:os'
import { join } from 'node:path'
import { registerFamilyModule, msg } from './lib/bbff-contract.js'
import { createRuleStore } from './lib/store.js'
import { createScopeEngine, HIDE_PROVIDER } from './lib/engine.js'
import packageInfo from './package.json' with { type: 'json' }
import { validateRule } from './lib/rules.js'
import { scopeSettingsDescriptors } from './lib/settings-metadata.js'

export const name = packageInfo.name
export const inject = ['tools']
export const VERSION = packageInfo.version
export const API_ROUTE = '/oh-my-bbff-scope/api'
export const FAMILY_DESCRIPTOR = { contract: packageInfo.bbff.contract, id: packageInfo.bbff.id, title: msg('module.title'),
  description: msg('module.description'), version: VERSION, packageName: name, apiBase: API_ROUTE, locale: { dir: 'locale' }, ui: { settings: true }, tools: [],
  skillMaskProviders: [HIDE_PROVIDER], permissionLayer: { title: msg('module.permissionLayerTitle'), settingsSectionId: 'scope' } }

export async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > 256 * 1024) throw new Error('request body exceeds 256 KiB')
    chunks.push(bytes)
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('request body must be an object')
  return body
}
export function createApi(ctx, store, engine) {
  const get = key => { try { return ctx.get(key) } catch { return undefined } }
  async function state() {
    const catalog = await engine.catalogState()
    const modules = engine.catalog.governance.info().modules, page = store.historyPage()
    return { ok: true, ...store.read(), rules: engine.ruleStatuses(catalog), sessions: await engine.sessions(), revision: store.revision(), history: page.entries, historyPage: page, catalog, inventory: await engine.inventory(catalog),
      settings: engine.settings.read(), settingDefaults: engine.settings.defaults, settingsRevision: engine.settings.revision(),
      settingDescriptors: scopeSettingsDescriptors(engine.settings.read(), engine.settings.defaults),
      permissionLayers: modules.filter(module => module.id !== FAMILY_DESCRIPTOR.id && module.permissionLayer).map(module => ({ moduleId: module.id, moduleTitle: module.title, ...module.permissionLayer })),
      requiredTools: modules.filter(module => module.requiredTools).map(module => ({ moduleId: module.id, moduleTitle: module.title, ...module.requiredTools })),
      workspaces: (get('workspaceRegistry')?.list?.() || []).map(workspace => ({ id: workspace.id, path: workspace.path, title: workspace.title })) }
  }
  async function dispatch(body) {
    if (body.action === 'state' || !body.action) return state()
    if (body.action === 'preview') return { ok: true, preview: await engine.preview(body.cwd) }
    if (body.action === 'history') return { ok: true, historyPage: store.historyPage({ offset: body.offset, limit: body.limit }) }
    if (body.action === 'settings-save') { engine.settings.save(body.settings, body.settingsRevision); await engine.reload(); return state() }
    if (body.action === 'check-rule') {
      const rule = validateRule({ ...body.rule, id: body.rule?.id || 'preview' })
      engine.validateUpsert(rule)
      return { ok: true, warnings: engine.requiredWarnings([rule]) }
    }
    if (body.action === 'catalog-forget') { await engine.catalog.forget(body.kind, body.name); return state() }
    if (body.action === 'diagnostics') {
      const root = await engine.resolve(body.sessionId)
      const agent = get('agents')?.get?.(body.sessionId)
      const sections = agent ? await engine.diagnosticSections(agent) : []
      const diagnostics = agent ? { ...(await engine.sessionDiagnostics(agent)), active: true } : { ...root, active: false, failOpen: !root.cwd && engine.settings.read().unknownCwd === 'open', hideAll: !root.cwd && engine.settings.read().unknownCwd === 'hide-all', hidden: [], hiddenCount: 0, visibleTools: [], reason: msg('reason.sessionInactive') }
      return { ok: true, ...diagnostics, sections }
    }
    if (body.action === 'upsert') await store.upsert(body.rule, body.revision)
    else if (body.action === 'delete') await store.remove(body.id, body.revision)
    else if (body.action === 'revert') await store.revert(body.id, body.revision)
    else throw new Error('unknown action')
    await engine.reload()
    return state()
  }
  const handler = async (req, res) => {
    const json = (status, value) => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)) }
    if (req.method !== 'POST') { json(405, { ok: false, error: 'POST required' }); return }
    // Native webServer routes bypass connection/request, so reject cross-origin
    // browser posts here as well; scripted same-host API use has no Origin.
    if (req.headers?.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) { json(403, { ok: false, error: 'cross-origin scope request refused' }); return } }
      catch { json(403, { ok: false, error: 'invalid origin' }); return }
    }
    try { json(200, await dispatch(await readBody(req))) }
    catch (error) { json(400, { ok: false, error: error?.bbffRef || String(error?.message || error), ...(error?.code ? { code: error.code } : {}) }) }
  }
  return { dispatch, state, handler }
}
export function apply(ctx, config = {}) {
  const home = config.home || process.env.DSH_HOME || join(homedir(), '.dsh')
  const store = createRuleStore({ home })
  registerFamilyModule(ctx, FAMILY_DESCRIPTOR)
  const engine = createScopeEngine(ctx, { store, moduleId: FAMILY_DESCRIPTOR.id })
  engine.install()
  ctx.inject(['bbffFamily'], scope => {
    const family = scope.get('bbffFamily')
    if (family?.contract === 1 && typeof family.registerExposureAnnotator === 'function') {
      scope.effect(() => family.registerExposureAnnotator(FAMILY_DESCRIPTOR.id, input => engine.annotate(input)), 'scope:annotator')
    }
  })
  const api = createApi(ctx, store, engine)
  ctx.inject(['webServer'], scope => scope.effect(() => scope.get('webServer').register({ kind: 'exact', path: API_ROUTE, handler: api.handler }), 'scope:route'))
}
