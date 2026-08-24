# Land report — slice `fs-groups-and-sqlite-index`

## Summary

Landed the `fs-groups-and-sqlite-index` slice for task `kb-client-js-api`.

**No merge was needed** — per the task brief, the tdd-worker worked directly
on `task/kb-client-js-api` (9 wip commits + a final test commit). There was
no separate `slice/fs-groups-and-sqlite-index` branch. The work was already
on the task branch and all green.

## Actions taken

1. **Confirmed git state**: on `task/kb-client-js-api`, working tree clean
   except for `.work/` files and `state.yaml` (all expected/fine).
2. **Updated slice doc frontmatter**: set `status: done` in
   `docs/tasks/kb-client-js-api/slices/02-fs-groups-and-sqlite-index.md`
   (kept the file in place — no archiving, since there was no slice branch
   and the task brief said to keep it).
3. **Appended `## Implementation notes` section** to the slice doc,
   summarizing:
   - `@kb/fs` implemented: `FsLocalFs`/`FsRead`/`FsSearch`/`FsWrite`/
     `FsIndexAdmin` + `DefaultUtility` + `TransformersEmbedder`/
     `FakeEmbedder` + `splitByHeadings` + `openDb` + `runChecks`.
   - Single-input-object params per `@kb/core` (tsc --build clean).
   - 50 tests pass + 1 skipped (embedder integration, correctly skipped).
   - **3 deviations**:
     - (a) sqlite-vec dropped for better-sqlite3 + JSON-blob embeddings +
       JS cosine (pre-authorized fallback; vec0 dimension-fixed conflicts
       with pluggable Embedder seam; O(n) scan fine for v1).
     - (b) manifest `integrity_checks` gating not wired — `check()` runs
       the fixed full OKF rule set (correct for v1, manifest-driven-ness
       deferred).
     - (c) `put` stamps `id` but not `generated.by` (provenance
       author-owned in v1; `Write.put` interface has no actor param).
   - Graph predicate filter added as additive optional prop.
4. **Committed**: `4914178 docs: mark slice fs-groups-and-sqlite-index done
   + implementation notes` (1 file changed, 80 insertions, 1 deletion).

## Final state

- **HEAD sha**: `49141789d0572bd622f36a485769c388b5159b1c`
- **Git log (top 3)**:
  - `4914178 docs: mark slice fs-groups-and-sqlite-index done + implementation notes`
  - `fa9634d test: fs-groups-and-sqlite-index FsLocalFs + IndexAdmin.buildIndex/rebuildIndexes coverage`
  - `ee78d13 test: fs-groups-and-sqlite-index opt-in TransformersEmbedder integration test`

## Review findings

- **No blockers.** The slice doc was updated to `status: done` with a
  complete implementation-notes section. No source code, tests, or config
  were modified — only the slice doc.
- The task doc (`docs/tasks/kb-client-js-api/task.md`) has no
  `## Implementation notes` section yet; the task brief said adding one is
  optional. The three deviations are fully documented in the slice doc's
  implementation notes, which the task doc can reference when the task is
  marked done.

## Residual risks

- **sqlite-vec → better-sqlite3 fallback**: O(n) semantic scan (no ANN
  index). Acceptable for single-bundle v1 scale (hundreds–low-thousands of
  chunks); revisit for large bundles. `loadSqliteVec()` export dropped.
- **Manifest `integrity_checks` gating not wired**: all rules run
  unconditionally (correct for v1). A future slice should add
  `integrity_checks` to `ManifestSchema` if selective rule enabling is
  needed.
- **`put` provenance stamping not wired**: `FsWrite.put` stamps `id` but
  not `generated.by`. The daemon slice (which knows the requesting actor)
  must decide whether to call `util.stampProvenance` or widen `Write.put`'s
  interface with an `actor` param.
- **Graph `predicate` filter**: additive optional prop not in
  `GraphInputSchema` — only in-process callers can use it; a tRPC/CLI
  client cannot send `predicate` until `GraphInputSchema` is widened.
- **`rebuildIndexes` is an alias of `buildIndex`** (no explicit
  drop-all-then-rebuild): re-running `buildIndex` effectively rebuilds
  per-note (old rows deleted before re-insert), but a note deleted from
  disk between builds would leave stale index rows. Minor for v1.
