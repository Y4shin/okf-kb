---
kind: task
type: feature
slug: release-runbook
title: Write the release runbook (how to cut a release)
map: npm-publishing
status: done
blocked_by:
  - release-ci-workflow
slices:
  - write-runbook
---

## User-visible outcome

`docs/release-runbook.md` documents how to cut a release: add a
changeset, merge to main, CI publishes, verify. Covers the first-release
path (done) and routine releases, plus recovery (unpublish window,
deprecate). A future maintainer can follow it without tribal knowledge.

## User story

As a maintainer (or a future me), I open one doc and release a new
version without remembering the workflow, the token, or the verify
steps.

## Scope boundaries

- **In scope**: `docs/release-runbook.md`; references the
  `release-ci-workflow` and `first-publish` outcomes.
- **Out of scope**: the workflow file itself (done in
  `release-ci-workflow`); npm account setup (done); a contributor guide
  for *writing* changesets (Changesets' own docs suffice — link).

## Acceptance criteria

- `docs/release-runbook.md` covers:
  - Prerequisites (org, token, CI, all merged).
  - Routine release: add `.changeset/*.md` → PR → merge → CI publishes.
  - How to bump major/minor/patch via changeset.
  - Verifying: npm page, provenance badge, changelog, fresh-install
    smoke test (the light client tree).
  - The fallback manual publish (if CI is down): `changeset version` +
    `changeset publish --provenance` locally.
  - Recovery: npm's 72-hour unpublish window; `npm deprecate` for
    bad releases; yank a dist-tag.
  - The two binaries' install commands (`@okf-kb/cli` → `okfkb`,
    `@okf-kb/daemon` → `okfkbd`).
- Links to `docs/setup-guide.md` (deployment) and the Changesets docs.
- No secrets in the doc; the token is referenced by name only
  (`NPM_TOKEN`).

## Existing abstractions to use

- The `first-publish` task's checklist is the seed for the runbook's
  "first release" section.

## Relevant architecture / domain decisions

- The runbook is part of the "repeatable release process" destination —
  it's what makes the process survive the author leaving.
