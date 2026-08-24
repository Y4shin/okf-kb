## Deviation report — fs-groups-and-sqlite-index

### API surface changes

#### Exports — all present
`packages/fs/src/index.ts:1-17` exports every planned symbol:
`DefaultUtility`, `TransformersEmbedder`, `FakeEmbedder` (+ `TransformersEmbedderOptions`
type), `FsLocalFs`, `FsRead`, `FsSearch`, `FsWrite`, `FsIndexAdmin`,
`splitByHeadings` (+ `Chunk` type), `openDb` (+ `KbDb` type), `runChecks` (+
`BundleNote` type). The two *extra* type-only exports (`TransformersEmbedderOptions`,
`BundleNote`) are additive and harmless; the arch-spec's "the daemon does not import
`@kb/fs`'s internal `db`/`chunk`/`check` modules — only the public group classes +
utility + embedder" contract is respected because these are re-exported from the
public barrel as *types*, not internal module paths.

#### Single-input-object params — implemented correctly
All five `Fs*` classes implement their `@kb/core` group interface with the
single-input-object signature mandated by `packages/core/src/bindings.ts`:
- `FsLocalFs` (`local-fs.ts:7`) — `resolvePath({ref})`, `resolveId({ref})`,
  `dirFor({type})`, `pathFor({type,slug})`, `spaceRoot()` ✔
- `FsRead` (`read.ts:42`) — `get({ref})`, `list({type?,tag?,status?,by?})` ✔
- `FsSearch` (`search.ts:26`) — `searchText({q,opts?})`, `searchSemantic({q,k?})`,
  `searchUnified({q,opts?})`, `graph({ref,dir,predicate?})`, `update({ref,content})`,
  `checkId({ref})` ✔
- `FsWrite` (`write.ts:15`) — `put({ref,content})`, `delete({ref})` ✔
- `FsIndexAdmin` (`index-admin.ts:13`) — `buildIndex()`, `rebuildIndexes()`,
  `check()` ✔

`tsc --build` (the enforcement gate) passes clean, so `implements Read/Search/…`
type-checks the param shape against `@kb/core`.

- **Planned:** the spec (arch-spec Slice 2 Exports) listed `runChecks` and `openDb`
  as exports and described `loadSqliteVec()` as a separate export.
- **Actual:** `openDb` is exported; `loadSqliteVec()` is **not** exported (the
  sqlite-vec extension is not loaded at all — see below). `runChecks` is exported.
- **Impact:** none on slice 3 (the daemon never calls `loadSqliteVec`); a future
  slice that wanted to re-enable native vector search would need to re-add it.

#### `Search.graph` predicate filter — backward-compatible
The `@kb/core` `Search.graph` interface (`bindings.ts:31`) declares
`graph(input: { ref; dir }): Promise<Ref[]>` **without** `predicate`. The
implementation (`search.ts:154`) accepts an *extra optional* `predicate?: string`
field and filters with it (`search.ts:158` `predicateClause`). This is the
additive optional prop the task description anticipated. Backward-compatible:
callers conforming to the interface (no `predicate`) still compile and behave
identically — `predicate` is `undefined`, the `AND predicate = @predicate`
clause is elided. The `GraphInputSchema` in core does **not** include
`predicate`, so a tRPC/CLI client built strictly from the binding record cannot
send one; only in-process callers (tests, the daemon's own `searchUnified`
graph-context attachment) can use it. This is a minor contract widening of the
*runtime* impl vs. the *IDL* schema — noted but low-risk.

### Abstraction usage

- **Imports `@kb/core` for interfaces/schemas/parseRef/formatRef/parseActor/formatActor — yes.** Every `Fs*` file imports the group interface it `implements`
  plus `parseRef`/`formatRef`/`parseActor`/`formatActor`/`FrontmatterSchema`/
  `RuleSchema` from `@kb/core`. None of these are reimplemented. Confirmed by
  grep: no local `parseRef`/`parseActor` definition in `packages/fs/src`.
- **Loads `manifest.yaml` from the bundle root — no (deferred).** No code in
  `@kb/fs` reads `manifest.yaml`; the manifest is passed in already-parsed via
  `CommonDeps.manifest` (constructed by the caller — slice 3/daemon or tests).
  This is consistent with the arch-spec interface contract ("Slice 3 builds
  `CommonDeps` … load `manifest.yaml`"), so it is *not* a deviation for this
  slice — the manifest-loading responsibility belongs to slice 3. Noted for
  completeness: the slice doc says "The manifest drives … load `manifest.yaml`
  from the bundle root" as a constraint, but the interface contract assigns
  the actual load to the daemon. No action needed here.
- **`.kb/index.db` gitignored state (not content) — yes.** `.gitignore` line 2
  ignores `.kb/`. `openDb` (`db.ts:23`) writes `<space>/.kb/index.db`; the index
  is treated as rebuildable state (`IndexAdmin.rebuildIndexes` rebuilds it
  from on-disk notes). No note content is stored *only* in `.kb/`.
- **Graph is a mode + optional `withGraph`, NOT a rank signal — yes.**
  `searchUnified` (`search.ts:119`) computes the RRF blend from `searchText`
  + `searchSemantic` only (`search.ts:120`); `withGraph` (`search.ts:137`)
  *attaches* `graphContext` to each hit as context and is explicitly
  best-effort (`catch {}`, comment "not a rank signal"). Graph never feeds
  the RRF score. ✔
- **B7 orphaned glossary terms is a hard ERROR — yes.** `check.ts:95-108`:
  for every `type === 'term'` note not found in `linkedTermIds`, it pushes a
  `B7` error; `runChecks` returns `ok: errors.length === 0`, so a B7 error
  makes `ok === false`. `check.test.ts:62-78` asserts `report.ok === false`
  with a B7 error on an orphaned term. ✔

### The sqlite-vec → better-sqlite3 + JSON-blob + JS cosine divergence

- **Planned:** arch-spec Slice 2 "sqlite-vec for **all three** indexes
  (vectors + literal + graph) in one `.kb/index.db`" and "FTS5 is acceptable
  for the literal index if sqlite-vec's literal support is thin."
- **Actual:** `better-sqlite3` (not `sqlite-vec`) is the only SQLite dep
  (`packages/fs/package.json:11`). `db.ts:1-10` documents the decision:
  sqlite-vec's `vec0` virtual tables require a *fixed* embedding dimension
  per table, but `@kb/fs` supports pluggable embedders with differing dims
  (`FakeEmbedder` dim 32 for tests vs `TransformersEmbedder` ~384 in prod).
  Embeddings are stored as **JSON text blobs** in a plain `chunks` table
  (`db.ts:36-44`) and cosine is computed in JS (`search.ts:11-21`).
- **Is the fallback sound?**
  - **Three indexes in one `.kb/index.db`?** Yes — `db.ts:30-55` creates
    `chunks` (vector), `notes_fts` (FTS5 literal), and `graph_edges` (graph)
    in the same `better-sqlite3` database file. ✔
  - **FTS5 does the literal index?** Yes — `db.ts:52` `CREATE VIRTUAL TABLE
    notes_fts USING fts5(...)`; `searchText` (`search.ts:77`) uses
    `MATCH` + `bm25()`. ✔ (This is exactly the arch-spec's pre-authorized
    FTS5 fallback.)
  - **Embedder swap seam preserved?** Yes — `FsSearch`/`FsIndexAdmin`/
    `FsWrite` take `CommonDeps` whose `embedder: Embedder` field is the
    seam; `FakeEmbedder` is injected in all tests, `TransformersEmbedder`
    in the one opt-in integration test (`embedder.integration.test.ts`).
    `searchSemantic` calls `this.deps.embedder.embed(...)` (`search.ts:93`),
    never a sqlite-vec-specific call. ✔
  - **Dimension-fixed vec0 constraint — reasonable?** Yes. The spec mandates
    a pluggable `Embedder` (test vs prod differ in dimension); forcing a
    single vec0 dimension would break the FakeEmbedder seam that keeps
    slices 2-4 reproducible without a model download. JSON-blob + JS cosine
    is the standard fallback for heterogeneous-dim embedding stores. The
    trade-off is O(n) scan per semantic query (no ANN index) — acceptable
    for a single-bundle KB (hundreds–low-thousands of chunks) in v1; would
    need revisiting for very large bundles (a `vec0` table keyed on a
    *declared* dim, or an HNSW lib, in a later slice). The `db.ts:1-10`
    comment records this rationale.
- **Impact:** no API-surface impact (the embedder seam is unchanged);
  performance characteristics differ (linear scan vs ANN) but within v1
  scale. A `KB_INDEX_ANN` future hook is implicit but not built.

### Out-of-scope changes

- **File-watcher indexer — not added.** ✔ `Search.update` is an explicit
  per-file call (`search.ts:188`); no `fs.watch`/chokidar anywhere.
- **HTTP to Silverbullet — not added.** ✔ No HTTP client; transport is
  filesystem-only (readFile/writeFile/readdir). Confirmed by grep.
- **`walkBundleNotes` helper (`walk.ts`) — added, not in the spec's file
  list.** The arch-spec's file layout does not list `walk.ts`; the slice
  doc doesn't either. It is a small (31-line) internal helper that walks
  the manifest's typed dirs to load notes for `check`/`buildIndex`. It is
  *not* exported from the public barrel (`index.ts` does not re-export it),
  so it doesn't widen the public API. This is reasonable factoring, not
  scope creep — it consolidates what would otherwise be duplicated walk
  logic in `index-admin.ts` and `search.ts:checkId`.
- **`parseNoteFile` exported from `read.ts` (not `index.ts`) — internal
  helper**, used across files. Fine.
- **`relPath` exported from `read.ts`** — tiny unused-ish helper; harmless.
- **`FsWrite`/`FsSearch`/`FsIndexAdmin` each own an `openDb` + `close()`.**
  `FsSearch` opens its own db in its constructor (`search.ts:30`); `FsWrite`
  accepts an optional shared `FsSearch` (`write.ts:18`) to avoid double-open;
  `FsIndexAdmin` constructs a `FsSearch` and a `FsWrite` sharing it
  (`index-admin.ts:16-19`). This is an internal resource-management pattern
  not specified by the arch-spec but not contradicting it. `close()` methods
  are additive (not on the `@kb/core` interfaces) — they are implementation
  detail for the daemon to call on shutdown. Minor: multiple `Fs*` instances
  in one process each open their own WAL handle on the same `.kb/index.db`
  unless explicitly shared via the `FsWrite(deps, search)` seam. The daemon
  should construct one shared `FsSearch` and pass it through; not a spec
  violation but a wiring note for slice 3.

### Divergence from acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| 5 group classes from `CommonDeps` (+embedder for Search/IndexAdmin) | ✔ | `FsLocalFs(deps: Base)` `local-fs.ts:8`; `FsRead(deps: Base)` `read.ts:44`; `FsSearch(deps: CommonDeps)` `search.ts:26`; `FsWrite(deps: CommonDeps, search?)` `write.ts:16`; `FsIndexAdmin(deps: CommonDeps)` `index-admin.ts:14`. Note: `FsLocalFs`/`FsRead` take `Base` (no embedder) — matches spec ("constructed from `CommonDeps` (+embedder for Search/IndexAdmin)"). ✔ |
| Per-section chunking (split by headings, parent-note pointer) | ✔ | `chunk.ts` `splitByHeadings(body, title?)` uses `marked.lexer`, builds `headingPath: string[]`; parent-note `Ref` is attached at store time — `search.ts:198` stores `note_path` on each chunk row, and `searchSemantic` aggregates best-chunk-per-note (`search.ts:96-101`). The `Ref` is reconstructed via `pathToRef` at query time rather than stored as a column, but the parent-note linkage is preserved. ✔ |
| put/delete auto-maintain index.md + log/ dated archive + root log.md + trigger search.update | ✔ | `write.ts:55-60` calls `updateIndexMd` + `appendLog` + `search.update` after writing; `delete` (`write.ts:62-86`) updates index.md/log. `appendLog` (`write.ts:108`) writes `log/<date>.md` + rolls root `log.md` (last 20). Tests `write.test.ts:32-48` cover both. ✔ (Minor: `put`'s provenance stamping is *conditional* — see below.) |
| searchUnified RRF-blend k≈60 | ✔ | `search.ts:121` `const K = 60;` RRF `1/(K+i+1)` over literal+semantic. `search.test.ts:54-72` proves both literal-only and semantic-only hits surface. ✔ |
| graph ancestors/descendants transitive, neighbors direct | ✔ | `search.ts:160-185`: neighbors does a direct both-directions `SELECT` (`search.ts:162-171`); ancestors/descendants do a BFS with a `visited` set (cycle-terminating) over `graph_edges` (`search.ts:173-185`). `search.test.ts:74-93` covers all three. ✔ |
| IndexAdmin.buildIndex/rebuildIndexes/check | ✔ | `index-admin.ts:18-43`. `rebuildIndexes` calls `buildIndex` (which walks + updates search + rebuilds index.md). ✔ (See note on rebuild below.) |
| check runs manifest's integrity_checks (A1-A5,A7,B1-B5,B7=error,B8) | ⚠ partial | A1-A5,A7,B2,B5,B8 run in `DefaultUtility.validate` (`utility.ts:24-78`); B1,B3,B4,B7,B8 run in `runChecks` (`check.ts`). B7 is a hard error (✔). **But the manifest's `integrity_checks` list is not read** — `ManifestSchema` (`core/manifest.ts:17-20`) has no `integrity_checks` field at all; `runChecks(notes, manifest, enabledRules?)` (`check.ts:33`) takes an *optional* `enabledRules` array but `IndexAdmin.check` (`index-admin.ts:42`) calls `runChecks(notes, manifest)` with **no** third arg, so *all* supported rules run unconditionally. The task.md (`task.md:69`) and arch-spec say `check` "runs the manifest's `integrity_checks`". The manifest-driven gating is **not implemented** — the rule set is hardcoded to "all rules". This is a real deviation from the manifest-driven intent, but it produces the *correct* rule coverage (all of A1-A5,A7,B1-B5,B7,B8 run) for the fixed OKF rule set, so behavior is correct for v1. |
| check() fails (B7) on orphaned glossary term | ✔ | `check.test.ts:62-78`. ✔ |
| check() fails (B3) on dead relation target | ✔ | `check.test.ts:80-100`. ✔ |

#### Minor criterion-level notes
- **`put` provenance stamping:** the spec says "compute/stamp `id` … + `generated.by` (if AI) via the `Utility`". `write.ts:50-58` stamps `id` but the `generated.by` stamping is **commented out** (`write.ts:46-48`: "we don't invent an actor here; if omitted, generated is left as-is"). The `Utility.stampProvenance` helper exists and is unit-tested (`utility.test.ts:24-31`) but `FsWrite.put` does **not** call it. This is a partial divergence: id is stamped, provenance is *not*. The `Utility` DI seam is wired but the authoring-helper path for provenance is unused in the write path. Tests don't assert provenance stamping on `put`. Low impact for v1 (provenance can be authored in the source content), but it does not meet the literal "stamp `generated.by` (if AI)" criterion.
- **`rebuildIndexes` vs `buildIndex`:** the slice doc distinguishes them ("full walk + build" for `buildIndex`; `rebuildIndexes` implies a drop-then-rebuild). The implementation makes `rebuildIndexes` a trivial alias of `buildIndex` (`index-admin.ts:38-40`) with **no explicit drop** of the existing index first. Because `search.update` calls `deleteChunksForNote` (`db.ts:63`) before re-inserting, re-running `buildIndex` effectively rebuilds (old rows are deleted per-note), so the *result* is equivalent to a rebuild. But there's no "drop all then rebuild" — if a note was deleted from disk between builds, its stale rows would remain (no sweep of orphaned `note_path`s). Minor for v1; a true rebuild would `DELETE FROM chunks/notes_fts/graph_edges` first.

### Task doc update needed?

**Yes — append to `## Architecture notes` / `## Implementation notes`:**

1. **sqlite-vec → better-sqlite3 + JSON-blob embeddings + JS cosine.** The
   arch-spec pre-authorized the FTS5 fallback for the literal index and the
   slice doc named sqlite-vec, but the *vector* index also moved off
   sqlite-vec (to JSON-blob + JS cosine) due to the fixed-dimension `vec0`
   constraint conflicting with the pluggable-`Embedder` seam (FakeEmbedder
   dim 32 vs TransformersEmbedder ~384). Record: `packages/fs/src/db.ts:1-10`
   has the rationale comment. Trade-off: O(n) semantic scan (no ANN);
   acceptable for single-bundle v1 scale, revisit for large bundles.
   `loadSqliteVec()` export was dropped (no extension loaded).
2. **Manifest `integrity_checks` field is not implemented.** `ManifestSchema`
   (`packages/core/src/manifest.ts:17-20`) has no `integrity_checks` key;
   `runChecks` (`packages/fs/src/check.ts:33`) accepts an optional
   `enabledRules` arg but `IndexAdmin.check` passes none, so all supported
   rules run unconditionally. To honor the manifest-driven intent, either
   (a) add `integrity_checks: z.array(RuleSchema).optional()` to
   `ManifestSchema` and have `IndexAdmin.check` pass
   `runChecks(notes, manifest, manifest.integrity_checks)`, or (b) document
   that v1 runs the fixed full OKF rule set and the manifest gate is a v2
   addition. Recommend (b) for v1 (correct behavior, smaller change) and
   file (a) as a follow-up.
3. **`put` does not call `stampProvenance`.** `FsWrite.put` stamps `id` but
   leaves `generated` as authored; `Utility.stampProvenance` exists but is
   unused in the write path. Either wire it (when the content declares an
   AI actor) or document that provenance is author-owned in v1.

### User attention needed?

**No** for scope/API-surface — the public API matches the spec (all
exports present, single-input-object params, embedder seam preserved, no
out-of-scope file-watcher or HTTP). The deviations are: (a) the
pre-authorized sqlite-vec→better-sqlite3 fallback (sound, documented
in-source), (b) manifest `integrity_checks` gating not wired (behavior
correct, manifest-driven-ness deferred), and (c) `put` provenance
stamping not wired. None change the interface contract that slice 3
depends on; the daemon can compose `DefaultUtility` + `TransformersEmbedder`
+ the five `Fs*` classes exactly as the arch-spec's "Interface contract
(what slice 3 calls)" describes.
