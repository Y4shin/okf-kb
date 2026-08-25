# @okf-kb/cli

The `okfkb` client — a light tRPC CLI for the OKF knowledge-base daemon.

`@okf-kb/cli` is intentionally small: it depends only on `@okf-kb/auth`, `@okf-kb/protocol`, and `@trpc/client`. It does **not** pull in `@okf-kb/fs`, `@xenova/transformers`, or `better-sqlite3`. The daemon runs separately (`okfkbd`) and the CLI talks to it over HTTP.

## Install

```bash
npm install -g @okf-kb/cli
```

## Usage

```bash
# Read a note
okfkb read.get concept:hello

# Unified search (FTS5 + semantic, RRF-blended)
okfkb search.search-unified "agent workflow"

# Show the resolved config
okfkb config

# Point at a remote daemon
okfkb --url http://myhost:30700 read.get concept:hello
```

Authentication is automatic via `@okf-kb/auth` (keyring, or `KB_TOKEN` override). For setup and deployment, see the root [README](../../README.md) and [docs/setup-guide.md](../../docs/setup-guide.md).
