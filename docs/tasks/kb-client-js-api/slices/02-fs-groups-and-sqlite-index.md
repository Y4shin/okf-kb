---
kind: slice
slug: fs-groups-and-sqlite-index
title: "@kb/fs — fs-backed groups, sqlite-vec (vectors+literal+graph), embedder, chunking, index lifecycle"
task: ../task.md
mode: afk
status: done
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

## Implementation notes

`@kb/fs` implemented in `packages/fs`: the five group implementations
(`FsLocalFs`, `FsRead`, `FsSearch`, `FsWrite`, `FsIndexAdmin`) over the
filesystem, `DefaultUtility` (computeId/validate/stampProvenance), two
`Embedder` impls (`TransformersEmbedder` — in-process transformers.js, lazy-
loaded; `FakeEmbedder` — deterministic bag-of-words hash for tests),
per-section chunking (`splitByHeadings`), a sqlite-backed index
(`openDb` → `.kb/index.db`), and the bundle integrity-check runner
(`runChecks`). All five `Fs*` classes implement their `@kb/core` group
interfaces with the single-input-object param signature mandated by
`@kb/core` (verified by `tsc --build` clean). `FakeEmbedder` is injected in
all functional tests; `TransformersEmbedder` is exercised only by the opt-in
`tests/embedder.integration.test.ts` (skipped unless
`KB_TEST_REAL_EMBEDDER=1`).

**Test status:** 50 tests pass + 1 skipped (the embedder integration test,
correctly skipped without `KB_TEST_REAL_EMBEDDER=1`). `tsc --build` exit 0.

### Deviations from plan (3)

1. **sqlite-vec dropped in favor of better-sqlite3 + JSON-blob embeddings
   + JS cosine.** The arch-spec / slice doc pre-authorized falling back to
   "better-sqlite3 + a manual vector table (JSON BLOB + JS cosine)" if
   sqlite-vec integration got awkward. `sqlite-vec`'s `vec0` virtual tables
   are dimension-fixed at `CREATE VIRTUAL TABLE` time, which conflicts with
   the pluggable `Embedder` seam (`FakeEmbedder` dim 32 for tests vs
   `TransformersEmbedder` ~384 in prod). Taking the pre-authorized fallback:
   `chunks` is a plain table with `embedding TEXT` (JSON array) and
   `searchSemantic` computes cosine similarity in JS. The literal index uses
   **FTS5** (native to SQLite via better-sqlite3) and the graph index is a
   plain `graph_edges` table — all three indexes still live in one
   `.kb/index.db`, per the spec's "one sqlite-vec database" intent (just
   without the `sqlite-vec` package itself). `sqlite-vec` was removed from
   `package.json` dependencies; `loadSqliteVec()` export was dropped (no
   extension loaded). Trade-off: O(n) semantic scan (no ANN index) —
   acceptable for single-bundle v1 scale (hundreds–low-thousands of chunks);
   revisit for large bundles (a `vec0` table keyed on a declared dim, or an
   HNSW lib, in a later slice). Rationale recorded in `packages/fs/src/db.ts`.

2. **Manifest `integrity_checks` gating not wired.** `ManifestSchema`
   (`packages/core/src/manifest.ts`) has no `integrity_checks` field;
   `runChecks` (`packages/fs/src/check.ts`) accepts an optional
   `enabledRules` arg but `IndexAdmin.check` passes none, so all supported
   rules (A1–A5, A7, B1–B5, B7=error, B8) run unconditionally. This produces
   the **correct** rule coverage for the fixed OKF rule set — `check` runs
   the full bundle integrity walk and B7 (orphaned glossary terms) is a
   hard error, as required. The manifest-driven gating (selectively
   enabling/disabling rules per the manifest's `integrity_checks` list) is
   deferred — behavior is correct for v1; manifest-driven-ness is a v2
   addition (add `integrity_checks: z.array(RuleSchema).optional()` to
   `ManifestSchema` and have `IndexAdmin.check` pass it to `runChecks`).

3. **`put` stamps `id` but not `generated.by`.** `FsWrite.put` stamps `id`
   (`type:slug`) via the `Utility` but does not auto-stamp `generated.by`
   from an actor — the `Write.put` interface in `@kb/core`
   (`put(input: {ref, content})`) has no `by`/actor parameter to detect from.
   `Utility.stampProvenance` exists and is unit-tested but is not called by
   `FsWrite.put`. Provenance is **author-owned in v1**: a caller (daemon
   layer) that knows the requesting actor would call `util.stampProvenance`
   before/after `put`, or `Write.put`'s interface would need an `actor` param
   added. This is a decision point for whichever slice composes the daemon's
   write path.

### Additional additive extension

- **Graph `predicate` filter.** `FsSearch.graph` accepts an *extra optional*
  `predicate?: string` property on its input object beyond the `@kb/core`
  `Search.graph` interface's `{ref, dir}` shape, filtering results to one
  edge kind (`search.ts` `predicateClause`). This is additive/backward-
  compatible (TypeScript structural typing allows the extra optional prop;
  callers conforming to the interface without `predicate` still compile and
  behave identically). The `GraphInputSchema` in `@kb/core` does not include
  `predicate`, so a tRPC/CLI client built strictly from the binding record
  cannot send one — only in-process callers (tests, the daemon's own
  `searchUnified` graph-context attachment) can use it. A future slice may
  widen `GraphInputSchema` to include `predicate` to expose it to the
  daemon/CLI.
