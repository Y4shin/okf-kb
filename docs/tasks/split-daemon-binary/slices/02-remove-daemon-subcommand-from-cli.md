---
kind: slice
slug: remove-daemon-subcommand-from-cli
title: Remove okfkb daemon subcommand; sever cli → daemon import; update docs
task: ../task.md
mode: afk
status: done
size: s
blocked_by:
  - add-okfkbd-bin-to-daemon
---

## End-to-end behavior

`okfkb` no longer has a `daemon` subcommand. The client CLI has zero
references to `@okf-kb/daemon`. Docs point daemon operators at `okfkbd`.

## Acceptance criteria

- `@okf-kb/cli/src/main.ts`: `runDaemon` and the `argv[0] === 'daemon'`
  branch deleted; the commander program no longer mentions `daemon`.
- No `import('@okf-kb/daemon')` or `from '@okf-kb/daemon'` in
  `packages/cli` (grep clean).
- `@okf-kb/cli/package.json`: still no `@okf-kb/daemon` (confirmed by
  prior task; this slice removes the last *code* reference).
- CLI tests: remove/adjust any test covering `okfkb daemon`; the
  daemon-side bin test (prior slice) covers that behavior now.
- `docs/setup-guide.md`: `ExecStart` → `okfkbd ...`; any prose "run `kb
  daemon`/`okfkb daemon`" → `okfkbd`. Update the systemd unit `ExecStart`
  line and the "after a repo update" example.
- `npm run typecheck` clean; `npm test` green (with the prior slice's
  new daemon bin test replacing the old CLI daemon coverage).

## Test plan

- **Seams**: grep for residual `daemon` refs in cli; `tsc --build`;
  `npm test` (CLI test count drops by the removed daemon test, daemon
  gains the bin test).
- **Failure modes**: commander still lists `daemon` in help; a stale
  doc reference.
- **Scenarios**: `okfkb --help` shows no `daemon`; `okfkbd --port 0`
  starts the daemon.
- **Edge cases**: the setup-guide "after a repo update" line that
  restarts the daemon — ensure it says `okfkbd`.

## Constraints and dependencies

- After `add-okfkbd-bin-to-daemon` (so there's a replacement before
  removing the old path).
