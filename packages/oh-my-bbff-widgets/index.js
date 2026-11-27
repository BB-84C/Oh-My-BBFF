/**
 * Goal Board — host half.
 *
 * One place for the human side of a session's long-running work:
 *  - the persisted `/goal` state (create, edit, pause, resume, complete, clear),
 *  - the agent's own `todo_write` list (read-only here), and
 *  - a private human checklist that is never injected into a prompt; the model can
 *    read it only through `read_user_notes`, when the user explicitly asks.
 *
 * Goal state lives in the owning session log through `ctx.goals`; the agent todo
 * list is the `todos` session projection (with a durable-log fold as fallback);
 * human todos are this plugin's own JSON, keyed nowhere near the session.
 *
 * @module oh-my-bbff-widgets
 */
import { promises as fsp } from 'node:fs'
import ROOT_PACKAGE from './package.json' with {type:'json'}
import { join } from 'node:path'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createScope, scopeOf, scopeParentOf } from '@deepseek-ai/dsh-scope'
import { createExposureEngine, HIDE_PROVIDER } from './lib/exposure.js'
import { createFamilyRegistry, familyPayload, FAMILY_DESCRIPTOR } from './lib/family.js'
import { createIncrementalViews } from './lib/incremental-views.js'
import { createHostView, readLiveRuntime } from './lib/host-view.js'
import { createTeamSource } from './lib/team-source.js'
import { decorateExposure } from './lib/presentation.js'
import { createCatalogProvider } from './lib/catalog.js'
import { createNativeCatalogDiscovery } from './lib/catalog-discovery.js'
import { createRootResolver } from './lib/root-session.js'
import { createRootSettingsStore } from './lib/settings.js'
import { readGoalDefaults } from './lib/goal-defaults.js'
import { sessionHeaderFacts, sessionEventFacts, resourceAddress } from './lib/dsh-adapter.js'
import { createLocaleSource } from './lib/locales.js'
import { wmsg as msg } from './lib/locale-keys.js'

const ROUTE = '/oh-my-bbff-widgets/v6/api'
// 0.14.0: the family root advertises its own package identity to {action:'family'}.
const ROOT_TOOLS = Object.freeze(['read_user_notes'])
function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export const name = ROOT_PACKAGE.name

export function apply(ctx) {
  const home = () => process.env.DSH_HOME || join(homedir(), '.dsh')
  const dataDir = join(home(), ROOT_PACKAGE.name)
  const get = service => { try { return ctx.get(service) } catch { return undefined } }
  const settingsStore=createRootSettingsStore({dir:dataDir,root:{id:ROOT_PACKAGE.bbff.id,packageName:ROOT_PACKAGE.name,version:ROOT_PACKAGE.version,title:ROOT_PACKAGE.bbff.title,apiBase:ROUTE}})
  ctx.effect?.(()=>()=>settingsStore.flush())
  let family
  const rootResolver = createRootResolver({getSessionQuery:()=>get('sessionQuery'),getPersistence:()=>get('sessionPersistence'),getAgents:()=>get('agents')})
  const discovery = createNativeCatalogDiscovery(ctx, {
    scopeAPI:{createScope,scopeOf,scopeParentOf},getModules:()=>family?.list()||[],
    readContributions:async agent=>{
      const root=await rootResolver.resolveRoot(agent.id)
      return family.collectExposureContributions({sessionId:agent.id,rootSessionId:root.rootSessionId,...(root.cwd?{cwd:root.cwd}:{})})
    },
  })
  const catalogProvider=createCatalogProvider({dir:dataDir,getModules:()=>family?.list()||[],readDiscovery:discovery})
  // v1.5 family root: static declarations and field warnings land in this registry, which is
  // also provided as the bffFamily Cordis service. The root never scans or
  // names modules itself; amily.list() is the only truth.
  family = createFamilyRegistry({
    root: { id:ROOT_PACKAGE.bbff.id,packageName:ROOT_PACKAGE.name,version:ROOT_PACKAGE.version,title:ROOT_PACKAGE.bbff.title,apiBase:ROUTE,tools:ROOT_TOOLS,skillMaskProviders:[HIDE_PROVIDER] },
    logger: ctx.logger,catalog:()=>catalogProvider.catalog,resolveRoot:rootResolver.resolveRoot,
    onDeclarationsChange:modules=>catalogProvider.declarationsChanged(modules),
  })
  family.register({...FAMILY_DESCRIPTOR,apiBase:ROUTE,locale:{dir:'locale'},tools:ROOT_TOOLS,toolTraits:Object.fromEntries(ROOT_TOOLS.map(tool=>[tool,{effect:'read'}])),skillMaskProviders:[HIDE_PROVIDER],permissionLayer:{title:msg('descriptor.permissionLayer.title'),settingsSectionId:'general'},ui:{settings:true}})
  if (typeof ctx.provide === 'function') {
    try { ctx.provide('bbffFamily', family) } catch (error) {
      try { ctx.logger?.warn?.('oh-my-bbff-widgets: provide bbffFamily failed', error) } catch {}
    }
  }

  const locales = createLocaleSource({ home, getModules: () => family?.list() || [], logger: ctx.logger })
  const humanPath = join(dataDir, 'human-todos.json')
  for(const [event,reason] of [['tools/change','tools'],['mcp-manager/status','mcp'],['loader/volatile-update','mcp'],['agent-preset/selected','presets'],['app-boot/config-reload','presets'],['plugin-manager/changed','presets'],['hmr/reload','presets'],['skills/change','skills'],['system-prompt/change','presets'],['loader/config-update','presets'],['loader/entry-init','presets'],['loader/partial-dispose','presets'],['domain/changed','projects']]){
    ctx.on?.(event,()=>{catalogProvider.invalidate(reason)})
  }
  // Agent lifecycle cannot change tools, presets or workspace skills: the live view is read per
  // session on demand, so notify listeners without scheduling a full discovery rescan. DSH loads
  // and unloads an agent about once per turn, which made a rescan here continuous.
  for(const event of ['agent/created','agent/disposed'])ctx.on?.(event,()=>{catalogProvider.touch('agents')})
  ctx.effect?.(()=>()=>catalogProvider.dispose())
  catalogProvider.start()

  let human = { items: [], updatedAt: 0 }
  let loaded = false,loadingHuman,humanReadError,humanWriteQueue=Promise.resolve()
  let hostView
  let goalDefaultsCache=readGoalDefaults(ctx)
  // Team membership/classification is Team-owned (bbffTeam.members); when the
  // service is absent every child falls back to outsourced/unbound with native names.
  const teamSource=createTeamSource(ctx,{readTeam:(rootAgent,signal)=>{const service=get('bbffTeam');return service?.members?service.members(rootAgent,{...(signal?{signal}:{})}):{available:false,members:[]}}})
  const views=createIncrementalViews(ctx,{dir:join(dataDir,'session-views'),getSettings:settingsStore.current,readRuntime:id=>readLiveRuntime(ctx,id,{teamSource}),onChange:id=>hostView?.changed(id)})
  hostView=createHostView(ctx,{views,settingsStore,family,catalogProvider,teamSource,coalesceMs:1000,getHuman:()=>human.items.slice(),humanReady:()=>loaded&&!humanReadError,getGoalDefaults:()=>goalDefaultsCache})
  views.start()
  ctx.on?.('loader/config-update',()=>{goalDefaultsCache=readGoalDefaults(ctx)})
  ctx.effect?.(()=>()=>{hostView.dispose();return views.dispose()})

  async function loadHuman() {
    if(loaded)return
    if(loadingHuman)return loadingHuman
    loadingHuman=(async()=>{
      try{
        const parsed=JSON.parse(await fsp.readFile(humanPath,'utf8'))
        if(!parsed||!Array.isArray(parsed.items))throw new Error('Invalid notes document')
        human={items:parsed.items.filter(item=>item&&typeof item.text==='string').map(item=>({id:String(item.id||randomId()),text:item.text,done:!!item.done,createdAt:Number(item.createdAt)||Date.now(),updatedAt:Number(item.updatedAt)||Date.now()})),updatedAt:Number(parsed.updatedAt)||0}
      }catch(error){if(error.code!=='ENOENT')humanReadError=msg('error.notes-unreadable')}
      finally{loaded=true;loadingHuman=undefined}
    })()
    return loadingHuman
  }

  let persistChain = Promise.resolve()
  function persistHuman() {
    human.updatedAt = Date.now()
    const text=JSON.stringify(human,null,2)
    const run=persistChain.then(async()=>{
      await fsp.mkdir(dataDir,{recursive:true})
      const tmp=humanPath+'.'+randomId()+'.tmp'
      await fsp.writeFile(tmp,text,'utf8')
      await fsp.rename(tmp,humanPath)
    })
    persistChain=run.catch(()=>{})
    return run
  }

  function services() {
    return {
      webServer: ctx.get('webServer'),
      agents: ctx.get('agents'),
      goals: ctx.get('goals'),
      sessionQuery: ctx.get('sessionQuery'),
      sessionProjections: ctx.get('sessionProjections'),
    }
  }

  // 0.13.0 host engine: per-root-session exposure controls for the three cards
  // (exposed skills / tools / connected MCP servers). Kept in lib/exposure.js so the
  // route stays a thin dispatcher and the engine is testable against stub contexts.
  const exposure = createExposureEngine(ctx, { home:home(),logger:ctx.logger,rootResolver,catalogProvider,getSettings:settingsStore.current,settingsReady:settingsStore.read,readSessionMeta:id=>hostView.sessionMeta(id),scopeAPI:{scopeOf,scopeParentOf} })
  void settingsStore.read()
  exposure.install()

  function liveAgent(sessionId) {
    const { agents } = services()
    if (!agents || typeof agents.get !== 'function') return undefined
    return agents.get(sessionId)
  }

  function goalView(agent,strict=false) {
    const { goals } = services()
    if (!goals || !agent || typeof goals.get !== 'function') return null
    try {
      const view = goals.get(agent)
      if (!view) return null
      return {
        id: String(view.id),
        revision: Number(view.revision) || 0,
        objective: String(view.objective || ''),
        phase: String(view.phase || 'active'),
        roundsStarted: Number(view.roundsStarted) || 0,
        maxGoalRounds: Number(view.maxGoalRounds) || 0,
        activation: String(view.activation || 'disarmed'),
        blockedReason: view.blockedReason || null,
        createdAt: Number(view.createdAt) || 0,
        updatedAt: Number(view.updatedAt) || 0,
      }
    } catch(error) {
      if(strict)throw error
      return null
    }
  }

  // Cache-only response. All log work belongs to event-driven materialized views.
  const stateOf=sessionId=>hostView.state(sessionId)

  async function mutateGoal(sessionId, body) {
    await settingsStore.read()
    const limit=settingsStore.current().goalObjectiveMaxLength
    const invalid=ref=>Object.assign(new Error('bbff-message'),{bbffRef:ref})
    const objectiveText=value=>{
      const text=String(value??'').trim()
      if(!text)throw invalid(msg('error.objective-empty'))
      if(text.length>limit)throw invalid(msg('error.objective-too-long',{limit}))
      return text
    }
    const { goals } = services()
    const agent = liveAgent(sessionId)
    if (!goals) return { ok: false, error: msg('error.goal-service-unavailable') }
    if (!agent) return { ok: false, error: msg('error.session-not-running') }
    const op = String(body.op || '')
    const current = goalView(agent)
    const ref = current ? { id: current.id, revision: current.revision } : null
    try {
      if (op === 'create') {
        const objective = objectiveText(body.objective)
        if (!objective) return { ok: false, error: msg('error.objective-empty') }
        const maxGoalRounds = Number(body.maxGoalRounds) || undefined
        goals.create(agent, maxGoalRounds ? { objective, maxGoalRounds } : { objective })
      } else if (op === 'edit') {
        if (!ref) return { ok: false, error: msg('error.no-goal') }
        const request = {}
        if (typeof body.objective === 'string' && body.objective.trim() !== current.objective) {
          const objective = objectiveText(body.objective)
          if (!objective) return { ok: false, error: msg('error.objective-empty') }
          request.objective = objective
        }
        const maxGoalRounds = Number(body.maxGoalRounds)
        if (Number.isSafeInteger(maxGoalRounds) && maxGoalRounds > 0 && maxGoalRounds !== current.maxGoalRounds) request.maxGoalRounds = maxGoalRounds
        if (!Object.keys(request).length) return stateOf(sessionId)
        goals.edit(agent, ref, request)
      } else {
        if (!ref) return { ok: false, error: msg('error.no-goal') }
        if (op === 'pause') goals.pause(agent, ref)
        else if (op === 'resume') goals.resume(agent, ref)
        else if (op === 'complete') goals.complete(agent, ref)
        else if (op === 'clear') goals.clear(agent, ref)
        else return { ok: false, error: msg('error.unknown-operation', { operation: op }) }
      }
    } catch (error) {
      return { ok: false, error: error && error.bbffRef ? error.bbffRef : String(error && error.message ? error.message : error) }
    }
    return stateOf(sessionId)
  }

  function mutateHuman(body){const run=humanWriteQueue.then(()=>mutateHumanNow(body));humanWriteQueue=run.catch(()=>{});return run}
  async function mutateHumanNow(body) {
    await loadHuman()
    if(humanReadError)return {ok:false,error:humanReadError}
    const prior=JSON.parse(JSON.stringify(human))
    await settingsStore.read()
    const limits=settingsStore.current()
    const textValue=String(body.text??'').trim()
    const op = String(body.op || '')
    if((op==='add'||op==='update')&&textValue.length>limits.noteMaxLength)return {ok:false,error:msg('error.note-too-long',{limit:limits.noteMaxLength})}
    if (op === 'list') return { ok: true, humanTodos: human.items.slice() }
    if (op === 'add') {
      const text = textValue
      if (!text) return { ok: false, error: msg('error.note-empty') }
      if (human.items.length >= limits.notesMaxItems) return { ok:false,error:msg('error.notes-limit',{limit:limits.notesMaxItems}) }
      human.items.push({ id: randomId(), text, done: false, createdAt: Date.now(), updatedAt: Date.now() })
    } else if (op === 'toggle') {
      const item = human.items.find((entry) => entry.id === String(body.id))
      if (!item) return { ok: false, error: msg('error.note-missing') }
      item.done = body.done === undefined ? !item.done : !!body.done
      item.updatedAt = Date.now()
    } else if (op === 'update') {
      const item = human.items.find((entry) => entry.id === String(body.id))
      if (!item) return { ok: false, error: msg('error.note-missing') }
      const text = textValue
      if (!text) return { ok: false, error: msg('error.note-empty') }
      item.text = text
      item.updatedAt = Date.now()
    } else if (op === 'reorder') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
      const pending = new Map(human.items.map((item) => [item.id, item]))
      const next = []
      for (const id of ids) {
        const item = pending.get(id)
        if (!item) continue
        next.push(item)
        pending.delete(id)
      }
      for (const item of human.items) {
        if (pending.has(item.id)) { next.push(item); pending.delete(item.id) }
      }
      human.items = next
    } else if (op === 'remove') {
      human.items = human.items.filter((entry) => entry.id !== String(body.id))
    } else if (op === 'clearDone') {
      human.items = human.items.filter((entry) => !entry.done)
    } else if (op === 'clearAll') {
      human.items = []
    } else {
      return { ok: false, error: msg('error.unknown-operation', { operation: op }) }
    }
    try{await persistHuman()}catch{human=prior;return {ok:false,error:msg('error.note-save-failed')}}
    return { ok: true, humanTodos: human.items.slice() }
  }

  function sendJson(res, value) {
    sendJsonStatus(res, 200, value)
  }

  function sendJsonStatus(res, status, value) {
    try {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    } catch { try { res.writeHead(500); res.end('{}') } catch {} }
  }

  async function readBody(req) {
    if (req.body && typeof req.body === 'object') return req.body
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw) return {}
    try { return JSON.parse(raw) } catch { return {} }
  }

  /**
   * Replace a same-path exact route a previous plugin version left behind.
   * `webServer.register` does not bind its disposer to the calling fiber, so an
   * upgrade that only used `register` would keep serving the old handler.
   */
  function reclaimRoute(server, route) {
    try {
      const table = server.exact
      if (!table || typeof table.get !== 'function' || typeof table.set !== 'function') return null
      if (table.get(route.path) === undefined) return null
      table.set(route.path, route)
      try { ctx.logger?.warn?.(`oh-my-bbff-widgets: reclaimed stale route ${route.path}`) } catch {}
      return () => { if (table.get(route.path) === route) table.delete(route.path) }
    } catch (error) {
      try { ctx.logger?.warn?.('oh-my-bbff-widgets: stale route reclaim failed', error) } catch {}
      return null
    }
  }

  const { webServer } = services()
  if (webServer && typeof webServer.register === 'function') {
    const routeDefinition = {
      kind: 'exact',
      path: ROUTE,
      handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const action = String((body && body.action) || 'state')
            // 0.20.0 — UI dictionaries: every family member's locale/*.json plus the user
            // directory. The client registers them with DSH; the host never picks a language.
            if (action === 'locales') {
              sendJson(res, await locales.read())
              return
            }
            if (action === 'locales-template') {
              const result = await locales.writeTemplate()
              sendJsonStatus(res, result.ok ? 200 : 500, result)
              return
            }
            // 0.14.0 — family diagnostics (registered modules, no session needed).
            if (action === 'family') {
              sendJson(res, familyPayload(family))
              return
            }
            if (action === 'settings') {
              sendJson(res,await settingsStore.read())
              return
            }
            if (action === 'settings-update' || action === 'settings-reset') {
              const result=action==='settings-reset'?await settingsStore.reset(body.revision):await settingsStore.update(body.patch,body.revision)
              const {status,...payload}=result
              sendJsonStatus(res,status||200,payload)
              return
            }
            if (action === 'catalog') {
              sendJson(res,{ok:true,catalog:catalogProvider.catalog.snapshot(body.cwd?{cwd:body.cwd,transient:true}:{})})
              return
            }
            if (action === 'catalog-forget') {
              sendJson(res,await catalogProvider.catalog.forget(body.kind,body.name))
              return
            }
            if (action === 'resource-address') {
              sendJson(res,resourceAddress(body.resource))
              return
            }
            if (action === 'human') {
              sendJson(res, await mutateHuman(body))
              return
            }
            const sessionId = String(body.sessionId || '')
            // 0.13.0 — exposure cards (POST {action:'exposure'|'exposure-toggle', sessionId, kind?, name?, enabled?})
            if (action === 'exposure' || action === 'exposure-toggle') {
              if (!sessionId) {
                sendJsonStatus(res, 400, { ok: false, error: msg('error.session-required') })
                return
              }
              const result = action === 'exposure'
                ? await exposure.inventory(sessionId, { cold: body.view === 'cold' })
                : await exposure.toggle({ sessionId, kind: body.kind, name: body.name, enabled: body.enabled })
              const status = Number(result && result.status) || 200
              const payload = { ...decorateExposure(result,settingsStore.current()) }
              delete payload.status
              sendJsonStatus(res, status, payload)
              return
            }
            if (!['state','goal'].includes(action)) { sendJsonStatus(res,404,{ok:false,error:msg('error.unsupported-action',{action})});return }
            if (!sessionId) { sendJson(res, { ok: false, error: msg('error.session-required') }); return }
            if (action === 'goal') {
              sendJson(res, await mutateGoal(sessionId, body))
              return
            }
            sendJson(res, await stateOf(sessionId))
          } catch (error) {
            sendJson(res, { ok: false, error: String(error && error.message ? error.message : error) })
          }
        },
    }
    let disposeRoute = null
    try {
      disposeRoute = webServer.register(routeDefinition)
    } catch (error) {
      const message = String(error && error.message ? error.message : error)
      if (!/duplicate exact route/i.test(message)) throw error
      disposeRoute = reclaimRoute(webServer, routeDefinition)
    }
    if (typeof disposeRoute === 'function') {
      try { ctx.effect(() => disposeRoute) } catch { try { ctx.on?.('dispose', disposeRoute) } catch {} }
    }
  }

  /** Render the user-notes tool result for the model. */
  function notesText(value) {
    if (value.notes.length === 0) return 'The user notes list is empty.'
    const lines = value.notes.map((note, index) => `${index + 1}. ${note.done ? '[done]' : '[open]'} ${note.text}`)
    return `User notes (${value.counts.total} total, ${value.counts.open} open):\n${lines.join('\n')}`
  }

  const tools = ctx.get('tools')
  if (tools && typeof tools.register === 'function') {
    try {
      tools.register(defineTool({
        name: 'read_user_notes',
        description:
          'Read the user\'s global notes (the "笔记" panel of the oh-my-BBFF widget). ' +
          'Call this ONLY when the user explicitly asks to read their notes or to recall something ' +
          'they saved there. The notes are personal; do not call this tool proactively.',
        parameters: {
          includeDone: {
            type: 'boolean',
            description: 'Include notes already marked done. Defaults to true.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              notes: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true },
                    text: { type: 'string', required: true },
                    done: { type: 'boolean', required: true },
                    updatedAt: { type: 'integer', required: true },
                  },
                },
              },
              counts: {
                type: 'object',
                additionalProperties: false,
                required: true,
                properties: {
                  total: { type: 'integer', required: true },
                  open: { type: 'integer', required: true },
                },
              },
            },
          },
          render: (_args, value) => [{ type: 'text', text: notesText(value) }],
        },
        execute: async (args) => {
          await humanWriteQueue
          await loadHuman()
          if(humanReadError)throw new Error(humanReadError)
          const includeDone = !args || args.includeDone !== false
          const items = human.items.filter((item) => includeDone || !item.done)
          return {
            notes: items.map((item) => ({
              id: item.id,
              text: item.text,
              done: item.done,
              updatedAt: Number(item.updatedAt) || 0,
            })),
            counts: {
              total: human.items.length,
              open: human.items.filter((item) => !item.done).length,
            },
          }
        },
        presentCall: () => ({ card: 'generic', title: 'Read user notes', kind: 'other', rawInput: {} }),
      }))
    } catch {}
  }
}

export default { name, apply }
