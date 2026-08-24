---
kind: slice
slug: session-distill-workflow
title: "Save this session to the KB" workflow
task: ../task.md
mode: hitl
status: todo
size: m
blocked_by: [curation-skill]
---

## End-to-end behavior

"Save this session to the KB" extracts claims, decisions, and facts from the
current session, creates/links OKF notes (via pi's native `write` +
`kb_update`), and the daemon auto-maintains `index.md` + `log/` + root
`log.md`.

## Acceptance criteria

- Extracts structured knowledge (decisions, facts, references) from the
  session, not a verbatim dump.
- Creates notes of the right `type` with `sources` pointing at the session
  transcript/log, `generated.by = pi/<version>/<model>`, `status: draft`,
  trust `unverified`.
- Links new notes to existing concepts; `index.md` + `log/` + root `log.md`
  auto-maintained by the daemon's `Write`/the agent's native write + a
  `kb_update` reindex.
- No duplicate concepts; near-matches link instead (via `kb_search`).
- Passes `kb_check_id` after writing.

## Test plan

- **Seams**: extraction, note creation (native write), `kb_update` reindex,
  link resolution, `index.md`/`log` maintenance (daemon-side).
- **Failure modes**: nothing extractable; all content duplicates existing
  notes (link); a `log/` entry missing (daemon creates it).
- **Scenarios**: distill a real session → 1–3 linked notes, `index.md`
  lists them, `log/` has a dated entry; re-distilling the same session
  links, doesn't duplicate.
- **Edge cases**: session spans multiple topics (split into multiple
  notes); references a deleted concept (link is broken-but-tolerated per
  OKF §6.1).

## Constraints and dependencies

- Depends on `curation-skill`. Uses pi's native `write`/`edit` + `kb_update`
  (daemon reindex). Git is the undo.
- Human-in-the-loop (mode: hitl): review extracted notes before they're
  considered done.
