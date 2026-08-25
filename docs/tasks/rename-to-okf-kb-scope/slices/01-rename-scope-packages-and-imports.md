---
kind: slice
slug: rename-scope-packages-and-imports
title: Rename @kb/* → @okf-kb/* across all package.json + source imports
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

All 6 workspace packages carry the `@okf-kb/*` name, and every internal
import / bin reference / test assertion that named `@kb/*` or `kb` now uses
`@okf-kb/*` / `okfkb`. `tsc --build` is clean and the suite passes.

## Acceptance criteria

- `packages/{core,protocol,fs,daemon,cli,pi-adapter}/package.json` `name` =
  `@okf-kb/*`.
- Root `package.json` `name` already `okf-kb` (done in repo rename commit);
  root devDeps referencing `@kb/*` (none expected) updated if present.
- All `import ... from '@kb/...'` and `from '@kb/core'` etc. in
  `packages/**/*.ts` (incl. tests, pi-adapter) → `@okf-kb/...`.
- `@okf-kb/cli` `bin` = `okfkb`; `packages/cli/bin/kb.js` → `bin/okfkb.js`;
  shim references updated.
- CLI tests (`packages/cli/tests/commands.test.ts`) updated for the new
  bin name — they spawn the built binary, so the path + any `kb`
  command-string assertions change.
- `npm run typecheck` exit 0; `npm test` 217 pass (1 skipped) — same green
  baseline as today.

## Test plan

- **Seams**: `tsc --build` (import resolution); vitest (runtime + CLI
  child_process spawns).
- **Failure modes**: a missed import → tsc error "Cannot find module
  '@kb/...'"; a missed bin rename → CLI test fails to spawn or asserts the
  old name.
- **Scenarios**: full `npm test` after the rename; grep for residual
  `@kb/` (excluding `node_modules`, `dist`, `package-lock`).
- **Edge cases**: the pi-adapter `install:pi` script references
  `@kb/*`? check and update; `.tsbuildinfo` is gitignored and will be
  rebuilt.

## Constraints and dependencies

- None blocking; this is the root of the graph.
- Do not touch `~/.pi/agent/extensions/pi-kb` (out of scope).
