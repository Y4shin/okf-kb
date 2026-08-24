# Land slice cli-client (FINAL) — kb-client-js-api

**Land worker output.** Slice already implemented + committed on `task/kb-client-js-api`
(HEAD = ef0b155). No separate slice branch. This was the last of 4 slices.

## Actions taken (docs only — no source/tests/config touched)

1. Confirmed branch: `task/kb-client-js-api`.
2. Set slice doc `status: done` in `docs/tasks/kb-client-js-api/slices/04-cli-client.md`
   (kept in place — matches the convention of slices 01–03 which remain in the slices
   dir with `status: done`; no archive dir is used in this task).
3. Appended `## Implementation notes` to the slice doc summarizing: @kb/cli implemented
   (runCli + createTrpcClient + AppRouter type + bin/kb.js; commands generated from
   fullBindings via registerAllCommands→registerBindingCommand loop; kb daemon calls
   @kb/daemon startDaemon; kb config special-cased; --json + --help + exit codes;
   90 tests including a built-bin child_process end-to-end round-trip). Recorded
   deviations (a)–(e) as specified: fully-qualified kebab group.method names vs short
   aliases; registerBindingCommand/registerAllCommands not registerCli; .kb/config
   not read (env only, meta.cli.env typed not wired); package.json main/exports fixed
   to ./dist/src/index.js; hand-written per-command flags for 4 methods.
4. Set TASK doc `status: done` in `docs/tasks/kb-client-js-api/task.md` (all 4 slices
   done) and appended a `### Task summary (all 4 slices)` section under `## Implementation
   notes` covering: @kb/core (types+builder+GroupBindings) + @kb/fs (5 Fs* classes,
   better-sqlite3+JSON-blob+JS cosine instead of sqlite-vec, FTS5 literal, RRF k=60,
   B7=error) + @kb/protocol (fullBindings/piBindings/buildRouter/AppRouter) + @kb/daemon
   (tRPC /trpc + MCP /mcp, Bearer keyring+env, 127.0.0.1) + @kb/cli (tRPC client, commands
   from records, kb daemon). 90 tests + 1 skipped, tsc --strict clean. Noted the
   daemon-mediated V1 architecture, the one-IDL-two-projections (Zod schemas +
   GroupBindings → tRPC + MCP), the exhaustiveness guarantee via tsc, and pi as the
   next consumer (piBindings omits Write).
5. Committed: `docs: mark slice cli-client done + task kb-client-js-api done (all 4 slices)`.

## Verification (from prior verify/tdd reports, not re-run)

- tsc --build: exit 0 (clean across all packages)
- vitest run: 90 passed + 1 skipped (16 test files: 15 passed, 1 skipped)
- CLI slice tests: 10/10 including built-bin child_process.spawn round-trip
- No source/tests/config files modified by the land worker (docs only).

## Git

- Branch: `task/kb-client-js-api`
- New HEAD: `2e725180aa164e556bf142d1aacd2d67dc6570d9`
- Top 3:
  - `2e72518 docs: mark slice cli-client done + task kb-client-js-api done (all 4 slices)`
  - `ef0b155 fix(cli): package.json main/exports -> ./dist/src/index.js (build emits dist/src/)`
  - `64a07bb wip: cli-client all acceptance criteria passing`
- Working tree clean after commit; no staged files left.

## Conventions note

The standard land-worker flow (merge a slice branch + archive the slice doc) did not
apply: the slice was committed directly on the task branch and prior slices kept their
docs in place with `status: done` (no archive directory). Followed the established
in-place convention. No merge needed (HEAD already contained the slice).

## Residual risks / notes for the parent

- Slice doc deviations (a)–(e) are recorded in the slice doc's Implementation notes;
  the most user-visible is (a): commands are `kb read.get` / `kb write.put` /
  `kb search.search-unified` / `kb index-admin.check` (fully-qualified kebab group.method),
  NOT the short aliases `kb get`/`kb put`/`kb search`/`kb check` shown in the acceptance
  examples. Deliberate mechanical generation from records. The pi extension (next task)
  should expect these fully-qualified names.
- `.kb/config` file is not read (env only); `meta.cli.env` typed but not wired.
- Built-bin e2e test uses child_process.spawn (not execSync) due to vitest worker
  event-loop interaction; documented in the TDD report.
- All 4 slices now `status: done`; task `status: done`. pi is the next consumer
  (piBindings omits Write).
