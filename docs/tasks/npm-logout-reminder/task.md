---
kind: task
type: manual
slug: npm-logout-reminder
title: "REMINDER: npm logout after first publish (remove the account-wide legacy token)"
map: npm-publishing
status: done
blocked_by:
  - first-publish
---

## Exact prerequisite

The one-time first publish (`first-publish`) has succeeded and all six
`@okf-kb` packages are on npm. The account-wide legacy publish token
written by `npm login` (to `~/.npmrc`) is still present and must be
removed.

This task exists only to make sure the logout actually happens. It is
the closeout of the `npm-account-setup` credential lifecycle: we chose
`npm login` + `npm logout` for the first publish specifically so no
long-lived credential remains. If this is skipped, a legacy publish
token (npm's least-secure kind, the one npm is actively restricting)
lingers account-wide indefinitely.

## Owner / actor

- **Owner**: user (the only one who can run `npm logout` interactively).

## Checklist / safe automation boundary

1. Confirm `first-publish` is done (all six `@okf-kb` packages live on
   npm, Trusted Publisher registrations complete).
2. Run `npm logout` locally. This removes the auth token from
   `~/.npmrc`.
3. Verify the token is gone:
   - `npm whoami` → expect `ENEEDAUTH` (not logged in).
   - `grep -c '_authToken\|_auth' ~/.npmrc` → 0 (no token lines).
4. Confirm the account on npmjs.com shows no active legacy/granular
   token for this (Tokens page → none named from this flow). If a
   token entry remains, delete it in the UI.

## Evidence required to mark it done

- `npm whoami` output showing `ENEEDAUTH` (not logged in).
- `~/.npmrc` grep showing no `_authToken`/`_auth` lines.
- (Optional) npmjs.com Tokens page screenshot showing no leftover
  token from this flow.

## Dependent tasks that remain blocked

- `release-runbook` finalization — the map's "repeatable release
  process" destination is only fully realized once no one-time
  credential lingers. (Soft block: the runbook can be written earlier,
  but the map isn't "done" until this logout is confirmed.)

## Why this is a task, not a step

A bare "remember to logout" note is easy to forget across the days
between the first publish and cleanup. Making it a tracked task with
evidence ensures the credential lifecycle closes. The whole point of
choosing login/logout over a long-lived token was "no long-lived
credential" — this task is what delivers that promise.
