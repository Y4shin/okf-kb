# Verify — slice `conversational-qa-rag` (pi-adapter-skill-and-tools)

**Slice doc:** `docs/tasks/pi-adapter-skill-and-tools/slices/02-conversational-qa-rag.md`
**Arch spec:** `docs/tasks/pi-adapter-skill-and-tools/arch-spec.md`
**Branch:** `task/pi-adapter-skill-and-tools`
**Mode:** `hitl` — the auto-gate is the content/structure test; real human review of answer/citation quality is a separate follow-up.

## Commands run (all from repo root)

### 1. `git branch --show-current`
```
task/pi-adapter-skill-and-tools
```
✅ Confirmed on the correct branch. Working tree has untracked `.work/` files (expected for this run) and a modified `docs/tasks/state.yaml`.

### 2. `npm install`
✅ Exit 0. 70 packages seeking funding; 5 vulnerabilities (4 high, 1 critical) — pre-existing, not introduced by this slice. `allow-scripts` warnings for native-build packages (`better-sqlite3`, `sharp`, `esbuild`, `protobufjs`, `@google/genai`) — pre-existing, not slice-related.

### 3. `npm run typecheck` (`tsc --build`)
```
> typecheck
> tsc --build
EXIT: 0
```
✅ Exit 0. Full project typecheck clean.

### 4. `npm test` (`vitest run`)
```
 Test Files  17 passed | 1 skipped (18)
      Tests  114 passed | 1 skipped (115)
   Start at  19:17:26
   Duration  1.58s
EXIT: 0
```
✅ Exit 0. **17 test files passed, 1 skipped** (the skipped file is `packages/fs/tests/embedder.integration.test.ts`, an integration test gated on external embedder creds — pre-existing, unrelated to this slice). **114 tests passed**.

The slice's own test file passed:
```
✓ packages/pi-adapter/tests/kb-ask-skill.test.ts (15 tests) 9ms
```

## Slice test assertions verification

`packages/pi-adapter/tests/kb-ask-skill.test.ts` is a **content/structure test** of `packages/pi-adapter/skill/kb-ask/SKILL.md` (the `kb-ask` skill). It asserts the RAG steps are present and correctly ordered. Confirmed the test asserts all 8 required elements:

| # | Required assertion | Test `it(...)` | Status |
|---|---|---|---|
| 1 | **retrieve** (kb_search + withGraph + k≈8) | `'has a retrieve step mentioning kb_search, withGraph, and k≈8'` — checks `kb_search`, `withgraph`, regex `/k\s*[≈=]\s*8\|top.?8/i` | ✅ pass |
| 2 | **lifecycle filter** (deprecated exclude / stale_after flag / draft+unverified include with marker) | `'has a lifecycle-filter step: exclude deprecated, flag stale_after, include draft/unverified with marker'` — checks `deprecated` + `/exclude.*deprecated/`, `stale_after` + `/flag.*stale\|past.*freshness/`, `draft` + `unverified` + `/[draft]\|[unverified]/` | ✅ pass |
| 3 | **context budget** (contextBudgetTokens/4000/.kb/config) | `'has a context-budget step mentioning contextBudgetTokens / 4000 / .kb/config'` — checks all three substrings | ✅ pass |
| 4 | **citations** ([Title](formatRef(ref))) | `'has a citations step mentioning [Title](formatRef(ref)) and formatRef'` — checks `formatref` + regex `/[title]\(.*formatref\|formatref\(ref\)\|[title]\(concept:/` | ✅ pass |
| 5 | **verify-before-emit** (kb_get/kb_resolve_id + re-verify) | `'has a verify-before-emit step mentioning kb_get / kb_resolve_id and re-verify'` — checks `/kb_get\|kb_resolve_id/`, `/re-verify\|reverify/`, `/no hallucinated\|hallucinated/` | ✅ pass |
| 6 | **"I don't know"** (cosine floor ~0.25 + zero hits after filter + names what was tried) | `'has an "I don\'t know" step mentioning cosine floor (~0.25), zero hits after filter, and names what was tried'` — checks `/cosine.*0.25\|floor.*0.25/`, `/zero hits\|no hit clears\|zero.*remain/`, `/name.*what was tried\|what was tried/` | ✅ pass |
| 7 | **stateless** | `'has a stateless note'` + ordering test includes Step 8 stateless heading | ✅ pass |
| 8 | **pure markdown** (no @kb/fs / daemon code imports) | `'does NOT contain code blocks that import @kb/fs'` + `'does NOT contain code blocks that directly call the daemon or create a tRPC client'` — negates `@kb/fs`, `createtrpcclient`, `httpbatchlink`, `import '@kb/daemon`, `import '@kb/protocol` | ✅ pass |

Additional test coverage (beyond the 8 required): frontmatter (`name === kb-ask`, description >20 chars); tool references (8 `kb_*` tool names); step ordering (retrieve → lifecycle → budget → citations → verify → refuse → stateless via `## Step N` heading indices); governance (no self-promotion, deprecate-only-with-consent, provenance non-negotiable); authoring notes (model b: native write/edit, `generated.by`, frontmatter, `kb_update` reindex, `kb_check_id` validate).

## SKILL.md review

`packages/pi-adapter/skill/kb-ask/SKILL.md` is pure markdown (frontmatter `name: kb-ask` + `description`, 8 ordered steps, example, authoring notes, governance). It contains no code that imports `@kb/fs`, `@kb/daemon`, `@kb/protocol`, or builds a tRPC client — it teaches the agent to call the `kb_*` tools. This matches the arch-spec's "kb-ask is pure instructions — no code, no new search, reuses `kb_search`."

## Result

**Slice `conversational-qa-rag` verified — lint clean (tsc --build exit 0), slice tests passing (15/15), full project suite green (17 passed, 1 skipped, 114 tests passed).**

## Residual risks

- **hitl acceptance not covered by automation**: The content/structure test asserts the SKILL.md's RAG steps are present and ordered, but does NOT validate actual answer/citation quality against a real KB. The arch-spec defines the human-in-the-loop review (answer quality, citation correctness on a real KB) as the separate acceptance gate — that is a follow-up task outside this verifier's scope.
- **No behavioral/runtime test**: The skill is pure markdown; there is no execution test of the agent following the instructions. Correctness depends on the LLM adhering to the instructions.
- **Cosine floor ~0.25 is an instruction, not enforced**: The threshold is taught in the SKILL.md but not enforced by any tool; a weak hit could still slip through if the model ignores the instruction.
- **`kb_search` `score` is RRF-blended, not a cosine similarity**: The skill frames the ~0.25 floor as "cosine floor" but the `SearchHit.score` field is the RRF-blended score per the arch-spec; the exact score semantics (and whether ~0.25 is the right threshold for an RRF score) is a semantic detail the human reviewer should confirm during the hitl pass.
