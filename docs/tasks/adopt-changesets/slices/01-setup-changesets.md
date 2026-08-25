---
kind: slice
slug: setup-changesets
title: Install @changesets/cli, config, switch inter-package deps to workspace:*
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

`npm run changeset` works; inter-package deps use `workspace:*`;
`changeset version` on a test changeset bumps + writes CHANGELOGs; the
build/tests stay green.

## Acceptance criteria

- `npm i -D @changesets/cli @changesets/changelog-github` (or the default
  changelog) at the root.
- `.changeset/config.json`: `changelog`, `access: "public"`,
  `baseBranch: "main"`, `packages: ["packages/*"]` (or omitted — auto
  from workspaces), `updateInternalDependencies: true`.
- Each inter-package dep `"<@okf-kb/X>": "*"` → `"<@okf-kb/X>":
  "workspace:*"` across all package.jsons.
- Root scripts: `"changeset": "changeset"`, `"version": "changeset
  version"`, `"publish:changes": "changeset publish"` (naming chosen to
  not shadow anything).
- `.changeset/README.md` seed present.
- Smoke test: create `.changeset/sample.md`, run `npm run version`,
  assert one package's version bumped + its `CHANGELOG.md` created; then
  `git checkout` to revert the sample bump (keep the config).
- `npm run typecheck` + `npm test` green; `npm install` clean.

## Test plan

- **Seams**: `npm install` (workspace:* resolution); `changeset version`
  (writes CHANGELOGs); `tsc --build`; `npm test`.
- **Failure modes**: a dep still `"*"` → Changesets won't pin it;
  `workspace:*` not recognized (need npm 7+ / workspaces — already on
  npm 11).
- **Scenarios**: the sample-changeset bump+revert; full `npm test`.
- **Edge cases**: `@okf-kb/pi-adapter` is private — Changesets should
  ignore it for publish but can still version it; set
  `privatePackages: false` (or `privatePackages: { version: true,
  tag: false }`) in config — decide and document.

## Constraints and dependencies

- After `split-daemon-binary` (final package set + names exist).
- Do not run `changeset publish` here — that's `first-publish`.
