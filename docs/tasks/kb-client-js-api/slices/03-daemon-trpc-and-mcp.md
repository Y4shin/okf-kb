---
kind: slice
slug: daemon-trpc-and-mcp
title: KB daemon — tRPC (/trpc) + MCP (/mcp) surfaces, Bearer auth, token from keyring
task: ../task.md
mode: afk
status: todo
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
