# Development Environment

## Start the dev environment

This is an **npm-workspace monorepo**: `packages/core` (`@okf-kb/core`),
`packages/fs` (`@okf-kb/fs`), `packages/protocol` (`@okf-kb/protocol`),
`packages/daemon` (`@okf-kb/daemon`), and `packages/cli` (`@okf-kb/cli`, the `okfkb`
binary). All TS/Node, ESM.

```sh
npm install                 # install workspace deps (zod, @trpc/*, @modelcontextprotocol/sdk, better-sqlite3, commander, ...)
npm run build               # build all packages (tsc --build)
npm run typecheck           # tsc --build across the workspace (the enforcement gate)
npm test                    # vitest run (90 tests + 1 skipped integration)
# start the daemon (localhost, tRPC /trpc + MCP /mcp, Bearer auth):
node packages/cli/bin/okfkb.js daemon            # or: npm i -g . && okfkb daemon
# in another shell, run the CLI (a tRPC client of the daemon):
node packages/cli/bin/okfkb.js read.get concept:foo
node packages/cli/bin/okfkb.js write.put concept:foo --file note.md
node packages/cli/bin/okfkb.js search.search-unified "topic" --json
node packages/cli/bin/okfkb.js index-admin.check
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

- `@okf-kb/core`: `zod` (v4). Pure — no fs/embedder/vector-store deps.
- `@okf-kb/fs`: `better-sqlite3` (vectors as JSON-blob + JS cosine; FTS5 for the
  literal index; a plain `graph_edges` table — all three indexes in one
  `.kb/index.db`), `@xenova/transformers` (embedder), `marked` + `yaml`
  (markdown/YAML parse). **Note:** `sqlite-vec` was evaluated and dropped —
  its `vec0` virtual tables are dimension-fixed at create time, which breaks
  the pluggable `Embedder` seam (`FakeEmbedder` dim 32 vs
  `TransformersEmbedder` ~384). JSON-blob + JS cosine is O(n) per semantic
  query, acceptable for a single-bundle v1; revisit (ANN / HNSW) for large
  bundles. See `packages/fs/src/db.ts` for the rationale comment.
- `@okf-kb/protocol`: `@okf-kb/core`, `@trpc/server`, `zod`. (Not "pure, depends
  only on @okf-kb/core" as originally specced — `buildRouter` is runtime here
  for type-sharing with the CLI; the graph stays acyclic: `cli→protocol`,
  `daemon→protocol,fs`.)
- `@okf-kb/daemon`: `@okf-kb/core`, `@okf-kb/fs`, `@okf-kb/protocol`, `@trpc/server`,
  `@modelcontextprotocol/sdk`, `@napi-rs/keyring` (token), `env-paths`
  (KB home), `yaml`, `zod`.
- `@okf-kb/cli`: `@okf-kb/core`, `@okf-kb/protocol`, `@okf-kb/daemon`, `@trpc/client`,
  `commander`. (No `@okf-kb/fs` in the CLI runtime — it is a tRPC client; tests
  import `FakeEmbedder` from `@okf-kb/fs` to stand up a daemon.)

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
mechanically from the binding records): `okfkb read.get`, `okfkb write.put`,
`okfkb search.search-unified`, `okfkb index-admin.check`, `okfkb local-fs.space-root`,
`okfkb search.graph`. `okfkb daemon` and `okfkb config` are the only short names
(special-cased). `--json` for machine output; `--help` per command;
exit code 1 on error / `index-admin.check` `ok:false`.

## pi adapter (the first consumer)

The pi adapter lives in `packages/pi-adapter` (extension/ + skill/kb-ask/).
Install it into the user's pi tree with `npm run install:pi` (symlinks
`extension` → `~/.pi/agent/extensions/pi-kb` and `skill/kb-ask` →
`~/.pi/agent/skills/kb-ask`). The extension is a **tRPC client** of the
daemon (not an `@okf-kb/fs` linker); it registers 8 KB tools (`kb_get`/
`kb_list`/`kb_search`/`kb_graph`/`kb_update`/`kb_check_id`/
`kb_resolve_path`/`kb_resolve_id`) — **no `kb_put`/`kb_delete`** (pi authors
with native `write`/`edit`, then `kb_update` to reindex). Tools **throw on
failure** (pi's `AgentToolResult` has no `isError` field). The `kb-ask`
skill is a pure-markdown RAG instruction set (`/skill:kb-ask`): retrieve →
lifecycle filter → context budget → grounded answer → cited (`[Title]
(formatRef(ref))`) → verify-before-emit → "I don't know". The human review
of answer/citation quality is a follow-up task (`review-kb-ask-qa-quality`).

### Curation skills (second-brain expansion)

Three sibling pi skills for on-demand KB expansion (installed by the
same `npm run install:pi`, which now globs `skill/*`):
- `kb-curate` (`/skill:kb-curate`) — the shared curation rules: type
  selection over the 5 OKF types (`generic` is the gauge), provenance
  (`generated.by = pi/<ver>/<model>` + `sources`), lifecycle
  (draft/unverified, never self-promote, deprecate with consent),
  authoring via native `write`/`edit` + `kb_update` + `kb_check_id`,
  link-don't-duplicate via `kb_search`, edit-anything + git.
- `kb-save-session` (`/skill:kb-save-session`) — distill the current
  session into OKF notes (extract-not-verbatim; `sources` → the session
  transcript; re-distill links).
- `kb-research` (`/skill:kb-research`) — research a topic via
  `web_search`/`fetch_content` + repo into sourced `reference`/`concept`/
  `term` notes (no sources → don't fabricate; conflicting sources →
  separate entries; narrow with the user if too broad).
All three are pure-markdown skills built on the `kb_*` tools, auto-gated
by content/structure tests. Human review of distilled/researched note
quality is a follow-up task.

### Remote-agent daemon access (remote-daemon-conditional-write)

The daemon can be exposed to other machines: `startDaemon` takes a `host`
(default `127.0.0.1`; `0.0.0.0` or a hostname for remote) and **refuses a
non-localhost bind without TLS** (either `KB_DAEMON_TLS_CERT`/`KEY` env or
the explicit `KB_ALLOW_REMOTE_INSECURE=1` escape hatch, which warns).
`GET /` returns `{ok, service, version, groups:[...]}` (not Bearer-gated;
`groups` derived from `fullBindings` keys). The **recommended** remote path
is daemon-on-`127.0.0.1` + a TLS reverse proxy (caddy/nginx) on
`0.0.0.0:443` — see `docs/remote-deployment.md` (systemd + caddyfile
snippets, threat model, governance). The pi adapter detects `isRemoteKb
(KB_URL)` (non-loopback) and conditionally registers `kb_put`/`kb_delete`
(full `AppRouter` + `fullBindings`, 10 tools) so a remote agent authors
**through the daemon** (native `write`/`edit` would hit the agent's local
disk, not the daemon's bundle). Localhost behavior is unchanged (8 tools,
no `kb_put`/`kb_delete`). Backwards compatible. The curation skills carry a
one-line "when remote, use `kb_put`/`kb_delete`" note.

## Do not attempt AI reproduction for

- The **stand-up-silverbullet** task (manual): requires running Docker and
  pointing a browser at the SB UI.
- The **hitl** slices (`conversational-qa-rag`, the three curation slices):
  human-in-the-loop review of answer/note quality.
