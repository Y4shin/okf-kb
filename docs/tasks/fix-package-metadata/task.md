---
kind: task
type: feature
slug: fix-package-metadata
title: Add files/prepublishOnly/license/publishConfig to all public packages
map: npm-publishing
status: done
blocked_by:
  - split-daemon-binary
slices:
  - add-publish-metadata
---

## User-visible outcome

Every public package (`@okf-kb/{core,protocol,fs,daemon,cli,auth}`)
publishes *only* its `dist/` (not `src/`, `tests/`, `tsconfig.json`) and
is always built before pack. Each has a `license` and
`publishConfig: { access: public }`. `npm publish --dry-run` for each
shows a clean tarball (dist + package.json + README only).

This fixes the **current packaging bug**: `dist/` is gitignored and there
is no `files` field, so `npm publish` today ships source-only tarballs
that throw `ERR_MODULE_NOT_FOUND` on import.

## User story

As a consumer, `npm i @okf-kb/core` installs working compiled JS. As a
maintainer, I can't accidentally publish a broken or leaky tarball.

## Scope boundaries

- **In scope**: add `"files": ["dist"]` to each public package.json; add
  `"prepublishOnly": "npm run build"`; add `"license": "MIT"` (confirm
  with owner); add `"publishConfig": { "access": "public" }`.
- **Out of scope**: README content (that's `write-package-readmes`);
  version pinning / changesets (that's `adopt-changesets`); the actual
  publish; provenance.
- `@okf-kb/pi-adapter` stays `private: true` — no metadata needed (it
  won't publish), but a `files`/`prepublishOnly` is harmless if added;
  skip it.

## Acceptance criteria

- For each of `core, protocol, fs, daemon, cli, auth`: `package.json`
  has `files: ["dist"]`, `prepublishOnly: "npm run build"`,
  `license: "MIT"`, `publishConfig: { access: "public" }`.
- `npm publish --dry-run` (from each package, after `npm run build`)
  lists only `dist/**`, `package.json`, `README.md`, `LICENSE` (if a
  LICENSE file is added) — no `src/`, `tests/`, `tsconfig.json`.
- Root `package.json` still has `private: true` (unaffected).
- A root `LICENSE` file (MIT) added; referenced by packages via
  `license` field (or each package gets its own — pick one, be
  consistent).
- `npm run typecheck` + `npm test` green (metadata changes shouldn't
  affect tests; a `prepublishOnly` only fires on publish).

## Existing abstractions to use

- The `npm publish --dry-run` output (already verified in this session)
  is the acceptance check.

## Relevant architecture / domain decisions

- `dist/` is gitignored by design (build artifact); `files: ["dist"]` +
  `prepublishOnly` is the standard fix so the published tarball has the
  built code without committing it.
- `publishConfig.access: public` avoids needing `--access public` on
  every publish (scoped packages default to restricted/paid).

## Implementation notes

### Slice 01 — add-publish-metadata (landed)

Landed commits `b2a4201` + `707082d` (merge `0205c74`). Verified 221 passed /
1 skipped. All 6 public packages (`@okf-kb/{core,protocol,fs,daemon,cli,auth}`)
have `files: ["dist"]`, `license: MIT`, `publishConfig: { access: public }`,
`scripts.prepublishOnly: npm run build`. Root `LICENSE` (MIT, Y4shin) added.
`npm publish --dry-run` per package confirms clean tarballs (dist + package.json
+ LICENSE only; no src/tests/tsconfig.json).

The TDD worker stalled on the final report step after completing the work;
parent diagnosed via repo state and landed directly. Recorded as feedback.

Coherence-pass findings (from the deviation report):
- (a) `bin` "./" warning on cli + daemon — `npm publish --dry-run` warns
  `"bin[okfkb]" script name bin/okfkb.js was invalid and removed`. npm
  auto-strips the leading `./`. Fix: change `"./bin/okfkb.js"` →
  `"bin/okfkb.js"`. Addressed in the coherence commit.
- (b) `dist/tsconfig.tsbuildinfo` (53 kB) in the `@okf-kb/cli` tarball —
  cli's `rootDir: "."` puts tsbuildinfo in `dist/`. Excluded via
  `files` negation.
- (c) Per-package LICENSE duplication (7 copies) — left as-is for now
  (npm includes each package's own LICENSE; syncing is a minor future
  concern).
- (d) `scripts/verify-publish-metadata.mjs` at repo root — out-of-scope
  worker addition; kept (harmless verification helper).
