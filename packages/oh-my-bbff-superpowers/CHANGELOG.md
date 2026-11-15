# Changelog — Oh-My-BBFF Superpowers

## 1.0.0 — first public release

- First public release of Oh-My-BBFF Superpowers. Family-wide version reset to 1.0.0. The eight skills are unchanged from 0.2.0 and 0.2.1.
- Requires DeepSeek Harness 0.2.2 or newer (Node.js 24.9 or newer for the package's own checks).
- The user-facing README was rewritten. The development log below is preserved unchanged. The MIT notice for adapted upstream skill text is in `THIRD_PARTY_NOTICES.md`.
- `CHANGELOG.md` is new. The former README is this history, moved verbatim.

# Oh-My-BBFF Superpowers

Eight on-demand skills for DeepSeek Harness: `bbff-team-leading`,
`bbff-team-member`, `brainstorming`, `writing-plans`, `independent-review`,
`test-driven-development`, `systematic-debugging`, and
`verification-before-completion`.

This content bundle registers one native skill provider over
`skills/<name>/SKILL.md`. It adds no tools, cards, settings, client code, or
family-root registration. The BBFF SDK makes both family registration halves
optional; the bundle works without Widgets or Team.

Descriptions appear in the native catalog. Bodies and adjacent references load
on demand; the provider rereads each skill file on every load. Editing installed
body text takes effect on the next load. Catalog metadata is cached by DSH;
metadata or inventory changes require provider reload. User-authored text is
passed through unchanged; the no-CJK check applies only to shipped defaults.

The bundle declares no dependencies. At runtime `@deepseek-ai/dsh-skill` and
`yaml` resolve from the DeepSeek Harness installation, which supplies its own
packages to every profile.

## Version 0.2.0 — DSH 0.2.2 and Team 0.10.0

Requires DSH `>=0.2.2-rc.2` and Node.js `>=24.9`. The skills now use named
subagents, the per-root Use Agent Teams switch, inbox-only waits, named task
owners, next-request role/model assignment, and `dsh-doc` in Creator mode.
The skill provider keeps the native layered registry contract; it adds eight
skills without replacing `dsh-doc` or nearer-scope/user skills. No SDK copy is
needed because this bundle has no SDK consumer or family contribution.

## Development checks

Checks run offline against an existing DeepSeek Harness installation, discovered
through normal package resolution or its CLI directory on `PATH`.
`DSH_RUNTIME_ROOT` is an optional override, not a prerequisite. Set
`BBFF_SUPERPOWERS_TEST_ARTIFACTS` to an absolute task directory under the
workspace's `.dsh/artifacts/<task>/` before running tests, then run:

```sh
npm test
npm run check-package
node --import ./scripts/dsh-runtime.mjs scripts/offline-proof.mjs --release
```

The draft gate checks every current skill and supporting Markdown file, even
when the eight-skill set is unfinished. Tests create and remove throwaway
fixtures only under that task's `.dsh/artifacts/` tree, never `skills/` or
the system temporary directory. The offline proof mounts the bundle in an
isolated registry from that installation and loads every skill.

The shipped resolver borrows the installed registry and YAML parser read-only;
it does not install or configure anything. If no installed DSH can be found,
`prepack` prints an explicit SKIPPED warning, leaves the manifest untouched,
and does not claim release verification; other checks fail with setup guidance.
Release packaging with an installed runtime runs the stricter
8-skill gate with `npm pack` through `prepack`, generating
`payload-manifest.json` (sorted file paths, byte counts and SHA256 hashes;
the manifest excludes its own hash). Use `--verify-manifest` with the gate to
check it against current bytes. The content checks cover YAML metadata,
package-contained relative Markdown/HTML links, and English-default authoring.
They do not replace semantic review of the skills.

Install only after content review and explicit authorization through the DSH
bundle installer. No install or process lifecycle action is part of these
checks.
