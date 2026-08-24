# Testing

## Framework

- **Vitest** (planned) for the TS packages (`@kb/core`, `@kb/fs`, daemon,
  CLI) — matches the Node/TS toolchain.
- **`tsc --strict`** is the *enforcement* layer for the binding-record
  exhaustiveness guarantee (a forgotten method / schema drift → compile
  error) — run in CI, not just locally.

## Run commands

```sh
npm test                       # full suite
npm run test:watch             # watch mode
npm run test -- <path>         # single file
npm run typecheck              # tsc --noEmit --strict across the workspace
```

(Exact scripts to be set in the workspace root `package.json` when the
monorepo is scaffolded.)

## Mock conventions

- **`@kb/core`**: pure — test with no mocks; Zod `parse`/`transform` and the
  typestate builder are exercised directly. The verified prototype in
  `docs/tasks/kb-client-js-api/reference/` is the starting point (re-verify
  with `tsc`).
- **`@kb/fs`**: use a tmp bundle dir + a fake/real embedder; `sqlite-vec`
  in a tmp `.kb/index.db`. Avoid touching the real `$KB_HOME`.
- **daemon**: tRPC + MCP over an ephemeral localhost port; a fake token
  (env) for tests; assert Bearer auth (401 on missing/bad token).
- **CLI**: a tRPC client against a test-running daemon; assert `--json`
  output is parseable.
- **Fixtures**: small OKF bundles (a few `concept`/`term`/`decision`
  notes with typed `relations`) under `tests/fixtures/`.

## Coverage

Target gate per-package (e.g. `npm run test:coverage`); the
`core-types-and-builder` slice should be near-100% (pure logic). The
`fs-groups-and-sqlite-index` slice is the heaviest (sqlite-vec, embedder,
chunking, RRF) — prioritize integration tests there.

## What `tsc` enforces (not a test, a compile gate)

- **Exhaustiveness**: `GroupBindings<G> = { [K in keyof G]: { inputSchema:
  z.ZodType<Parameters<…>[0]>; meta } }` — adding a method to a group makes
  every consumer's binding record fail to compile until bound or `EXCLUDED`.
- **Schema drift**: the binding's `inputSchema` output must equal the
  method's param; rename a field → `_output … Property 'x' is missing`.
- Run `tsc --strict` in CI so neither slips through.
