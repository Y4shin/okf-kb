---
kind: task
type: feature
slug: adopt-changesets
title: Adopt Changesets for versioning + changelog (pin inter-package deps)
map: npm-publishing
status: done
blocked_by:
  - split-daemon-binary
slices:
  - setup-changesets
---

## User-visible outcome

The monorepo uses [Changesets](https://changesets.dev). Inter-package
deps are expressed with the `workspace:*` protocol (or Changesets' pinned
form) so `changeset publish` writes exact versions at publish time.
`.changeset/` is configured, `@changesets/cli` is a dev dep, and
`npm run changeset` + `changeset version` + `changeset publish` work.

## User story

As a maintainer, I add a `.changeset/*.md` describing a change, run
`changeset version` to bump + update the changelog, and `changeset
publish` to release. I never hand-edit version numbers or `"*"`
ranges. Consumers get a real changelog and pinned, resolvable versions.

## Scope boundaries

- **In scope**: `@changesets/cli` + config (`.changeset/config.json`);
  switch inter-package deps from `"*"` to `workspace:*` (or the
  changesets-managed pinned form); add `changeset` / `version` /
  `publish` scripts to root; a seed `.changeset/README.md`.
- **Out of scope**: the CI workflow that runs `changeset publish`
  (`release-ci-workflow`); the first actual publish (`first-publish`);
  changeset-bot GitHub App (optional, can add later).
- Decision: `workspace:*` (always latest) vs `workspace:^` (caret). For
  a first release `workspace:*` is fine; Changesets rewrites to exact at
  publish. Document the choice in the config comment.

## Acceptance criteria

- `@changesets/cli` in root devDependencies; `.changeset/config.json`
  with `changelog: @changesets/cli`, `access: public`,
  `baseBranch: main`.
- All inter-package deps (`@okf-kb/core` etc. in each package.json) use
  `workspace:*` (replacing `"*"`).
- Root `package.json` scripts: `changeset`, `"version": "changeset
  version"`, `"publish": "changeset publish"` (or similar).
- A `.changeset/README.md` seed explaining the format.
- `npm run changeset` launches the interactive adder; `changeset
  version` on a sample changeset bumps versions + updates
  `CHANGELOG.md` per package; revert the sample after.
- `npm run typecheck` + `npm test` green (dep protocol change shouldn't
  break runtime under workspaces).
- `npm install` still resolves cleanly with `workspace:*`.

## Existing abstractions to use

- npm workspaces — Changesets is the canonical workspace versioning tool
  for npm workspaces (no pnpm needed).
- The existing per-package `CHANGELOG.md` (if any) — Changesets will
  append; check `docs/tasks/CHANGELOG.md` (that's the *task* changelog,
  separate — don't confuse the two).

## Relevant architecture / domain decisions

- `"*"` today means "latest on registry" — fragile and order-dependent
  once published. `workspace:*` + Changesets pins at publish, which is
  the grown-up version.
- Changesets also generates the per-package `CHANGELOG.md` that npm
  renders — part of the "repeatable release process" destination.

## Implementation notes

### Slice 01 — setup-changesets (landed)

Landed: worker commit d856925 (install) + parent-completed commit fe8327e
(config + scripts + revert). The TDD worker stalled mid-task after only
installing @changesets/cli (incomplete, not the usual "finished but
stalled on report" pattern); the parent finished the remaining steps
directly (config, scripts, smoke test) — a small, well-specified task.

IMPORTANT CORRECTION to the original arch spec: the `workspace:*`
protocol is pnpm/yarn-only — npm 11.16.0 rejects it with
EUNSUPPORTEDPROTOCOL. Reverted the `*` → `workspace:*` switch; kept `"*"`
(the npm-workspaces form, which npm resolves to the local workspace
version). Changesets pins `"*"` to exact versions at publish time via
`updateInternalDependencies: "patch"` in .changeset/config.json. This is
the canonical npm-workspaces + Changesets setup.

Verified: npm install clean, typecheck clean, 221 passed / 1 skipped,
npx changeset status works (exits 1 = no pending changesets, expected),
npx changeset launches the interactive adder (pi-adapter shown as
private via privatePackages config).
