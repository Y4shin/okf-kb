# Architecture Spec — `adopt-changesets`

Adopt [Changesets](https://changesets.dev) for versioning + changelog.
Switch inter-package deps from `"*"` to `workspace:*` so
`changeset publish` pins exact versions at publish time. Configure
`.changeset/`, add root scripts, verify the version + publish flow
works (without actually publishing).

## Slice (single)

- **setup-changesets:** install `@changesets/cli`; `.changeset/config.json`;
  switch all inter-package `@okf-kb/*` deps from `"*"` to `"workspace:*"`;
  add root `changeset`/`version`/`publish:changes` scripts; smoke-test
  `changeset version` on a sample changeset and revert.

## Existing abstractions to use

- npm workspaces (already configured). Changesets is the canonical
  versioning tool for npm workspaces.
- The existing `docs/tasks/CHANGELOG.md` is the *task* changelog
  (separate) — Changesets writes per-package `CHANGELOG.md` files at
  package roots; don't confuse the two.

## Do NOT reimplement

- Do not run `changeset publish` here (that's `first-publish`).
- Do not change versions (leave 0.1.0; a sample changeset bumps+reverts).
- `@okf-kb/pi-adapter` is private — config `privatePackages` so it's
  versioned but not published (or excluded from publish). Decide + document.

## Seams under test

1. `npm run changeset` launches the interactive adder.
2. `changeset version` on a sample changeset bumps the targeted package
   + writes its `CHANGELOG.md`; revert the sample.
3. `npm install` resolves cleanly with `workspace:*`.
4. `npm run typecheck` + `npm test` green.

## Exact edit map

- `npm i -D @changesets/cli @changesets/changelog-github` at root.
- `.changeset/config.json`: `changelog: ["@changesets/changelog-github",
  { repo: "Y4shin/okf-kb" }]`, `access: public`, `baseBranch: main`,
  `privatePackages: { version: true, tag: false }` (version private
  pkg, don't publish).
- `.changeset/README.md` seed (the default explanatory file).
- Each inter-package dep `"<@okf-kb/X>": "*"` → `"workspace:*"` across
  all package.jsons (protocol, fs, daemon, cli, auth, pi-adapter, +
  pi-adapter/extension's `file:` deps — leave `file:` as-is; Changesets
  handles `workspace:` and `file:` differently; only switch the `*`
  ones).
- Root scripts: `"changeset": "changeset"`, `"version": "changeset
  version"`, `"publish:changes": "changeset publish"`.
- Smoke test: create `.changeset/sample.md`, `npm run version`, assert
  a CHANGELOG created + version bumped, then `git checkout` to revert
  (keep config + scripts).

## Risks
- `workspace:*` requires npm 7+ (on 11.16.0 — fine).
- The pi-adapter/extension uses `file:` deps — do NOT switch those to
  `workspace:*` (file: is correct for the extension's local resolution).
- `@changesets/changelog-github` needs no token for local `version`
  (only for published changelog linking; works offline).
