/** Compatibility wrapper only: the family owns the sole ancestry resolver. */
export function createRootResolver({ get } = {}) {
  return { async resolve(id) {
    const family = get('bbffFamily')
    if (family?.contract === 1 && typeof family.resolveRoot === 'function') return family.resolveRoot(id)
    return { rootSessionId: id, cwd: null, resolved: false, reason: 'Shared ROOT resolver unavailable' }
  } }
}
