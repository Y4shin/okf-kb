---
kind: task
type: feature
slug: extract-auth-package
title: Extract getOrMintToken into a light @okf-kb/auth package
map: npm-publishing
status: done
blocked_by:
  - rename-to-okf-kb-scope
slices:
  - create-auth-package
  - wire-auth-into-cli-and-daemon
---

## User-visible outcome

A new light `@okf-kb/auth` package owns `getOrMintToken` and the
`@napi-rs/keyring` dependency. `@okf-kb/cli` depends on `@okf-kb/auth`
(not `@okf-kb/daemon`) for the token, so a client install no longer
transitively pulls `@okf-kb/fs` (the 95 MB `@xenova` + `better-sqlite3`).
`@okf-kb/daemon` also depends on `@okf-kb/auth` instead of owning the
token itself. Build + tests green.

## User story

As a client consumer, `npm i @okf-kb/cli` gives me a lightweight CLI that
can talk to a remote daemon — without downloading 95 MB of embedder/sqlite
I'll never use. As the daemon operator, `okfkbd` (next task) carries the
weight. The token logic is shared, not duplicated.

## Scope boundaries

- **In scope**: new `packages/auth` (`@okf-kb/auth`); move
  `packages/daemon/src/auth.ts` → `packages/auth/src/`; move the
  `@napi-rs/keyring` + `env-paths` deps from `@okf-kb/daemon` to
  `@okf-kb/auth`; update `@okf-kb/daemon` to re-export `getOrMintToken`
  from `@okf-kb/auth` (or update import sites); update `@okf-kb/cli` to
  import `getOrMintToken` from `@okf-kb/auth` and **drop its dep on
  `@okf-kb/daemon`**.
- **Out of scope**: moving the `kb daemon` subcommand out of the CLI
  (that's `split-daemon-binary`); changing the token format or keyring
  behavior; publishing.
- The daemon's `getOrMintToken` *public re-export* can stay for
  backward-compat with any in-repo caller, but the canonical home is
  `@okf-kb/auth`.

## Acceptance criteria

- `packages/auth/package.json` exists: `name: @okf-kb/auth`,
  `dependencies: @napi-rs/keyring, env-paths`, builds with `tsc`, has
  `exports`/`types` like the other packages.
- `packages/auth/src/auth.ts` (moved from daemon) exports
  `getOrMintToken` + `GetOrMintTokenOptions`.
- `@okf-kb/daemon` `package.json` no longer lists `@napi-rs/keyring`/
  `env-paths` as direct deps (they move to auth); daemon depends on
  `@okf-kb/auth`.
- `@okf-kb/cli` `package.json` **no longer depends on `@okf-kb/daemon`**
  — depends on `@okf-kb/auth` + `@okf-kb/protocol` + `@trpc/client` +
  `commander`.
- **Crucially**: the client CLI still works for all *client* commands
  (read/list/search/config) — it gets the token via `@okf-kb/auth` and
  the daemon URL via env/flag. The `okfkb daemon` subcommand still works
  in this task via a **dynamic import of `@okf-kb/daemon`** — keep it
  for now (next task removes it). Since it's dynamic, it doesn't force
  the daemon dep into `@okf-kb/cli`'s `dependencies`; but it *will* fail
  at runtime if `@okf-kb/daemon` isn't installed. That's acceptable for
  this slice and is fixed by `split-daemon-binary`.
- `npm run typecheck` clean; `npm test` 217 pass.

## Implementation notes

### Slice 01 — create-auth-package (landed)

Landed commit `a49d4a9` ("wip: create-auth-package move auth.ts to
@okf-kb/auth and rewire daemon") on `slice/create-auth-package`, merged
into `main` as `5adf98c` with `--no-ff` (slice branch deleted). Verified
on `main`: `npm run typecheck` clean; `npm test` **218 passed / 1
skipped** (up from the slice-doc's 217 baseline — the moved auth test
suite is now counted from `packages/auth`).

- **`@okf-kb/auth` created** (`packages/auth/`): `package.json` with
  `name: @okf-kb/auth`, `type: module`, `main`/`exports`/`types` to
  `./dist/index.js`/`.d.ts`, `scripts: { build, typecheck }`, and
  `dependencies: { "@napi-rs/keyring": "^1.3.0" }` **only** — **no
  `env-paths`**. `tsconfig.json` extends the base, composite, mirrors
  `@okf-kb/protocol`. `src/index.ts` re-exports `getOrMintToken` +
  `GetOrMintTokenOptions` from `./auth.js`.
- **`auth.ts` moved** `packages/daemon/src/auth.ts` →
  `packages/auth/src/auth.ts` (git rename, 95% similarity; only the
  header comment `@okf-kb/daemon` → `@okf-kb/auth` changed). The keyring
  constants are byte-identical: `SERVICE = 'kb'` and `ACCOUNT =
  'daemon'` (lines 9-10), so existing minted tokens keep resolving.
  `packages/daemon/tests/auth.test.ts` → `packages/auth/tests/auth.test.ts`
  (git rename, 97% similarity; 6 tests, identical test names).
- **`@okf-kb/daemon` rewired**: `src/auth.ts` + `tests/auth.test.ts`
  deleted; `src/index.ts` re-exports `getOrMintToken` +
  `GetOrMintTokenOptions` from `@okf-kb/auth`; `src/server.ts` imports
  `getOrMintToken` from `@okf-kb/auth`; `package.json` has
  `@napi-rs/keyring` removed and `@okf-kb/auth: "*"` added; root
  `tsconfig.json` references `packages/auth` **before** `packages/daemon`,
  and `packages/daemon/tsconfig.json` references `../auth`.

**Arch-spec correction over the slice doc (coherence fix to follow).**
The slice doc `01-create-auth-package.md` acceptance criteria list
`env-paths ^4.0.0` as a dependency of `@okf-kb/auth` and say to remove
`env-paths` from `@okf-kb/daemon`. The arch spec explicitly contradicts
this: `env-paths` is used by `packages/daemon/src/deps.ts` for `KB_HOME`
(`envPaths('kb')`), **not** by `auth.ts`, and must stay in
`@okf-kb/daemon`. The implementation correctly followed the arch spec —
`@okf-kb/auth` depends on `@napi-rs/keyring` only, and `@okf-kb/daemon`
keeps `env-paths` in its `dependencies`. The slice doc's `env-paths`
mention is therefore stale vs the arch spec and should be corrected in a
follow-up coherence sweep (doc-only; no source/test/config change).

Out of scope for this slice and untouched: `@okf-kb/cli`,
`@okf-kb/pi-adapter`, `startDaemon`/`buildCommonDeps`/`deps.ts` logic —
all reserved for slice `02-wire-auth-into-cli-and-daemon`.

### Slice 02 — wire-auth-into-cli-and-daemon (landed)

Landed commit `d15d60c` ("wip: wire-auth-into-cli-and-daemon cli imports
auth, drops daemon/core deps") on `slice/wire-auth-into-cli-and-daemon`,
merged into `main` with `--no-ff` (slice branch deleted). Verified on
`main`: `npm run typecheck` clean; `npm test` **218 passed / 1 skipped**.

- **`@okf-kb/cli` runtime deps** = `@okf-kb/auth`, `@okf-kb/protocol`,
  `@trpc/client`, `commander` — **no `@okf-kb/daemon`**, **no
  `@okf-kb/fs`**, **no `@okf-kb/core`** (the latter two also dropped from
  `dependencies` in this commit). The light-dep-tree goal is achieved:
  the transitive closure of cli's runtime deps is `@napi-rs/keyring`,
  `@trpc/server`, `zod`, `commander` — `@okf-kb/core` depends on `zod`
  only, so `@xenova/transformers` / `better-sqlite3` (which live solely in
  `@okf-kb/fs`) are unreachable from cli.
- **`getOrMintToken`** imported statically from `@okf-kb/auth` at
  `packages/cli/src/main.ts:7` (comments at lines 3 and 19 updated to
  reference `@okf-kb/auth`).
- **Dynamic `import('@okf-kb/daemon')`** kept at `main.ts:131` inside
  `runDaemon` for the `okfkb daemon` subcommand — runtime-only, not a
  `dependencies` entry. Removed in `split-daemon-binary`.
- **pi-adapter extension** `packages/pi-adapter/extension/src/config.ts:6`
  switched its `getOrMintToken` import to `@okf-kb/auth` (comment at line
  18 updated).
- **cli `tsconfig.json`** `references` adds `../auth`; `../daemon` kept
  (needed for the dynamic import to typecheck in-workspace; removed in
  `split-daemon-binary`).

**Pre-existing devDeps gap (coherence-pass fix).** `@okf-kb/cli`'s
`devDependencies` = `{@types/node, typescript, vitest}` and do **not**
declare `@okf-kb/fs` or `@okf-kb/daemon`, yet the CLI test file
(`packages/cli/tests/commands.test.ts`) imports `FakeEmbedder` from
`@okf-kb/fs` and `startDaemon` from `@okf-kb/daemon`. These resolve only via
npm workspace hoisting (root `node_modules`). Tests pass in the monorepo
but the declared devDeps are incomplete — fix by adding `@okf-kb/fs` and
`@okf-kb/daemon` to cli `devDependencies` in a coherence pass. This does
not affect the light runtime dep tree.

## Existing abstractions to use

- The `Embedder`/`Kb` DI seam in `@okf-kb/core` is unaffected — this is
  purely the auth/token seam.
- npm workspaces: just add `packages/auth` and it's part of the
  workspace automatically.

## Relevant architecture / domain decisions

- This extraction is **what makes the client/daemon install-weight split
  real**. Without it, `okfkb` would transitively pull `@okf-kb/fs` (95 MB)
  through `@okf-kb/daemon`. The owner's explicit reason for two binaries
  was the weight separation; the auth extraction is the load-bearing
  piece.
