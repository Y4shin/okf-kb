---
kind: task
type: feature
slug: release-ci-workflow
title: GitHub Actions release workflow — build, test, changeset publish via Trusted Publishing (OIDC)
map: npm-publishing
status: ready
blocked_by:
  - fix-package-metadata
  - adopt-changesets
  - first-publish
slices:
  - add-release-workflow
  - register-trusted-publishers
---

## User-visible outcome

A GitHub Actions workflow (`.github/workflows/release.yml`) builds all
packages, runs tests, and publishes changed packages to npm via
**Trusted Publishing (OIDC)** — no `NPM_TOKEN` secret. npm verifies the
publish came from `Y4shin/okf-kb` + the `release.yml` workflow and
issues a short-lived credential at publish time. Provenance (SLSA
attestation) is included automatically. Triggered on push to `main`
when there are pending changesets (or a manual dispatch).

This task also **registers each of the 6 published packages as a
Trusted Publisher** on npm (the bridge that first-publish deferred here,
because the `npm trust github --file release.yml` command references
the workflow filename, which this task creates).

## Why this task is blocked by first-publish

npm Trusted Publishing **cannot publish the first version of a
package** — the trusted-publisher config lives on each package's
npmjs.com settings page, which only exists after the first version is
on npm. So `first-publish` (manual, local, one-time) must land the
packages first; this task then writes `release.yml` and registers each
package as a Trusted Publisher (org `Y4shin/okf-kb`, workflow
`release.yml`), after which the CI workflow can publish via OIDC. This
task is tested end-to-end with a patch changeset after the
registrations are in place.

## User story

As a maintainer, merging a PR with a changeset releases to npm
automatically — with a signed, verifiable provenance attestation, and
no long-lived token to leak or rotate. I never publish from my laptop
(after the one-time first publish).

## Scope boundaries

- **In scope**: the workflow file; permissions (`id-token: write`,
  `contents: write` for changelog commits); `npm` setup; the
  `changesets/action` step that versions + publishes via OIDC; AND
  the trusted-publisher registration of all 6 packages (CLI-driven,
  owner taps yubikey for 2FA).
- **Out of scope**: the first actual publish (`first-publish`, done); a
  CI *check* workflow (build/test on PRs — can add but not required here).
- **No `NPM_TOKEN` secret is used.** OIDC is the auth; `setup-node` with
  `registry-url` + `NODE_AUTH_TOKEN` is NOT needed for Trusted Publishing
  (npm's OIDC flow exchanges the GitHub OIDC token directly). Verify the
  exact `changesets/action` OIDC incantation against current docs at
  implementation time.

## Accept criteria

- `.github/workflows/release.yml` on `push` to `main` + `workflow_dispatch`.
- Jobs: `build` (npm ci, npm run build, npm test) → `release` (needs
  build; `changesets/action` with version + publish via OIDC).
- `permissions: { id-token: write, contents: write }` at the job/workflow
  level (id-token for the OIDC exchange; contents for the changelog
  commit back to main).
- `setup-node` with `node-version: 24`, `cache: npm`.
- Uses `changesets/action@v1` (the canonical version+publish action) with
  `publish: npx changeset publish --provenance` (or the action's native
  OIDC publish mode — confirm against current `changesets/action` docs).
- The workflow is syntactically valid (actionlint if available, or at
  least a YAML parse / `gh workflow view`).
- **Trusted-publisher registration**: for each of the 6 packages, run
  `npx npm trust github @okf-kb/<pkg> --file release.yml --repo
  Y4shin/okf-kb --allow-publish -y` (owner taps yubikey for 2FA; requires
  npm 11.15+ — on 11.16). Confirm each registration on the package's
  npmjs.com settings page.
- End-to-end test: after registrations are in place, add a patch
  changeset, merge to main, confirm the workflow publishes the bump to
  npm with a provenance badge.

## Acceptance criteria

- The above; plus the workflow file passes a YAML lint / `actionlint`.
- `contents: write` is needed because `changesets/action` commits the
  version bump + changelog back to `main`.

## Existing abstractions to use

- `changesets/action` (the official `@changesets/action`) is the
  canonical way to run version+publish in CI with the changelog commit.
  It supports the OIDC Trusted Publishing flow natively — confirm the
  exact inputs against the action's current README at implementation.

## Relevant architecture / domain decisions

- **Trusted Publishing, not a token:** we deliberately rejected the
  bypass-2FA granular `NPM_TOKEN` path (npm's red-warning path, actively
  being restricted). The owner's 2FA is a physical yubikey, which CI
  can't satisfy — so a long-lived CI token would have to bypass 2FA.
  OIDC removes that whole tradeoff: no secret on either side.
- **Repo-confinement by construction:** npm only accepts publishes from
  the registered `Y4shin/okf-kb` + `release.yml`. No token to exfiltrate.
- Building in CI matters because `dist/` is gitignored — the tarball
  must be built in the job before `changeset publish` (or rely on
  `prepublishOnly` per package, which is now set).
