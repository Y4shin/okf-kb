# Architecture Spec — `write-package-readmes`

Write a README for each public package + a root README so the npm pages
and the repo landing render meaningfully.

## Slice (single)

- **write-readmes:** root `README.md` + `packages/{core,protocol,fs,daemon,cli,auth}/README.md`.
  Hitl mode — owner reviews prose; agent drafts.

## Do NOT reimplement

- Do not duplicate `docs/setup-guide.md` — link to it.
- Do not change code.

## Seams under test

1. Each package's `npm publish --dry-run` includes its `README.md`
   (npm includes README by default; verify).
2. `npm test` unaffected.

## Content per package

- **root** `README.md`: one-liner (agent-maintained OKF knowledge base
  with a daemon + CLI); the `@okf-kb` scope; two binaries `okfkb`
  (client) / `okfkbd` (daemon); quickstart (install daemon + `okfkbd`;
  install cli + `okfkb`); link to `docs/setup-guide.md` +
  `docs/remote-deployment.md`.
- **core** — the Kb builder/typestate/Embedder interface; the foundation.
- **protocol** — tRPC router + MCP bindings from a Kb.
- **fs** — local-fs + FTS5 + semantic embedder; note the heavy deps
  (~95 MB: @xenova/transformers + better-sqlite3).
- **daemon** — `startDaemon`, HTTP server (tRPC + MCP + health);
  mentions the `okfkbd` bin.
- **cli** — the `okfkb` client; install + a few commands; note it's
  light (no fs/xenova).
- **auth** — `getOrMintToken` / keyring-backed token; used by cli +
  daemon; explains why it's separate (keeps client light).

All reflect the **new** reality: `@okf-kb/*` names, `okfkb`/`okfkbd`
bins, `@okf-kb/auth` extracted.
