# Setup Guide — Local KB (Silverbullet + KB daemon as systemd user services)

This guide sets up the agent-maintained knowledge base on a **single
machine** (a Linux desktop/server you control) so that:

- **Silverbullet** serves the global KB (`$KB_HOME`) as its space — you
  browse/search the same notes the agent reads and writes, in the SB UI.
- The **KB daemon** owns the index/embedder and serves the tRPC + MCP
  surfaces to the pi adapter (the `kb_*` tools) and any MCP client.
- Both run continuously as **systemd user services** (no root; start on
  login / on boot; `systemctl --user` restart-on-failure).

Everything is local (loopback only, no TLS needed — the daemon binds
`127.0.0.1`, SB binds `127.0.0.1:3000`). For exposing the daemon to
*other* machines, see [`remote-deployment.md`](remote-deployment.md)
(TLS reverse proxy + the non-localhost safety gate).

> **TL;DR:** clone the repo → `npm install && npm run build` → create
> `$KB_HOME` (or reuse the existing one) → install two `systemctl --user`
> units (one for the SB Docker container, one for the `kb daemon` Node
> process) → `npm run install:pi` → done. The agent and the human both
> see the same KB.

---

## 0. Prerequisites

- **Linux** with systemd (user services). (macOS/Windows: use launchd /
  a startup script instead of `systemctl --user` — the unit files are a
  template.)
- **Node** v24+ and **npm** v11+.
- **Docker** (for Silverbullet). Rootless Docker or Podman work too;
  the unit just needs to start a container.
- **pi** installed (`pi --version`).
- The KB daemon **default port** is `30700`; SB defaults to `3000`. They
  don't collide. (If something else uses 3000, pick a different SB port.)

## 1. Clone + build the monorepo

```sh
git clone git@github.com:Y4shin/okf-kb.git
cd okf-kb
npm install          # workspace deps (zod, @trpc/*, better-sqlite3, @xenova/transformers, commander, ...)
npm run build        # tsc --build across packages → dist/ (the daemon + CLI run from dist)
```

Note the repo path (e.g. `/home/you/Projects/okf-kb`) — the
systemd units reference it.

## 2. Create (or reuse) the global KB at `$KB_HOME`

The global KB is a standalone, git-versioned OKF v0.2 bundle. Default
location: `~/.local/share/kb` (XDG data dir; overridable via `KB_HOME`).

```sh
export KB_HOME="${KB_HOME:-$HOME/.local/share/kb}"
mkdir -p "$KB_HOME"/{glossary,concepts,decisions,reference,generic,log}
cd "$KB_HOME"
git init -q   # standalone history (recommended; OKF §3)
```

Create the manifest + root files (one-time). A minimal `manifest.yaml`
(the data-driven spine — drives type→dir routing, the predicate vocab,
and the `check` integrity rules):

```yaml
# ~/.local/share/kb/manifest.yaml
bundle:
  name: my-kb
  okf_version: v0.2
types:
  term:       { dir: glossary,  question: "What is X?",      id_prefix: term }
  concept:    { dir: concepts,  question: "How does X work?", id_prefix: concept }
  decision:   { dir: decisions, question: "Why X over Y?",    id_prefix: decision }
  reference:  { dir: reference, question: "What's the spec?", id_prefix: reference }
  generic:    { dir: generic,   question: "(untyped — promote when a cluster forms)", id_prefix: generic }
predicates: [defines, uses, depends_on, part_of, decided_in, constrains, supersedes, derived_from]
conventions:
  - "id: type:slug stable identity (path-independent)."
  - "Every typed relation also has a normal markdown link in prose."
  - "Standard markdown links (relative /path.md), NOT wikilinks."
  - "AI notes: generated.by = pi/<version>/<model>; verified left unset until human review."
integrity_checks:
  okf: [A1, A2, A3, A4, A5, A7]
  bundle: [B1, B2, B3, B4, B5, B7, B8]
```

```sh
# root index.md (carries okf_version)
cat > index.md <<'EOF'
---
okf_version: v0.2
title: my-kb
status: stable
---
# my-kb
EOF
# thin root log.md (the JS API maintains it on writes)
cat > log.md <<'EOF'
---
okf_version: v0.2
---
# Log
EOF
git add -A && git -c user.email=kb@local -c user.name=kb commit -qm "chore: initialize KB"
```

> **Reuse:** if `~/.local/share/kb` already exists (e.g. from a prior
> setup), skip this step — the manifest + dirs are already there.

## 3. Silverbullet — systemd user service (Docker)

SB runs in Docker, bind-mounting `$KB_HOME` as its space folder. The
unit starts the container on login and restarts it on failure.

### 3a. The container (run once by hand to confirm)

```sh
docker run -d --name kb-sb \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v "$HOME/.local/share/kb:/space" \
  -e SB_FS_WATCH=auto \
  zefhemel/silverbullet:latest -- /space
```

- `-p 127.0.0.1:3000:3000` — loopback only (local; no TLS needed).
- `-e SB_FS_WATCH=auto` — the server watches the space folder natively,
  so files the daemon/agent write to disk appear in the open SB client
  without a client save (research-confirmed; verified in the stand-up
  task).
- Space = `$KB_HOME`. The bundle *is* the SB space.

Verify: open `http://localhost:3000` → the SB UI loads, showing
`index.md` / `manifest.yaml` / the typed dirs.

### 3b. The systemd user unit

`systemd --user` runs as *you* (no root). Create the unit:

```sh
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/kb-silverbullet.service <<EOF
[Unit]
Description=Silverbullet (KB space, Docker)
After=docker.service
Requires=docker.service

[Service]
Type=exec
ExecStart=/usr/bin/docker run --rm --name kb-sb \\
  -p 127.0.0.1:3000:3000 \\
  -v $HOME/.local/share/kb:/space \\
  -e SB_FS_WATCH=auto \\
  zefhemel/silverbullet:latest -- /space
ExecStop=/usr/bin/docker stop kb-sb
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
```

> **Podman/rootless Docker:** replace `/usr/bin/docker` with your
> `podman` or rootless-docker binary. For podman, drop `--restart
> unless-stopped` (systemd owns restart) and use `ExecStart=/usr/bin/podman
> run --rm ...`.

### 3c. Enable lingering + start

```sh
# so your user services run at boot (not just when you log in)
loginctl enable-linger $USER

systemctl --user daemon-reload
systemctl --user enable --now kb-silverbullet.service
systemctl --user status kb-silverbullet.service   # should be active (running)
curl -fsS http://localhost:3000/.ping && echo   # → "OK"
```

## 4. KB daemon — systemd user service (Node)

The daemon owns the sqlite-vec/FTS5 index (`.kb/index.db`), the
transformers.js embedder, and the single `Kb` instance; serves `/trpc`
(pi adapter + CLI) and `/mcp` (MCP clients) on `127.0.0.1:30700` with
Bearer auth.

### 4a. The daemon binary + a shared token

The CLI binary is `packages/cli/bin/kb.js` (runs the built `dist/`). It
needs a stable Bearer token — mint one and store it in a systemd
environment file (NOT committed to the repo):

```sh
umask 077
KB_TOKEN="$(openssl rand -hex 32)"
mkdir -p ~/.config/kb
cat > ~/.config/kb/daemon.env <<EOF
KB_HOME=$HOME/.local/share/kb
KB_PORT=30700
KB_DAEMON_HOST=127.0.0.1
KB_TOKEN=$KB_TOKEN
EOF
chmod 600 ~/.config/kb/daemon.env
echo "wrote ~/.config/kb/daemon.env (token: ${KB_TOKEN:0:8}…)"
```

### 4b. The systemd user unit

```sh
REPO="$HOME/Projects/okf-kb"   # ← adjust to your clone path
cat > ~/.config/systemd/user/kb-daemon.service <<EOF
[Unit]
Description=KB daemon (tRPC + MCP, the agent-agnostic KB surface)
After=kb-silverbullet.service
Wants=kb-silverbullet.service

[Service]
Type=exec
EnvironmentFile=%h/.config/kb/daemon.env
WorkingDirectory=$REPO
ExecStart=$(which node) $REPO/packages/cli/bin/kb.js daemon
Restart=on-failure
RestartSec=5
# the transformers.js model cache + the .kb/index.db live in the bundle's .kb/

[Install]
WantedBy=default.target
EOF
```

- `EnvironmentFile` loads `KB_HOME`/`KB_PORT`/`KB_DAEMON_HOST`/`KB_TOKEN`
  (kept out of the unit + the repo).
- `ExecStart` runs the daemon; it defaults to `127.0.0.1:30700` (loopback
  only — no TLS gate trips for localhost).
- `WorkingDirectory` = the repo (so workspace `node_modules` resolve).

### 4c. Start + verify

```sh
systemctl --user daemon-reload
systemctl --user enable --now kb-daemon.service
systemctl --user status kb-daemon.service   # active (running); "kb daemon listening on http://127.0.0.1:30700"
journalctl --user -u kb-daemon.service -n 20 # the listen line + any errors

# capabilities (NOT Bearer-gated — health/caps check):
curl -fsS http://127.0.0.1:30700/ | head
# → {"ok":true,"service":"kb-daemon","version":"0.1.0","groups":["localFs","read","search","write","indexAdmin"]}

# tRPC needs the token:
curl -fsS -H "Authorization: Bearer $(grep ^KB_TOKEN ~/.config/kb/daemon.env | cut -d= -f2)" \
  -X POST -H "Content-Type: application/json" \
  "http://127.0.0.1:30700/trpc/indexAdmin.check" -d '{}' | head
```

### 4d. The CLI (optional smoke test)

```sh
export KB_URL=http://127.0.0.1:30700
export KB_TOKEN="$(grep ^KB_TOKEN ~/.config/kb/daemon.env | cut -d= -f2)"
node $REPO/packages/cli/bin/kb.js index-admin.check    # bundle integrity (B7 flags orphaned glossary terms)
node $REPO/packages/cli/bin/kb.js read.list --type concept
```

## 5. Install the pi adapter (extension + skills)

The pi adapter is a tRPC client of the daemon + the `kb-ask`/`kb-curate`/
`kb-save-session`/`kb-research` skills. `install:pi` symlinks them into
`~/.pi/agent/`:

```sh
cd "$REPO"
npm run install:pi --workspace @kb/pi-adapter
# → linked ~/.pi/agent/extensions/pi-kb → .../packages/pi-adapter/extension
# → linked ~/.pi/agent/skills/kb-ask (and kb-curate, kb-save-session, kb-research)
```

Then point pi at the daemon (the adapter reads these at session start):

```sh
# add to your shell rc (~/.bashrc / ~/.zshrc) OR a pi env:
export KB_URL=http://127.0.0.1:30700
export KB_TOKEN="$(grep ^KB_TOKEN ~/.config/kb/daemon.env | cut -d= -f2)"
```

Because `KB_URL` is loopback, `isRemoteKb` is false → the local 8-tool
set (no `kb_put`/`kb_delete`); pi authors notes with its native
`write`/`edit` + `kb_update` to reindex, and `kb-ask` answers from the
KB with citations. (Remote → `kb_put`/`kb_delete`; see
`remote-deployment.md`.)

Start pi in any project and confirm the tools loaded:

```sh
pi -p "list the kb_* tools you have"   # or just start pi and ask
```

## 6. Day-to-day

- **Browse/search the KB** as a human: `http://localhost:3000` (SB UI).
  Files the agent/daemon write to disk appear in the open client
  (`SB_FS_WATCH=auto`).
- **Ask the KB**: in pi, `/skill:kb-ask how does X work?` → a cited,
  grounded answer (or "I don't know").
- **Curate**: `/skill:kb-save-session` (distill this session into KB
  notes) or `/skill:kb-research <topic>` (research into KB notes).
- **The daemon stays fresh**: on any write, `kb_update` reindexes the
  one note; `kb index-admin.check` runs the integrity rules (B7 flags
  orphaned glossary terms). Rebuild the full index with
  `kb index-admin.rebuild-indexes` if the index is lost.

## 7. Managing the services

```sh
systemctl --user status kb-silverbullet.service kb-daemon.service
systemctl --user restart kb-daemon.service          # after a repo update (git pull + npm run build)
systemctl --user stop kb-silverbullet.service kb-daemon.service
journalctl --user -u kb-daemon.service -f           # tail logs
journalctl --user -u kb-silverbullet.service -f
loginctl enable-linger $USER                        # so they run at boot (one-time)
```

**After a repo update** (you `git pull` + `npm run build`): restart the
daemon so it picks up the new dist: `systemctl --user restart
kb-daemon.service`. The SB container doesn't need a restart unless you
pulled a new SB image (`docker pull zefhemel/silverbullet:latest` then
`systemctl --user restart kb-silverbullet.service`).

## 8. Troubleshooting

- **Daemon: `Refusing to bind non-localhost …`** — you set
  `KB_DAEMON_HOST=0.0.0.0` (or a hostname) in the env file without TLS.
  For local use, keep `KB_DAEMON_HOST=127.0.0.1` (the default). For
  remote, follow `remote-deployment.md` (TLS reverse proxy + the gate).
- **`Cannot find module '@kb/protocol'` in pi** — the extension's deps
  aren't linked. `cd packages/pi-adapter/extension && npm install` (the
  `@kb/*` are `file:` deps to the sibling packages). Then restart pi.
- **SB UI shows files but search is stale** — the daemon's index is
  separate from SB's client-side index. Run `kb index-admin.rebuild-indexes`
  if the daemon's search misses a note that's on disk.
- **`kb index-admin.check` fails on B7** — a glossary `term` is defined
  but never linked. Either link it from a note, or `kb write.delete
  term:<slug>` if it was a mistake. (B7 is a hard error by design —
  orphaned terms signal dead data.)
- **transformers.js model download** — the first semantic search
  triggers a ~100–300 MB model download (cached under `.kb/`). On a
  headless server, pre-warm it with `kb search.search-semantic
  "warmup"` once. (The `FakeEmbedder` in tests avoids this; the real
  daemon uses `TransformersEmbedder`.)
- **systemd user services not running at boot** — run
  `loginctl enable-linger $USER` once (step 3c). Without it, user
  services only run while you're logged in.

## 9. Where things live (quick reference)

| What | Where |
|---|---|
| Global KB (the SB space + the OKF bundle) | `~/.local/share/kb` (`$KB_HOME`) |
| Daemon index + embedder cache | `$KB_HOME/.kb/` (gitignored; rebuildable) |
| Daemon env (token, ports) | `~/.config/kb/daemon.env` (chmod 600) |
| systemd user units | `~/.config/systemd/user/kb-{silverbullet,daemon}.service` |
| SB container | Docker `kb-sb` (managed by the unit) |
| pi extension + skills | `~/.pi/agent/extensions/pi-kb`, `~/.pi/agent/skills/kb-{ask,curate,save-session,research}` (symlinks to the repo) |
| The repo (code, dist) | your clone (`~/Projects/okf-kb`) |

## 10. Going remote later

This guide is local-only (loopback, no TLS). To let an agent on
**another machine** talk to the daemon, follow
[`remote-deployment.md`](remote-deployment.md): keep the daemon on
`127.0.0.1`, add a caddy/nginx TLS reverse proxy on `0.0.0.0:443`, and
point the remote pi at `https://kb.host` — the adapter's `isRemoteKb`
then activates `kb_put`/`kb_delete` so the remote agent authors through
the daemon. SB can stay loopback (or be exposed separately; it's
orthogonal to the daemon).
