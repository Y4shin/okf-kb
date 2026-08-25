# Architecture Spec — `release-ci-workflow`

A GitHub Actions release workflow that publishes changed `@okf-kb/*`
packages to npm via **Trusted Publishing (OIDC)** — no `NPM_TOKEN`
secret anywhere. Then register each of the 6 packages as a Trusted
Publisher (CLI, owner 2FA) so the workflow can actually publish.

## Slices

- **01 — add-release-workflow:** write `.github/workflows/release.yml`
  (build → test → `changesets/action` version+publish via OIDC, with
  provenance). Validate the YAML. Does NOT publish yet (no registrations).
- **02 — register-trusted-publishers:** after `release.yml` is on `main`,
  run `npx npm trust github @okf-kb/<pkg> --file release.yml --repo
  Y4shin/okf-kb --allow-publish -y` for each of the 6 packages (owner
  taps yubikey). Confirms each on npmjs.com. Then an end-to-end test with
  a patch changeset triggers an actual OIDC publish.

## Existing abstractions to use

- **`changesets/action@v1`** — the canonical action. Supports OIDC
  natively: when no `npm_token` input/env is set, it doesn't append a
  token to `.npmrc`, letting npm's OIDC exchange authenticate the
  publish. (Confirmed via changesets/action#542 + the action's publish
  subaction docs.)
- **`actions/setup-node@v4`** with `node-version: 24`, `cache: npm`.
  `registry-url` is NOT needed for OIDC (no `NODE_AUTH_TOKEN`).
- **npm 11.15+** required for trusted publishing. Node 24 ships npm
  11.x; to be safe, the workflow runs `npm install -g npm@^11.15` (or
  relies on node 24's bundled npm — verify the bundled version; if
  <11.15, bump). Actually `setup-node@v4` with `node-version: 24` gives
  npm 11.x; confirm ≥11.15 in the job and bump only if needed.
- The repo already has `.changeset/config.json` (baseBranch `main`,
  `updateInternalDependencies: patch`, `access: public`) and the root
  `publish:changes` script (`changeset publish`).

## Do NOT reimplement

- Do not add an `NPM_TOKEN` secret or `NODE_AUTH_TOKEN` env — OIDC only.
- Do not auto-publish without explicit owner approval. The publish job uses
  a GitHub `environment` with a required reviewer (the owner); build+test
  run on push, but the publish step PAUSES for manual approval in the GH
  UI. (Owner constraint: any pipeline action or package release needs
  explicit approval each time.)
- Do not register trusted publishers in slice 01 (that's slice 02, and
  needs `release.yml` on `main` first).
- Do not change `.changeset/config.json` or package versions.

## Seams under test

1. **YAML valid** — the workflow file parses (YAML lint / `actionlint`
   if available; else `node -e YAML.parse` or `gh workflow view` after
   push).
2. **Build + test gate** — the `build` job runs `npm ci`, `npm run
   build`, `npm test` (221 passed, 1 skipped) before the release job.
3. **OIDC publish** — after registrations (slice 02), a patch changeset
   merged to `main` triggers `changesets/action`, which versions +
   publishes to npm with a provenance badge. This is the end-to-end test.
4. **No secret** — the workflow file contains no `secrets.NPM_TOKEN`
   reference (grep clean).

## Interface contract

- `.github/workflows/release.yml` is the canonical release workflow;
  the trusted-publisher registrations (slice 02) bind npm to this exact
  filename on `Y4shin/okf-kb`.
- All later releases happen via this workflow (after the one-time manual
  `first-publish`, which is done).

## Exact edit map

### Slice 01 — add-release-workflow

**New file `.github/workflows/release.yml`:**

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: write      # changesets commits the version bump + changelog
  pull-requests: write # changesets opens a "Version Packages" PR
  id-token: write      # REQUIRED for npm OIDC trusted publishing

jobs:
  build:
    name: Build & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test

  release:
    name: Release (requires approval)
    needs: build
    runs-on: ubuntu-latest
    environment: release   # GitHub environment with a required reviewer (the owner);
                           # the job PAUSES here for manual approval before any publish.
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # changesets needs full history
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Release (Changesets + npm Trusted Publishing / OIDC)
        uses: changesets/action@v1
        with:
          publish: npx changeset publish --provenance
          title: "chore(release): version packages"
          commit: "chore(release): version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # NOTE: no NPM_TOKEN / NODE_AUTH_TOKEN — OIDC authenticates.
          NPM_CONFIG_PROVENANCE: "true"
```

Notes:
- `build` job runs automatically on every push to `main` (no approval) —
  it only builds + tests; no publish.
- `release` job has `environment: release`. The owner must create a GH
  environment named `release` (Settings → Environments → New environment
  → `release` → Required reviewers → add yourself). With that, the job
  PAUSES on every run for your click-approve before the publish step.
  This satisfies the owner constraint: no release without explicit approval.
- `changesets/action@v1` opens a "Version Packages" PR when there are
  pending changesets; on merge to `main` with no pending changesets it
  attempts to publish (no-op if the version is already on the registry).
- `--provenance` + `NPM_CONFIG_PROVENANCE=true` enables the SLSA
  attestation. OIDC (`id-token: write`) is the auth.
- `GITHUB_TOKEN` is the auto-populated repo token (for the PR/commits),
  NOT an npm token.
- If `npm ci` fails because `package-lock.json` is out of sync, that's
  a real signal to fix the lockfile locally first.

**GitHub environment setup (owner, one-time, after the workflow file is
pushed):** repo Settings → Environments → New environment → name
`release` → add required reviewer = yourself. This is what makes the
release job pause for approval. (Document this in slice 02 / the runbook.)

**Validation:** parse the YAML (e.g., `python -c "import yaml;
yaml.safe_load(open('.github/workflows/release.yml'))"` or a node YAML
parse). If `actionlint` is installed, run it. Commit.

### Slice 02 — register-trusted-publishers (hitl)

After `release.yml` is on `main` (slice 01 merged + pushed):

For each of `core, protocol, fs, daemon, cli, auth`:
```sh
npx npm trust github @okf-kb/<pkg> --file release.yml --repo Y4shin/okf-kb --allow-publish -y
```
- Owner taps yubikey for 2FA (web-auth flow, like the first publishes).
- `--file release.yml` = the filename only (NOT the full path) — npm
  binds to that filename on the registered repo.
- `--allow-publish` grants the publish action (vs stage-publish).
- `-y` confirms non-interactively (the 2FA is still interactive).

Confirm each: visit the package's npmjs.com settings → "Trusted
Publisher" shows GitHub Actions / `Y4shin` / `okf-kb` / `release.yml`.

**End-to-end test:** add a patch changeset (e.g.,
`.changeset/test-oidc.md` bumping one package as patch with a trivial
message), commit, push to main → the workflow runs → `changesets/action`
versions + publishes via OIDC → confirm the new version lands on npm
with a provenance badge. (Then optionally deprecate the test version.)
This is the real acceptance test for the whole task.

## Risks / watch-outs

- **OIDC + scoped packages E404:** there's a known issue
  (npm/cli#8976) where OIDC trusted publishing of scoped packages via
  `changesets/action` can E404 if the trusted-publisher config doesn't
  exactly match (org/repo/workflow-filename). Slice 02's `--file
  release.yml` + `--repo Y4shin/okf-kb` must match the workflow's
  actual location. If the E2E test E404s, double-check the registration
  matches (filename `release.yml`, not the path).
- **npm version in CI:** node 24 ships npm 11.x; confirm ≥11.15 (needed
  for trusted publishing). If the bundled version is older, add a
  `npm install -g npm@^11.15` step. (Check at implementation; likely
  fine on node 24.)
- **`package-lock.json` sync:** `npm ci` requires an in-sync lockfile.
  After the `adopt-changesets` install, the lockfile is current; if a
  later change drifts it, CI fails loudly (intended).
- **No `NPM_TOKEN`:** the whole point. The workflow must have zero
  references to `secrets.NPM_TOKEN` or `NODE_AUTH_TOKEN`. Grep-clean.
- **`fetch-depth: 0`** is required by changesets (it reads history to
  determine changed packages).
- **`permissions` at workflow level** applies to all jobs; if a separate
  non-release job is added later, scope permissions per-job instead.
  For now, one job, workflow-level is fine.
