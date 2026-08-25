---
kind: task
type: feature
slug: rename-to-okf-kb-scope
title: Rename all @kb/* packages to @okf-kb/* (match repo identity)
map: npm-publishing
status: done
slices:
  - rename-scope-packages-and-imports
  - rename-bin-and-update-consumers
---

## User-visible outcome

Every public package in the monorepo is renamed from `@kb/*` to
`@okf-kb/*`, internal imports updated, the `kb` CLI binary renamed to
`okfkb`, and the build + full test suite pass. This is the foundational
rename everything downstream depends on (bin names, changesets,
publishConfig).

## User story

As a maintainer, the npm packages I publish carry the same identity as the
GitHub repo (`okf-kb`), so consumers can tell who owns them. As a
consumer, `npx @okf-kb/cli` (or `okfkb`) is the entry point.

## Scope boundaries

- **In scope**: rename `@kb/core`, `@kb/protocol`, `@kb/fs`, `@kb/daemon`,
  `@kb/cli` → `@okf-kb/*`; update all internal imports across packages;
  rename the `kb` bin → `okfkb` (in `@okf-kb/cli`); update CLI tests,
  setup-guide, and dev-env docs.
- **Out of scope**: extracting `@okf-kb/auth` (next task); the `okfkbd`
  daemon bin (next task); publishing; the pi extension symlink
  (`~/.pi/agent/extensions/pi-kb` stays).
- `@kb/pi-adapter` is renamed to `@okf-kb/pi-adapter` too (it's an internal
  workspace package and imports the others), but stays `private: true`.

## Acceptance criteria

- All 6 `package.json` `name` fields are `@okf-kb/*`.
- Every inter-package import (incl. `@kb/core` in `.ts` source, tests,
  extension code) is updated to `@okf-kb/*`.
- `@okf-kb/cli` `bin` = `okfkb` (not `kb`); `bin/kb.js` renamed to
  `bin/okfkb.js`; the bin shim's shebang/package ref updated.
- `npm run typecheck` clean; `npm test` — all 217 tests pass (CLI tests
  updated for the new bin name / command name).
- `docs/setup-guide.md` and `docs/dev-env.md` references to `kb` as a
  command reflect `okfkb` (the daemon command stays for now, until
  `split-daemon-binary`).
- No stale `@kb/` imports remain (grep clean, excluding `node_modules`).

## Implementation notes

### Slice 01 — rename-scope-packages-and-imports (landed)

Landed commit `689f9b6` ("wip: rename-scope-packages-and-imports scope +
imports + bin rename passing") on `slice/rename-scope-packages-and-imports`,
merged into `main` as `b4fcf76`.

- All 6 workspace packages renamed `@kb/*` → `@okf-kb/*`
  (`packages/{core,protocol,fs,daemon,cli,pi-adapter}/package.json`).
- Every internal `import ... from '@kb/...'` in `packages/**/*.ts` (incl. tests
  + pi-adapter) updated to `@okf-kb/*`; `package-lock.json` regenerated.
- `@okf-kb/cli` `bin` = `okfkb`; `packages/cli/bin/kb.js` → `bin/okfkb.js`;
  CLI tests (`packages/cli/tests/commands.test.ts`) updated for the new bin
  name / spawn path.
- Verified: `npm run typecheck` clean; `npm test` 217 passed / 1 skipped
  (same green baseline); no residual `@kb/` in source (grep clean excluding
  `node_modules`/`dist`/`package-lock`).

Slice 02 (`rename-bin-and-update-consumers`) remains `todo` — the
`docs/setup-guide.md` / `docs/dev-env.md` consumer-doc updates are its
scope, so the task is not yet fully landed.

### Slice 02 — rename-bin-and-update-consumers (landed)

Landed slice commits `6d15ea1` ("wip: rename-bin-and-update-consumers
commander program name passing") + `bdcb11e` ("wip: rename-bin-and-update-consumers
docs + daemon listen message passing") on
`slice/rename-bin-and-update-consumers`, merged into `main` as
`8441893` (slice/rename-bin-and-update-consumers branch deleted).

- `packages/cli/src/main.ts`: `commander` program `.name('okfkb')` and
  `.description('okfkb — knowledge base CLI ...')`; the special-case doc
  comments updated `kb daemon` → `okfkb daemon` and `kb config` →
  `okfkb config`; the daemon listen line changed to `okfkb daemon
  listening on ...`. The `kb daemon` / `kb config` *subcommand* dispatch
  is preserved (only the bin name changes this task; the `okfkbd` daemon
  binary is a later task).
- `packages/cli/tests/commands.test.ts`: added a built-bin `okfkb --help`
  end-to-end test asserting `Usage: okfkb`, `okfkb — knowledge base CLI`,
  and `not.toContain('Usage: kb')`. Test count rose 217 → 218 passed.
- `docs/dev-env.md` and `docs/setup-guide.md`: every `kb` *command*
  invocation → `okfkb` (e.g. `node packages/cli/bin/okfkb.js daemon`,
  `okfkb read.get`, `ExecStart=.../bin/okfkb.js daemon`, the status
  comment `okfkb daemon listening on ...`, troubleshooting `okfkb
  index-admin.*`). The systemd unit name `kb-daemon.service` and the
  `kb-silverbullet.service` unit were deliberately left unchanged (operator's
  choice per slice constraints).
- Verified post-merge on `main`: `npm run typecheck` clean; `npm test`
  218 passed / 1 skipped. Out-of-scope items untouched (no `okfkbd` binary,
  no auth extraction).

## Existing abstractions to use

- npm workspaces (root `workspaces: ["packages/*"]` — unchanged).
- The `@kb/*` → `@okf-kb/*` rename is mechanical; the `@kb` scope on npm
  is unclaimed (verified), so `@okf-kb` is free to create later.

## Relevant architecture / domain decisions

- The `kb` product identity (CLI/daemon/skill names) was deliberately kept
  during the *repo* rename, but the **npm scope** decision (this map) is to
  align with the repo as `@okf-kb`.
- The bin rename `kb` → `okfkb` avoids collision with the existing
  unscoped `kb@0.0.5` on npm.
