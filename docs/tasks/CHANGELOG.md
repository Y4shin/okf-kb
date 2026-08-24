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

## 2026-08-24 — Second-brain curation skills (second-brain-curation)

Three sibling pi skills for on-demand KB expansion: `kb-curate` (shared
rules: 5-type selection with `generic` as gauge, provenance, lifecycle
/never-self-promote/deprecate-with-consent, native-write + `kb_update` +
`kb_check_id`, link-don't-duplicate, edit-anything+git), `kb-save-session`
(distill the current session — extract-not-verbatim, sources→session
transcript, re-distill links), `kb-research` (research a topic via
`web_search`/`fetch_content` + repo into sourced notes — no-sources→don't
fabricate, conflicting-sources→separate entries). Pure-markdown skills on
the `kb_*` tools; auto-gated by content/structure tests (44 tests across
the 3 skills; 178 total). `install:pi` now globs `skill/*`. Human review of
note quality is a follow-up task. `tsc --strict` clean.

## 2026-08-24 — Remote-agent daemon access (remote-daemon-conditional-write)

The KB daemon can be exposed to other machines: `startDaemon` takes a
`host` (default `127.0.0.1`) and **refuses a non-localhost bind without TLS**
(`KB_DAEMON_TLS_CERT`/`KEY` or the `KB_ALLOW_REMOTE_INSECURE=1` escape
hatch, which warns). `GET /` advertises capabilities (`groups` from
`fullBindings`). The pi adapter's `isRemoteKb(KB_URL)` conditionally
activates `kb_put`/`kb_delete` (full `AppRouter` + `fullBindings`, 10
tools) when remote — a remote agent authors **through the daemon** since
its native `write`/`edit` can't reach the remote bundle. Localhost behavior
unchanged (8 tools, no `kb_put`/`kb_delete`). **Recommended** path: daemon
on `127.0.0.1` + a caddy/nginx TLS reverse proxy (`docs/remote-deployment.md`
with systemd + caddyfile snippets, threat model, governance). 217 tests +
1 skipped, `tsc --strict` clean. Backwards compatible. Graduates the map's
"multi-agent adoption / remote deployment" Fog item.
