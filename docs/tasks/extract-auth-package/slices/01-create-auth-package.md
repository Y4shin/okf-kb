---
kind: slice
slug: create-auth-package
title: Create @okf-kb/auth package; move auth.ts + keyring/env-paths deps
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

A new `packages/auth` workspace package exists, owns the token logic,
and builds. `@okf-kb/daemon` re-exports it. Nothing breaks in-repo yet
(daemon still re-exports `getOrMintToken`).

## Acceptance criteria

- `packages/auth/package.json`: `name: @okf-kb/auth`, `type: module`,
  `main`/`exports`/`types` to `./dist/index.js`/`.d.ts`, `scripts: build,
  typecheck`, deps `@napi-rs/keyring ^1.3.0`, `env-paths ^4.0.0`.
- `packages/auth/src/index.ts` re-exports `getOrMintToken` +
  `GetOrMintTokenOptions` from `./auth.js`.
- `packages/auth/src/auth.ts` = moved `packages/daemon/src/auth.ts`
  (byte-equivalent logic; only the relative-import paths inside change
  if any).
- `packages/auth/tsconfig.json` extends the base, same pattern as
  `@okf-kb/protocol`.
- `@okf-kb/daemon` `package.json`: remove `@napi-rs/keyring` and
  `env-paths` from `dependencies`; add `@okf-kb/auth: "*"`.
- `@okf-kb/daemon/src/auth.ts` → deleted (or reduced to a re-export
  `export { getOrMintToken } from '@okf-kb/auth'`); update `daemon/src/index.ts`
  re-export to point at `@okf-kb/auth`.
- `npm run typecheck` clean; `npm test` green.

## Test plan

- **Seams**: `tsc --build` (new package must compile + daemon must still
  resolve); the existing `packages/daemon/tests/auth.test.ts` (move it to
  `packages/auth/tests/auth.test.ts` or keep a daemon test that asserts
  the re-export — prefer moving the test to `@okf-kb/auth`).
- **Failure modes**: circular import (auth → daemon? should not exist);
  keyring not resolvable from auth; daemon test still importing the old
  path.
- **Scenarios**: `npm test` includes the moved auth test; `getOrMintToken`
  still mints/reads the same keyring entry (no behavior change).
- **Edge cases**: the keyring service name string must stay identical so
  existing minted tokens still resolve — do not change it.

## Constraints and dependencies

- After `rename-to-okf-kb-scope` (the package is `@okf-kb/auth`, not
  `@kb/auth`).
- Keep the keyring service/entry naming stable (existing deployments have
  minted tokens).
