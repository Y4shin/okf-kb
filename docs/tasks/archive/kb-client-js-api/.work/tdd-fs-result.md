# TDD worker result — slice `fs-groups-and-sqlite-index`

## Summary

Implemented `@kb/fs` in `packages/fs`: the five group implementations
(`FsLocalFs`, `FsRead`, `FsSearch`, `FsWrite`, `FsIndexAdmin`) over the
filesystem, `DefaultUtility`, two `Embedder` impls (`TransformersEmbedder`,
`FakeEmbedder`), per-section chunking (`splitByHeadings`), a sqlite-backed
index (`.kb/index.db`), and the bundle integrity-check runner (`runChecks`).

Per the task instructions, I worked **directly on `task/kb-client-js-api`**
(already checked out at start; no worktree/branch switch), not a separate
`slice/<slug>` branch — the task brief explicitly said to work directly on
that branch. Flagging this since the generic tdd-worker role doc says
create `slice/<slug>`; I followed the more specific, later task instructions
in `task.md`, which override the generic role doc for this run.

All 9 commits are "wip: fs-groups-and-sqlite-index ..." checkpoints, one per
GREEN milestone, on `task/kb-client-js-api`.

## Divergence from plan

- **sqlite-vec dropped in favor of better-sqlite3 + JSON-blob embeddings +
  JS cosine.** I spiked `sqlite-vec` (v0.1.9) against `better-sqlite3`
  directly (throwaway `/tmp` project, not committed) and confirmed the
  native extension loads and a `vec0` virtual table works for a **fixed**
  embedding dimension. But `@kb/fs`'s `Embedder` is a pluggable seam
  (`FakeEmbedder` at 32 dims for tests, `TransformersEmbedder` at 384 dims
  for `all-MiniLM-L6-v2` in prod), and `vec0` tables are dimension-fixed at
  `CREATE VIRTUAL TABLE` time — supporting both would mean either forcing
  one dimension (breaking the fake/real swap seam) or a table-per-dimension
  scheme with more moving parts than the arch spec's stated fallback
  warrants. The arch spec / slice doc explicitly pre-authorized falling
  back to "better-sqlite3 + a manual vector table (JSON BLOB + JS cosine)"
  if sqlite-vec integration got awkward, so I took that path: `chunks` is a
  plain table with `embedding TEXT` (JSON array), and `searchSemantic` does
  cosine similarity in JS. The literal index still uses **FTS5** (native to
  SQLite via better-sqlite3, no extra dep) and the graph index is a plain
  `graph_edges` table — all three indexes still live in one
  `.kb/index.db`, per the spec's "one sqlite-vec database" intent (just
  without the `sqlite-vec` package itself). `sqlite-vec` was removed from
  `package.json` dependencies accordingly.
- **`Search.graph` and `check.ts`'s `runChecks`/`checkId` accept an optional
  `predicate` filter** beyond the core `Search.graph` interface's `{ref,
  dir}` shape (the interface doesn't declare `predicate`, but the slice doc
  requires `graph(ref,'ancestors',{predicate:'decided_in'})`-style
  filtering). I added `predicate?: string` as an extra optional property on
  the same input object read by `FsSearch.graph`'s implementation (TypeScript
  structural typing allows the extra optional prop; `tsc --build` passes
  clean). This is additive/backward-compatible, not a breaking change to the
  `Search` interface's declared shape — flagging in case slice 1
  (`core-types-and-builder`) wants to make `predicate` an official part of
  `GraphInputSchema`/`Search.graph` for the daemon/CLI to expose it
  properly (right now a caller going through `@kb/core`'s typed interface
  can't pass `predicate` without an `as never`/structural workaround, which
  I only use in my own tests — daemon/CLI slices should decide whether to
  widen `GraphInputSchema` to include `predicate`).
- **`DefaultUtility.validate`'s per-note B2/B5/B8 checks are heuristic**,
  not exhaustive OKF conformance (A1-A5,A7 lean on `FrontmatterSchema`
  parsing + a few explicit field checks for messages tests can assert on).
  Full A-rule coverage (all the finer-grained schema shape rules) is
  effectively delegated to `FrontmatterSchema.safeParse` (rule A1) — I did
  not enumerate a distinct check per Zod-schema-enforced constraint since
  the schema itself is the authority; A2-A7 messages are best-effort
  human-readable summaries layered on top for callers that want
  rule-specific errors from `validate()`.
- **`FsWrite.put` does not auto-detect/stamp `generated.by` from an actor
  parameter** — the slice doc says "compute/stamp `generated.by` (if AI)
  via the `Utility`", but the `Write.put` interface in `@kb/core`
  (`put(input: {ref, content})`) has no `by`/actor parameter to detect from.
  `stampProvenance` exists on `DefaultUtility` and is exercised directly in
  `utility.test.ts`, but `FsWrite.put` doesn't call it automatically since
  there's no actor input to stamp from in the current `Write` interface —
  a caller (daemon layer) that knows the requesting actor would call
  `util.stampProvenance` before or after `put`, or `Write.put`'s interface
  would need an `actor` param added. Recorded here rather than guessing at
  an interface change to `@kb/core`'s `Write` — this is a **decision point
  for whichever slice composes the daemon's write path** (daemon knows the
  Bearer-token actor; `@kb/fs`'s `Write.put` signature is fixed by slice 1).
- **`Search.checkId`'s per-note bundle-context checks (B3/B4/B7) walk the
  entire bundle on every call** (`walkBundleNotes` is O(bundle size)) rather
  than a cheaper indexed lookup. Fine for the bundle sizes this personal-KB
  targets; flagging as a scaling note, not a correctness issue.

## Notable events

- Spiked `sqlite-vec` + `better-sqlite3` interop in a throwaway `/tmp`
  project before writing `db.ts`, per the task's explicit permission to
  "record which you used" — confirmed the native extension loads
  correctly and `vec0` tables work, but the fixed-dimension constraint
  conflicts with the Fake/Transformers embedder swap seam, so fell back
  to the pre-authorized JSON-blob + JS-cosine approach.
- `npm install` failed with `workspace:*` because the root uses plain
  **npm workspaces**, not pnpm — `workspace:*` protocol isn't supported by
  npm. Fixed by using `"@kb/core": "*"` in `packages/fs/package.json`,
  which npm resolves to the local workspace package automatically given
  the `workspaces` field in the root `package.json`.
- Every RED→GREEN cycle passed on the first or second implementation
  attempt (fast because the arch spec/slice doc were unusually precise
  about method shapes); the only real debugging was two `search.test.ts`
  assertion failures caused by `JSON.stringify` key-order mismatches in my
  own test assertions (fixed with `toContainEqual`), not implementation
  bugs, plus one real bug (relation targets stored as raw `type:slug`
  strings in `graph_edges` instead of normalized paths, fixed via a new
  `targetToPath` helper in `FsSearch.update`).

## Acceptance criteria coverage

- `FsLocalFs`/`FsRead`/`FsSearch`/`FsWrite`/`FsIndexAdmin` classes,
  constructed from `CommonDeps`/`Base`, implementing the `@kb/core` group
  interfaces — done, `tsc --build` verifies structural conformance.
- One `.kb/index.db` holding vectors (JSON-blob + JS cosine, per the
  divergence above), literal (FTS5), and graph (`graph_edges` table)
  indexes — done.
- `TransformersEmbedder` (in-process `@xenova/transformers`, lazy-loaded,
  configurable model/cache dir) + `FakeEmbedder` (deterministic
  bag-of-words hash, no download) — done; `FakeEmbedder` used throughout
  the real test suite, `TransformersEmbedder` exercised only by the
  opt-in `tests/embedder.integration.test.ts` (skipped unless
  `KB_TEST_REAL_EMBEDDER=1`).
- Per-section chunking (`splitByHeadings`, marked-based heading walk) with
  parent-note pointer attached at store time in `FsSearch.update` — done.
- `put`: parse+validate via `FrontmatterSchema`, compute/stamp `id`, write
  file, update `index.md`, append `log/<date>.md` + roll root `log.md`,
  trigger `search.update` — done (provenance/`generated.by` auto-stamp
  from an actor is NOT auto-triggered by `put` — see divergence above).
- `delete`: remove file, update `index.md`/log, return `DeleteResult` —
  done.
- `Search.update`: incremental re-embed + upsert for one note, deletes old
  chunks/fts/edges for that note first — done, never a full walk.
- `searchUnified`: RRF blend (k=60) of literal+semantic; `withGraph`
  attaches neighbors as non-ranking context — done.
- `graph`: ancestors/descendants (transitive) + neighbors (direct
  both-ways), optional predicate filter — done (predicate filter is an
  additive extension beyond the current `Search.graph` interface shape —
  see divergence above).
- `IndexAdmin.buildIndex`/`rebuildIndexes`: full walk + rebuild vectors +
  all `index.md` + (best-effort) log — done. Note: `buildIndex` does not
  regenerate the `log/`/`log.md` change-narrative (that's authored by
  `put`/`delete` events, not a full-bundle rebuild concern) — only
  `index.md` regeneration is part of the full walk, matching "rebuild all
  `index.md`" from the slice doc.
- `check()`: full-bundle integrity walk — B1 (id unique), B3 (relation
  targets exist), B4 (dead markdown links), B7 (orphaned glossary terms,
  **hard error**), B8 (id form) — done, verified against a conformant
  bundle (ok:true), an orphaned-term bundle (B7 error), and a
  dead-relation bundle (B3 error).
- `.kb/` lives beside the bundle, is gitignored (root `.gitignore` already
  had `.kb/` from slice 1) — confirmed, never touched `$KB_HOME`; all
  tests use `mkdtemp`-based tmp bundles, cleaned up in `afterEach`.

## Notes on testing conventions followed

- `FakeEmbedder` used in all functional tests, per project testing
  guidelines and the task's explicit constraint.
- Tests never touch `$KB_HOME` (`~/.local/share/kb`) — every test bundle
  is a fresh `mkdtemp()` dir, removed in `afterEach`.
- One opt-in integration test for `TransformersEmbedder`, skipped by
  default (`describe.skipIf(!enabled)`), matching "gated/skipped if the
  model isn't cached" from the arch spec (simplified to an explicit env
  flag rather than probing the cache dir, since detecting "is the model
  already cached" reliably before attempting a load is itself fragile;
  an env-var gate is simpler and equally satisfies "opt-in").
