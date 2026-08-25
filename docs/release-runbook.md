# Release Runbook

How to cut a release of the `@okf-kb/*` packages. This documents the
**tag-triggered, lockstep, OIDC** release pipeline that's wired up in
`.github/workflows/release.yml` and verified end-to-end (the `v0.1.4`
release was the first green run).

> For adding a *new* package to the monorepo (vs. releasing existing
> ones), see [`docs/adding-a-package.md`](adding-a-package.md).

---

## TL;DR — routine release

```sh
# 1. (in normal PRs) record intent to release:
npx changeset            # interactive: pick packages, bump type, message
# … commit the .changeset/*.md file with your change …

# 2. when ready to release, on main:
npx changeset version     # consumes .changeset/*.md → bumps all 6 + writes CHANGELOGs
git add -A && git commit -m "chore(release): vX.Y.Z"
git tag --no-sign -a vX.Y.Z -m "vX.Y.Z — <one-line>"
git push origin main --tags     # the tag push IS the consent; CI publishes
```

That's it. The `Release` workflow runs on the `vX.Y.Z` tag, builds,
tests, and publishes all 6 packages to npm with SLSA provenance — no
token, no manual `npm publish`. Verify (below), then you're done.

---

## Prerequisites (already in place — check only if something breaks)

- **npm org `@okf-kb`** exists, you're the owner (`npm org ls okf-kb`).
- **`release.yml`** is on `main` (`on: push: tags: ['v*']`).
- **Each package is a Trusted Publisher** on npm, bound to
  `Y4shin/okf-kb` + `release.yml`. Re-verify with
  `npm trust github @okf-kb/<pkg> --file release.yml --repo Y4shin/okf-kb --allow-publish -y`
  (expect `E409 Conflict` = already registered).
- **Repo is public** (`gh repo view Y4shin/okf-kb --json visibility` →
  `PUBLIC`). npm provenance requires a public source repo. If you ever
  make it private, drop `NPM_CONFIG_PROVENANCE` from the workflow
  (OIDC auth still works; you just lose the SLSA attestation).
- **Each package.json has a `repository` field** pointing at
  `https://github.com/Y4shin/okf-kb.git` (required by provenance).
- **The lockstep `fixed` group** in `.changeset/config.json` lists all 6
  public packages (so one tag releases them together).

No `NPM_TOKEN` secret anywhere — that's the point of Trusted Publishing.

---

## Routine release — in detail

### 1. Record intent (per change, in a normal PR)

When you make a change that should be released, add a changeset:

```sh
npx changeset
```

Interactive: select the affected package(s) (all 6 are in the `fixed`
group, so picking any one will bump all of them together at release
time — but you still record *which package's change* this is, for the
changelog), pick `patch` / `minor` / `major`, write a one-line summary.
This creates `.changeset/<random>.md`. Commit it with your change in a
normal PR and merge to `main`.

> A changeset file looks like:
> ```
> ---
> "@okf-kb/cli": minor
> ---
> Add the --json flag to search.search-unified.
> ```
> For lockstep releases you can list all 6 packages in one changeset
> (they bump together anyway), or just the one you changed — the
> `fixed` group ensures all 6 release in unison.

### 2. Cut the release (on `main`)

```sh
npx changeset version
```

This consumes every pending `.changeset/*.md`, bumps the version of
every package in the `fixed` group to the **highest** requested bump
across all changesets (lockstep), writes each package's `CHANGELOG.md`,
and deletes the consumed changeset files.

Inspect what changed:

```sh
git status   # 6× package.json version bumps + 6× CHANGELOG.md (new/updated)
```

Sanity-check the build + tests at the new version:

```sh
npm run typecheck   # tsc --build (dep-ordered, emits dist/)
npm test            # 221 passed / 1 skipped
```

### 3. Commit, tag, push (the consent)

```sh
git add -A
git commit -m "chore(release): vX.Y.Z"
git tag --no-sign -a vX.Y.Z -m "vX.Y.Z — <one-line summary>"
git push origin main --tags
```

- `--no-sign` because GPG pinentry hangs in non-interactive shells; if
  your shell is interactive and you want GPG-signed tags, drop
  `--no-sign` (your `tag.gpgSign=true` config will sign via yubikey).
- **Only the tag push triggers the release.** A plain `main` push runs
  nothing (the workflow trigger is `push: tags: ['v*']` only).

### 4. Watch + verify

```sh
gh run list -R Y4shin/okf-kb --limit 1      # see the run kick off
gh run watch <run-id> -R Y4shin/okf-kb       # or watch it
```

When it's green, verify all 6 packages landed on npm:

```sh
for p in core protocol fs daemon cli auth; do
  printf "@okf-kb/%s: " "$p"
  curl -s "https://registry.npmjs.org/@okf-kb%2f$p" | grep -o '"latest":"[^"]*"'
done
```

Confirm provenance is attached (the SLSA attestation):

```sh
curl -s "https://registry.npmjs.org/@okf-kb%2fcore/<version>" \
  | grep -o '"predicateType":"https://slsa.dev/provenance/v1"'
# → prints the predicate type if provenance is present
```

Fresh-install smoke test (the architecture win — the client stays light):

```sh
tmp=$(mktemp -d) && cd "$tmp" && npm init -y >/dev/null
npm install @okf-kb/cli
npx okfkb --help                      # → Usage: okfkb ...
npx okfkb config                      # → KB_URL / KB_HOME / Token present
npm ls @xenova/transformers 2>&1 | head -1   # → (empty) — NOT in the client tree
npm ls better-sqlite3        2>&1 | head -1   # → (empty)
cd / && rm -rf "$tmp"
```

The client tree must NOT contain `@xenova/transformers` or
`better-sqlite3` (those 95 MB stay on the daemon side via
`@okf-kb/daemon`).

---

## Bump types

Changesets bumps every package in the `fixed` group to the **highest**
bump across all pending changesets. So one `minor` changeset releases
all 6 as a minor; a `patch` only if every changeset is `patch`.

- **`patch`** — bugfix, no new API. `0.1.4 → 0.1.5`.
- **`minor`** — new feature, backward-compatible. `0.1.4 → 0.2.0`.
- **`major`** — breaking change. `0.1.4 → 1.0.0`. (Bump all 6 together
  — lockstep — since they're a cohesive set; coordinate a major
  carefully.)

The bump type is set in the changeset file's frontmatter when you run
`npx changeset`. You can edit it before `changeset version` if you
change your mind.

---

## Recovery

### Bad release — deprecate (don't unpublish if you can avoid it)

npm allows **unpublish** within **72 hours** of publish, but it's
discouraged (breaks anyone who already installed). Prefer **deprecate**:

```sh
npm deprecate @okf-kb/<pkg>@<bad-version> "Use <good-version> instead; <reason>"
```

This leaves the version installable but shows a deprecation warning.
The version stays in the registry's history (can't be re-published
over).

### Unpublish (within 72h, last resort)

```sh
npm unpublish @okf-kb/<pkg>@<version>     # only works ≤72h after publish
```

Unpublishing a version that has dependents can break them. Use
deprecate instead whenever possible. After 72h, unpublish is impossible
and deprecate is your only option.

### Yank a dist-tag

If you published with the wrong tag (e.g. accidentally to `latest`):

```sh
npm dist-tag rm @okf-kb/<pkg> <tag>
npm dist-tag add @okf-kb/<pkg>@<version> <tag>
```

Routine releases use `latest` (the default); you rarely need this.

### A failed CI publish

If the `Release` workflow fails at the publish step, the tag already
exists so re-pushing it won't re-trigger. Fix the workflow on `main`,
then **bump again** (a new patch changeset → `changeset version` → new
tag → push). Don't try to re-use a tag. (We hit this on `v0.1.1`–
`v0.1.3` while debugging the pipeline; `v0.1.4` was the first green.)

---

## Fallback: manual publish (if CI is down)

For emergencies only — after the one-time `first-publish`, you should
publish via CI. If CI is genuinely broken and you must release:

```sh
npm whoami                # confirm your npm login (2FA) is active
npx changeset version    # bump + changelog (if not already done)
npm run typecheck        # build (tsc --build, dep-ordered)
npx changeset publish --otp <yubikey-otp>
```

`--otp` passes your 2FA code inline (no browser flow). This publishes
**without provenance** (local publishes can't generate the SLSA
attestation — that requires CI). The packages land; the next CI release
can re-publish a subsequent version with provenance.

> After any manual publish, remember to `npm logout` to remove the
> account-wide token from `~/.npmrc` (see the `npm-logout-reminder`
> task). Don't leave the publish credential around.

---

## Install (for consumers)

```sh
# the light client (no @xenova/sqlite):
npm install -g @okf-kb/cli
okfkb --help
okfkb config

# the daemon (carries the ~95 MB fs/embedder deps):
npm install -g @okf-kb/daemon
okfkbd --help
okfkbd                    # starts on http://127.0.0.1:30700
```

The CLI and daemon share a Bearer token via the OS keyring
(`@okf-kb/auth`); set `KB_TOKEN` to override.

---

## See also

- [`docs/adding-a-package.md`](adding-a-package.md) — adding a NEW
  package (vs. releasing existing ones).
- [`docs/setup-guide.md`](setup-guide.md) — local daemon + Silverbullet
  deployment.
- [`docs/remote-deployment.md`](remote-deployment.md) — TLS reverse
  proxy for the daemon.
- [`.changeset/config.json`](../.changeset/config.json) — the lockstep
  `fixed` group + Changesets config.
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) —
  the release workflow itself.
- [Changesets docs](https://changesets.dev) — the upstream tool docs.
