---
kind: slice
slug: wire-auth-into-cli-and-daemon
title: @okf-kb/cli imports getOrMintToken from @okf-kb/auth; drop cli → daemon dep
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

`@okf-kb/cli` no longer lists `@okf-kb/daemon` as a dependency. Client
commands get the token from `@okf-kb/auth`. The `okfkb daemon` subcommand
remains via a dynamic import of `@okf-kb/daemon` (runtime-only; not a
`dependencies` entry) — it will keep working when `@okf-kb/daemon` is
present (which it is in the monorepo) and is removed in
`split-daemon-binary`.

## Acceptance criteria

- `@okf-kb/cli/package.json` `dependencies` = `@okf-kb/auth`,
  `@okf-kb/protocol`, `@trpc/client`, `commander` — **no
  `@okf-kb/daemon`**, **no `@okf-kb/fs`**.
- `@okf-kb/cli/src/main.ts`: `getOrMintToken` imported from
  `@okf-kb/auth` (static).
- `@okf-kb/cli/src/main.ts` `runDaemon`: keep `const { startDaemon } =
  await import('@okf-kb/daemon')` — dynamic, unchanged here.
- Verify the install-weight claim: `npm install` in a clean temp dir with
  only `@okf-kb/cli` (via `npm pack` tarballs, or by reading the dep tree)
  does **not** include `@xenova/transformers` or `better-sqlite3`. Capture
  `npm ls` / `npm install --dry-run` output as evidence.
- `npm run typecheck` clean; `npm test` 217 pass (CLI tests still run the
  `okfkb daemon` subcommand against the in-workspace daemon).

## Test plan

- **Seams**: `tsc --build`; the CLI command tests (they exercise
  `okfkb daemon` + client commands); a dep-tree check.
- **Failure modes**: static `import { startDaemon } from '@okf-kb/daemon'`
  sneaks back in → `@okf-kb/daemon` becomes a required dep again and the
  weight claim breaks. Assert via grep that the only daemon reference in
  cli is the dynamic `import()` inside `runDaemon`.
- **Scenarios**: full `npm test`; a dry-run install of `@okf-kb/cli`
  showing the light dep tree.
- **Edge cases**: the monorepo always has `@okf-kb/daemon` present, so the
  dynamic import works in tests; document that a *client-only* `okfkb`
  install won't have `okfkb daemon` until `split-daemon-binary`.

## Constraints and dependencies

- After `create-auth-package`.
- This slice deliberately leaves the `okfkb daemon` subcommand in place;
  it's the next task's job to move it.
