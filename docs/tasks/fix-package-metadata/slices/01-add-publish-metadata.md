---
kind: slice
slug: add-publish-metadata
title: Add files/prepublishOnly/license/publishConfig to 6 public packages + root LICENSE
task: ../task.md
mode: afk
status: done
size: s
blocked_by: []
---

## End-to-end behavior

All 6 public packages have the four metadata fields; a root LICENSE
exists; `npm publish --dry-run` for each shows a clean, dist-only
tarball.

## Acceptance criteria

- For `core, protocol, fs, daemon, cli, auth`: add `files`, `prepublishOnly`,
  `license`, `publishConfig` fields (see task body).
- Add root `LICENSE` (MIT, copyright holder as the owner directs —
  placeholder "Y4shin" until confirmed).
- For each package: `npm run build && npm publish --dry-run` and capture
  the tarball contents — assert no `src/`, `tests/`, `tsconfig.json`.
- `npm run typecheck` + `npm test` green.

## Test plan

- **Seams**: `npm publish --dry-run` tarball listing per package.
- **Failure modes**: forgot `files` → tarball still includes `src/tests`;
  forgot `prepublishOnly` → a pack without prior build ships stale dist
  (harder to catch — assert the script exists).
- **Scenarios**: dry-run each of the 6 packages; verify counts.
- **Edge cases**: `@okf-kb/fs` also has compiled `.js` test helpers under
  `tests/` — `files: ["dist"]` excludes them correctly (verify in dry-run).

## Constraints and dependencies

- After `split-daemon-binary` (so the `@okf-kb/auth` package + the
  renamed bin all exist before metadata is finalized).
- Confirm license = MIT with owner before committing (in Fog if not
  yet decided).
