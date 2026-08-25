---
kind: slice
slug: write-readmes
title: Write root + 6 package READMEs
task: ../task.md
mode: hitl
status: done
size: m
blocked_by: []
---

## End-to-end behavior

Root `README.md` and one README per public package exist, render on npm,
and match the actual package surface (post-rename, post-auth-extraction,
post-bin-split).

## Acceptance criteria

- Files created: `README.md`, `packages/core/README.md`,
  `packages/protocol/README.md`, `packages/fs/README.md`,
  `packages/daemon/README.md`, `packages/cli/README.md`,
  `packages/auth/README.md`.
- Each reflects the **new** reality: `@okf-kb/*` names, `okfkb`/`okfkbd`
  bins, `@okf-kb/auth` extracted.
- Content per task body (purpose, install, minimal usage, link).
- Verify via `npm publish --dry-run` that each tarball includes its
  README.

## Test plan

- **Seams**: visual review (hitl — the owner reads them); `npm publish
  --dry-run` file list.
- **Failure modes**: a README references the old `@kb/*` name or the
  removed `kb daemon` subcommand; a package's README is copy-pasted and
  describes the wrong package.
- **Scenarios**: open each README; follow the quickstart in the root
  README mentally against the current code.
- **Edge cases**: `@okf-kb/auth` is new — its README must explain why it
  exists (shared token for cli + daemon, keeps client light).

## Constraints and dependencies

- After `split-daemon-binary` so the READMEs describe the final bin
  layout, not an intermediate state.
- `mode: hitl` — owner reviews the prose; the agent drafts.
