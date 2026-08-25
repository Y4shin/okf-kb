---
kind: slice
slug: register-trusted-publishers
title: Register each @okf-kb package as a Trusted Publisher (CLI, after release.yml exists) + E2E test
task: ../task.md
mode: hitl
status: done
size: s
blocked_by:
  - add-release-workflow
---

## End-to-end behavior

Each of the 6 published `@okf-kb/*` packages is registered on npm as a
Trusted Publisher bound to `Y4shin/okf-kb` + the `release.yml` workflow
(created in the prior slice). After this, the release CI workflow can
publish later releases via OIDC — no `NPM_TOKEN` secret.

## Why this slice is blocked by add-release-workflow

`npm trust github --file release.yml` references the workflow filename.
While npm may accept the registration before the file exists on the
default branch, the registration is only *effective* once `release.yml`
is on `main`. So write the workflow first, merge it, then register.

## Acceptance criteria

- For each of `core, protocol, fs, daemon, cli, auth`:
  `npx npm trust github @okf-kb/<pkg> --file release.yml --repo
  Y4shin/okf-kb --allow-publish -y` runs successfully (owner taps
  yubikey for 2FA; npm 11.15+ required — on 11.16).
- Confirm each registration: visit the package's npmjs.com settings
  page → "Trusted Publisher" shows GitHub Actions, org `Y4shin`, repo
  `okf-kb`, workflow `release.yml`. (Or re-run `npm trust` which
  errors if already registered.)
- Record the 6 confirmations as evidence.

## Test plan

- **Seams**: `npm trust github` exit code (0 = registered/updated);
  the npmjs.com settings page (visual confirmation).
- **Failure modes**: `npm trust` not available (npm < 11.15 — not the
  case here); 2FA challenge fails (re-tap yubikey); package not found
  (first-publish didn't land — verify with `npm view`).
- **Scenarios**: register all 6; confirm via the web UI that each
  shows the trusted publisher.
- **Edge cases**: a package already has a trusted publisher (re-run
  errors with "already configured" — that's fine, idempotent goal).

## Constraints and dependencies

- After `add-release-workflow` (so `release.yml` is on `main`).
- Owner-driven (2FA). `mode: hitl`.
- This is the manual half of `release-ci-workflow`; the end-to-end
  CI test (a patch changeset that triggers an actual OIDC publish)
  follows in the task's acceptance check.
