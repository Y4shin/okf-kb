---
kind: map
slug: agent-knowledge-base
title: Agent-maintained Silverbullet knowledge base
status: done
tasks:
  - research-sb-filesystem-and-plugs
  - okf-format-adaptation
  - decide-js-api-scope-and-contract
  - decide-search-architecture
  - decide-deployment-and-layout
  - decide-second-brain-governance
  - decide-rag-grounding-and-qa-surface
  - stand-up-silverbullet
  - kb-client-js-api
  - pi-adapter-skill-and-tools
  - review-kb-ask-qa-quality
  - remote-daemon-conditional-write
  - second-brain-curation
---

## Destination

A knowledge base that is simultaneously an AI second brain and a
human-queryable wiki:

- The KB is a Silverbullet space whose notes are written in the
  **Open Knowledge Format (OKF v0.2)** — a directory of markdown files with
  YAML frontmatter, with provenance/trust/lifecycle first-class.
- A single **agent-agnostic JS API** (library + CLI) reads/writes OKF notes
  and provides **literal + graph + semantic search**. It is the only surface
  any agent touches; it talks to the filesystem (local deployment) and, where
  needed, to Silverbullet's HTTP API.
- **pi is the first adapter**: a pi extension exposes the JS API as
  agent-callable tools, and a pi skill gives conversational Q&A grounded in
  the KB with citations.
- The agent **autonomously expands** the KB on demand — distilling its own
  sessions and user-directed research into well-formed, linked, provenance-
  bearing OKF notes. The same notes are browsable/searchable by the human in
  the Silverbullet UI.
- Other agents can adopt the KB later by consuming the JS API/CLI; no
  pi-specific coupling leaks into the KB format or the API.

Done looks like: an agent (pi) can create, read, link, and search KB notes
end-to-end; a human can browse and search the same notes in Silverbullet;
conversational Q&A returns cited answers; and the agent can save a session
or a research topic into the KB as conformant OKF notes.

## Constraints

- First iteration is **pi-only** as an agent, but the KB format and JS API
  must remain **agent-agnostic** — no agent identity or tooling leaks into
  OKF frontmatter or the API contract.
- Deployment is **local** (shared machine or Docker); the Silverbullet space
  folder is bind-mounted / on the same filesystem, so direct filesystem
  writes are available. (Remote-only deployment is out of scope for v1.)
- The KB format is **OKF v0.2**. Frontmatter validation must follow the OKF
  conformance rules (required `type`; toleration of unknown keys/types/broken
  links).
- Silverbullet-specific features (queries, objects, plugs, wikilinks) are
  reached **through the JS API**, never by baking SB coupling into the agent
  or the format.
- No secrets in the repo. The Silverbullet auth token lives in local config
  only.

## Decisions so far

High-level direction (decided; concrete choices pending grilling):

- **Format**: OKF v0.2. The bundle *is* the Silverbullet space. Concrete type
  vocabulary, provenance rules, directory layout, filename conventions, and
  the wikilink-vs-markdown-link form are grilled in `okf-format-adaptation`
  (and the link form is confirmed against the SB research outcome).
- **Structural template**: `~/tmp/kb-llm-system/` — a mature OKF v0.2 bundle
  whose **layout and conventions** are the model: typed directories (one per
  type, each answering one question), a root `manifest.yaml` driving
  types/predicates/conventions/integrity checks, `id: type:slug` stable IDs,
  typed `relations` with a prose markdown link for every relation, per-dir
  `index.md` + root `log.md`, and `verified` left unset until real review.
  We adopt/adapt its patterns in `okf-format-adaptation`; its *content* is
  irrelevant.
- **Agent surface**: one agent-agnostic JS library + `kb` CLI. Concrete
  language/runtime, packaging, operation set, transport strategy, and the
  `search()` contract are grilled in `decide-js-api-scope-and-contract`.
- **Transport**: local-filesystem writes are primary (deployment is local);
  SB HTTP `/.fs` API is a fallback/optional path. Whether it's *needed* is
  answered by `research-sb-filesystem-and-plugs`; the transport *strategy*
  (pluggable, fs default) is confirmed in `decide-js-api-scope-and-contract`.
- **Search**: literal + graph + semantic. Concrete embedding source, vector
  store, index lifecycle, what to embed, and unified ranking are grilled in
  `decide-search-architecture`.
- **Deployment & layout**: local SB whose space = the OKF bundle. Concrete
  bundle location, binary-vs-Docker, auth method, and versioning are grilled
  in `decide-deployment-and-layout`, then executed in `stand-up-silverbullet`.
- **First adapter**: pi — extension tools for CRUD/search + a RAG
  conversational-Q&A skill. Concrete retrieval, citation, refusal, and
  phasing rules are grilled in `decide-rag-grounding-and-qa-surface`.
- **Expansion mode (v1)**: on-demand autonomous curation (session distillation
  + topic research). Scheduled background expansion is deferred to Fog.
- **Shared second brain**: AI and human notes coexist in the same space,
  distinguishable via OKF `generated.by` actor convention, not via separate
  stores. The autonomy/governance line (create vs edit, lifecycle transitions,
  deprecation, duplicate policy) is grilled in `decide-second-brain-governance`.

## Fog

- **SB-embedded search**: surfacing literal/graph/semantic search *inside*
  the Silverbullet UI (via a SB plug or Space Lua calling the JS API).
  `research-sb-filesystem-and-plugs` (Q3) confirmed a SB plug **can** call an
  external HTTP service via `requiredPermissions: [fetch]` — so this is
  feasible. **Graduation criterion**: becomes a task once `kb-client-js-api`
  exposes `search()` over a transport a plug can reach (HTTP/local-socket).
  On-demand curation is in v1; this is a later capability.
- **Scheduled background expansion**: the agent growing the KB on a
  cron-like schedule without a human prompt. Graduates only after
  `decide-second-brain-governance` defines the guardrails (a review queue +
  bounded scope); on-demand curation is in v1.
- **pi rendered inside Silverbullet**: conversational Q&A surfaced in the SB
  UI itself (vs. "ask pi directly"). Graduates when both
  `research-sb-filesystem-and-plugs` (plug/runtime capabilities) lands *and*
  `decide-rag-grounding-and-qa-surface` defines the v1 `kb-ask` exit
  criterion — per the graduation criteria set in those tasks.
- **Braindump capture**: speak into a microphone → the transcript lives in the
  repo until acted upon (distilled into a durable `concept`/`reference`/
  `decision`). This is a transient-capture usecase, not a durable knowledge
  type; it **may add a type** (e.g. `inbox`/`braindump`) or a staging
  status/location later, and may shape the curation workflow. Recorded as a
  heads-up during `okf-format-adaptation` grilling; not decided yet — the type
  vocab is designed to accommodate it without rework. Graduates to a task
  once the curation workflows exist and the capture→distill path is worth
  formalizing.
- **Multi-agent adoption**: a second agent (non-pi) consuming the KB (via
  the MCP endpoint). The contract is designed for it, but no integration
  work is planned yet.
- **Local KBs (in-code-repo)**: a KB living inside a code repo, versioned
  alongside the code (vs the v1 global KB at a canonical path). Supported by
  the architecture (`--space ./kb`) but not exercised in V1; the space↔bundle
  mapping question (Q6) deferred until this is used.
- **V2 optional daemon**: in V1 the daemon is required (owns the index/
  embedder; serves tRPC + MCP). V2 makes it optional — a consumer links
  `@kb/fs` in-process via the typestate builder when a daemon is overkill.
  Same `Kb`, no daemon.

## Out of scope

- Remote-only Silverbullet hosting for v1 (local deployment only).
- A custom Silverbullet theme or editor extension beyond what search
  integration needs.
- Replacing Silverbullet's client-side index/query engine — we build
  alongside it, not inside it, for v1.
- Defining a fixed OKF concept taxonomy centrally — OKF explicitly does not
  register types; we pick a small working set in `okf-format-adaptation`.
