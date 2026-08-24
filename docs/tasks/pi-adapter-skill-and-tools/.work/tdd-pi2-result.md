# TDD Result — slice `conversational-qa-rag` (pi-adapter-skill-and-tools)

## Summary

Implemented the `kb-ask` pi skill (`SKILL.md`) — a pure-markdown instruction
set that teaches the agent RAG Q&A over the KB daemon (retrieve → lifecycle
filter → context budget → grounded answer → citations → verify-before-emit →
"I don't know" → stateless), plus authoring/governance notes. Also wrote a
content/structure test (`kb-ask-skill.test.ts`) that auto-gates the skill's
instructions for correct content and step ordering.

Branch: `task/pi-adapter-skill-and-tools` (worked directly, no slice branch per
task instructions).

## Files changed

- `packages/pi-adapter/skill/kb-ask/SKILL.md` — full RAG instruction set
  (replaced the stub). Frontmatter `name: kb-ask` + description; 8 numbered
  steps + example + authoring/governance notes.
- `packages/pi-adapter/tests/kb-ask-skill.test.ts` — 15-test content/structure
  test: frontmatter, RAG step presence + ordering, tool references, no-code/
  no-daemon-imports assertions, governance/authoring notes.

## Test results

- `npm test` (full suite): **114 passed, 1 skipped** (the opt-in
  TransformersEmbedder integration test). No foreign test breakage.
- `npm run typecheck` (`tsc --build`): clean, no errors.
- The new `kb-ask-skill.test.ts`: **15 passed**.

## Divergence from plan

None. The SKILL.md and test match the arch spec's "Slice 2" content and the
`decide-rag-grounding-and-qa-surface` decisions exactly:
- k≈8, withGraph, cosine floor ~0.25, exclude deprecated, flag stale_after,
  include draft/unverified with marker, contextBudgetTokens default 4000 from
  `.kb/config`, citations `[Title](formatRef(ref))`, verify-before-emit via
  `kb_get`/`kb_resolve_id`, "I don't know" names what was tried, stateless.
- All 8 tool names referenced. No code, no `@kb/fs`, no daemon imports.
- Governance: never self-promotes draft→stable; deprecates only with consent;
  provenance non-negotiable.

## Notable events

- Test ordering initially used first keyword occurrence, which failed because
  the intro paragraph mentioned "lifecycle" before "kb_search". Fixed the
  test to use step headings (`## Step N —`) as canonical ordering markers —
  more robust and tests the actual document structure.
- The SKILL.md initially contained the literal string `@kb/fs` (in a sentence
  saying "It does not import `@kb/fs`"), which tripped the no-`@kb/fs`
  assertion. Rephrased to avoid the literal while keeping the instruction
  clear. Added `kb_list` and `kb_resolve_path` references that the test
  required.
