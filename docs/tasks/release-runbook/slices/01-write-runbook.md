---
kind: slice
slug: write-runbook
title: Write docs/release-runbook.md
task: ../task.md
mode: hitl
status: done
size: s
blocked_by: []
---

## End-to-end behavior

`docs/release-runbook.md` exists, is accurate to the landed workflow,
and a maintainer can follow it end-to-end.

## Acceptance criteria

- File `docs/release-runbook.md` created per task body.
- All sections present (prereqs, routine release, bump levels, verify,
  fallback manual, recovery, binaries).
- Cross-links to setup-guide + Changesets docs.
- No secrets.

## Test plan

- **Seams**: hitl review (owner reads + tries a step mentally); link
  check (the referenced files exist).
- **Failure modes**: references a workflow step that doesn't match the
  landed `release.yml`; a broken link.
- **Scenarios**: follow the "routine release" section against the
  actual repo state.
- **Edge cases**: note the 72-hour unpublish window (npm policy) in
  recovery — it's time-sensitive and easy to miss.

## Constraints and dependencies

- After `release-ci-workflow` (describes the actual workflow).
- `mode: hitl` — owner reviews; ideally validated against the real
  first release (from `first-publish`).
