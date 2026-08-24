---
kind: task
type: grilling
slug: decide-search-architecture
title: Decide the search architecture — embeddings, vector store, index lifecycle, ranking
map: agent-knowledge-base
status: done
blocked_by: []
---

## Decision to settle

The concrete search architecture behind the three engines (literal, graph,
semantic) and the unified query: which embedding source, which local vector
store, how/when the index updates, what gets embedded, and how results are
fused. The map settled *that* there are three modes + semantic via
embeddings + a local vector store; this grilling settles the concrete
choices and the privacy/offline-vs-quality tradeoff, which is a human call.

## Parent decisions it depends on

- Search = literal + graph + semantic (map, decided).
- Deployment is local; no external hosted vector DB in v1 (map, decided).
- The JS API owns search; SB-embedded search is Fog (map, decided).

## Choices already known

- Literal = frontmatter field filters + full-text body grep.
- Graph = walk markdown links; tolerant of broken links (OKF §6.1).
- Semantic = embeddings + vector store; index lives outside the bundle.
- Reindex must be idempotent and incremental (feature task acceptance).

## The specific questions to grill (one at a time)

1. **Embedding source.** Local model (e.g. transformers.js/Xenova, fastembed,
   a local Ollama embedding model) vs a hosted provider (OpenAI etc.) vs
   configurable with a local default? This is the privacy/offline-vs-quality
   tradeoff. (Recommend: configurable, local default for privacy/offline.)
2. **Vector store.** sqlite-vec / LanceDB / Qdrant-embedded / a simple
   JSON+cosine for v1? Tradeoff: real-but-local vs zero-dependency. (Recommend
   sqlite-vec or Lance: real, local, no server.)
3. **Index lifecycle.** Incremental by file mtime / `generated.at`, full
   rebuild on demand, or a file watcher? When does reindex run — on every
   write, on explicit `kb index`, or lazily on first search? (Recommend:
   incremental + explicit `kb index [--update]`; no watcher in v1.)
4. **What gets embedded.** Title + description + body, or per-section
   chunking for long notes? Chunk size/overlap? (Recommend: title +
   description + whole body for v1; note-level, chunking deferred.)
5. **Unified ranking.** How to merge literal + semantic hits — normalized
   score fusion, reciprocal rank fusion, or literal-or-semantic with graph
   as context only? (Recommend: normalized score fusion for v1, graph as
   optional context, not rank.)
6. **Graph search's role.** Is graph a first-class search *mode* or a
   navigation/context aid layered on the other two? Confirm output shape.

## Recommended starting answer

- Embeddings: configurable, local default (transformers.js or fastembed),
   provider override via config.
- Vector store: sqlite-vec (local, no server, embeddable).
- Index: incremental by mtime + explicit `kb index`; no watcher in v1.
- Embed: title + description + body, note-level (no chunking in v1).
- Ranking: normalized score fusion of literal + semantic; graph as optional
  context.
- Graph is a mode (`kb graph ...`) *and* optional context for `kb search`.

## What downstream work the answer may create

- Fixes the three search slices' implementation choices and dependencies.
- Sets the embedding/vector-store deps in `kb-client-js-api`.
- Feeds `decide-rag-grounding-and-qa-surface` (what search returns and how
  it's ranked shapes retrieval).

## Note

The local-model availability/quality is partly empirical; a short capability
check may inform Q1, but the local-vs-hosted *preference* and store choice
are human decisions — that's why this is grilling, not research.

## Decisions (settled in grilling)

- **Q1 — Embedding source: SETTLED (e) configurable, default (a) transformers.js
  in-process — but only impl (a) is built in v1.** The `Embedder` interface is
  the swap seam (already defined); v1 ships **only** the transformers.js
  implementation (Xenova, in-process, offline/private, ~100–300 MB first-run
  download). Configurable-via-`.kb/config` is the *shape* (the interface +
  config key), not extra implementations now — keep it configurable without
  adding complexity. Hosted/Ollama impls are deferred; swap in later by
  implementing `Embedder` + a config flip.
- **Q2 — Vector store: SETTLED (a) sqlite-vec — and reuse it for other indexes.**
  Local, embeddable in the Node process, no server, lives in `.kb/index.db`.
  Use sqlite-vec (or the same SQLite DB) as the home for **literal and graph
  indexes too**, not just vectors — one store, three index kinds, simpler
  story. Confirmed by the "perhaps other kinds of indexing as well" note.
- **Q3 — Index lifecycle: SETTLED (c) hybrid.** CLI does full builds/rebuilds
  (`kb index`, `kb rebuild-indexes`); the pi extension does incremental
  per-file updates after its native write (touches one file + the index, no
  full walk). No file watcher in v1 (a Fog/graduation item if needed).
- **Q4 — What gets embedded: SETTLED (b) per-section chunking.** Split long
  bodies by headings; embed chunks with a parent-note pointer. Better recall
  than note-level; more index entries + parent aggregation in results. (v1
  choice — not deferred.) Chunk size/overlap and parent aggregation details
  surface when implementing the semantic-search slice.
- **Q5 — Unified ranking: SETTLED (b) reciprocal rank fusion (RRF).** Combine
  ranks not scores; one tunable constant (k≈60). Robust across engines with
  differing score distributions; avoids normalization headaches. Graph is
  **not** a rank signal (edges aren't scores) — it's a separate `graph()`
  mode + optional `withGraph` context on `searchUnified`.
- **Q6 — Graph's role: SETTLED (c) both + predicate-filtered.** Graph is a
  standalone mode *and* a context aid: `graph(ref, dir, opts?: { predicate? })`
  returns `Ref[]`, and `searchUnified(q, { withGraph })` attaches neighbors as
  context. Keep the existing `graph(ref, dir)` signature (direction baked into
  `dir: 'ancestors' | 'descendants' | 'neighbors'` — ancestors/descendants are
  transitive closures, neighbors is direct both-ways); **do not** refactor to
  direction/hops. The only addition for (c) is an optional predicate filter:
  `graph(ref, 'ancestors', { predicate: 'decided_in' })`. Typed predicates are
  what make graph earn its place over OKF's untyped links.

## Open: none — `decide-search-architecture` fully settled.
