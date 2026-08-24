# Development Environment

## Start the dev environment

This is an **npm-workspace monorepo** (planned): `packages/core`, `packages/cli`,
`packages/pi-extension`, and a future `packages/mcp-server`. The KB daemon +
CLI are TS/Node.

```sh
npm install                 # install workspace deps (incl. zod, @trpc/*, @modelcontextprotocol/sdk)
npm run build               # build all packages
npm run kb daemon           # start the KB daemon (localhost, tRPC + MCP)
# in another shell:
npm run kb <command>        # CLI (a tRPC client of the daemon)
```

A local **Silverbullet test fixture** (Docker) is needed for SB-facing
integration tests — see `docs/tasks/stand-up-silverbullet/task.md`.

## Runtime versions (verified on this machine)

- **Node** v24.18.0, **npm** 11.16.0 (TS/Node is the chosen runtime — `decide-js-api-scope-and-contract`).
- **Docker** 29.6.1 (for the SB test fixture only — `decide-deployment-and-layout`).
- **Python** 3.13.14 (not used by the JS API; the embedder is transformers.js, in-process).
- No Ollama / no `fastembed` installed; the v1 embedder is transformers.js (Xenova) in-process.

## Dependencies (by package)

- `@kb/core`: `zod` (v4). No `fs`/embedder/vector-store deps — pure.
- `@kb/fs`: `sqlite-vec` (vectors + literal + graph), `@xenova/transformers`
  (embedder), a markdown + YAML parser.
- daemon: `@trpc/server`, `@modelcontextprotocol/sdk`, `@napi-rs/keyring`
  (token), `env-paths` (KB home dir).
- CLI: `@trpc/client`, an arg framework (commander/yargs or generated from
  binding records).

## Reproduction

> AI reproduction is feasible for most slices (pure TS + `tsc --strict`).
> The SB-facing integration tests require the Docker test fixture (manual
> setup); a slice that needs a running SB is gated on
> `stand-up-silverbullet`.

## Key config / env

- `KB_HOME` — the global KB dir (default `env-paths('kb').data`, e.g.
  `~/.local/share/kb`). Standalone, git-versioned in its own repo.
- `KB_TOKEN` — daemon Bearer token (env fallback; primary store is the OS
  keyring via `@napi-rs/keyring`).
- `.kb/` — the daemon's state (sqlite-vec index + config), **gitignored**,
  beside the bundle (not SB content).
- `.kb/config` — optional config (e.g. `qa.contextBudgetTokens`, embedder
  override).

## Do not attempt AI reproduction for

- The **stand-up-silverbullet** task (manual): requires running Docker and
  pointing a browser at the SB UI.
- The **hitl** slices (`conversational-qa-rag`, the three curation slices):
  human-in-the-loop review of answer/note quality.
