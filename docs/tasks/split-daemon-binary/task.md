---
kind: task
type: feature
slug: split-daemon-binary
title: Add okfkbd binary to @okf-kb/daemon; remove okfkb daemon subcommand
map: npm-publishing
status: ready
blocked_by:
  - extract-auth-package
slices:
  - add-okfkbd-bin-to-daemon
  - remove-daemon-subcommand-from-cli
---

## User-visible outcome

`@okf-kb/daemon` ships a **`okfkbd`** binary that runs the daemon
(`startDaemon`). `@okf-kb/cli`'s `okfkb daemon` subcommand is removed —
the client CLI is now purely a client of a running daemon. The two roles
(client / server) are distinct published binaries with distinct dep
footprints.

## User story

As a daemon operator, `npm i -g @okf-kb/daemon` gives me `okfkbd` — the
server. As a client user, `npm i -g @okf-kb/cli` gives me `okfkb` — the
client — and it's light. The client no longer carries dead server code.

## Scope boundaries

- **In scope**: add `bin/okfkbd.js` + `bin: { "okfkbd": ... }` to
  `@okf-kb/daemon`; the shim parses `--port`/`--space` and calls
  `startDaemon`. Remove `runDaemon` + the `daemon` branch from
  `@okf-kb/cli/src/main.ts`. Update setup-guide `ExecStart` to `okfkbd`.
- **Out of scope**: changing `startDaemon`'s options/behavior; the systemd
  unit file *name* (operator's choice); publishing.
- A side effect: `@okf-kb/cli` no longer has any import of
  `@okf-kb/daemon` (even dynamic) — confirm the dep is fully severed.

## Acceptance criteria

- `@okf-kb/daemon/package.json` has `bin: { "okfkbd": "./bin/okfkbd.js" }`
  and `bin/okfkbd.js` exists with a shebang, parses `--port`/`--space`
  (mirroring the old `runDaemon` arg parsing), calls `startDaemon`, prints
  `okfkbd listening on <url>` to stderr, and handles SIGINT/SIGTERM.
- `@okf-kb/cli/src/main.ts` no longer has a `daemon` subcommand branch;
  `runDaemon` deleted; no `import('@okf-kb/daemon')` remains in cli.
- `@okf-kb/cli/package.json` confirmed: no `@okf-kb/daemon` anywhere.
- `docs/setup-guide.md` `ExecStart` → `okfkbd --port ...` (or as the unit
  uses it); the `okfkb daemon` mention → `okfkbd`.
- New test: `@okf-kb/daemon` bin test (spawn `okfkbd`, hit `GET /` health,
  exit cleanly) — mirrors the old CLI daemon test but for the new binary.
- CLI tests updated: `okfkb daemon` is gone; client-command tests
  unaffected (they use a running daemon fixture).
- `npm run typecheck` clean; `npm test` green.

## Existing abstractions to use

- `startDaemon` + `DaemonHandle` from `@okf-kb/daemon` — the shim is a
  thin argv → `startDaemon` wrapper, exactly what `runDaemon` did.
- The existing CLI daemon test's spawn-and-health-check pattern lifts
  into the daemon bin test.

## Relevant architecture / domain decisions

- The owner's reason for two binaries: the client CLI does **not** need
  the transformer/sqlite deps, and a remote daemon host carries that
  weight so the client doesn't. `split-daemon-binary` + the prior auth
  extraction together realize that.

## Implementation notes

### Slice 01 — add-okfkbd-bin-to-daemon (landed)

- **Landed commit**: `1b54aee` ("wip: add-okfkbd-bin-to-daemon okfkbd binary + test passing"), merged into `main` with `--no-ff` as `slice(split-daemon-binary): Add okfkbd binary to @okf-kb/daemon`; slice branch deleted.
- **Verified**: `npm run typecheck` clean; `npm test` green — **219 passed / 1 skipped** (23 test files + 1 skipped). The new daemon bin test (`packages/daemon/tests/bin.test.ts`, 1 test) accounts for the +1 over the prior 218.
- **`packages/daemon/bin/okfkbd.js`** (new, executable, `#!/usr/bin/env node`): imports `startDaemon` from `../dist/index.js`; parses `--port`/`-p`/`--space`/`-s` (including `--port=`/`--space=` equals forms), calls `startDaemon({ port, space })`, writes `okfkbd listening on ${handle.url}` to stderr, wires `SIGINT`/`SIGTERM` → `handle.close()` then `process.exit(0)`. Matches the old `runDaemon` argv semantics.
- **`packages/daemon/package.json`**: `bin: { "okfkbd": "./bin/okfkbd.js" }` added (one line changed).
- **`packages/daemon/tests/bin.test.ts`** (new): spawns `node bin/okfkbd.js --port 0 --space <tmp>` on an ephemeral port with an isolated `mkdtemp` tmp space (seeded from `testManifest.types`), waits for the stderr listen line via regex to read the actual ephemeral URL, `fetch`es `GET /` and asserts `{ ok: true, service: 'kb-daemon' }`, sends `SIGTERM`, asserts clean exit 0; cleans up the tmp space. Skips with a `console.warn` if `dist/index.js` is absent.
- **`packages/daemon/tsconfig.json`**: `include` extended to `["src", "bin"]` so the `.js` shim is type-checked.
- **CLI `okfkb daemon` subcommand preserved**: `packages/cli/src/main.ts` still routes `argv[0] === 'daemon'` → `runDaemon` (dynamic `import('@okf-kb/daemon')`). Slice 02 (`remove-daemon-subcommand-from-cli`) removes it.
- **Cosmetic non-blockers** (TDD worker noted; no impact on acceptance): (1) duplicate stderr `data` handler in `bin.test.ts` (a top-level `proc.stderr.on('data', …)` accumulator plus the listen-line-matching `onData` handler) — a coherence/cleanup candidate; (2) `allowJs` is declarative-only via the `bin` include (no `allowJs:true` set) — the `.js` shim is still type-checked through the include, so behavior is unaffected.
- **No source/test/config changes in this landing commit** — only slice-doc status + this task-doc note.


