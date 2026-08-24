---
kind: task
type: feature
slug: pi-adapter-skill-and-tools
title: pi adapter — KB tRPC client tools + conversational Q&A (kb-ask) skill
map: agent-knowledge-base
status: ready
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
