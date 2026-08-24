---
kind: task
type: manual
slug: stand-up-silverbullet
title: Stand up a local Silverbullet test fixture pointed at the global KB
map: agent-knowledge-base
status: ready
blocked_by:
  - decide-deployment-and-layout
---

## Exact prerequisite

A running **local Silverbullet instance, as a test fixture**, whose space
folder is the **global KB** at `$KB_HOME` (default `env-paths('kb').data`,
e.g. `~/.local/share/kb`). This is the environment that SB-facing
integration tests run against. It is **not** the real deployment — this
repo *configures* an arbitrary SB instance; deployment is the operator's
concern. For testing we use Docker.

## Owner / actor

- **Owner**: user (with agent assist for run commands and verification).
- The agent may draft the run commands and verify the HTTP endpoints; the
  user runs Docker and picks the port.

## Checklist / safe automation boundary

1. Ensure the global KB exists at `$KB_HOME` (create the dir; init its own
   git repo — standalone-versioned). Add a `manifest.yaml` (per
   `okf-format-adaptation`) and the typed directories
   (`glossary/`/`concepts/`/`decisions/`/`reference/`).
2. Run Silverbullet in **Docker** (official image), bind-mounting the
   `$KB_HOME` dir as the SB space. Pick a port (default 3000).
   `restart: unless-stopped`.
3. **No auth in v1** (localhost single-user; the daemon has its own Bearer
   auth, but SB itself needs no token for a localhost-only test fixture).
   If SB requires *some* auth to start, use the lightest option and record
   it locally.
4. Open the SB UI in a browser; confirm the space folder is picked up.
5. Verify the HTTP API:
   - `GET /.ping` → `200 OK`.
   - `GET /.fs` → JSON listing of the bundle.
   - `GET /.fs/<some-note>.md` → returns the note body (after ≥1 note
     exists).
6. Verify the **filesystem-write pickup** (research-confirmed
   `SB_FS_WATCH=auto`): write a `.md` file directly into `$KB_HOME` (e.g.
   via the CLI / `kb put` once it exists, or a manual `echo > file.md`),
   and confirm it appears in the already-open SB client without a client
   save.
7. Record (locally, not in the repo): the SB **base URL** and port.

Safe boundary: the agent may run install/verification commands and `curl`
checks; it must **not** persist any auth token to the repo or to any
committed file (v1 has no token anyway).

## Evidence required to mark it done

- A short local record of the SB base URL + port + that the space = the
  `$KB_HOME` global KB.
- Successful `GET /.ping` and `GET /.fs` results captured as evidence.
- The SB UI loads and shows the bundle's files.
- The filesystem-write-pickup check: an externally-written file appears in
  the open SB client.

## Dependent tasks that remain blocked

- Any slice that integration-tests against a running Silverbullet (notably
  the filesystem-write pickup verification in `research-sb-filesystem-
  and-plugs` — already done — and the end-to-end "note appears in SB UI"
  checks in `kb-client-js-api`'s slices, once the CLI/daemon exist).
