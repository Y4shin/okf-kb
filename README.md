# @okf-kb / okfkb

An agent-maintained knowledge base: an OKF-based Silverbullet space with a daemon (tRPC + MCP) and a light client CLI.

This repo publishes the `@okf-kb/*` packages and two binaries:

- `okfkbd` — the daemon (`@okf-kb/daemon`). Serves tRPC on `/trpc`, MCP on `/mcp`, and a health check on `/`.
- `okfkb` — the light CLI (`@okf-kb/cli`). A tRPC client that talks to a running daemon.

## Quick start

Install and run the daemon:

```bash
npm install -g @okf-kb/daemon
okfkbd
# Listening on http://127.0.0.1:30700
```

Then install and use the CLI:

```bash
npm install -g @okf-kb/cli
okfkb read.get concept:hello
okfkb search.search-unified "agent workflow"
okfkb config
```

The daemon and CLI share an auth token automatically via the OS keyring (`@okf-kb/auth`). Set `KB_TOKEN` to override it.

## Learn more

- [docs/setup-guide.md](docs/setup-guide.md) — local setup, Silverbullet integration, and configuration.
- [docs/remote-deployment.md](docs/remote-deployment.md) — deploying the daemon behind a reverse proxy.

## Packages

| Package | Purpose |
|---|---|
| `@okf-kb/core` | `Kb` typestate builder, group interfaces, and per-method Zod schemas |
| `@okf-kb/protocol` | `buildRouter(kb)` — a tRPC router from the binding records |
| `@okf-kb/fs` | Local-fs backed groups, FTS5 search, and semantic embeddings |
| `@okf-kb/daemon` | `startDaemon()` + the `okfkbd` binary |
| `@okf-kb/cli` | The light `okfkb` client |
| `@okf-kb/auth` | Shared keyring-backed token used by both CLI and daemon |
