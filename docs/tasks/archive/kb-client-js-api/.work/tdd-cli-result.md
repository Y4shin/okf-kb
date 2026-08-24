# Slice 4 — cli-client: TDD Implementation Report

## Summary

Implemented the `@kb/cli` package — a thin tRPC client CLI that generates commands from the `@kb/protocol` binding records. All acceptance criteria pass; the full workspace test suite (90 tests) passes with no breakage.

## What was built

### Package structure
- `packages/cli/package.json` — `@kb/cli`, workspace package with `bin: {kb: ./bin/kb.js}`, deps: `@kb/core`, `@kb/protocol`, `@kb/daemon`, `@trpc/client`, `commander`
- `packages/cli/tsconfig.json` — extends `../../tsconfig.base.json`, composite, references core/protocol/daemon
- `packages/cli/bin/kb.js` — `#!/usr/bin/env node` entry, imports compiled `dist/src/index.js`
- `packages/cli/src/index.ts` — re-exports `runCli`, `createTrpcClient`, `AppRouter` type, `registerAllCommands`
- `packages/cli/src/client.ts` — `createTrpcClient(url, token)` → `createTRPCProxyClient<AppRouter>` with `httpBatchLink` to `<url>/trpc` and Bearer auth header
- `packages/cli/src/commands.ts` — the binding-record loop: `registerAllCommands` iterates `flattenBindings(fullBindings)`, generating a commander subcommand per binding. Reads `.meta({cli})` from each inputSchema for positional vs `--flag`/`-x` hints. Special handling for `write.put` (`--file`/`--content`), `search.searchUnified` (`--with-graph`), `search.searchText` (`--fields`), `search.searchSemantic` (`--k`). `check` failure (ok:false) exits non-0.
- `packages/cli/src/main.ts` — `runCli(argv)`: pre-parses global opts (`--url`, `--token`, `--json`), strips them from argv, routes `kb daemon` to `startDaemon`, `kb config` to a config printer, all else to commander with generated subcommands. Kebab-case command names (`local-fs.space-root`, `search.search-unified`, `index-admin.check`).

### Tests (`packages/cli/tests/commands.test.ts`)
1. **Command registration**: `--help` lists all commands from binding records
2. **write.put + read.get round-trip + --json**: puts a note via `--content`, retrieves it, JSON is parseable
3. **Disk write**: `write.put` writes the file to the tmp space's `pathFor` and content is correct
4. **search**: `search.search-unified` returns hits after `index-admin.build-index`
5. **check conformant**: `index-admin.check` exits 0, `ok:true` on a linked term+concept bundle
6. **check orphaned (B7)**: `index-admin.check` exits non-0, `ok:false`, B7 error on orphaned glossary term
7. **error: daemon not running**: non-0 exit code, error message on stderr
8. **error: unknown command**: non-0 exit code
9. **createTrpcClient**: typed proxy reaches the daemon and retrieves a note
10. **built bin end-to-end**: `node packages/cli/bin/kb.js` round-trips write.put + read.get via `child_process.spawn`

## Divergence from plan

1. **Command name casing**: The arch spec says `kb search.search-unified`, `kb local-fs.space-root`, `kb index-admin.check` (kebab-case). The `flattenBindings` in `@kb/protocol` produces camelCase names (`search.searchText`, `localFs.spaceRoot`, `indexAdmin.check`). Added a `toKebab()` conversion in `commands.ts` to convert both the group and method parts to kebab-case. This is a CLI-only concern — the tRPC client still uses the original camelCase group/method names to call procedures.

2. **Global option handling**: Commander's global options (`--url`, `--token`, `--json`) only work before the subcommand. Since tests and real usage often pass them after the subcommand, I implemented a pre-parse in `extractGlobalOpts()` that strips them from argv before passing to commander. This is a UX improvement, not a scope change.

3. **`exitOverride()` on commander**: Commander calls `process.exit()` for `--help`, which interferes with vitest's async test runner. Added `exitOverride()` to the program and all subcommands to throw `CommanderError` instead, which is caught in `runCli` and mapped to an exit code.

4. **Built bin test**: The arch spec says to use `execSync` to run the built binary. `execFileSync`/`execSync` with `stdio: 'pipe'` hung inside vitest's test worker (the spawned process kept the event loop alive via tRPC HTTP connections). Switched to `child_process.spawn` with an explicit timeout and pipe collection, which works correctly.

5. **No `@kb/fs` import**: The CLI imports only `@kb/protocol` (for the `AppRouter` type + `fullBindings`/`flattenBindings`) and `@kb/daemon` (for `startDaemon` + `getOrMintToken`). No direct `@kb/fs` import, as specified. `FakeEmbedder` is used only in tests (imported from `@kb/fs` in the test file, not in the CLI source).

## Notable events

- Zod 4's internal schema introspection differs from Zod 3: `.shape` is a getter on `_zod.def.shape` (not `_def.shape`), optionality via `.isOptional()` (not `_def.typeName === 'ZodOptional'`), undefined detection via `_zod.def.type === 'undefined'` (not `_def.typeName === 'ZodUndefined'`). Discovered via debugging, not from docs.
- Commander's `--content <value>` correctly handles values starting with `---` (triple dash), but only when the value is a separate argv element (not shell-escaped). The built bin test needed `child_process.spawn` (no shell) to pass multi-line content correctly.
- The `index-admin.check` method returns `{ ok: boolean, errors: [...] }`. The CLI maps `ok:false` to a non-0 exit code (via `CommandExitError`), which is the expected behavior for integrity check failures.

## Acceptance report
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Implemented the @kb/cli package with commands generated from binding records (loop over fullBindings), tRPC client with Bearer auth, --json output, exit codes, kb daemon, kb config, and built bin. All 10 CLI tests pass; full workspace suite (90 tests) passes; typecheck passes."
    }
  ],
  "changedFiles": [
    "packages/cli/package.json",
    "packages/cli/tsconfig.json",
    "packages/cli/bin/kb.js",
    "packages/cli/src/index.ts",
    "packages/cli/src/client.ts",
    "packages/cli/src/commands.ts",
    "packages/cli/src/main.ts",
    "packages/cli/tests/commands.test.ts",
    "tsconfig.json",
    "package-lock.json"
  ],
  "testsAddedOrUpdated": [
    "packages/cli/tests/commands.test.ts"
  ],
  "commandsRun": [
    {
      "command": "npm install",
      "result": "passed",
      "summary": "Installed commander + @trpc/client; 4 packages added"
    },
    {
      "command": "npx tsc --noEmit -p packages/cli/tsconfig.json",
      "result": "passed",
      "summary": "CLI typecheck clean"
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "Full workspace tsc --build passes"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "All 90 tests pass (1 skipped opt-in integration test)"
    },
    {
      "command": "npx vitest run packages/cli/tests/commands.test.ts",
      "result": "passed",
      "summary": "All 10 CLI tests pass"
    }
  ],
  "validationOutput": [
    "90 tests passed | 1 skipped (embedder.integration.test.ts — opt-in, gated)",
    "CLI tests: 10 passed (command registration, write.put+read.get round-trip, disk write, search, check conformant/orphaned, error handling, createTrpcClient, built bin e2e)",
    "Typecheck: tsc --build passes across all packages"
  ],
  "residualRisks": [
    "The built bin e2e test uses child_process.spawn (not execSync as the spec suggests) due to vitest worker event-loop interaction with execFileSync",
    "Commander global options (--url/--token/--json) are pre-parsed and stripped before commander sees them; this means these flags cannot appear interspersed with subcommand-specific options of the same name",
    "getOrMintToken is called at CLI startup when --token is not provided; in headless CI environments this mints a random token (in-memory only)"
  ],
  "noStagedFiles": true,
  "diffSummary": "Added @kb/cli package (8 new files): tRPC client, commander-based command generation from binding records, main entry with global opt pre-parsing, bin/kb.js entry, and 10 tests covering round-trip, search, check, error handling, and built bin e2e. Modified root tsconfig.json to add @kb/cli reference.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "All commands accept --url and --json. Command names are kebab-case (local-fs.space-root, search.search-unified, index-admin.check). The CLI is a pure client: no @kb/fs import in source (only in tests for FakeEmbedder)."
}
```
