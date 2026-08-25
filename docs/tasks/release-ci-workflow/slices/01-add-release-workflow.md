---
kind: slice
slug: add-release-workflow
title: Write .github/workflows/release.yml (build → changeset publish --provenance via OIDC)
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

On push to `main` (with pending changesets) or `workflow_dispatch`, CI
builds, tests, and publishes changed packages to npm with provenance.
No publish fires if there are no pending changesets.

## Acceptance criteria

- `.github/workflows/release.yml` exists, valid YAML.
- `on: { push: { branches: [main] }, workflow_dispatch: {} }`.
- `build` job: `actions/checkout@v4`, `setup-node@v4` (node 24, cache
  npm, registry-url), `npm ci`, `npm run build`, `npm test`.
- `release` job: `needs: build`, `permissions: { id-token: write,
  contents: write }`, uses `changesets/action@v1` with:
  - `publish: npx changeset publish --provenance`
  - `title: "ci: release"` (commit title)
  - env: `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`, `NPM_CONFIG_PROVENANCE: true`.
- The workflow does not publish on a fork (default for secrets — fine).
- Validated: `actionlint` (if installed) or a YAML parse + manual review
  against GitHub Actions schema.

## Test plan

- **Seams**: `actionlint` (or `yamllint`); a dry trigger
  (`workflow_dispatch`) on a branch with a no-op changeset that bumps
  nothing.
- **Failure modes**: missing `id-token: write` → provenance fails;
  `NODE_AUTH_TOKEN` not set → 403 from npm; `contents: write` missing →
  changelog commit fails.
- **Scenarios**: push to main with a changeset → publish; push without
  → no-op; manual dispatch.
- **Edge cases**: the first real run is `first-publish` — this slice
  only lands the file (and optionally a dry-run on a throwaway branch).

## Constraints and dependencies

- After `fix-package-metadata` (prepublishOnly) + `adopt-changesets`
  (so `changeset publish` exists). The `NPM_TOKEN` secret need not exist
  to land the file; it's needed only to *run* the publish.
