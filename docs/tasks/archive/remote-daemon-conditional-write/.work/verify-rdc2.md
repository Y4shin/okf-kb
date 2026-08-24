# Verify: slice `pi-adapter-conditional-write` (task `remote-daemon-conditional-write`)

Branch: `task/remote-daemon-conditional-write` (confirmed)
Mode: direct repo (no worktree)
Date: 2025-01-15

## Quality gate

| Step | Command | Result |
|------|---------|--------|
| 1. Branch | `git branch --show-current` → `task/remote-daemon-conditional-write` | ✅ |
| 2. Lint detect | No eslint/biome config, no `lint` script in any package.json. `tsc --build` (typecheck) is the static-analysis gate. | n/a (documented) |
| 3. Install | `npm install` → up to date, audited 463 packages | ✅ |
| 4. Typecheck | `npm run typecheck` (`tsc --build`) → exit 0 | ✅ |
| 5. Test suite | `npm test` (`vitest run`) → exit 0 | ✅ |

### Test suite output

```
Test Files  20 passed | 1 skipped (21)
     Tests  197 passed | 1 skipped (198)
  Duration  3.00s
```

- `packages/pi-adapter/tests/tools.test.ts` → **20 tests passed** (was 9; +11 new tests for `isRemoteKb`, remote registration, and remote round-trip)
- `packages/fs/tests/embedder.integration.test.ts` → 1 skipped (pre-existing, unrelated)
- All other 19 test files green.

## Acceptance criteria — detailed confirmation

### 1. `isRemoteKb(url: string): boolean` (config.ts, exported + unit-tested)

| Input | Expected | Actual |
|-------|----------|--------|
| `http://127.0.0.1:30700` | false | ✅ false |
| `http://localhost:30700` | false | ✅ false |
| `http://[::1]:30700` | false | ✅ false |
| `http://kb.lan:30700` | true | ✅ true |
| `http://192.168.1.10:30700` | true | ✅ true |
| `http://0.0.0.0:30700` | true | ✅ true (documented as remote — not a loopback literal) |
| `'not a url'` / `''` / unbracketed IPv6 | false | ✅ false (malformed → treated as local; does not activate Write) |

Exported from `extension/src/config.ts` and re-exported from `extension/src/index.ts`.

### 2. Conditional tRPC client type (client.ts)

`createKbTrpcClient<R extends KbRouterType>` is generic over `PiAppRouter | AppRouter`:
- **Local** (`isRemoteKb === false`): `createKbTrpcClient<PiAppRouter>` — omits `write`.
- **Remote** (`isRemoteKb === true`): `createKbTrpcClient<AppRouter>` — full router incl `write`.

Wired in `index.ts` session_start: the local/remote decision is made **once** at `session_start` from `KB_URL` (not per-call).

### 3. `registerKbTools` generalized to a binding set (tools.ts)

`registerKbTools(pi, client, bindings: FullBindings = piBindings)` — default is `piBindings` (backwards compatible).
- Iterates `TOOL_SPECS` and registers a tool only if its `qualifiedName` exists in `flattenBindings(bindings)` (skips EXCLUDED entries).
- The structural gate validates every `TOOL_SPEC` against `fullBindings` at module load — a new daemon method fails `tsc` until bound or EXCLUDED.

### 4. `kb_put` / `kb_delete` tool specs (tools.ts)

- `kb_put({ref, content})` → `write.put` via `.mutate` — typebox `PutParams = Type.Object({ref, content})`.
- `kb_delete({ref})` → `write.delete` via `.mutate` — typebox `DeleteParams = Type.Object({ref})`.
- Both throw-on-failure (pi contract), with error mapping (401, unreachable) matching existing tools.
- Only registered when `bindings` includes the `write` group (`fullBindings`/remote); filtered out by `piBindings` (local).

### 5. Local case = 8 tools, NO kb_put/kb_delete (unchanged) ✅

Test `'registers exactly 8 tools (no kb_put/kb_delete)'` and `'local case (piBindings) still registers exactly 8 tools'` and `'default bindings is piBindings (backwards compatible — no arg)'` — all pass. Tool list: `kb_check_id, kb_get, kb_graph, kb_list, kb_resolve_id, kb_resolve_path, kb_search, kb_update`.

### 6. Remote case = 10 tools incl kb_put/kb_delete ✅

Test `'registers exactly 10 tools incl kb_put and kb_delete'` — passes. All 10 tools registered (8 + `kb_put` + `kb_delete`).

### 7. Remote round-trip: kb_put → kb_get → kb_delete ✅

Test `'kb_put creates a note, kb_get returns it, kb_delete removes it'`:
1. `kb_put({ref:'concept:remote-test', content})` → note created via `write.put`.
2. `kb_get({ref})` → returns note with correct ref/slug/title/body.
3. `kb_delete({ref})` → removes note.
4. `kb_get({ref})` → throws (note gone).

Test `'kb_check_id confirms the note after kb_put'` — `kb_put` then `kb_check_id` returns `{ok: true, errors: []}`.

### 8. Existing local-case tests stay green ✅

All pre-existing tests (round-trip with native write + `kb_update`, error mapping, tool registration) pass unchanged.

### 9. Config (config.ts)

- `KB_URL` default `http://127.0.0.1:30700` (local) — drives the local/remote switch.
- `KB_TOKEN` env > `getOrMintToken()` (keyring) — sent as Bearer in both cases.
- No committed secrets.

## Result

**PASS** — Slice `pi-adapter-conditional-write` verified.

- Typecheck: clean (exit 0)
- Slice tests: 20/20 pass (11 new)
- Full project suite: 20 test files pass, 1 skipped, 197 tests pass (exit 0)
- No staged files. Working tree contains only tracking/meta files (`docs/tasks/state.yaml`, `.work/` artifacts, `package-lock.json`).

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Conditional PiAppRouter/AppRouter client + generalized registerKbTools(binding set) + kb_put/kb_delete tools + isRemoteKb helper, all within the 5 affected files named in the slice doc. No scope widening: no @kb/fs in adapter, no new search engines, local behavior unchanged (8 tools, backwards-compatible default piBindings)."
    }
  ],
  "changedFiles": [
    "packages/pi-adapter/extension/src/client.ts",
    "packages/pi-adapter/extension/src/config.ts",
    "packages/pi-adapter/extension/src/index.ts",
    "packages/pi-adapter/extension/src/tools.ts",
    "packages/pi-adapter/tests/tools.test.ts"
  ],
  "testsAddedOrUpdated": [
    "packages/pi-adapter/tests/tools.test.ts"
  ],
  "commandsRun": [
    {
      "command": "git branch --show-current",
      "result": "passed",
      "summary": "task/remote-daemon-conditional-write confirmed"
    },
    {
      "command": "npm install",
      "result": "passed",
      "summary": "up to date, audited 463 packages"
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build exit 0"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "20 test files pass, 1 skipped; 197 tests pass, 1 skipped; tools.test.ts 20/20 (11 new)"
    }
  ],
  "validationOutput": [
    "typecheck: tsc --build exit 0 (clean)",
    "test suite: 20 passed | 1 skipped (21 files); 197 passed | 1 skipped (198 tests); exit 0",
    "isRemoteKb: 127.0.0.1/localhost/[::1] → false; kb.lan/192.168.x/0.0.0.0 → true; malformed → false (6 unit tests pass)",
    "local case: 8 tools, no kb_put/kb_delete (3 tests pass including backwards-compat default-arg test)",
    "remote case: 10 tools incl kb_put/kb_delete (1 test pass)",
    "remote round-trip: kb_put→kb_get→kb_delete + kb_check_id after kb_put (2 tests pass)",
    "existing local round-trip + error mapping tests: all green (unchanged)"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "5 files changed (+310/-40): client.ts generalized to createKbTrpcClient<R> (PiAppRouter|AppRouter); config.ts adds isRemoteKb string-hostname check; index.ts wires local/remote decision at session_start; tools.ts generalizes registerKbTools(bindings) with kb_put/kb_delete specs + structural fullBindings gate; tools.test.ts +11 tests (isRemoteKb units, remote 10-tool registration, remote kb_put→kb_get→kb_delete round-trip).",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "No dedicated linter (eslint/biome) is configured in this repo; tsc --build (typecheck) is the static-analysis gate and passed. The 0.0.0.0 → remote decision is documented in config.ts and tested. Task estimated ~9 new tests; actual is 11 new (more coverage than estimated). Working-tree changes are only tracking/meta files (state.yaml, .work/ artifacts, package-lock.json) — no slice code is staged or dirty."
}
```
