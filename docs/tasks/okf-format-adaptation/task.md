---
kind: task
type: grilling
slug: okf-format-adaptation
title: Decide the OKF v0.2 adaptation for a personal AI+human second brain
map: agent-knowledge-base
status: done
blocked_by: []
---

## Decision to settle

How do we adapt OKF v0.2 — which is format-generic but exemplified for
enterprise/data-catalog concepts — into the working convention for a
**personal knowledge base that is co-authored by an AI agent and a human**?
This fixes the shape every KB note takes, so the JS API, the pi adapter, and
the curation workflows all build on it.

A strong reference exists: `~/tmp/kb-llm-system/` — a mature OKF v0.2 bundle
(about an LLM system, in German) whose **layout and conventions** are the
model to follow. The content there is irrelevant; its structure is the
template. We grill to decide which of its patterns to adopt and what our
*domain-specific* vocabulary is, not to invent structure from scratch.

## Reference patterns from `~/tmp/kb-llm-system/` (the template)

- **Typed directories, each answering one question** — `glossary/` (term:
  what is X?), `concepts/` (concept: how does X work?), `decisions/`
  (decision: why X over Y?, ADR-style), `blueprint/` (blueprint: what's the
  rule?, normative), `guide/` (guide: how do I get there?, steps),
  `reference/` (reference: what's the spec?), `examples/` (example: what
  does it look like?). Plus `scripts/` for deterministic integrity checks.
- **`manifest.yaml`** at the root drives everything: `bundle` metadata,
  `entrypoints` (the reading paths), `types` (type → dir → question →
  `id_prefix`), `predicates` (controlled typed-relation vocabulary),
  `conventions` (documented), and `integrity_checks` (deterministic, CI-
  runnable: A1–A7 OKF conformance + B1–B7 bundle extensions).
- **Frontmatter per node**: `id: type:slug` (stable, path-independent,
  never recycled — an extension over OKF's path identity); `title`,
  `description`, `tags`; `relations:` typed edges with controlled predicates,
  **and** every relation also has a normal markdown link in prose so
  pure-OKF consumers still see the graph; `generated` on every node;
  `sources` on derived nodes; `verified` deliberately left unset until real
  review (never blanket-asserted); `status: draft|stable|deprecated`;
  `stale_after` sparingly.
- **Root files**: `index.md` (carries `okf_version`), `README.md`, `log.md`
  (ISO-dated history, newest-first), `manifest.yaml`.

## Parent decisions it depends on

- The KB format is OKF v0.2 (map, decided).
- The KB lives in a Silverbullet space as a folder of `.md` files (decided).
- AI and human notes coexist in the same space, distinguishable by
  `generated.by` (decided).

## The specific questions to grill (one at a time)

1. **Concept `type` vocabulary.** Adopt the reference's seven types
   (`term`/`concept`/`decision`/`blueprint`/`guide`/`reference`/`example`)
   wholesale, or trim/rename for a personal second brain? It models an LLM
   *system design*; ours is a *personal knowledge base*. Candidate trim:
   `term`/`concept`/`decision`/`reference` (drop `blueprint`/`guide`/
   `example` unless we want normative/walkthrough/scenario sections). Or
   add a personal-KB type like `Note` (atomic idea) / `Topic` (hub) /
   `Session Distill` (AI-distilled session). Keep it small and extensible —
   OKF forbids a central registry.
2. **`manifest.yaml` adoption.** Do we adopt a root `manifest.yaml` as the
   machine-readable spine (types → dir → question → id_prefix, predicates,
   conventions, integrity checks), like the reference? It makes the JS API
   and the integrity checker data-driven instead of hardcoded. Confirm yes,
   and whether we want the full `integrity_checks` block (A1–A7 + B1–B7).
3. **`id: type:slug` extension.** Adopt the reference's path-independent
   stable `id` (extension over OKF's path-based identity, so renames/moves
   survive), or rely on OKF's path-as-concept-ID? The reference treats this
   as a documented, OKF-allowed extension.
4. **Typed `relations` + prose links.** Adopt typed relations with a
   controlled predicate vocabulary (e.g. `uses`, `decided_in`, `part_of`,
   `constrains`), **with the rule that every relation also has a normal
   markdown link in prose** (so the graph stays walkable for pure-OKF
   consumers)? The reference's decision D-042 calls this the binding extra
   rule. This is the question that most shapes the JS API's graph search.
5. **Directory layout.** Confirm the typed-directory structure (one dir per
   type, each answering one question) vs a flatter personal layout. Where
   do AI-distilled vs human-authored notes live — same folders, separated
   only by `generated.by` (decided in principle; confirm the folders).
6. **`index.md` / `log.md`.** Adopt per-directory `index.md` (progressive
   disclosure, auto-generated) and a root `log.md` (ISO-dated history,
   newest-first) — does the JS API generate/maintain these?
7. **Provenance & trust in practice.** AI-distilled notes: `generated.by =
   pi/<version>`, `sources` → session transcript or URLs, `status: draft`,
   trust `unverified` until a real review flips it to `human-reviewed` /
   `stable`? The reference **deliberately leaves `verified` unset** until a
   check actually happens — confirm we follow that (no blanket trust).
8. **Wikilinks vs markdown links — SETTLED by research.** The SB research
   (`research-sb-filesystem-and-plugs`, Q4) confirmed Silverbullet indexes
   **both** `[[wikilinks]]` and standard markdown links
   (`[text](path.md)` and `[text](/path.md)`) for backlinks — same `mention`
   relation, same backlink. **Decision: standardize on OKF-conformant standard
   markdown links** (relative `/path.md` / relative), not wikilinks. SB backlinks
   work, and pure-OKF consumers see the graph too. No wikilinks.

## Decisions (settled in grilling)

- **Q1 — Type vocabulary: SETTLED (b) + a 5th `generic` type.** Adopt the
  reference set **trimmed**: `term`, `concept`, `decision`, `reference`.
  Drop `blueprint`/`guide`/`example` for v1. **Add a 5th type `generic`** as a
  gauge of what is missing from the KB type schema — anything that doesn't
  fit the four is `generic` until the schema is extended; a non-empty set
  of `generic` notes is a signal to add a type. No `Note`/`Topic`/
  `Session Distill`/`Q&A` as explicit types in v1; extensible later.
- **Q2 — `manifest.yaml`: SETTLED yes.** Adopt a root `manifest.yaml` as the
  machine-readable spine (`types`/`predicates`/`conventions`/
  `integrity_checks`), trimmed to our five types. Makes the JS API and
  integrity checker data-driven.
- **Q3 — Stable IDs: SETTLED yes, with a path-identity fallback.** Adopt
  `id: type:slug` as the stable, path-independent identity (documented OKF
  extension), **but still allow raw OKF path-as-identity**. A JS API tool call
  (e.g. `kb normalize` / a migration op) **turns a path into the appropriate
  `type:slug` stable ID** — so existing path-identified notes can be
  upgraded in place, and new notes may start path-identified and be
  normalized later. Both forms coexist; normalization is idempotent.
- **Q4 — Typed `relations` + prose-link rule: SETTLED yes.** Adopt typed
  `relations` with a controlled predicate vocabulary, plus the binding
  rule that **every relation also has a normal markdown link in prose**
  (keeps pure-OKF consumers and SB backlinks working — confirmed by SB
  research Q4).
  - **Predicate vocabulary SETTLED:** `defines` (term defined here),
    `uses` (concept uses mechanism), `depends_on` (hard prereq), `part_of`
    (structural), `decided_in` (decision backs this), `constrains` (decision
    limits a concept), `supersedes` (replaces an older node),
    `derived_from` (AI note derived from a source/session — typed provenance
    edge complementing `sources`). `taught_in`/`specified_in` dropped (no
    `guide`/`blueprint`). `cites`/`supports`/`contradicts` deferred until
    curation/braindump needs them. Small and extensible.
- **Q5 — Provenance & trust: SETTLED yes, with `pi/<version>/<model>`.**
  AI-distilled notes: `generated.by = pi/<version>/<model>` (model included
  where available), `sources` required on derived notes, `status: draft`,
  trust `unverified`. `verified` left **unset** until a genuine human review
  flips it to `human-reviewed` + `stable`. No blanket `verified`; no AI
  self-verification to `machine-confirmed`.
- **Q8 — Link form: SETTLED by research.** Standardize on OKF-conformant
  **standard markdown links** (relative + `/path.md`), not wikilinks. SB
  backlinks work (SB indexes both); pure-OKF consumers see the graph too.
- **Integrity checks SETTLED:** adopt A1–A7 (OKF conformance) + B1–B5
  (id unique, id-prefix matches dir, relation target exists, no dead
  relative links, title+description present) + a custom **B8** (id is
  either path-derived or normalized `type:slug`, consistency with Q3).
  **Skip B6** (`term_de` — bilingual German/English; ours is English-first).
  **B7 (glossary terms linked on first mention) is an ERROR / hard check,**
  not a soft warning — unused/orphaned glossary terms (a term defined but
  never linked) are an indicator of orphaned data and should fail the check.
  All run via `kb check`, CI-runnable; loads rules from `manifest.yaml`.
- **Log shape SETTLED — hybrid.** A thin auto-generated root **`log.md`**
  (rolling recent N entries, OKF-conformant for pure-OKF consumers) **plus**
  a **`log/`** archive of full dated entries (`log/2026-08-24.md`, auto-
  appended, newest-first within each file). JS API maintains both on writes.
- **Git as log driver — NOT adopted; git and the OKF log are separate.**
  Rationale (see "Git vs the OKF log" below): using a git commit hook to
  auto-generate `log.md`/`log/` entries from each commit would **contradict
  the OKF spec's `log.md` structure** (§9: date-grouped prose entries, human
  summaries, not machine commit metadata) and would couple OKF conformance
  to a specific VCS. Git history is the transport/audit log; the OKF log is
  a curated change narrative. They stay separate: the JS API writes the
  OKF log on its own writes; git commits independently. (A pre-commit hook
  may *run* `kb check` as a gate, but must not author the OKF log.)

## Recommended starting answer (for remaining open questions)

- None — `okf-format-adaptation` is fully settled. Proceed to its
  finalization: write the `concepts/okf-conformance.md`-style profile note
  once the bundle exists, and hand the fixed schema/manifest/predicates/
  integrity-rules to `decide-js-api-scope-and-contract` and the curation
  tasks.

## Git vs the OKF log (rationale)

The OKF `log.md` (§9) is a **curated change narrative**: date-grouped prose
entries with human-readable summaries (`**Update**`, `**Creation**`,
`**Deprecation**`). It records *what changed and why*, in prose, for a reader.
Git history is an **audit/transport log**: commit messages, diffs, author,
timestamp — machine metadata about *how* the bytes changed.

A commit-hook-driven `log.md` would:
- Write machine-generated commit metadata into a file the spec says should be
  human prose summaries → contradicts OKF §9's structure.
- Make OKF conformance depend on a specific VCS (the spec is VCS-agnostic;
  a bundle may be a tarball, not a git repo — §3).
- Conflate two logs that serve different readers: the OKF log for a human/
  agent browsing the bundle, git for an operator auditing history.

So: **the JS API owns the OKF log** (writes dated prose entries on its own
create/update/delete, human-readable summaries). **Git commits independently**
and is the audit/transport log. A pre-commit hook MAY run `kb check` as a
gate, but it must not author the OKF log. The two logs coexist; neither
synthesizes the other.

## Additional decisions (settled in grilling)

- **Q6 — Directory layout: SETTLED yes.** Typed-directory structure, one dir
  per type: `glossary/` (term), `concepts/` (concept), `decisions/`
  (decision), `reference/` (reference). AI-distilled and human-authored
  notes live in the **same** folders, separated only by `generated.by` —
  no separate AI folder.
- **Q7 — `index.md` / log: SETTLED, with log as a dated directory.**
  - `index.md` per directory: auto-generated by the JS API (progressive-
    disclosure listings), maintained on create/update/delete.
  - **Log is a directory of dated entries, not a single `log.md` file**, so
    it does not become unmanageably large. Shape to confirm lightly next
    round: a `log/` (or `logs/`) directory with one file per day
    (`log/2026-08-24.md`), newest-first within each file, auto-appended by
    the JS API on writes. **OKF-conformance note:** OKF §3.1 reserves
    `log.md` as a single file; a `log/` directory is an OKF-allowed
    extension (consumers must tolerate it), but we lose the reserved-
    `log.md` mechanism. Recommended hybrid: keep a thin root `log.md`
    (OKF-conformant, rolling recent N entries, auto-generated) **plus** a
    `log/` archive of full dated entries — confirm this hybrid next round.
- **Q1 heads-up — braindump usecase (not a decision; recorded for later).**
  Intended usecase: perform braindumps by speaking into a microphone, with
  the capture living in the repo until acted upon. This is a **transient
  capture**, not a durable knowledge type. It **may add a type** later
  (e.g. `inbox` / `braindump`) or a staging `status`/location, and may
  shape the curation workflow (the "act upon" step distills a braindump
  into a durable `concept`/`reference`/`decision`). Recorded in the map's
  Fog; not decided now — the type vocab is designed to accommodate adding
  it without rework.

## What downstream work the answer may create

- Fixes the frontmatter schema + manifest the JS API validates against and
  reads its type/predicate vocab from.
- Defines the concept types the curation workflows emit.
- Determines the directory layout the `index.md`/`log.md` generators walk.
- Adds a `kb normalize` / migration op (path → `type:slug` stable ID) to the
  JS API operation set (feeds `decide-js-api-scope-and-contract`).
- `generated.by` for AI notes must carry `pi/<version>/<model>` — the pi
  adapter must supply the model id (feeds `pi-adapter-skill-and-tools`).
- Creates a `concepts/okf-conformance.md`-style note (a `reference`-typed
  note documenting our OKF profile + extensions), mirroring the reference.
- Feeds `decide-js-api-scope-and-contract` (manifest-driven ops) and the
  graph-search slice (typed relations).
