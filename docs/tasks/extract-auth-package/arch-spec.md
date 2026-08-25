# Architecture Spec — `extract-auth-package`

Extract the token logic (`getOrMintToken` + `@napi-rs/keyring`) from
`@okf-kb/daemon` into a new light **`@okf-kb/auth`** package, so the client
CLI can depend on `@okf-kb/auth` instead of `@okf-kb/daemon` — severing
the transitive chain `cli → daemon → fs → [@xenova 68 MB, sqlite 27 MB]`.
After this task, `@okf-kb/cli`'s `dependencies` no longer list
`@okf-kb/daemon`; a client install is light.

This is the load-bearing piece of the whole npm-publishing architecture:
without it, the two-binary split (`okfkb` light client / `okfkbd` heavy
daemon) is cosmetic, because `okfkb` would still pull 95 MB transitively.

## Slices

- **01 — create-auth-package:** new `packages/auth` workspace package
  (`@okf-kb/auth`) owning `getOrMintToken` + `GetOrMintTokenOptions`;
  `@okf-kb/daemon` re-exports it from `@okf-kb/auth` and drops
  `@napi-rs/keyring` from its deps; auth test moves to the new package.
  Build + tests green; daemon still works (re-export).
- **02 — wire-auth-into-cli-and-daemon:** `@okf-kb/cli` imports
  `getOrMintToken` from `@okf-kb/auth` (static) and **drops
  `@okf-kb/daemon` from `dependencies`**; the `okfkb daemon` subcommand
  keeps a dynamic `import('@okf-kb/daemon')` (runtime-only, removed in
  `split-daemon-binary`). pi-adapter extension switches its
  `getOrMintToken` import to `@okf-kb/auth`. Verify the client dep tree
  is light.

## Existing abstractions to use

- **npm workspaces** — adding `packages/auth` auto-joins the workspace
  (root `workspaces: ["packages/*"]`); no root edit needed.
- **tsc project references** — the new package needs a `tsconfig.json`
  mirroring `@okf-kb/protocol` (`composite`, `rootDir: src`, `outDir:
  dist`, `references` to its deps). Add `packages/auth` to the root
  `tsconfig.json` `references` list so `tsc --build` includes it.
- **`@okf-kb/protocol`'s package.json/tsconfig** as the structural
  template (exports/types/build/typecheck scripts).
- The auth code itself (`packages/daemon/src/auth.ts`) is dependency-free
  except `@napi-rs/keyring` + `node:crypto` (builtin). It moves as-is.

## Do NOT reimplement

- Do not change `getOrMintToken`'s behavior, signature, or the keyring
  `SERVICE='kb'` / `ACCOUNT='daemon'` strings — existing minted tokens
  in the OS keyring must keep resolving. This is a *move*, not a rewrite.
- Do not change `env-paths` ownership: it stays in `@okf-kb/daemon`
  (used by `deps.ts` for KB_HOME resolution). **Only `@napi-rs/keyring`
  moves to `@okf-kb/auth`.** (This corrects the map's earlier note that
  env-paths moves — verified it does not; auth.ts doesn't use it.)
- Do not remove the `okfkb daemon` subcommand (that's
  `split-daemon-binary`). Slice 02 keeps it via a dynamic import.
- Do not touch `startDaemon`, `buildCommonDeps`, or any daemon server
  logic — only the auth import source changes.

## Seams under test

1. **New package compiles** — `tsc --build` includes `packages/auth`;
   `@okf-kb/auth` exports `getOrMintToken` + `GetOrMintTokenOptions`.
2. **Auth behavior unchanged** — the moved auth test
   (`packages/auth/tests/auth.test.ts`, relocated from
   `packages/daemon/tests/auth.test.ts`) passes: env fallback, keyring
   fallback, mint path, env-priority-over-keyring, headless fallback,
   empty-keyring-entry. Same 6 tests, same assertions.
3. **Daemon still works** — `@okf-kb/daemon` re-exports
   `getOrMintToken`; `server.ts` resolves it (via re-export or direct
   `@okf-kb/auth` import); `packages/daemon/tests/server.test.ts` passes
   (starts a daemon on an ephemeral port).
4. **CLI still works** — `@okf-kb/cli` gets the token via `@okf-kb/auth`;
   client commands resolve; the `okfkb daemon` subcommand still runs
   (dynamic import of `@okf-kb/daemon`, present in the workspace).
   `packages/cli/tests/commands.test.ts` passes.
5. **Client dep tree is light** — `@okf-kb/cli`'s `dependencies` no
   longer include `@okf-kb/daemon` (or `@okf-kb/fs`). A dry-run install
   of `@okf-kb/cli` does not pull `@xenova/transformers` or
   `better-sqlite3`. (Verified via `npm ls` / dep inspection.)
6. **Full suite** — `npm test` green (218 passed, 1 skipped — the
   baseline after `rename-to-okf-kb-scope`).

## Interface contract (for downstream tasks)

After this task:

- **`@okf-kb/auth`** is a new public package: `getOrMintToken`,
  `GetOrMintTokenOptions`. Deps: `@napi-rs/keyring` only.
- **`@okf-kb/daemon`** depends on `@okf-kb/auth` (re-exports
  `getOrMintToken` for backward-compat); its `server.ts` imports
  `getOrMintToken` from `@okf-kb/auth` (or its own re-export — pick
  direct `@okf-kb/auth` for clarity). `@napi-rs/keyring` removed from
  daemon deps.
- **`@okf-kb/cli`** `dependencies` = `@okf-kb/auth`, `@okf-kb/protocol`,
  `@trpc/client`, `commander` — **no `@okf-kb/daemon`, no
  `@okf-kb/fs`**. `getOrMintToken` imported statically from
  `@okf-kb/auth`. The `okfkb daemon` subcommand uses a dynamic
  `import('@okf-kb/daemon')` (not a `dependencies` entry).
- **`@okf-kb/pi-adapter`** `extension/src/config.ts` imports
  `getOrMintToken` from `@okf-kb/auth` (not `@okf-kb/daemon`); the
  extension's `package.json` dep on `@okf-kb/daemon` can stay (it uses
  `startDaemon`? check — actually the extension is a tRPC client, it
  doesn't call `startDaemon`; it may be able to drop the daemon dep
  too, but that's not required here — leave the extension's deps
  alone unless the import change forces it).

Downstream `split-daemon-binary` removes the dynamic `import()` and
the `okfkb daemon` subcommand entirely, completing the severance.

## Exact edit map

### Slice 01 — create-auth-package

**New package `packages/auth/`:**
- `package.json`: `name: @okf-kb/auth`, `type: module`, `version: 0.1.0`,
  `main`/`exports`/`types` to `./dist/index.js`/`.d.ts` (mirror
  `@okf-kb/protocol`), `scripts: { build: tsc, typecheck: tsc --noEmit }`,
  `dependencies: { "@napi-rs/keyring": "^1.3.0" }`, `devDependencies:
  { typescript: ~5.9, vitest: ^3, @types/node: ^22 }`.
- `tsconfig.json`: `{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "rootDir": "src", "outDir":
  "dist" }, "references": [], "include": ["src"] }` (no project-ref
  deps — auth depends only on `@napi-rs/keyring`, a registry package).
- `src/auth.ts`: moved from `packages/daemon/src/auth.ts` (byte-equivalent
  logic; update the header comment `// @okf-kb/daemon — auth: ...` →
  `// @okf-kb/auth — auth: ...`).
- `src/index.ts`: `export { getOrMintToken } from './auth.js'; export
  type { GetOrMintTokenOptions } from './auth.js';`
- `tests/auth.test.ts`: moved from `packages/daemon/tests/auth.test.ts`;
  update the import `from '../src/auth.js'` (unchanged — relative) and
  the header comment.

**Root `tsconfig.json`:** add `{ "path": "packages/auth" }` to the
`references` array (so `tsc --build` includes it). Place it before
`packages/daemon` (auth is a dep of daemon).

**`@okf-kb/daemon` changes:**
- `package.json`: remove `"@napi-rs/keyring": "^1.3.0"` from
  `dependencies`; add `"@okf-kb/auth": "*"`.
- `src/auth.ts`: **delete** (moved to @okf-kb/auth). Replace with a
  re-export shim OR delete entirely and update import sites. **Decision:
  delete `daemon/src/auth.ts`** and update `daemon/src/index.ts` +
  `daemon/src/server.ts` to import `getOrMintToken` from `@okf-kb/auth`
  directly. (Cleaner than a re-export shim; the daemon's public surface
  can still re-export from `@okf-kb/auth` in `index.ts` for
  backward-compat.)
- `src/index.ts`: `export { getOrMintToken } from '@okf-kb/auth';`
  (re-export, so `@okf-kb/daemon`'s public API is unchanged for any
  in-repo caller); `export type { GetOrMintTokenOptions } from
  '@okf-kb/auth';`. Update the header comment.
- `src/server.ts:15`: `import { getOrMintToken } from './auth.js';` →
  `import { getOrMintToken } from '@okf-kb/auth';`.
- `tsconfig.json`: add `{ "path": "../auth" }` to `references` (daemon
  now depends on auth).
- `tests/auth.test.ts`: **delete** (moved to @okf-kb/auth). (Or keep a
  thin re-export test — not needed; the auth package tests it.)

**Verify:** `npm install` (workspace picks up new package), `npm run
typecheck`, `npm test` — 218 passed, 1 skipped (the auth tests now
run from `packages/auth`, daemon's server test still passes).

### Slice 02 — wire-auth-into-cli-and-daemon

**`@okf-kb/cli` changes:**
- `package.json` `dependencies`: **remove `@okf-kb/daemon`**; **add
  `@okf-kb/auth`**. Final deps: `@okf-kb/auth`, `@okf-kb/protocol`,
  `@trpc/client`, `commander` (and `@okf-kb/core`? — check if cli imports
  `@okf-kb/core` directly; if not, drop it. The grep shows cli imports
  only `@okf-kb/protocol` + `@okf-kb/daemon`; so drop `@okf-kb/core` too
  unless a `@okf-kb/core` import exists. **Verify via grep before
  removing.**)
- `src/main.ts:7`: `import { getOrMintToken } from '@okf-kb/daemon';`
  → `from '@okf-kb/auth';`.
- `src/main.ts:3` comment: `@okf-kb/daemon's getOrMintToken` →
  `@okf-kb/auth's getOrMintToken`.
- `src/main.ts:131`: `const { startDaemon } = await
  import('@okf-kb/daemon');` — **keep** (dynamic; the `okfkb daemon`
  subcommand stays). This dynamic import is the *only* remaining
  `@okf-kb/daemon` reference in cli; it's runtime-only and removed in
  `split-daemon-binary`.
- `tsconfig.json`: add `{ "path": "../auth" }` to `references`; **remove
  `{ "path": "../daemon" }`**? — NO: the dynamic import still needs the
  type/resolve at build for the workspace, but since `@okf-kb/daemon` is
  no longer a `dependency`, tsc project-ref may not need it. **Decision:
  keep `../daemon` in cli's tsconfig references** so the dynamic
  import typechecks in-workspace; it's removed in `split-daemon-binary`.

**`@okf-kb/pi-adapter/extension/src/config.ts:6`:**
`import { getOrMintToken } from '@okf-kb/daemon';` → `from
'@okf-kb/auth';`. Update the comment on line 18. (The extension's
`package.json` dep on `@okf-kb/daemon` — leave for now; the extension
doesn't call `startDaemon`, but dropping the dep is out of scope for
this slice. If tsc complains, add `@okf-kb/auth` to the extension's
`file:` deps.)

**Verify the light dep tree:**
- `npm run typecheck` + `npm test` green (218 passed, 1 skipped).
- Grep `@okf-kb/cli/package.json` `dependencies`: no `@okf-kb/daemon`,
  no `@okf-kb/fs`.
- Grep `packages/cli/src/` for `@okf-kb/daemon`: only the dynamic
  `import('@okf-kb/daemon')` in `main.ts:131` (runDaemon). No static
  import.
- (Stretch) `npm pack --dry-run` on `@okf-kb/cli` from a clean state and
  confirm `@xenova/transformers`/`better-sqlite3` are not in the
  bundled dep tree.

## Risks / watch-outs

- **Keyring `SERVICE='kb'` / `ACCOUNT='daemon'`** must stay byte-identical
  in the moved `auth.ts` — existing deployments have minted tokens under
  that keyring entry; changing the string would orphan them.
- **`@okf-kb/cli`'s `@okf-kb/core` dep:** verify whether cli imports
  `@okf-kb/core` directly before dropping it. The grep at spec time
  shows cli imports only `@okf-kb/protocol` + `@okf-kb/daemon`; if
  `@okf-kb/core` is unused, drop it (it would otherwise be a stray dep).
- **Dynamic import in cli:** `await import('@okf-kb/daemon')` works in
  the workspace (daemon is present) and in tests. A *client-only* install
  of `@okf-kb/cli` (without `@okf-kb/daemon`) would fail at runtime if
  `okfkb daemon` is invoked — that's expected and is fixed by
  `split-daemon-binary`. Document it in the slice result.
- **pi-adapter extension `file:` deps:** the extension's
  `package.json` uses `file:../../daemon` etc. After switching the import
  to `@okf-kb/auth`, the extension may need `file:../../auth` added.
  Check and add if tsc/npm fails.
- **`package-lock.json`:** will regenerate after `npm install` (new
  package). Commit it.
- **Root `tsconfig.json` order:** add `packages/auth` before
  `packages/daemon` in `references` so the build order is correct
  (auth before its dependent).
