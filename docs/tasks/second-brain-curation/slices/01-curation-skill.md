---
kind: slice
slug: curation-skill
title: kb-curate skill — when and how the agent writes to the KB (governance + provenance)
task: ../task.md
mode: hitl
status: todo
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
