---
kind: task
type: feature
slug: pi-adapter-skill-and-tools
title: pi adapter — KB tRPC client tools + conversational Q&A (kb-ask) skill
map: agent-knowledge-base
status: done
blocked_by:
  - kb-client-js-api
slices:
  - kb-tools-extension
  - conversational-qa-rag
---

## User-visible outcome

From inside pi, the agent can reach the KB through registered tools (a
**tRPC client** of the daemon), and a user can ask a natural-language
question and get an answer grounded in the KB with citations to concept
ids — all by consuming the agent-agnostic daemon. This is the first
concrete adapter proving the daemon + tRPC surface is agent-agnostic.

## User story

As a pi user, I can say "what does the KB say about X?" and get a cited
answer; and the agent, while working, can look up / search notes in the KB
via tools without me writing KB-specific code. The agent authors notes
with pi's native `write`/`edit` (the daemon's pi-facing surface omits
`Write`), then asks the daemon to reindex via `search.update`.

## Scope boundaries

- **In scope**: a pi extension that is a **tRPC client** of the daemon
  (not an fs linker — V1 is daemon-mediated), exposing KB *semantic* +
  *read/search* tools; and a pi skill (`kb-ask`) implementing RAG retrieval
  + cited answers per the settled RAG rules.
- **Out of scope**: rendering pi inside the Silverbullet UI (Fog); the
  daemon itself (previous task); autonomous curation (next task — this
  task provides the *mechanism*, curation builds on it).
- No new search engines — reuse the daemon's search via tRPC.
- Pi authors via its **native `write`/`edit`** (governance: agent may edit
  anything; git is the safety net). The daemon's pi-facing binding subset
  omits `Write.put`/`Write.delete`.

## Acceptance criteria

- **Tools** (registered via the pi extension; each maps a daemon tRPC
  procedure → a pi tool, generated from the pi-shaped `GroupBindings`
  subset): `kb_get` (Read.get), `kb_list` (Read.list), `kb_search`
  (Search.searchUnified), `kb_graph` (Search.graph), `kb_update`
  (Search.update — for post-write reindex), `kb_check_id` (Search.checkId),
  `kb_resolve_path`/`kb_resolve_id` (LocalFs). **No `kb_put`/`kb_delete`**
  — pi authors with native `write`/`edit`. The pi binding subset is
  `GroupBindings`-enforced (a new daemon method → pi's record errors until
  bound or `EXCLUDED`).
- Config via pi settings / env: daemon URL (`http://localhost:PORT/trpc`),
  token (from keyring/env). No committed secrets.
- **`kb-ask` skill**: retrieves via `kb_search` (`searchUnified`, RRF-blended,
  k≈8) with `withGraph` context; filters lifecycle (exclude `deprecated`,
  flag `stale_after`-past, mark `draft`/`unverified` — document-level);
  fills a 4k-token context budget (configurable via `.kb/config`
  `qa.contextBudgetTokens`) with top hit chunks; answers with inline
  `[Title](formatRef(ref))` citations; **verify-before-emit** (each cited id
  resolves via `kb_get`/`kb_resolve_id`; re-verify on emit); **"I don't
  know"** when no hit clears the cosine floor (~0.25) or zero hits after
  lifecycle filter.
- A round-trip: the agent creates a note via native `write` + `kb_update`,
  then `kb-ask` answers a question whose answer is in that note, with a
  correct citation.

## Existing abstractions to use

- The daemon's tRPC surface + the `GroupBindings` enforcement (previous task).
- `Ref`/`Actor`/`formatRef`/`parseRef`/`parseActor` (from `@kb/core`) for
  tool args and citations.
- pi extension API (`pi.registerTool`) + pi skills (markdown instruction sets).
- OKF actor convention for AI notes: `generated.by = pi/<version>/<model>`
  (the extension supplies the model id when the agent authors — via a
  `kb_frontmatter_for`/`kb_stamp_provenance` *read-only* helper tool if
  useful, or the skill teaches it).

## Architecture / domain decisions (folded from grilling)

- pi is the **first adapter**; it's a **daemon client** (tRPC), proving the
  surface is agent-agnostic. No pi-specific coupling leaks into the daemon
  or OKF.
- Conversational Q&A is RAG over the daemon's `searchUnified` — no separate
  index; stateless per question (a pi skill inherits the session context;
  memory is not a separate decision).
- Citations point to OKF concept ids (`formatRef`), traceable in the SB UI.
- v1 = `kb-ask` in pi; SB-UI Q&A is Fog (no graduation ritual).
- Authoring model (b): the skill teaches authoring (frontmatter shape,
  provenance, `generated.by`); the library validates (via `kb_check_id`).
- Governance (from `decide-second-brain-governance`): the agent may edit
  anything (git is the safety net); never self-promotes `draft`→`stable`;
  deprecates only with explicit consent; links don't duplicate; provenance
  non-negotiable.

## Implementation notes

The pi adapter is a **tRPC-client pi extension**
(`packages/pi-adapter`) that exposes 8 KB tools to a pi agent —
`kb_get` (Read.get), `kb_list` (Read.list), `kb_search`
(Search.searchUnified), `kb_graph` (Search.graph), `kb_update`
(Search.update, for post-write reindex), `kb_check_id` (Search.checkId),
and `kb_resolve_path`/`kb_resolve_id` (LocalFs) — each mapped from a
daemon tRPC procedure generated from the pi-shaped `GroupBindings` subset
(`piBindings`). There is **no `kb_put`/`kb_delete`**: pi authors with its
native `write`/`edit` (the daemon's pi-facing binding subset omits
`Write.put`/`Write.delete`); the agent reindexes via `kb_update`. Tools
**throw on failure** (pi contract: a thrown error is surfaced, not
swallowed) with a mapped user-facing message. Config is `KB_URL` +
`KB_TOKEN` (env/settings, no committed secrets).

The **kb-ask** skill (`packages/pi-adapter/skill/kb-ask/SKILL.md`) is a
pure-markdown RAG instruction set (no code): retrieve via `kb_search`
(`searchUnified`, RRF-blended, k≈8, `withGraph`) → lifecycle filter
(document-level, exclude `deprecated`, flag `stale_after`-past, include
`draft`/`unverified` with marker) → fill a 4k-token context budget
(`qa.contextBudgetTokens` from `.kb/config`) → answer grounded in
retrieved context (no outside knowledge) → inline
`[Title](formatRef(ref))` citations → verify-before-emit (every cited id
resolves via `kb_get`/`kb_resolve_id`; re-verify on emit; no hallucinated
links) → "I don't know" (cosine floor ~0.25 or zero hits after filter;
names what was tried) → stateless per question. Authoring/governance notes:
`generated.by = pi/<version>/<model>`, native `write`/`edit` +
`kb_update` + `kb_check_id`, never self-promote `draft`→`stable`,
deprecate with consent, provenance non-negotiable.

pi is the **first adapter** proving the daemon + tRPC surface is
agent-agnostic — no pi-specific coupling leaks into the daemon or OKF.

Full suite: **115 tests passed + 1 skipped** (the opt-in
`embedder.integration.test.ts`), `tsc --build` clean. Slice 1
(`kb-tools-extension`) added the extension + 8 tools; slice 2
(`conversational-qa-rag`) added the `kb-ask` skill + a 16-test
content/structure auto-gate
(`packages/pi-adapter/tests/kb-ask-skill.test.ts`).

### Deviations folded in (from the grilling/arch-spec)

- **`PiAppRouter` typed as `ReturnType<typeof buildPiRouter>`**, not as
  `Omit` of the full daemon router — the pi binding subset is a
  first-class constructed router, not a subtractive view.
- **TOOL_SPECS-driven registration**: tools are registered from a
  declarative `TOOL_SPECS` table (name, procedure path, arg/result types)
  rather than hand-wired `pi.registerTool` calls, so adding a tool is a
  one-line spec edit.
- **Throw-on-failure**: tool failures throw (pi contract) instead of
  returning `null`/swallowing; the extension maps the tRPC error to a
  user-facing message.
- **`kb_graph` predicate parameter removed**: the daemon's `Search.graph`
  procedure's predicate-arg schema was dropped from the pi binding subset
  (predicate filtering is not exposed to the pi agent in v1), removing the
  schema drift between the pi hand-mirrored typebox schemas and the
  daemon's Zod schemas.

### Hitl gate deferred

Slice 2 (`conversational-qa-rag`) is `mode: hitl`. Its automation gate is
the content/structure test (RAG steps present + ordered, pure markdown, no
code). The **real human review of answer/citation quality** against a
live KB — judging groundedness, citation resolution in the SB UI, correct
"I don't know", draft/deprecated handling, context truncation — is a
**separate follow-up task** (`review-kb-ask-qa-quality`, created by the
parent) and is **not** part of this task's acceptance. That review is a
prerequisite for confidence in the `kb-ask` surface before the
`second-brain-curation` task builds on it.
