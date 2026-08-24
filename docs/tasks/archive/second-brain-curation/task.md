---
kind: task
type: feature
slug: second-brain-curation
title: Second-brain curation — the agent autonomously expands the KB on demand
map: agent-knowledge-base
status: done
blocked_by: []
slices:
  - curation-skill
  - session-distill-workflow
  - topic-research-workflow
---

## User-visible outcome

The agent treats the KB as its second brain: on demand, it distills a
session or researches a topic into well-formed, linked, provenance-bearing
OKF notes — usable by both the AI later and the human now. Authoring uses
pi's native `write`/`edit` (git is the safety net); the daemon reindexes via
`search.update`.

## User story

As a user, I say "save this session to the KB" or "research X into the KB",
and the agent produces OKF-conformant notes with correct provenance, links
to existing concepts (link, don't duplicate), and updated `index.md`/`log`
— without me hand-writing anything.

## Scope boundaries

- **In scope (v1)**: on-demand curation — session distillation and
  user-directed topic research. Uses the pi adapter tools (which talk to
  the daemon).
- **Out of scope**: scheduled/autonomous background expansion (Fog,
  indefinitely); editing/deprecating existing notes automatically except
  per the governance rules.
- **Authoring**: pi's native `write`/`edit` (the agent may edit anything;
  git is the undo). The daemon's pi-facing surface has no `Write` — pi
  authors files, then `kb_update` reindexes.

## Acceptance criteria

- Distilled notes are OKF-conformant (valid frontmatter, non-empty `type`).
- **Provenance** is correct: `generated.by = pi/<version>/<model>`,
  `sources` point at the session transcript or the researched URLs with
  credibility signals (`author`, `last_modified`); conflicting sources
  recorded as separate `sources` entries and noted in the body. Never omit
  provenance for an AI note.
- **Lifecycle**: AI-distilled notes are `status: draft`, trust `unverified`
  (a human review flips both — the agent never self-promotes to `stable`).
- **Link, don't duplicate**: `kb_search` before creating; near-match at a
  clear threshold → link instead of create. For a wrong human note, a
  correcting linked `Decision`/`Note` is preferred (records the
  disagreement visibly); the agent *may* edit (git backstop) but linking is
  the taught default.
- New notes link to existing concepts where relevant; `index.md` and `log/`
  + root `log.md` updated (auto-maintained by the daemon's `Write`/the
  agent's native write + a reindex).
- **Deprecation**: the agent may deprecate only with **explicit consent**
  (a confirmation gate, e.g. pi's `ctx.ui.confirm`); humans deprecate freely.
- The human can browse the result in Silverbullet immediately.

## Existing abstractions to use

- `pi-adapter-skill-and-tools` (KB tools: `kb_search`, `kb_resolve_id`,
  `kb_update`, `kb_check_id`) for all searches/reindexes/conformance checks.
- `okf-format-adaptation` (concept types `term`/`concept`/`decision`/
  `reference`/`generic`, provenance, layout, manifest).
- OKF `index.md`/`log/` conventions.
- pi's native `write`/`edit` for authoring; git for history/undo.

## Architecture / domain decisions (folded from grilling)

- Curation is a **behavior** (pi skill) built on the adapter tools, not new
  infrastructure.
- The KB is a shared second brain: AI and human notes coexist, separated by
  `generated.by`, not by storage.
- **On-demand only** in v1 (and the foreseeable future); scheduled expansion
  is Fog indefinitely.
- **Governance** (from `decide-second-brain-governance`): agent may edit
  anything (git safety net); never self-promotes lifecycle; deprecates only
  with consent; link don't duplicate; provenance non-negotiable; conflicts →
  linked `Decision` note (KB records both views).

## Implementation notes

- **Delivered:** the second-brain curation capability as **3 sibling pi
  skills**, all pure-markdown `SKILL.md` instruction sets in
  `packages/pi-adapter/skill/`:
  1. `kb-curate` — the *rules*: when to curate (triggers), concept-type
    selection (`generic` as gauge), provenance, lifecycle/never-self-promote,
    consent-gated deprecation, the authoring model, link-don't-duplicate,
    frontmatter shape, edit-anything+git. The shared contract the other two
    skills defer to.
  2. `kb-save-session` — the *session-distill workflow* (8 steps):
    extract-not-verbatim → type-select (refs kb-curate) → kb_search/link →
    author (native write, sources→session transcript, generated.by, draft)
    → link relations → kb_update (daemon auto-maintains index.md/log) →
    kb_check_id → re-distill links.
  3. `kb-research` — the *topic-research workflow* (6 steps):
    research via web_search/fetch_content + read/grep → synthesize
    (reference/concept/term, a reference note per key source) → attribute
    (sources with URL+author/last_modified, unsupported claims marked/omitted,
    conflicting sources separate) → provenance (refs kb-curate) → cross-link
    (kb_search, link-don't-duplicate) → kb_update/kb_check_id.
- **Built on existing abstractions** — the `kb_*` tools (`kb_search`,
  `kb_update`, `kb_check_id`) from `pi-adapter-skill-and-tools`, pi's native
  `write`/`edit`, and `web_search`/`fetch_content` for research. **No
  `kb_put`/`kb_delete`** in any skill (asserted by all 3 tests). No `@kb/fs` or
  daemon code in the skills — they are pure markdown.
- **Auto-gated by content/structure tests** — 44 tests across the 3 skills
  (`kb-curate-skill.test.ts` 17, `kb-save-session-skill.test.ts` 21,
  `kb-research-skill.test.ts` 23), each asserting frontmatter, all step/rule
  headings present+ordered, tool references, no kb_put/kb_delete, pure-markdown,
  and a worked example.
- **install:pi** — `install-pi.mjs` now **globs**
  `packages/pi-adapter/skill/*`, auto-discovering all 3 skills (and any future
  ones) without editing a list.
- **Governance** (from `decide-second-brain-governance`, faithfully reflected):
  edit-anything + git (git is the undo; provenance appended on edit, not
  erased); **never self-promote** `draft`→`stable` (human review flips both);
  **deprecate only with consent** (`ctx.ui.confirm`; humans deprecate freely);
  **link-don't-duplicate** (`kb_search` before create); **provenance is
  non-negotiable** (`generated.by` + `sources`; conflicts as separate entries);
  conflicts → linked `Decision` note (KB records both views).
- **mode hitl** — human review of distilled/researched note quality (and
  source quality) is an expected follow-up task, per the `mode: hitl` design;
  not a deviation.
- **Verification:** `tsc --build` exit 0 (strict-mode clean);
  `vitest run` → 178 passed + 1 skipped. No deviations across all 3 slices
  (deviation reports confirm full spec conformance).
- **Slices:** all 3 landed — `curation-skill` (done), `session-distill-workflow`
  (done), `topic-research-workflow` (done).
