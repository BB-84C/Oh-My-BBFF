/** Package-owned identity. Static manifest dependency lets native HMR refresh every derived export. */
import manifest from '../package.json' with { type: 'json' }
export const PACKAGE = Object.freeze(manifest)
export const MODULE_ID = PACKAGE.bbff.id
export const PACKAGE_NAME = PACKAGE.name
export const MODULE_TITLE = PACKAGE.bbff.title
export const VERSION = PACKAGE.version
export const API_BASE = '/' + PACKAGE_NAME + '/api'
export const SETTINGS_SECTION = MODULE_ID + '-settings'
