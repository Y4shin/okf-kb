# Slice 3 — daemon-trpc-and-mcp — TDD Result

## Summary

Implemented the `@kb/protocol` + `@kb/daemon` packages for the `kb-client-js-api` task.
The daemon builds Kb from `@kb/fs` implementations, exposes two localhost HTTP
surfaces (`/trpc` and `/mcp`), both Bearer-authenticated, plus a health endpoint.

## What was built

### `@kb/protocol` (packages/protocol) — pure, depends only on `@kb/core`

- **`src/records.ts`**: `fullBindings` — per-group binding records (`localFsBindings`,
  `readBindings`, `searchBindings`, `writeBindings`, `indexAdminBindings`) assembled
  into one `fullBindings` object typed `satisfies FullBindings`. Each entry has
  `inputSchema` (from `@kb/core`'s per-method `*InputSchema`) + `meta.desc`.
  `GroupBindings<G>` enforces exhaustiveness per group (a missing method → tsc error).
  Also `piBindings` — the pi-facing subset where `write.put`/`write.delete` are
  `EXCLUDED` (the sentinel).
- **`src/router.ts`**: `buildRouter(kb)` — builds a tRPC router where each binding →
  a `publicProcedure.input(b.inputSchema).query/.mutation` that calls
  `kb.<group>.<method>(input)`. Each group becomes a nested sub-router so the client
  addresses procedures as `read.get`, `write.put`, etc. Exports `type AppRouter =
  ReturnType<typeof buildRouter>`.
- **`src/index.ts`**: re-exports `fullBindings`, `piBindings`, `buildRouter`,
  `flattenBindings`, `AppRouter`, `AllGroups`, `PiGroups`, `FullBindings`.

### `@kb/daemon` (packages/daemon) — depends on `@kb/core` + `@kb/fs` + `@kb/protocol`

- **`src/auth.ts`**: `getOrMintToken()` — reads from OS keyring via `@napi-rs/keyring`
  (service 'kb', account 'daemon'); if absent, reads `KB_TOKEN` env; if both absent,
  mints `crypto.randomUUID()`, stores in keyring, returns it. Test-seam: accepts
  `opts.entry` for mocking.
- **`src/deps.ts`**: `buildCommonDeps(opts)` — resolves space (`KB_HOME` env or
  `--space` or `env-paths('kb').data`), loads `manifest.yaml` or falls back to
  `defaultManifest`, constructs `DefaultUtility` + `TransformersEmbedder` (or
  injected `FakeEmbedder`).
- **`src/trpc.ts`**: `createTrpcHandler(kb, token)` — mounts the tRPC router (from
  `@kb/protocol/buildRouter`) with the node-http adapter + Bearer auth. `checkBearer`
  helper.
- **`src/mcp.ts`**: `mcpServerFromBindings(kb, bindings)` — each binding → an MCP
  tool (name `group.method`, inputSchema from zod, handler calls
  `kb.<group>.<method>(input)`). Uses `McpServer.registerTool`.
- **`src/server.ts`**: `startDaemon(opts)` → `{url, port, token, close()}` — builds
  `CommonDeps`, constructs the real `Fs*` classes, mounts `/trpc` + `/mcp` + `GET /`
  (health), binds `127.0.0.1` only, ephemeral port for tests. Bearer auth on both
  `/trpc` and `/mcp`.
- **`src/index.ts`**: re-exports `startDaemon`, `getOrMintToken`, `buildCommonDeps`.

## Tests (21 new, all passing)

- `packages/protocol/tests/records.test.ts` (9 tests): fullBindings has every method
  of every group (count checks), piBindings omits Write (EXCLUDED).
- `packages/daemon/tests/auth.test.ts` (5 tests): env fallback, mint path, keyring
  priority, headless fallback, empty keyring → env.
- `packages/daemon/tests/deps.test.ts` (7 tests): space resolution, KB_HOME env,
  DefaultUtility construction, embedder injection, defaultManifest fallback,
  manifest.yaml loading.
- `packages/daemon/tests/server.test.ts` (9 tests): health GET /, tRPC write.put →
  read.get round-trip, 401 on missing/bad token, MCP tools/list + tools/call, 401
  on missing/bad MCP token.

## Commands run

- `npm install` (added `@trpc/server`, `@modelcontextprotocol/sdk`, `@napi-rs/keyring`,
  `env-paths`, `@trpc/client`)
- `npx tsc --build` (full workspace typecheck — clean)
- `npx vitest run` (full suite — 80 passed, 1 skipped)

## Divergence from plan

1. **No-arg method input schemas**: The arch spec/task doc suggested `z.void()` for
   no-arg methods (`buildIndex`, `rebuildIndexes`, `check`, `spaceRoot`). However,
   `z.void()` has `_output` type `void`, not `undefined`, which doesn't satisfy
   `GroupBindings<G>` (where `Parameters<F>[0]` for a no-arg method is `undefined`).
   Used `z.undefined()` instead, which has `_output` type `undefined` and satisfies
   the mapped type. The core's own `CheckInputSchema` etc. use `z.void()` but were
   never assembled into a `satisfies GroupBindings<IndexAdmin>` record, so the mismatch
   was never caught before.

2. **Builder not used at runtime**: The arch spec says "runs the typestate builder:
   `createKb(deps).declare().withRead()...build()`". However, the builder's `make*`
   stubs throw `'impl in @kb/fs'` at method-call time. The daemon constructs the real
   `Fs*` classes directly instead of using the builder's output. The builder's purpose
   is compile-time type gating; the `Fs*` classes satisfy the group interfaces via
   `implements`. This is a pragmatic choice — the builder could be extended to accept
   injected implementations, but that's out of scope for this slice.

3. **MCP server per request**: The `McpServer` can only be connected to one transport
   at a time. In stateless mode (no session ID), each `/mcp` POST creates a fresh
   `McpServer` + `StreamableHTTPServerTransport` (stateless). This is simple and
   correct; binding registration is cheap. A stateful mode (with session management)
   could reuse a server but adds complexity — not needed for v1.

4. **tRPC basePath**: The tRPC handler uses `basePath: '/trpc/'` (trailing slash) per
   the standalone adapter's requirement. The client's `httpBatchLink` URL is
   `${url}/trpc`.

## Notable events

- The MCP `StreamableHTTPServerTransport` requires `Accept: application/json, text/event-stream`
  headers; the test uses the MCP Client SDK (`StreamableHTTPClientTransport`) which
  handles this automatically. Raw-fetch tests for 401 auth still use manual headers.
- The `@napi-rs/keyring` `Entry.getPassword()` returns `null` (not throws) when no
  entry exists; `setPassword()` may throw on headless systems (caught and ignored —
  the minted token is returned for the process lifetime).
- `env-paths` is an ESM-only module (default export, no named export).
