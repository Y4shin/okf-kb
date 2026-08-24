---
kind: slice
slug: core-types-and-builder
title: "@kb/core — Zod-verified types, typestate builder, group interfaces, binding records"
task: ../task.md
mode: afk
status: done
size: l
blocked_by: []
---

## End-to-end behavior

`@kb/core` ships the Zod-verified types, the `Ref`/`Actor`/`Rule`
friendliness layer, the typestate builder (`createKb` → `KbCollector` →
`declare` → `Composer` → `build`), the five group interfaces
(`LocalFs`/`Read`/`Search`/`Write`/`IndexAdmin`) with `RefInput`/`ActorInput`
params, per-method `*InputSchema` Zod schemas, the `Utility` DI interface,
and the `GroupBindings<G>` mapped type that enforces consumer/daemon
exhaustiveness. Nothing in `@kb/core` imports `fs` or the embedder. All
types are `z.infer`-derived; `.meta({...})` tags carry `cli`/`api`/`mcp`/`doc`
hints. Verified under `tsc --strict`.

## Acceptance criteria

- `Ref`/`IdRef`/`PathRef` (`IdRef = {slug: Slug; ty: Type}`),
  `parseRef`/`formatRef`; `Actor` (agent/human/process),
  `parseActor`/`formatActor`; `Rule` literal union; branded aliases
  (`Slug`/`IsoDate`/`Tag`/`Vector`) with real validation (regex/datetime).
- `TypeSchema`/`PredicateSchema`/`RuleSchema` = `z.enum(...)`; `FrontmatterSchema`
  `.passthrough()` (OKF §11); `Generated`/`VerifiedEntry`/`Source`/`Relation`
  typed with `Actor`/`IsoDate`.
- `NoteView`/`SearchHit`/`ListEntry`/`PutResult`/`DeleteResult`/`CheckReport`
  Zod schemas + `z.infer` types.
- `ManifestSchema` (types/predicates); `CommonDeps = {space, manifest,
  util, embedder}`; `Base = Pick<…, 'space'|'manifest'|'util'>`.
- The typestate builder: `createKb<T>(deps:T): KbCollector<T>` (overloaded;
  no-arg → `KbCollector<{}>`); `usingSpace/usingManifest/usingUtil/usingEmbedder`
  refine `C`; `declare(): Composer<C,{}>`; the `Composer<C,G>` **conditional-
  intersection type** gates `withRead/withWrite/withLocalFs` on `C extends
  Base` and `withSearch/withIndexAdmin` on `C extends CommonDeps`; `build():
  Kb<G>`. Verified: forgetting `embedder` → `withSearch` is not on the type;
  forgetting `util` → `withRead` not on the type; raw string where `RefInput`
  expected → error.
- Group interfaces with `RefInput`/`ActorInput` params (so callers can pass
  a raw string); `Utility` as a DI interface (not a group); per-method
  `*InputSchema` (e.g. `GetInputSchema`, `PutInputSchema`, `GraphInputSchema`,
  `SearchTextInputSchema`, …) with `.meta({cli,doc,…})`.
- `GroupBindings<G> = { [K in keyof G]: { inputSchema: z.ZodType<
  Parameters<Extract<G[K],(...a:any[])=>any>>[0]>; meta } }` — the
  exhaustiveness enforcement; a demo proves a forgotten method → `tsc` error.

## Test plan

- **Seams**: Zod schema parse/transform (string→Ref/Actor), the builder's
  type narrowing at each `withX`, the conditional-intersection gate,
  `GroupBindings` completeness.
- **Failure modes**: malformed `Ref`/`Actor` strings throw; wrong schema
  for a method → `_output` mismatch; missing `embedder` before `withSearch`
  → method absent from type.
- **Scenarios**: `createKb({space,manifest,util,embedder}).declare()
  .withRead().withSearch().withWrite().withLocalFs().withIndexAdmin().build()`
  typechecks; the pi-shape (`withLocalFs().withSearch()` only) typechecks
  and `kbPi.write`/`kbPi.indexAdmin` are not on the type; `RefSchema.parse
  ('concept:foo')` → `{slug:'foo',ty:'concept'}`; `SlugSchema.parse('BAD')`
  throws.
- **Edge cases**: empty `createKb()`; `IdRef` with unknown `ty`; round-trip
  `formatRef(parseRef(s))`.

## Constraints and dependencies

- No `fs`/embedder/vector-store imports — `@kb/core` is pure. Deps: `zod`.
- Verified under `tsc --strict` on TS 5.9 + Zod 4.4 (the reference shape in
  `/tmp` is a proven skeleton; port to the monorepo).
- The exact type/predicate vocab comes from `okf-format-adaptation` (done).

## Implementation notes

`@kb/core` was ported from the verified `/tmp` prototype skeleton into the
monorepo (`packages/core/`) under `tsc --strict`. Key decisions carried over:

- **Single-input-object params** (per the decide-task enforcement section):
each group method takes one `{...}` object rather than positional args, so
the `GroupBindings<G>` mapped type can enforce consumer/daemon exhaustiveness
— a forgotten method or schema drift (`_output` mismatch) surfaces as a
`tsc` error in `tests/negatives.test-d.ts`.
- **`make*` stubs throw on call, not construction**: the builder's `withX`
methods and the `make*` factory helpers return group instances whose stubbed
methods throw only when invoked, so the typestate shape is testable without
wiring real `@kb/fs` implementations.
- **16 tests + negatives gate green**: `vitest` reports 16/16 passing;
`typecheck:negatives` (the `tsc` run over `tests/negatives.test-d.ts`)
exits 0, proving the expected-to-fail type errors are present.
- **Build artifacts gitignored**: `dist/` and `*.tsbuildinfo` are in
`.gitignore`; only source + tests are committed.

See `docs/tasks/kb-client-js-api/.work/verify-s1.md` for the full green-run
transcript and `docs/tasks/kb-client-js-api/deviation-reports/core-types-and-builder.md`
for deviations from the original plan.
