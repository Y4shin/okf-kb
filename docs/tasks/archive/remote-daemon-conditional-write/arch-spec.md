# Architecture spec — `remote-daemon-conditional-write`

> Shared across the 3 slice chains. The slices are already cut
> (`docs/tasks/remote-daemon-conditional-write/slices/01–03-*.md`); this
> spec fixes the cross-cutting design so each slice's TDD chain builds
> against a consistent contract. Consumes the landed
> `kb-client-js-api` daemon + `pi-adapter-skill-and-tools` adapter.

## The key design decision (reverse-proxy-first)

Remote deployment is **daemon on `127.0.0.1` + a reverse proxy
(caddy/nginx) on `0.0.0.0` with TLS** in front of it. The proxy
terminates TLS and forwards to the localhost daemon. This keeps the
daemon simple (plain HTTP, no TLS code path in the common case) and
puts the network-security layer where it belongs (the proxy, with
Let's Encrypt, SNI, etc.).

The daemon's own TLS mode (`KB_DAEMON_TLS_CERT` + `KB_DAEMON_TLS_KEY`)
is the **secondary path** — for operators who can't run a proxy. The
load-bearing safety gate is: **the daemon refuses a *direct*
non-localhost bind without TLS configured** (or the explicit
`KB_ALLOW_REMOTE_INSECURE=1` escape hatch with a logged warning). This
catches the dangerous case (someone sets `KB_DAEMON_HOST=0.0.0.0` with
no proxy + no TLS) without burdening the recommended path (localhost
daemon + proxy).

## Daemon (slice 1)

### `StartDaemonOptions` additions

```ts
export interface StartDaemonOptions extends BuildDepsOptions {
  port?: number;          // existing (default KB_PORT env or 30700)
  space?: string;         // existing
  token?: string;         // existing
  embedder?: Embedder;    // existing
  /** Bind host. Default KB_DAEMON_HOST env or '127.0.0.1'. */
  host?: string;
  /** Opt-in direct TLS (secondary path; the recommended path is a reverse proxy). */
  tls?: { cert: string; key: string };  // file paths
}
```

### The non-localhost safety gate (in `startDaemon`, before `listen`)

```
host = opts.host ?? process.env.KB_DAEMON_HOST ?? '127.0.0.1'
isLocal = ['127.0.0.1','localhost','::1'].includes(host)  // string check (NOT DNS resolution)
if (!isLocal && !opts.tls && process.env.KB_ALLOW_REMOTE_INSECURE !== '1') {
  throw new Error(
    'Refusing to bind non-localhost ('+host+') without TLS. Either:\n'+
    '  (recommended) keep the daemon on 127.0.0.1 and put a TLS reverse proxy (caddy/nginx) on 0.0.0.0, OR\n'+
    '  set KB_DAEMON_TLS_CERT + KB_DAEMON_TLS_KEY for direct TLS, OR\n'+
    '  set KB_ALLOW_REMOTE_INSECURE=1 to bypass (NOT recommended — the token is sniffable).'
  );
}
if (!isLocal && !opts.tls && process.env.KB_ALLOW_REMOTE_INSECURE === '1') {
  process.stderr.write('WARNING: remote daemon without TLS — the Bearer token is sniffable on the network. Use a TLS reverse proxy or KB_DAEMON_TLS_*.\n');
}
```

Note: `isLocal` is a **string** check on the bind host, not a DNS
resolution — `0.0.0.0` and a hostname like `kb.lan` are non-local; a
hostname that *resolves* to loopback is still treated as non-local
(safe over-permissive). `::1` is local.

### TLS mode (secondary)

If `opts.tls` is set, use `https.createServer({cert, key}, handler)`
instead of `http.createServer`. Read the cert/key files (or accept
paths + `readFileSync`). Keep it minimal — the proxy is the
recommended path.

### Capabilities endpoint

Extend the existing `GET /` health handler to return:
```json
{"ok":true,"service":"kb-daemon","version":"0.1.0",
 "groups":["read","search","write","localFs","indexAdmin"]}
```
Derive `groups` from the keys of `fullBindings` (`@kb/protocol`) so it
can't drift. `GET /` is NOT Bearer-gated (it's a health/capabilities
check; the groups list is not sensitive — it's the same for every
daemon). The tRPC/MCP surfaces remain Bearer-gated.

(Optionally also a tRPC `kb_capabilities` query returning the same —
but `GET /` is sufficient for v1; skip the tRPC procedure unless a
client needs it over the wire.)

## pi adapter (slice 2)

### `isRemoteKb(url: string): boolean`

```ts
export function isRemoteKb(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return !['127.0.0.1','localhost','::1'].includes(h);
  } catch {
    return false; // malformed URL -> treat as local (don't activate Write on a parse error)
  }
}
```
Exported from `extension/src/config.ts` (next to `resolveKbConfig`).

### Conditional client + tools

At `session_start`, the adapter resolves `KB_URL` then branches:
- **Local** (`isRemoteKb(KB_URL) === false`): `createKbTrpcClient<PiAppRouter>(url, token)` + `registerKbTools(pi, client, piBindings)` — the **current** 8 tools, no `kb_put`/`kb_delete`. Unchanged.
- **Remote** (`isRemoteKb(KB_URL) === true`): `createKbTrpcClient<AppRouter>(url, token)` + `registerKbTools(pi, client, fullBindings)` — 10 tools incl. `kb_put`/`kb_delete`.

The decision is made **once** at `session_start` (not per-call).

### `registerKbTools` generalization

`registerKbTools(pi, client, bindings)` currently iterates the hand-written `TOOL_SPECS` validated against `piBindings`. Generalize: add `kb_put`/`kb_delete` specs (typebox `{ref, content}` / `{ref}`) to `TOOL_SPECS`, and filter `TOOL_SPECS` by whether the method's group is present in the passed `bindings` (local = `piBindings` omits `write` → `kb_put`/`kb_delete` filtered out; remote = `fullBindings` includes `write` → they're registered). The `piBindings`/`fullBindings` validation gate stays.

`tRPC client type`: `createKbTrpcClient` is generic — `createKbTrpcClient<R>(url, token)` with `R = PiAppRouter | AppRouter`. The local call site uses `PiAppRouter`, the remote uses `AppRouter`.

## Deployment doc + round-trip (slice 3)

### `docs/remote-deployment.md`

- **Recommended**: daemon as a systemd service bound to `127.0.0.1`, caddy (or nginx) on `0.0.0.0:443` with TLS (Let's Encrypt) reverse-proxying to `127.0.0.1:30700`. A caddyfile snippet + a systemd unit snippet.
- **Secondary**: direct daemon TLS (`KB_DAEMON_TLS_CERT`/`KEY`) for no-proxy operators.
- **Config env**: `KB_DAEMON_HOST`, `KB_DAEMON_TLS_*`, `KB_ALLOW_REMOTE_INSECURE`, `KB_PORT`, `KB_TOKEN` (keyring/env).
- **Client side**: point pi at `KB_URL=https://kb.host` (the proxy) + `KB_TOKEN`; the adapter auto-activates `kb_put`/`kb_delete` (non-localhost).
- **Threat model**: the Bearer token is authn (stops another local process), not network security; TLS is the network layer; without TLS the token is sniffable; remote = a network-exposed KB → strong token + TLS + ideally a private network/VPN.
- **Local-vs-remote behavior**: local = native write/edit + `kb_update`; remote = `kb_put`/`kb_delete` through the daemon (native write/edit would write to the *agent's* disk, not the daemon's — the skills steer to `kb_put` when remote).
- **Governance**: edit-anything + git (on the daemon host); never self-promote `draft`→`stable`; deprecate with consent; provenance non-negotiable (the daemon stamps it).

### Skill notes (one line each)

`kb-curate`/`kb-save-session`/`kb-research` (and `kb-ask` doesn't author): add a note — "When the KB is remote (`isRemoteKb`), author with `kb_put`/`kb_delete`, not native `write`/`edit` (native writes go to your local disk, not the daemon's bundle)."

### Round-trip test

`packages/pi-adapter/tests/remote-roundtrip.test.ts`: with a test daemon on loopback + `KB_URL` set to a non-loopback *string* (e.g. `http://kb.test:30700`) to trigger the remote branch (the request still goes to loopback via a hosts-file override OR a test client that ignores the URL hostname — simplest: point `KB_URL` at the loopback daemon's URL but override `isRemoteKb` to true via a test seam), `kb_put({ref:'concept:remote-test', content})` → `kb_get({ref})` returns the note with `generated.by` set + `status: draft`; `kb_check_id` passes; the note file exists on the daemon's bundle path.

## Cross-cutting

- **Backwards compatible**: the local-localhost contract is unchanged (the default host is `127.0.0.1`; the default `KB_URL` is `http://127.0.0.1:30700`; `isRemoteKb` is false; the 8-tool behavior). Existing tests stay green.
- **No new packages**: daemon + protocol + adapter changes only.
- **`GET /` not Bearer-gated** (health/capabilities); the groups list is non-sensitive. tRPC + MCP stay Bearer-gated.
- **The safety gate is a startup error**, not a silent bind — the whole point is to prevent an insecure remote exposure by accident.
- **The skills' "author with native write/edit" instruction** implicitly doesn't apply when remote (those tools aren't registered remotely; `kb_put`/`kb_delete` are). Slice 3 makes it explicit in a one-line skill note.
