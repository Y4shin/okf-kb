---
kind: task
type: grilling
slug: decide-deployment-and-layout
title: Decide deployment, bundle layout, auth, and versioning for the KB
map: agent-knowledge-base
status: done
blocked_by: []
---

## Decision to settle

Where the OKF bundle lives in relation to this task-workflow repo, how
Silverbullet is deployed locally, how auth works, and the git/versioning
strategy for the KB. The map settled *that* deployment is local and the
bundle is the SB space; this grilling settles the concrete placement and
config — a genuine design fork, not just an environment checklist. This
unblocks the `stand-up-silverbullet` manual task.

## Parent decisions it depends on

- Deployment is local (shared machine or Docker with a proper bind mount)
  (map, decided).
- The OKF bundle *is* the Silverbullet space folder (map, decided).
- No secrets in the repo; auth token in local config only (map, decided).
- OKF recommends distributing a bundle as a git repo (OKF spec §3).

## Choices already known

- This repo already hosts the task-workflow under `docs/`; the KB must not
  collide with it.
- Silverbullet serves a single space folder; the space folder = bundle root.
- Auth via `SB_AUTH_TOKEN` bearer or username/password (HTTP API doc).

## The specific questions to grill (one at a time)

1. **Bundle location.** A `kb/` subfolder in this repo, a separate repo,
   or a separate path entirely? If same repo, is the KB its own git history
   or shares this repo's? (Recommend: `kb/` in this repo for v1, structured
   to be movable to its own repo later.)
2. **Relation to task-workflow docs.** Does the SB space include the
   task-workflow's `docs/tasks` etc., or is the KB a *separate* SB space?
   Mixing them means task docs become KB content; separating keeps the KB
   clean. (Recommend: KB is its own space at `kb/`; task-workflow docs are
   *not* SB content.)
3. **Silverbullet deployment.** Binary or Docker (you said either is fine if
   the bind mount is right); port; restart-on-boot approach.
4. **Auth.** `SB_AUTH_TOKEN` bearer vs username/password; where the token is
   stored locally (e.g. `~/.config/kb`, `.kb/config` with gitignore).
   (Recommend: bearer token in local gitignored config.)
5. **Versioning.** Is the KB a git repo for history/attribution/diffs (OKF
   recommends it)? Same repo as the workflow or its own? Is `.kb/` (the
   index) gitignored? (Recommend: KB versioned in this repo's `kb/`, `.kb/`
   gitignored.)
6. **Space ↔ bundle root mapping.** Confirm the SB space folder is the
   `kb/` bundle root, and `.kb/` + task-workflow `docs/` are excluded from
   the space.

## Recommended starting answer

- `kb/` subfolder in this repo is the OKF bundle and the SB space root.
- Task-workflow `docs/` is *not* SB content; the SB space is just `kb/`.
- Docker or binary (your call); bearer-token auth in local gitignored config.
- KB versioned in this repo; `.kb/` index gitignored.

## What downstream work the answer may create

- Unblocks `stand-up-silverbullet` (it becomes pure execution of this config).
- Fixes the `--space` path the JS API and pi adapter point at.
- Determines the gitignore entries and any repo restructuring.

## Decisions (settled in grilling) — daemon-mediated V1

**Pivot:** V1 is **daemon-mediated**, not "each consumer links the fs module
in-process." One **daemon** owns `.kb/` (sqlite-vec index, literal/graph
indexes, the embedder) and the single `Kb` instance (built via the typestate
builder). All three consumers (CLI, pi extension, MCP) are **clients** of the
daemon over localhost HTTP. **V2 makes the daemon optional** (a consumer can
link the fs module in-process via the typestate builder when a daemon is
overkill — the same `Kb` either way).

### Global vs local KBs

- **Global KB** (v1: one, canonical location): a standalone knowledge base,
  git-versioned in **its own repo**. Canonical path via **`env-paths`**
  (sindresorhus — XDG on Linux, `~/Library/Application Support` on macOS,
  `%APPDATA%` on Windows). Overridable via `KB_HOME` env / `.kb/config`;
  default = `env-paths('kb', { suffix: '' }).data`.
- **Local KB** (optional, inside a code repo, versioned with the code):
  a supported case the architecture handles (`--space ./kb`); **not exercised
  in v1**. Recorded as a Fog capability-not-yet-exercised; Q6 (space↔bundle
  mapping) deferred until this is actually used.

### This repo's responsibility

This repo **does not deploy Silverbullet**; it **configures an arbitrary SB
instance** (space path, manifest) and ships the JS API / CLI / pi-extension /
MCP server. Deployment mechanism (Docker/binary/Nix) is the operator's
concern. **Docker for testing only** (a test fixture), not a shipped
deployment.

### Transport split (one IDL → two HTTP projections on the daemon)

The same **Zod input schemas + `GroupBindings<G>` binding records** feed both
surfaces (the exhaustiveness guarantee — `tsc` errors if a consumer/daemon
forgets a method — carries over; verified):

- **`/trpc`** — **tRPC** (localhost HTTP), for the CLI and pi extension (both
  TS, in-monorepo). Input validation is Zod (the schemas we already have →
  the `.input()` of each procedure, no duplication); the client's types are
  **inferred from the router**, so the `keyof Group`-completeness propagates
  across the wire — a method missing from the bindings is missing from the
  router and the client. Chosen over socket JSON-RPC because the binding
  records *are* the tRPC procedures; a custom JSON-RPC + auth handshake would
  be strictly more work. Verified: adding `peek` to `Read` with no daemon
  binding → `Property 'peek' is missing in type … GroupBindings<Read>`.
- **`/mcp`** — **MCP** protocol (HTTP, JSON-RPC-ish + SSE, separate path so
  MCP idiosyncrasies don't touch the tRPC surface), for any MCP client (e.g.
  Claude Desktop). Each binding → a tool with `inputSchema` from
  `z.toJSONSchema(b.inputSchema)`. Language-agnostic surface.
- **Both** use **Bearer auth** with the same token. Token stops another local
  process from silently driving the KB daemon (authn, not network security —
  localhost single-user).

### Token storage

Token retrieved from the **OS keyring via `@napi-rs/keyring`** (macOS Keychain
/ Windows Credential Vault / Linux Secret Service; native binding via
`@napi-rs`, no legacy `keytar` native-build pain), with a **`KB_TOKEN` env
fallback** for CI/headless. Required for all daemon access.

### Versioning

Every KB is git-versioned: standalone ones in their **own repo**, in-code-
repo ones **alongside the code**. No "not versioned" option.

### Supersedes / reconciles

This **supersedes** the earlier in-process consumer model recorded under
`decide-js-api-scope-and-contract` ("pi extension wires in the fs read/index
module directly"): in V1 the pi extension is a **daemon client** (tRPC), not
an in-process linker of `@kb/fs`. The typestate builder (`createKb()…`)
becomes the **daemon's** construction; consumers get a **`KbClient<C>`** that
exposes the same group interfaces over the wire. The **"no `Write` for pi"**
decision still holds — the daemon's pi-facing tRPC surface omits
`put`/`delete`; pi still authors with its native `write`/`edit`, then asks
the daemon to reindex via `search.update`. The core+optional-fs-I/O-module
split stays useful for V2's optional-daemon (in-process) path.

### Open (V2, not V1)

- Daemon becomes optional; a consumer links `@kb/fs` in-process when a daemon
  is overkill (e.g. a single-shot CLI command). Same `Kb`, no daemon.
