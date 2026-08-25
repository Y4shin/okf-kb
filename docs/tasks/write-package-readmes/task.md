---
kind: task
type: feature
slug: write-package-readmes
title: Write a README for each public package + a root README
map: npm-publishing
status: done
blocked_by:
  - split-daemon-binary
slices:
  - write-readmes
---

## User-visible outcome

Each public package has a README that renders on its npm page (purpose,
install, minimal usage, link to the repo). The repo root has a README
that introduces the project, the `@okf-kb` packages, the two binaries
(`okfkb` / `okfkbd`), and points to `docs/setup-guide.md`.

## User story

As a consumer landing on an npm package page, I understand what the
package is and how to use it in 30 seconds. As a visitor to the GitHub
repo, the root README orients me.

## Scope boundaries

- **In scope**: root `README.md`; `packages/{core,protocol,fs,daemon,cli,auth}/README.md`.
- **Out of scope**: `@okf-kb/pi-adapter` README (private, not published
  — a one-liner is fine but optional); full API docs (link to source /
  setup-guide instead); a docs site.
- Each README is short (a few paragraphs + a code block). No need to
  duplicate `docs/setup-guide.md` — link to it.

## Acceptance criteria

- Root `README.md`: project one-liner, the `@okf-kb` scope, the two
  binaries (`okfkb` client, `okfkbd` daemon), quickstart (install daemon
  + run `okfkbd`; install cli + run `okfkb`), link to
  `docs/setup-guide.md` and `docs/remote-deployment.md`.
- Per-package READMEs:
  - `core` — the Kb builder/typestate/Embedder interface; the foundation.
  - `protocol` — tRPC router + MCP bindings from a Kb.
  - `fs` — local-fs + FTS5 + semantic embedder; note the heavy deps.
  - `daemon` — `startDaemon`, the HTTP server (tRPC + MCP + health);
    mentions the `okfkbd` bin.
  - `cli` — the `okfkb` client; install + a few commands; note it's
    light (no fs/xenova).
  - `auth` — `getOrMintToken` / keyring-backed token; used by cli + daemon.
- `npm publish --dry-run` for each package includes its `README.md`
  (default npm includes README; verify it's at the package root).
- No code changes; `npm test` unaffected.

## Existing abstractions to use

- The repo already has `docs/setup-guide.md` and `docs/remote-deployment.md`
  — link, don't duplicate.
- The per-package `package.json` descriptions (none currently — could add
  a one-line `description` field as part of this, optional).

## Relevant architecture / domain decisions

- npm will publish a package with no README, but the page is bare. For a
  first public release, a README per package is the minimum viable
  presence.

## Implementation notes

### Slice 01 — write-readmes (landed)

Landed commit 7a555cf. Drafted root README.md + 6 package READMEs
(@okf-kb/{core,protocol,fs,daemon,cli,auth}). All reflect the current
post-rename, post-auth-extraction, post-bin-split state: @okf-kb/*
names, okfkb/okfkbd bins, @okf-kb/auth extracted, light client / heavy
daemon separation explained. Each package README links to the root
README + docs/setup-guide.md rather than duplicating deployment detail.
The TDD worker stalled on reporting after committing; parent landed
the docs directly. (hitl review: owner reviewed the prose inline.)
