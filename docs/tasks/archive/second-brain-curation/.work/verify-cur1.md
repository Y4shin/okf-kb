# Slice verification — `curation-skill` (task `second-brain-curation`)

**Branch:** `task/second-brain-curation` ✓
**Mode:** hitl (auto-gate = content/structure test; human note-quality review is follow-up)

## Quality gate results

### 1. Lint / typecheck
```
npm run typecheck  →  tsc --build  →  EXIT 0
```
PASS — typecheck clean.

### 2. Slice test (early signal)
`packages/pi-adapter/tests/kb-curate-skill.test.ts` → **17 tests, all passing**.
This is the slice's own content/structure auto-gate test. PASS.

### 3. Full project test suite (landing gate)
```
npm test  →  vitest run  →  EXIT 0
Test Files  18 passed | 1 skipped (19)
Tests       134 passed | 1 skipped (135)
```
PASS — full suite green. Matches expected counts exactly:
- 18 test files pass, 1 skipped (embedder.integration) ✓
- ~134 tests pass ✓
- 17 new in `packages/pi-adapter/tests/kb-curate-skill.test.ts` ✓

## Step 5 — Test coverage confirmation (8 rule-areas + tool refs + pure-markdown)

The `kb-curate-skill.test.ts` asserts all required content/structure areas:

| Rule-area | Asserted in test | SKILL.md present |
|---|---|---|
| 1. Triggers (save/research into KB; durable; NOT ephemeral) | ✓ `Rule 1 — Triggers` | ✓ `## Rule 1 — Triggers` |
| 2. Type selection (5 types, generic as gauge) | ✓ `Rule 2 — Type Selection`, asserts all 5 types + `gauge` | ✓ `## Rule 2 — Type Selection` |
| 3. Provenance (generated.by, sources w/ author+last_modified, conflicts→separate) | ✓ `Rule 3 — Provenance` | ✓ `## Rule 3 — Provenance` |
| 4. Lifecycle (draft/unverified, never self-promote, deprecate-with-consent) | ✓ `Rule 4 — Lifecycle` | ✓ `## Rule 4 — Lifecycle` |
| 5. Authoring model (native write/edit + kb_update + kb_check_id, NO kb_put/kb_delete) | ✓ `Rule 5 — Authoring Model` + `describe('no kb_put/kb_delete')` asserts `not.toMatch(/kb_put|kb_delete/)` | ✓ `## Rule 5` |
| 6. Link-don't-duplicate (kb_search before creating; near-match→link) | ✓ `Rule 6 — Link, Don't Duplicate` | ✓ `## Rule 6` |
| 7. Frontmatter shape (id type:slug, type, title, desc, tags, relations, generated, sources, status draft, stale_after) | ✓ `Rule 7 — Frontmatter Shape` | ✓ `## Rule 7` |
| 8. Edit-anything + git (may edit any note; git undo; append provenance on edit) | ✓ `Rule 8 — Edit-Anything + Git` | ✓ `## Rule 8` |
| Rule ordering 1→8 | ✓ `the 8 rule headings appear in order (1 → 8)` | ✓ all `## Rule N` headings ordered |
| References kb_* tools (kb_search, kb_update, kb_check_id) | ✓ `describe('tool references')` | ✓ |
| Pure markdown (no @kb/fs, no daemon, no tRPC client) | ✓ `describe('pure markdown — no code / no daemon imports')` asserts no `@kb/fs`, no `createTrpcClient`, no `@kb/daemon` imports | ✓ |
| Example decision note | ✓ `describe('example note')` — asserts decision:slug, generated.by pi, status: draft, sources, relation + prose link | ✓ `## Example` |

**kb_put / kb_delete:** The test explicitly asserts `expect(lc).not.toMatch(/kb_put|kb_delete/)`
on the SKILL.md content — the skill must not instruct using these unregistered tools. ✓
**Pure markdown:** The test asserts no `@kb/fs` imports, no daemon/tRPC client references. ✓

## Files

- `packages/pi-adapter/skill/kb-curate/SKILL.md` (tracked, on branch)
- `packages/pi-adapter/tests/kb-curate-skill.test.ts` (tracked, 17 tests)
- `packages/pi-adapter/scripts/install-pi.mjs` — `kb-curate` added to skills array (symlinked on `install:pi`)

## Git status
- No staged files (`git diff --cached --name-only` empty).
- No modified tracked files (`git diff --name-only HEAD` empty).
- Only untracked: `docs/tasks/second-brain-curation/.work/` (this work dir).

## Verdict

**Slice `curation-skill` VERIFIED — lint clean (typecheck exit 0), slice tests passing (17/17), full project suite green (18 pass / 1 skip, 134 tests pass / 1 skip).**

All 8 rule-areas asserted in the test and present/ordered in SKILL.md; kb_* tools referenced; pure-markdown confirmed; no kb_put/kb_delete. Mode hitl — auto-gate passed; human note-quality review is a follow-up manual task.
