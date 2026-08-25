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
