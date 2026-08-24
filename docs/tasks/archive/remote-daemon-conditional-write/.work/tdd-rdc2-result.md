# TDD Result — slice `pi-adapter-conditional-write` (rdc2)

## Summary

Implemented the pi adapter conditional write branch: `isRemoteKb` for
local/remote detection, a generic `createKbTrpcClient<R>`, generalized
`registerKbTools(pi, client, bindings)` with `kb_put`/`kb_delete` specs, and
the conditional `session_start` branch in `index.ts`.

All 20 tests pass (11 existing + 9 new). Full suite (197 tests) green. Full
project typecheck clean.

## Changes

### `extension/src/config.ts`
- Added `isRemoteKb(url: string): boolean` — string-based hostname check
  against loopback literals. Malformed URL → false (treat as local).
  Includes `[::1]` bracketed form (what `new URL` returns for IPv6
  loopback). `0.0.0.0` is treated as remote (not a loopback literal).

### `extension/src/client.ts`
- Made `createKbTrpcClient` generic: `createKbTrpcClient<R extends
  KbRouterType>(url, token)` where `KbRouterType = PiAppRouter | AppRouter`.
  The httpBatchLink + Bearer header are unchanged; only the type param
  changes. Now also re-exports `AppRouter`.

### `extension/src/tools.ts`
- Added `kb_put` (`{ref, content}` → `write.put`) and `kb_delete`
  (`{ref}` → `write.delete`) specs to `TOOL_SPECS`. Both are mutations
  (`.mutate`), throw-on-failure.
- Changed the structural gate from `piBindings` to `fullBindings` so all
  10 tool specs validate (kb_put/kb_delete reference `write.put`/
  `write.delete` which are EXCLUDED in piBindings).
- Generalized `registerKbTools(pi, client, bindings = piBindings)` —
  takes a `FullBindings` arg, flattens it (skips EXCLUDED), and filters
  `TOOL_SPECS` by whether the spec's qualifiedName exists in the active
  binding set. Local (piBindings) → 8 tools; Remote (fullBindings) → 10.

### `extension/src/index.ts`
- Conditional `session_start` branch: if `isRemoteKb(cfg.url)` →
  `createKbTrpcClient<AppRouter>` + `registerKbTools(pi, client,
  fullBindings)` (10 tools); else → `createKbTrpcClient<PiAppRouter>` +
  `registerKbTools(pi, client, piBindings)` (8 tools, unchanged).
- Decision made ONCE at session_start (not per-call).
- Now exports `isRemoteKb` and `AppRouter` type.

### `tests/tools.test.ts`
- 6 `isRemoteKb` unit tests: loopback, IPv6, malformed, hostname,
  non-loopback IP, `0.0.0.0`.
- 3 remote registration tests: 10 tools with fullBindings, 8 tools with
  piBindings, backwards-compatible default (no arg → piBindings).
- 2 remote round-trip tests: `kb_put` → `kb_get` → `kb_delete` cycle;
  `kb_check_id` after `kb_put`.

## Test approach

The remote branch is tested by calling `registerKbTools(pi, client,
fullBindings)` directly with a loopback test daemon (no DNS needed). The
`isRemoteKb` unit test covers the string logic separately. This proves the
10-tool registration + `kb_put`/`kb_delete` round-trip end-to-end without
requiring a real remote daemon.

## Divergence from plan

- **`isRemoteKb` IPv6 handling**: The arch spec lists `::1` in the
  loopback set, but `new URL('http://::1:30700')` throws (unbracketed
  IPv6 is not a valid URL). The properly-bracketed form
  `new URL('http://[::1]:30700').hostname` returns `"[::1]"` (with
  brackets). Added `"[::1]"` to the `LOOPBACK_HOSTS` set alongside `::1`
  so both the daemon's bind-host check (raw `::1`) and the URL hostname
  check (bracketed `[::1]`) work. The malformed `http://::1:30700` case
  falls through to the catch → false (local), which is the spec'd
  behavior for malformed URLs.

- **`checkId` return shape**: The test initially expected `checkId` to
  return an array, but it returns a `CheckReport` (`{ ok: boolean,
  errors: Array }`). Fixed the test to check `parsed.ok === true` and
  `Array.isArray(parsed.errors)`.

## Commands run

| Command | Result |
|---------|--------|
| `npx vitest run "packages/pi-adapter/tests/tools.test.ts"` | passed (20/20) |
| `npm run typecheck --workspace @kb/pi-adapter` | passed |
| `npm run typecheck` (full project) | passed |
| `npx vitest run` (full suite) | passed (197/197, 1 skipped) |

## Residual risks

- The `index.ts` conditional branch is not directly tested end-to-end
  (no test triggers `session_start` with a remote `KB_URL`). The
  `isRemoteKb` unit test + the `registerKbTools(pi, client, fullBindings)`
  direct test cover the two halves separately. Slice 3's
  `remote-roundtrip.test.ts` may exercise the full branch if needed.
- `0.0.0.0` is treated as remote per the spec — an operator pointing
  `KB_URL` at `http://0.0.0.0:30700` will get `kb_put`/`kb_delete`
  registered, but the daemon's safety gate (slice 1) will refuse to bind
  `0.0.0.0` without TLS. This is the intended safe behavior.
