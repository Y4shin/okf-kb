## Deviation report — cli-client

### API surface changes

#### `@kb/cli` exports — `runCli` + `createTrpcClient` + `AppRouter` ✔, but the registration helper is renamed

- **Planned:** arch-spec Slice 4 (line 288–291) names three exports:
  `runCli(argv)`, `registerCli(name, inputSchema, metaCli, handler)`, and
  "`kb <command>` for each bound method; `--json`; exit codes." The
  commands are "generated from the binding records (`for (const [name,b]
  of entries) registerCli(name, b.inputSchema, b.meta.cli, …)`)"
  (slice doc line 28–30).
- **Actual:** `packages/cli/src/index.ts:1-5` exports `runCli`
  (re-exported from `./main.js`), `createTrpcClient` (from `./client.js`),
  `type AppRouter` (from `./client.js`), plus `registerAllCommands` and
  `registerBindingCommand` (from `./commands.js`). There is **no export
  named `registerCli`** — the per-binding registration function is named
  `registerBindingCommand(parent, fb, ctx)` (`commands.ts:46`), and the
  loop driver is `registerAllCommands(program, ctx)` (`commands.ts:396`).
  The signature differs from the spec's
  `registerCli(name, inputSchema, metaCli, handler)`: the actual function
  takes a flattened `FlatBinding` object (which bundles `qualifiedName`,
  `inputSchema`, `meta`, and `isQuery`) plus a `CommandContext` holding the
  tRPC client, so it does **not** receive a per-command `handler` closure —
  the handler is generated internally from the binding + client.
- **Impact:** Cosmetic/structural. The generation-from-records loop is
  intact (`registerAllCommands` → `flattenBindings(fullBindings)` →
  `for (const fb of flat) registerBindingCommand(...)`, `commands.ts:397-399`),
  which is the load-bearing guarantee. Any downstream doc/slice that
  references `registerCli` by name should be updated to
  `registerBindingCommand` / `registerAllCommands`. No consumer currently
  imports the registration helper, so the rename is low-impact.

#### `bin/kb.js` — executable, but `package.json` `main` points at a non-existent path

- **Planned:** `bin/kb.js` (`#!/usr/bin/env node -> dist`) with `"bin": {"kb": "./bin/kb.js"}` (arch-spec line 51, 72).
- **Actual:** `packages/cli/bin/kb.js` exists, is `#!/usr/bin/env node`, is
  mode `0755` (executable), and imports `runCli` from `'../dist/src/index.js'`
  (`bin/kb.js:2`). The `"bin"` field in `package.json` is correct
  (`"kb": "./bin/kb.js"`). However, `package.json`'s `"main"` field is
  `"./dist/index.js"` while the compiled output lands at
  `dist/src/index.js` (because `tsconfig.json` has `"rootDir": "."` and
  `include: ["src","bin"]`, so `src/index.ts` → `dist/src/index.js`).
  `bin/kb.js` correctly imports from `../dist/src/index.js` (matching the
  real output), so the binary works — but a consumer doing
  `import { runCli } from '@kb/cli'` via the `"main"` field would fail (the
  `exports` map points at `./dist/index.js` too, which also doesn't exist).
- **Impact:** The `kb` binary works end-to-end (the built-bin test in
  `commands.test.ts:269` spawns `node packages/cli/bin/kb.js` and passes).
  Programmatic `import '@kb/cli'` would break unless the consumer targets
  `@kb/cli/dist/src/index.js` directly. No current consumer imports the CLI
  as a library, so impact is low, but the `main`/`exports` fields are
  mis-pointed and should be fixed (point to `./dist/src/index.js`).

#### Commands are `group.method` kebab-cased, not the short names in the acceptance examples

- **Planned:** The acceptance-criteria examples use short command names:
  `kb get concept:foo`, `kb list --type concept`, `kb search "topic"`,
  `kb graph concept:foo ancestors`, `kb put concept:foo --file note.md`,
  `kb delete concept:foo`, `kb check`, `kb index --update`,
  `kb rebuild-indexes`, `kb config` (slice doc lines 23–27).
- **Actual:** Every generated command is the qualified, kebab-cased
  `group.method` name: `read.get`, `read.list`, `search.search-text`,
  `search.search-semantic`, `search.search-unified`, `search.graph`,
  `search.update`, `search.check-id`, `write.put`, `write.delete`,
  `local-fs.resolve-path`, `local-fs.resolve-id`, `local-fs.dir-for`,
  `local-fs.path-for`, `local-fs.space-root`, `index-admin.build-index`,
  `index-admin.rebuild-indexes`, `index-admin.check` (verified via
  `kb --help`, `commands.test.ts:99-112`). There are **no short aliases**
  — `kb get`, `kb list`, `kb search`, `kb put`, `kb check`, `kb index`,
  `kb rebuild-indexes` are all `error: unknown command`. `kb config` and
  `kb daemon` exist as special-cased commands (`main.ts:20, 25`) but are
  the only short names. The `kb index --update` form from the spec doesn't
  exist at all (there's `search.update <ref> <content>` and
  `index-admin.build-index`, but no `kb index --update` alias).
- **Impact:** Behavioral deviation from the user-facing acceptance
  criteria. The spec's command examples (`kb get`, `kb put`, `kb search`,
  `kb check`, `kb graph`) will **not** work as written — users must type
  the fully-qualified `read.get`, `write.put`, `search.search-unified`,
  `index-admin.check`, `search.graph`. This is a deliberate design choice
  (one command per binding, derived mechanically from the record keys via
  `toKebab(fb.qualifiedName)`, `commands.ts:380-384`), and it keeps the
  generation loop uniform, but it diverges from the acceptance-criteria
  examples. **Task-doc update needed** (see below). The `--json`, `--help`,
  exit-code, and `--file`/`--content` behaviors all match.

#### `--help` per command, `--json`, exit codes — all present ✔

- **Planned:** `--help` per command (from `.meta({cli:{desc}})`), `--json`
  output mode, sensible exit codes (slice doc lines 34–35).
- **Actual:**
  - `--help` / `-h`: commander auto-generates per-subcommand help; the
    description comes from `fb.meta.desc` (fallback to the schema's
    `doc.desc`) at `commands.ts:51`; verified `kb read.get --help`,
    `kb search.graph --help`, `kb search.search-unified --help` all print
    usage + args + options. ✔
  - `--json`: extracted as a global flag in `main.ts:97-100`, threaded into
    `CommandContext.json` (`main.ts:36`), and `printResult` emits
    `JSON.stringify(result, null, 2)` when set (`commands.ts:351`). ✔
  - Exit codes: `runCli` returns 0 on success (`main.ts:55`), 1 on
    CommanderError / runtime error (`main.ts:58, 68`); `kb index-admin.check`
    returns 1 when `report.ok === false` via `CommandExitError`
    (`commands.ts:101, 336-344` → `main.ts:61-64`). Verified by the orphaned-
    glossary test (`commands.test.ts:208-219` expects `code !== 0`). ✔

### Abstraction usage

- **Used/was specified: yes.** `@trpc/client` (`createTRPCProxyClient<AppRouter>`,
  `httpBatchLink`) in `client.ts:4-5`; `@kb/protocol`'s `AppRouter` type +
  `fullBindings` + `flattenBindings` in `commands.ts:8-10` and `client.ts:5`;
  `commander` as the command host (`commands.ts:7`, `main.ts:6`); `startDaemon`
  via dynamic `import('@kb/daemon')` for `kb daemon` (`main.ts:131`). All
  four specified abstractions are present and used as the spec intended.

### Out-of-scope changes

- **Direct `@kb/fs` import in the CLI `src/` — none.** ✔
  `grep -rn "from '@kb/fs'" packages/cli/src/ packages/cli/bin/` returns nothing.
  The CLI `package.json` `dependencies` lists `@kb/core`, `@kb/protocol`,
  `@kb/daemon`, `@trpc/client`, `commander` — **no `@kb/fs`**. The "CLI is a
  client, no direct `@kb/fs` in V1" constraint (slice doc line 60) is honored
  in the shipped source. **Caveat:** the *test* file `tests/commands.test.ts:12`
  does `import { FakeEmbedder } from '@kb/fs'` — this is a test-only seam to
  spin up a daemon with a deterministic embedder, not a CLI-runtime dependency,
  and is consistent with how the daemon's own tests use `FakeEmbedder`. The
  spec's "no `@kb/fs` in V1" is about the CLI runtime, so this is acceptable,
  but it does make `@kb/fs` a (dev/transitive) dep of the CLI test target.

- **`.meta({cli})` env fallback — declared in the type but never consumed.**
  The spec says commands read "env fallback from `meta.cli.env`" (arch-spec
  line 290). The `readSchemaMeta` return type includes `env?: string`
  (`commands.ts:111`), but **no code ever reads `schemaMeta.env` or falls
  back to `process.env[env]`** — `extractFields` and `buildInput` ignore it
  entirely. None of the core input schemas currently set `cli.env` anyway
  (`bindings.ts:52-68` — only `positional`, `flag`, `short`, `desc` are set),
  so this is latent rather than broken, but it's an unimplemented spec
  feature. The only env fallback that exists is the hand-coded `KB_URL` /
  `KB_TOKEN` handling in `main.ts:33-34` (not driven by `meta.cli.env`).

- **`.kb/config` file — not implemented.** The slice doc (line 63) says
  "One config source: `KB_HOME`, `KB_TOKEN` (env), `.kb/config`; precedence
  env > config > default." The CLI reads `KB_URL`/`KB_TOKEN`/`KB_HOME` env
  vars (`main.ts:33-34, 167-169`) but **never reads a `.kb/config` file** —
  `grep -rn "\.kb/config\|readConfig\|config.yaml\|config.json" packages/cli/`
  returns nothing. The `kb config` command only *prints* the resolved
  env-based config (`main.ts:166-188`); it doesn't read or merge a config
  file. The "config > default" tier of the precedence chain is missing.
  (`@kb/daemon`'s `deps.ts` reads `manifest.yaml` from the space root but
  not a `.kb/config` either.) This is a partial implementation of the
  config contract.

- **`kb config` and `kb daemon` are hand-routed, not generated.** These
  two are special-cased at the top of `runCli` (`main.ts:20-26`) before
  the commander program is built. This is fine (`kb daemon` genuinely
  isn't a tRPC procedure; `kb config` is a local info command), but it
  means they don't go through the binding-records loop and aren't covered
  by the `tsc` exhaustiveness gate. `kb config` and `kb daemon` are not
  tested by `commands.test.ts` (no test invokes `runCli(['config', …])` or
  `runCli(['daemon', …])`).

- **Per-command special-casing for `opts`/`content`/`k`.** The generic
  `extractFields`/`buildInput` machinery skips nested `opts` objects and
  the `content`/`k` fields, then re-adds them via hand-written
  `if (fb.group === … && fb.method === …)` blocks for `write.put`
  (`--file`/`--content`), `search.searchUnified` (`--with-graph`),
  `search.searchText` (`--fields`), `search.searchSemantic` (`--k`)
  (`commands.ts:70-90, 274-300`). This is pragmatic (commander flags can't
  be mechanically derived from a nested Zod object shape without more
  machinery), but it's the one place the "generated from records, no
  hand-writing" promise bends: the *command existence* is generated, but
  the *flag surface* for these four methods is hand-coded. Adding a new
  method with a nested `opts` field would require a new special-case
  block (the `tsc` gate won't catch a missing one — it'll just produce a
  command whose `opts` flag is absent). Low risk for V1's fixed method
  set; worth noting for extensibility.

- **`GLOBAL_FLAG_KEYS` is dead code.** `main.ts:12` declares a `Set` of
  global flag keys but it is never referenced after declaration
  (`grep` confirms only the declaration line). The actual global-flag
  stripping is done imperatively in `extractGlobalOpts` (`main.ts:77-126`).
  Harmless leftover.

- **`main`/`exports` paths in `package.json` point at `./dist/index.js`
  which doesn't exist** (output is `./dist/src/index.js`). See API-surface
  note above. Not scope creep, just a packaging bug.

### Task doc update needed?

**Yes.** Append to `## Implementation notes`:

- **CLI commands are fully-qualified `group.method` (kebab-cased), not
  the short names in the acceptance examples.** The generation loop
  derives command names mechanically from `fb.qualifiedName` via
  `toKebab` (`commands.ts:380`), so the CLI exposes `read.get`,
  `write.put`, `search.search-unified`, `index-admin.check`, etc. —
  **not** `kb get` / `kb put` / `kb search` / `kb check`. The
  acceptance-criteria examples (`kb get concept:foo`, `kb put …`,
  `kb search "topic"`, `kb check`, `kb graph …`) should be read as
  `kb read.get`, `kb write.put`, `kb search.search-unified`,
  `kb index-admin.check`, `kb search.graph`. Only `kb daemon` and
  `kb config` are short names (special-cased). There is no `kb index
  --update` command — use `search.update <ref> <content>` (per-note) or
  `index-admin.build-index` (full rebuild).
- **The registration export is `registerBindingCommand` / `registerAllCommands`,
  not `registerCli`.** The loop driver is `registerAllCommands` →
  `flattenBindings(fullBindings)` → `registerBindingCommand` per flat
  binding; the spec's `registerCli(name, inputSchema, metaCli, handler)`
  signature was replaced by `registerBindingCommand(parent, fb, ctx)`.
- **`.kb/config` file reading is not implemented** — only `KB_HOME` /
  `KB_TOKEN` / `KB_URL` env vars are read. The "config > default"
  precedence tier is absent; `kb config` prints env-resolved values only.
- **`meta.cli.env` fallback is not wired** — the field is typed but never
  consumed; no core schema sets it. Env fallback is hand-coded for the
  three global vars only.
- **`package.json` `main`/`exports` point at `./dist/index.js` but the
  build emits `./dist/src/index.js`** — the `kb` binary works (it imports
  the real path), but programmatic `import '@kb/cli'` via the package
  entry would fail. Fix by pointing `main`/`exports` at `./dist/src/index.js`.
- **`@kb/cli` test file imports `@kb/fs` (`FakeEmbedder`)** to stand up a
  daemon with a deterministic embedder — test-only, not a CLI-runtime
  dependency; consistent with daemon tests.

### User attention needed?

**Yes — minor.** The user-facing command surface differs from the
acceptance-criteria examples: the short command names (`kb get`, `kb put`,
`kb search`, `kb check`, `kb graph`, `kb list`, `kb delete`) do **not**
exist; users/operators must use the fully-qualified `group.method` forms.
The end-to-end behavior (put → disk → search returns RRF hits → check
passes/fails B7) is all present and tested, just under the qualified names.
If the short aliases are desired, that's a follow-up (commander `.alias()`
per generated command, or a small name map) — but it would partially
re-introduce the hand-writing the generation loop is meant to avoid.

### Enforcement (type-check keeps CLI in sync with the daemon router)

- **Enforced — via the shared `fullBindings` record + `AppRouter` type.**
  `registerAllCommands` loops `flattenBindings(fullBindings)`
  (`commands.ts:397`), and `fullBindings` is `as const satisfies
  FullBindings` (`records.ts:75`), where `FullBindings` maps each group to
  `GroupBindings<G>` (`records.ts:62-68`). `GroupBindings<G>` is the
  exhaustiveness-enforcing mapped type (`bindings.ts:73-80`): adding a
  method to a group interface makes `fullBindings` fail `tsc` until a
  binding (or `EXCLUDED`) is added; schema drift (`inputSchema` output ≠
  method param) also fails `tsc`. The CLI's tRPC client is typed
  `createTRPCProxyClient<AppRouter>` (`client.ts:11`), where
  `type AppRouter = ReturnType<typeof buildRouter>` (`router.ts:97`) and
  `buildRouter` is built from the same `fullBindings` (`router.ts:66`).
  So: the command *list* is driven by `fullBindings` (the records), and
  the *client type* is driven by `AppRouter` (derived from the same
  records via `buildRouter`). `npx tsc --build packages/cli` passes clean
  (verified). The one gap: the hand-written flag special-cases for
  `opts`/`content`/`k` (see Out-of-scope) are **not** covered by this gate
  — a new nested-`opts` method would get a command but no flags for its
  nested fields unless someone adds a special-case block.

### Summary of conformance

| Spec item | Status |
|---|---|
| `runCli` export | ✔ `main.ts:18` |
| `createTrpcClient` export | ✔ `client.ts:11` |
| `AppRouter` type export | ✔ `client.ts:14`, re-export `index.ts:3` |
| `bin/kb.js` executable | ✔ `bin/kb.js`, mode 0755, `#!/usr/bin/env node` |
| `kb daemon` calls `startDaemon` | ✔ `main.ts:131` (dynamic import) |
| Commands loop `fullBindings` | ✔ `commands.ts:397` → `flattenBindings(fullBindings)` |
| Every group method gets a command | ✔ all 17 methods present in `kb --help` |
| `--help` per command | ✔ commander auto-gen, desc from `meta.desc` |
| `--json` output | ✔ `main.ts:97`, `commands.ts:351` |
| Exit codes (0 ok, 1 check-fail/error) | ✔ `commands.ts:336`, `main.ts:58-68` |
| Raw-string args → `Ref` via `parseRef` at boundary | ✔ via `RefSchema = z.union([…, z.string().transform(parseRef)])` (`types.ts:48`), enforced by the daemon's `.input(b.inputSchema)` |
| Token from keyring/env as Bearer | ✔ `main.ts:34` → `getOrMintToken()`; `client.ts:13` → `Bearer ${token}` |
| No direct `@kb/fs` in CLI src | ✔ (test file imports `FakeEmbedder`, acceptable) |
| `--json` parseable | ✔ `commands.test.ts:131` |
| `kb put` → note on disk | ✔ `commands.test.ts:138-149` |
| `kb search` → RRF hits | ✔ `commands.test.ts:155-163` (RRF in `fs/search.ts:127`) |
| `kb check` passes conformant / fails B7 orphaned | ✔ `commands.test.ts:194-219` |
| `KB_HOME`/`KB_TOKEN` env precedence | ✔ env-first in `main.ts:33-34` |
| `.kb/config` file | ✗ not implemented |
| `meta.cli.env` fallback | ✗ typed but unused |
| Short command aliases (`kb get`, `kb put`, …) | ✗ qualified names only |
| `registerCli` export name | ✗ renamed to `registerBindingCommand`/`registerAllCommands` |
| `package.json` `main`/`exports` path | ✗ points at non-existent `./dist/index.js` |
| `kb index --update` command | ✗ no such alias (use `search.update` / `index-admin.build-index`) |
