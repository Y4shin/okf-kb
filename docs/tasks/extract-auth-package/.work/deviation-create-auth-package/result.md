## Deviation report — create-auth-package

### API surface changes
- **Planned:** New `@okf-kb/auth` package exporting `getOrMintToken` + `GetOrMintTokenOptions`; `@okf-kb/daemon` re-exports from `@okf-kb/auth`.
- **Actual:** Exactly as planned. `packages/auth/src/index.ts` exports `getOrMintToken` + `GetOrMintTokenOptions` from `./auth.js`. `@okf-kb/daemon/src/index.ts` re-exports both from `@okf-kb/auth`. `server.ts` imports `getOrMintToken` from `@okf-kb/auth` directly. No API surface change.
- **Impact:** None on dependent slices. Slice 02 will switch `@okf-kb/cli`'s import to `@okf-kb/auth` — the re-export in daemon means any in-repo caller that still imports from `@okf-kb/daemon` continues to work (backward-compatible).

### Abstraction usage
- Used/was specified: yes. The new package mirrors `@okf-kb/protocol`'s structure (package.json with exports/types, tsconfig.json with composite/rootDir/outDir, src/index.ts re-export, tests/). npm workspaces auto-discovered the new package. tsc project references wired correctly (root `tsconfig.json` + `packages/daemon/tsconfig.json` both reference `packages/auth`).

### The env-paths spec-vs-slice-doc conflict (resolved correctly)

- **Slice doc** (`01-create-auth-package.md`) acceptance criteria says: "deps `@napi-rs/keyring ^1.3.0`, `env-paths ^4.0.0`" and "remove `@napi-rs/keyring` **and `env-paths`** from `dependencies`" in daemon.
- **Arch spec** explicitly contradicts: "Do not change `env-paths` ownership: it stays in `@okf-kb/daemon` (used by `deps.ts` for KB_HOME resolution). **Only `@napi-rs/keyring` moves to `@okf-kb/auth`.**"
- **What the worker did:** Followed the arch spec. `@okf-kb/auth` deps = `@napi-rs/keyring` only (no `env-paths`). `@okf-kb/daemon` keeps `env-paths` in its dependencies.
- **Verdict:** Correct decision. The arch spec explicitly verified that `auth.ts` does not use `env-paths` (it's used by `deps.ts` for `KB_HOME`/`envPaths('kb')`), so moving it to `@okf-kb/auth` would have broken daemon's `deps.ts`. The worker correctly resolved the conflict in favor of the arch spec, which is the authoritative document per the feature pipeline.
- **Recommendation:** The slice doc should be updated to remove `env-paths` from the acceptance criteria to avoid confusing future readers. This is a slice-doc fix, not an implementation deviation.

### Out-of-scope changes
- **None.** The worker correctly stayed within slice 01's scope:
  - `@okf-kb/cli` — **not touched** ✓ (slice 02's job; `git show --stat` confirms no cli files in the commit)
  - `@okf-kb/pi-adapter` — **not touched** ✓ (slice 02's job; no pi-adapter files in the commit)
  - `startDaemon` / `buildCommonDeps` / `deps.ts` logic — **not touched** ✓ (only `server.ts:15` import source changed from `./auth.js` → `@okf-kb/auth`; the `deps.ts` file was not modified)
  - The `okfkb daemon` subcommand — **not touched** ✓ (slice 02 / `split-daemon-binary`)

### Detailed verification

**New package `@okf-kb/auth` structure:**
- `packages/auth/package.json` ✓ — `name: @okf-kb/auth`, `type: module`, `version: 0.1.0`, `main`/`exports`/`types` to `./dist/index.js`/`.d.ts`, `scripts: { build: tsc, typecheck: tsc --noEmit }`, `dependencies: { "@napi-rs/keyring": "^1.3.0" }`, `devDependencies: { @types/node, typescript, vitest }`. Matches `@okf-kb/protocol`'s pattern.
- `packages/auth/tsconfig.json` ✓ — `extends: ../../tsconfig.base.json`, `composite: true`, `rootDir: src`, `outDir: dist`, `references: []`, `include: ["src"]`. No project-ref deps (auth depends only on `@napi-rs/keyring`, a registry package). Matches arch spec exactly.
- `packages/auth/src/auth.ts` ✓ — moved from `packages/daemon/src/auth.ts` via git rename (similarity 95%). Only the header comment changed: `// @okf-kb/daemon — auth:` → `// @okf-kb/auth — auth:`. Logic is byte-identical.
- `packages/auth/src/index.ts` ✓ — `export { getOrMintToken } from './auth.js'; export type { GetOrMintTokenOptions } from './auth.js';`
- `packages/auth/tests/auth.test.ts` ✓ — moved from `packages/daemon/tests/auth.test.ts` via git rename (similarity 97%). Header comment updated. 6 tests, identical test names and assertions (verified via `diff` of `it()` lines: IDENTICAL). Import path `../src/auth.js` (relative, unchanged).

**Keyring strings preserved:**
- `SERVICE = 'kb'` ✓ (line 9)
- `ACCOUNT = 'daemon'` ✓ (line 10)
- `new Entry(SERVICE, ACCOUNT)` ✓ (line 30)
- Existing minted tokens in the OS keyring will continue to resolve.

**`@okf-kb/daemon` rewire:**
- `src/auth.ts` — **deleted** ✓ (moved to `@okf-kb/auth`)
- `tests/auth.test.ts` — **deleted** ✓ (moved to `@okf-kb/auth`)
- `src/index.ts` — re-exports `getOrMintToken` + `GetOrMintTokenOptions` from `@okf-kb/auth` ✓
- `src/server.ts:15` — `import { getOrMintToken } from '@okf-kb/auth';` ✓ (was `./auth.js`)
- `package.json` — `@napi-rs/keyring` **removed** ✓, `@okf-kb/auth: "*"` **added** ✓, `env-paths` **KEPT** ✓
- `tsconfig.json` — `references` includes `{ "path": "../auth" }` ✓

**Root `tsconfig.json`:**
- `packages/auth` added at index 3, **before** `packages/daemon` (index 4) ✓ — correct build order (auth before its dependent).

**No staged files** ✓ — all changes are committed in `a49d4a9`.

### Task doc update needed?
- **Yes (minor):** The slice doc `01-create-auth-package.md` acceptance criteria should be updated to remove `env-paths` from the expected deps of `@okf-kb/auth` and from the daemon removal list, matching the arch spec. This is a documentation fix; the implementation is correct as-is.

### User attention needed?
- **No.** No scope changes, no API surface differences, no out-of-scope changes. The env-paths conflict was resolved correctly in favor of the arch spec. The extraction is clean and complete for slice 01's scope.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings with file paths and severities: all 10 in-scope items verified against commit a49d4a9. New package @okf-kb/auth created at packages/auth/ with correct package.json/tsconfig.json/src/auth.ts/src/index.ts/tests/auth.test.ts. auth.ts moved via git rename (95% similarity), only header comment changed, SERVICE='kb'/ACCOUNT='daemon' preserved (lines 9-10). 6 auth tests relocated with identical test names (verified via diff). Daemon rewired: src/auth.ts + tests/auth.test.ts deleted, index.ts re-exports from @okf-kb/auth, server.ts:15 imports from @okf-kb/auth, package.json has keyring removed + @okf-kb/auth added + env-paths KEPT. Root tsconfig.json has packages/auth before packages/daemon (index 3 < 4). CLI and pi-adapter NOT touched (out of scope for slice 02). startDaemon/buildCommonDeps/deps.ts NOT touched."
    }
  ],
  "changedFiles": [
    "package-lock.json",
    "packages/auth/package.json",
    "packages/auth/src/auth.ts",
    "packages/auth/src/index.ts",
    "packages/auth/tests/auth.test.ts",
    "packages/auth/tsconfig.json",
    "packages/daemon/package.json",
    "packages/daemon/src/index.ts",
    "packages/daemon/src/server.ts",
    "packages/daemon/tsconfig.json",
    "tsconfig.json"
  ],
  "testsAddedOrUpdated": [
    "packages/auth/tests/auth.test.ts"
  ],
  "commandsRun": [
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build exit 0 (clean)"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "218 passed, 1 skipped (includes packages/auth/tests/auth.test.ts 6 tests)"
    },
    {
      "command": "git show --stat a49d4a9",
      "result": "passed",
      "summary": "11 files changed, 46 insertions, 9 deletions; no cli or pi-adapter files"
    },
    {
      "command": "diff of it() test names (original vs moved)",
      "result": "passed",
      "summary": "IDENTICAL — all 6 test names match between daemon and auth copies"
    },
    {
      "command": "grep SERVICE/ACCOUNT in auth.ts",
      "result": "passed",
      "summary": "SERVICE='kb', ACCOUNT='daemon' preserved at lines 9-10, used at line 30"
    },
    {
      "command": "grep @okf-kb/auth deps in auth package.json",
      "result": "passed",
      "summary": "dependencies = ['@napi-rs/keyring'] only; no env-paths (arch spec correct)"
    },
    {
      "command": "grep env-paths in daemon package.json",
      "result": "passed",
      "summary": "env-paths KEPT in daemon dependencies (arch spec correct)"
    }
  ],
  "validationOutput": [
    "tsc --build: exit 0 (clean)",
    "npm test: 218 passed, 1 skipped, 0 failed",
    "packages/auth/tests/auth.test.ts: 6 tests passed (vitest auto-discovered via packages/*/tests/**/*.test.ts glob)",
    "auth.ts: git rename from daemon (95% similarity), only header comment changed, logic byte-identical",
    "keyring strings: SERVICE='kb' (line 9), ACCOUNT='daemon' (line 10) — preserved",
    "auth deps: @napi-rs/keyring only (no env-paths) — matches arch spec, diverges from slice doc (correctly)",
    "daemon deps: @napi-rs/keyring removed, @okf-kb/auth added, env-paths KEPT — matches arch spec",
    "root tsconfig: packages/auth at index 3, packages/daemon at index 4 (auth-before-daemon: true)",
    "out-of-scope: cli NOT touched, pi-adapter NOT touched, startDaemon/buildCommonDeps/deps.ts NOT touched"
  ],
  "residualRisks": [
    "slice doc 01-create-auth-package.md still lists env-paths as a dep of @okf-kb/auth and as removable from daemon — should be updated to match the arch spec (doc-only fix, not an implementation risk)",
    "packages/auth/tests/auth.test.ts imports beforeEach but does not use it (cosmetic, pre-existing in the original daemon test, harmless)"
  ],
  "noStagedFiles": true,
  "diffSummary": "Slice 01 created the new @okf-kb/auth package (package.json, tsconfig.json, src/auth.ts moved from daemon via git rename, src/index.ts re-export, tests/auth.test.ts moved from daemon), rewired @okf-kb/daemon to import/re-export from @okf-kb/auth (index.ts, server.ts), removed @napi-rs/keyring from daemon deps and added @okf-kb/auth, kept env-paths in daemon (per arch spec), added packages/auth to root tsconfig.json before packages/daemon, added ../auth to daemon tsconfig references. 11 files changed, 46 insertions, 9 deletions. No out-of-scope changes.",
  "reviewFindings": [
    "no blockers",
    "observation: env-paths spec-vs-slice-doc conflict — the slice doc says move env-paths to auth and remove from daemon, but the arch spec explicitly says keep env-paths in daemon (only @napi-rs/keyring moves). Worker correctly followed the arch spec. Slice doc should be updated to remove this contradiction.",
    "observation: packages/auth/tests/auth.test.ts imports beforeEach but does not use it (pre-existing from the original daemon test, cosmetic, harmless)"
  ],
  "manualNotes": "The env-paths conflict between the slice doc and arch spec is a planning-doc inconsistency, not an implementation deviation. The worker correctly resolved it in favor of the arch spec (the authoritative document). Recommend updating the slice doc acceptance criteria to remove env-paths references to avoid confusing future readers."
}
```
