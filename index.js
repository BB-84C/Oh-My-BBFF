// oh-my-bbff — the repository-root DSH bundle entry point. A bundle has no runtime code of its own: the
// package declares dsh.bundle.patch, and the loader applies the rows that cordis.patch.yml inserts.
// Keep this file and cordis.patch.yml in sync with packages/oh-my-bbff, which ships the same bundle
// on npm. scripts/check-root-bundle.mjs fails when the two disagree.
export {};
