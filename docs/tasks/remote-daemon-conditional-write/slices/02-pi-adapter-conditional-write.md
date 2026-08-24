---
kind: slice
slug: pi-adapter-conditional-write
title: "pi adapter: conditional PiAppRouter + kb_put/kb_delete when KB_URL is non-localhost"
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [daemon-bind-tls-capabilities]
---

## End-to-end behavior

The pi adapter detects whether `KB_URL` points to a **non-localhost**
daemon and conditionally activates the daemon's `Write` tools. When
remote, the tRPC client is typed with the **full `AppRouter`** (includes
`write`) and the adapter registers `kb_put`/`kb_delete` (the agent
authors **through the daemon**, since its native `write`/`edit` can't
reach the remote bundle). When local, the current behavior is unchanged
(`PiAppRouter` omits `write`; 8 tools; no `kb_put`/`kb_delete`; pi authors
with native `write`/`edit` + `kb_update`).

## Acceptance criteria

- `isRemoteKb(url: string): boolean` —
  `!['127.0.0.1','localhost','::1'].includes(new URL(url).hostname)`.
  Exported from the adapter (and unit-tested).
- The adapter's tRPC client type is conditional:
  - **Local** (`isRemoteKb(KB_URL) === false`): `createTRPCProxyClient<
    PiAppRouter>` (the existing pi-shaped router that omits `write`);
    `registerKbTools` uses `piBindings`; the 8 tools, NO `kb_put`/
    `kb_delete`. (Current behavior — unchanged.)
  - **Remote** (`isRemoteKb(KB_URL) === true`): `createTRPCProxyClient<
    AppRouter>` (the full router); `registerKbTools` uses `fullBindings`
    (all groups, including `write`); registers `kb_put` + `kb_delete` (+
    the existing 8, so 10 tools). The remote agent authors via `kb_put`,
    not native file writes.
- `kb_put({ref, content})` → `write.put` (the daemon stamps provenance +
  validates + maintains `index.md`/log + reindexes); `kb_delete({ref})` →
  `write.delete`. Both are mutations (tRPC `.mutate`), throw-on-failure
  (per the pi tool contract, matching the existing tools).
- The tool registration loop generalizes to take a binding set
  (`piBindings` local, `fullBindings` remote) — the `GroupBindings`
  exhaustiveness gate still holds (a new daemon method → both records
  fail `tsc` until bound or `EXCLUDED`).
- Config: `KB_URL` (default `http://127.0.0.1:30700` — local) drives the
  local/remote switch. `KB_TOKEN` (env > keyring) is sent as Bearer in
  both cases. No committed secrets.
- Existing local-case tests stay green (the 8-tool local behavior is
  unchanged).

## Test plan

- **Seams**: `isRemoteKb` (localhost vs. hostname vs. IP vs. `0.0.0.0`);
  the conditional client type + binding set; `kb_put`/`kb_delete`
  registration only when remote; the round-trip.
- **Failure modes**: `isRemoteKb` on a malformed URL; remote daemon 401
  (bad token) → `kb_put` throws; remote daemon unreachable → `kb_put`
  throws with the clear message (the existing error mapping).
- **Scenarios**: local (`KB_URL=http://127.0.0.1:30700`) → exactly 8
  tools, no `kb_put`/`kb_delete` (existing test still passes); remote
  (`KB_URL=http://kb.lan:30700` or a non-loopback test address) → 10
  tools incl. `kb_put`/`kb_delete`; remote `kb_put({ref:'concept:x',
  content})` against a test daemon → `kb_get({ref:'concept:x'})` returns
  the note (round-trip); `kb_delete` removes it.
- **Edge cases**: `KB_URL` with a hostname that resolves to loopback
  (`isRemoteKb` checks the *string* hostname, not the resolution —
  `localhost` is local, `127.0.0.1` is local, `0.0.0.0` is... decide:
  treat `0.0.0.0` as remote since it's not a loopback literal — document
  the rule); `KB_URL` unset → local default.

## Constraints and dependencies

- Depends on slice 1 (the daemon must be able to bind non-localhost +
  advertise capabilities, though this slice's tests can use a
  loopback-bound test daemon with a non-loopback `KB_URL` string to
  exercise the remote branch without real network — `isRemoteKb` is a
  string check, so the test doesn't need a real remote daemon).
- No `@kb/fs` in the adapter (still a daemon client). No new search
  engines. `kb_put`/`kb_delete` are the daemon's `Write` over tRPC.
- Local behavior MUST be unchanged (backwards compatible).
- The `fullBindings` (all groups) already exists in `@kb/protocol` —
  use it for the remote case; don't define a new record.

## Context & references

- **Parent task:** `docs/tasks/remote-daemon-conditional-write/task.md`
  (the pi-adapter acceptance criteria + governance note).
- **Affected files:** `packages/pi-adapter/extension/src/client.ts`
  (`isRemoteKb`, conditional `PiAppRouter` vs `AppRouter` client type —
  likely two client builders or a generic one parametrized by the router
  type), `packages/pi-adapter/extension/src/tools.ts` (`registerKbTools`
  takes a binding set; add `kb_put`/`kb_delete` specs; the
  `kb_put`/`kb_delete` typebox schemas), `packages/pi-adapter/extension/src/config.ts`
  (`isRemoteKb` helper + the existing `resolveKbConfig`),
  `packages/pi-adapter/tests/tools.test.ts` (local case unchanged; new
  remote-case test).
- **Existing building blocks:** `@kb/protocol`'s `AppRouter` (full) +
  `PiAppRouter` (omits write) + `fullBindings` + `piBindings` +
  `flattenBindings`; the existing `createKbTrpcClient` + `registerKbTools`
  (generalize both); the existing `TOOL_SPECS` array + `piBindings`
  validation gate (extend for the remote `fullBindings` case).
- **Contracts/shapes:** `isRemoteKb(url): boolean`; the typebox schemas
  for `kb_put` (`{ref: string, content: string}`) and `kb_delete`
  (`{ref: string}`) — mirror the Zod `PutInputSchema`/`DeleteInputSchema`.
  `kb_put`/`kb_delete` are mutations (`.mutate`), throw-on-failure.
- **Edge cases/gotchas:** the local/remote decision is made **once** at
  extension load (`session_start`) from `KB_URL` — don't re-check per
  call. The `fullBindings` loop must skip `EXCLUDED` entries (it already
  does). `0.0.0.0` in `KB_URL` is ambiguous — treat as remote (not a
  loopback literal) and document it.
