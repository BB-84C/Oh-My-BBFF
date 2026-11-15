/** Optional v1.4 inventory bridge. No resident factories or model calls here. */
import { CONTRACT_VERSION, FAMILY_SERVICE } from '../bbff-contract.js'
import { MODULE_ID } from '../identity.js'

export function registerDreamingExposure(ctx, resident) {
  if (!resident || typeof ctx?.inject !== 'function') return
  return ctx.inject([FAMILY_SERVICE], scope => {
    const family = scope.get(FAMILY_SERVICE)
    // v1.3 and standalone memory hosts remain fully supported.
    if (family?.contract !== CONTRACT_VERSION || typeof family.registerExposureContributor !== 'function') return
    scope.effect(() => family.registerExposureContributor(MODULE_ID, input => resident.exposureFor(input)), 'bbff:memory:exposure')
  })
}
