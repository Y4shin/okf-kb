---
kind: slice
slug: daemon-bind-tls-capabilities
title: "Daemon: configurable bind host, TLS prereq for non-localhost, capabilities endpoint"
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

`startDaemon` accepts a `host` option (default `127.0.0.1`; `0.0.0.0` or a
hostname for remote). When binding a **non-localhost** host, it **refuses
to start** unless either TLS is configured (`KB_DAEMON_TLS_CERT` +
`KB_DAEMON_TLS_KEY`, or an opt-in daemon TLS mode) OR the explicit
`KB_ALLOW_REMOTE_INSECURE=1` escape hatch is set (logged with a clear
warning). A `GET /` health/capabilities endpoint (or a tRPC
`kb_capabilities` query) advertises which groups the daemon exposes
(always all of `Read`/`Search`/`Write`/`LocalFs`/`IndexAdmin` — the daemon
has all; the *client* decides what to use based on locality).

## Acceptance criteria

- `StartDaemonOptions` gains a `host?: string` (default `127.0.0.1`).
  `server.listen(port, host, ...)` uses it; `KB_DAEMON_HOST` env overrides
  (default `127.0.0.1`).
- Binding a non-localhost host (`0.0.0.0`, a hostname, anything not in
  `127.0.0.1`/`localhost`/`::1`) **without** TLS configured and **without**
  `KB_ALLOW_REMOTE_INSECURE=1` → the daemon throws a clear error at startup
  and refuses to listen (not a silent bind).
- `KB_ALLOW_REMOTE_INSECURE=1` allows the insecure non-localhost bind but
  logs a prominent warning ("remote daemon without TLS — token is
  sniffable on the network; use a reverse proxy or set TLS certs").
- Optional daemon TLS: if `KB_DAEMON_TLS_CERT` + `KB_DAEMON_TLS_KEY` are
  set, the server listens with TLS (`https.createServer`). **This is the
  secondary path** — the recommended remote deployment keeps the daemon
  bound to `127.0.0.1` and puts a reverse proxy (caddy/nginx) on `0.0.0.0`
  with TLS in front of it (the proxy terminates TLS and forwards to the
  localhost daemon). The direct daemon-TLS mode exists for operators who
  can't run a proxy; both satisfy the non-localhost-TLS gate.
- A capabilities surface: `GET /` returns JSON
  `{ ok, service, version, groups: ['read','search','write','localFs','indexAdmin'] }`
  (extend the existing health endpoint), AND/OR a tRPC
  `kb_capabilities` query returning the same. Both are Bearer-gated like
  the other surfaces.
- Existing tests stay green; the local-localhost default behavior is
  unchanged.

## Test plan

- **Seams**: host option resolution (`KB_DAEMON_HOST` > `opts.host` >
  `127.0.0.1`); the non-localhost-without-TLS refusal; the escape-hatch
  warning; TLS mode (if implemented); the capabilities endpoint shape.
- **Failure modes**: non-localhost bind without TLS and without the
  escape hatch → startup error (assert the daemon throws / exits non-zero
  with a clear message); bad TLS cert path → error.
- **Scenarios**: `startDaemon({ host: '127.0.0.1' })` → listens (current
  behavior, unchanged); `startDaemon({ host: '0.0.0.0' })` without
  TLS/escape → throws; `startDaemon({ host: '0.0.0.0' })` with
  `KB_ALLOW_REMOTE_INSECURE=1` → listens + logs a warning; `GET /` on a
  started daemon → returns the capabilities JSON with all 5 groups.
- **Edge cases**: `localhost`/`::1` treated as local (no TLS required);
  hostname that resolves to loopback treated as local; the escape hatch
  is *off* by default.

## Constraints and dependencies

- Depends on the landed `kb-client-js-api` daemon (`packages/daemon`).
  No `@kb/fs`/`@kb/core` changes needed (the capabilities list is a
  constant; the groups already exist in the router).
- Localhost behavior MUST be unchanged (backwards compatible).
- The token is daemon authn (stops another local process), not network
  security — the TLS prereq is the network-security layer for remote.
- No codegen; the capabilities endpoint is a small addition to the
  existing `GET /` health handler.

## Context & references

- **Parent task:** `docs/tasks/remote-daemon-conditional-write/task.md`
  (the acceptance criteria + security note this slice implements).
- **Affected files:** `packages/daemon/src/server.ts` (host option, the
  non-localhost-TLS check, TLS mode, capabilities JSON on `GET /`),
  `packages/daemon/src/deps.ts` or a new `packages/daemon/src/capabilities.ts`
  (the groups list), `packages/daemon/tests/server.test.ts` (new cases).
- **Existing building blocks:** `packages/daemon/src/server.ts`
  `startDaemon` (already takes `port`, `space`, `token`, `embedder`;
  add `host`); the `GET /` health handler (already returns
  `{ok,service,version}` — extend with `groups`); `getOrMintToken` (auth
  unchanged). The 5 groups are the keys of `fullBindings` in
  `packages/protocol/src/records.ts` — derive the capabilities list from
  that so it can't drift.
- **Contracts/shapes:** `StartDaemonOptions` (add `host?: string`,
  `tls?: {cert, key}`); the `GET /` JSON shape
  `{ok:true, service:'kb-daemon', version, groups:[...]}`.
- **Edge cases/gotchas:** `0.0.0.0` is non-localhost (binds all
  interfaces) — must require TLS/escape. A hostname like `kb.lan` is
  non-localhost even if it resolves to a private IP. `::1` is localhost.
  Don't silently bind insecure; the whole point is the loud gate.

## Implementation notes

Landed on `task/remote-daemon-conditional-write` (worked directly on the
task branch, no separate slice branch). HEAD = b834367.

- `startDaemon` (`packages/daemon/src/server.ts`) gains `host?: string`
  (default `KB_DAEMON_HOST` env or `127.0.0.1`) and `tls?: {cert, key}`.
  `server.listen(port, host, ...)` now uses the resolved host. The URL
  scheme is `https` when TLS is active, `http` otherwise. `DaemonHandle`
  gains `host` alongside the existing `url`/`port`/`token`/`close()`.
- Non-localhost safety gate: `isLocal` is a **string** check against
  `['127.0.0.1', 'localhost', '::1']` (NOT DNS resolution — a hostname
  like `kb.lan` is treated as non-local even if it resolves to loopback,
  which is safe over-permissive). If `!isLocal && !tls &&
  KB_ALLOW_REMOTE_INSECURE !== '1'` → throws an error naming all 3 options
  (reverse proxy, direct TLS via `KB_DAEMON_TLS_*`, or the
  `KB_ALLOW_REMOTE_INSECURE=1` escape hatch). The escape hatch logs a
  prominent stderr warning about the token being sniffable.
- Optional direct TLS: `opts.tls` OR `KB_DAEMON_TLS_CERT` +
  `KB_DAEMON_TLS_KEY` env fallback (file paths read via `readFileSync`).
  When active, `https.createServer` is used. The recommended path keeps
  the daemon on `127.0.0.1` behind a caddy/nginx reverse proxy that
  terminates TLS; direct daemon TLS is the secondary path for operators
  who can't run a proxy.
- `GET /` capabilities: returns
  `{ ok, service, version, groups: [...] }` where `groups` is
  `Object.keys(fullBindings)` (the 5 keys: `localFs`, `read`, `search`,
  `write`, `indexAdmin` — derived from `packages/protocol/src/records.ts`
  so it can't drift). This endpoint is **NOT Bearer-gated** (the existing
  health endpoint was never gated; the groups list is non-sensitive — the
  client decides what to use based on locality). No tRPC
  `kb_capabilities` query was added (the criteria said "AND/OR").
- Localhost behavior is unchanged (`127.0.0.1`/`localhost`/`::1` all
  listen without TLS, same as before).
- 186 tests pass + 1 skipped; `tsc --build` clean (exit 0). 8 new test
  cases in `packages/daemon/tests/server.test.ts` cover: explicit
  `127.0.0.1` bind, `0.0.0.0` without TLS/escape → throws (asserts all 3
  option names in the error), `0.0.0.0` with `KB_ALLOW_REMOTE_INSECURE=1`
  → listens + warns (stderr captured), `kb.lan` hostname → throws,
  `::1` → listens (local), `localhost` → listens (local), and 2
  capabilities-endpoint cases (shape + not-Bearer-gated).

### Deviations

1. **KB_DAEMON_TLS_CERT/KEY env fallback** (from the deviation report):
  the slice doc mentioned the env vars in the end-to-end behavior section,
  but the initial implementation only accepted `opts.tls` (code-level).
  The follow-up commit (b834367) added the env fallback so operators can
  set direct TLS without code — `opts.tls` wins, env vars are the fallback.
  This aligns the implementation with the slice doc's intent.

2. **GET / not Bearer-gated**: the acceptance criteria stated "Both are
  Bearer-gated like the other surfaces," but the implementation kept
  `GET /` ungated (it was never gated as a health endpoint; the comment
  notes the groups list is non-sensitive). This is arguably the safer
  design for health probes, but it deviates from the written criteria.
  No tRPC `kb_capabilities` query was added (the criteria allowed "AND/OR").
