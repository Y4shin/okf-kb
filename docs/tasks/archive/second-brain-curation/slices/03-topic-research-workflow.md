---
kind: slice
slug: topic-research-workflow
title: "Research X into the KB" workflow
task: ../task.md
mode: hitl
status: done
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

## Implementation notes

- **Delivered:** `kb-research` skill — pure-markdown `SKILL.md`
  (`packages/pi-adapter/skill/kb-research/SKILL.md`) implementing the
  "research X into the KB" workflow. Built as a sibling skill (distinct
  `/skill:` entry point) that references `kb-curate` for shared rules.
- **6 steps (all present and ordered, Steps 1–6):**
  1. **Research** — gather sources via `web_search`/`fetch_content` (web) +
    `read`/`grep` (repo); collect credibility signals (URL, title, author,
    `last_modified`); **no sources → don't fabricate**; topic too broad →
    narrow with the user; paywalled/inaccessible → note it.
  2. **Synthesize** — produce `reference`/`concept`/`term`-typed notes; a
    `reference` note per key source.
  3. **Attribute** — `sources` entries with URL + `author`/`last_modified`;
    unsupported claims → marked or omitted; conflicting sources → recorded as
    separate entries and noted in the body.
  4. **Provenance** — `generated.by = pi/<version>/<model>`, `status: draft`,
    trust `unverified`; never self-promote; *references kb-curate* for shared
    provenance/lifecycle rules.
  5. **Cross-link** — `kb_search` before creating; **link-don't-duplicate**;
    near-match → link; wrong human note → correcting linked note preferred.
  6. **kb_update / kb_check_id** — `kb_update` reindex (daemon auto-maintains
    `index.md` + `log/` + root `log.md`), then `kb_check_id` validate.
- **Content/structure auto-gate:**
  `packages/pi-adapter/tests/kb-research-skill.test.ts` — asserts frontmatter,
  all 6 step headings present+ordered, tool references
  (`kb_search`/`kb_update`/`kb_check_id`/`web_search`/`fetch_content`), **no
  `kb_put`/`kb_delete`**, pure-markdown (no `@kb/fs`/daemon/tRPC), deferral to
  `kb-curate`, and a worked example (sqlite-vec vs sqlite-fts5 →
  `reference:sqlite-vec` + `concept:vector-search-in-kb` with cross-links).
- **install:pi** — the `install-pi.mjs` script now **globs**
  `packages/pi-adapter/skill/*` (reads all subdirs and symlinks each), so
  `kb-research` (and `kb-save-session`) are picked up automatically without
  editing a list. Strictly better than the spec asked.
- **mode hitl** — human note-quality + source-quality review of researched
  notes is a follow-up task (not a deviation); the agent never self-promotes
  `draft`→`stable`.
- **Verification:** `tsc --build` exit 0; `vitest run` → 178 passed + 1 skipped
  (23 new in `kb-research-skill.test.ts`). No deviations (deviation report
  confirms full spec conformance).
