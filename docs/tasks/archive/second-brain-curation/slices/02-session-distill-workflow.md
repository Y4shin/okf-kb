---
kind: slice
slug: session-distill-workflow
title: "Save this session to the KB" workflow
task: ../task.md
mode: hitl
status: done
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

## Implementation notes

- **Delivered:** `kb-save-session` skill — pure-markdown `SKILL.md`
  (`packages/pi-adapter/skill/kb-save-session/SKILL.md`) implementing the
  "save this session to the KB" workflow. Built as a sibling skill (distinct
  `/skill:` entry point) that references `kb-curate` for shared rules.
- **8 steps (all present and ordered, Steps 1–8):**
  1. **Extract** — extract claims/decisions/facts from the session, *not* a
    verbatim dump; "summarize, then distill"; nothing durable → say so and stop.
  2. **Type-Select** — choose the concept `type`; *references kb-curate* for
    type selection (does not re-inline the `generic`-as-gauge rule).
  3. **kb_search / link** — `kb_search` before creating; near-match → link
    instead of creating (link-don't-duplicate).
  4. **Author** — pi's native `write`/`edit`; `sources` → the session
    transcript/log; `generated.by = pi/<version>/<model>`; `status: draft`.
  5. **Link relations** — typed `relations?` entries with prose markdown
    links to existing concepts.
  6. **kb_update** — `kb_update({ ref, content })` reindex; the daemon
    auto-maintains `index.md` + `log/` + root `log.md`.
  7. **kb_check_id** — validate conformance after writing.
  8. **Re-distill links** — re-distilling the same session links, doesn't
    duplicate.
- **Content/structure auto-gate:**
  `packages/pi-adapter/tests/kb-save-session-skill.test.ts` — asserts
  frontmatter, all 8 step headings present+ordered, tool references
  (`kb_search`/`kb_update`/`kb_check_id`), **no `kb_put`/`kb_delete`**,
  pure-markdown (no `@kb/fs`/daemon/tRPC), deferral to `kb-curate` (the phrase
  "gauge type" is not repeated inline), and a worked example (DB-driver
  distillation → `decision:use-better-sqlite3` with `decided_in` relation).
- **No `kb_put`/`kb_delete`, pure markdown** — asserted by the test; the skill
  uses only the `kb_*` read/search/update tools + pi's native write/edit.
- **mode hitl** — human note-quality review of distilled notes is a
  follow-up task (not a deviation); the agent never self-promotes
  `draft`→`stable`.
- **Verification:** `tsc --build` exit 0; `vitest run` → 178 passed + 1 skipped
  (21 new in `kb-save-session-skill.test.ts`). No deviations (deviation report
  confirms full spec conformance).
