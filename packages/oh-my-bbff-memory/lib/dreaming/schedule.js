/** Native Schedule is the sole wake clock; Memory owns only its task identity and review state. */
import { RESIDENT_TITLE } from './state.js'
import { msg } from '../host-ref.js'
import { localeError } from '../locale-message.js'
export const SCHEDULE_PROMPT = 'Review memory under the Dreaming Resident contract. Call dream_status first; a no-change commit is a normal outcome. If the seven dream_* tools are unavailable, stop without using any other tool or changing any memory.'
/** Stable code reported while the native service is composed but not active yet. */
export const SCHEDULE_PENDING = 'native-schedule-service-pending'
const targetId = task => task?.target?.kind !== 'new' ? task?.target?.sessionId : null
export function scheduleTiming(lastWakeAt, intervalHours) {
  // Native RRULE has minute precision. The shipped six-hour interval is exact.
  const anchor = new Date(Math.floor(lastWakeAt / 1000) * 1000).toISOString().replace(/[-:]/g, '').replace('.000', '')
  return { kind: 'rrule', rrule: `DTSTART:${anchor}\nRRULE:FREQ=MINUTELY;INTERVAL=${Math.max(1, Math.round(intervalHours * 60))}` }
}
/** Source kind is verified separately; parse only the documented native reminder envelope, not arbitrary prompt text. */
export function isResidentDelivery(message, id) {
  if (!id || message?.source?.kind !== 'schedule') return false
  const text = (message.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n'), lines = text.split('\n')
  try {
    if (lines[0] === '[SCHEDULE REMINDER]') return JSON.parse(lines.find(line => line.startsWith('schedule_id_json: '))?.slice(18)) === id
    if (lines[0] === '[SCHEDULE REMINDER BATCH]') return JSON.parse(lines.find(line => line.startsWith('reminders_json: '))?.slice(16)).some(row => row.schedule_id === id)
  } catch {}
  return false
}
const owned = (rows, sessionId) => rows.filter(row => targetId(row) === sessionId && row.title === RESIDENT_TITLE)
/** Deterministic winner so two concurrent generations converge on one task. */
const winnerOf = rows => [...rows].sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')) || String(left.id).localeCompare(String(right.id)))[0] || null
export function createResidentSchedule({ getSchedule, kernel, ensureSession, now = Date.now }) {
  let queue = Promise.resolve(), error = null, closed = false, adopted = null
  const serial = fn => { const value = queue.then(fn, fn);queue = value.catch(() => {});return value }
  const stop = () => { if (closed) throw new Error('Resident schedule adapter is disposed.') }
  const closedView = () => ({ available: false, taskId: null, nextDueAt: null, error: 'resident-schedule-disposed', source: 'native-schedule' })
  /**
   * The native service, or `null` while it is absent. Absence is a normal state, not a
   * failure: the host injects `schedule` optionally and calls `configure()` again once the
   * service becomes active, so the adapter reports "pending" instead of throwing.
   */
  const api = () => { const value = getSchedule();return value?.create && value?.edit && value?.view && value?.run ? value : null }
  const pendingView = (taskId = null) => ({ available: false, pending: true, taskId, nextDueAt: null, error: SCHEDULE_PENDING, reason: msg('native.scheduleUnavailable'), source: 'native-schedule' })
  async function view() {
    if (closed) return closedView()
    const id = kernel.readState().state.scheduleTaskId, schedule = api()
    if (!schedule) return pendingView(id)
    if (!id) return { available: false, taskId: null, nextDueAt: null, error }
    try { const task = await schedule.view({ id });if (closed) return closedView();if (task.code) return { available: false, taskId: id, nextDueAt: null, error: task.code };return { available: true, taskId: task.id, task, status: task.status, nextDueAt: task.status === 'active' ? Date.parse(task.scheduledAt) : null, scheduledAt: task.scheduledAt, source: 'native-schedule', error: null } }
    catch (failure) { return { available: false, taskId: id, nextDueAt: null, error: String(failure.message || failure) } }
  }
  /** Delete duplicate Resident tasks (same title + same target) and return the deterministic winner. */
  async function reconcile(schedule, sessionId, fallback) {
    if (!schedule.catalog || !schedule.edit) return fallback
    const rows = owned(await schedule.catalog(), sessionId)
    stop()
    if (!rows.length) return fallback
    const winner = winnerOf(rows)
    for (const row of rows) if (row.id !== winner.id) { try { await schedule.edit({ id: row.id, action: 'delete' });stop() } catch (failure) { if (!closed) error = 'duplicate-resident-schedule-delete-failed: ' + String(failure.message || failure) } }
    return winner
  }
  async function configure() { return serial(async () => {
    if (closed) return closedView()
    try {
      stop()
      const settings = kernel.settings(), state = kernel.readState().state
      if (!settings.dreamEnabled && !state.scheduleTaskId) return view()
      const schedule = api()
      // Composed later or reloading: leave the identity untouched and adopt on the next call.
      if (!schedule) { adopted = null;return view() }
      if (state.stateUnavailable) throw new Error('Resident state unavailable; native schedule identity cannot be migrated.')
      let task = state.scheduleTaskId ? await schedule.view({ id: state.scheduleTaskId }) : null
      stop()
      if (task?.code) throw new Error('The Resident native schedule was removed; explicit operator recovery is required, not silent recreation.')
      if (!task && !settings.dreamEnabled) return view()
      const resident = await ensureSession();stop()
      const sessionId = String(resident.agent.id)
      let created = false
      if (!task) {
        const matching = schedule.catalog ? owned(await schedule.catalog(), sessionId) : []
        stop()
        if (matching.length > 1) { task = await reconcile(schedule, sessionId, null);stop() } else task = matching[0] || null
      }
      const timing = scheduleTiming(state.lastWakeAt, settings.wakeIntervalHours), active = settings.dreamEnabled && settings.dreamAutoWake
      if (!task) { task = await schedule.create({ title: RESIDENT_TITLE, prompt: SCHEDULE_PROMPT, timing, target: { kind: 'session', sessionId } });created = true;stop() }
      // A concurrent generation may have created the same task between our catalog read and create.
      task = (await reconcile(schedule, sessionId, task)) || task;stop()
      const patch = {}, previous = state.scheduleIntervalHours
      if (targetId(task) !== sessionId) { if (!(kernel.readState().state.previousResidentSessionIds || []).includes(targetId(task))) throw new Error('Resident schedule target changed; refusing to replace the stored Resident identity.');patch.target = { kind: 'session', sessionId } }
      if (previous !== undefined && previous !== settings.wakeIntervalHours) patch.timing = timing
      if (task.title !== RESIDENT_TITLE) patch.title = RESIDENT_TITLE
      if ((task.status === 'active') !== active) patch.active = active
      if (Object.keys(patch).length) { task = await schedule.edit({ id: task.id, action: 'update', patch, expectedUpdatedAt: task.updatedAt ?? null });stop();if (task.code) throw new Error(task.code) }
      stop()
      kernel.write({ ...kernel.readState().state, scheduleTaskId: task.id, scheduleIntervalHours: settings.wakeIntervalHours })
      error = null
      adopted = schedule
      // Existing native tasks retain their committed overdue occurrence and handle downtime themselves.
      // A migrated clock has no old native occurrence; deliver its latest missed wake once, through run-now.
      if (created && active && now() - state.lastWakeAt >= settings.wakeIntervalHours * 3600000) { stop();await schedule.run({ id: task.id }) }
      return view()
    } catch (failure) { if (!closed) error = String(failure.message || failure);throw failure }
  }) }
  async function run() {
    stop();await queue;stop()
    const state = kernel.readState().state
    if (!state.scheduleTaskId) { await configure();stop() }
    const id = kernel.readState().state.scheduleTaskId, schedule = api()
    if (!schedule) throw localeError(msg('error.nativeScheduleUnavailable'))
    if (!id) throw localeError(msg('error.nativeScheduleNotAdopted'))
    stop();return schedule.run({ id })
  }
  return { view, configure, run, /** True when this exact service instance is the one the stored task was adopted against. */ adopted: value => !!value && adopted === value, dispose() { closed = true }, get closed() { return closed } }
}
