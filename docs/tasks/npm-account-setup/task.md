---
kind: task
type: manual
slug: npm-account-setup
title: Create @okf-kb npm org; npm login (account-wide token for first publish only; logout reminder tasked)
map: npm-publishing
status: done
blocked_by: []
---

## Exact prerequisite

- An npm account (the owner's) owns a **`@okf-kb`** organization on
  npmjs.com.
- 2FA enabled on the account (yubikey) — **required** for Trusted
  Publishing and for the manual first publish.
- The local machine is `npm login`-ed (interactive, yubikey 2FA) so the
  one-time first publish of each package can run locally.
- **No long-lived publish token is created on npmjs.com** (no granular
  bypass-2FA token, no stored `NPM_TOKEN` secret). The `npm login`
  writes a *legacy publish token* to the account-wide `~/.npmrc`; it is
  used only for the first publish and removed by `npm logout`
  immediately after (tracked by `npm-logout-reminder`).
- All releases after the first use **Trusted Publishing (OIDC)** from
  GitHub Actions — no token, no secret; npm verifies the publish came
  from `Y4shin/okf-kb` + `release.yml`.

## Why this shape

- `npm login` has **no repo-only / project-scoped flag** — it always
  writes an account-wide token to `~/.npmrc` (verified against the npm
  docs). That token is npm's "legacy token of publish type" (its
  least-secure kind). So login/logout is the chosen lifecycle: the
  credential exists only for the duration of the first publish.
- We rejected the bypass-2FA granular token (npm's red-warning path;
  actively being restricted) and we rejected a stored `NPM_TOKEN`
  secret (long-lived, leakable). The owner's 2FA is a physical yubikey
  that CI can never satisfy, which is exactly why a long-lived CI token
  would have to bypass 2FA — Trusted Publishing removes that whole
  tradeoff for later releases.
- Repo-confinement for later releases is by construction: npm only accepts
  publishes from the registered `Y4shin/okf-kb` + `release.yml`. For the
  one-time first publish, the credential is account-wide but
  short-lived (removed right after).

## Owner / actor

- **Owner**: user (the npm account holder). The agent may draft the
  steps and verify the org exists via `npm view`, but cannot create the
  org or the token.

## Checklist / safe automation boundary

1. ✅ Create the `@okf-kb` org on https://www.npmjs.com/org/create
   (done). You are the owner.
2. ✅ Enable 2FA on the account (yubikey) (done).
3. `npm login` locally (interactive, yubikey 2FA). This writes a
   legacy publish token to the account-wide `~/.npmrc`. It is
   account-wide (npm offers no repo-only login) and is used **only**
   for the one-time first publish; `npm-logout-reminder` tracks its
   removal right after.
4. **Do not** create the bypass-2FA granular token on npmjs.com (skip
   that token screen). Trusted Publishing replaces it for all
   releases after the first.
5. Verify:
   - `npm whoami` shows your account.
   - `npm org ls` shows `okf-kb`.
   - `gh secret list -R Y4shin/okf-kb` is empty (no `NPM_TOKEN` — by
     design).

## Evidence required to mark it done

- `npm whoami` output (the account name).
- Confirmation that `@okf-kb` org exists (`npm org ls`).
- `gh secret list -R Y4shin/okf-kb` is **empty** (no `NPM_TOKEN` — by
  design, Trusted Publishing needs no secret).

The Trusted Publisher *registrations* (per package) are done after the
first publish, not here — see `release-ci-workflow` / `first-publish`.

## Dependent tasks that remain blocked

- `first-publish` (needs `npm login` to do the manual first publish;
  needs the org). Now also owns the post-publish Trusted Publisher
  registration per package.
- `release-ci-workflow` (no `NPM_TOKEN` secret needed — the workflow
  uses `id-token: write` + `npm publish --provenance` only; but the
  packages must be registered as Trusted Publishers first, which
  happens in `first-publish`).
