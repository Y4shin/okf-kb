# Adding a New Package — npm Playbook

This is the checklist for adding a **new publishable package** to this
monorepo under the `@okf-kb` scope. It captures everything we learned
standing up the publish pipeline (rename, auth extraction, bin split,
metadata, changesets, OIDC trusted publishing, tag-triggered releases).

The packages today are `@okf-kb/{core,protocol,fs,daemon,cli,auth}`
(public) and `@okf-kb/pi-adapter` (private, never published). Releases
are **lockstep** (all public packages share one version) and
**tag-triggered** (pushing a `vX.Y.Z` tag is the consent to release).

---

## 0. Decide: public or private?

- **Public** → it gets published to npm, must be in the `fixed` group,
  must be registered as a Trusted Publisher. Most new packages are this.
- **Private** (`@okf-kb/pi-adapter` is the existing example) → set
  `"private": true` in its `package.json`; it's versioned by Changesets
  but never published/tagged (`.changeset/config.json`
  `privatePackages: { version: true, tag: false }`). Skip steps 5–7.

---

## 1. Create the package

Mirror an existing small package's structure. `@okf-kb/auth` or
`@okf-kb/protocol` are good templates.

```
packages/<name>/
  package.json
  tsconfig.json
  src/index.ts        # re-exports the public surface
  src/<impl>.ts
  tests/<x>.test.ts
```

`package.json` — **all of these fields are mandatory** (they're what
makes `npm publish` ship a working tarball; missing them was the original
packaging bug):

```json
{
  "name": "@okf-kb/<name>",
  "type": "module",
  "version": "0.1.0",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "publishConfig": { "access": "public" },
  "files": ["dist", "!dist/tsconfig.tsbuildinfo"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "dependencies": { /* @okf-kb/* deps as "*", external deps as "^x.y" */ },
  "devDependencies": { /* test-only @okf-kb/* deps as "*" go here, NOT in dependencies */ }
}
```

Critical rules (each was a real bug we hit):

- **`files: ["dist", "!dist/tsconfig.tsbuildinfo"]`** — `dist/` is
  gitignored, so without `files` the tarball ships source-only and
  throws `ERR_MODULE_NOT_FOUND` on install. The `!dist/tsconfig.tsbuildinfo`
  negation excludes build metadata bloat (only needed if the package's
  `tsconfig.json` has `rootDir: "."` like `@okf-kb/cli`).
- **`prepublishOnly: "npm run build"`** — always rebuild before pack,
  so a stale `dist/` never ships.
- **`license: "MIT"`** + a `LICENSE` file in the package dir (npm
  includes each package's own `LICENSE` in its tarball).
- **`publishConfig: { access: public }`** — scoped packages default to
  restricted (paid); this makes `npm publish` public without needing
  `--access public` every time.
- **`bin`** (only if the package ships a CLI): use the form
  `"bin": { "<binname>": "bin/<binname>.js" }` — **no leading `./`**.
  npm warns `"bin[x] script name ... was invalid and removed"` if you
  write `"./bin/..."`. (We hit this on `okfkb`/`okfkbd`.)
- **Test-only `@okf-kb/*` deps go in `devDependencies`, not
  `dependencies`** — e.g. `@okf-kb/cli`'s tests import `@okf-kb/fs` +
  `@okf-kb/daemon`, but the CLI's *runtime* deps stay light (no
  `@okf-kb/fs`), which is the whole reason the client install is ~light
  instead of ~95 MB. devDeps aren't installed in a client `npm install`.
- **Inter-package deps use `"*"`** (NOT `workspace:*` — that's pnpm/yarn
  only; npm 11 rejects it with `EUNSUPPORTEDPROTOCOL`). Changesets pins
  `"*"` to exact versions at publish time via
  `updateInternalDependencies: "patch"` in `.changeset/config.json`.
- **`@okf-kb/pi-extension`** (under `packages/pi-adapter/extension/`)
  uses `file:../../core` deps — leave those as `file:`, do NOT switch
  them to `*` or `workspace:*`.

`tsconfig.json` — extend the base + add a project reference per
`@okf-kb/*` *runtime* dependency (test-only deps don't need a ref):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "rootDir": "src", "outDir": "dist" },
  "references": [ { "path": "../core" } ],
  "include": ["src"]
}
```

Add a `tests/` dir if you have tests; it's not in `include` (vitest
picks it up) but `tsc --build` will still typecheck it via project refs.

## 2. Wire it into the workspace + build

- **Root `tsconfig.json`** — add `{ "path": "packages/<name>" }` to the
  `references` array. **Order matters for `tsc --build`**: place it
  *after* its dependencies and *before* its dependents. (e.g. `auth`
  before `daemon`, because `daemon` depends on `auth`.)
- **Root `package.json`** — nothing to change; `workspaces:
  ["packages/*"]` picks it up automatically.
- Run `npm install` (regenerates `package-lock.json`), then
  `npm run typecheck` (must exit 0) and `npm test` (must pass).

> The root `build` script is `npm run -ws --if-present build`, which
> builds in **alphabetical** order — that breaks in a clean CI checkout
> for packages whose deps build later alphabetically. The CI workflow
> uses `npm run typecheck` (`tsc --build`) instead, which respects
> project-reference dependency order AND emits `dist/`. **Locally, use
> `npm run typecheck` to build, not `npm run build`**, if you've cleaned
> `dist/`.

## 3. Add a README

Create `packages/<name>/README.md` — a few paragraphs: purpose, install
(`npm install @okf-kb/<name>`), a minimal usage snippet, and a link to
the root `README.md` / `docs/setup-guide.md` for deployment. npm
includes it in the tarball and renders it on the package page.

## 4. Add to the lockstep `fixed` group

**This is the step most likely to be forgotten.** Releases are
lockstep: a single `vX.Y.Z` tag bumps and publishes **all** packages in
the `fixed` group together. If a new public package isn't added to the
group, it won't release with the others.

Edit `.changeset/config.json` → `fixed` → add the new package name to
the inner array:

```jsonc
"fixed": [[
  "@okf-kb/core", "@okf-kb/protocol", "@okf-kb/fs",
  "@okf-kb/daemon", "@okf-kb/cli", "@okf-kb/auth",
  "@okf-kb/<name>"   // ← add here
]]
```

Verify: create a throwaway `.changeset/smoke.md` listing every package
as `patch`, run `npx changeset version`, confirm **all** packages
(including the new one) bumped together, then `git checkout -- .changeset/
packages/ && rm -f packages/*/CHANGELOG.md` to revert.

## 5. First publish — manual, local (the chicken-and-egg)

npm Trusted Publishing **cannot publish the first version of a
package** — the trusted-publisher settings page only exists *after* the
package is on npm. So the first version is published manually, once,
from a developer machine.

Prereq: `npm login` (interactive, 2FA — the owner's yubikey) is active
(`npm whoami` → the owner account). This writes an account-wide legacy
token to `~/.npmrc`; it's used **only** for first-publishes and removed
after (`npm logout` — see the `npm-logout-reminder` task).

```sh
npm run build                 # or `npm run typecheck` (tsc --build) after a clean
npm publish -w @okf-kb/<name> --access public
# → browser 2FA opens; tap yubikey; wait for "+ @okf-kb/<name>@0.1.0"
```

`prepublishOnly` fires automatically, so an explicit build first is
belt-and-suspenders. The publish is `--access public` (also enforced by
`publishConfig`, but the flag is harmless).

> **Propagation lag:** for a brand-new package in the `@okf-kb` scope,
> `npm view @okf-kb/<name>` can 404 for ~1–3 minutes after a successful
> publish (`PUT 200`, `exit 0`). Don't re-publish on a 404 — wait and
> retry. A re-publish that returns `E409 "cannot publish over the
> previously published versions"` proves it landed.

Verify on the registry:

```sh
curl -s "https://registry.npmjs.org/@okf-kb%2f<name>/0.1.0" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.version, d.license, d.publishConfig.access)"
```

## 6. Register the new package as a Trusted Publisher

After the package exists on npm, bind it to the release workflow so CI
can publish later versions via OIDC (no token). One command, 2FA:

```sh
npx npm trust github @okf-kb/<name> \
  --file release.yml --repo Y4shin/okf-kb --allow-publish -y
```

- `--file release.yml` = the **filename only**, not the path. npm binds
  to that filename in `Y4shin/okf-kb`'s `.github/workflows/`. It must
  match the workflow file (`.github/workflows/release.yml`).
- `--allow-publish` grants the publish action (vs stage-publish).
- Requires npm 11.15+ (we're on 11.16).

Verify (re-run the same command; expect `E409 Conflict` = already
configured, with `permissions: publish`):

```sh
npm trust github @okf-kb/<name> --file release.yml --repo Y4shin/okf-kb \
  --allow-publish -y 2>&1 | grep -E "409 Conflict|permissions: publish"
```

The authoritative confirmation is the package's npmjs.com Settings →
"Trusted Publisher" page (shows GitHub Actions / `Y4shin` / `okf-kb` /
`release.yml`).

## 7. Subsequent releases — tag-triggered, no manual publish

After the first publish + trusted-publisher registration, **never
publish from your laptop again.** Releases happen in CI on a tag push:

1. Accumulate `.changeset/*.md` files in normal PRs (one per change;
   `npx changeset` to create them interactively).
2. When ready to release: `npx changeset version` → bumps **all**
   packages in the `fixed` group together (lockstep) + writes each
   `CHANGELOG.md` + removes the consumed changeset files.
3. Commit the version bump + changelogs, tag `vX.Y.Z`, push the tag
   (and the commit to `main`):
   ```sh
   git commit -am "chore(release): vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```
4. The `Release` workflow runs (only on `v*` tags — merges to `main`
   run nothing): `npm ci` → `npm run typecheck` (builds in dep order,
   emits `dist/`) → `npm test` → `npx changeset publish --provenance`.
   Auth is OIDC (npm Trusted Publishing) — **no `NPM_TOKEN` secret**.
5. Verify all packages landed at the new version on npm (with
   provenance badges):
   ```sh
   for p in core protocol fs daemon cli auth <name>; do
     curl -s "https://registry.npmjs.org/@okf-kb%2f$p" | grep -o '"latest":"[^"]*"'
   done
   ```

**Consent model:** pushing the `vX.Y.Z` tag *is* the explicit consent.
Nothing releases on a plain merge. Do not re-enable a `push: branches`
trigger on the workflow — that would auto-run on every merge.

---

## Common pitfalls (all hit during setup)

- **Tarball ships source-only / `ERR_MODULE_NOT_FOUND` on install** →
  missing `files: ["dist"]`. (the original packaging bug)
- **`bin[x] script name ... was invalid and removed`** → `bin` value
  had a leading `./`; use `"bin/<name>.js"`.
- **`dist/tsconfig.tsbuildinfo` bloat in the tarball** → package has
  `rootDir: "."`; add `"!dist/tsconfig.tsbuildinfo"` to `files`.
- **CI build fails `Cannot find module '@okf-kb/...'`** → used
  `npm run build` (alphabetical) instead of `npm run typecheck`
  (`tsc --build`, dep-ordered). The workflow uses `typecheck`.
- **`npm install` fails `EUNSUPPORTEDPROTOCOL`** → someone used
  `workspace:*` (pnpm/yarn only). Use `"*"`; Changesets pins at publish.
- **Client install pulls 95 MB (`@xenova`/`better-sqlite3`)** → a
  light-weight package (e.g. `@okf-kb/cli`) listed `@okf-kb/fs` or
  `@okf-kb/daemon` in *runtime* `dependencies` instead of
  `devDependencies`. Keep heavy transitive deps in devDeps only.
- **`npm publish` 404s right after a successful publish** →
  propagation lag for a new scoped package; wait 1–3 min and retry.
  `E409` on re-publish = it landed.
- **OIDC publish `E404`** → the trusted-publisher registration doesn't
  match the workflow: `--file release.yml` (filename only) +
  `--repo Y4shin/okf-kb` must match the workflow's actual location.

## See also

- `docs/setup-guide.md` — local daemon + Silverbullet deployment.
- `docs/remote-deployment.md` — TLS reverse proxy for the daemon.
- `docs/testing.md` — test conventions per package.
- `.changeset/config.json` — the lockstep `fixed` group lives here.
- `docs/tasks/release-runbook.md` — the per-release runbook (once written).
- `docs/tasks/maps/npm-publishing/map.md` — the full planning map for
  this pipeline.
