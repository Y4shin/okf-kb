---
kind: slice
slug: topic-research-workflow
title: "Research X into the KB" workflow
task: ../task.md
mode: hitl
status: todo
size: m
blocked_by: [curation-skill]
---

## End-to-end behavior

"Research <topic> into the KB" has the agent research a topic (web + repo)
and synthesize OKF notes with real `sources`, correct provenance, and
cross-links, browsable in Silverbullet.

## Acceptance criteria

- Produces `reference`/`concept`/`term`-typed notes with `sources` entries
  (URL + `title` + `author` + `last_modified` where known); a `reference`
  note per key source.
- `generated.by = pi/<version>/<model>`, `status: draft`, trust `unverified`.
- Cross-links to existing concepts; `index.md`/`log/` auto-maintained by the
  daemon after `kb_update`.
- Sources are real and cited; claims that aren't supported by a source are
  marked or omitted. Conflicting sources recorded as separate entries and
  noted in the body.
- **Link, don't duplicate** (via `kb_search` before creating); for a wrong
  human note, a correcting linked note is preferred.
- Passes `kb_check_id` after writing.

## Test plan

- **Seams**: source gathering, note synthesis, source attribution,
  linking, `kb_update` reindex.
- **Failure modes**: no sources found; sources conflict (record both,
  mark unverified); topic already covered by existing notes (link/extend,
  don't duplicate).
- **Scenarios**: research a concrete topic → notes with ≥1 `sources` entry
  each, a `reference` note per key source, cross-links resolve; verify
  sources are real URLs.
- **Edge cases**: paywalled/inaccessible source (note it); topic too broad
  (narrow with the user); conflicting sources (record both, mark
  unverified).

## Constraints and dependencies

- Depends on `curation-skill`. Uses pi's native `write`/`edit` + `kb_update`
  (daemon reindex). Git is the undo.
- Human-in-the-loop (mode: hitl): review synthesized notes and source
  quality.
