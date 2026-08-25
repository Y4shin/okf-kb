# Testing

## Framework

- **Vitest** for the TS packages (`@okf-kb/core`, `@okf-kb/fs`, `@okf-kb/protocol`,
  `@okf-kb/daemon`, `@okf-kb/cli`) — matches the Node/TS toolchain. 90 tests pass
  + 1 skipped (opt-in `TransformersEmbedder` integration test, skipped
  unless the model is cached / an env flag is set).
- **`tsc --strict`** (`npm run typecheck` = `tsc --build`) is the
  *enforcement* layer for the binding-record exhaustiveness guarantee
  (a forgotten method / schema drift → compile error) — run in CI, not
  just locally.

## Run commands

```sh
npm test                       # full suite (vitest run)
npm run test:watch             # watch mode (vitest)
npm run test -- <path>         # single file
npm run typecheck              # tsc --build across the workspace (the gate)
npm run build                  # tsc --build (emit)
```

## Mock conventions

- **`@okf-kb/core`**: pure — test with no mocks; Zod `parse`/`transform` and the
  typestate builder are exercised directly. A `tests/negatives.test-d.ts`
  proves the gates fire via `@ts-expect-error` (run by
  `packages/core/tests/strictness.test.ts` via the `typecheck:negatives`
  script). `GroupBindings` exhaustiveness + schema-drift negatives are in
  the same file.
- **`@okf-kb/fs`**: a tmp bundle dir + `FakeEmbedder` (deterministic hash →
  fixed-dim vector, no model download) + a tmp `.kb/index.db`. Never touch
  the real `$KB_HOME`. Fixtures (minimal / orphaned-glossary / dead-relation
  bundles) are generated in `beforeAll` inside the test files.
- **`@okf-kb/protocol`**: the records + router factory; `fullBindings` is typed
  `satisfies FullBindings` so a missing method fails `tsc`.
- **daemon**: tRPC + MCP over an ephemeral localhost port (port 0); a fake
  token (env) for tests; `FakeEmbedder` injected via `buildCommonDeps`;
  assert Bearer auth (401 on missing/bad token on both `/trpc` and `/mcp`).
- **CLI**: `runCli` called in-process with a stubbed argv + stdout capture
  (fast), plus ONE built-bin end-to-end test that spawns `node bin/okfkb.js`
  via `child_process` (proves the binary works); asserts `--json` output is
  parseable. The CLI test imports `FakeEmbedder` from `@okf-kb/fs` to stand up a
  daemon (test-only, not a CLI-runtime dep).

## Coverage

`@okf-kb/core` is near-100% (pure logic). `@okf-kb/fs` is integration-heavy
(better-sqlite3 + embedder + chunking + RRF + check) — the bulk of the
suite. The `TransformersEmbedder` integration test is opt-in (skipped
without a model cache / env flag) so the suite runs hermetically.

## What `tsc` enforces (not a test, a compile gate)

- **Exhaustiveness**: `GroupBindings<G> = { [K in keyof G]: { inputSchema:
  z.ZodType<Parameters<…>[0]>; meta } }` — adding a method to a group makes
  every consumer's binding record fail to compile until bound or `EXCLUDED`.
- **Schema drift**: the binding's `inputSchema` output must equal the
  method's param; rename a field → `_output … Property 'x' is missing`.
- **No-arg methods**: the core no-arg schemas are `z.void()`, but
  `MethodBinding<() => …>` requires the schema output to equal
  `Parameters[0]` = `undefined` (not `void`), so the no-arg binding records
  use `z.undefined()` (the core `z.void()` schemas can't satisfy
  `GroupBindings` for no-arg methods — they're not imported by the records).
- Run `tsc --strict` in CI so none of these slip through.

## Reproduction

AI reproduction is feasible for all code slices (pure TS + `tsc --strict`
+ vitest, `FakeEmbedder` keeps it hermetic). The SB-facing end-to-end
("note appears in the SB UI") needs the Docker test fixture
(`docs/tasks/stand-up-silverbullet/`) — verified manually; the CLI's
`write.put` → disk path is tested, and `SB_FS_WATCH=auto` pickup was
confirmed in the stand-up task.
