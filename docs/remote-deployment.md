# Remote Deployment Guide — KB Daemon

This guide covers running the KB daemon on a remote host (accessed from
another machine, e.g. a pi agent running on your laptop talking to a daemon
on a server). It describes the recommended TLS-fronted setup, the secondary
direct-TLS path, the configuration environment, the client-side adapter
behavior, and the security threat model.

> **TL;DR:** Keep the daemon on `127.0.0.1` and put a TLS reverse proxy
> (caddy or nginx) in front of it. Point pi at the proxy URL. The Bearer token
> is **authentication**, not network security — TLS is the network layer.

---

## 1. Recommended path — systemd + caddy/nginx with TLS

The recommended deployment keeps the daemon simple (plain HTTP on loopback)
and puts TLS where it belongs: a reverse proxy on `0.0.0.0:443` with a
certificate from Let's Encrypt. The proxy terminates TLS and forwards to the
localhost daemon.

### Why this path

- The daemon has **no TLS code path** in the common case — it stays a plain
  HTTP listener on `127.0.0.1`.
- Certificate renewal, SNI, and HTTP-to-HTTPS redirects are handled by the
  proxy (caddy does this automatically; nginx needs certbot).
- The network-security layer (TLS) is separated from the application layer
  (the daemon + the Bearer token).

### caddyfile

```
kb.host {
    reverse_proxy 127.0.0.1:30700
}
```

Caddy automatically provisions a Let's Encrypt certificate for `kb.host` and
renews it. No manual cert management.

### systemd unit — the KB daemon

Create `/etc/systemd/system/kb-daemon.service`:

```ini
[Unit]
Description=KB Daemon
After=network.target

[Service]
Type=simple
User=kb
Environment=KB_TOKEN=<your-strong-token>
Environment=KB_HOME=/var/lib/kb
ExecStart=/usr/bin/node /opt/kb/kb.js daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

The daemon binds `127.0.0.1:30700` by default (`KB_DAEMON_HOST` defaults to
`127.0.0.1`). The proxy on `0.0.0.0:443` fronts it. Enable + start:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now kb-daemon
```

### nginx alternative

```nginx
server {
    listen 443 ssl http2;
    server_name kb.host;

    ssl_certificate     /etc/letsencrypt/live/kb.host/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kb.host/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:30700;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Use `certbot --nginx -d kb.host` to provision the certificate.

### Verify the daemon is up

`GET /` on the daemon returns a capabilities JSON (not Bearer-gated):

```sh
curl http://127.0.0.1:30700/
# {"ok":true,"service":"kb-daemon","version":"0.1.0","groups":["read","search","write","localFs","indexAdmin"]}
```

Through the proxy (with TLS):

```sh
curl https://kb.host/
# {"ok":true,"service":"kb-daemon","version":"0.1.0","groups":["read","search","write","localFs","indexAdmin"]}
```

Use this to confirm the daemon is running and to see the available groups
(`read`, `search`, `write`, `localFs`, `indexAdmin`). The `write` group is
present when the daemon is fronted by a proxy — remote clients use it via
`kb_put`/`kb_delete`.

---

## 2. Secondary path — direct daemon TLS (no proxy)

For operators who cannot run a reverse proxy, the daemon can terminate TLS
directly via the `KB_DAEMON_TLS_CERT` and `KB_DAEMON_TLS_KEY` environment
variables (file paths to the certificate and key):

```sh
KB_DAEMON_HOST=0.0.0.0
KB_DAEMON_TLS_CERT=/etc/kb/cert.pem
KB_DAEMON_TLS_KEY=/etc/kb/key.pem
KB_TOKEN=<your-strong-token>
KB_HOME=/var/lib/kb
```

With `KB_DAEMON_TLS_CERT` + `KB_DAEMON_TLS_KEY` set, the daemon starts an
HTTPS server instead of HTTP. You are responsible for provisioning and
renewing the certificate.

### The safety gate

The daemon **refuses** a non-localhost bind (`KB_DAEMON_HOST=0.0.0.0`, a
hostname, or any non-loopback address) unless **either**:

1. TLS is configured (`KB_DAEMON_TLS_CERT` + `KB_DAEMON_TLS_KEY`), **or**
2. The `KB_ALLOW_REMOTE_INSECURE=1` escape hatch is set.

Without one of these, the daemon throws at startup:

```
Refusing to bind non-localhost (0.0.0.0) without TLS. Either:
  (recommended) keep the daemon on 127.0.0.1 and put a TLS reverse proxy (caddy/nginx) on 0.0.0.0, OR
  set KB_DAEMON_TLS_CERT + KB_DAEMON_TLS_KEY for direct TLS, OR
  set KB_ALLOW_REMOTE_INSECURE=1 to bypass (NOT recommended — the token is sniffable).
```

This prevents an accidental insecure remote exposure. The check is a
**string** comparison on the bind host — `0.0.0.0` and a hostname like
`kb.lan` are non-local; a hostname that *resolves* to loopback is still
treated as non-local (safe over-permissive).

### The escape hatch (`KB_ALLOW_REMOTE_INSECURE=1`)

Setting `KB_ALLOW_REMOTE_INSECURE=1` bypasses the safety gate and lets the
daemon bind a non-localhost address without TLS. It is **off by default**
and logs a warning:

```
WARNING: remote daemon without TLS — the Bearer token is sniffable on the network. Use a TLS reverse proxy or KB_DAEMON_TLS_*.
```

Use this only on a trusted private network where you accept the token is
sniffable. Do not use it on the open internet.

---

## 3. Configuration environment

| Variable | Default | Description |
|---|---|---|
| `KB_DAEMON_HOST` | `127.0.0.1` | Bind host. Non-localhost requires TLS or the escape hatch. |
| `KB_DAEMON_TLS_CERT` | (unset) | Path to the TLS certificate file (direct TLS, secondary path). |
| `KB_DAEMON_TLS_KEY` | (unset) | Path to the TLS key file (direct TLS, secondary path). |
| `KB_ALLOW_REMOTE_INSECURE` | (unset) | Escape hatch: allow non-localhost bind without TLS. Off by default; warns when set. |
| `KB_PORT` | `30700` | Port to bind. Use `0` for an ephemeral port (tests). |
| `KB_TOKEN` | (minted) | Bearer auth token. Set explicitly for remote deployments (keyring or env). |
| `KB_HOME` | (env-paths) | The bundle path (the KB's root directory). |

`KB_TOKEN` is the authentication secret. For a remote deployment, set a
strong token (e.g. `openssl rand -hex 32`) in the systemd unit's
`Environment=` or via a keyring-backed env source. Both the daemon and the
client must share the same token.

---

## 4. Client side — pointing pi at the remote daemon

On the client machine (where pi runs), set:

```sh
KB_URL=https://kb.host        # the proxy URL (TLS)
KB_TOKEN=<the-same-token>    # the daemon's KB_TOKEN
```

The pi adapter resolves `KB_URL` at session start and branches:

- **Local** (`isRemoteKb(KB_URL) === false` — a loopback hostname like
  `127.0.0.1`, `localhost`, or `[::1]`): registers the 8 read/search/localFs
  tools (`piBindings`). pi authors with **native `write`/`edit`** + `kb_update`.
- **Remote** (`isRemoteKb(KB_URL) === true` — any non-loopback hostname or
  IP): registers **10 tools** (`fullBindings`, includes the `write` group).
  pi authors with **`kb_put`/`kb_delete`** through the daemon.

The decision is made **once** at session start (not per-call). `isRemoteKb`
is a string check on the URL hostname literal, not a DNS resolution — a
hostname that resolves to loopback is still treated as remote (safe
over-permissive).

### Local vs remote authoring

| | Local | Remote |
|---|---|---|
| **Tools registered** | 8 (no `kb_put`/`kb_delete`) | 10 (incl. `kb_put`/`kb_delete`) |
| **Authoring** | native `write`/`edit` + `kb_update` (reindex) | `kb_put`/`kb_delete` through the daemon |
| **Where the note lands** | the agent's local disk (same as the daemon) | the daemon's bundle (not the agent's disk) |

When the KB is **remote**, native `write`/`edit` would write to the agent's
**local disk**, not the daemon's bundle — the note would never reach the
KB. The adapter steers the agent to `kb_put`/`kb_delete` (the remote tool
set registers them; the skills note it). Use `kb_put` to author, `kb_delete`
to remove, and `kb_get`/`kb_search` to read. `kb_update` (reindex) is not
needed remotely — `kb_put` writes + reindexes in one call through the
daemon's `Write.put`.

---

## 5. Threat model

### The Bearer token is authentication, not network security

- **`KB_TOKEN` is authn**: it stops another local process (or an unauthenticated
  network client) from calling the daemon. It is **not** a network-security
  layer — it is a shared secret sent as a `Bearer` header on every request.
- **TLS is the network layer**: without TLS, the Bearer token is transmitted
  in cleartext and is **sniffable** on the network. Anyone who can observe
  the traffic can capture the token and impersonate the client.
- **Remote = a network-exposed KB**: when the daemon is reachable from
  another machine, every request travels over the network. Protect it with:
  1. **A strong token** (`KB_TOKEN` — high entropy, e.g. `openssl rand -hex 32`).
  2. **TLS** (the reverse proxy with Let's Encrypt, or direct `KB_DAEMON_TLS_*`).
  3. **Ideally a private network / VPN** — restrict access to known clients
     (firewall rules, a VPN, or a private subnet) so the daemon is not
     exposed to the open internet.

### What the safety gate prevents

The non-localhost-TLS safety gate catches the dangerous case: someone sets
`KB_DAEMON_HOST=0.0.0.0` (or a hostname) with no proxy and no TLS. The daemon
refuses to start rather than silently binding an insecure remote listener.
The `KB_ALLOW_REMOTE_INSECURE=1` escape hatch exists for the trusted-private-
network case but warns that the token is sniffable.

### Summary

- Without TLS: the token is sniffable → do not deploy remotely without TLS
  (use the proxy or `KB_DAEMON_TLS_*`).
- Without a strong token: a captured or guessed token grants full KB access.
- On the open internet: use TLS + a strong token + firewall/VPN restrictions.

---

## 6. Governance

The governance rules apply equally to local and remote authoring. When the
KB is remote, the daemon's `Write.put` is the authoring path, and it
enforces:

- **Edit-anything + git** (on the daemon host): any note can be edited —
  human-authored or AI-authored. Git on the daemon host is the undo (`git
  revert` / history is the safety net). Commit often.
- **Never self-promote `draft` → `stable`**: AI-distilled notes start as
  `status: draft`. A human review flips `draft` → `stable` and `unverified`
  → `human-reviewed`. The agent never self-promotes.
- **Deprecate with consent**: the agent may deprecate a note only with
  explicit human consent (ask the user first). Humans can deprecate freely.
- **Provenance is non-negotiable**: every AI-authored note carries
  `generated.by` (the daemon's `Write.put` path stamps/preserves it). The
  note's history shows who authored what; on edit, append provenance — don't
  erase the original author's stamp.

These hold via the remote write path: the daemon's `Write.put` is the
authoring boundary, so provenance is stamped/preserved by the daemon, not
invented by the agent.

---

## 7. Capabilities check

`GET /` on the daemon (or through the proxy) returns a capabilities JSON.
It is **not** Bearer-gated — it's a health/capabilities check, and the
groups list is the same for every daemon (non-sensitive):

```json
{
  "ok": true,
  "service": "kb-daemon",
  "version": "0.1.0",
  "groups": ["read", "search", "write", "localFs", "indexAdmin"]
}
```

Use it to:
- Verify the daemon is up (a `200` with `ok: true`).
- See the available groups (`write` present → `kb_put`/`kb_delete` available
  to remote clients).

The tRPC (`/trpc`) and MCP (`/mcp`) surfaces remain Bearer-gated; only
`GET /` is open.

---

## Quick start (recommended path)

1. **On the server**: install the daemon, set `KB_TOKEN` + `KB_HOME`, run it
   as a systemd service bound to `127.0.0.1:30700`.
2. **On the server**: run caddy (or nginx) on `0.0.0.0:443` with a Let's
   Encrypt cert, reverse-proxying to `127.0.0.1:30700`.
3. **Verify**: `curl https://kb.host/` returns the capabilities JSON.
4. **On the client**: set `KB_URL=https://kb.host` + `KB_TOKEN=<the-same-token>`.
5. **Author**: pi auto-activates `kb_put`/`kb_delete` (non-localhost). Use
   `kb_put` to author, `kb_get`/`kb_search` to read, `kb_delete` to remove.
