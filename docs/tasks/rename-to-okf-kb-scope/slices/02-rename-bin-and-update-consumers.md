---
kind: slice
slug: rename-bin-and-update-consumers
title: Rename kb → okfkb bin, update setup-guide + dev-env docs
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: []
---

## End-to-end behavior

The published CLI binary is `okfkb`. Docs that tell a user to run `kb ...`
say `okfkb ...` instead. The `kb daemon` subcommand is *kept* in this task
(only the bin name changes); `split-daemon-binary` later moves it to
`okfkbd`.

## Acceptance criteria

- `@okf-kb/cli` `package.json` `bin` = `{ "okfkb": "./bin/okfkb.js" }`.
- CLI help text / `commander` program name updated to `okfkb`.
- `docs/setup-guide.md`: any `kb daemon`, `kb config` invocations →
  `okfkb daemon`, `okfkb config` (the daemon command stays for now).
- `docs/dev-env.md`: same command-name updates.
- `npm test` green (CLI command tests updated).

## Test plan

- **Seams**: CLI tests spawn the binary and assert program name.
- **Failure modes**: commander still prints "kb" in `--help`; a doc still
  says `kb daemon`.
- **Scenarios**: run `okfkb --help` from the built bin (via the CLI test);
  grep docs for ` kb ` (bare command).
- **Edge cases**: the systemd unit file in setup-guide is named
  `kb-daemon.service` — leave the *unit name* alone (it's the operator's
  choice), only update the `ExecStart` command to `okfkb daemon`.

## Constraints and dependencies

- Can run in parallel with slice 01, but both touch `@okf-kb/cli`; safer
  to treat as sequential after 01 (01 renames the package, this renames
  the bin). Listed blocked_by: [] but implement after 01 lands.
