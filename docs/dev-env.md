# Development Environment

## Start the dev environment

This is an **npm-workspace monorepo**: `packages/core` (`@kb/core`),
`packages/fs` (`@kb/fs`), `packages/protocol` (`@kb/protocol`),
`packages/daemon` (`@kb/daemon`), and `packages/cli` (`@kb/cli`, the `kb`
binary). All TS/Node, ESM.

```sh
npm install                 # install workspace deps (zod, @trpc/*, @modelcontextprotocol/sdk, better-sqlite3, commander, ...)
npm run build               # build all packages (tsc --build)
npm run typecheck           # tsc --build across the workspace (the enforcement gate)
npm test                    # vitest run (90 tests + 1 skipped integration)
# start the daemon (localhost, tRPC /trpc + MCP /mcp, Bearer auth):
node packages/cli/bin/kb.js daemon            # or: npm i -g . && kb daemon
# in another shell, run the CLI (a tRPC client of the daemon):
node packages/cli/bin/kb.js read.get concept:foo
node packages/cli/bin/kb.js write.put concept:foo --file note.md
node packages/cli/bin/kb.js search.search-unified "topic" --json
node packages/cli/bin/kb.js index-admin.check
```

A local **Silverbullet test fixture** (Docker) is stood up and verified —
see `docs/tasks/stand-up-silverbullet/evidence-stand-up-silverbullet.md`
(container `kb-sb`, `http://localhost:3000`, space = `$KB_HOME`).

## Runtime versions (verified on this machine)

- **Node** v24.18.0, **npm** 11.16.0 (TS/Node is the chosen runtime — `decide-js-api-scope-and-contract`).
- **Docker** 29.6.1 (for the SB test fixture only — `decide-deployment-and-layout`).
- **Python** 3.13.14 (not used by the JS API; the embedder is transformers.js, in-process).
- No Ollama / no `fastembed` installed; the v1 embedder is transformers.js (Xenova) in-process.

## Dependencies (by package, as built)

- `@kb/core`: `zod` (v4). Pure — no fs/embedder/vector-store deps.
- `@kb/fs`: `better-sqlite3` (vectors as JSON-blob + JS cosine; FTS5 for the
  literal index; a plain `graph_edges` table — all three indexes in one
  `.kb/index.db`), `@xenova/transformers` (embedder), `marked` + `yaml`
  (markdown/YAML parse). **Note:** `sqlite-vec` was evaluated and dropped —
  its `vec0` virtual tables are dimension-fixed at create time, which breaks
  the pluggable `Embedder` seam (`FakeEmbedder` dim 32 vs
  `TransformersEmbedder` ~384). JSON-blob + JS cosine is O(n) per semantic
  query, acceptable for a single-bundle v1; revisit (ANN / HNSW) for large
  bundles. See `packages/fs/src/db.ts` for the rationale comment.
- `@kb/protocol`: `@kb/core`, `@trpc/server`, `zod`. (Not "pure, depends
  only on @kb/core" as originally specced — `buildRouter` is runtime here
  for type-sharing with the CLI; the graph stays acyclic: `cli→protocol`,
  `daemon→protocol,fs`.)
- `@kb/daemon`: `@kb/core`, `@kb/fs`, `@kb/protocol`, `@trpc/server`,
  `@modelcontextprotocol/sdk`, `@napi-rs/keyring` (token), `env-paths`
  (KB home), `yaml`, `zod`.
- `@kb/cli`: `@kb/core`, `@kb/protocol`, `@kb/daemon`, `@trpc/client`,
  `commander`. (No `@kb/fs` in the CLI runtime — it is a tRPC client; tests
  import `FakeEmbedder` from `@kb/fs` to stand up a daemon.)

## Reproduction

> AI reproduction is feasible for most slices (pure TS + `tsc --strict`).
> The SB-facing integration tests require the Docker test fixture (manual
> setup); a slice that needs a running SB is gated on
> `stand-up-silverbullet`.

## Key config / env

- `KB_HOME` — the global KB dir (default `env-paths('kb').data`, i.e.
  `~/.local/share/kb`). Standalone, git-versioned in its own repo.
- `KB_TOKEN` — daemon Bearer token (env fallback; primary store is the OS
  keyring via `@napi-rs/keyring`; minted+stored on first run if both empty).
- `KB_URL` — the daemon base URL (default `http://127.0.0.1:3000`).
- `KB_PORT` — the daemon port (default 3000; 0 = ephemeral for tests).
- `.kb/` — the daemon's state (better-sqlite3 index + config), **gitignored**,
  beside the bundle (not SB content).
- `.kb/config` — optional config (planned; **not yet read** by the CLI/daemon
  in v1 — only env vars are read; the "config > default" precedence tier is
  a follow-up).

## CLI command form

Commands are the fully-qualified kebab-cased `group.method` (derived
mechanically from the binding records): `kb read.get`, `kb write.put`,
`kb search.search-unified`, `kb index-admin.check`, `kb local-fs.space-root`,
`kb search.graph`. `kb daemon` and `kb config` are the only short names
(special-cased). `--json` for machine output; `--help` per command;
exit code 1 on error / `index-admin.check` `ok:false`.

## Do not attempt AI reproduction for

- The **stand-up-silverbullet** task (manual): requires running Docker and
  pointing a browser at the SB UI.
- The **hitl** slices (`conversational-qa-rag`, the three curation slices):
  human-in-the-loop review of answer/note quality.
