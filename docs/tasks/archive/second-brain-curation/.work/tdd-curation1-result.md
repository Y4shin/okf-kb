# TDD result — slice `curation-skill` (task `second-brain-curation`)

## What was built

The `kb-curate` pi skill (a pure-markdown `SKILL.md` instruction set) plus a
content/structure auto-gate test, mirroring the `kb-ask` skill pattern exactly.

### Files

- `packages/pi-adapter/skill/kb-curate/SKILL.md` — the skill (pure markdown,
  frontmatter `name: kb-curate` + description; 8 numbered rule sections + a
  worked example + a governance summary).
- `packages/pi-adapter/tests/kb-curate-skill.test.ts` — content/structure
  test (NOT LLM-judgment) that loads the SKILL.md and asserts the 8
  rule-areas are present and ordered, the kb_* tools are referenced, the
  skill is pure markdown (no `@kb/fs`/daemon imports), no `kb_put`/`kb_delete`,
  and the example note is present.
- `packages/pi-adapter/scripts/install-pi.mjs` — generalized the skill
  symlink list from a hardcoded `kb-ask` to `['kb-ask', 'kb-curate']` so
  `npm run install:pi` picks up the new skill dir.

### The 8 rule-areas (from arch-spec + governance decisions)

1. **Triggers** — user says "save/research into the KB" or durable reusable
   claim found; do NOT curate ephemeral/one-off work.
2. **Type selection** — term/concept/decision/reference/generic, with
   generic as the gauge type (anything that doesn't fit the four → generic
   until the type vocab is extended; non-empty generic set is a signal to
   add a type).
3. **Provenance** (non-negotiable) — `generated.by = pi/<version>/<model>`;
   `sources` as `{resource, title?, author?, last_modified?}` (session
   transcript/log for distillation, real URLs for research); conflicting
   sources → separate entries, noted in the body.
4. **Lifecycle** — AI notes are `status: draft`, trust `unverified`; the
   agent never self-promotes draft→stable (a human review flips both);
   deprecate only with explicit consent (`ctx.ui.confirm`); humans deprecate
   freely.
5. **Authoring model (b)** — native `write`/`edit` (no `Write` on the
   daemon's pi-facing surface; no separate put/delete tools) → `kb_update`
   reindex → `kb_check_id` validate conformance.
6. **Link, don't duplicate** — `kb_search` before creating; near-match →
   link (typed relation + prose markdown link); wrong human note →
   correcting linked decision/concept note preferred (records the
   disagreement visibly); agent may edit (git backstop) but linking is the
   taught default.
7. **Frontmatter shape** — `id: type:slug`, `type`, `title`, `description`,
   `tags?`, `relations?` (typed + prose link per relation), `generated`,
   `sources?`, `status: draft`, `stale_after?` (sparingly).
8. **Edit-anything + git** — agent may edit any note (git is the undo);
   append provenance on edit, don't erase the original author's.

### Example included

A worked example distilling a decision-making session into a
`decision:use-better-sqlite3` note: `sources` → the session transcript/log,
`generated.by = pi/0.80.10/<model>`, `status: draft`, and a `decided_in`
relation to the `concept:search` note it backs, with a prose markdown link.

## TDD process

1. **RED** — wrote `kb-curate-skill.test.ts` first; ran it → failed
   (`ENOENT`: SKILL.md didn't exist).
2. **GREEN** — wrote minimal `SKILL.md` covering all 8 rules → 15/17 passed.
   Two failures: (a) the ordering test used first-mention indexOf which
   matched intro text before the rule headings — fixed the test to match
   `## Rule N` heading lines (like kb-ask matches `## Step N`); (b) the
   `no kb_put/kb_delete` assertion failed because the SKILL.md named those
   tools to say "don't use them" — removed the literal names per the task
   spec (the skill must not reference them at all).
3. **GREEN** — all 17 tests pass.
4. Updated `install-pi.mjs` to symlink `kb-curate`; verified the symlink
   lands in `~/.pi/agent/skills/kb-curate`.
5. Full suite + typecheck green; committed.

## Commands run

- `npx vitest run packages/pi-adapter/tests/kb-curate-skill.test.ts` —
  RED (ENOENT), then GREEN (17/17).
- `npm run typecheck` (tsc --build) — passed.
- `npm test` (full vitest run) — 134 passed | 1 skipped (opt-in embedder
  integration test), 18 test files passed.
- `node packages/pi-adapter/scripts/install-pi.mjs` — linked
  `~/.pi/agent/skills/kb-curate` successfully.

## Divergence from plan

- **install-pi.mjs change (in-scope):** the arch-spec noted the install
  script "currently globs or lists `kb-ask`" and to "update if needed." It
  hardcoded `kb-ask`; I generalized it to a `skills = ['kb-ask', 'kb-curate']`
  array with a loop. This is explicitly anticipated by the arch-spec and
  task.md ("check install-pi.mjs — if it hardcodes kb-ask, add kb-curate").
- **No `kb_put`/`kb_delete` literal mentions:** the test asserts the skill
  must not reference these (not registered tools). The arch-spec and task.md
  both say "No `kb_put`/`kb_delete`." I reworded the SKILL.md to say "no
  separate put/delete tools — author with native `write`/`edit` only" instead
  of naming the unregistered tools. This is faithful to the constraint, not
  a divergence — but worth noting since the kb-ask skill *does* name them (in
  its Authoring Notes section). The kb-curate test is stricter, matching the
  slice's explicit constraint.

## Residual risks

- The auto-gate is content/structure only (NOT LLM-judgment). The real
  acceptance — that the agent actually produces well-formed notes that pass
  `kb_check_id` — is a follow-up manual review (mode: hitl), per the
  kb-ask precedent and the slice's `mode: hitl`.
- Slices 2–3 (session-distill-workflow, topic-research-workflow) are not
  implemented here (they are separate slices, blocked_by 1). The `kb-curate`
  skill holds the shared rules; the workflow skills will reference it.

## Notable events

- Had to fix the test's ordering check: first-mention `indexOf` matched
  "provenance"/"lifecycle" in the intro/description before the "type
  selection" heading. Switched to matching `## Rule N` heading lines, the
  same approach kb-ask's test uses for `## Step N`.
- The `no kb_put/kb_delete` test constraint required removing the literal
  tool names from SKILL.md even where they were used to say "don't use these"
  — reworded to "no separate put/delete tools."
