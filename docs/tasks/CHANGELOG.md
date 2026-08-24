# Task Changelog

## 2026-08-24 — KB daemon + core library + CLI (tRPC/MCP) (kb-client-js-api)

Implemented the agent-agnostic JS API surface as an npm-workspace monorepo:
`@kb/core` (Zod-verified types, typestate builder, `GroupBindings` exhaustiveness
via `tsc --strict`), `@kb/fs` (5 fs-backed group classes; better-sqlite3 +
JSON-blob embeddings + JS cosine — sqlite-vec dropped because its fixed-dim
`vec0` conflicts with the pluggable `Embedder` seam; FTS5 literal; RRF k=60;
`check()` with B7=error), `@kb/protocol` + `@kb/daemon` (one IDL → tRPC `/trpc`
+ MCP `/mcp`, Bearer auth via keyring+env, localhost only, `piBindings` omits
`Write`), and `@kb/cli` (tRPC client; commands generated from the binding
records; `kb daemon`). 90 tests + 1 skipped pass, `tsc --strict` clean. pi is
the next consumer (the daemon's tRPC client).
