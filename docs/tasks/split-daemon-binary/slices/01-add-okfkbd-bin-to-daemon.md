---
kind: slice
slug: add-okfkbd-bin-to-daemon
title: Add bin/okfkbd.js + bin entry to @okf-kb/daemon; add daemon bin test
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

`@okf-kb/daemon` installs a `okfkbd` binary. Running it starts the daemon
on the configured port, prints a listen line, and shuts down on SIGINT/
SIGTERM. A new test spawns it and hits the health endpoint.

## Acceptance criteria

- `packages/daemon/bin/okfkbd.js`: `#!/usr/bin/env node`, imports
  `startDaemon` from `../dist/index.js`, parses `--port`/`-p`/`--space`/
  `-s` (same semantics as the old `runDaemon`), calls `startDaemon({ port,
  space })`, writes `okfkbd listening on ${handle.url}` to stderr, and
  wires SIGINT/SIGTERM → `handle.close()` then exit 0.
- `packages/daemon/package.json` `bin` = `{ "okfkbd": "./bin/okfkbd.js" }`.
- `packages/daemon/tests/bin.test.ts` (new): spawn `node bin/okfkbd.js
  --port 0`, wait for the stderr listen line, `fetch` the `GET /` health
  URL, assert `{ ok: true, service: 'kb-daemon' ... }`, send SIGTERM,
  assert clean exit. Use port 0 (ephemeral) so it doesn't collide with a
  running daemon.
- `npm run build` produces `dist/` the bin imports.
- `npm test` green including the new bin test.

## Test plan

- **Seams**: the new bin test (child_process spawn + fetch health); the
  existing daemon `server.test.ts` (unaffected — it tests `startDaemon`
  directly).
- **Failure modes**: bin imports `../src/` instead of `../dist/` → fails
  when run from a packed tarball; missing SIGTERM handler → test hangs
  (add a timeout).
- **Scenarios**: ephemeral-port spawn → health 200 → SIGTERM → exit 0;
  `--port` parsing; `--space` pass-through.
- **Edge cases**: port 0 (ephemeral) — read the actual port from the
  stderr line, not a hardcoded number.

## Constraints and dependencies

- None blocking; the daemon already exports `startDaemon`.
