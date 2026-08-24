# Verify — slice `kb-tools-extension` (pi-adapter task)

**Branch:** `slice/kb-tools-extension`
**Date:** 2025-08-24

## Quality gate results

| Step | Command | Result |
|------|---------|--------|
| 1 | `git checkout slice/kb-tools-extension` → `git branch --show-current` | PASS — `slice/kb-tools-extension` |
| 2 | `npm install` | PASS — `up to date, audited 463 packages` |
| 3 | `npm run typecheck` (tsc --build) | PASS — exit 0, no errors |
| 4 | `npm test` (vitest run) | PASS — exit 0: **16 passed, 1 skipped** (17 files); **99 passed, 1 skipped** (100 tests) |

### Expected vs actual test results
- **Expected:** 16 test files pass, 1 skipped; ~99 tests pass (9 new in `packages/pi-adapter/tests/tools.test.ts`).
- **Actual:** 16 passed / 1 skipped (17 files); 99 passed / 1 skipped (100 tests). `packages/pi-adapter/tests/tools.test.ts` shows **9 tests** passing (tool registration count + `piBindings` structural gate + round-trip resolve_id→write→update→get + list + search + graph + execute end-to-end + error mapping). **MATCH.**

### Tool registration (acceptance criterion 5)
Confirmed **exactly 8** KB tools registered in `packages/pi-adapter/extension/src/tools.ts` (`TOOL_SPECS`):
- `kb_get` → `read.get`
- `kb_list` → `read.list`
- `kb_search` → `search.searchUnified`
- `kb_graph` → `search.graph`
- `kb_update` → `search.update`
- `kb_check_id` → `search.checkId`
- `kb_resolve_path` → `localFs.resolvePath`
- `kb_resolve_id` → `localFs.resolveId`

**No `kb_put` / `kb_delete`** — only mentions are in code comments (`NO kb_put/kb_delete…`, `no kb_put/kb_delete`); no write tool is registered. `piBindings` (the `@kb/protocol` subset) omits `Write.put`/`Write.delete` via `EXCLUDED` (asserted in the test: `hasWritePut`/`hasWriteDelete` are both `false`).

## Slice-test breakdown (`packages/pi-adapter/tests/tools.test.ts`, 9 tests)
1. `registers exactly 8 tools (no kb_put/kb_delete)` — tool names array equals the 8 sorted; not contains `kb_put`/`kb_delete`.
2. `every tool spec references a real piBindings entry` — `flattenBindings(piBindings)` contains all 8 `qualifiedName`s; omits `write.put`/`write.delete`.
3. `kb_resolve_id resolves a ref to {slug, ty}` — `{ slug: 'round-trip-note-a', ty: 'concept' }`.
4. `kb_get returns the created note after native write + kb_update` — frontmatter + body match.
5. `kb_list returns the created notes` — both slugs present.
6. `kb_search finds the created note (unified)` — `withGraph: true`, hits contain "Round Trip".
7. `kb_graph on a linked pair returns the edge` — descendants include `round-trip-note-b`.
8. `tool execute fn returns the same data as the tRPC client` — end-to-end via pi `execute`, JSON-parsed result matches `kb_get`.
9. `kb_get returns an error result when daemon is unreachable` — dead-client execute returns text matching `/fetch|econnrefused|connect|network|unreachable|error/`.

## Full-suite breakdown (16 passed / 1 skipped)
- `packages/fs/tests/chunk.test.ts` (3), `utility.test.ts` (6), `local-fs.test.ts` (8), `read.test.ts` (2), `index-admin.test.ts` (2), `check.test.ts` (3), `write.test.ts` (5), `search.test.ts` (5)
- `packages/protocol/tests/records.test.ts` (9)
- `packages/core/tests/types.test.ts` (15), `strictness.test.ts` (1)
- `packages/daemon/tests/deps.test.ts` (7), `auth.test.ts` (5), `server.test.ts` (9)
- `packages/pi-adapter/tests/tools.test.ts` (9) ← slice tests
- `packages/cli/tests/commands.test.ts` (10)
- **Skipped:** `packages/fs/tests/embedder.integration.test.ts` (1, requires external embedder) — pre-existing, not slice-related.

## Scope review (diff vs `main`)
Files added/changed by the slice (15 files, +3546 / −43):
- `packages/pi-adapter/extension/src/{index,client,tools,config}.ts` — the slice's core deliverables (4 new files).
- `packages/pi-adapter/tests/tools.test.ts` — slice tests (1 new file).
- `packages/pi-adapter/scripts/install-pi.mjs` — dev symlink installer (1 new file).
- `packages/pi-adapter/skill/kb-ask/SKILL.md` — stub for slice 2 (1 new file, clearly marked `TODO: filled in slice 2`).
- `packages/pi-adapter/{package.json,tsconfig.json}` + `packages/pi-adapter/extension/package.json` — workspace registration (3 new files).
- `packages/protocol/src/{router,index}.ts` — added `buildPiRouter` + `PiAppRouter` type (the pi-facing tRPC router omitting `Write`). This is a justified cross-package change: the arch spec says `PiAppRouter` is derived from `piBindings`; the implementer chose the `buildPiRouter`-driven approach (a `piBindings`-driven `buildRouter` variant) rather than `Omit<AppRouter,'write'>`. Both are sanctioned by the spec ("Decide at port time"). The `buildRouter` change also materializes `AsyncIterable` results to arrays (needed for `kb_list` over httpBatchLink) — required by the arch spec's note on `read.list`.
- `package.json` + `package-lock.json` — root deps: added `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `typebox`; lockfile regenerated.
- `tsconfig.json` — added `packages/pi-adapter` to project references.

**Constraints honored:**
- No `@kb/fs` import in `extension/src/` (pi is a daemon client) — confirmed by grep; `@kb/fs` only appears in `tests/tools.test.ts` as a devDependency (for `FakeEmbedder`), which is allowed.
- No `kb_put`/`kb_delete` registered — confirmed.
- No Q&A/RAG logic in this slice — `SKILL.md` is a stub marked for slice 2.
- `piBindings` loop is a structural `tsc` gate (`flattenBindings(piBindings)` iterated; each `TOOL_SPECS` `qualifiedName` must resolve or throw).

**Scope note:** The protocol-package change (`buildPiRouter`/`PiAppRouter`) is outside the `packages/pi-adapter/` directory but is explicitly authorized by the arch spec (the `PiAppRouter` derivation + the `read.list` array materialization are called out as needed). The `package-lock.json` churn is expected from adding root deps. No scope creep beyond the spec.

## git state
- No staged files (`git diff --cached --name-only` empty).
- One untracked directory: `docs/tasks/pi-adapter-skill-and-tools/.work/` (this verify report's output location — not part of the slice).
- 4 commits on the branch (`b2524c1` … `a8511ad`), all `wip:` prefixed.

## Residual risks
- The `SKILL.md` is a stub; slice 2 (`conversational-qa-rag`) owns its content — not a risk for this slice.
- Tool error mapping returns the raw error message as `text` content with `details: { error: true }` (no `isError` field on pi's `AgentToolResult`); the arch spec mentions an `isError` contract but pi's type doesn't expose it. The test asserts via text-matching, which is the pragmatic contract. Low risk — the agent still gets an actionable error string.
- `buildRouter` now materializes `AsyncIterable`→array for all procedures (not just `read.list`); harmless for non-iterable returns (the `Symbol.asyncIterator` guard skips them) but is a behavior change to the shared protocol router. Covered by the passing `server.test.ts` (9) and `cli/commands.test.ts` (10).

## Verdict

**PASS** — lint/typecheck clean (tsc --build exit 0), slice tests passing (9/9 in `tools.test.ts`), full project suite green (16 files / 99 tests passed, 1 skipped pre-existing). Exactly 8 KB tools registered with the expected names; no `kb_put`/`kb_delete`.
