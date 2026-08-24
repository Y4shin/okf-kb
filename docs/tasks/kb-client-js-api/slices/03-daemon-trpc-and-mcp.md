---
kind: slice
slug: daemon-trpc-and-mcp
title: KB daemon — tRPC (/trpc) + MCP (/mcp) surfaces, Bearer auth, token from keyring
task: ../task.md
mode: afk
status: done
size: l
blocked_by: [fs-groups-and-sqlite-index]
---

## End-to-end behavior

The **daemon** (`kb daemon` or managed) builds the one `Kb` instance from
`CommonDeps` (space = `$KB_HOME` or `--space`, manifest loaded, transformers.js
embedder, sqlite-vec index) and exposes **two localhost-HTTP surfaces**,
both Bearer-authenticated: **`/trpc`** (tRPC, for the CLI and the pi
extension — TS, end-to-end typed) and **`/mcp`** (MCP, for any MCP client).
Both are generated from the same Zod input schemas + `GroupBindings<G>`
binding records — one IDL, two projections. Adding a method to a group
makes the daemon's binding record fail to compile until bound (the
exhaustiveness guarantee).

## Acceptance criteria

- **`kb daemon`** loads `manifest.yaml` from the space, constructs
  `CommonDeps` (`env-paths` for `$KB_HOME`, `DefaultUtility`, transformers.js
  `Embedder`), builds the `Kb` via the typestate builder, and starts an
  HTTP server on localhost.
- **`/trpc`**: a tRPC router built **from the binding records** — each
  binding (`inputSchema` + `meta`) becomes a `.query`/`.mutation` with
  `.input(b.inputSchema)`. The router type is inferred by tRPC clients
  (the CLI + pi extension), so the `keyof Group` exhaustiveness propagates
  across the wire (a method missing from the bindings is missing from the
  router and the client type).
- **`/mcp`**: an MCP server (separate path, so MCP idiosyncrasies don't
  touch tRPC); each binding → an MCP tool with `inputSchema` from
  `z.toJSONSchema(b.inputSchema)` and `meta.mcp` hints. Supports the MCP
  initialize/tools/call flow (and SSE for streaming, where applicable).
- **Bearer auth**: both surfaces require `Authorization: Bearer <token>`.
  Token retrieved from the **OS keyring via `@napi-rs/keyring`** (Keychain /
  Credential Vault / Secret Service), with a **`KB_TOKEN` env fallback** for
  CI/headless. Missing token → daemon won't start (or generates one on first
  run and stores it in the keyring).
- **Localhost only** in v1 (bind 127.0.0.1). No TLS.
- **Pi-facing surface omits `Write`**: the pi client (next task) is a tRPC
  client whose type simply doesn't include the `write` procedure (the
  daemon *has* `Write`, but pi's client is built from a pi-shaped binding
  subset — or pi just doesn't call `write`). Confirm the shape: a
  per-consumer binding subset is the clean way (the `GroupBindings<G>` for
  pi omits `Write.put`/`Write.delete`).
- **OpenRPC emit (optional)**: a `kb openrpc` command that walks the
  binding records → `z.toJSONSchema` → emits the transport-agnostic
  `methods[]` spec (read-only artifact).

## Test plan

- **Seams**: tRPC router build from records; MCP tool build from records;
  auth middleware; keyring read/env fallback; `Kb` construction.
- **Failure modes**: missing token (env unset + keyring empty) → clear
  error; bad token → 401; corrupt manifest → won't start; a method added
  to a group without a daemon binding → `tsc` error (the enforcement).
- **Scenarios**: start the daemon, call `/trpc`'s `read.get` from a tiny
  tRPC client with the token → returns the note; call `/mcp`'s `search`
  tool from an MCP client → returns hits; a CLI (next slice) calls the
  daemon; both surfaces reject a missing/invalid bearer token.
- **Edge cases**: daemon restart preserves `.kb/index.db`; concurrent
  clients; a binding that's `EXCLUDED` for one consumer (pi omits `Write`)
  still compiles (the mapped type allows the sentinel).

## Constraints and dependencies

- Depends on `@kb/core` + `@kb/fs`. Deps: `@trpc/server`, an MCP SDK
  (`@modelcontextprotocol/sdk`), `@napi-rs/keyring`, `env-paths`, an HTTP
  server (e.g. the one tRPC/MCP use).
- Localhost only; no remote in v1.
- The token is daemon authn (stops another local process driving the KB),
  not network security.
- No codegen for the wrappers — they loop the binding records. Codegen is
  read-only OpenRPC (optional here).

## Implementation notes

### What was built

- **`@kb/protocol`** (`packages/protocol`): `fullBindings` (all 5 groups'
  binding records, each entry `{inputSchema, meta}` `satisfies
  GroupBindings<G>`), `piBindings` (pi-facing subset where `write.put`/
  `write.delete` are `EXCLUDED`), `buildRouter(kb)` (loops the binding
  records into a nested tRPC router — each group → a sub-router of
  `.input(b.inputSchema).query/.mutation` procedures that call
  `kb.<group>.<method>(input)`; no per-method handlers), and `type
  AppRouter = ReturnType<typeof buildRouter>` (the CLI imports only this
  type for `createTRPCProxyClient<AppRouter>()`). Also exports
  `flattenBindings` (flat list of non-EXCLUDED bindings, used by the MCP
  projection).
- **`@kb/daemon`** (`packages/daemon`): `startDaemon(opts)` (builds
  `CommonDeps`, constructs the real `Fs*` classes, mounts `/trpc` + `/mcp`
  + `GET /` health, binds `127.0.0.1` only, returns `{url, port, token,
  close()}`), `getOrMintToken()` (keyring via `@napi-rs/keyring` → `KB_TOKEN`
  env → mint-on-first-run `crypto.randomUUID` + store in keyring), and
  `buildCommonDeps(opts)` (resolves space from `KB_HOME`/`--space`/
  `env-paths('kb').data`, loads `manifest.yaml` or `defaultManifest`,
  constructs `DefaultUtility` + `TransformersEmbedder`).
  - **`/trpc`**: tRPC router from `buildRouter(kb)` via the node-http
    adapter, Bearer-authenticated.
  - **`/mcp`**: MCP server on a **separate path** so MCP idiosyncrasies
    don't touch tRPC. Stateless mode — a fresh `McpServer` +
    `StreamableHTTPServerTransport` per `/mcp` POST. Bearer-authenticated.
  - **Bearer auth** on both `/trpc` and `/mcp` via `checkBearer()`; token
    from keyring + `KB_TOKEN` env + mint-on-first-run.
  - **127.0.0.1 only**, no TLS.
- **80 tests pass + 1 skipped** (the skipped one is the pre-existing
  transformers.js embedder integration test in `@kb/fs`). Protocol: 9
  tests (records exhaustiveness). Daemon: 21 tests (auth 5, deps 7,
  server 9).

### Deviations from the spec

1. **`@kb/protocol` depends on `@trpc/server` + `zod` (not only
   `@kb/core`)** — `buildRouter` is a runtime function (not just a type),
   so the protocol package must import `@trpc/server` to construct the
   router. The CLI imports only `type AppRouter` (a type-level dependency,
   no runtime dep on the server libs beyond the type). The dependency
   graph stays acyclic (protocol → core, protocol → trpc/server; daemon →
   protocol → core/fs; cli → protocol for the type). The spec's
   "protocol → core only" constraint was unsatisfiable because the router
   factory needs `initTRPC` at runtime. **Update the cross-cutting note in
   the task doc's Architecture notes** accordingly.
2. **`mcpServerFromBindings` is internal** — it is NOT re-exported from
   the daemon's public index (`src/index.ts`). Only `startDaemon`,
   `getOrMintToken`, and `buildCommonDeps` are public. The MCP server is
   created and managed internally by `startDaemon`'s `/mcp` handler.
3. **MCP passes raw Zod schemas to `registerTool`** (the SDK converts to
   JSON Schema internally) rather than calling `z.toJSONSchema` explicitly
   as the acceptance criteria suggested. The `McpServer.registerTool` API
   accepts a Zod schema object directly in its `inputSchema` field.
4. **No-arg method records use `z.undefined()`** — the core's own no-arg
   schemas (e.g. `CheckInputSchema`) use `z.void()`, but `z.void()` has
   `_output` type `void`, not `undefined`, which doesn't satisfy
   `GroupBindings<G>` (where `Parameters<F>[0]` for a no-arg method is
   `undefined`). `z.undefined()` has `_output` type `undefined` and
   satisfies the mapped type. This affects `spaceRoot`, `buildIndex`,
   `rebuildIndexes`, and `check`.

### Other implementation notes

- **Builder not used at runtime**: the daemon constructs the real `Fs*`
  classes directly rather than calling `createKb(deps).declare()…build()`.
  The builder's `make*` stubs throw at call time; the builder's purpose is
  compile-time type gating, which the `Fs*` classes satisfy via
  `implements`.
- **MCP stateless mode**: each `/mcp` POST creates a fresh `McpServer` +
  `StreamableHTTPServerTransport` (no session ID). Binding registration is
  cheap. A stateful mode could reuse a server but adds complexity — not
  needed for v1.
- **tRPC basePath**: the standalone adapter requires `basePath: '/trpc/'`
  (trailing slash); the client's `httpBatchLink` URL is `${url}/trpc`.
