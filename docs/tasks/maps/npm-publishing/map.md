---
kind: map
slug: npm-publishing
title: Publish @okf-kb packages to npm with a repeatable release process
status: done
tasks:
  - rename-to-okf-kb-scope
  - extract-auth-package
  - split-daemon-binary
  - fix-package-metadata
  - write-package-readmes
  - adopt-changesets
  - npm-account-setup
  - release-ci-workflow
  - first-publish
  - release-runbook
  - npm-logout-reminder
---

## Destination

The six public packages of this repo are published to the **`@okf-kb`** scope on
npm, and cutting a release is a routine, CI-driven operation:

- All public packages are renamed from `@kb/*` → `@okf-kb/*` (matching the
  repo identity) with internal imports updated and the build/tests green.
- A new light **`@okf-kb/auth`** package holds the token logic
  (`getOrMintToken` + `@napi-rs/keyring`), so the **client CLI** depends only
  on `@okf-kb/auth` + `@okf-kb/protocol` — no `@okf-kb/fs`, no
  `@xenova/transformers`, no `better-sqlite3`. The client install is light.
- Two binaries ship:
  - **`okfkb`** (from `@okf-kb/cli`) — the client; calls a running daemon.
  - **`okfkbd`** (from `@okf-kb/daemon`) — the daemon runner; carries the
    heavy fs/embedder deps. `okfkb daemon` subcommand is removed.
- Every public package has correct publish metadata (`files`, `prepublishOnly`,
  `license`, `publishConfig: {access: public}`) and a README.
- **Changesets** manages versioning + changelog; inter-package deps are pinned
  at publish time (no fragile `"*"`).
- A **GitHub Actions release workflow** builds, tests, and publishes with npm
  provenance (SLSA) via OIDC — no long-lived personal tokens.
- The **first release** lands all six packages on npm; `npx @okf-kb/cli` and
  `okfkbd` work for a fresh consumer.
- A **release runbook** documents how to cut a subsequent release.

`@okf-kb/pi-adapter` stays **private** (pi-specific; not published).

## Constraints

- **Scope rename is mandatory first.** Everything downstream (bin names,
  changesets, CI, publishConfig) assumes `@okf-kb/*`.
- **`@okf-kb/fs` stays heavy** (~95 MB: `@xenova/transformers` 68 MB +
  `better-sqlite3` 27 MB). Accepted as-is; no dep splitting this round. The
  client CLI avoids this weight by not depending on `@okf-kb/daemon`/`fs`.
- **`@okf-kb/pi-adapter` is never published** — it depends on
  `@earendil-works/pi-*` and the pi-specific `install:pi` script.
- **The pi extension symlink** (`~/.pi/agent/extensions/pi-kb`) is **not**
  renamed here — the owner will change the install method later.
- **npm scope `@okf-kb`** must be created on npmjs.com before first publish;
  scoped packages need `--access public` (or `publishConfig.access: public`).
- **Bin name collision**: the unscoped `kb@0.0.5` exists on npm. We avoid it by
  using `okfkb` / `okfkbd`, not `kb`.
- **Provenance** requires publishing from GitHub Actions with an OIDC-backed
  npm token (npm "Provenance" / granular access token with `id-token: write`).

## Decisions so far

- Destination = **repeatable release process** (Changesets + CI + provenance +
  runbook), not a one-time manual publish.
- npm scope = **`@okf-kb`** (matches repo identity; rename from `@kb/*`).
- Binaries = **`okfkb`** (client) + **`okfkbd`** (daemon runner).
- Heavy `@okf-kb/fs` deps = **kept as-is** (95 MB accepted; the client CLI
  sidesteps them via the auth extraction).
- **Extract `@okf-kb/auth`** so the client CLI is genuinely light — without
  this, `okfkb` would transitively pull 95 MB through `@okf-kb/daemon`.

## Fog

- npm dist-tag strategy (`latest` vs `next` for prereleases) — not decided;
  can be added once the first release is out.
- Whether the npm org needs a "verified publisher" setup or 2FA enforcement
  policy — resolves during `npm-account-setup`.
- Exact license (MIT assumed) — confirm during `fix-package-metadata`.
- Whether `@okf-kb/fs`'s `@xenova/transformers` should become an
  `optionalDependency` later for literal-search-only consumers — deferred
  (out of scope this round; revisit if install weight becomes a complaint).

## Out of scope

- Publishing `@okf-kb/pi-adapter` (private, pi-specific).
- Splitting `@okf-kb/fs`'s heavy deps or extracting an `@okf-kb/embedder`
  package (decided against this round).
- Renaming the pi extension symlink `~/.pi/agent/extensions/pi-kb` (owner
  will change the install method later).
- Migration tooling for existing `@kb/*` consumers (none exist — first
  publish, no consumers to migrate).
- npm verified-publisher badge / org verification (cosmetic; later).

## Completed

All 11 tasks done. Outcome:

- 6 public packages live on npm under `@okf-kb` (core, protocol, fs,
  daemon, cli, auth), current version 0.1.4, each with SLSA provenance.
- Two binaries: `okfkb` (light client) + `okfkbd` (daemon).
- Tag-triggered lockstep releases via OIDC Trusted Publishing (no
  `NPM_TOKEN`); proven end-to-end by the `v0.1.4` release.
- Docs: `docs/adding-a-package.md` (new-package playbook) +
  `docs/release-runbook.md` (release flow).
- Repo `Y4shin/okf-kb` is public (npm provenance requirement).

Three real bugs found and fixed during the E2E tests (v0.1.1–v0.1.4):
CI build order, the bogus `--provenance` flag, and npm provenance's
public-repo + `repository`-field requirements.
