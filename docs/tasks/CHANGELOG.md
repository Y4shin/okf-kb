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

## 2026-08-24 — pi adapter — KB tRPC tools + kb-ask RAG skill (pi-adapter-skill-and-tools)

Implemented the first concrete adapter proving the daemon surface is
agent-agnostic: a pi extension (`packages/pi-adapter/extension`, a tRPC client
of the daemon) registering 8 KB tools from the `piBindings` subset (no
`Write` — pi authors with native `write`/`edit` + `kb_update`; tools throw on
failure per pi's contract) and a `kb-ask` pi skill (pure-markdown RAG
instructions: retrieve → lifecycle filter → context budget → grounded answer
→ cited `[Title](formatRef(ref))` → verify-before-emit → "I don't know").
115 tests + 1 skipped pass, `tsc --strict` clean. Install via `npm run
install:pi` (symlinks into `~/.pi/agent/`). Human review of answer/citation
quality is a follow-up task (`review-kb-ask-qa-quality`).
