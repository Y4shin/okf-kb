# Verify slice "remove-daemon-subcommand-from-cli"

## Verdict
**Sliver verified — all 9 gates pass.** The `okfkb daemon` subcommand is removed from the CLI, client source (`packages/cli/src/` + `bin/`) has zero `@okf-kb/daemon` references, and the full project suite is green.

## Gate results

1. **`npm run typecheck`** — exit 0 (clean, no output).
2. **`npm test`** — **221 passed | 1 skipped** (222 total). Confirms the worker's reported count and the new `severance.test.ts` (2 tests). Skipped test is the pre-existing `embedder.integration.test.ts`.
3. **Severance grep `packages/cli/src/` + `bin/` for `@okf-kb/daemon`** — **ZERO results** (no static import, no dynamic import, no comments referencing the daemon package).
4. **`packages/cli/src/main.ts`** — no `runDaemon` function, no `argv[0] === 'daemon'` branch, no `import('@okf-kb/daemon')`. The `okfkb config` branch (`argv[0] === 'config'` → `runConfig`) IS preserved. NOTE: line 3 comment still says "Resolve the daemon URL (KB_URL ...)" — this refers to the *daemon's URL* (the tRPC endpoint), not the `@okf-kb/daemon` package; it is not a package import/reference.
5. **`packages/cli/tsconfig.json`** — references are `["../auth", "../core", "../protocol"]`. No `{"path": "../daemon"}`.
6. **`packages/cli/package.json`** — `dependencies` = `@okf-kb/auth`, `@okf-kb/protocol`, `@trpc/client`, `commander` (no `@okf-kb/daemon`). `devDependencies` retain `@okf-kb/daemon` + `@okf-kb/fs` (test fixtures). ✔
7. **`docs/setup-guide.md`** — `ExecStart=$(which node) $REPO/packages/daemon/bin/okfkbd.js` (line 223); listen line says `"okfkbd listening on http://127.0.0.1:30700"` (line 244). No `okfkb.js daemon` / `cli/bin/okfkb.js daemon` pattern remains.
8. **`packages/cli/tests/severance.test.ts`** (new) — 2 tests:
   - reads `src/main.ts` and asserts it does NOT contain `import('@okf-kb/daemon')`, `from '@okf-kb/daemon'`, `@okf-kb/daemon`, or `runDaemon`.
   - runs `runCli(['--help'])` and asserts help output does NOT list a `daemon` subcommand (regex `/^\s+daemon\s/m` — only rejects a subcommand listing line, not the word "daemon" in description text). Both pass (250ms).
9. **Out-of-scope intact** — `kb-daemon.service` unit name, `KB_HOME`/`KB_URL`/`KB_TOKEN` env vars, `kb-*` skill names (`kb-ask`, `kb-curate`, `kb-save-session`, `kb-research`, `kb_update`), and `kb@local` git identity all remain in `setup-guide.md`.

## Key nuance (not a blocker)
`@okf-kb/daemon` still appears in `packages/cli/tests/commands.test.ts:13` as `import { startDaemon, type DaemonHandle } from '@okf-kb/daemon'`, and in `severance.test.ts` as literal assertion strings. Both are **test fixtures**, not client code:
- `commands.test.ts` spins up a real in-process daemon on an ephemeral port to run round-trip CLI integration tests — this is why `@okf-kb/daemon` stays a devDependency.
- `severance.test.ts` references the string only to assert its absence from `main.ts`.

The task gate (step 3) is explicitly scoped to `packages/cli/src/`, which is clean. The client **production** source (`src/` + `bin/`) has zero daemon references, satisfying the severance goal.

## Residual risks
- The word "daemon" still appears in `main.ts` comments/description (e.g., "daemon URL", "tRPC client of the daemon") — these are prose about the daemon's *URL/endpoint*, not package references. Not a severance violation, but a purist reading of "no comments referencing daemon" should note it as benign.
