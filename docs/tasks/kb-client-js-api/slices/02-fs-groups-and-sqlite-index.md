---
kind: slice
slug: fs-groups-and-sqlite-index
title: "@kb/fs — fs-backed groups, sqlite-vec (vectors+literal+graph), embedder, chunking, index lifecycle"
task: ../task.md
mode: afk
status: todo
size: xl
blocked_by: [core-types-and-builder]
---

## End-to-end behavior

`@kb/fs` implements the five group interfaces over the filesystem, backed by
**one sqlite-vec database** (`.kb/index.db`) holding the vector, literal,
and graph indexes; a **transformers.js** embedder (the only impl in v1);
**per-section chunking** (split by headings, parent-note pointer); and the
**hybrid index lifecycle** (full builds via `IndexAdmin`, incremental
per-file `Search.update`). `put`/`delete` auto-maintain `index.md` + the
`log/` dated archive + root `log.md`, and trigger `search.update`. `check`
runs the manifest's integrity rules.

## Acceptance criteria

- `FsLocalFs`, `FsRead`, `FsSearch`, `FsWrite`, `FsIndexAdmin` classes,
  each constructed from `CommonDeps` (+ `embedder` for Search/IndexAdmin);
  they implement the `@kb/core` group interfaces. `FsWriter` is used only
  by `withWrite` (the daemon, in V1); pi doesn't compose it.
- **sqlite-vec** stores: vector embeddings (per chunk, with parent-note
  pointer), a literal index (frontmatter fields + body tokens), and a graph
  index (typed `relations` + standard markdown links → edges; tolerant of
  broken links per OKF §6.1). One `.kb/index.db`.
- **transformers.js** `Embedder` impl (in-process, offline; ~100–300 MB
  first-run download). `Embedder` is the swap seam; no other impl in v1.
- **Per-section chunking**: split a note's body by `#`/`##` headings; embed
  each chunk; store with a parent-note `Ref`. `searchSemantic` returns
  chunk-hits aggregated to note-level (best chunk per note).
- **`put(ref, content)`**: parse+validate the markdown (frontmatter +
  body) via `FrontmatterSchema`; compute/stamp `id` (`type:slug`) +
  `generated.by` (if AI) via the `Utility`; write the file; auto-update the
  dir's `index.md` + append to the `log/` dated archive + roll root
  `log.md`; trigger `Search.update(ref, content)`. Return `PutResult`
  (`{ref: IdRef, etag?, changed, warnings}`).
- **`delete(ref)`**: remove the file; update `index.md`/log; return
  `DeleteResult`.
- **`Search.update(ref, content)`**: incremental — re-embed the one note's
  chunks, upsert into the vector index, refresh literal/graph indexes for
  that note. Never a full walk.
- **`searchUnified(q, {withGraph?})`**: RRF-blend (k≈60) of literal +
  semantic; optional `withGraph` attaches neighbors as context. Graph is
  not a rank signal.
- **`graph(ref, dir, {predicate?})`**: `dir = 'ancestors'|'descendants'|
  'neighbors'` (ancestors/descendants transitive; neighbors direct
  both-ways); optional `predicate` filters to one edge kind. Returns `Ref[]`.
- **`IndexAdmin.buildIndex`/`rebuildIndexes`**: full walk + build (vectors,
  all `index.md`, log). **`check()`**: full-bundle integrity walk (B1 id
  unique, all cross-note rules); `B7` (orphaned glossary terms) is a hard
  **error**.
- **`FsRead.get/list`** and **`FsLocalFs.resolvePath/resolveId/dirFor/
  pathFor/spaceRoot`** per the `@kb/core` interfaces.
- Config + index live in `.kb/` (gitignored), beside the bundle — not SB
  content. `embedder` model path cached under `.kb/`.

## Test plan

- **Seams**: markdown parse + frontmatter round-trip; chunk splitter;
  embedder call; sqlite-vec upsert/query; RRF fusion; graph edge extraction
  from markdown links + typed relations; index/log maintenance on
  `put`/`delete`.
- **Failure modes**: unwritable path, malformed YAML, missing `type` →
  reject; missing `embedder` config; corrupt `.kb/index.db` (rebuild);
  note too large to chunk sanely; concurrent writes (last-writer-wins,
  documented).
- **Scenarios**: round-trip a note with unknown extra frontmatter keys
  (preserved); `searchUnified('topic')` returns RRF-blended hits;
  `graph(ref,'ancestors',{predicate:'decided_in'})` returns only
  `decided_in` edges; `put` a note → it's discoverable via
  `searchSemantic` after `update`; `check()` fails on an orphaned glossary
  term (B7) and on a dead relation target (B3).
- **Edge cases**: empty bundle; note with no body (embed title/description
  only); nested subdirectories; Unicode filenames; cycle in the graph
  (ancestors terminates); broken markdown link (tolerated, listed by
  `graph(...,'neighbors')` but not fatal).

## Constraints and dependencies

- Depends on `@kb/core` (implements its interfaces; uses `Utility` for
  computeId/validate/stamp). Deps: `sqlite-vec` (or a SQLite binding),
  `@xenova/transformers` (or `transformers.js`), a markdown + YAML parser.
- `.kb/` is gitignored; the index is state, not content.
- Transport inside the daemon: filesystem only (no HTTP to SB in v1).
- The manifest drives type→dir routing, predicate vocab, and the `check`
  rules — load `manifest.yaml` from the bundle root.
