## Deviation report — daemon-trpc-and-mcp

### API surface changes

#### `@kb/protocol` exports

- **Planned:** `fullBindings` + `piBindings` + `type AppRouter` (refinement
  note: "holding `fullBindings`/`piBindings` records and the `AppRouter` type").
  The spec's Slice 3 section says `routerFromBindings<G>(kb: Kb<G>, bindings:
  GroupBindings<G>)` is a `@kb/daemon` export, and the daemon "imports the
  *runtime* `routerFromBindings`" from protocol.
- **Actual:** `@kb/protocol` exports `fullBindings`, `piBindings`, `buildRouter`
  (runtime, not just a type), `flattenBindings` (helper), `type AppRouter`,
  `type AllGroups`, `type PiGroups`, `type FullBindings`, `type FlatBinding`
  (`packages/protocol/src/index.ts:3-7`). The router factory is named
  `buildRouter` instead of `routerFromBindings` and lives in `@kb/protocol`
  rather than `@kb/daemon`.
- **Impact:** Slice 4 (CLI) will import `type { AppRouter } from '@kb/protocol'`
  as planned — no impact there. The rename `routerFromBindings` → `buildRouter`
  is cosmetic but documented; slice 4's doc should reference `buildRouter`.
  The signature also changed: spec says `routerFromBindings<G>(kb: Kb<G>,
  bindings: GroupBindings<G>)` (two params), actual is `buildRouter(kb:
  Kb<AllGroups>)` (one param, `fullBindings` is hardcoded internally,
  `packages/protocol/src/router.ts:63`). This means `piBindings` cannot be
  passed to `buildRouter` — it always builds the full router. The daemon's
  own router is always the full one (correct for daemon), but if a future
  caller wanted a pi-shaped router they'd need a variant. Low impact for
  slice 4 (CLI uses the full router type anyway).

#### `@kb/daemon` exports

- **Planned:** `startDaemon`, `routerFromBindings`, `mcpServerFromBindings`,
  `getOrMintToken` (arch-spec Slice 3 Exports, lines 231–238).
- **Actual:** `@kb/daemon`'s public index (`packages/daemon/src/index.ts`)
  exports `startDaemon`, `getOrMintToken`, `buildCommonDeps`,
  `defaultManifest`, `loadManifestAsync` — but does **NOT** export
  `mcpServerFromBindings`. `mcpServerFromBindings` exists as an internal
  function (`packages/daemon/src/mcp.ts:22`) used by `server.ts`, but is
  not re-exported from the package entry point. `routerFromBindings`/
  `buildRouter` is also not re-exported from `@kb/daemon` (it's only in
  `@kb/protocol`).
- **Impact:** `mcpServerFromBindings` not being public is a minor deviation.
  It's only used internally by the daemon's server. If slice 4 or a future
  consumer needs to build a standalone MCP server, they'd need the export
  added. `buildCommonDeps` being exported is an *addition* not in the spec's
  export list (spec says daemon "builds `CommonDeps`" internally), but it's
  a reasonable test seam and doesn't widen scope.

#### `buildRouter` loops records (no per-method handlers)

- **Planned:** "loops, not codegen: `for (const [name,b] of
  Object.entries(bindings)) router[name] = publicProcedure.input(b.inputSchema).query(...)`"
- **Actual:** Yes — `buildRouter` calls `flattenBindings(fullBindings)` then
  loops with `for (const fb of flat)` building each procedure dynamically
  (`packages/protocol/src/router.ts:64-85`). No per-method hand-written
  handlers. ✓

#### tRPC router type inferred

- **Planned:** `AppRouter = ReturnType<typeof buildRouter>` so CLI can share it.
- **Actual:** `export type AppRouter = ReturnType<typeof buildRouter>`
  (`packages/protocol/src/router.ts:91`). ✓

### tRPC /trpc

- **Planned:** Each binding → `publicProcedure.input(b.inputSchema).query/.mutation`
  calling `kb.<group>.<method>(input)`.
- **Actual:** Yes. `buildRouter` uses `t.procedure.input(fb.inputSchema).query(...)`
  for queries and `.mutation(...)` for mutations
  (`packages/protocol/src/router.ts:71-81`). The router is **nested per group**
  (`read.get`, `write.put`, etc. via sub-routers, `packages/protocol/src/
  router.ts:84-88`), which is the standard tRPC pattern and matches the
  client usage in tests (`client.read.get.query(...)`, `client.write.put.
  mutate(...)`). The spec's pseudo-code showed flat `router[name]` but the
  nested approach is equivalent and more ergonomic for clients. ✓

- **Query vs mutation split:** Spec says query = `get/list/search*/graph/
  checkId/check/resolve*/dirFor/pathFor/spaceRoot`; mutation = `put/delete/
  update/buildIndex/rebuildIndexes`.
- **Actual:** `QUERY_METHODS` = `get, list, searchText, searchSemantic,
  searchUnified, graph, checkId, check, resolvePath, resolveId, dirFor,
  pathFor, spaceRoot`; `MUTATION_METHODS` = `put, delete, update,
  buildIndex, rebuildIndexes` (`packages/protocol/src/router.ts:13-20`).
  Matches the spec exactly. ✓

### MCP /mcp

- **Planned:** Each binding → MCP tool with `inputSchema` from
  `z.toJSONSchema(b.inputSchema)`, `meta.mcp` hints. On its own `/mcp` path.
  initialize/tools/list/tools/call flow.
- **Actual:** Each binding → `server.registerTool(fb.qualifiedName, config,
  handler)` where `config.inputSchema = fb.inputSchema` (the raw Zod schema,
  NOT `z.toJSONSchema(...)` — `packages/daemon/src/mcp.ts:49-55`). The MCP
  SDK's `registerTool` accepts a Zod schema directly and internally converts
  to JSON Schema via `toJsonSchemaCompat` when responding to `tools/list`
  (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:75-82`).
  So the JSON Schema conversion happens, just delegated to the SDK rather
  than called explicitly via `z.toJSONSchema`. This is functionally
  equivalent but differs from the spec's literal "inputSchema from
  `z.toJSONSchema(b.inputSchema)`".
- **`meta.mcp` hints:** NOT used. The `config` only sets `description` from
  `fb.meta.desc` (`packages/daemon/src/mcp.ts:47`). No binding schema
  populates `meta.mcp` either (`packages/core/src/bindings.ts` — the `mcp?`
  field exists in the `MethodBinding` type but is never set on any schema).
  This is a no-op deviation — the hints were optional metadata that no
  binding actually carries.
- **Own `/mcp` path:** Yes — `url.startsWith('/mcp')` routes to the MCP
  handler (`packages/daemon/src/server.ts:88-105`), separate from `/trpc`.
  ✓
- **initialize/tools/list/tools/call flow:** Yes — the test
  `daemon MCP > lists tools (initialize + tools/list)` and `calls a tool`
  verify the full flow (`packages/daemon/tests/server.test.ts:126-159`),
  using `@modelcontextprotocol/sdk`'s `Client` with
  `StreamableHTTPClientTransport`. The server uses
  `StreamableHTTPServerTransport` in stateless mode (one transport per
  request, `packages/daemon/src/server.ts:94-101`). ✓

### Bearer auth on BOTH /trpc and /mcp

- **Planned:** Both surfaces require `Authorization: Bearer <token>`. Token
  from `@napi-rs/keyring` (primary) + `KB_TOKEN` env (fallback) +
  mint-on-first-run. Missing/bad token → 401.
- **Actual:** Both surfaces check bearer. `/trpc` checks in two places:
  the server's request handler (`packages/daemon/src/server.ts:72-79`) and
  the tRPC context factory (`packages/daemon/src/trpc.ts:25-28`). `/mcp`
  checks in the server handler (`packages/daemon/src/server.ts:90-95`).
  Missing/bad token → 401 JSON response. ✓
- **Token source:** `getOrMintToken()` (`packages/daemon/src/auth.ts:21-52`)
  tries keyring first (`@napi-rs/keyring` `Entry`, service 'kb', account
  'daemon'), then `KB_TOKEN` env, then mints `randomUUID()` and stores it.
  Keyring failure (headless) is caught gracefully. ✓
- **Tests:** `auth.test.ts` covers env fallback, mint path, keyring priority,
  headless fallback, empty keyring entry. `server.test.ts` tests 401 on
  both surfaces for missing AND bad tokens. ✓

### Localhost only (127.0.0.1), no TLS

- **Planned:** Bind 127.0.0.1 only, no TLS.
- **Actual:** `server.listen(port, '127.0.0.1', ...)` and
  `actualUrl = http://127.0.0.1:${actualPort}`
  (`packages/daemon/src/server.ts:129,132`). No TLS. ✓

### Pi-facing surface omits Write

- **Planned:** `piBindings` omits `write.put`/`write.delete` (marked
  `EXCLUDED` or separate record).
- **Actual:** `piBindings` has `write: { put: EXCLUDED, delete: EXCLUDED }`
  (`packages/protocol/src/records.ts:117-121`). The `EXCLUDED` sentinel is
  skipped by `flattenBindings` (`packages/protocol/src/router.ts:39`). The
  `piBindings` still `satisfies FullBindings` so it compiles. ✓
- **Note:** `piBindings` is defined but not yet used by any runtime code in
  this slice (the daemon always uses `fullBindings`). It's a type/record for
  the "pi adapter" next task. This matches the spec: "ship one `fullBindings`
  record ... and a `piBindings` subset type for slice 'pi adapter'."

### Dependency graph

- **Planned:** `@kb/protocol` pure, depends only on `@kb/core`.
  `@kb/daemon` depends on core+fs+protocol + server libs. Graph acyclic:
  `cli→protocol`; `daemon→protocol,fs`.
- **Actual:**
  - `@kb/protocol` depends on `@kb/core`, `@trpc/server`, `zod`
    (`packages/protocol/package.json`). The spec says "pure, depends only
    on `@kb/core`" but `buildRouter` calls `initTRPC.create()` requiring
    `@trpc/server`, and `records.ts` uses `z.undefined()` requiring `zod`.
    This is a **spec tension**: the refinement note says "daemon imports
    the *runtime* `routerFromBindings`" (implying the runtime fn is in
    daemon), but also says "protocol → core" only. The implementation
    resolved the tension by putting `buildRouter` in protocol (so the CLI
    shares the type without importing daemon), which necessitates
    `@trpc/server` + `zod` as protocol deps. This is a **planning failure**
    in the spec, not an implementation error — the spec's two constraints
    ("runtime in protocol" + "protocol depends only on core") are
    contradictory.
  - `@kb/daemon` depends on `@kb/core`, `@kb/fs`, `@kb/protocol`,
    `@modelcontextprotocol/sdk`, `@napi-rs/keyring`, `@trpc/server`,
    `env-paths`, `yaml`, `zod` (`packages/daemon/package.json`). ✓
  - Graph is acyclic: `protocol → core`; `daemon → protocol, fs, core`.
    No cycles. ✓ (CLI not yet built, but `cli → protocol` is planned.)

### Out-of-scope changes

- **OpenRPC emit (optional):** Correctly skipped. No `kb openrpc` command or
  OpenRPC emission code anywhere. The spec marked this optional ("optional
  — skipping is fine"). ✓
- **Scope creep:** Minimal. `buildCommonDeps`, `defaultManifest`,
  `loadManifestAsync` are exported from `@kb/daemon` as test seams — not in
  the spec's export list but reasonable and don't widen the slice's
  functional scope. `flattenBindings` is an internal helper exported from
  `@kb/protocol` used by both `buildRouter` and `mcpServerFromBindings` —
  good factoring.
- **Dead imports:** `CheckInputSchema`, `BuildIndexInputSchema`,
  `RebuildIndexesInputSchema` are imported in `packages/protocol/src/
  records.ts:29-31` but never used — the records use `z.undefined()` instead
  (`records.ts:44,67-69`). This contradicts the spec's "Do not duplicate the
  input schemas — they come from `@kb/core`". The no-arg schemas from core
  are `z.void()` while records use `z.undefined()` — functionally similar
  but inconsistent. These are dead imports that should either be used or
  removed.

### Task doc update needed?

**Yes** — append to `## Implementation notes`:
- `routerFromBindings` was renamed to `buildRouter` and lives in
  `@kb/protocol` (not `@kb/daemon`), with signature `buildRouter(kb:
  Kb<AllGroups>)` (no `bindings` param — `fullBindings` is hardcoded).
- `@kb/protocol` depends on `@trpc/server` + `zod` in addition to
  `@kb/core` (the spec's "pure, depends only on `@kb/core`" was
  unsatisfiable given the runtime `buildRouter` placement). Update the
  cross-cutting decisions to reflect this.
- `mcpServerFromBindings` is NOT exported from `@kb/daemon`'s public
  index — it's internal. Slice 4 or the pi adapter should be aware.
- MCP `inputSchema` is passed as a raw Zod schema to `registerTool`
  (the SDK converts to JSON Schema internally), not via explicit
  `z.toJSONSchema()`.
- No-arg method bindings use `z.undefined()` in records.ts, not the
  `z.void()` schemas (`CheckInputSchema` etc.) imported from `@kb/core`
  (those imports are dead).

### User attention needed?

**Yes** — the `@kb/protocol` "pure, depends only on `@kb/core`"
constraint in the arch spec is contradicted by the implementation
(protocol needs `@trpc/server` + `zod`). This is a spec-level ambiguity
that was resolved sensibly (put `buildRouter` in protocol for type
sharing), but the cross-cutting decisions section should be updated to
say `@kb/protocol` depends on `@kb/core` + `@trpc/server` + `zod`. The
dependency graph remains acyclic, so the core design goal is preserved.

---

### Acceptance criteria check (from slice doc)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `kb daemon` loads manifest + builds Kb + starts HTTP | ✓ (startDaemon does this; `kb daemon` CLI wiring is slice 4) | `server.ts:34-50`, `deps.ts:43-54`; tests `deps.test.ts`, `server.test.ts:22-34` |
| `/trpc` router from binding records | ✓ | `router.ts:63-88` loops `flattenBindings` |
| Router type inferred by tRPC clients | ✓ | `router.ts:91` `AppRouter = ReturnType<typeof buildRouter>` |
| `/mcp` each binding → MCP tool with `z.toJSONSchema` | ⚠ (raw Zod schema passed; SDK converts internally) | `mcp.ts:49-55`; SDK `mcp.js:75-82` |
| `/mcp` on own path, initialize/tools/call flow | ✓ | `server.ts:88-105`; `server.test.ts:126-159` |
| Bearer auth both surfaces | ✓ | `server.ts:72-79,90-95`; `trpc.ts:23-28` |
| Token from keyring + env fallback + mint | ✓ | `auth.ts:21-52`; `auth.test.ts` |
| Missing/bad token → 401 | ✓ | `server.test.ts:97-124` (both surfaces) |
| Localhost only, no TLS | ✓ | `server.ts:129,132` |
| Pi-facing omits Write | ✓ | `records.ts:117-121` `piBindings` |
| OpenRPC emit (optional) | ✓ (skipped) | not present |
| End-to-end tRPC read.get after write.put | ✓ | `server.test.ts:73-89` |
| MCP tool call | ✓ | `server.test.ts:141-159` |
| Both surfaces reject missing/bad bearer | ✓ | `server.test.ts:97-124` |
