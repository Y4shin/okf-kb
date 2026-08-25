# Verify — wire-auth-into-cli-and-daemon

**Slice verified — lint clean, slice tests passing, full project suite green.**

Slice commit `d15d60c` fully satisfies the load-bearing acceptance criteria.

## Gate results

### 1. Typecheck (`npm run typecheck` → `tsc --build`)
**PASS** — exit 0, no output.

### 2. Full test suite (`npm test` → `vitest run`)
**PASS** — `218 passed | 1 skipped`.
- `packages/cli/tests/commands.test.ts` (11 tests) passes — it still exercises the
  `okfkb daemon` subcommand (via dynamic import in `runDaemon`) and stands up a daemon
  fixture using `FakeEmbedder` from `@okf-kb/fs` + `startDaemon` from `@okf-kb/daemon`,
  resolving via workspace hoisting.

### 3. Load-bearing check — `packages/cli/package.json` `dependencies`
**PASS** — exactly:
```json
{ "@okf-kb/auth": "*", "@okf-kb/protocol": "*", "@trpc/client": "^11.18.0", "commander": "^14.0.0" }
```
- No `@okf-kb/daemon`, no `@okf-kb/core`, no `@okf-kb/fs`.

### 4. `packages/cli/src/main.ts`
**PASS**:
- Line 7: `import { getOrMintToken } from '@okf-kb/auth';` (static).
- Only `@okf-kb/daemon` references are comments (lines 19, 129) + the dynamic
  `const { startDaemon } = await import('@okf-kb/daemon')` at line 131. No static import.
- `grep` for `@okf-kb/core` / `@okf-kb/fs` in cli src: none.

### 5. `packages/pi-adapter/extension/src/config.ts`
**PASS** — line 2: `import { getOrMintToken } from '@okf-kb/auth';`.
(The task notes said "line 6"; it is actually line 2 in this file, but the statement
importing `getOrMintToken` from `@okf-kb/auth` is present and correct.)

### 6. `okfkb daemon` subcommand still present
**PASS** — `argv[0] === 'daemon'` branch (line 19–21) + `runDaemon` (line 129ff) both
present and unchanged in behavior. NOT removed (that's split-daemon-binary's job).

## Install-weight evidence (light client install)

`npm install --dry-run` in a clean temp dir with `@okf-kb/cli` + its declared runtime
deps (`@okf-kb/auth`, `@okf-kb/protocol`):

```
add @okf-kb/protocol 0.1.0
add @okf-kb/cli 0.1.0
add @okf-kb/auth 0.1.0
added 3 packages
```

No `@xenova/transformers`, no `better-sqlite3`, no `@okf-kb/daemon`/`@okf-kb/fs`/`@okf-kb/core`
in the client install tree. (In the monorepo `node_modules`, `@xenova/transformers` and
`better-sqlite3` are still hoisted — but they come from `@okf-kb/fs`/`@okf-kb/daemon`,
which `@okf-kb/cli` no longer depends on.)

## Observation for parent (NON-BLOCKING)

`packages/cli/tests/commands.test.ts` imports `FakeEmbedder` from `@okf-kb/fs` (line 12)
and `startDaemon` from `@okf-kb/daemon` (line 13), and `packages/cli/package.json`
`devDependencies` does NOT list `@okf-kb/fs` or `@okf-kb/daemon`. Tests pass via workspace
hoisting, but the package does not declare its own test imports. Recommend restoring them
as `devDependencies` in the coherence pass — this does NOT affect the light runtime deps
(devDeps are not installed in a production/client install).
