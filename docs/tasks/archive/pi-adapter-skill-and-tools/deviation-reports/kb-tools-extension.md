## Deviation report — kb-tools-extension

### API surface changes

- **Planned:** Spec (`arch-spec.md`, Slice 1 section) said the pi-facing tRPC type should be `type PiAppRouter = Omit<AppRouter, 'write'>` — "the cleanest way: derive a `PiAppRouter` type that is `Omit<AppRouter, 'write'>` … `Omit` on the client type is simpler and sufficient for v1."
- **Actual:** `PiAppRouter` is defined as `ReturnType<typeof buildPiRouter>` in `packages/protocol/src/router.ts:109-113`, where `buildPiRouter` is a real runtime router built from `piBindings` (Write group entries are `EXCLUDED`). This is the *alternate* path the spec mentioned ("build a pi-shaped router via a `piBindings`-driven `buildRouter` variant"). `buildRouter` was generalized to accept an optional `bindings` param (`packages/protocol/src/router.ts:56`). The spec offered both options ("Decide at port time"); the implementer chose the router-variant because `Omit` on a tRPC router type does not yield a valid `createTRPCProxyClient` type (tRPC router types are `ReturnType` of `initTRPC.router()`, and `Omit` breaks the internal procedure shape). This is a defensible port-time decision but it moves a runtime build function (`buildPiRouter`) into `@kb/protocol` — a package the spec described as "Pure: depends only on @kb/core." `buildPiRouter`/`buildRouter` already imported `initTRPC` and `@kb/protocol` already exported `buildRouter`, so this is not a new dependency; it's consistent with the existing design.
- **Impact on slice 2:** None — slice 2 is pure markdown and references tool names, not the tRPC type. The `PiAppRouter` type is re-exported from `@kb/protocol` and consumed by `client.ts:4`; no dependent slice touches it.

- **Planned:** Spec listed an optional `predicate` field for `kb_graph` ("accepts an optional `predicate` via an extra typebox field — the daemon impl reads it").
- **Actual:** `GraphParams` in `tools.ts:33` includes `predicate: Type.Optional(Type.String())`. However, the daemon's `GraphInputSchema` (`packages/core/src/bindings.ts:54`) is `z.object({ ref: RefSchema, dir: z.enum([...]) })` — it has **no `predicate` field**. The typebox schema hand-mirrors a field that does not exist in the Zod schema. Since tRPC validates input against the Zod schema at the boundary, passing `predicate` to `search.graph` would either be silently dropped (Zod `.object()` default behavior strips unknown keys) or cause a validation error depending on Zod strictness settings. This is a **schema drift** between the typebox mirror and the Zod source of truth — precisely the risk the spec flagged ("Do NOT duplicate the Zod input schemas as the source of truth … write them by hand and rely on the `piBindings` loop + an end-to-end test for sync"). The test (`tools.test.ts:174`) calls `kb_graph` without `predicate`, so this drift is not caught by tests.
- **Impact:** Minor — the agent may pass `predicate` and it will be silently ignored (or rejected, depending on Zod config). No downstream slice depends on this. Recommend removing the `predicate` field from `GraphParams` or adding it to `GraphInputSchema` if the daemon should support it.

- **Planned:** Spec's "Existing abstractions to use" section listed `@kb/protocol`'s `AppRouter` type (+ `piBindings` + `flattenBindings`).
- **Actual:** The extension imports `piBindings`, `flattenBindings`, and `PiAppRouter` from `@kb/protocol` (`tools.ts:8`, `client.ts:4`). `PiAppRouter` is newly exported from `@kb/protocol` (added in this slice). `flattenBindings` was already exported. All consistent with the spec.

### Abstraction usage

- **`@trpc/client` `createTRPCProxyClient` + `httpBatchLink`:** Used — `client.ts:7,9`. ✓
- **`@kb/protocol` `piBindings` + `flattenBindings`:** Used — `tools.ts:8`. ✓
- **`@kb/core` `Ref`/`Actor`/`formatRef`/`parseRef` for arg/citation shapes:** Not directly imported in the extension source. The spec said tool args should "accept `RefInput`/`ActorInput` (raw strings auto-coerced via `parseRef`/`parseActor`)." The typebox schemas use `Type.String()` for `ref` (e.g. `tools.ts:19`), and the daemon's Zod `RefSchema` (`z.union([IdRefSchema, PathRefSchema, z.string().transform(parseRef)])`) does the coercion at the boundary. So `parseRef` is used, but *in the daemon*, not in the extension. The spec's framing ("auto-coerced via `parseRef`/`parseActor`") is satisfied by the daemon boundary. The `Actor` shape (`ListParams.by`) is also `Type.String()` in the typebox, coerced by `ActorSchema` in the daemon. ✓ (coercion delegated to daemon, as designed).
- **pi extension API `pi.registerTool`:** Used — `tools.ts:125`. ✓
- **typebox `Type.Object` for tool params:** Used — all 8 schemas are `Type.Object` (`tools.ts:21-55`). ✓
- **`@kb/daemon`'s `getOrMintToken` (re-exported) for the keyring path:** Used — `config.ts:4`. ✓
- **`StringEnum` from `@earendil-works/pi-ai`:** Used for `TypeEnum` and `DirEnum` (`tools.ts:14-15`) — this is a pi-ai typebox helper that emits JSON-schema `enum`, compatible with providers that don't support `anyOf/const`. Reasonable choice, though the spec only said "typebox `Type.Object`." ✓

### Tool inventory — exactly 8, no kb_put/kb_delete

| # | Tool | Binding | typebox schema (tools.ts) | Zod schema (bindings.ts) |
|---|------|---------|---------------------------|-------------------------|
| 1 | `kb_get` | `read.get` | `GetParams` :22 | `GetInputSchema` :52 |
| 2 | `kb_list` | `read.list` | `ListParams` :26 | `ListInputSchema` :53 |
| 3 | `kb_search` | `search.searchUnified` | `SearchParams` :31 | `SearchUnifiedInputSchema` :59 |
| 4 | `kb_graph` | `search.graph` | `GraphParams` :35 | `GraphInputSchema` :54 |
| 5 | `kb_update` | `search.update` | `UpdateParams` :41 | `SearchUpdateInputSchema` :60 |
| 6 | `kb_check_id` | `search.checkId` | `CheckIdParams` :44 | `CheckIdInputSchema` :61 |
| 7 | `kb_resolve_path` | `localFs.resolvePath` | `ResolvePathParams` :47 | `ResolvePathInputSchema` :62 |
| 8 | `kb_resolve_id` | `localFs.resolveId` | `ResolveIdParams` :50 | `ResolveIdInputSchema` :63 |

- **No `kb_put`/`kb_delete`:** Confirmed — `TOOL_SPECS` (`tools.ts:66-75`) has exactly 8 entries, none map to `write.put` or `write.delete`. Test `tools.test.ts:50-52` asserts `kb_put`/`kb_delete` are absent. ✓
- **No `kb_frontmatter_for`/`kb_stamp_provenance`:** Correctly omitted (spec said "skip dedicated tools for them in v1 unless trivial"). ✓
- **`piBindings` omits Write:** `piBindings` in `records.ts` sets `write: { put: EXCLUDED, delete: EXCLUDED }`. Test `tools.test.ts:69-72` asserts `write.put` and `write.delete` are absent from `flattenBindings(piBindings)`. ✓

**GroupBindings-enforced loop:** The spec said "Tools driven by a `piBindings` loop (GroupBindings-enforced)." The implementation does **not** iterate `flattenBindings(piBindings)` to generate tools — instead it iterates a hand-written `TOOL_SPECS` array (`tools.ts:66-75`) and uses `piBindings` only as a *validation gate*: a module-level loop (`tools.ts:104-108`) throws if any `TOOL_SPECS` entry's `qualifiedName` is not found in `flattenBindings(piBindings)`. This is a **structural deviation** from the spec's intent ("`for (const [name, b] of flatten(piBindings)) pi.registerTool(...)`"). The spec wanted the binding record to be the *driver* of tool registration so that adding a daemon method forces a binding update (which then auto-registers a tool or requires an explicit EXCLUDED). The actual design requires the implementer to manually add an entry to `TOOL_SPECS` for each new tool — the `piBindings` gate only catches *typos* in `qualifiedName`, not *missing tools* for newly-added daemon methods. A new daemon method (e.g. `search.semantic`) would not produce a tool and would not error, because `TOOL_SPECS` simply doesn't reference it. This weakens the "binding record enforces completeness" property the spec described. The typebox schemas being hand-written (as the spec required) makes a pure `piBindings`-driven loop impractical (you can't auto-generate typebox from the binding record), so this is an inherent tension the spec didn't fully resolve. The implementer chose a pragmatic middle ground: hand-written specs + binding-name validation. **This is a design deviation worth noting** but it's arguably the only viable approach given the hand-written typebox constraint.

### Config

- **KB_URL default `http://127.0.0.1:3000`:** ✓ `config.ts:19` — `process.env.KB_URL ?? 'http://127.0.0.1:3000'`. The client appends `/trpc` (`client.ts:11`), so the tRPC endpoint is `http://127.0.0.1:3000/trpc`. This matches the spec's "Config: `KB_URL` (default `http://127.0.0.1:3000`; tRPC at `/trpc`)" cross-cutting decision. ✓
- **KB_TOKEN env > keyring via `@kb/daemon` `getOrMintToken`:** ✓ `config.ts:20` — `process.env.KB_TOKEN ?? getOrMintToken()`. `getOrMintToken` is imported from `@kb/daemon` (`config.ts:4`). The precedence is env-first (spec said "env > keyring"). ✓
- **No committed secrets:** ✓ — no token values in source.
- **Resource setup deferred to `session_start`:** ✓ `index.ts:20-24` — the default factory registers a `session_start` handler that resolves config, builds the client, and registers tools. No resources started in the factory body. ✓
- **Pi settings:** The spec mentioned "Config via pi settings / env." The implementation only uses env (`process.env.KB_URL`/`KB_TOKEN`); it does not read pi's `getFlag`/`registerFlag` API for config. The `ExtensionAPI` does expose `registerFlag`/`getFlag` (`types.d.ts:940-948`), but the extension doesn't use them. This is a minor deviation — env-only is sufficient for v1, but the spec's "pi settings" path is unimplemented. Low impact.

### Error mapping: daemon errors -> tool isError results

- **Planned:** Spec said "Tools return `{content:[{type:text, text}], isError}` per the pi tool contract." And: "daemon 401 → tool error 'KB daemon auth failed (check KB_TOKEN)'; network error → 'KB daemon not running at <url>'; Zod parse error → the daemon's message."
- **Actual:** `tools.ts:142-152` — errors are caught and returned as `{ content: [{type:'text', text: msg}], details: { error: true } }`. **There is no `isError` field in the returned object.** The implementer's comment (`tools.ts:149-151`) explicitly notes: "pi's `AgentToolResult` has no `isError` field; errors are signaled by throwing." This is **correct** — the `AgentToolResult<T>` interface (`pi-agent-core/dist/types.d.ts:316-326`) has `content`, `details`, `usage?`, `addedToolNames?`, `terminate?` — **no `isError`**. The `isError` boolean lives on `ToolExecutionEndEvent` (`types.d.ts:612-617`) and is computed by the pi runtime based on whether `execute` throws. The `ToolDefinition.execute` contract (`types.d.ts:372`) says the tool should "Throw on failure instead of encoding errors in `content`" (per the `AgentTool` doc comment at `pi-agent-core/dist/types.d.ts:348`). So the spec's "`{isError}` per the pi tool contract" was **wrong** — the pi tool contract uses exceptions, not an `isError` return field. The implementer correctly diverged from the spec here.
- **Impact:** The error-path implementation returns the error message as text content with `details: { error: true }` instead of throwing. This means the pi runtime will **not** mark the result as an error (`isError` will be `false` in `tool_execution_end`). The agent will see the error as normal text content, not as a tool error. The spec wanted the agent to "react to" errors — returning error text as normal content is a weaker signal than throwing. However, the test (`tools.test.ts:221-228`) only asserts the text matches `/fetch|econnrefused|connect|network|unreachable|error/` — it does not assert `isError`. **Recommendation:** change the catch block to `throw err` (or rethrow with a wrapped message) so the pi runtime marks `isError=true` and the agent can react appropriately. This is a **medium-severity deviation** — the error signaling mechanism differs from what the spec intended, and the current approach may not give the agent a clear error signal.
- **Specific error messages not implemented:** The spec wanted distinct messages for 401 ("KB daemon auth failed (check KB_TOKEN)"), network ("KB daemon not running at <url>"), and Zod parse (the daemon's message). The actual code returns the raw `err.message` (`tools.ts:145`) without classification. The network test passes because `err.message` for a connection refusal naturally contains "fetch"/"connect" etc. But a 401 would return a tRPC error message (possibly "UNAUTHORIZED" or similar) without the helpful "(check KB_TOKEN)" hint. **Minor deviation** — the messages are less user-friendly than specified.

### skill/kb-ask/SKILL.md is a stub

- **Planned:** Spec (Slice 2 section) describes the full SKILL.md content. Slice 1 doc's acceptance criteria don't mention SKILL.md content. The arch-spec cross-cutting decisions say "`kb-ask` is pure instructions."
- **Actual:** `packages/pi-adapter/skill/kb-ask/SKILL.md` is a 9-line stub with frontmatter (`name: kb-ask`, `description: Ask the knowledge base a question...`) and a TODO comment: "filled in slice 2 (conversational-qa-rag)." ✓ — Correctly deferred to slice 2. The frontmatter is valid and the file is in the right place for the install script to symlink.
- **Impact:** None for slice 1. Slice 2 owns this file.

### install:pi symlink script present

- **Planned:** Spec: "an `npm run install:pi` script symlinks `packages/pi-adapter/extension` → `~/.pi/agent/extensions/pi-kb` and `packages/pi-adapter/skill/kb-ask` → `~/.pi/agent/skills/kb-ask`."
- **Actual:** `packages/pi-adapter/scripts/install-pi.mjs` exists and symlinks both paths (`install-pi.mjs:7-9`). The `package.json` script `"install:pi": "node scripts/install-pi.mjs"` is present (`package.json` line 6). The script creates `~/.pi/agent/extensions` and `~/.pi/agent/skills` dirs, removes stale symlinks, and creates `dir` symlinks. ✓
- **Minor note:** The spec said the extension dest is `~/.pi/agent/extensions/pi-kb`. The script uses `join(piAgentDir, 'extensions', 'pi-kb')` (`install-pi.mjs:8`) — matches. The extension's `package.json` has `"pi": {"extensions": ["./src/index.ts"]}` (`extension/package.json`), which is the pi discovery config. ✓

### Out-of-scope changes

- **`packages/protocol/src/router.ts` and `index.ts` modified:** The slice added `buildPiRouter`, `PiAppRouter` type, and generalized `buildRouter` to accept a `bindings` param. This is a change to `@kb/protocol` (a dependency package, not the slice's own package). The spec's "Existing abstractions to use" listed "`@kb/protocol`'s `AppRouter` type (+ `piBindings` + `flattenBindings`)" — it did not say to *add* `PiAppRouter` to `@kb/protocol`. However, the spec's "Decide at port time" note said "re-exported from `@kb/protocol` if cleaner." The implementer chose to define it there (not just re-export). This is an **out-of-scope change to a shared package** — but it's additive (new exports, no breaking changes to existing `buildRouter`/`AppRouter`/`flattenBindings`). The `buildRouter` signature change (adding optional `bindings` param with default `fullBindings`) is backward-compatible. **Low risk**, but it means this slice modified a package owned by the `kb-client-js-api` task, not just the `pi-adapter` package. Worth flagging for architecture notes.
- **Async-iterable materialization added to `buildRouter`:** The diff shows `buildRouter` now materializes `AsyncIterable` results to arrays (`router.ts:62-69`). This was not in the original `buildRouter` (the diff shows it was added). The spec noted "the daemon's `list` returns `AsyncIterable`, so the tRPC procedure must materialize it to an array." This materialization logic was added to `buildRouter` in this slice — it benefits *all* callers of `buildRouter` (including the full daemon), not just pi. This is a **beneficial side-effect** but technically out of scope for a pi-adapter slice. It should have been in the `kb-client-js-api` task. Low risk, but worth noting.
- **`root tsconfig.json` modified:** Added `packages/pi-adapter` to the root project references (`tsconfig.json`). ✓ — necessary for the new package.
- **`package.json` (root) modified:** Added pi-adapter references. ✓
- **No Q&A/RAG code in the extension:** ✓ — confirmed by grep; no search/index logic, no RAG, no Q&A. The extension only calls the daemon via tRPC.
- **No `@kb/fs` in extension runtime:** ✓ — `grep -rn '@kb/fs' packages/pi-adapter/extension/src/` returns nothing. The test file imports `FakeEmbedder` from `@kb/fs` (`tools.test.ts:11`) and `testManifest`/`note` from `../../fs/tests/helpers.js` (`tools.test.ts:13`) — these are **test-only** imports, acceptable per the spec ("No `@kb/fs` import — pi is a daemon client in V1" refers to the extension runtime, not tests; the test plan explicitly says "start a test daemon … `FakeEmbedder` via `buildCommonDeps`").
- **`extension/package.json` uses `file:../..` for `@kb/core`/`@kb/protocol`/`@kb/daemon`:** The spec said "prefer a `file:` link to the monorepo's `packages/protocol` + `packages/core`." The actual `extension/package.json` uses `"@kb/core": "file:../.."` (the monorepo root, which resolves via workspaces). This works because the root `package.json` has workspaces. Minor deviation from the literal spec ("file: link to `packages/protocol`") but functionally equivalent under npm workspaces. ✓

### Task doc update needed?

**Yes.** Append to `## Implementation notes`:
- `PiAppRouter` was implemented as `ReturnType<typeof buildPiRouter>` (a real pi-shaped router from `piBindings`), not `Omit<AppRouter, 'write'>`. `buildPiRouter` and the `PiAppRouter` type were added to `@kb/protocol` (new exports). `buildRouter` was generalized to accept an optional `bindings` param. `buildRouter` also gained async-iterable materialization (for `read.list`).
- The tool registration loop iterates a hand-written `TOOL_SPECS` array (not `flattenBindings(piBindings)` directly); `piBindings` is used as a validation gate (throws if a spec's `qualifiedName` is not in `piBindings`). This means new daemon methods do NOT auto-register tools — the implementer must add a `TOOL_SPECS` entry.
- `kb_graph`'s typebox schema includes an optional `predicate` field not present in the daemon's `GraphInputSchema` — schema drift (the field will be stripped/ignored by Zod at the boundary).
- Error handling returns error text as normal content (`details: { error: true }`) rather than throwing; the pi runtime will not set `isError=true`. If the agent needs a structured error signal, the catch block should throw instead.
- Config is env-only (`KB_URL`/`KB_TOKEN`); pi's `registerFlag`/`getFlag` settings API is not used.

### User attention needed?

**Yes — medium.** Two items:
1. **Error signaling:** The tools return errors as text content, not as thrown errors. The pi runtime will not mark these as `isError`. If the agent needs to distinguish "tool succeeded with text" from "tool failed with error text," the implementation should throw on failure (the pi `ToolDefinition.execute` contract says "Throw on failure instead of encoding errors in `content`"). This is the most impactful deviation.
2. **Schema drift on `kb_graph.predicate`:** The typebox schema accepts a `predicate` field the daemon doesn't support. If the agent passes it, the behavior is undefined (silently dropped or rejected by Zod).

### Architecture-notes updates needed

- Update the `PiAppRouter` description: it is `ReturnType<typeof buildPiRouter>`, not `Omit<AppRouter, 'write'>`. Note that `buildPiRouter` + `PiAppRouter` were added to `@kb/protocol` in this slice (additive exports).
- Note that `buildRouter` now accepts an optional `bindings` param and materializes async-iterables — these changes are in `@kb/protocol` and affect all `buildRouter` callers.
- Note the `TOOL_SPECS`-driven (not `piBindings`-loop-driven) registration approach and its implication: new daemon methods require manual `TOOL_SPECS` entries.
- Note that the pi `AgentToolResult` type has no `isError` field — errors must be thrown, not returned. The spec's "`{isError}` per the pi tool contract" was incorrect and should be updated to "throw on failure."
