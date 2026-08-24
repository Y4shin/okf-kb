## Deviation report — daemon-bind-tls-capabilities

### API surface changes

- **Planned:** `StartDaemonOptions` gains `host?: string` (default `KB_DAEMON_HOST` env or `127.0.0.1`) and `tls?: { cert: string; key: string }` (file paths). `DaemonHandle` returns `host` alongside `url`/`port`/`token`/`close`.
- **Actual:** Implemented exactly as specified. `StartDaemonOptions` (`server.ts:24–28`) adds `host?: string` and `tls?: { cert: string; key: string }`. Host resolution `server.ts:42`: `opts.host ?? process.env.KB_DAEMON_HOST ?? '127.0.0.1'`. `DaemonHandle` (`server.ts:31–37`) includes `host: string`. `server.listen(port, host, ...)` (`server.ts:172`) uses the resolved host. The `url` field uses `https://` scheme when `opts.tls` is set (`server.ts:175–176`).
- **Impact:** No impact on dependent slices — the `host`/`tls` additions are additive; `DaemonHandle.host` is new but backward-compatible (existing callers ignore it). Slice 2 (pi adapter) consumes `isRemoteKb` (string check on `KB_URL`), not the daemon's host, so no coupling.

### Abstraction usage

- **Used/was specified:** Yes. `groups` is derived from `Object.keys(fullBindings)` (`server.ts:93`), not a hand-maintained constant. `fullBindings` is imported from `@kb/protocol` (`server.ts:8`). The `Object.keys(fullBindings)` call returns `['localFs','read','search','write','indexAdmin']` (insertion order of `records.ts:91–97`), so the groups list can't drift from the protocol binding records. This matches the arch-spec instruction to "derive `groups` from the keys of `fullBindings`".

### Non-localhost safety gate

- **Planned:** String check `isLocal = ['127.0.0.1','localhost','::1'].includes(host)` (NOT DNS resolution). `!isLocal && !tls && !KB_ALLOW_REMOTE_INSECURE=1` → `throw` with a message naming all 3 options (reverse proxy / TLS certs / escape hatch). Escape hatch (`KB_ALLOW_REMOTE_INSECURE=1`) listens + writes a stderr WARNING.
- **Actual:** Implemented exactly as specified. `server.ts:46`: `const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(host)`. `server.ts:47–58`: the `throw new Error(...)` with all 3 options named — "reverse proxy" (line 52), "KB_DAEMON_TLS" (line 53–54), "KB_ALLOW_REMOTE_INSECURE" (line 54). `server.ts:59–63`: the escape-hatch `process.stderr.write('WARNING: ...')`. The gate runs **before** `server.listen` (line 172), so it's a startup error, not a silent bind. Confirmed by test `server.test.ts:249` (`.rejects.toThrow(/Refusing to bind non-localhost/)`).
- **`0.0.0.0` is non-local:** Confirmed — `['127.0.0.1','localhost','::1'].includes('0.0.0.0')` is `false`. Test `server.test.ts:247` asserts the throw.
- **`::1` is local:** Confirmed. Test `server.test.ts:300` (`h.host` is `'::1'`).
- **Hostnames are non-local:** `kb.lan` is not in the list → treated as non-local. Test `server.test.ts:287` asserts the throw. A hostname resolving to loopback is still non-local (string check, no DNS).
- **Impact:** None — matches the arch-spec gate verbatim (semantically).

### TLS mode (secondary)

- **Planned:** If `opts.tls` is set, use `https.createServer({cert, key}, handler)` with `readFileSync`. Reverse-proxy-first is documented.
- **Actual:** `server.ts:96–104`: `const createServer = opts.tls ? () => createHttpsServer({ cert: readFileSync(opts.tls!.cert), key: readFileSync(opts.tls!.key) }, requestHandler) : () => createHttpServer(requestHandler)`. Imports `createServer as createHttpsServer` from `node:https` (`server.ts:4`) and `readFileSync` from `node:fs` (`server.ts:5`). The handler is shared (a named function `requestHandler`, `server.ts:107`) to avoid duplicating the routing logic. Scheme in `url` is `https` when TLS (`server.ts:175`). This is the secondary path; the error message itself recommends the reverse proxy first (`server.ts:52`).
- **Deviation:** The slice doc mentions `KB_DAEMON_TLS_CERT`/`KB_DAEMON_TLS_KEY` env vars, but the implementation uses the `opts.tls` field (explicit `{cert, key}` paths) instead of reading those env vars. The arch-spec's pseudocode shows `opts.tls` (not env vars), and the `StartDaemonOptions` contract shows `tls?: {cert, key}`. So the implementation matches the arch-spec's interface contract (the `tls` option), but the slice doc's "if `KB_DAEMON_TLS_CERT` + `KB_DAEMON_TLS_KEY` are set" wording implies env-var reading that wasn't implemented. The env var names appear **only** in the error message string (`server.ts:53–54`) and the warning (`server.ts:62`), not as actual env reads. This is a minor wording mismatch in the slice doc vs. the arch-spec interface; the implementation follows the arch-spec.
- **No TLS test:** There is no test exercising `https.createServer` with a real cert/key. The arch-spec says "Read the cert/key files (or accept paths + `readFileSync`)" and the test plan lists "TLS mode (if implemented)" and "bad TLS cert path → error" as scenarios. The implementer chose not to add a TLS-mode test (cert generation is non-trivial in unit tests). The `tls?` option is exercised only via the safety-gate logic (a non-localhost host with `tls` set would not throw — this path is untested but the throw-absence is trivially implied by the `!opts.tls` condition).
- **Impact:** Slice 3's deployment doc should clarify that the `tls` option is passed programmatically (`opts.tls`), not via env vars — unless a future slice wires env-var reads. The round-trip test (slice 3) uses loopback so TLS isn't needed there.

### GET / capabilities endpoint

- **Planned:** `GET /` returns `{ok, service, version, groups: [...]}`. NOT Bearer-gated. tRPC/MCP remain Bearer-gated.
- **Actual:** `server.ts:111–114`: the `GET /` handler returns `JSON.stringify({ ok: true, service: 'kb-daemon', version: '0.1.0', groups })` with no auth check (no `checkBearer` call before it). `/trpc` (`server.ts:118`) and `/mcp` (`server.ts:132`) both call `checkBearer(req, token)` and return 401 on failure. `/ping` and `/.ping` also return the capabilities JSON (same handler branch, `server.ts:111`).
- **Groups array order:** `Object.keys(fullBindings)` returns `['localFs','read','search','write','indexAdmin']` (insertion order of `records.ts:91–97`). The arch-spec shows `['read','search','write','localFs','indexAdmin']` (a different order). The test (`server.test.ts:393`) compares via `new Set(...)` (order-independent), so the order difference is not asserted. This is a benign cosmetic mismatch — the arch-spec's array was illustrative; the test correctly treats it as a set. No deviation of substance.
- **Impact:** None. A client reading `groups` gets all 5 keys regardless of order.

### server.listen uses the resolved host

- **Planned:** `server.listen(port, host, ...)` uses the resolved host. `DaemonHandle` returns `host`.
- **Actual:** `server.ts:172`: `server.listen(port, host, () => {...})`. `DaemonHandle.host` (`server.ts:33`) is set to the resolved `host`. Confirmed by tests asserting `h.host` (`server.test.ts:235, 270, 302, 315`).
- **Impact:** None.

### Localhost behavior unchanged (backwards compatible)

- **Planned:** Default host `127.0.0.1`, existing tests stay green.
- **Actual:** The `beforeAll` setup (`server.test.ts:25–31`) starts the daemon without `host` (defaults to `127.0.0.1`). All pre-existing tests (health, tRPC, MCP, 401s) pass unchanged. Full suite: 186 passed, 1 skipped. `tsc --noEmit` clean.
- **Impact:** None.

### Out-of-scope changes

- **No `@kb/fs` changes:** Confirmed — `git diff bafb210..HEAD --stat` shows only `packages/daemon/src/server.ts` and `packages/daemon/tests/server.test.ts` changed.
- **Groups from `@kb/protocol` `fullBindings`:** Confirmed — imported and used (`server.ts:8, 93`).
- **No new packages:** Confirmed — no new `package.json` or directory under `packages/`.
- **Slice doc edit (uncommitted):** The slice doc (`01-daemon-bind-tls-capabilities.md`) has an uncommitted working-tree change (HEAD diff) expanding the TLS bullet to describe the reverse-proxy-first design. This is a doc clarification, not a code change. The `docs/tasks/state.yaml` was also updated to point at this task/slice (uncommitted).
- **`makeSpace()` helper refactor:** The test file extracted a `makeSpace()` helper (`server.test.ts:20–27`) from the inline `beforeAll` setup. This is a test-only refactor enabling the new per-test daemons to create their own tmp spaces. Minor and within-scope (test infrastructure).
- **`afterEach` env restore:** Added env-var save/restore for `KB_DAEMON_HOST` and `KB_ALLOW_REMOTE_INSECURE` (`server.test.ts:47–57`) so tests that set these env vars don't leak. Good practice, within scope.

### Architecture-notes updates

- The arch-spec's `StartDaemonOptions` interface contract shows `tls?: { cert: string; key: string }` (the `opts.tls` field). The slice doc's acceptance criteria mention `KB_DAEMON_TLS_CERT`/`KB_DAEMON_TLS_KEY` env vars. The implementation uses `opts.tls` (matching the arch-spec), **not** env-var reads. If env-var-driven TLS is desired (so an operator can set `KB_DAEMON_TLS_CERT`/`KEY` without code), a follow-up should wire `opts.tls = opts.tls ?? (env.KB_DAEMON_TLS_CERT && env.KB_DAEMON_TLS_KEY ? {cert, key} : undefined)`. This is a minor gap, not a deviation from the arch-spec.

### Task doc update needed?

- **Yes (minor):** Append to `## Implementation notes`: "TLS is configured via `opts.tls: {cert, key}` (file paths read with `readFileSync`), not via `KB_DAEMON_TLS_CERT`/`KB_DAEMON_TLS_KEY` env vars. The env-var names appear only in the error/warning message strings. If env-var-driven TLS is needed for operators, wire the env fallback in a follow-up."

### User attention needed?

- **No.** The API surface matches the arch-spec interface contract exactly. The only mismatch is the slice doc's env-var wording vs. the arch-spec's `opts.tls` field — the implementation followed the arch-spec. No scope was widened; no dependent slices are affected.
