# Architecture Spec — `split-daemon-binary`

Add the **`okfkbd`** binary to `@okf-kb/daemon` (a thin shim that calls
`startDaemon`), and remove the `okfkb daemon` subcommand from
`@okf-kb/cli` — completing the client/server separation. After this
task, `okfkb` is purely a client of a running daemon (zero
`@okf-kb/daemon` references), and `okfkbd` is the daemon runner.

This finishes the work `extract-auth-package` started: the client CLI
is now both *dependency-light* (no `@okf-kb/daemon`/`fs` in runtime
deps) and *code-light* (no server code path at all).

## Slices

- **01 — add-okfkbd-bin-to-daemon:** `bin/okfkbd.js` + `bin: { "okfkbd":
  ... }` on `@okf-kb/daemon`; a new daemon bin test that spawns it on
  an ephemeral port, hits the health endpoint, and exits cleanly on
  SIGTERM. The `okfkb daemon` subcommand still exists in cli (removed
  in slice 02).
- **02 — remove-daemon-subcommand-from-cli:** delete `runDaemon` + the
  `argv[0] === 'daemon'` branch from `@okf-kb/cli/src/main.ts`; remove
  `../daemon` from cli's tsconfig references (no longer needed);
  update setup-guide `ExecStart` to `okfkbd`; remove the
  `import('@okf-kb/daemon')` dynamic import (now zero daemon refs in
  cli). CLI tests unaffected (they use in-process fixtures, not the
  subcommand).

## Existing abstractions to use

- **`startDaemon` + `DaemonHandle`** from `@okf-kb/daemon` — the shim
  is a thin argv → `startDaemon` wrapper, exactly what `runDaemon`
  (in `cli/src/main.ts:129-160`) does today. Lift that arg-parsing +
  SIGINT/SIGTERM logic into `bin/okfkbd.js`.
- **The CLI `--help` bin test** (`cli/tests/commands.test.ts:269`) is
  the spawn+stdio pattern to mirror in the new daemon bin test.
- **`@okf-kb/daemon`'s `dist/index.js`** is the import target for the
  bin shim (`import { startDaemon } from '../dist/index.js'`).
- **npm workspaces + tsc project refs** — adding a `bin/` to daemon
  doesn't change the workspace; the daemon `tsconfig.json` `include`
  may need `bin` added if the shim should be typechecked (it's a `.js`
  shim, so it may not need to be in `include` — match how `@okf-kb/cli`
  handles its `bin/okfkb.js`, which IS in cli's `include: ["src","bin"]`).

## Do NOT reimplement

- Do not change `startDaemon`'s options, behavior, or the
  `DaemonHandle` interface. The shim only parses argv and calls it.
- Do not change the daemon's HTTP server, tRPC, MCP, or auth logic.
- Do not remove the `okfkb config` subcommand from cli (it's a client
  concern; only `daemon` is removed).
- Do not touch the CLI's client-command tests (read/list/search/write/
  check/index-admin) — they use in-process daemon fixtures, not the
  `okfkb daemon` subcommand.
- Do not rename the `kb-daemon.service` systemd unit (operator's
  choice; only the `ExecStart` command updates).

## Seams under test

1. **`okfkbd` starts a daemon** — new
   `packages/daemon/tests/bin.test.ts` spawns `node bin/okfkbd.js
   --port 0`, waits for the stderr `okfkbd listening on <url>` line,
   `fetch`es the `GET /` health endpoint, asserts `{ ok: true,
   service: 'kb-daemon' }`, sends SIGTERM, asserts clean exit 0.
2. **`okfkb` no longer has `daemon`** — after slice 02, `okfkb --help`
   shows no `daemon` subcommand; `main.ts` has no `runDaemon` and no
   `import('@okf-kb/daemon')`. The existing `--help` test still passes
   (it asserts `Usage: okfkb` + the description, not the subcommand
   list).
3. **CLI client commands still work** — `packages/cli/tests/commands.test.ts`
   passes (the 11 tests: help, write.put/read.get round-trip, search,
   check, config, error-on-no-daemon, proxy-typed-AppRouter, built-bin
   round-trip, etc.). None invoke the `daemon` subcommand.
4. **Full suite** — `npm test` green (218 passed, 1 skipped baseline +
   the new daemon bin test; minus any CLI test that exercised the
   `daemon` subcommand — but there is none, so net +1).

## Interface contract (for downstream tasks)

After this task:

- **`@okf-kb/daemon`** ships `bin: { "okfkbd": "./bin/okfkbd.js" }`. The
  shim parses `--port`/`-p`/`--space`/`-s`, calls `startDaemon({ port,
  space })`, writes `okfkbd listening on ${handle.url}` to stderr, and
  wires SIGINT/SIGTERM → `handle.close()` → exit 0.
- **`@okf-kb/cli`** has **zero** references to `@okf-kb/daemon`:
  no `runDaemon`, no `daemon` subcommand branch, no dynamic import, no
  tsconfig project-ref to `../daemon`. Its runtime deps remain
  `{@okf-kb/auth, @okf-kb/protocol, @trpc/client, commander}`. The
  `@okf-kb/daemon` devDep stays (cli tests use it for fixtures).
- **`okfkb config`** subcommand is preserved.
- **`docs/setup-guide.md`** `ExecStart` → `okfkbd ...`; prose
  `okfkb daemon` → `okfkbd`.

Downstream `fix-package-metadata`, `write-package-readmes`,
`adopt-changesets`, `release-ci-workflow` all assume this final
two-binary shape.

## Exact edit map

### Slice 01 — add-okfkbd-bin-to-daemon

**New file `packages/daemon/bin/okfkbd.js`:**
- `#!/usr/bin/env node`
- `import { startDaemon } from '../dist/index.js';`
- Parse `--port`/`-p`/`--space`/`-s` (same semantics as the cli's
  `runDaemon`: `--port` leaves `port` undefined if absent so startDaemon
  applies its default; `--space` pass-through).
- `const handle = await startDaemon({ port, space });`
- `process.stderr.write(\`okfkbd listening on ${handle.url}\n\`);`
- SIGINT/SIGTERM → `await handle.close()` → `process.exit(0)`.
- Mirror `packages/cli/bin/okfkb.js`'s structure (the argv slice +
  runCli + exit-code pattern), adapted for the daemon.

**`packages/daemon/package.json`:** add
`"bin": { "okfkbd": "./bin/okfkbd.js" }`.

**`packages/daemon/tsconfig.json`:** add `"bin"` to `include` (so tsc
typechecks the shim if it's `.ts`; if the shim is `.js` with
`// @ts-check` or plain JS, it may not need include — match cli's
approach: cli has `include: ["src","bin"]` and `bin/okfkb.js` is JS).
Decision: make the shim `bin/okfkbd.js` (plain JS, like cli's), and add
`"bin"` to daemon's `include` for consistency.

**New test `packages/daemon/tests/bin.test.ts`:**
- `spawn('node', ['packages/daemon/bin/okfkbd.js', '--port', '0'])` from
  `process.cwd()`.
- Collect stderr until the `okfkbd listening on http://...` line; parse
  the URL.
- `fetch(url)` → assert `{ ok: true, service: 'kb-daemon' }` (the
  existing health shape from `server.ts`).
- Send SIGTERM; assert exit code 0.
- Timeout guard (15s) to avoid hangs.
- Use a tmp space dir (the daemon needs a KB_HOME/space) — mirror how
  `packages/daemon/tests/server.test.ts` sets up a tmp space (read it
  first).

**Verify:** `npm run build` (so `dist/` exists for the shim to import),
`npm run typecheck`, `npm test` — 218+1 passed, 1 skipped.

### Slice 02 — remove-daemon-subcommand-from-cli

**`packages/cli/src/main.ts`:**
- Delete `runDaemon` (lines ~129-160).
- Delete the `if (argv[0] === 'daemon') { return runDaemon(argv.slice(1)); }`
  branch (~line 20-21).
- Delete the `await import('@okf-kb/daemon')` (was inside runDaemon).
- Update comments: line 1 `route to \`okfkb daemon\` or a group command`
  → remove the `okfkb daemon` mention; line 19 `okfkb daemon is special`
  → remove.
- `okfkb config` branch + `runConfig` stay.

**`packages/cli/tsconfig.json`:** remove `{"path": "../daemon"}` from
`references` (cli no longer references daemon at all — not even
dynamically). Keep `../auth`, `../core`, `../protocol`.

**`docs/setup-guide.md`:**
- line 20: `okfkb daemon` Node → `okfkbd`
- line 223: `ExecStart=$(which node) $REPO/packages/cli/bin/okfkb.js daemon`
  → `ExecStart=$(which node) $REPO/packages/daemon/bin/okfkbd.js`
  (or with `--port`/`--space` as the unit uses them — check the existing
  unit's args). The daemon is now run via its own binary, not the CLI.
- line 244: `"okfkb daemon listening on..."` → `"okfkbd listening..."`
  (matches the new shim's stderr line).
- line 235: `ExecStart runs the daemon` prose — update to reference
  `okfkbd`.
- Other `okfkb daemon` prose (if any) → `okfkbd`.

**`docs/dev-env.md`:** the dev-env "start the daemon" example
(`node packages/cli/bin/okfkb.js daemon`) → `node
packages/daemon/bin/okfkbd.js`.

**Verify:** `npm run typecheck`, `npm test` — green (the CLI `--help`
test still passes; no CLI test invoked the `daemon` subcommand; the
new daemon bin test from slice 01 covers the daemon-startup behavior
that `runDaemon` used to). Grep `packages/cli/` for `@okf-kb/daemon`:
only the **devDependency** in `package.json` (test fixtures) should
remain — no source import, no tsconfig reference.

## Risks / watch-outs

- **The daemon bin test needs a tmp KB space.** The daemon's
  `startDaemon` resolves a space (KB_HOME env or `--space` or
  env-paths). The test must pass `--space <tmpdir>` (or set KB_HOME to
  a tmp dir) so it doesn't touch the real `~/.local/share/kb`. Read
  `packages/daemon/tests/server.test.ts` to see how it isolates the
  space, and mirror that.
- **`okfkbd.js` imports `../dist/index.js`** — `dist/` is gitignored
  and built by `tsc --build`. The bin test requires a prior build (the
  suite's pre-test build step handles this, same as the cli bin test
  which requires `packages/cli/dist/`). Add the `distExists` guard like
  the cli test has.
- **Port 0 = ephemeral.** Read the actual port from the stderr listen
  line, not a hardcoded number, since `--port 0` binds ephemeral.
- **`okfkb daemon` was the only daemon-start path in cli.** After
  removal, a user who runs `okfkb daemon` gets an error (unknown
  command). That's expected — the runbook/setup-guide points them at
  `okfkbd`. Acceptable; the whole point is the split.
- **CLI devDep on `@okf-kb/daemon` stays.** The cli *tests* still
  import `startDaemon` from `@okf-kb/daemon` (line 13 of
  `commands.test.ts`) to stand up an in-process fixture. That's a
  devDep, not a runtime dep, and it stays. Do NOT remove it.
- **`package-lock.json`** may regenerate after the daemon `bin` field
  is added (it shouldn't change the dep tree, but npm may rewrite
  it). Commit if changed.
