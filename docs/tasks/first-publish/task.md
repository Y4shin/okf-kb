---
kind: task
type: manual
slug: first-publish
title: First publish — manual one-time publish of @okf-kb packages
map: npm-publishing
status: done
blocked_by:
  - split-daemon-binary
  - fix-package-metadata
  - write-package-readmes
  - adopt-changesets
  - npm-account-setup
---

## Exact prerequisite

All structural + metadata + account work is merged to `main`, and you
are `npm login`-ed locally (done in `npm-account-setup`). The first
release publishes all six public packages to npm **manually** (one-time,
local, interactive yubikey 2FA) — this is the chicken-and-egg resolution
for npm Trusted Publishing, which **cannot publish a brand-new package**
(the trusted-publisher settings only exist after the first version is
on npm). No CI, no `NPM_TOKEN`, no provenance on this first publish.

After the packages exist, `release-ci-workflow` registers each as a
Trusted Publisher (that step moved to `release-ci-workflow` because the
`npm trust github --file release.yml` registration references the
workflow filename, which must exist first).

## Owner / actor

- **Owner**: user runs the local publish (interactive yubikey 2FA) and
  the npmjs.com trusted-publisher registrations. The agent verifies the
  result on npm and runs a fresh-install smoke test.

## Checklist / safe automation boundary

1. ✅ Confirmed all blockers done.
2. ✅ `npm whoami` = `y4shin` (login from `npm-account-setup` active).
3. ✅ `npm run build` produced `dist/` in all 6 packages.
4. ✅ Published the 6 public packages in dependency order, locally:
   `@okf-kb/core`, then `protocol`, `fs`, `daemon`, `cli`, `auth` — each
   via `npm publish -w @okf-kb/<x> --access public` with web-auth 2FA.
5. ✅ Verified on npm: all 6 at `0.1.0`, public, MIT, correct bins.
6. (MOVED to `release-ci-workflow`) Register each package as a Trusted
   Publisher — relocated because `npm trust github --file release.yml`
   references the workflow filename, which `release-ci-workflow` creates.
7. ✅ Smoke test in a clean temp dir.
8. Proceed to `release-ci-workflow` (writes `release.yml`, then runs the
   trusted-publisher registration, then tests end-to-end with a patch
   changeset).

Do NOT use a bypass-2FA granular token for this — that's the path npm
warns against and we rejected. The local login + yubikey is the chosen
credential lifecycle (removed via `npm-logout-reminder` after CI works).

## Evidence required to mark it done

- ✅ npm URLs for the six published packages (all 0.1.0, public, MIT).
- ✅ `npm ls` from the fresh `@okf-kb/cli` install showing the light dep
  tree (no xenova/sqlite).
- ✅ `okfkb --help` + `okfkb config` output from the fresh install.
- Trusted-publisher registrations: moved to `release-ci-workflow`.

## Dependent tasks that remain blocked

- `release-ci-workflow` — still blocked BY this task (packages must exist
  before the trusted-publisher settings pages exist). Now also OWNS the
  trusted-publisher registration step (CLI, after writing `release.yml`).
- `npm-logout-reminder` — still blocked by this task (the local `npm
  login` token is removed after the first publish + CI confirmation).
- `release-runbook` — documents this process; finalizes once CI works.

## Implementation notes

### First publish — landed 2026-08-25

All 6 packages published locally via `npm publish -w @okf-kb/<x>
--access public` with web-auth (yubikey 2FA). Each `npm publish` opened
a browser 2FA tab; the PUT returned 200 and npm exited 0.

Verified on the registry (curl `https://registry.npmjs.org/@okf-kb%2f<p>/0.1.0`):

- `@okf-kb/core` 0.1.0 — MIT, public, main ./dist/index.js
- `@okf-kb/protocol` 0.1.0 — MIT, public, main ./dist/index.js
- `@okf-kb/fs` 0.1.0 — MIT, public, main ./dist/index.js
- `@okf-kb/daemon` 0.1.0 — MIT, public, main ./dist/index.js, bin {okfkbd}
- `@okf-kb/cli` 0.1.0 — MIT, public, main ./dist/src/index.js, bin {okfkb}
- `@okf-kb/auth` 0.1.0 — MIT, public, main ./dist/index.js

Note: brand-new-scope propagation lag (~3 min per package) made `npm view`
404 briefly after each publish; cleared on retry.

Smoke test (clean temp dir, `npm install @okf-kb/cli`):
- `npx okfkb --help` → `Usage: okfkb [options] [command]` + the okfkb
  description. ✓
- `npx okfkb config` → prints KB_URL / KB_HOME / Token present. ✓
- `npm ls @xenova/transformers` / `npm ls better-sqlite3` → both absent
  from the client tree (the weight win: 95 MB stays on the daemon side). ✓
- Dep tree: `@okf-kb/cli` → `@okf-kb/auth` (+ @napi-rs/keyring) +
  `@okf-kb/protocol` → `@okf-kb/core` (zod) + @trpc/server. Light. ✓
