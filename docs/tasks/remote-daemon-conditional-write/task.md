---
kind: task
type: feature
slug: remote-daemon-conditional-write
title: Remote-agent daemon access — conditional Write/Read tools when KB_URL is non-localhost
map: agent-knowledge-base
status: ready
blocked_by: []
slices:
  - daemon-bind-tls-capabilities
  - pi-adapter-conditional-write
  - remote-deployment-doc-and-roundtrip
---

## User-visible outcome

An agent (pi or any tRPC client) running on a **different machine** than
the KB daemon can author KB notes through the daemon (since the agent's
native `write`/`edit` cannot reach the bundle on the daemon host's disk).
When the pi adapter detects that `KB_URL` points to a **non-localhost**
daemon, it conditionally activates the daemon's `Write` (and optionally
`Read`/`IndexAdmin`) tools — `kb_put`/`kb_delete` — instead of relying on
pi's native file writes. When `KB_URL` is localhost, the current v1
behavior is unchanged (pi authors with native `write`/`edit`, no
`kb_put`/`kb_delete`).

## User story

As an operator with a remote KB daemon (e.g. on a home server, accessed
from a laptop), I run pi on the laptop pointed at `KB_URL=http://kb.host:3000`;
pi detects the remote daemon and offers `kb_put`/`kb_delete` so I can
create/edit KB notes through the daemon. On the same machine as the
daemon, pi keeps using native `write`/`edit` + `kb_update` (no
`kb_put`/`kb_delete`).

## Scope boundaries

- **In scope**: a daemon **capability advertisement** (so a client can
  ask what the daemon exposes — always `Write` server-side, but the
  client's *surface* depends on transport locality); a **conditional
  `PiAppRouter`/tool set** in the pi adapter keyed on `KB_URL` locality;
  daemon **bind configurability** (`0.0.0.0` or a host, not just
  `127.0.0.1`) behind an opt-in flag; and **TLS / reverse-proxy guidance**
  for remote deployment (the daemon itself stays plain HTTP behind a
  proxy, OR an opt-in TLS mode).
- **Out of scope**: changing the local-localhost pi adapter behavior
  (unchanged); a full authz/RBAC model (the Bearer token remains the
  authn gate; remote adds network exposure but not per-user perms);
  Silverbullet remote hosting (separate concern).
- **Security note (must address)**: v1's Bearer token is "stops another
  local process," **not network security** (per `decide-deployment-and-
  layout`). A remote daemon MUST be behind TLS (a reverse proxy or an
  opt-in daemon TLS mode) + the keyring token. This task documents the
  threat model and makes TLS a hard prerequisite for non-localhost binds
  (the daemon refuses to bind non-localhost without TLS configured, OR
  requires an explicit `KB_ALLOW_REMOTE_INSECURE=1` escape hatch with a
  logged warning).

## Acceptance criteria

- **Daemon**: `startDaemon` accepts a `host` option (default
  `127.0.0.1`; `0.0.0.0` or a hostname for remote). When binding
  non-localhost without TLS, it errors unless `KB_ALLOW_REMOTE_INSECURE=1`
  is set (with a clear warning). A `GET /` health/capabilities endpoint
  (or a tRPC `kb_capabilities` query) advertises which groups the daemon
  exposes (always: `Read`/`Search`/`Write`/`LocalFs`/`IndexAdmin` — the
  daemon has all; the *client* decides what to use based on locality).
- **pi adapter**: `PiAppRouter` is conditional. `isRemoteKb(url) =
  !['127.0.0.1','localhost','::1'].includes(new URL(url).hostname)`.
  - **Local** (`isRemoteKb === false`): current behavior —
    `PiAppRouter = Omit<AppRouter,'write'>`, 8 tools, no `kb_put`/
    `kb_delete` (pi authors with native `write`/`edit`).
  - **Remote** (`isRemoteKb === true`): `PiAppRouter = AppRouter` (full,
    includes `write`), and the adapter registers `kb_put`/`kb_delete`
    (+ optionally `kb_read` if `Read` isn't already exposed — it is in
    the current 8 via `kb_get`; and `kb_index_admin.*` if desired). The
    remote agent authors **through the daemon** (`kb_put`), not native
    file writes.
- **Governance** (from `decide-second-brain-governance`): the
  `generated.by = pi/<version>/<model>` stamping still happens — now via
  the daemon's `Write.put` (which stamps provenance + validates +
  maintains `index.md`/log), which is arguably *more* consistent than
  raw `write`. The "agent may edit anything, git is the safety net" rule
  holds; never self-promotes `draft`→`stable`.
- **Config**: `KB_URL` (the daemon base URL), `KB_TOKEN` (keyring/env),
  `KB_DAEMON_HOST` (bind, default 127.0.0.1), `KB_DAEMON_TLS_CERT`/
  `KB_DAEMON_TLS_KEY` (optional TLS), `KB_ALLOW_REMOTE_INSECURE` (escape
  hatch, default off). No committed secrets.
- **Tests**: local case unchanged (the existing pi-adapter tests). New
  tests: (1) `isRemoteKb('http://127.0.0.1:3000') === false`,
  `isRemoteKb('http://kb.lan:3000') === true`; (2) remote case registers
  `kb_put`/`kb_delete` and a round-trip `kb_put` → `kb_get` works
  against a test daemon; (3) the daemon refuses non-localhost bind
  without TLS unless the escape hatch is set; (4) the capabilities
  endpoint advertises the groups.

## Existing abstractions to use

- The daemon's tRPC `AppRouter` (full, all groups) — already exists; the
  pi adapter just types the client with the full router when remote.
- `@kb/protocol`'s `fullBindings` (all groups, used for the remote
  client's tool registration) vs `piBindings` (omits Write, used locally).
- The pi adapter's existing `createKbTrpcClient` + `registerKbTools` —
  generalize to take a binding set (`piBindings` local, `fullBindings`
  remote) and the matching `PiAppRouter`/`AppRouter` type.
- `decide-second-brain-governance` for the edit-anything / provenance /
  no-self-promotion rules (unchanged; just a different write path).

## Architecture / domain decisions (to settle during this task)

- **Capability advertisement vs. client-side locality check**: simplest
  is client-side (`isRemoteKb(KB_URL)`). A daemon capabilities endpoint
  is more flexible (e.g. a remote daemon that *chooses* to withhold
  Write) but adds a round-trip. Recommend: client-side locality for the
  default, + an optional `kb_capabilities` query for power users.
- **TLS**: reverse proxy (caddy/nginx in front of the daemon) is the
  recommended path (keeps the daemon simple); an opt-in daemon TLS mode
  is a nice-to-have. The daemon MUST refuse non-localhost without one of
  these.
- **`Read`/`IndexAdmin` for remote**: remote pi probably wants `kb_get`
  (already has it) and maybe `kb_build_index`/`kb_rebuild_indexes`. This
  task decides whether remote = full `AppRouter` or a `RemotePiAppRouter`
  subset.

## What downstream work the answer may create

- Graduates the map Fog items "Multi-agent adoption" (a non-pi agent on
  another machine) and the implicit "remote deployment" of the daemon.
- May feed a `kb daemon --remote` deployment guide (systemd + caddy +
  TLS) as a doc.
- Does NOT change the local-localhost v1 contract; backwards compatible.

## Subtasks

| # | Wave | Slice | Size | Repo file |
|---|---|---|---|---|
| 1 | 1 | daemon-bind-tls-capabilities | m | [slices/01-daemon-bind-tls-capabilities.md](slices/01-daemon-bind-tls-capabilities.md) |
| 2 | 2 | pi-adapter-conditional-write | m | [slices/02-pi-adapter-conditional-write.md](slices/02-pi-adapter-conditional-write.md) |
| 3 | 3 | remote-deployment-doc-and-roundtrip | m | [slices/03-remote-deployment-doc-and-roundtrip.md](slices/03-remote-deployment-doc-and-roundtrip.md) |

**Execution waves:**
- Wave 1: S1 (daemon bind/TLS/capabilities)
- Wave 2: S2 (pi-adapter conditional write — needs the remote-bindable daemon)
- Wave 3: S3 (deployment doc + remote round-trip — needs S1 + S2)

No parallelism — a strict chain S1 → S2 → S3 (each wave is one slice).
The cut is vertical: S1 makes the daemon safe to expose; S2 makes the
client adaptive; S3 proves it end-to-end + documents the operator path.
