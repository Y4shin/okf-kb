# Architecture spec — `kb-client-js-api`

> Shared across all slice chains for task `kb-client-js-api`. Lives at
> `docs/tasks/kb-client-js-api/arch-spec.md` (stable; slice chains read it).
> The verified prototype in `reference/core.prototype.ts` +
> `reference/core-usage.prototype.ts` is the proven skeleton for slice 1.

## Monorepo layout (npm workspaces)

```
package.json              # workspaces: ["packages/*"], scripts (build/test/typecheck/kb)
tsconfig.base.json        # strict, target es2022, module nodenext, moduleResolution nodenext
vitest.config.ts          # workspace-wide vitest
packages/
  core/                   # @kb/core — pure (zod only). types + builder + interfaces + binding-record type
    src/index.ts          # re-exports everything
    src/types.ts          # Ref/Actor/Rule/Slug/IsoDate/Tag/Vector/Type/Predicate
    src/frontmatter.ts    # FrontmatterSchema + families (Generated/VerifiedEntry/Source/Relation)
    src/results.ts        # NoteView/SearchHit/ListEntry/PutResult/DeleteResult/CheckReport
    src/manifest.ts       # ManifestSchema, CommonDeps, Base, Utility, Embedder interfaces
    src/builder.ts        # createKb, KbCollector, Composer (conditional-intersection gate), lift
    src/bindings.ts       # GroupBindings<G> mapped type + per-method *InputSchema (with .meta)
    tsconfig.json         # extends base, composite
    package.json
  fs/                     # @kb/fs — heavy deps (sqlite-vec, transformers.js, yaml, markdown parser)
    src/index.ts
    src/utility.ts        # DefaultUtility (computeId/validate/frontmatterFor/normalize/stampProvenance)
    src/embedder.ts       # TransformersEmbedder (impl Embedder); FakeEmbedder for tests
    src/local-fs.ts       # FsLocalFs
    src/read.ts           # FsRead
    src/search.ts         # FsSearch (sqlite-vec literal/graph/vector, RRF, chunking, update, checkId, graph)
    src/write.ts          # FsWrite (parse/validate/stamp/write/index.md/log/search.update)
    src/index-admin.ts    # FsIndexAdmin (buildIndex/rebuildIndexes/check)
    src/chunk.ts          # splitByHeadings (per-section chunking, parent-note pointer)
    src/db.ts             # openDb (.kb/index.db), migrations, sqlite-vec load
    src/check.ts          # runChecks (A1–A7, B1–B5, B7=error, B8) — manifest-driven
    tsconfig.json
    package.json
  daemon/                 # @kb/daemon — builds Kb, serves /trpc + /mcp, Bearer auth
    src/index.ts          # main(): load deps, build Kb, start server
    src/server.ts         # http server, /trpc + /mcp handlers, auth middleware
    src/trpc.ts           # routerFromBindings(bindings) — each binding -> .query/.mutation
    src/mcp.ts            # mcpServerFromBindings(bindings) — each binding -> MCP tool
    src/auth.ts           # getOrMintToken (keyring via @napi-rs/keyring, KB_TOKEN fallback)
    tsconfig.json
    package.json
  cli/                    # @kb/cli — the `kb` binary; thin tRPC client; commands from bindings
    src/index.ts          # main(): parse argv, route to command or `kb daemon`
    src/client.ts         # createTrpcClient(url, token)
    src/commands.ts       # registerCli(name, inputSchema, meta.cli) loop over binding records
    bin/kb.js             # #!/usr/bin/env node -> dist
    tsconfig.json
    package.json
tests/
  fixtures/               # small OKF bundles (a few concept/term/decision notes + relations)
    minimal/              # conforms; kb check passes
    orphaned-glossary/    # a term defined but never linked -> B7 error
    dead-relation/        # relation target missing -> B3 error
```

### Workspace root `package.json` (scripts)

```jsonc
{
  "name": "pi-knowledgebase",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run -ws --if-present build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --build"
  }
}
```

Each package `package.json` has `"scripts": { "build": "tsc", "typecheck": "tsc --noEmit" }`
(core/fs/daemon/cli); CLI also `"bin": { "kb": "./bin/kb.js" }`.

## Slice 1 — `core-types-and-builder` (`@kb/core`, size l)

### Exports (planned public API surface)

Port the verified prototype into `packages/core` split across the files above.
Public exports from `@kb/core`:

- **Primitives + enums**: `SlugSchema`/`Slug`, `IsoDateSchema`/`IsoDate`,
  `TagSchema`/`Tag`, `VectorSchema`/`Vector`, `TypeSchema`/`Type`
  (`term|concept|decision|reference|generic`), `PredicateSchema`/`Predicate`,
  `RuleSchema`/`Rule` (`A1..A7, B1..B5, B7, B8` — **no A6, no B6** per
  `okf-format-adaptation`).
- **Ref**: `IdRefSchema`/`IdRef`, `PathRefSchema`/`PathRef`, `parseRef`,
  `formatRef`, `RefSchema`/`Ref`, `RefInput` (`Ref | string`).
- **Actor**: `AgentActorSchema`/`AgentActor`, `HumanActorSchema`/`HumanActor`,
  `ProcessActorSchema`/`ProcessActor`, `parseActor`, `formatActor`,
  `ActorSchema`/`Actor`, `ActorInput` (`Actor | string`).
- **Frontmatter families**: `SourceSchema`/`Source`, `GeneratedSchema`/
  `Generated`, `VerifiedEntrySchema`/`VerifiedEntry`, `RelationSchema`/
  `Relation`, `FrontmatterSchema`/`Frontmatter` (`.passthrough()`), internal
  `Note`.
- **Results**: `NoteViewSchema`/`NoteView`, `SearchHitSchema`/`SearchHit`
  (`mode: literal|graph|semantic`), `ListEntrySchema`/`ListEntry`,
  `PutResultSchema`/`PutResult`, `DeleteResultSchema`/`DeleteResult`,
  `CheckReportSchema`/`CheckReport`.
- **DI + manifest**: `Utility` interface (`computeId`/`validate` + internal
  `frontmatterFor`/`normalize`/`stampProvenance` — expose as a wider
  `Utility` interface with the authoring helpers, used by `@kb/fs`), `Embedder`
  interface, `ManifestSchema`/`Manifest`, `CommonDeps`, `Base`.
- **Group interfaces**: `LocalFs`, `Read`, `Search`, `Write`, `IndexAdmin`
  (params typed `RefInput`/`ActorInput` exactly as the prototype).
- **Per-method input schemas** (with `.meta({cli,doc,…})` tags): `GetInputSchema`,
  `ListInputSchema`, `GraphInputSchema`, `PutInputSchema`, `DeleteInputSchema`,
  `SearchTextInputSchema`, `SearchSemanticInputSchema`, `SearchUnifiedInputSchema`,
  `SearchUpdateInputSchema`, `CheckIdInputSchema`, `ResolvePathInputSchema`,
  `ResolveIdInputSchema`, `DirForInputSchema`, `PathForInputSchema`,
  `CheckInputSchema`, `BuildIndexInputSchema`, `RebuildIndexesInputSchema`.
  For no-arg methods (e.g. `buildIndex`, `rebuildIndexes`, `check`,
  `spaceRoot`), the input schema is `z.object({}).optional()` or
  `z.void()` — must still satisfy `GroupBindings` (output === method param).
- **Builder**: `createKb` (overloaded: no-arg → `KbCollector<{}>`, with-deps
  generic over call site), `KbCollector<C>` (`usingSpace/usingManifest/
  usingUtil/usingEmbedder`/`declare`), `Composer<C,G>` (conditional-intersection
  gate), `Kb<G>`.
- **Enforcement type**: `GroupBindings<G>`, `MethodBinding<F>`,
  `EXCLUDED` sentinel (a branded value meaning "deliberately omitted"; the
  mapped type requires the key but accepts the sentinel).

### Existing abstractions to use

- The **verified prototype** (`reference/core.prototype.ts` +
  `reference/core-usage.prototype.ts`) — port, don't reinvent. It already
  compiles clean under `tsc --strict` + Zod 4.4 and proves every gate fires.
- Zod v4: `z.infer`, `.meta(obj)` / `.meta()` reads, `z.toJSONSchema` (for
  the MCP/CLI slices later), `.passthrough()` for OKF §11.
- The type/predicate vocab is fixed by `okf-format-adaptation` (5 types, 8
  predicates, the exact Rule set).

### Do NOT reimplement

- Do **not** add fs, sqlite, embedder, or yaml imports to `@kb/core` — it is
  pure (only `zod`). Slice 2 owns the heavy impls.
- Do **not** write a runtime for the group methods — the `make*` stubs stay
  as `throw new Error('impl in @kb/fs')` or are removed entirely (the builder
  only assembles interfaces; real impls are injected in slice 2). Decide:
  keep `ComposerImpl` with stubs that throw (so the builder runs) but no
  real logic.
- Do **not** encode the `check` rule *runner* here — `@kb/core` exports the
  `Rule` enum + `CheckReport` shape; slice 2's `check.ts` runs them against a
  manifest.
- Do **not** hand-write CLI commands, tRPC procedures, or MCP tools — slices
  3–4 generate them from the binding records.

### Interface contract (what slice 2 calls)

Slice 2 (`@kb/fs`) imports from `@kb/core`:
- the group interfaces (`LocalFs`/`Read`/`Search`/`Write`/`IndexAdmin`) to
  `implements` them;
- `CommonDeps`/`Utility`/`Embedder`/`Manifest` for construction;
- all the schemas + `parseRef`/`formatRef`/`parseActor`/`formatActor` for
  boundary parsing and stamping;
- `GroupBindings` + the per-method `*InputSchema` (slice 3/4 build consumers
  from records, but the records *type* lives in core so both daemon + cli
  compile against the same shape).

Slice 2 produces `DefaultUtility` + `TransformersEmbedder` + the five
`Fs*` classes, and the daemon (slice 3) composes them via the builder.

## Slice 2 — `fs-groups-and-sqlite-index` (`@kb/fs`, size xl)

### Exports

- `DefaultUtility` (implements `Utility`): `computeId`, `validate`, plus
  the internal authoring helpers (`frontmatterFor`, `normalize`,
  `stampProvenance`) exposed on the same class for `FsWrite`.
- `TransformersEmbedder` (implements `Embedder`): in-process
  `@xenova/transformers`, offline, configurable model (default a small
  sentence embedder), shape cached under `.kb/`.
- `FakeEmbedder` (test double: deterministic hash → fixed-dim vector; no
  model download) — used by slice 2's own tests and slice 3/4 tests so they
  don't pull a 100–300 MB model.
- `FsLocalFs`, `FsRead`, `FsSearch`, `FsWrite`, `FsIndexAdmin` — each
  constructed from `CommonDeps` (+ `embedder` for Search/IndexAdmin), each
  `implements` the `@kb/core` group.
- `openDb(space)` → sqlite-vec `Database` at `<space>/.kb/index.db` with
  migrations; `loadSqliteVec()` (load extension).
- `splitByHeadings(body)` → `Chunk[]` (`{headingPath: string[]; text: string}`);
  parent-note `Ref` attached at store time.
- `runChecks(bundle, manifest)` → `CheckReport` (A1–A7, B1–B5, B7=error, B8).

### Existing abstractions to use

- `@kb/core` interfaces + schemas (slice 1) — implement, don't redefine.
- `sqlite-vec` for **all three** indexes (vectors + literal + graph) in one
  `.kb/index.db`. FTS5 is acceptable for the literal index if sqlite-vec's
  literal support is thin; decide at impl time but keep it in the same db.
- `@xenova/transformers` for the embedder. `yaml` (or `gray-matter`) for
  frontmatter parse; a lightweight markdown parser for headings/links (e.g.
  `marked`/`micromark`/`remark` — pick the smallest that gives heading +
  link AST; do not pull a full MDX stack).
- The manifest drives type→dir routing, predicate vocab, and which `check`
  rules are enabled. Load `manifest.yaml` from the bundle root.

### Do NOT reimplement

- Do **not** re-parse `Ref`/`Actor` — use `@kb/core`'s `parseRef`/
  `parseActor`/the schemas at the boundary.
- Do **not** add a file-watcher indexer (out of scope v1). `Search.update`
  is an explicit per-file call, not a fs watch.
- Do **not** reach the Silverbullet HTTP API — transport inside the daemon
  is filesystem only (research-confirmed `SB_FS_WATCH=auto` picks up disk
  writes).
- Do **not** make graph a rank signal. `graph()` is a mode + optional
  `withGraph` context attachment, never a RRF input.

### Interface contract (what slice 3 calls)

Slice 3 (daemon) imports `@kb/fs`'s `DefaultUtility`, `TransformersEmbedder`,
and the five `Fs*` classes, builds `CommonDeps` (`env-paths` for `$KB_HOME`,
load `manifest.yaml`), and runs the typestate builder:
`createKb(commonDeps).declare().withRead().withSearch().withWrite()
.withLocalFs().withIndexAdmin().build()`.

The daemon does **not** import `@kb/fs`'s internal `db`/`chunk`/`check`
modules — only the public group classes + utility + embedder.

## Slice 3 — `daemon-trpc-and-mcp` (`@kb/daemon`, size l)

### Exports

- `startDaemon(opts: { space?: string; port?: number })` — load deps, build
  `Kb`, start the HTTP server on `127.0.0.1`, return a handle.
- `routerFromBindings<G>(kb: Kb<G>, bindings: GroupBindings<G>)` → tRPC
  router (each binding → `.query`/`.mutation` with `.input(b.inputSchema)`).
- `mcpServerFromBindings<G>(kb: Kb<G>, bindings: GroupBindings<G>)` → MCP
  server (each binding → MCP tool with `inputSchema` from
  `z.toJSONSchema(b.inputSchema)`, `meta.mcp` hints).
- `getOrMintToken()` → keyring via `@napi-rs/keyring` (`KB_TOKEN` env
  fallback); mint + store on first run if both empty.
- `kb daemon` is the CLI entry (slice 4 wires `kb daemon` to `startDaemon`).

### Existing abstractions to use

- `@trpc/server` for `/trpc` (router inferred by clients → exhaustiveness
  propagates across the wire).
- `@modelcontextprotocol/sdk` for `/mcp` (separate path; JSON-RPC + SSE).
- `@napi-rs/keyring` for the token; `env-paths` for `$KB_HOME`.
- `@kb/core`'s `GroupBindings` + per-method `*InputSchema` as the single IDL.
- The binding records are **loops**, not codegen: `for (const [name,b] of
  Object.entries(bindings)) router[name] = publicProcedure.input(b.inputSchema).query(({input}) => kb.<group>.<name>(input))`.

### Do NOT reimplement

- Do **not** duplicate the input schemas — they come from `@kb/core`.
- Do **not** write per-method handlers by hand — loop the records.
- Do **not** add TLS or non-localhost binding in v1 (127.0.0.1 only).
- Do **not** include `Write` in the pi-facing binding subset — that's a
  per-consumer binding record (`piBindings` omits `write.put`/`write.delete`,
  marked `EXCLUDED` or a separate record). The daemon *has* `Write`; pi's
  client type simply doesn't expose it. Decide: ship one `fullBindings`
  record (all groups) for the daemon's own router + CLI, and a `piBindings`
  subset type for slice "pi adapter" (next task) to consume.

### Interface contract (what slice 4 calls)

Slice 4 (CLI) imports `startDaemon` (for `kb daemon`) and, more importantly,
constructs a tRPC **client** against `/trpc` using the router type exported
by the daemon package (or a shared `@kb/protocol` re-export of the router
type + binding records). To avoid a circular dep (cli → daemon → fs → core,
and daemon → cli for nothing), put the **binding records + router type** in
a small `@kb/protocol` package (or in `@kb/core` as `bindings/protocol.ts`)
so both daemon and cli import it without cli importing daemon.

> **Refinement during porting:** extract `packages/protocol` holding
> `fullBindings: GroupBindings<…>` (all groups), `piBindings` (subset), and
> `type AppRouter = typeof routerFromBindings(...)` as a *type* export, so
> the CLI does `import type { AppRouter } from '@kb/protocol'` and
> `createTRPCProxyClient<AppRouter>()`. The daemon imports the *runtime*
> `routerFromBindings`. This keeps the dependency graph acyclic:
> `protocol → core`; `daemon → protocol, fs`; `cli → protocol`. Update the
> monorepo layout above to add `packages/protocol` (small, pure, depends
> only on `@kb/core`).

## Slice 4 — `cli-client` (`@kb/cli`, size m)

### Exports

- `runCli(argv: string[])` — parse, route to `kb daemon` or a group command.
- `registerCli(name, inputSchema, metaCli, handler)` — the loop that builds
  a command per binding (positional vs `--flag`/`-x` from `.meta({cli})`,
  `--help` from `meta.doc.desc`, env fallback from `meta.cli.env`).
- `kb <command>` for each bound method; `--json` output mode; exit codes.

### Existing abstractions to use

- `@trpc/client` (`createTRPCProxyClient<AppRouter>()`) against the daemon.
- `@kb/protocol`'s `AppRouter` type + `fullBindings` record → command list.
- An arg framework: **commander** (stable, widely understood) as the
  command host, with the per-binding registration layered on top. (The
  generated-from-records loop drives registration; commander provides
  `--help` plumbing and subcommand routing.)

### Do NOT reimplement

- Do **not** import `@kb/fs` in the CLI — it is a *client*. Only
  `@kb/protocol` (types + binding records) + `@trpc/client`.
- Do **not** hand-write each command body — loop the records; the type-check
  catches drift.
- Do **not** do fs writes from the CLI — `kb put` sends the file's content
  to the daemon's `write.put` over tRPC.

### End-to-end (cross-slice, verified in slice 4's tests)

- Start daemon (slice 3) + a Docker SB test fixture (manual task), `kb put
  concept:foo --file note.md` → note on disk → appears in open SB UI
  (`SB_FS_WATCH=auto`).
- `kb search "topic"` → RRF-blended hits from the daemon.
- `kb check` passes on a conformant fixture; fails (B7=error) on
  `tests/fixtures/orphaned-glossary/`.

## Cross-cutting decisions

- **`packages/protocol`** (added during porting): pure, depends only on
  `@kb/core`. Holds `fullBindings`/`piBindings` records and the `AppRouter`
  type. Keeps `cli → protocol`, `daemon → protocol + fs` acyclic.
- **`tsc --strict` is the enforcement gate**, run as `npm run typecheck`
  (workspace `tsc --build`) and in CI. Slice 1 proves the gate with a test
  that adds a method to a group and shows the binding record fails to
  compile (a `tests/strictness.test-d.ts` or a small fixture + a script).
- **Vitest** workspace-wide; per-package tests. `@kb/core` near-100%;
  `@kb/fs` integration-heavy (tmp bundle + `FakeEmbedder` + tmp
  `.kb/index.db`).
- **ESM** (`"type": "module"`), Node 24, TS 5.9+, `module: nodenext`,
  `moduleResolution: nodenext`. Composite project refs for `tsc --build`.
- **FakeEmbedder** is the test seam that keeps slices 2–4 reproducible
  without a model download; real `TransformersEmbedder` is exercised in one
  opt-in integration test (gated/skipped if the model isn't cached).
