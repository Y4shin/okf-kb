## Deviation report — add-okfkbd-bin-to-daemon

### okfkbd.js shim

- **Planned:** `#!/usr/bin/env node`; `import { startDaemon } from '../dist/index.js'`; parse `--port`/`-p`/`--space`/`-s` (incl `=` forms); call `startDaemon({ port, space })`; write `okfkbd listening on ${handle.url}` to stderr; SIGINT/SIGTERM → `handle.close()` + exit 0; top-level catch → exit 1.
- **Actual:** All present and correct. Shebang ✓. Import from `../dist/index.js` ✓. Arg parsing covers `--port`/`-p`/`--port=`/`--space`/`-s`/`--space=` ✓. `startDaemon({ port, space })` ✓ (port left undefined if absent, matching the arch spec's "let startDaemon apply its default" semantics) ✓. Stderr listen line ✓. SIGINT/SIGTERM → `handle.close()` + `process.exit(0)` ✓. Top-level `main().catch` → `console.error` + `process.exit(1)` ✓.
- **Impact:** None. The shim matches the arch spec exactly (lifted from cli's `runDaemon`). The structure differs slightly from `cli/bin/okfkbd.js` (the cli shim uses `.then().catch()` while this uses `async main().catch()`), but both are valid patterns and the arch spec said "mirror... adapted for the daemon" — the adaptation is reasonable.

### daemon package.json bin field

- **Planned:** `"bin": { "okfkbd": "./bin/okfkbd.js" }`.
- **Actual:** `"bin": {"okfkbd": "./bin/okfkbd.js"}` ✓. Correctly placed in the JSON.
- **Impact:** None.

### daemon tsconfig.json

- **Planned:** Add `"bin"` to `include` (match cli's `include: ["src","bin"]`).
- **Actual:** `"include": ["src", "bin"]` ✓.
- **Impact:** None. `allowJs` is not set (defaults to false), so tsc ignores the `.js` shim for typechecking/emission — the `"bin"` include is cosmetic/declarative and doesn't cause errors or emit. No `dist/bin/` is created. This matches the cli's behavior (cli also has `bin` in include with `allowJs` off).

### bin.test.ts

- **Planned:** Spawn `okfkbd --port 0` with a tmp space; wait for stderr listen line; parse URL; fetch health; assert `{ok:true, service:'kb-daemon'}`; SIGTERM; assert exit 0; timeout guard; `distExists` guard; mirror `server.test.ts` tmp-space isolation.
- **Actual:** All present and correct:
  - `distExists` guard (line 24-27): checks `packages/daemon/dist/index.js` ✓.
  - `makeTmpSpace()`: `mkdtemp` + `testManifest` types dirs + `.gitkeep` — mirrors `server.test.ts`'s `makeSpace()` exactly ✓.
  - Spawn: `node [BIN_PATH] --port 0 --space <tmpdir>` ✓.
  - stderr listen-line parsing via regex `okfkbd listening on (http://[^\s]+)` ✓.
  - Health fetch: `res.status === 200`, `body.ok === true`, `body.service === 'kb-daemon'` ✓.
  - SIGTERM in `finally` ✓.
  - Exit code assertion: `expect(exitCode).toBe(0)` ✓.
  - Timeout guard: 15s for listen line, 5s for exit, SIGKILL fallback ✓.
  - Cleanup: `rm(space, { recursive: true, force: true })` ✓.
- **Impact:** None. Test passes (1 test, 405ms).

### Out-of-scope changes

- **cli NOT touched** ✓ — `git show --stat` lists only 4 daemon files; no cli, setup-guide, or dev-env files.
- **`okfkb daemon` subcommand NOT removed** ✓ — `runDaemon` and `argv[0] === 'daemon'` branch still present in `cli/src/main.ts:20-21,130-131` (slice 02's job).
- **`startDaemon` logic NOT changed** ✓ — `server.ts`, `trpc.ts`, `mcp.ts`, `deps.ts`, `auth.ts` (now `@okf-kb/auth`) all untouched.
- **No other daemon server/tRPC/MCP/auth changes** ✓.

### Cosmetic observations (not deviations, not blockers)

1. **Duplicate stderr `data` handler in bin.test.ts** (low severity, cosmetic): Line 37 registers `proc.stderr.on('data', (d) => { stderr += d; })` (handler A), and line 54 registers `proc.stderr.on('data', onData)` (handler B) which also does `stderr += d` on line 46. Both handlers fire for every chunk, so `stderr` gets each chunk appended twice. The regex match on line 44 still works (it matches on first occurrence of the listen line). The only observable effect is that the `stderr` variable used in error messages (lines 30, 57) would contain duplicated content — purely cosmetic in failure output. Not a blocker; the test passes correctly.

2. **`okfkbd.js` structure vs `cli/bin/okfkb.js`**: The cli shim uses `runCli(argv).then((code) => { process.exit(code); }).catch(...)` while the daemon shim uses `async function main() { ... } main().catch(...)`. Both are valid; the arch spec said "mirror... adapted for the daemon" — the async/await form is natural for the daemon's `await startDaemon()` call. Not a deviation.

3. **`tsconfig.json` `include: ["src", "bin"]` with `allowJs: false`**: The `bin` directory contains only `.js` files which tsc ignores (no `allowJs`). The include is declarative only — no typechecking or emission happens for `bin/`. This matches cli's behavior. Not a deviation, but worth noting for future maintainers: the shim gets no compile-time type checking.

### Task doc update needed?
No. The implementation matches the slice doc's acceptance criteria exactly.

### User attention needed?
No. No scope changes, no API surface differences, no out-of-scope changes.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings with file paths, line numbers, and severity for each check: okfkbd.js shim (all 8 requirements verified), daemon package.json bin field (correct), daemon tsconfig.json include (correct, allowJs off = declarative only), bin.test.ts (all 10 requirements verified), out-of-scope (cli untouched, okfkb daemon subcommand preserved, startDaemon/server/trpc/mcp/auth untouched). 2 cosmetic non-blockers noted (duplicate stderr handler, no allowJs typecheck on shim)."
    }
  ],
  "changedFiles": [
    "packages/daemon/bin/okfkbd.js",
    "packages/daemon/package.json",
    "packages/daemon/tests/bin.test.ts",
    "packages/daemon/tsconfig.json"
  ],
  "testsAddedOrUpdated": [
    "packages/daemon/tests/bin.test.ts"
  ],
  "commandsRun": [
    {
      "command": "npm test",
      "result": "passed",
      "summary": "219 passed, 1 skipped (23 test files); bin.test.ts 1 test passed"
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build exit 0"
    },
    {
      "command": "git show --stat 1b54aee",
      "result": "passed",
      "summary": "4 files changed: bin/okfkbd.js (new, 38 lines), package.json (bin field), tests/bin.test.ts (new, 93 lines), tsconfig.json (include bin)"
    },
    {
      "command": "grep runDaemon/daemon import in cli/src/main.ts",
      "result": "passed",
      "summary": "okfkb daemon subcommand still present (lines 20-21, 130-131) — correctly NOT removed in this slice"
    }
  ],
  "validationOutput": [
    "okfkbd.js: shebang ✓, import from ../dist/index.js ✓, --port/-p/--port=/--space/-s/--space= parsing ✓, startDaemon({port,space}) ✓, stderr 'okfkbd listening' ✓, SIGINT/SIGTERM→close+exit(0) ✓, top-level catch→exit(1) ✓",
    "daemon package.json: bin {okfkbd: ./bin/okfkbd.js} ✓",
    "daemon tsconfig.json: include [src, bin] ✓ (allowJs off = declarative only, no emit)",
    "bin.test.ts: distExists guard ✓, makeTmpSpace mirrors server.test.ts ✓, spawn --port 0 --space tmp ✓, regex URL parse ✓, health fetch {ok:true, service:kb-daemon} ✓, SIGTERM in finally ✓, exit 0 assertion ✓, timeout guards (15s+5s+SIGKILL) ✓, cleanup rm ✓",
    "out-of-scope: cli NOT touched ✓, okfkb daemon subcommand preserved ✓, startDaemon/server/trpc/mcp/auth untouched ✓"
  ],
  "residualRisks": [
    "cosmetic: bin.test.ts has duplicate stderr 'data' handlers (lines 37+54) causing double-append to stderr variable — does not affect test correctness but produces duplicated content in error messages",
    "cosmetic: okfkbd.js shim gets no compile-time type checking (allowJs off, bin in tsconfig include is declarative only)"
  ],
  "noStagedFiles": true,
  "diffSummary": "Slice 01 adds the okfkbd binary shim (38 lines, imports startDaemon from dist, parses --port/--space, SIGINT/SIGTERM handling), the daemon package.json bin field, bin to tsconfig include, and a new bin.test.ts (93 lines, spawns okfkbd --port 0 with tmp space, asserts health + clean exit). No out-of-scope changes. 219 tests pass, 1 skipped.",
  "reviewFindings": [
    "no blockers",
    "observation: bin.test.ts duplicate stderr data handler (lines 37+54) — cosmetic, non-blocking",
    "observation: okfkbd.js not typechecked by tsc (allowJs off) — declarative include only, non-blocking"
  ],
  "manualNotes": "No deviations found. The implementation matches the slice doc and arch spec exactly. Two cosmetic observations are non-blockers. The duplicate stderr handler in the test is the only thing worth a future cleanup pass — remove line 37 (the unconditional handler A) since handler B (onData) already accumulates stderr and does the regex match."
}
```