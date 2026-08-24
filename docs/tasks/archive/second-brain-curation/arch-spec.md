# Architecture spec — `second-brain-curation`

> Shared across the 3 slice chains for task `second-brain-curation`. All
> slices are `mode: hitl` skills/workflows built on the existing `kb_*`
> tools (from `pi-adapter-skill-and-tools`) — **no new infrastructure**.
> The pattern mirrors the landed `kb-ask` skill: a SKILL.md instruction
> set + a content/structure auto-gate test; the human review of note
> quality is a follow-up manual task.

## What this task delivers

The agent treats the KB as its **second brain**: on demand, it (1) knows
*when and how* to distill knowledge into the KB (the `kb-curate` skill),
(2) distills the current session into OKF notes ("save this session to
the KB"), and (3) researches a topic into OKF notes with real sources
("research X into the KB"). All authoring uses pi's native `write`/`edit`
+ `kb_update` (reindex) + `kb_check_id` (validate); the daemon's
pi-facing surface has no `Write` (governance: agent may edit anything,
git is the safety net).

## Placement

- **Skills**: `packages/pi-adapter/skill/kb-curate/SKILL.md` (slice 1),
  plus workflow sections added to it (or sibling skills) for slices 2–3.
  The `install:pi` script already symlinks `packages/pi-adapter/skill/*`
  into `~/.pi/agent/skills/`; add `kb-curate` to it.
- **Tests**: `packages/pi-adapter/tests/kb-curate-skill.test.ts` (and
  workflow tests) — content/structure tests, same pattern as
  `kb-ask-skill.test.ts`.

All in the existing `packages/pi-adapter` package (no new package).

## Slice 1 — `curation-skill` (the `kb-curate` skill, mode hitl, size m)

### Deliverable

`packages/pi-adapter/skill/kb-curate/SKILL.md` — a pure-markdown instruction
set (frontmatter `name: kb-curate`, `description: <when to use>`) teaching
the agent when and how to write to the KB.

### Skill content (the rules, from the task + `decide-second-brain-governance`)

The SKILL.md instructs the agent on:

1. **Triggers**: when to curate — the user says "save this session to the
   KB" / "research X into the KB" / "add this to the KB", or the agent
   identifies a durable, reusable claim/decision in a session worth
   distilling. Do NOT curate ephemeral/one-off work.
2. **Type selection** (from `okf-format-adaptation`'s 5 types):
   - `term` — a glossary definition ("what is X?").
   - `concept` — how something works ("how does X work?").
   - `decision` — why X over Y (ADR-style; "why X over Y?").
   - `reference` — a spec/external-source summary ("what's the spec?").
   - `generic` — the **gauge type**: anything that doesn't fit the four is
     `generic` until the type vocab is extended; a non-empty set of
     `generic` notes is a signal to add a type.
3. **Provenance** (non-negotiable for AI notes):
   - `generated.by = pi/<version>/<model>` (the agent's pi version + model).
   - `sources` on derived notes: a list of `{resource, title?, author?,
     last_modified?}` — for session distillation, the session
     transcript/log; for topic research, real URLs with credibility
     signals. Conflicting sources → **separate** `sources` entries, noted
     in the body.
4. **Lifecycle**: AI-distilled notes are `status: draft`, trust
   `unverified`. The agent **never self-promotes** `draft`→`stable`; a
   human review flips both. **Deprecate only with explicit consent** (a
   confirmation gate, e.g. pi's `ctx.ui.confirm`); humans deprecate freely.
5. **Authoring model (b)**: pi authors with its **native `write`/`edit`**
   (the daemon's pi-facing surface has no `Write`). After writing:
   `kb_update({ref, content})` to reindex, then `kb_check_id({ref})` to
   validate conformance (id format, frontmatter shape, required fields).
6. **Link, don't duplicate**: **`kb_search` before creating** — if a
   near-match exists at a clear threshold, **link** to it (add a typed
   relation + a prose markdown link) instead of creating a duplicate. For
   a wrong human note, a correcting linked `decision`/`concept` note is
   preferred (records the disagreement visibly); the agent *may* edit
   (git backstop) but linking is the taught default.
7. **Frontmatter shape**: `id: type:slug`, `type`, `title`, `description`,
   `tags?`, `relations?` (typed, + a prose markdown link per relation),
   `generated`, `sources?`, `status: draft`, `stale_after?` (sparingly).
8. **Edit-anything + git**: the agent may edit any note (git is the undo);
   append your provenance on edit, don't erase the original author's.

### Test plan (slice 1, auto-gate)

`packages/pi-adapter/tests/kb-curate-skill.test.ts` — a content/structure
test (NOT LLM-judgment) that:
- Loads `SKILL.md`, asserts frontmatter (`name: kb-curate`, `description`).
- Asserts the 8 rule-areas are present: triggers, type selection (the 5
  types incl. `generic` as the gauge), provenance (`generated.by`,
  `sources`, conflicts-as-separate-entries), lifecycle (draft/unverified,
  never self-promote, deprecate-with-consent), authoring model (native
  write + `kb_update` + `kb_check_id`), link-don't-duplicate
  (`kb_search` before create), frontmatter shape, edit-anything+git.
- Asserts it references the `kb_*` tools (`kb_search`, `kb_update`,
  `kb_check_id` at minimum).
- Asserts the skill is pure markdown (no `@kb/fs`/daemon code).
- (Optional, if feasible) a fixture-driven test: a stubbed `kb_search`
  returning a near-match → the skill instructs link-not-duplicate.

### Existing abstractions to use

- The `kb_*` tools (`kb_search`, `kb_resolve_id`, `kb_update`,
  `kb_check_id`) from `pi-adapter-skill-and-tools`.
- `okf-format-adaptation`'s type vocab + provenance rules.
- pi's native `write`/`edit`; git for undo.

### Do NOT

- No code in the skill (pure markdown). No `@kb/fs`/daemon imports. No
  `kb_put`/`kb_delete` (not registered). No self-promotion of lifecycle.
- Do NOT implement the session-distill or topic-research workflows here
  (slices 2–3); this slice is the *rules* skill.

## Slice 2 — `session-distill-workflow` (mode hitl, size m, blocked_by 1)

### Deliverable

A "save this session to the KB" workflow — either a section in
`kb-curate/SKILL.md` or a sibling `kb-save-session/SKILL.md`. It teaches
the agent to extract structured knowledge (decisions, facts, references)
from the current session and create/link OKF notes.

### Skill content

The workflow instructs the agent to:
1. **Extract** claims/decisions/facts from the session (via the session
   context pi provides), **not a verbatim dump** — summarize then distill.
2. For each extractable item: pick the `type` (per slice 1's rules),
   `kb_search` for a near-match (link if found, else create), author with
   native `write` (frontmatter + provenance: `generated.by`,
   `sources` → the session transcript/log, `status: draft`,
   `unverified`), add typed `relations` + prose links to existing
   concepts, `kb_update` to reindex, `kb_check_id` to validate.
3. The daemon auto-maintains `index.md` + `log/` + root `log.md` on the
   `kb_update` reindex path (no manual maintenance).
4. Re-distilling the same session → **links, doesn't duplicate**.

### Test plan (slice 2, auto-gate)

`packages/pi-adapter/tests/kb-save-session-skill.test.ts` — content/structure:
- Asserts the workflow steps (extract → type-select → kb_search →
  author → kb_update → kb_check_id) are present and ordered.
- Asserts "not a verbatim dump" / "summarize then distill".
- Asserts `sources` → the session transcript/log.
- Asserts link-don't-duplicate on re-distill.
- Pure markdown, references `kb_*` tools, no code.

## Slice 3 — `topic-research-workflow` (mode hitl, size m, blocked_by 1)

### Deliverable

A "research X into the KB" workflow (section in `kb-curate/SKILL.md` or
sibling `kb-research/SKILL.md`). The agent researches a topic (web + repo)
and synthesizes OKF notes with real `sources`.

### Skill content

The workflow instructs the agent to:
1. **Research** the topic (pi's `web_search`/`fetch_content` for the web;
   `read`/`grep` for the repo). Gather sources with credibility signals.
2. Synthesize `reference`/`concept`/`term`-typed notes; a `reference` note
   per key source. `sources` entries: `{resource: <URL>, title?, author?,
   last_modified?}`. Claims not supported by a source → marked or
   omitted. Conflicting sources → separate entries, noted in the body.
3. `generated.by = pi/<version>/<model>`, `status: draft`, `unverified`.
4. Cross-link to existing concepts; `kb_search` before creating
   (link-don't-duplicate); `kb_update` reindex; `kb_check_id` validate.
5. If no sources found → say so, don't fabricate. If topic too broad →
   narrow with the user. Paywalled/inaccessible source → note it.

### Test plan (slice 3, auto-gate)

`packages/pi-adapter/tests/kb-research-skill.test.ts` — content/structure:
- Asserts the workflow steps (research → synthesize → attribute →
  cross-link → kb_update → kb_check_id) present and ordered.
- Asserts `sources` entries with URL + title/author/last_modified where
  known; a `reference` note per key source.
- Asserts "claims not supported by a source are marked/omitted";
  "conflicting sources recorded as separate entries".
- Asserts "no sources found → don't fabricate"; "narrow with the user" if
  too broad.
- Pure markdown, references `kb_*` tools (+ `web_search`/`fetch_content`),
  no code.

## Cross-cutting decisions

- **All 3 slices are hitl skills** (pure markdown + content/structure
  auto-gate), like `kb-ask` slice 2. The tdd-worker writes the SKILL.md +
  the test; the human review of note quality is a **follow-up manual
  task** (created at finalize time), per the `kb-ask` precedent.
- **No new infrastructure** — built entirely on the `kb_*` tools + pi's
  native `write`/`edit`/`web_search`/`fetch_content`. No `@kb/fs`/daemon
  changes.
- **Governance** (`decide-second-brain-governance`): edit-anything + git;
  never self-promote `draft`→`stable`; deprecate only with consent;
  link-don't-duplicate; provenance non-negotiable; conflicts → linked
  `decision` note (KB records both views).
- **Placement**: `packages/pi-adapter/skill/kb-curate/` (+ sibling skill
  dirs if split). The `install:pi` script symlinks all of
  `packages/pi-adapter/skill/*` into `~/.pi/agent/skills/` — confirm it
  picks up `kb-curate` (it currently globs or lists `kb-ask`; update if
  needed).
- **Skill split vs. one skill**: slices 2–3 can be sections within
  `kb-curate/SKILL.md` OR sibling skills (`kb-save-session`, `kb-research`).
  Decide at port time: one skill with sections is simpler for discovery;
  sibling skills give separate `/skill:kb-save-session` and
  `/skill:kb-research` commands. Recommend **sibling skills** for
  distinct `/skill:` entry points (matches `kb-ask`'s single-purpose
  pattern); `kb-curate` holds the shared rules + type-selection, and the
  workflow skills reference it.
