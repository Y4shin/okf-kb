---
kind: task
type: grilling
slug: decide-rag-grounding-and-qa-surface
title: Decide RAG grounding, citations, and the Q&A surface phasing
map: agent-knowledge-base
status: done
blocked_by:
  - decide-js-api-scope-and-contract
  - decide-search-architecture
---

## Decision to settle

The conversational Q&A design: retrieval/grounding strategy, citation
format and verification, stale/deprecated handling, the "I don't know"
threshold, and the phasing between "ask pi directly" (v1) and "pi inside
the Silverbullet UI" (later/Fog). The map settled *that* Q&A is RAG over
the JS API with citations and a refusal behavior; this grilling settles
the concrete grounding rules and the graduation criteria for the Fog item.

## Parent decisions it depends on

- Q&A is RAG over the JS API search (pi-adapter task, decided).
- v1 Q&A is "ask pi directly"; pi-inside-SB-UI is Fog (map, decided).
- `search(query, {modes})` contract (from `decide-js-api-scope-and-contract`).
- Ranking/return shape (from `decide-search-architecture`).

## Choices already known

- Citations point to OKF concept IDs so answers are traceable in the SB UI.
- The agent says "I don't know" when there's no evidence (pi-adapter task).
- Reuse the JS API search; no separate index.

## The specific questions to grill (one at a time)

1. **Retrieval strategy.** Top-k semantic + literal fallback; what k? Any
   reranking? How is the context budget set for long notes? (Recommend:
   semantic top-k with literal fallback, k=5–10, no reranking in v1, truncate
   per-note to a token budget.)
2. **Citation format.** Inline links to concept IDs (`[Title](/path.md)`);
   one citation per supported claim; what if a claim spans multiple notes?
   (Recommend: cite each supporting note; if a claim has no single source,
   mark it unverified inline.)
3. **Verify-before-emit.** Confirm every cited concept ID exists in the
   bundle *before* the answer is emitted (no hallucinated links). What if a
   note was deleted between retrieval and answer?
4. **Stale/deprecated handling.** Exclude `status: deprecated`; flag notes
   past `stale_after`; treat `draft`/`unverified` how — include with a flag
   or exclude? (Recommend: exclude deprecated; flag stale; include draft
   with a "draft" marker.)
5. **"I don't know" threshold.** Min score / min hit count below which the
   agent refuses rather than answers. (Recommend: refuse if no hit clears a
   semantic-score floor, even if literal grep matched loosely.)
6. **Phasing + graduation.** Confirm v1 = `kb-ask` skill in pi; "pi inside
   SB UI" stays Fog. What trigger graduates the Fog item — e.g. the
   SB-embedded-search research landing + a working `kb-ask`? Define the
   exit criterion now.
7. **Conversation memory.** Is `kb-ask` stateless per question or does it
   remember the session? (Recommend: stateless per question for v1; session
   context is pi's, not the KB's.)

## Recommended starting answer

- Retrieve semantic top-k (k≈8) + literal fallback; no reranking; per-note
  truncation to a token budget.
- Cite concept IDs per claim; verify links exist before emitting.
- Exclude deprecated; flag stale; include draft with a marker.
- Refuse below a semantic-score floor even on loose literal matches.
- v1 = `kb-ask` in pi; Fog item graduates when SB-embedded-search research
  lands *and* `kb-ask` is verified.
- Stateless per question in v1.

## What downstream work the answer may create

- Shapes the `conversational-qa-rag` slice's retrieval/citation/refusal
  behavior.
- Sets the graduation criteria for the `pi-inside-sb-ui` Fog item.

## Decisions (settled in grilling)

- **Q1 — Retrieval: SETTLED (b) `searchUnified` top-k + optional graph.** One
  call to `searchUnified` (RRF-blended literal+semantic, settled in
  `decide-search-architecture`) gets the top-k; `withGraph` pulls linked
  concepts as context. k≈8, then truncate to the context budget (Q5).
- **Q2 — Citation format & verify-before-emit: SETTLED.** Inline
  `[Title](formatRef(ref))` markdown links — one per supported claim, using
  the `Ref`/`formatRef` types we already have. **Verify-before-emit**: every
  cited concept id must exist in the bundle before the answer leaves the
  model (resolve via `LocalFs.resolveId` / `Read.get`); drop or rephrase any
  citation whose target doesn't resolve. Re-verify on emit to catch
  mid-session deletions. No hallucinated links.
- **Q3 — Stale/deprecated: SETTLED, document-level only.** Lifecycle filters
  apply to **whole-document** state (frontmatter), not sections within a
  note: `status: deprecated` → **excluded** from retrieval; `stale_after`
  past → included but **flagged** in the answer ("past its freshness date");
  `status: draft` / trust `unverified` → included with a "draft/unverified"
  marker. OKF lifecycle is on the frontmatter = the document; we don't
  deprecate individual sections.
- **Q4 — "I don't know" threshold: SETTLED (c) score floor + min-count.**
  Refuse if no hit clears a semantic-score floor (configurable, e.g.
  cosine ≥ 0.25 for small MiniLM embeddings) **or** if zero hits remain
  after lifecycle filtering. Refusal names what was tried ("no note clears
  the confidence floor"). Honest, not overconfident.
- **Q6 — Phasing: SETTLED, simplified.** v1 = "ask pi directly" via the
  `kb-ask` skill in pi. The "pi inside Silverbullet UI" idea (a SB plug
  surfacing Q&A in SB) is **deferred to Fog** until later — no graduation
  ritual beyond "defer until `kb-ask` is real and someone wants it."
- **Q5 — Context budget: SETTLED (a) token budget, 4k default, configurable.**
  Cap how much *search output* goes into the model in one Q&A turn: after
  `searchUnified` returns the RRF-blended top-k, include each hit's `title` +
  `description` + most-relevant **chunks** (per-section chunking, settled in
  search-arch) until ~N tokens are filled. Long notes don't drown out others;
  the prompt stays bounded. **Default 4k tokens; configurable** via
  `.kb/config` (a `qa.contextBudgetTokens` key). Purely an input-side cap on
  retrieval fed to the model — nothing about answer length. The model
  receives: the user's question + ≤budget tokens of top hit chunks (with refs,
  for citation) + the instruction to answer with inline
  `[Title](formatRef(ref))` links and to say "I don't know" if nothing clears
  the floor.
- **Q7 — Conversation memory: DROPPED (not a decision).** A pi skill runs within the agent's
  session and inherits pi's conversation context by default; "memory" is not
  a separate decision for the skill. The KB is the durable memory; session
  context is pi's. Nothing to decide.
