/**
 * Native Schedule adoption, wired as an *optional* Cordis dependency.
 *
 * `schedule` must not be a required entry in this plugin's `inject`: a profile that
 * composes no native schedule would then never activate Memory at all. It is injected
 * optionally instead — the child fiber below activates as soon as the service is
 * active, which covers a schedule that is composed *after* Memory (the fresh-install
 * load order), and it re-runs after the service reloads, which re-adopts the stored
 * task against the new instance. The adapter itself never creates a second task: it
 * views the stored task id first and reconciles duplicates deterministically.
 *
 * Disposal is owned by the parent fiber (the child fiber is registered as one of its
 * effects), so unloading Memory also stops further adoption.
 */
export function adoptNativeSchedule({ ctx, resident, warn = () => {} }) {
  if (typeof ctx?.inject !== 'function' || typeof resident?.adoptSchedule !== 'function') return null
  const adopt = () => {
    try {
      const pending = resident.adoptSchedule()
      if (pending && typeof pending.catch === 'function') pending.catch(error => warn('Native Resident schedule adoption failed: ' + String(error?.message || error)))
    } catch (error) { warn('Native Resident schedule adoption failed: ' + String(error?.message || error)) }
  }
  try { return ctx.inject(['schedule'], adopt) }
  catch (error) { warn('Optional native schedule injection is unavailable: ' + String(error?.message || error));return null }
}
