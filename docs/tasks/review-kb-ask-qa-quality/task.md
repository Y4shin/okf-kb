---
kind: task
type: manual
slug: review-kb-ask-qa-quality
title: Human review of kb-ask answer/citation quality (hitl gate for the pi adapter)
map: agent-knowledge-base
status: ready
blocked_by: []
---

## Exact prerequisite

The `kb-ask` pi skill is implemented (`packages/pi-adapter/skill/kb-ask/
SKILL.md`) and auto-gated by a content/structure test (the RAG steps are
present and ordered; the skill is pure markdown; no code). The slice
`conversational-qa-rag` is `mode: hitl` — its **real** acceptance gate is a
**human review of answer + citation quality** against a live KB, which
the automation cannot judge. This task is that human review.

## Owner / actor

- **Owner**: user (human-in-the-loop). The agent may start the daemon +
  install the extension/skill and seed a few probe notes; the user runs
  `/skill:kb-ask <question>` and judges the answers.

## Checklist / safe automation boundary

1. The pi adapter is installed: `npm run install:pi` (from
   `packages/pi-adapter`) symlinks the extension into
   `~/.pi/agent/extensions/pi-kb` and the skill into
   `~/.pi/agent/skills/kb-ask`. Confirm both symlinks exist.
2. The KB daemon is running: `kb daemon` (or `node packages/cli/bin/kb.js
   daemon`) against the global KB at `$KB_HOME` (`~/.local/share/kb`, which
   has the `glossary/test-term.md` probe note from `stand-up-silverbullet`).
   Confirm `GET /.ping` on the daemon + that the SB UI (Docker, port 3000)
   still shows the space.
3. Seed a few probe notes in the global KB covering a known topic (e.g. a
   `concept:silverbullet` note about `SB_FS_WATCH=auto`, a
   `concept:okf-format` note about the manifest, a `term:rrf` note about
   RRF) — write them via `kb write.put` (or native `write` + `kb_update`).
4. In a pi session with the extension loaded, run `/skill:kb-ask how does
   silverbullet pick up filesystem writes?` and judge:
   - the answer is **grounded** in the note (not hallucinated);
   - the citation is `[Title](concept:silverbullet)`-shaped and the link
     **resolves** in the SB UI;
   - a `draft` note is included with a `[draft]` marker;
   - a `deprecated` note is **excluded**;
   - a question with no matching note returns **"I don't know"** naming what
     was tried (the query + the lifecycle filter);
   - a long retrieved context is **truncated** to the ~4k-token budget.
5. (Optional) Delete a cited note between retrieve and answer; confirm the
   citation is **dropped on re-verify** (no dead link in the answer).

## Evidence required to mark it done

- A short record (in this task dir) of the questions asked + the answers'
   quality verdict (grounded? cited? resolved? "I don't know" correct?).
- Any defects found (e.g. a hallucinated link, a missing "I don't know",
  a stale note used without a flag) filed as fixes to the `kb-ask` SKILL.md
  or the `kb_*` tools.

## Dependent tasks that remain blocked

- None hard-blocked; but confidence in the `kb-ask` surface for the
  `second-brain-curation` task (which builds Q&A on top of this) depends on
  this review passing.
