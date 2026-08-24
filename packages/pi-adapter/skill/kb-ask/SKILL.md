---
name: kb-ask
description: "Answer a natural-language question from the Silverbullet/OKF knowledge base with cited, grounded answers. Use when the user asks 'what does the KB say about X' or wants KB-grounded information with citations."
---

# kb-ask — Knowledge-Base Q&A with Cited, Grounded Answers

This skill answers a natural-language question from the knowledge base (KB)
using Retrieval-Augmented Generation (RAG). It retrieves relevant notes via
the `kb_*` tools, filters by lifecycle state, assembles a bounded context,
synthesizes a grounded answer with inline citations, verifies every
citation resolves before emitting, and says "I don't know" when there is
no evidence.

This skill is **pure instructions** — it teaches you to call the `kb_*`
tools registered by the pi extension. It does not build a tRPC client or call
the daemon directly; you use the tools, not code.

Follow the 8 steps below, **in order**, for every user question.

---

## Step 1 — Retrieve

Call `kb_search` with the user's question:

```
kb_search({ q: <the user's question>, opts: { withGraph: true } })
```

- `kb_search` runs the unified RRF-blended literal+semantic search
  (`searchUnified`), returning the top **k≈8** hits.
- `withGraph: true` pulls linked-concept context so connected notes are
  included.
- Each hit (a `SearchHit`) has `{ ref, title, snippet, score, mode }`.
- Use the `ref` to fetch a hit's full note via `kb_get` when you need more
  than the `snippet`. Use `kb_resolve_path({ ref })` to get the filesystem
  path of a note when you need to read or write it natively.
- `kb_search` is the only retrieval call — do not build a separate index
  or search engine. You can use `kb_list` to enumerate notes by `type`,
  `tag`, `status`, or `by` (author) when the user asks for a listing rather
  than a semantic search.

## Step 2 — Lifecycle Filter (document-level, MANDATORY)

For each retrieved hit, fetch its frontmatter via `kb_get({ ref })` (which
returns a `NoteView` with `frontmatter`). Apply these document-level
lifecycle filters **before** assembling context or answering — this is
non-negotiable:

- **`status: deprecated` → DROP the hit entirely.** Do not include its text
  in the context, do not cite it, do not paraphrase it, and do not flag it
  inline. Act as if the note does not exist for this question. (If a
  question is *about* a deprecated thing, answer from a non-deprecated
  note that *describes* the deprecation, e.g. a `decision` note — never
  from the deprecated note itself.) If the deprecated note was the only
  hit, proceed to Step 7 ("I don't know").
- **`stale_after` in the past → include with a flag.** Include the note
  but mark the answer `[stale: past its freshness date]` near the relevant
  claim.
- **`status: draft` or trust `unverified` → include with a marker.** Include
  them but mark inline with `[draft]` or `[unverified]` near the relevant
  claim.

The lifecycle is on the frontmatter (the document), not sections within a
note. We don't deprecate individual sections.

## Step 3 — Context Budget

Assemble the context you will synthesize from, bounded by a token budget:

- Fill **≤ `qa.contextBudgetTokens`** of the top hit chunks into your
  working context. The **default is 4000 tokens**, configurable via
  `.kb/config`.
- For each hit, use its `title` + `description` + `snippet`. If you need
  more body, `kb_get` the note and use its body sections.
- **Truncate to the budget** — do not exceed it. Long notes must not drown
  out others; the prompt stays bounded.
- This is an input-side cap on retrieval fed to the model. It says nothing
  about answer length.

## Step 4 — Answer Grounded

Synthesize your answer **from the retrieved context ONLY**. Do not use
outside knowledge for factual claims about the KB. If the retrieved context
does not support a claim, do not make the claim.

Mark `draft`/`unverified`/`stale` inline where relevant, using the markers
from Step 2 (e.g., `[draft]`, `[unverified]`, `[stale: past its freshness
date]`).

## Step 5 — Citations

Cite every supported claim with an inline markdown link:

```
[Title](concept:slug)
```

where `concept:slug` is the `formatRef(ref)` form — the OKF id (`type:slug`,
e.g. `concept:foo`), not the raw filesystem path. This form is traceable in
the Silverbullet UI.

Rules:
- **One citation per supported claim.** If a claim spans multiple notes,
  cite each supporting note.
- **Every cited id MUST resolve** (verified in Step 6).
- The citation target is the note's `formatRef` — the `type:slug` form.
- If a claim has no single source, mark it `[unverified]` inline.

## Step 6 — Verify Before Emit

**Before** you emit the answer, for **each** cited id:

- Call `kb_get({ ref: <the cited id> })` (or `kb_resolve_id({ ref: <the
  cited id> })`) to confirm the note still exists.
- **Re-verify on emit** to catch mid-session deletions — a note may have
  been deleted between retrieve and answer.
- If a citation does not resolve, **drop or rephrase** it — remove the
  link, or rephrase the claim to not require it.
- **No hallucinated links.** Every link in your answer must point to a
  note that resolves via `kb_get` or `kb_resolve_id`.

## Step 7 — "I Don't Know"

Refuse to answer (say "I don't know") when:

- **No hit clears the cosine floor (~0.25)** — even if literal grep
  matched loosely; a low-confidence match is not evidence. The
  `score` field on each `SearchHit` is the RRF-blended score; if none
  is above the floor, refuse.
- **Zero hits remain after lifecycle filtering** — if every hit was
  `deprecated` (dropped per Step 2) or otherwise filtered out, refuse. A
  deprecated note is **not** evidence and must not be cited or paraphrased.

When you refuse, **name what was tried** — state the query you searched
and the filters you applied (e.g., "I searched for 'X' with withGraph;
no note clears the confidence floor of ~0.25"). Do not guess. Do not
answer from outside knowledge. Honest, not overconfident.

## Step 8 — Stateless

This skill is **stateless** per question. It inherits the agent's session
context (pi's conversation context), but it does not maintain its own
memory across questions. The KB is the durable memory; session context is
pi's. Each question is answered independently from the current KB state.

---

## Example

A note `concept:silverbullet` contains the body:

> Silverbullet watches the space folder via `SB_FS_WATCH=auto` and picks up
> writes on save.

**Question:** "How does SB pick up writes?"

**Retrieve:** `kb_search({ q: "how does SB pick up writes?", opts: {
withGraph: true } })` returns a hit with `ref: concept:silverbullet`,
`title: Silverbullet`, `snippet: "Silverbullet watches the space folder
via SB_FS_WATCH=auto"`.

**Lifecycle:** `kb_get({ ref: "concept:silverbullet" })` shows
`status: stable` — no filter needed.

**Answer (cited):**

> Silverbullet picks up writes by watching the space folder, configured
> via `SB_FS_WATCH=auto` [Silverbullet](concept:silverbullet).

**Verify:** `kb_get({ ref: "concept:silverbullet" })` resolves — the
citation is valid. Emit.

---

## Authoring Notes (model b)

When the user asks you to **create or edit** a note in the KB (not just
answer a question), you author with pi's **native `write`/`edit`** tools
(not `kb_put`/`kb_delete` — those are not registered). After writing:

1. **Write the note** with native `write`/`edit` — include proper
   frontmatter (`type`, `id`, `title`, `description`, `tags`, `relations`,
   `status`).
2. **Stamp provenance** — set `generated.by` in the frontmatter to
   `pi/<version>/<model>` (your pi version and model name). Provenance is
   non-negotiable.
3. **Add sources** — if the note synthesizes from other notes or external
   sources, list them in the frontmatter `sources` field.
4. **Set `status: draft`** — newly authored notes start as `draft` unless
   the user explicitly says otherwise.
5. **Reindex** — call `kb_update({ ref, content })` to reindex the note so
   it is searchable.
6. **Validate** — call `kb_check_id({ ref })` to validate the note's
   conformance (id format, frontmatter shape, required fields).

### Governance

- **You may edit anything** in the KB — git is the safety net. But:
- **Never self-promote** a note from `draft` to `stable`. Lifecycle
  promotion requires explicit user consent.
- **Deprecate only with explicit consent** — never deprecate a note on
  your own; ask the user first.
- **Links don't duplicate** — when adding relations, check for existing
  edges via `kb_graph` before adding.
- **Provenance is non-negotiable** — every note you author or edit must
  have a `generated.by` stamp. If you edit an existing note, append your
  provenance, don't erase the original author's.
