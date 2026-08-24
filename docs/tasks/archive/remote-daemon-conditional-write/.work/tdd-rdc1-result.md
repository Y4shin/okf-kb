# TDD Result — slice `daemon-bind-tls-capabilities`

## Summary

Implemented the daemon bind-host, non-localhost-TLS safety gate, capabilities
endpoint, and optional direct-TLS mode in `packages/daemon/src/server.ts`.
All 8 new test cases pass; all 9 existing daemon tests stay green; the full
suite (186 tests) passes; `tsc --build` is clean.

## What changed

### `packages/daemon/src/server.ts`
- `StartDaemonOptions` gains `host?: string` (default `KB_DAEMON_HOST` env → `'127.0.0.1'`) and `tls?: { cert: string; key: string }`.
- **Non-localhost safety gate** (before `listen`): `isLocal = ['127.0.0.1','localhost','::1'].includes(host)` — a **string check**, not DNS resolution. If `!isLocal && !opts.tls && KB_ALLOW_REMOTE_INSECURE !== '1'` → throws a clear `Error` naming all 3 options (reverse proxy / TLS certs / escape hatch). If `!isLocal && !opts.tls && KB_ALLOW_REMOTE_INSECURE === '1'` → writes a `WARNING` to stderr about the sniffable token.
- **TLS mode** (secondary path): if `opts.tls` is set, uses `https.createServer({cert: readFileSync(cert), key: readFileSync(key)}, handler)` instead of `http.createServer`. The request handler is extracted as a named function declaration (hoisted) so both `http` and `https` server creation can reference it.
- `server.listen(port, host, ...)` uses the resolved `host`.
- **Capabilities endpoint**: `GET /` now returns `{ok:true, service:'kb-daemon', version:'0.1.0', groups: Object.keys(fullBindings)}` — derived from `@kb/protocol`'s `fullBindings` so it can't drift. `GET /` remains **NOT Bearer-gated** (health/capabilities; groups list is non-sensitive). tRPC + MCP unchanged (still Bearer-gated).
- `DaemonHandle` returns `host` alongside `url`/`port`/`token`/`close`. URL scheme is `https` when TLS is set, `http` otherwise.

### `packages/daemon/tests/server.test.ts`
- Refactored space setup into `makeSpace()` helper.
- Added `afterEach` env-var restoration for `KB_DAEMON_HOST` / `KB_ALLOW_REMOTE_INSECURE`.
- 8 new test cases (all in two new `describe` blocks):
  1. `startDaemon({ host: '127.0.0.1' })` → listens (backwards-compatible); `handle.host` is `'127.0.0.1'`.
  2. `startDaemon({ host: '0.0.0.0' })` without TLS/escape → throws, error names all 3 options (`reverse proxy`, `KB_DAEMON_TLS`, `KB_ALLOW_REMOTE_INSECURE`).
  3. `startDaemon({ host: '0.0.0.0' })` with `KB_ALLOW_REMOTE_INSECURE=1` → listens, stderr has `WARNING` + `sniffable`; env restored after.
  4. `startDaemon({ host: 'kb.lan' })` (hostname) without TLS/escape → throws.
  5. `startDaemon({ host: '::1' })` → listens (local).
  6. `startDaemon({ host: 'localhost' })` → listens (local).
  7. `GET /` returns capabilities JSON with `ok`, `service`, `version`, and `groups` — exact set of 5 (`read`, `search`, `write`, `localFs`, `indexAdmin`) asserted via `Set` comparison.
  8. `GET /` returns 200 without a Bearer token (not gated).

## Test results
- `npm test -- packages/daemon/tests/server.test.ts` → 17 passed (9 existing + 8 new).
- `npm test` (full suite) → 186 passed, 1 skipped (opt-in embedder).
- `npm run typecheck` → clean (tsc --build).

## Divergence from plan

- **TLS-mode test skipped (optional per instructions):** The TLS-mode test was marked optional in the task instructions ("if it's fiddly, skip the TLS-mode test but still implement the option"). I implemented the `tls?: {cert, key}` option (uses `https.createServer` with `readFileSync`), but did not write a test that generates a self-signed cert and connects over HTTPS. The non-localhost gate-trip behavior is fully tested without TLS. This is an intentional scope decision, not a gap — the reverse-proxy path (recommended) needs no daemon-TLS test.
- **Slice doc edge-case wording vs. arch spec:** The slice doc test plan mentions "hostname that resolves to loopback treated as local" under edge cases. The arch spec (primary) and task instructions are explicit: `isLocal` is a **string check** (not DNS resolution), and a hostname that resolves to loopback is still treated as non-local (safe over-permissive). I followed the arch spec. The `kb.lan` test confirms hostnames are non-local even though they might resolve to loopback.

## Notable events
- Refactored the inline `createServer(async (req, res) => {...})` handler into a named `requestHandler` function declaration so both the `http` and `https` server-creation paths can reference it (function declarations are hoisted; a `const` arrow function would not be hoisted and would fail at the `createServer()` call site).
- No `npm install` needed — `https` is `node:https` (built-in), and `readFileSync` is already imported in `deps.ts` (added a separate import in `server.ts`).

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Implemented host option, non-localhost-TLS safety gate, capabilities endpoint, TLS mode, and DaemonHandle.host — all within packages/daemon/src/server.ts + tests only. No scope widened: no @kb/fs or @kb/core changes, no new packages, no new deps. 8 new tests added; 9 existing stay green; 186 full suite pass; typecheck clean."
    }
  ],
  "changedFiles": [
    "packages/daemon/src/server.ts",
    "packages/daemon/tests/server.test.ts"
  ],
  "testsAddedOrUpdated": [
    "packages/daemon/tests/server.test.ts"
  ],
  "commandsRun": [
    {
      "command": "npm test -- packages/daemon/tests/server.test.ts",
      "result": "passed",
      "summary": "17 tests passed (9 existing + 8 new)"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "186 passed, 1 skipped (full suite)"
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build clean"
    },
    {
      "command": "git commit",
      "result": "passed",
      "summary": "Committed on task/remote-daemon-conditional-write (91a8cb3)"
    }
  ],
  "validationOutput": [
    "All 8 acceptance-criteria tests pass: localhost binds unchanged, 0.0.0.0/kb.lan throw without TLS, KB_ALLOW_REMOTE_INSECURE=1 listens + warns, ::1/localhost treated as local, GET / returns 5 groups not Bearer-gated",
    "Full suite 186/186 pass (1 skip = opt-in embedder), typecheck clean"
  ],
  "residualRisks": [
    "TLS mode (https.createServer path) is implemented but not directly tested with a live self-signed cert — optional per task instructions; the gate-trip behavior is fully tested without it"
  ],
  "noStagedFiles": true,
  "diffSummary": "Extended startDaemon: host option + non-localhost-TLS safety gate (throw/escape-hatch), capabilities groups on GET /, https.createServer for tls option, DaemonHandle.host. 8 new tests added.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "TLS-mode test was intentionally skipped (optional per instructions). Slice doc's 'hostname resolves to loopback = local' edge case wording differs from arch spec's 'string check, not DNS' — followed arch spec (primary)."
}
```
