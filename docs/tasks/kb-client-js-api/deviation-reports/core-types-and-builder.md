## Deviation report — core-types-and-builder

### API surface changes

- **Planned:** The arch spec's "Slice 1 — Exports" section enumerates the
  complete public API surface for `@kb/core`: Zod-verified primitives/enums
  (`Slug`/`IsoDate`/`Tag`/`Vector`/`Type`/`Predicate`/`Rule`), `Ref`/`Actor`
  with parse/format helpers, frontmatter families (`Source`/`Generated`/
  `VerifiedEntry`/`Relation`/`Frontmatter`), result shapes (`NoteView`/
  `SearchHit`/`ListEntry`/`PutResult`/`DeleteResult`/`CheckReport`), the
  `Utility`/`Embedder`/`Manifest`/`CommonDeps`/`Base` DI seam, five group
  interfaces (`LocalFs`/`Read`/`Search`/`Write`/`IndexAdmin`), per-method
  `*InputSchema` schemas with `.meta()` tags, the typestate builder
  (`createKb`/`KbCollector`/`Composer`/`Kb`), and the `GroupBindings<G>` +
  `MethodBinding`/`EXCLUDED` enforcement types — all in a `packages/core`
  npm-workspace package with `src/{index,types,frontmatter,results,manifest,
  builder,bindings}.ts`.
- **Actual:** **No implementation exists.** There is no `packages/` directory,
  no root `package.json` (workspaces), no `tsconfig.base.json`, no
  `vitest.config.ts`, no `packages/core/` package, and zero `.ts` source
  files outside the `docs/tasks/kb-client-js-api/reference/` prototype. `git
  status` is clean — no staged, unstaged, or untracked changes. `git diff
  HEAD` shows no diff. The `git log` head is `b642428` (the arch-spec +
  stand-up-silverbullet evidence commit). No slice branch was created. No
  `.work/uncertainty.md` escape-hatch file exists. The tdd-worker (running
  on `kimi-k2.7-code`) stalled — it recorded 0 turns, 0 tokens, and 0 tool
  calls across the entire dispatch — and never produced any code.
- **Impact:** Slice 2 (`fs-groups-and-sqlite-index`) depends entirely on
  slice 1's exports — it `implements` the `@kb/core` group interfaces,
  imports `CommonDeps`/`Utility`/`Embedder`/`Manifest` and all the schemas
  + `parseRef`/`formatRef`/`parseActor`/`formatActor` + `GroupBindings` +
  `*InputSchema`. With slice 1 absent, slice 2 cannot begin. Slices 3
  and 4 are transitively blocked. The entire `kb-client-js-api` task is
  stalled at its first slice.

### Abstraction usage

- Used/was specified: **N/A — no implementation to evaluate.** The arch
  spec instructed porting the verified prototype
  (`reference/core.prototype.ts` + `reference/core-usage.prototype.ts`),
  which compiles clean under `tsc --strict` + Zod 4.4, and keeping `@kb/core`
  pure (only `zod` as a dependency). No porting occurred. The reference
  prototype files remain untouched in `docs/tasks/kb-client-js-api/reference/`.

### Out-of-scope changes

- **None** — no changes were made at all (in-scope or out-of-scope). No
  group methods were implemented, no other packages were created, no
  CLI/daemon code was written. The repo is identical to the state before
  the slice was dispatched.

### Task doc update needed?

- **Yes.** The `## Implementation notes` section (or equivalent) should
  record that the initial tdd-worker dispatch for slice
  `core-types-and-builder` stalled (0 turns/tokens/tools on the
  `kimi-k2.7-code` model) and produced no code, so the slice has not been
  implemented yet. The slice status remains `todo` (not `done`), and the
  chain needs re-dispatch. This is not a deviation from the spec — it is
  a no-op execution that the orchestrator must retry (per the failure
  toolbelt: diagnose → re-dispatch, possibly with a different model or
  increased budget).

### User attention needed?

- **Yes.** The slice was not implemented — the worker stalled and wrote
  no code. The parent orchestrator needs to re-dispatch the tdd-worker
  for this slice (the inherited context shows it was attempting a steer/
  model change when this deviation report was requested). The spec and
  slice doc are unchanged; the work simply hasn't happened yet.

### Root cause

The tdd-worker was dispatched as an async subagent on the
`requesty/tensorx/kimi-k2.7-code` model. After ~90 seconds it had produced
0 turns, 0 tokens, and 0 tool calls — the model failed to emit a first
token. A steer was queued but no response was observed. This is an
infrastructure/model-availability issue, not a spec ambiguity or scope
problem. The arch spec and slice doc are clear and self-consistent;
the verified prototype provides a proven starting point. Re-dispatching
with a different model (or after the model becomes responsive) should
unblock this slice without any spec changes.
