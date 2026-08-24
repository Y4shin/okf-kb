## Deviation report — core-types-and-builder

Branch: `slice/core-types-and-builder` (commit `d774f9d`). Reviewed against
`docs/tasks/kb-client-js-api/arch-spec.md` (Slice 1 — Exports) and
`docs/tasks/kb-client-js-api/slices/01-core-types-and-builder.md`.

Verified by reading the files directly (no worktree):
`packages/core/src/{types,frontmatter,results,manifest,builder,bindings,index}.ts`,
`packages/core/tests/*.ts`, and root scaffold (`package.json`,
`tsconfig.json`, `tsconfig.base.json`, `vitest.config.ts`).

Commands run: `npm run typecheck` (exit 0), `npm test` (16/16 passed),
`npm run typecheck:negatives --workspace @kb/core` (exit 0). No staged files
(`git diff --cached` empty). No heavy imports leaked into `@kb/core` (grep
for fs/sqlite/transformers/yaml/markdown/xenova → no matches).

### API surface changes

Every export listed in the arch spec's "Slice 1 — Exports" is present and
matches. Enum values are exact:

- **Type** (`types.ts:18`) = `term|concept|decision|reference|generic` ✓
- **Predicate** (`types.ts:20-23`) = `defines,uses,depends_on,part_of,
  decided_in,constrains,supersedes,derived_from` ✓
- **Rule** (`types.ts:25-27`) = `A1,A2,A3,A4,A5,A7,B1,B2,B3,B4,B5,B7,B8` ✓
  — **NO A6, NO B6** ✓

Full export audit (all present via `index.ts` `export *` re-exports):

- Primitives+enums: `SlugSchema`/`Slug`, `IsoDateSchema`/`IsoDate`,
  `TagSchema`/`Tag`, `VectorSchema`/`Vector`, `TypeSchema`/`Type`,
  `PredicateSchema`/`Predicate`, `RuleSchema`/`Rule` ✓ (`types.ts`)
- Ref: `IdRefSchema`/`IdRef`, `PathRefSchema`/`PathRef`, `parseRef`,
  `formatRef`, `RefSchema`/`Ref`, `RefInput` ✓ (`types.ts:30-46`)
- Actor: `AgentActorSchema`/`AgentActor`, `HumanActorSchema`/`HumanActor`,
  `ProcessActorSchema`/`ProcessActor`, `parseActor`, `formatActor`,
  `ActorSchema`/`Actor`, `ActorInput` ✓ (`types.ts:49-77`)
- Frontmatter families: `SourceSchema`/`Source`, `GeneratedSchema`/
  `Generated`, `VerifiedEntrySchema`/`VerifiedEntry`, `RelationSchema`/
  `Relation`, `FrontmatterSchema`/`Frontmatter` (`.passthrough()` ✓),
  internal `Note` ✓ (`frontmatter.ts`)
- Results: `NoteViewSchema`/`NoteView`, `SearchHitSchema`/`SearchHit`
  (`mode: literal|graph|semantic` ✓), `ListEntrySchema`/`ListEntry`,
  `PutResultSchema`/`PutResult`, `DeleteResultSchema`/`DeleteResult`,
  `CheckReportSchema`/`CheckReport` ✓ (`results.ts`)
- DI+manifest: `Utility` interface (with authoring helpers
  `frontmatterFor`/`normalize`/`stampProvenance` ✓, per spec "wider Utility
  interface"), `Embedder`, `ManifestSchema`/`Manifest`, `CommonDeps`, `Base`
  ✓ (`manifest.ts:6-19,23`)
- Group interfaces: `LocalFs`, `Read`, `Search`, `Write`, `IndexAdmin` with
  `RefInput`/`ActorInput` params ✓ (`bindings.ts:14-56`)
- Per-method `*InputSchema` (with `.meta({cli,doc,…})`): `GetInputSchema`,
  `ListInputSchema`, `GraphInputSchema`, `PutInputSchema`,
  `DeleteInputSchema`, `SearchTextInputSchema`, `SearchSemanticInputSchema`,
  `SearchUnifiedInputSchema`, `SearchUpdateInputSchema`,
  `CheckIdInputSchema`, `ResolvePathInputSchema`, `ResolveIdInputSchema`,
  `DirForInputSchema`, `PathForInputSchema`, `CheckInputSchema`,
  `BuildIndexInputSchema`, `RebuildIndexesInputSchema` ✓
  (`bindings.ts:60-77`). No-arg methods use `z.void()` ✓ (per spec
  "`z.void()` — must still satisfy `GroupBindings`").
- Builder: `createKb` (overloaded ✓), `KbCollector` (with
  `usingSpace/usingManifest/usingUtil/usingEmbedder/declare` ✓),
  `Composer` (conditional-intersection gate ✓), `Kb` ✓ (`builder.ts`)
- Enforcement: `GroupBindings<G>` ✓, `MethodBinding<F>` ✓, `EXCLUDED`
  sentinel (a `Symbol` branded via `Excluded = typeof EXCLUDED`) ✓
  (`bindings.ts:81-95`). Spec said "a branded value"; a `Symbol` is a
  reasonable realization and `BindingEntry<F> = MethodBinding<F> | Excluded`
  lets a record pass `EXCLUDED` for a deliberately-omitted key — matching
  the spec's "mapped type requires the key but accepts the sentinel".

Minor surface refinements (not deviations — additive and spec-conformant):

- `MethodBinding.meta` is typed as a concrete object shape
  (`{ desc; cli?; api?; mcp? }`) rather than a loose `meta` bag
  (`bindings.ts:88-89`). The spec said `.meta({cli,api,mcp,doc})` hints and
  "the mapped type requires the key but accepts the sentinel"; a structured
  `meta` is a stricter, compatible refinement that later slices (CLI/MCP)
  can rely on. No impact on dependent slices — they read `b.meta.cli` /
  `b.meta.mcp` etc.
- `BindingEntry<F>` is an extra type alias
  (`bindings.ts:91`) used as the value type inside `GroupBindings<G>`
  (`bindings.ts:93-95`). Additive; the public `GroupBindings<G>` shape is
  unchanged.

No exports are missing and no spec'd export was renamed.

### Abstraction usage

- **Used/was specified: yes.** The implementation is a faithful port of the
  verified prototype
  (`docs/tasks/kb-client-js-api/reference/core.prototype.ts` +
  `core-usage.prototype.ts`). `types.ts` is byte-identical to the prototype's
  primitive/Ref/Actor section; `frontmatter.ts`/`results.ts`/`manifest.ts`/
  `builder.ts` are the prototype split across files per the arch-spec layout.
  The `Composer` conditional-intersection gate and the `KbCollector`/
  `createKb` overloads are verbatim from the prototype.
- **zod-only in `@kb/core` — confirmed.** `grep -rnE "import.*(fs|sqlite|
  transformers|yaml|markdown|...)" packages/core/src/` → no matches. The only
  external import is `zod` (`types.ts:7`, `frontmatter.ts:1`,
  `results.ts:1`, `manifest.ts:1`, `bindings.ts:5`); all other imports are
  intra-package relative `.js` specifiers. `package.json` declares exactly
  one runtime dep: `"zod": "^4.4"` ✓.
- The prototype's `make*` stubs threw at construction (`throw new Error
  ('stub')`); the implementation replaced them with `shell()` factories
  whose methods throw `'impl in @kb/fs'` only on invocation, not at
  `withX`-time (`builder.ts:24-34`). This is the option the spec explicitly
  offered ("keep `ComposerImpl` with stubs that throw (so the builder runs)
  but no real logic") and is the strictly-better choice — it makes the
  builder *runnable* for the runtime tests in `types.test.ts` (the prototype
  could not be executed). No group-method bodies were implemented.

### Out-of-scope changes

- **No group method bodies.** The `make*` factories return `shell()` objects
  whose methods throw on call; real logic is deferred to `@kb/fs` (slice 2).
  ✓ within scope.
- **No other packages created.** Only `packages/core` exists; no
  `packages/fs`, `packages/protocol`, `packages/daemon`, or `packages/cli`.
  The root `tsconfig.json` references only `packages/core`; `package.json`
  workspaces glob `packages/*` but only core is populated. ✓
- **No CLI/daemon.** No `bin/`, no tRPC/MCP/router code. ✓
- **No check-rule runner.** `@kb/core` exports `RuleSchema`/`Rule` +
  `CheckReport` shape only; no rule logic (`manifest.ts`, `results.ts`).
  ✓ per "Do NOT encode the check rule runner here".
- **No binding records shipped.** `GroupBindings<G>` type + per-method
  `*InputSchema` are exported, but no `fullBindings`/`piBindings` *records*
  are defined in core (those belong to `@kb/protocol` per the cross-cutting
  refinement). The spec's Slice-1 export list does not require records — it
  requires the `GroupBindings` *type* and the `*InputSchema` schemas, both
  present. ✓

Minor out-of-scope artifacts (build output, not source changes):

- The committed file list includes `packages/core/tests/*.d.ts` and
  `*.js` and `packages/core/tsconfig.tsbuildinfo` artifacts (emitted by
  `tsc --build`). `.gitignore` ignores `dist/` and `*.tsbuildinfo` but does
  NOT ignore loose `tests/*.d.ts`/`tests/*.js` next to sources, so these
  compiled test artifacts got committed. They are noise, not a scope
  violation, but they should be removed and `*.d.ts`/`*.js` under `tests/`
  added to `.gitignore` (see Task doc update below).

### Slice-doc acceptance criteria — divergence check

All slice-doc acceptance criteria are met:

- Ref/IdRef/PathRef (`IdRef = {slug: Slug; ty: Type}`), parseRef/formatRef ✓;
  Actor (agent/human/process), parseActor/formatActor ✓; `Rule` literal
  union ✓; branded aliases with real validation (`SlugSchema` regex
  `/^[a-z0-9][a-z0-9-]*$/`, `IsoDateSchema` `.datetime()`) ✓.
- `TypeSchema`/`PredicateSchema`/`RuleSchema` = `z.enum(...)` ✓;
  `FrontmatterSchema` `.passthrough()` (tested: `types.test.ts` "preserves
  unknown keys") ✓; `Generated`/`VerifiedEntry`/`Source`/`Relation` typed
  with `Actor`/`IsoDate` ✓.
- `NoteView`/`SearchHit`/`ListEntry`/`PutResult`/`DeleteResult`/`CheckReport`
  Zod schemas + `z.infer` types ✓.
- `ManifestSchema` (types/predicates); `CommonDeps = {space, manifest,
  util, embedder}`; `Base = Pick<…,'space'|'manifest'|'util'>` ✓
  (`manifest.ts:18-19`).
- Typestate builder: `createKb<T>(deps:T)` overloaded (no-arg →
  `KbCollector<{}>`); `usingSpace/usingManifest/usingUtil/usingEmbedder`
  refine `C`; `declare()` → `Composer<C,{}>`; the conditional-intersection
  gate gates `withRead/withWrite/withLocalFs` on `C extends Base` and
  `withSearch/withIndexAdmin` on `C extends CommonDeps`; `build()` →
  `Kb<G>` ✓ (`builder.ts:42-51`).
- **Builder gates verified** (the slice doc's specific gates):
  - forgetting `embedder` → `withSearch` not on the type ✓
    (`negatives.test-d.ts:14-16`, `@ts-expect-error` fires under
    `typecheck:negatives`, exit 0).
  - forgetting `util` → `withRead` not on the type ✓
    (`negatives.test-d.ts:19-21`).
  - raw string where `RefInput` expected → accepted (string is in the union);
  a *number* → error ✓ (`negatives.test-d.ts:25-28`).
  - full shape typechecks and runs (`types.test.ts` "full shape", "pi
    shape", "no-arg createKb") ✓.
- Group interfaces with `RefInput`/`ActorInput` params ✓; `Utility` as a DI
  interface (not a group) ✓; per-method `*InputSchema` with `.meta({cli,
  doc,…})` ✓.
- `GroupBindings<G>` exhaustiveness mapped type ✓
  (`bindings.ts:93-95`). **However**, the slice doc's acceptance criterion
  — "a demo proves a forgotten method → `tsc` error" — is only **partially**
  met: the `negatives.test-d.ts` file proves the *builder gates* (the three
  cases above) but does **not** include a `GroupBindings` exhaustiveness
  negative (e.g. a record missing a method, or a schema whose `_output`
  drifts from the method param). The arch spec's cross-cutting decision
  ("Slice 1 proves the gate with a test that adds a method to a group and
  shows the binding record fails to compile") is therefore **not directly
  demonstrated** by a committed negative. `grep "GroupBindings|BindingEntry|
  EXCLUDED|bindings" negatives.test-d.ts` → no matches. This is the one
  genuine gap versus the slice-doc/arch-spec acceptance text. The
  `GroupBindings` type itself is correct (it would fail on a missing key
  or a drifted `inputSchema._output`); the gap is the *absence of a test
  that demonstrates it*.

One more small divergence from the prototype (not called out by the slice
doc but worth noting for slice 2):

- `LocalFs` return types were widened from the prototype's `PathRef`/`IdRef`
  to anonymous object shapes: `resolvePath` → `{ path: string }`,
  `resolveId` → `{ slug: Slug; ty: Type }`, `dirFor`/`pathFor`/`spaceRoot`
  → `{ path: string }` (`bindings.ts:15-19`). The prototype returned the
  named `PathRef`/`IdRef` types (`reference/core.prototype.ts` LocalFs).
  Structurally equivalent for callers, but slice 2 (`@kb/fs`) implementing
  `LocalFs` will return plain objects where it could return `PathRef`/
  `IdRef`. No functional impact; the slice-doc criterion ("params typed
  `RefInput`/`ActorInput` exactly as the prototype") concerns *params*,
  which do match — the return-type widening is not covered by that
  wording. Flagging for slice-2 awareness, not a blocker.

### Task doc update needed?

**Yes.** Append to `docs/tasks/kb-client-js-api/task.md` ## Implementation
notes:

1. **GroupBindings exhaustiveness test is missing.** The committed
   `negatives.test-d.ts` proves the builder gates (forgetting
   `embedder`/`util`, number-as-Ref) but contains no `GroupBindings` record
   negative. Add a negative that (a) omits a method key from a
   `GroupBindings<SomeGroup>` record (→ `tsc` error: missing key) and (b)
   supplies an `inputSchema` whose `_output` differs from the method's
   first param (→ `tsc` error: `ZodType<…>` mismatch). This closes the
   arch-spec's "Slice 1 proves the gate" cross-cutting decision.
2. **Compiled test artifacts committed.** `packages/core/tests/*.d.ts`
   and `*.js` (and `tsconfig.tsbuildinfo`) are tracked by git. Remove them
   and add `packages/*/tests/**/*.d.ts`, `packages/*/tests/**/*.js`,
   `*.tsbuildinfo` (the last is already ignored) to `.gitignore` so `tsc
   --build` output isn't committed. Low priority; cosmetic.
3. **`LocalFs` return types widened** from `PathRef`/`IdRef` (prototype)
   to anonymous `{ path: string }` / `{ slug; ty }`. Slice 2 should either
   restore the named return types or depend only on the structural shapes.
   Not a blocker.

### User attention needed?

**No.** The public API surface matches the arch spec exactly (all exports
present, enum values exact including the A6/B6 omission), `@kb/core` is
zod-only with no leaked heavy imports, no out-of-scope packages/CLI/daemon
were created, and `tsc --strict` + 16 vitest tests + the negatives gate all
pass. The two findings above (missing `GroupBindings` exhaustiveness
negative; committed build artifacts) are test-hygiene/documentation items
that do not change the API surface or block dependent slices. Slice 2's
interface contract (`LocalFs`/`Read`/`Search`/`Write`/`IndexAdmin`,
`CommonDeps`/`Utility`/`Embedder`/`Manifest`, schemas, `parseRef`/
`formatRef`/`parseActor`/`formatActor`, `GroupBindings` + `*InputSchema`)
is fully satisfied.
