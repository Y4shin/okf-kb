## Deviation report — pi-adapter-conditional-write

### API surface changes

- **Planned:** `isRemoteKb(url: string): boolean` exported from `extension/src/config.ts`; `createKbTrpcClient` generic over `R = PiAppRouter | AppRouter`; `registerKbTools(pi, client, bindings)` generalized to take a binding set with `kb_put`/`kb_delete` specs; conditional `session_start` branch in `index.ts`.
- **Actual:** All four surface changes landed exactly as specified.
  - `isRemoteKb` — `config.ts:49-55`: `try { return !LOOPBACK_HOSTS.includes(new URL(url).hostname) } catch { return false }`. Exported (`config.ts:48` `export function`), re-exported from `index.ts:14`.
  - `createKbTrpcClient<R extends KbRouterType>` — `client.ts:20`: generic over `R`, `KbRouterType = PiAppRouter | AppRouter` (`client.ts:11`). Now also re-exports `AppRouter` (`client.ts:8`).
  - `registerKbTools(pi, client, bindings: FullBindings = piBindings)` — `tools.ts:149`. `kb_put`/`kb_delete` specs added (`tools.ts:71-78`, `tools.ts:113-114`). Filters `TOOL_SPECS` by whether the qualifiedName is present in the flattened active bindings (`tools.ts:163-164`: `if (!binding) continue`).
  - `index.ts:30-39`: conditional `session_start` branch — `isRemoteKb(cfg.url)` → `createKbTrpcClient<AppRouter>` + `registerKbTools(pi, client, fullBindings)`; else → `createKbTrpcClient<PiAppRouter>` + `registerKbTools(pi, client, piBindings)`.
- **Impact:** None on dependent slices. The public exports are a strict superset of the prior surface (added `isRemoteKb`, `AppRouter` type re-export). Slice 3 (`remote-roundtrip.test.ts`) can import `isRemoteKb` and call `registerKbTools(pi, client, fullBindings)` directly. No downstream consumer is forced to change.

### Abstraction usage
- Used/was specified: **yes.** `@kb/protocol`'s `piBindings`/`fullBindings`/`flattenBindings`/`FullBindings`/`PiAppRouter`/`AppRouter` are consumed exactly as the spec directed — no new binding record was defined, no `@kb/fs` was imported into the adapter. The structural gate was switched from `piBindings` to `fullBindings` (`tools.ts:122-131`) so all 10 tool specs (incl. `write.put`/`write.delete`) validate against a real binding; the runtime filter then skips `EXCLUDED` entries per the passed set. This matches the spec's "use `fullBindings` for the remote case; don't define a new record" and "the `piBindings`/`fullBindings` validation gate stays."

### Out-of-scope changes
- **`isRemoteKb` IPv6 bracket handling (minor, additive):** The arch spec's loopback set lists `'::1'`. The implementation added `'[::1]'` to `LOOPBACK_HOSTS` (`config.ts:26`) because `new URL('http://[::1]:30700').hostname` returns the bracketed string `"[::1]"`, not `::1`. This is a necessary correctness fix for the spec's own `::1` → local requirement — without it, IPv6 loopback would be misclassified as remote. The raw `::1` is also kept in the set (harmless; matches the daemon's bind-host string check). This is a deviation in *implementation detail* from the literal spec snippet, but it upholds the spec's stated behavior. Documented in the code (`config.ts:24-26`) and in `.work/tdd-rdc2-result.md`. **No user-facing or API-surface impact.**
- **`checkId` return shape test fix (test-only):** The remote round-trip test initially expected `checkId` to return an array; the daemon returns a `CheckReport { ok, errors }`. Test corrected to assert `parsed.ok === true` and `Array.isArray(parsed.errors)` (`tools.test.ts:381-382`). This is a test-assertion correction, not an API change.
- **No source changes outside the six specified files.** `git diff 34fe6ce..HEAD --stat` shows exactly: `package.json` (dep-path fix), `config.ts`, `client.ts`, `index.ts`, `tools.ts`, `tools.test.ts`. The `docs/tasks/state.yaml` change (`slice:` pointer advanced) is bookkeeping, not scope.

### Task doc update needed?
**Yes — append to `## Implementation notes` in the slice doc** (currently absent; slice `status:` is still `todo`). Suggested content:
- `isRemoteKb` exported from `config.ts`; loopback set is `['127.0.0.1','localhost','::1','[::1]']` — the bracketed `[::1]` is required because `new URL(...).hostname` returns the bracketed form for IPv6; `0.0.0.0` → remote; malformed URL → false (local).
- `createKbTrpcClient<R extends KbRouterType>` generic; local call site `PiAppRouter`, remote `AppRouter`.
- `registerKbTools(pi, client, bindings = piBindings)`: 10 `TOOL_SPECS` incl. `kb_put`/`kb_delete`; structural gate validates against `fullBindings`; runtime filter skips specs whose group is `EXCLUDED` in the passed set. Local (piBindings) → 8 tools; Remote (fullBindings) → 10 tools.
- Decision made once at `session_start` (`index.ts:30-39`), not per-call.
- Tests: 20 in `tools.test.ts` (11 existing + 9 new: 6 `isRemoteKb` unit, 3 remote-registration, 2 remote round-trip). Full suite 197 passed + 1 skipped. `tsc --noEmit` clean.
- Latent pre-existing bug (not introduced by this slice, not fixed): `tools.ts:192` error-message fallback hardcodes `http://127.0.0.1:3000` (should be `30700`). Was present at `34fe6ce`. Out of scope for this slice; flagged for a future fix.

### User attention needed?
**No.** The API surface is a backward-compatible superset. Local behavior is unchanged (default `piBindings` → 8 tools, no `kb_put`/`kb_delete`; all existing tests green). The only behavior change is the *additional* remote branch, which activates only when `isRemoteKb(KB_URL) === true` — never under the default `http://127.0.0.1:30700`. No operator action required unless they intend to run remote, at which point the spec'd `KB_URL` + `KB_TOKEN` config drives it.

### Detailed checklist review

**`isRemoteKb(url)` exported from `config.ts`?** Yes (`config.ts:48-55`, re-exported `index.ts:14`). String hostname check: `127.0.0.1`/`localhost`/`::1`/`[::1]` → `false` (`config.ts:26,52`); else → `true`. Malformed URL → `false` (`config.ts:54` catch). `0.0.0.0` → `true` (not in `LOOPBACK_HOSTS`; tested `tools.test.ts:259`). ✓

**Conditional client + tools at `session_start`:** Local → `createKbTrpcClient<PiAppRouter>` + `registerKbTools(pi, client, piBindings)` = 8 tools, no `kb_put`/`kb_delete` (`index.ts:36-38`; tested `tools.test.ts:40-58`, `tools.test.ts:298-305`). Remote → `createKbTrpcClient<AppRouter>` + `registerKbTools(pi, client, fullBindings)` = 10 tools incl. `kb_put`/`kb_delete` (`index.ts:32-34`; tested `tools.test.ts:278-296`). Decision made ONCE at `session_start` (`index.ts:30` inside `pi.on('session_start', …)`). ✓

**`createKbTrpcClient` generic over `R = PiAppRouter | AppRouter`?** Yes (`client.ts:20`, `KbRouterType` `client.ts:11`). Local call site uses `PiAppRouter` (`index.ts:37`), remote uses `AppRouter` (`index.ts:33`). ✓

**`registerKbTools(pi, client, bindings)` generalized?** Yes (`tools.ts:149`). `kb_put`/`kb_delete` specs added: `PutParams {ref, content}` (`tools.ts:71-74`), `DeleteParams {ref}` (`tools.ts:78`). Both are mutations — the existing `isQuery` gate dispatches to `.mutate` for non-query bindings (`tools.ts:170-173`); `write.put`/`write.delete` are in `MUTATION_METHODS` (`protocol/router.ts:23-24`) so `isQuery=false` → `.mutate`. Throw-on-failure (`tools.ts:185` `throw new Error(msg)`). Filtered by whether the group is present (non-`EXCLUDED`) in the passed bindings (`tools.ts:160-164`). `piBindings`/`fullBindings` validation gate holds — structural gate now keyed on `fullBindings` (`tools.ts:122-131`) so all 10 specs validate; the `FullBindings` exhaustiveness gate in `@kb/protocol` (`records.ts:111-120` `satisfies FullBindings`) is unchanged. ✓

**Local behavior unchanged (backwards compatible)? Existing local-case tests green?** Yes. `registerKbTools(pi, client)` with no bindings arg defaults to `piBindings` (`tools.ts:149`) → 8 tools (tested `tools.test.ts:307-314`). The 11 pre-existing tests in `tools.test.ts` (registration, round-trip, error mapping) all pass unchanged. Full suite 197 passed + 1 skipped. ✓

**Config: `KB_URL` default `http://127.0.0.1:30700` drives the switch; `KB_TOKEN` env>keyring Bearer?** Yes. `resolveKbConfig` (`config.ts:20-22`): `url = process.env.KB_URL ?? 'http://127.0.0.1:30700'`; `token = process.env.KB_TOKEN ?? getOrMintToken()` (env > keyring > mint). Bearer sent in `httpBatchLink` headers (`client.ts:24`). Default URL → `isRemoteKb` false → local branch. ✓

**Out-of-scope: no `@kb/fs` in adapter; `kb_put`/`kb_delete` are the daemon's `Write` over tRPC.** Confirmed. No `@kb/fs` import in `extension/src/*` (only `@kb/protocol`, `@kb/daemon`, `@trpc/client`, `typebox`, `@earendil-works/pi-*`). `kb_put`/`kb_delete` map to `write.put`/`write.delete` tRPC mutations (`tools.ts:113-114`). `@kb/fs` appears only in `tests/tools.test.ts` (`FakeEmbedder`, `testManifest`) and the adapter `package.json` `devDependencies` — appropriate. ✓

**Tests: `isRemoteKb` unit cases; local 8 tools; remote 10 tools + `kb_put`→`kb_get` round-trip?** Yes. `isRemoteKb`: 6 unit cases (`tools.test.ts:233-263`) covering loopback, IPv6, malformed, hostname, non-loopback IP, `0.0.0.0`. Local 8 tools: `tools.test.ts:40-58` (existing, unchanged) + `tools.test.ts:298-314` (new explicit `piBindings` + default-arg). Remote 10 tools: `tools.test.ts:278-296`. Round-trip: `kb_put` → `kb_get` → `kb_delete` cycle (`tools.test.ts:324-365`) + `kb_check_id` after `kb_put` (`tools.test.ts:367-393`). All pass. ✓

**Extension `package.json` dep paths (`file:../../core|protocol|daemon`) — correct now?** Yes. `extension/package.json` (post-commit `17c3f84`): `"@kb/core": "file:../../core"`, `"@kb/protocol": "file:../../protocol"`, `"@kb/daemon": "file:../../daemon"`. The pre-fix form (`file:../..` = repo root) is gone. The `extension/node_modules/@kb/*` symlinks resolve correctly to the sibling packages (`../../../../core`, `../../../../protocol`, `../../../../daemon`). The diff (`package.json`) shows the single-line fix from `file:../..` → `file:../../<pkg>`. ✓

### Architecture-notes updates
None required. The implementation follows the arch spec's "pi adapter (slice 2)" section faithfully. The one implementation-detail divergence (`[::1]` bracket form in `LOOPBACK_HOSTS`) is a correctness refinement of the spec's `::1` entry, not a contract change — it makes the spec's own stated behavior (`::1` → local) actually work. The arch spec's `isRemoteKb` snippet listed `'::1'` in the array; the implementation adds `'[::1]'` alongside it. If the arch spec is ever treated as canonical reference, it should gain the `'[::1]'` entry and a note about `new URL().hostname` bracketing IPv6.
