---
kind: slice
slug: curation-skill
title: kb-curate skill — when and how the agent writes to the KB (governance + provenance)
task: ../task.md
mode: hitl
status: done
size: m
blocked_by: []
---

## End-to-end behavior

A pi skill `kb-curate` defines when the agent should distill knowledge into
the KB and how: which concept `type` to use, how to set provenance
(`generated.by = pi/<ver>/<model>`, `sources`), the draft/unverified
lifecycle, link-don't-duplicate, and the governance rules (edit anything
+ git; deprecate only with consent). Demonstrated by distilling a sample
session into one well-formed note.

## Acceptance criteria

- The skill document specifies triggers, concept-type selection
  (`term`/`concept`/`decision`/`reference`/`generic`), provenance rules
  (`generated.by`, `sources` with `author`/`last_modified`; conflicts as
  separate entries), the `draft`/`unverified` lifecycle for AI notes, the
  **edit-anything + git** authoring model, the **link-don't-duplicate**
  rule (via `kb_search` before creating), and the **consent-gated
  deprecation** rule.
- Running the curation on a sample session produces one OKF note that
  passes `kb_check_id` and has correct provenance.
- The agent checks for a near-match before creating (via `kb_search`) and
  links instead of duplicating.

## Test plan

- **Seams**: trigger logic, type selection, provenance assembly, duplicate
  detection, governance conformance.
- **Failure modes**: no clear concept type → `generic` (the gauge type);
  near-match ambiguous; session has nothing worth distilling.
- **Scenarios**: distill a decision-making session into a `Decision` or
  `concept` note with `sources` → the session; verify provenance and
  draft/unverified status; `kb_check_id` passes.
- **Edge cases**: very long session (summarize then distill); session about
  an existing topic (link, don't duplicate); a wrong human note (create a
  correcting linked note, don't silently rewrite — or edit with git).

## Constraints and dependencies

- Depends on `pi-adapter-skill-and-tools` (tools) and `okf-format-adaptation`
  (types/provenance). Uses pi's native `write`/`edit` + `kb_update`.
- Human-in-the-loop (mode: hitl): review the distilled note's quality.

## Implementation notes

- **Delivered:** `kb-curate` skill — pure-markdown `SKILL.md`
  (`packages/pi-adapter/skill/kb-curate/SKILL.md`) governing when and how the
  agent distills knowledge into the KB.
- **8 rule-areas, all present and ordered (Rules 1–8):**
  1. **Triggers** — "save this to the KB" / durable reusable claim signals;
    explicitly NOT ephemeral/one-off work.
  2. **Type selection** — `term`/`concept`/`decision`/`reference`/`generic`,
    with `generic` as the *gauge* type; a non-empty `generic` result signals
    the agent should add a more specific type.
  3. **Provenance** — `generated.by = pi/<version>/<model>`; `sources` with
    `resource`/`title`/`author`/`last_modified`; conflicts recorded as
    separate entries (never merged).
  4. **Lifecycle** — `status: draft` / `unverified`; **never self-promote**;
    deprecate only with explicit consent (`ctx.ui.confirm`); humans can
    deprecate freely.
  5. **Authoring model** — pi native `write`/`edit` + `kb_update({ref,
    content})` + `kb_check_id({ref})`; **no `kb_put`/`kb_delete`** (asserted by
    test; the skill states "no separate put/delete tools").
  6. **Link-don't-duplicate** — `kb_search` before creating; near-match →
    link; wrong human note → correcting linked note preferred, may edit
    (git is the backstop).
  7. **Frontmatter shape** — `id: type:slug`, `type`, `title`, `description`,
    `tags?`, `relations?` (with prose markdown link per relation),
    `generated`, `sources?`, `status: draft`, `stale_after?`.
  8. **Edit-anything + git** — may edit any note; git is the undo; append
    provenance on edit (don't erase original); edit is about content, not
    lifecycle state.
- **Worked example** — a full sample-session distillation (DB driver
  choice) into a `decision:use-better-sqlite3` note, showing the
  `kb_update` → `kb_check_id` flow with correct provenance.
- **Governance summary** — all six governance decisions from
  `decide-second-brain-governance` (Q1 edit-anything+git, Q2 human-gated
  lifecycle, Q3 consent-gated deprecation, Q4 link-don't-duplicate, Q5
  non-negotiable provenance, Q7 conflict→linked-Decision) are faithfully
  reflected in the rules.
- **Content/structure auto-gate:**
  `packages/pi-adapter/tests/kb-curate-skill.test.ts` — 17 tests across 6
  describe blocks (frontmatter, 8-rule-areas present+ordered, tool
  references `kb_search`/`kb_update`/`kb_check_id`, no `kb_put`/`kb_delete`,
  pure-markdown/no-`@kb/fs`/no-daemon, example note with `decided_in`
  relation). All pass.
- **install:pi:** `install-pi.mjs` updated from a single hard-coded
  `kb-ask` symlink to an array `['kb-ask', 'kb-curate']` iterated in a loop;
  `kb-curate` is now symlinked.
- **Verification:** `tsc --build` exit 0; `vitest run` → 134 passed + 1
  skipped (17 new in `kb-curate-skill.test.ts`).
- **Deviations:** None. The deviation report (`deviation-reports/curation-skill.md`)
  confirms full spec conformance across API surface, abstraction usage,
  frontmatter, all 8 rule-areas, pure-markdown, content/structure test,
  install:pi, and governance conformance.
- **Follow-up (mode hitl):** human note-quality review of a distilled note
  is a manual follow-up, per the spec's `mode: hitl` design — not a
  deviation.
