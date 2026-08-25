# Uncertainty — `setup-changesets` slice

## Blocker

Switching inter-package dependencies to `workspace:*` breaks `npm install` in this environment:

```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

I verified this with:
- The system npm (`/home/pplattner/.nix-profile/bin/npm`) reporting `npm@11.16.0`.
- A locally installed `npm@11.16.0` invoked via `npx npm@11.16.0 install`.
- Both fail at `npm-package-arg` while resolving `packages/cli/package.json` (and any other package that uses `workspace:*`).

The architecture spec states: *"`workspace:*` requires npm 7+ (on 11.16.0 — fine)."* The observed behavior contradicts that — this npm build does not recognize the `workspace:` protocol at all.

## What was done

1. Installed `@changesets/cli` and `@changesets/changelog-github` as root devDependencies.
2. Created `.changeset/config.json` exactly as instructed:
   ```json
   {
     "changelog": ["@changesets/changelog-github", { "repo": "Y4shin/okf-kb" }],
     "access": "public",
     "baseBranch": "main",
     "privatePackages": { "version": true, "tag": false }
   }
   ```
3. Created `.changeset/README.md`.
4. Attempted the `workspace:*` switch across the relevant `package.json` files.
5. Reverted the `workspace:*` switch because it prevents `npm install` from running.

## What still works

- `npm run typecheck` passes.
- `npm test` passes: `221 passed, 1 skipped`.
- These pass with the existing `"*"` inter-package dependency ranges.

## Prior state of the repo

Two earlier commits (`fe8327e` and `9c175e2`) already implemented a Changesets setup. In that version:
- Inter-package deps were intentionally left as `"*"`.
- `.changeset/config.json` included:
  - `"updateInternalDependencies": "patch"`
  - `"bumpVersionsWithWorkspaceProtocolOnly": false`
- The commit message explicitly noted: *"Inter-package deps STAY '*' (npm-workspaces form; the workspace: protocol is pnpm/yarn-only and npm rejects it with EUNSUPPORTEDPROTOCOL). Changesets rewrites '*' to exact versions at publish time via updateInternalDependencies."*

This prior implementation was overwritten/reverted by the current slice instructions, but the underlying npm limitation appears to still exist in this environment.

## Options considered

1. **Keep `workspace:*` and switch to pnpm/yarn**
   - Out of scope for this slice; would require changing the package manager and lockfile.
2. **Keep `workspace:*` and find an npm build that supports it**
   - Tried the system npm and a fresh `npm@11.16.0` install; neither recognizes `workspace:`.
   - Would need to verify/change the environment, which is not something the slice can do.
3. **Revert to `"*"` inter-package deps and restore `updateInternalDependencies` / `bumpVersionsWithWorkspaceProtocolOnly` config**
   - Matches the prior working implementation.
   - `npm install`, `typecheck`, and `npm test` all pass.
   - `changeset version` and `changeset publish` should still pin versions at publish time.

## Recommended approach

Adopt **option 3**: keep `"*"` inter-package deps and add back the npm-workspaces-oriented Changesets config (`updateInternalDependencies: "patch"`, `bumpVersionsWithWorkspaceProtocolOnly: false`). This keeps the monorepo installable with the actual npm in this environment while still letting Changesets pin exact versions during `changeset version` / `changeset publish`.

## Decision needed

Should the slice proceed with the `workspace:*` form despite it breaking `npm install` here, or should it use the `"*"` + `updateInternalDependencies` form that works with the current npm environment?
