/**
 * oh-my-bbff — the family meta bundle.
 *
 * This package is a profile bundle, not a plugin: it has no runtime code. All of its effect is
 * `cordis.patch.yml`, which inserts the five family plugin rows, and its `dependencies`, which
 * pin the five packages to one release. Keep this module empty so loading it can never have a
 * side effect.
 */
export {};
