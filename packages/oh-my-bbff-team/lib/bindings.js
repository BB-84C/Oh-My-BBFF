// Oh-My-BBFF Team — durable role bindings.
//
// A binding ties one session id to a role and an LLM route:
//   { sessionId, role, kind: 'oneshot'|'member', route, ownerId, leadId?, name?, createdAt }
//
// Bindings are written BEFORE the child exists: bbff_team_dispatch and bbff_team_hire both
// reserve the native child id, so the `agent/created` hook applies the role and route before
// the child's first step. The store is persisted so cold resume keeps role + route.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DEFAULT_TEAM_SETTINGS } from './team-settings.js'

export function createBindingStore(path, { getLimit = () => DEFAULT_TEAM_SETTINGS.bindingLimit, isProtected = () => false } = {}) {
  let loaded = false
  let loadError = null
  let bindings = {}
  let activeFormations = {}
  let retention = { evicted: 0, blocked: 0, lastEvicted: [] }
  const pendingAdmissions = new Set()
  const limitOf = () => { const value = getLimit(); return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_TEAM_SETTINGS.bindingLimit }

  function load() {
    if (loaded) return
    loaded = true
    try {
      if (path && existsSync(path)) {
        const parsed = JSON.parse(readFileSync(path, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || !parsed.bindings || typeof parsed.bindings !== 'object' || Array.isArray(parsed.bindings)) throw new Error('Role binding storage has no valid bindings object')
        for (const [id, value] of Object.entries(parsed.bindings)) if (!value || typeof value !== 'object' || Array.isArray(value) || value.sessionId !== id || typeof value.role !== 'string') throw new Error('Invalid role binding record: ' + id)
        bindings = parsed.bindings
        if (parsed?.activeFormations && typeof parsed.activeFormations === 'object' && !Array.isArray(parsed.activeFormations)) activeFormations = parsed.activeFormations
        if (parsed?.retention && typeof parsed.retention === 'object') retention = { ...retention, ...parsed.retention }
      }
    } catch (error) {
      bindings = {}
      loadError = String(error?.message || error)
      retention.lastError = loadError
    }
  }
  function assertReadable() { load(); if (loadError) throw new Error('Role binding storage is unreadable; repair it before changing managed roles: ' + loadError) }

  function persist(strict = false, admitted = new Set()) {
    assertReadable()
    const limit = limitOf()
    const ids = Object.keys(bindings)
    if (ids.length > limit) {
      const candidates = ids.filter(id => {
        if (admitted.has(id) || pendingAdmissions.has(id) || bindings[id]?.kind === 'member') return false
        try { return !isProtected(id, bindings[id]) } catch { return false }
      }).sort((a, b) => (bindings[a].createdAt || 0) - (bindings[b].createdAt || 0))
      const removed = candidates.slice(0, ids.length - limit)
      const lastEvicted = removed.map(id => ({ sessionId: id, role: bindings[id]?.role || null }))
      for (const id of removed) delete bindings[id]
      retention = { ...retention, limit, evicted: (Number(retention.evicted) || 0) + removed.length, blocked: Math.max(0, Object.keys(bindings).length - limit), lastEvicted: removed.length ? lastEvicted : retention.lastEvicted, lastEvictedAt: removed.length ? new Date().toISOString() : retention.lastEvictedAt, at: new Date().toISOString() }
    } else retention.blocked = 0
    if (!path) return
    try {
      mkdirSync(dirname(path), { recursive: true })
      const tmp = `${path}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: 1, bindings, activeFormations, retention }, null, 2), 'utf8')
      renameSync(tmp, path)
    } catch (error) { retention.lastError = String(error?.message || error); if (strict) throw error }
  }

  return {
    assertReadable,
    protect(sessionId) { pendingAdmissions.add(sessionId); return () => pendingAdmissions.delete(sessionId) },
    diagnostics() { load(); return { ...retention, failedLoad: !!loadError, complete: !loadError, loadError, limit: limitOf(), count: loadError ? null : Object.keys(bindings).length, overTarget: loadError ? null : Math.max(0, Object.keys(bindings).length - limitOf()), settingPath: 'settings.bindingLimit' } },
    applyFormation(leadId, formationId, updates) {
      assertReadable()
      const before = bindings, previousActive = activeFormations
      bindings = { ...bindings }
      activeFormations = { ...activeFormations, [leadId]: formationId }
      for (const { sessionId, ...binding } of updates) bindings[sessionId] = { ...binding, sessionId, createdAt: binding.createdAt || before[sessionId]?.createdAt || Date.now() }
      try { persist(true) } catch (error) { bindings = before; activeFormations = previousActive; throw error }
    },
    getActiveFormation(leadId) { load(); return activeFormations[leadId] || null },
    setActiveFormation(leadId, id) { assertReadable(); activeFormations[leadId] = id; persist() },
    get(sessionId) {
      load()
      return bindings[sessionId] || null
    },
    set(sessionId, binding) {
      assertReadable()
      bindings[sessionId] = { ...binding, sessionId, createdAt: binding.createdAt || Date.now() }
      persist(false, new Set([sessionId]))
      return bindings[sessionId]
    },
    delete(sessionId) {
      assertReadable()
      if (bindings[sessionId]) { delete bindings[sessionId]; persist() }
    },
    all() {
      load()
      return Object.values(bindings)
    },
  }
}
