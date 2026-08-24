---
kind: task
type: research
slug: research-sb-filesystem-and-plugs
title: Does Silverbullet pick up direct filesystem writes, and can a plug call an external service?
map: agent-knowledge-base
status: done
blocked_by: []
---

## Precise questions

1. **Filesystem-write pickup.** Does the Silverbullet *server* watch the
   space folder for externally-written files, such that a note written
   directly to disk appears in an open Silverbullet client without a client
   save? Or must writes go through `PUT /.fs/*` for the client to see them?
   This decides whether the JS API writes to disk directly or via the HTTP
   API (or both).

2. **Programmatic query surface.** What is the object index / query surface
   (SLIQ / Space Lua / `index.*` syscalls) for use *outside* the browser —
   e.g. from a CLI or Node library? Is it only available client-side, or can
   it be invoked server-side / over an HTTP/RPC endpoint?

3. **Plug outbound calls.** Can a Silverbullet plug (TypeScript) or Space Lua
   call an external HTTP service — e.g. an embedding API or the JS API's
   search endpoint — and which permissions (`fetch`) are required? This
   gates the Fog item "SB-embedded search".

4. **Link reconciliation.** Silverbullet uses `[[wikilinks]]`; OKF uses
   standard markdown links (bundle-relative `/path.md` and relative). Does
   Silverbullet index standard markdown links for backlinks, or only
   wikilinks? Which form should an OKF-in-SB bundle use so both SB graph views
   and OKF consumers work?

## Decision / task it unblocks

- Unblocks **kb-client-js-api** (transport choice for read/write, and the
  link form used for graph search).
- Unblocks the Fog item **SB-embedded search** (plug outbound-call
  feasibility) — may graduate it to a task.

## Trusted source boundaries

- Official `silverbullet.md` docs (HTTP API, Architecture, Plugs/Development,
  Space Lua) and the `silverbulletmd/silverbullet` GitHub repo, including the
  Rust server source for filesystem-watching behavior.
- No third-party blog posts as primary evidence; they may corroborate only.

## Evidence required for completion

- For Q1: documented behavior + a **minimal empirical test** — write a file
  into a running SB space folder, reload the SB client, observe whether it
  appears without a client save. Record the outcome (and whether
  `X-Sync-Mode`/sync interferes).
- For Q2–Q4: cite the specific doc pages / source files that answer each,
  with short quoted passages.

## Findings (decision log)

### Q1 — Filesystem-write pickup: YES, by default
The Silverbullet **server** ships a native filesystem watcher (`notify` crate,
`server/src/watcher.rs`) backing a `GET /.events` SSE endpoint. `SB_FS_WATCH=auto`
(default) watches the space folder natively and pushes external changes to open
clients, so a note written directly to the folder appears in an already-open
client without a client save. The client sync engine consumes the SSE push and
reconciles the specific file promptly; if the push path is down it falls back to
~20s full-space polling.
- Source: `docs/Install/Configuration.md` (`SB_FS_WATCH` semantics);
  `server/src/watcher.rs` (`emits_change_event_for_new_file` test,
  `EventOriginKind::External`); `server/src/handlers/events.rs` (`/.events` SSE);
  `client/service_worker/sync_engine.ts` (consumes push).
- **Caveats**: requires the client service worker / Sync enabled
  (`SB_DISABLE_SERVICE_WORKER` disables the realtime push, but loads still hit
  the server so external writes appear on next navigation); `SB_FS_WATCH=off`
  reverts to periodic polling; `poll` (~2s) is recommended for network mounts
  (NFS/SMB) where cross-machine writes produce no native events.
- **Implication**: direct filesystem writes are a valid primary transport for a
  local deployment — the JS API can write to disk and SB will see it without
  HTTP. HTTP `/.fs` is a fallback/optional transport, not a requirement.

### Q2 — Programmatic query surface: client-side only (confirmed)
SLIQ / Space Lua / the `index.*` syscalls run in the **browser client**, not on
the server. The server is a dumb file store + auth. So an external JS API/CLI
builds and queries its own index over the bundle on disk; it cannot invoke SB's
in-browser query engine.
- Source: `docs/Architecture` (three layers; 90%+ of logic runs client-side);
  `docs/Plugs/Development/Reference` (plugs run in the client).

### Q3 — Plug outbound calls: YES, with `fetch` permission
A Silverbullet plug (TypeScript) or Space Lua can call an external HTTP service
(e.g. an embedding API or the JS API's search endpoint) by declaring
`requiredPermissions: [fetch]` in its `*.plug.yaml`. The `fetch` syscall is the
mechanism.
- Source: `docs/Plugs/Development/Reference` (`requiredPermissions`; `fetch`;
  syscall examples).
- **Implication**: the Fog item "SB-embedded search" is feasible — a SB plug can
  call the JS API's `search()` over HTTP/local-socket. It graduates from Fog to a
  candidate task once `kb-client-js-api` exposes `search()` over a transport a
  plug can reach (HTTP).

### Q4 — Link reconciliation: SB indexes BOTH wikilinks AND standard markdown links
**This is the key fact for OKF.** Silverbullet's relation indexer
(`plugs/index/relation.ts`) handles `WikiLink` nodes **and** standard markdown
`Link`/`Image` nodes, emitting a `mention` relation with `toTag: "page"` for any
local markdown link whose resolved path ends in `.md`. Both `[text](path.md)`
(relative) and `[text](/path.md)` (space-relative, leading slash stripped)
produce the same backlink a `[[wikilink]]` does. A regression test
(`plugs/index/relation.test.ts`) proves `[the target](Target.md)` emits the
relation `to:"Target", kind:"mention"`.
- Source: `plugs/index/relation.ts` + `relation.test.ts`; `plug-api/lib/resolve.ts`
  (`resolveMarkdownLink` strips leading `/`); `plug-api/lib/ref.ts`
  (`parseToRef("/foo")` → `{path:"foo.md"}`); `docs/Linked Mention.md`.
- **Caveats**: only links resolving to an in-space `.md` page produce page
  backlinks; external URLs → `toTag:"url"` (no backlink); non-`.md` local paths →
  `toTag:"document"`. No literal test for the `/path.md` form, but
  `resolveMarkdownLink`+`parseToRef`+`isMarkdownPath` make it unambiguous.
- **Implication**: we standardize on **OKF-conformant standard markdown links**
  (not wikilinks). SB backlinks work, and pure-OKF consumers see the graph too.
  This settles `okf-format-adaptation`'s link-form question.

## Likely dependent tasks (updated)

- `kb-client-js-api`: transport = filesystem primary (Q1 confirms it works);
  HTTP optional. Link form for graph search = standard markdown links (Q4).
- Fog `sb-embedded-search`: feasible (Q3) — graduates to a task once the JS API
  exposes `search()` over HTTP.
- `okf-format-adaptation` link-form decision: settled by Q4 (markdown links).

## Evidence

Full source-cited findings in
`evidence-sb-filesystem-and-links.md` (this task's directory).
