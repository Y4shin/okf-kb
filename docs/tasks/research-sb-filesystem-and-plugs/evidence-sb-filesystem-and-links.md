# Research: Silverbullet — Link indexing for backlinks & filesystem-write pickup

## Summary

**FACT 1 (Link indexing):** No, Silverbullet does NOT build its backlink graph from `[[wikilinks]]` only. The relation indexer (`plugs/index/relation.ts`) explicitly handles both `WikiLink` nodes *and* standard markdown `Link`/`Image` nodes, emitting a `mention` relation with `toTag: "page"` for any local markdown link whose resolved path ends in `.md`. Both `[text](path.md)` (relative) and `[text](/path.md)` (space-relative, leading slash stripped) produce backlinks. OKF-conformant standard markdown links therefore DO produce Silverbullet backlinks; you are not forced to use `[[wikilinks]]`.

**FACT 2 (Filesystem-write pickup):** Yes, by default the Silverbullet **server** watches the space folder for files written externally to disk and pushes those changes to already-open clients in near-real time. This is governed by `SB_FS_WATCH` (default `auto`), which uses the `notify` crate's native OS watcher backing the `/.events` SSE endpoint. An externally written note appears in an already-open client without a client save. Writes do NOT have to go through `PUT /.fs/*`. The `X-Sync-Mode` header is unrelated to this — it only disambiguates client API requests from browser navigation, not the sync mechanism.

## Findings

### FACT 1 — Link indexing for backlinks

1. **The relation indexer handles standard markdown links, not just wikilinks.** In `plugs/index/relation.ts`, the `indexRelations` traversal has a dedicated branch for `Link` and `Image` parse-tree nodes that runs the `mdLinkRegex` against the node text. Source: `plugs/index/relation.ts` (`silverbulletmd/silverbullet`, commit `a0782ddb` / `main`):
   > ```ts
   > if (n.type === "Link" || n.type === "Image") {
   >   mdLinkRegex.lastIndex = 0;
   >   const match = mdLinkRegex.exec(renderToText(n));
   >   if (!match) return false;
   >   const { title: alias, url } = match.groups as { url: string; title: string; };
   >   const { from, fromTag } = innermostContainer(n, pageMeta.name);
   >   const base = { from, fromTag, range: [n.from!, n.to!] as [number, number], alias, };
   >   if (!isLocalURL(url)) {
   >     emitTextualEdge(ctx, { ...base, kind: "mention", to: url, toTag: "url" });
   >     return true;
   >   }
   >   const ref = parseToRef(resolveMarkdownLink(pageMeta.name, decodeURI(url)));
   >   if (!ref) return true;
   >   if (isMarkdownPath(ref.path)) {
   >     emitTextualEdge(ctx, { ...base, kind: "mention", to: getNameFromPath(ref.path), toTag: "page" });
   >   } else {
   >     emitTextualEdge(ctx, { ...base, kind: "mention", to: ref.path, toTag: "document" });
   >   }
   >   return true;
   > }
   > ```
   Local markdown links (`isLocalURL` true AND `isMarkdownPath` true) emit a textual edge with `kind: "mention"` and `toTag: "page"` — the same relation shape wikilinks produce. `emitTextualEdge` pushes a `RelationObject` with `tag: "relation"` into the index; the legacy `link` collection (and thus backlinks/Linked Mentions) is a virtual projection over these `relation` records. [plugs/index/relation.ts](https://github.com/silverbulletmd/silverbullet/blob/a0782ddb/plugs/index/relation.ts) · [plugs/index/link.ts](https://github.com/silverbulletmd/silverbullet/blob/a0782ddb/plugs/index/link.ts)

2. **A regression test proves `[text](Target.md)` emits the same backlink-producing relation as `[[Target]]`.** `plugs/index/relation.test.ts`:
   > ```ts
   > test("local markdown link emits mention relation", async () => {
   >   const { space } = createMockSystem();
   >   await space.writePage("Target", "");
   >   const text = "See [the target](Target.md).";
   >   const tree = parseMarkdown(text);
   >   const fm = extractFrontMatter(tree);
   >   const objects = await indexRelations(pageMeta("Source"), fm, tree, text);
   >   const r = objects.find((o) => o.tag === "relation");
   >   expect(r).toBeDefined();
   >   expect(r!.kind).toEqual("mention");
   >   expect(r!.to).toEqual("Target");
   >   expect(r!.alias).toEqual("the target");
   > });
   > ```
   A separate test confirms external URLs (`https://example.com`) produce `toTag: "url"` (not a page backlink), and `attachment.pdf` produces `toTag: "document"`. [plugs/index/relation.test.ts](https://github.com/silverbulletmd/silverbullet/blob/a0782ddb/plugs/index/relation.test.ts)

3. **`/path.md` (leading-slash / space-relative) resolves to the same page as `path.md`.** `resolveMarkdownLink` in `plug-api/lib/resolve.ts` strips a leading slash:
   > ```ts
   > export function resolveMarkdownLink(absolute: string, relative: string): string {
   >   if (relative.startsWith("<") && relative.endsWith(">")) { relative = relative.slice(1, -1); }
   >   if (relative.startsWith("/")) {
   >     return relative.slice(1);
   >   } else {
   >     // resolve relative to the current page's folder ...
   >   }
   > }
   > ```
   And `isLocalURL` returns `true` for any URL without `://`, `mailto:`, or `tel:`, so both `path.md` and `/path.md` are treated as in-space local links. `parseToRef("/foo")` returns `{ path: "foo.md" }` (confirmed in `plug-api/lib/ref.test.ts`), and `isMarkdownPath` returns true when the extension is `.md`. Therefore `[text](/path.md)` emits a `toTag: "page"` mention relation → a backlink, identical to `[text](path.md)`. [plug-api/lib/resolve.ts](https://github.com/silverbulletmd/silverbullet/blob/main/plug-api/lib/resolve.ts) · [plug-api/lib/ref.ts](https://github.com/silverbulletmd/silverbullet/blob/main/plug-api/lib/ref.ts)

4. **Backlinks (Linked Mentions) are driven by the `link`/`relation` index, which the docs describe as tracking "all links between pages."** `docs/Linked Mention.md`:
   > "Linked mentions (also known as backlinks) show all pages that contain a [[Link|link]] to the current page. … SilverBullet's [[Object Index]] tracks all links between pages. The Linked Mentions widget queries this index to find pages that link _to_ the page you're currently viewing."
   The `Link` object type (`plugs/index/link.ts`) carries `type: "page" | "file" | "url"` with `toPage` for page links — projected from `relation` records. So a markdown link that resolves to a page produces the same `link.toPage` record a wikilink does. [docs/Linked Mention.md](https://github.com/silverbulletmd/silverbullet/blob/main/docs/Linked%20Mention.md) · [plugs/index/link.ts](https://github.com/silverbulletmd/silverbullet/blob/a0782ddb/plugs/index/link.ts)

   **Caveat (FACT 1):** Only links that *resolve to an in-space `.md` page* produce page backlinks. Pure-external URLs (`https://…`) become `toTag: "url"` (no backlink), and non-`.md` local paths (e.g. `attachment.pdf`) become `toTag: "document"` (a document edge, not a page backlink). Relative resolution is folder-relative to the linking page; `/path.md` is space-root-relative. The source contains no test for a `/path.md` form specifically, but the `resolveMarkdownLink` + `parseToRef` behavior makes it unambiguous.

### FACT 2 — Filesystem-write pickup

5. **The server ships a native filesystem watcher (`notify` crate) backing an SSE endpoint.** `server/src/lib.rs` exports `pub mod watcher;` and `pub use watcher::{start_watcher, FsAction, FsEvent, WatchMode};`. `server/Cargo.toml` lists `notify = { workspace = true }` and `tokio-stream = { workspace = true }` (workspace pins `notify = "8"`). `server/src/watcher.rs` header:
   > ```rust
   > //! File-system watcher backing the `/.events` SSE endpoint.
   > //!
   > //! notify (OS watcher) -> mpsc -> debounce/coalesce thread -> validation via
   > //! DiskSpacePrimitives (same visibility rules as the /.fs API) -> tokio
   > //! broadcast channel consumed by SSE subscribers.
   > ```
   A unit test confirms an externally written file produces a change event:
   > ```rust
   > #[tokio::test]
   > async fn emits_change_event_for_new_file() {
   >     let dir = tempfile::tempdir().unwrap();
   >     let tx = start_watcher(dir.path(), "", WatchMode::Auto, Arc::new(FsGuard::default()))
   >         .expect("watcher should start");
   >     let mut rx = tx.subscribe();
   >     std::fs::write(dir.path().join("test.md"), b"hello").unwrap();
   >     let ev = tokio::time::timeout(Duration::from_secs(3), rx.recv()).await
   >         .expect("timed out waiting for event").unwrap();
   >     assert_eq!(ev.name, "test.md");
   >     assert_eq!(ev.action, FsAction::Change);
   >     assert!(ev.last_modified > 0);
   > }
   > ```
   `FsAction` is `Change | Delete | Resync`; events carry an `origin` of `User` (for writes the server expected) or `External` (for writes from other programs). [server/src/watcher.rs](https://github.com/silverbulletmd/silverbullet/blob/main/server/src/watcher.rs) · [server/Cargo.toml](https://github.com/silverbulletmd/silverbullet/blob/main/server/Cargo.toml)

6. **The `/.events` SSE endpoint streams those FsEvents to clients.** `server/src/router.rs` registers `.route("/.events", get(crate::handlers::events::handle_events))`. `server/src/handlers/events.rs`:
   > ```rust
   > //! GET /.events -- Server-Sent Events stream of file-system change events.
   > ```
   It subscribes to the watcher's `broadcast::Sender<FsEvent>`, serializes each event as SSE `data`, and returns 404 when no watcher is running (`fs_events: None`). A 30s named `ping` event keeps the connection alive and refreshes the client's realtime-health TTL. [server/src/handlers/events.rs](https://github.com/silverbulletmd/silverbullet/blob/main/server/src/handlers/events.rs) · [server/src/router.rs](https://github.com/silverbulletmd/silverbullet/blob/main/server/src/router.rs)

7. **The official Configuration docs state plainly that `auto` (default) watches the folder and pushes external changes to open clients.** `docs/Install/Configuration.md`:
   > * `SB_FS_WATCH`: Controls how the server detects files changed on disk by other programs, for the whole server instance. `auto` (default) watches the space folder natively and pushes changes to open clients, so an externally edited page updates in the editor within moments. `poll` scans for changes (~2s) instead — use it when the space lives on a network mount (NFS/SMB) where writes from *other* machines produce no native file-system events. `off` disables watching entirely: clients fall back to checking for changes periodically, as they did before this existed.
   This is the most direct answer to FACT 2: a note written directly to the folder appears in an already-open client without a client save, *by default*. [docs/Install/Configuration.md](https://github.com/silverbulletmd/silverbullet/blob/main/docs/Install/Configuration.md)

8. **The client-side sync engine consumes these push events and reconciles the specific file immediately; polling is the fallback.** `client/service_worker/sync_engine.ts` exposes `requestFileSync(path, origin)`, `requestSpaceSync()`, and `notifyRealtimeStatus(connected)`. The run loop selects its base interval based on realtime health:
   > ```ts
   > const realtimeHealthTtlMs = 45_000;
   > const syncInterval = 20;
   > const syncIntervalRealtimeHealthy = 60;
   > // ...
   > notifyRealtimeStatus(connected: boolean) {
   >   this.realtimeHealthyUntil = connected ? Date.now() + realtimeHealthTtlMs : 0;
   > }
   > // in run(): the dirty queue (fed by requestFileSync/requestSpaceSync) breaks the
   > // drain loop early to sync the specific file before the next full cycle.
   > const interval = this.isRealtimeHealthy() ? syncIntervalRealtimeHealthy : syncInterval;
   > ```
   The service worker (`client/service_worker.ts`) forwards `perform-file-sync` / `perform-space-sync` / `realtime-status` messages from the main client thread into these sync-engine calls. So the SSE push marks the file dirty and syncs it promptly; if the SSE is down, the engine falls back to ~20s full-space polling (the mechanism documented in `docs/ADR/002 Sync Engine.md`). [client/service_worker/sync_engine.ts](https://github.com/silverbulletmd/silverbullet/blob/main/client/service_worker/sync_engine.ts) · [client/service_worker.ts](https://github.com/silverbulletmd/silverbullet/blob/main/client/service_worker.ts) · [docs/ADR/002 Sync Engine.md](https://github.com/silverbulletmd/silverbullet/blob/main/docs/ADR/002%20Sync%20Engine.md)

9. **The `X-Sync-Mode` header is for request routing, NOT for the external-change sync mechanism.** `docs/HTTP API.md`:
   > "All API requests from the client will always set the `X-Sync-Mode` request header set to `true`. The server _will_ use this fact to distinguish between requests coming from the client and regular e.g. `GET` requests from the browser (through navigation) and redirect appropriately (for instance to the UI URL associated with a specific `.md` file)."
   It distinguishes API calls from browser navigation so the server can redirect bare `GET /index.md` to the UI; it does not gate whether external writes are picked up. [docs/HTTP API.md](https://github.com/silverbulletmd/silverbullet/blob/main/docs/HTTP%20API.md)

   **Caveats (FACT 2):**
   - The push path requires the **service worker / Sync to be enabled.** `docs/Install/Configuration.md`: "`SB_DISABLE_SERVICE_WORKER`: Set to any value to disable the client-side service worker… In this mode, Sync is disabled… All loads and saves will go directly to the server." With the SW disabled there is no local sync engine, but since every load goes to the server directly, an external write is still seen on the next page load/navigation — just not via the realtime push.
   - `SB_FS_WATCH=off` reverts to periodic client-side polling (the pre-watcher behavior); `SB_FS_WATCH=poll` uses a ~2s poll watcher (for network mounts where cross-machine writes produce no native events). `auto` is the default.
   - The watcher ignores dotfiles, gitignored paths, directories, and extensionless files (per `watcher.rs` tests), matching `/.fs` listing visibility.
   - On network filesystems (NFS/SMB), writes from *other* machines may not produce native inotify/FSEvents events, so `poll` is recommended there.

## Sources
- Kept: `plugs/index/relation.ts` (a0782ddb) — the indexer source proving markdown `Link`/`Image` nodes emit `mention` relations with `toTag:"page"`.
- Kept: `plugs/index/relation.test.ts` (a0782ddb) — regression test `[the target](Target.md)` → relation `to:"Target"`, `kind:"mention"`.
- Kept: `plug-api/lib/resolve.ts` (main) — `resolveMarkdownLink` strips leading `/`; `isLocalURL` defines local vs external.
- Kept: `plug-api/lib/ref.ts` / `plug-api/lib/ref.test.ts` (main) — `parseToRef("/foo")` → `{path:"foo.md"}`; `isMarkdownPath` checks `.md`.
- Kept: `docs/Linked Mention.md` (main) — backlinks query the Object Index's link records.
- Kept: `server/src/watcher.rs` (main) — `notify`-backed watcher, `emits_change_event_for_new_file` test, `FsAction`/`EventOriginKind::External`.
- Kept: `server/src/handlers/events.rs` (main) — `GET /.events` SSE streams FsEvents; 30s ping keeps realtime-health TTL alive.
- Kept: `server/Cargo.toml` + workspace `Cargo.toml` (main) — `notify = "8"` dependency.
- Kept: `docs/Install/Configuration.md` (main) — `SB_FS_WATCH` `auto`/`poll`/`off` semantics; `SB_DISABLE_SERVICE_WORKER`.
- Kept: `client/service_worker/sync_engine.ts` (main) — `notifyRealtimeStatus`/`requestFileSync`/`requestSpaceSync`; realtime-healthy interval selection.
- Kept: `client/service_worker.ts` (main) — message bridge `perform-file-sync`/`realtime-status` → sync engine.
- Kept: `docs/HTTP API.md` (main) — `X-Sync-Mode` is for request disambiguation, not sync gating.
- Kept: `docs/ADR/002 Sync Engine.md` (main) — historical poll-based sync design (5–20s), the fallback when push is off.
- Dropped: DeepWiki "Index Plug" and "Rust Server" summaries — secondary/derived commentary; replaced by primary source files.
- Dropped: v1/v2 silverbullet.md mirror pages and community forum threads — used only to corroborate; primary docs/repo are authoritative.

## Gaps
- No dedicated test for the exact `/path.md` (leading-slash) markdown-link form in `relation.test.ts`; behavior is inferred from `resolveMarkdownLink` + `parseToRef` + `isMarkdownPath`, which together make it unambiguous, but a literal test would be more airtight.
- The exact main-thread client code that opens the `EventSource` to `/.events` and posts `realtime-status`/`perform-file-sync` messages to the service worker was not located in the fetched slices (the service worker side that *receives* those messages is confirmed in `client/service_worker.ts`); the consumer exists by construction (the SSE endpoint and the message protocol require it), but the specific client file was not cited. This does not change the conclusion, which rests on the server watcher + SSE endpoint + the documented `SB_FS_WATCH` behavior.
- Whether an *already-open editor buffer* for the externally changed page auto-reloads in-place (vs. just appearing in the page picker / on next navigation) depends on the client's editor-reload-on-`file:changed` event handling, which was not traced in full; the watcher/sync engine guarantees the client's local replica is updated, and the editor reloads on `file:changed` per the EventedSpacePrimitives design, but the precise UX (reload prompt vs. silent) was not pinned to a source line.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Both facts answered with concrete file paths and quoted source/doc passages: relation.ts:Link/Image branch + relation.test.ts 'local markdown link emits mention relation' (FACT 1); server/src/watcher.rs + handlers/events.rs + docs/Install/Configuration.md SB_FS_WATCH 'auto (default) watches the space folder natively and pushes changes to open clients' (FACT 2)."
    }
  ],
  "changedFiles": [
    "/home/pplattner/Projects/pi-knowledgebase/research.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "FACT 1: YES — standard markdown links [text](path.md) and [text](/path.md) are indexed into page mention relations and produce backlinks, same as [[wikilinks]]. Cited: plugs/index/relation.ts, plugs/index/relation.test.ts, plug-api/lib/resolve.ts, plug-api/lib/ref.ts.",
    "FACT 2: YES — server watches the space folder (notify crate) by default (SB_FS_WATCH=auto) and pushes external writes to open clients via /.events SSE; writes need not go through PUT /.fs/*. Cited: server/src/watcher.rs, server/src/handlers/events.rs, docs/Install/Configuration.md, client/service_worker/sync_engine.ts.",
    "X-Sync-Mode header is for request routing only, not sync mechanism (docs/HTTP API.md).",
    "Caveats documented: only .md-resolving local links make page backlinks; SB_FS_WATCH=poll/off and SB_DISABLE_SERVICE_WORKER alter behavior."
  ],
  "residualRisks": [
    "No literal test for the '/path.md' leading-slash markdown-link form in relation.test.ts; behavior inferred from resolveMarkdownLink+parseToRef+isMarkdownPath (unambiguous but not test-pinned).",
    "Main-thread EventSource consumer for /.events not located in fetched slices; conclusion rests on server watcher + SSE endpoint + documented SB_FS_WATCH behavior rather than a cited client file.",
    "Exact in-editor reload UX for an externally changed currently-open page not pinned to a source line."
  ],
  "noStagedFiles": true,
  "diffSummary": "Created research.md with a sourced brief answering both Silverbullet facts (link indexing scope and server filesystem-write pickup) via primary repo source and official docs, ending with an acceptance report.",
  "reviewFindings": [
    "no blockers: both facts resolved from primary source with quoted passages; caveats and gaps disclosed"
  ],
  "manualNotes": "Findings written to the authoritative path /home/pplattner/Projects/pi-knowledgebase/research.md. No supervisor coordination was needed — the task was completable from public repo/docs sources."
}
```
