## Deviation report — wire-auth-into-cli-and-daemon

### API surface changes
- **Planned:** `@okf-kb/cli` `dependencies` = `@okf-kb/auth`, `@okf-kb/protocol`, `@trpc/client`, `commander` — no `@okf-kb/daemon`, no `@okf-kb/fs`. Static `getOrMintToken` import from `@okf-kb/auth`. Dynamic `import('@okf-kb/daemon')` kept in `runDaemon`. pi-adapter extension `config.ts` switches `getOrMintToken` import to `@okf-kb/auth`.
- **Actual:** Exactly matches the planned API surface. `@okf-kb/cli` `dependencies` = `{"@okf-kb/auth": "*", "@okf-kb/protocol": "*", "@trpc/client": "^11.18.0", "commander": "^14.0.0"}` (commit `d15d60c`, `packages/cli/package.json`). Both `@okf-kb/daemon` and `@okf-kb/core` were removed from `dependencies`; `@okf-kb/auth` was added. Static `import { getOrMintToken } from '@okf-kb/auth'` at `main.ts:7`. Dynamic `await import('@okf-kb/daemon')` preserved at `main.ts:131`. Comments at lines 3 and 19 updated to reference `@okf-kb/auth`. pi-adapter extension `config.ts:6` switched to `@okf-kb/auth`, comment at line 18 updated.
- **Impact:** None on dependent slices. The light-dep-tree goal is achieved at the runtime level. Downstream `split-daemon-binary` can proceed.

### Abstraction usage
- Used/was specified: yes. npm workspaces, tsc project references, and the `@okf-kb/auth` package from slice 01 were used as specified.

### Out-of-scope changes
- **None.** The worker correctly stayed within scope:
  - `startDaemon` / `buildCommonDeps` logic — **not touched** ✓ (grep of diff shows no changes to daemon source files at all)
  - Daemon source code (`packages/daemon/src/*`, `packages/daemon/tests/*`) — **not touched** ✓ (diff stat shows only `package-lock.json`, `packages/cli/*`, `packages/pi-adapter/extension/src/config.ts`)
  - `okfkb daemon` subcommand — **kept** ✓ (`main.ts:20-21` `argv[0] === 'daemon'` → `runDaemon` branch intact; `runDaemon` function at `main.ts:130` intact)
  - Keyring strings (`SERVICE='kb'`, `ACCOUNT='daemon'` in `auth.ts`) — **not touched** ✓ (not in this slice's diff at all; slice 01 owns those)

### DevDependencies — DEVIATION from arch spec

- **Severity: low (latent bug, not a blocker for this slice)**
- **Planned:** The arch spec's exact edit map for slice 02 does not explicitly mention devDependencies, but the slice doc says "npm test 217 pass (CLI tests still run the `okfkb daemon` subcommand against the in-workspace daemon)." The CLI test file (`packages/cli/tests/commands.test.ts:12-13`) imports `FakeEmbedder` from `@okf-kb/fs` and `startDaemon` from `@okf-kb/daemon`. These are **test-only** imports that should be in `devDependencies`.
- **Actual:** The worker's diff shows `devDependencies` were NOT changed by this commit — they remain `{"@types/node": "^22", "typescript": "~5.9", "vitest": "^3"}`. However, `@okf-kb/fs` and `@okf-kb/daemon` were **never** in cli's devDependencies — not before this commit, not after the rename task, and not in the original pre-rename state (commit `559b228`). The test imports resolve only via npm workspace hoisting (the root `node_modules` has all workspace packages).
- **Impact:** Tests pass in the monorepo because workspace hoisting makes all `@okf-kb/*` packages resolvable from any workspace package. But if someone were to `npm install --production` the cli package in isolation (or use it as a published tarball), the devDependency gap would surface. Since `@okf-kb/fs` and `@okf-kb/daemon` are genuinely test-only (the CLI's runtime `dependencies` are correctly light), they should be declared as `devDependencies` for correctness.
- **Recommended fix (parent coherence pass):** Add `"@okf-kb/fs": "*"` and `"@okf-kb/daemon": "*"` to `@okf-kb/cli`'s `devDependencies`. This does NOT affect the light runtime dep tree (devDeps are not installed by `npm install` without `--include=dev`).

### Pi-adapter extension package.json — missing `file:../../auth`

- **Severity: low (latent, not a blocker in-workspace)**
- **Planned:** The arch spec says: "If tsc complains, add `@okf-kb/auth` to the extension's `file:` deps."
- **Actual:** The extension's `package.json` (`packages/pi-adapter/extension/package.json`) does **not** list `@okf-kb/auth` as a `file:` dep. It still has `@okf-kb/daemon: "file:../../daemon"` but not `@okf-kb/auth: "file:../../auth"`. The extension's `config.ts:6` now imports `getOrMintToken` from `@okf-kb/auth`.
- **Impact:** `tsc --build` passes (exit 0) because workspace hoisting resolves `@okf-kb/auth` from the root `node_modules`. In the monorepo this works. But the extension's declared deps are incomplete — a standalone install of the extension (outside the workspace) would fail to resolve `@okf-kb/auth`. The extension still lists `@okf-kb/daemon` as a `file:` dep even though it no longer imports from it (only `config.ts` was switched; other extension files may still import from daemon — see below).
- **Recommended fix:** Add `"@okf-kb/auth": "file:../../auth"` to the extension's `dependencies`. Whether `@okf-kb/daemon` can be dropped from the extension deps depends on whether other extension files still import from it — needs a separate grep.

### Light-dep-tree goal — ACHIEVED

- `@okf-kb/cli` `dependencies` = `@okf-kb/auth`, `@okf-kb/protocol`, `@trpc/client`, `commander` — no `@okf-kb/daemon`, no `@okf-kb/fs`, no `@okf-kb/core`.
- No `@xenova/transformers` or `better-sqlite3` in the runtime dependency closure.
- The only `@okf-kb/daemon` reference in cli source is the dynamic `import('@okf-kb/daemon')` at `main.ts:131` (not a `dependencies` entry).

### CLI tsconfig.json — correct

- `{"path": "../auth"}` added to `references` ✓
- `{"path": "../daemon"}` kept in `references` ✓ (needed for the dynamic import to typecheck in-workspace; to be removed in `split-daemon-binary`)

### Task doc update needed?
- Yes — append to `## Implementation notes`:
  - Slice 02 landed. `@okf-kb/cli` runtime deps = `@okf-kb/auth`, `@okf-kb/protocol`, `@trpc/client`, `commander`. Light-dep-tree goal achieved.
  - `@okf-kb/fs` + `@okf-kb/daemon` should be added to cli `devDependencies` (test-only; currently resolves via workspace hoisting only). Coherence-pass fix.
  - pi-adapter extension `package.json` may need `"@okf-kb/auth": "file:../../auth"` added. Coherence-pass fix.

### User attention needed?
- No. No scope changes, no API surface differences from spec. The two issues found (devDeps gap, extension file: dep gap) are latent, not blockers, and both trace to pre-existing conditions (the devDeps were never declared, even before the rename task) rather than worker errors. The parent should apply small coherence fixes.
