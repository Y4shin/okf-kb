---
kind: slice
slug: conversational-qa-rag
title: kb-ask skill — RAG Q&A over the daemon, cited answers, verify-before-emit, "I don't know"
task: ../task.md
mode: hitl
status: done
size: l
blocked_by: [kb-tools-extension]
---

## End-to-end behavior

A pi skill `kb-ask` lets the user ask a natural-language question; the agent
retrieves via `kb_search` (`searchUnified`, RRF-blended, k≈8, `withGraph`
context), filters lifecycle (document-level), fills a 4k-token context
budget with top hit chunks, answers grounded in them, and cites concept
ids. Says "I don't know" when there's no evidence.

## Acceptance criteria

- **Retrieve**: `kb_search` with `searchUnified` (RRF literal+semantic),
  k≈8; `withGraph` for linked-concept context.
- **Lifecycle filter** (document-level, from frontmatter): exclude
  `status: deprecated`; flag `stale_after`-past ("past its freshness date");
  include `draft`/`unverified` with a marker.
- **Context budget**: ≤ `qa.contextBudgetTokens` (default 4k, configurable
  via `.kb/config`) of top hit chunks (title + description + most-relevant
  chunks from per-section chunking).
- **Citations**: inline `[Title](formatRef(ref))` markdown links, one per
  supported claim, using `formatRef` (emits `concept:foo`).
- **Verify-before-emit**: every cited id resolves via `kb_get`/
  `kb_resolve_id` before the answer leaves the model; re-verify on emit to
  catch mid-session deletions; drop or rephrase any unresolvable citation.
  No hallucinated links.
- **"I don't know"**: refuse if no hit clears the cosine floor (~0.25) or
  zero hits after lifecycle filter; the refusal names what was tried.
- **Stateless** per question (a pi skill inherits the session context;
  memory is not a separate decision).

## Test plan

- **Seams**: retrieval (which modes, k), context assembly + budget,
  citation verification, lifecycle filtering, refusal threshold.
- **Failure modes**: no hits → "I don't know"; conflicting notes (record
  both, mark unverified); a `deprecated` note (excluded); a `stale_after`
  note (flagged); a note deleted between retrieve and answer (citation
  dropped on re-verify); very long retrieved context (truncated to budget).
- **Scenarios**: a note containing the answer → cited answer; a question
  with no matching note → "I don't know"; a `draft` note → included with a
  marker; a deprecated note → not used.
- **Edge cases**: ambiguous question, partial match, citation points to a
  note deleted between retrieve and answer.

## Constraints and dependencies

- Depends on `kb-tools-extension` (the `kb_search`/`kb_get`/
  `kb_resolve_id` tools) and the daemon's `searchUnified` (RRF + per-section
  chunks) being functional.
- Human-in-the-loop (mode: hitl): review answer/citation quality during
  development.

## Implementation notes

Delivered the `kb-ask` pi skill as a pure-markdown instruction set
(`packages/pi-adapter/skill/kb-ask/SKILL.md`). The skill teaches the agent
the 8 RAG steps **in order**: retrieve (`kb_search`, `searchUnified`,
RRF-blended, k≈8, `withGraph` for linked-concept context) → lifecycle
filter (document-level from frontmatter: exclude `deprecated`, flag
`stale_after`-past, include `draft`/`unverified` with a marker) → context
budget (`≤ qa.contextBudgetTokens`, default 4k from `.kb/config`, top
hit chunks: title + description + most-relevant per-section chunks) →
answer grounded in retrieved context (no outside knowledge) → citations
(inline `[Title](formatRef(ref))`, one per supported claim, `formatRef`
emits `concept:foo`) → verify-before-emit (every cited id resolves via
`kb_get`/`kb_resolve_id` before the answer leaves the model; re-verify on
emit to catch mid-session deletions; drop/rephrase unresolvable citations;
no hallucinated links) → "I don't know" (refuse when no hit clears the
cosine floor ~0.25 or zero hits after lifecycle filter; name what was
tried) → stateless per question.

Authoring/governance notes are folded in: the OKF actor convention
`generated.by = pi/<version>/<model>`; authoring uses pi's native
`write`/`edit` + `kb_update` reindex + `kb_check_id` validate (model b:
skill teaches, library validates); governance — never self-promote
`draft`→`stable`, deprecate only with explicit consent, provenance
non-negotiable.

Content/structure auto-gate: `packages/pi-adapter/tests/kb-ask-skill.test.ts`
(16 tests) asserts the 8 steps are present and correctly ordered (all 8,
including Step 4 answer-grounded/no-outside-knowledge) via `## Step N —`
heading indices, plus the tool references (`kb_get`, `kb_list`,
`kb_search`, `kb_graph`, `kb_update`, `kb_check_id`, `kb_resolve_id`,
`kb_resolve_path`) and that the skill is pure markdown (no `@kb/fs`, no
`@kb/daemon`/`@kb/protocol` imports, no `createTrpcClient`/`httpBatchLink`
code). Full project suite: 115 tests passed + 1 skipped; `tsc --build`
clean.

This slice is `mode: hitl` — the auto-gate is the content/structure test
above; the real human review of answer/citation quality against a live KB
is a **separate follow-up task** (`review-kb-ask-qa-quality`), created by
the parent, which the automation cannot judge.
