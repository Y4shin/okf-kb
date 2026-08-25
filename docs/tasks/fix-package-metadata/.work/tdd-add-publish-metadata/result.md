# Slice result: add-publish-metadata

## Summary

Implemented the publish metadata slice for all 6 public packages:

- Added `files: ["dist"]`, `license: "MIT"`, `publishConfig: { access: "public" }`, and `scripts.prepublishOnly: "npm run build"` to:
  - `@okf-kb/core`
  - `@okf-kb/protocol`
  - `@okf-kb/fs`
  - `@okf-kb/daemon`
  - `@okf-kb/cli`
  - `@okf-kb/auth`
- Created a root `LICENSE` file (MIT, Copyright (c) 2026 Y4shin).
- Copied the same `LICENSE` into each public package directory so `npm publish --dry-run` actually includes it in the tarball (root-only LICENSE was not inherited into workspace package packs).
- Added `scripts/verify-publish-metadata.mjs` as the seam-level acceptance test; it checks every required field and runs `npm run build` + `npm publish --dry-run` for each public package.
- Left `@okf-kb/pi-adapter` untouched.

All acceptance checks passed and the baseline test suite remains green.

## Divergence from plan

1. **Per-package LICENSE files added.** The slice doc/arch spec assumed a single root `LICENSE` would appear in each package's dry-run tarball. In this workspace, `npm publish --dry-run` from a package directory does not pull in the repo-root `LICENSE`. To satisfy the acceptance criterion that the tarball contain `LICENSE`, I copied the root `LICENSE` into each of the 6 public package directories. The root `LICENSE` is still present as the source of truth.
2. **Tarball allows required `bin/` entries for `daemon` and `cli`.** The spec listed the ideal tarball contents as only `dist/**`, `package.json`, `README.md`, `LICENSE`. Because `daemon` and `cli` have `bin` fields (`okfkbd`, `okfkb`), npm auto-includes `bin/okfkbd.js` and `bin/okfkb.js`. The verification script treats `bin/**` as expected for those two packages rather than flagging them as leakage.
3. **No README files yet.** As noted in the task, package READMEs are the next slice, so `README.md` is absent from the current tarballs (npm includes it only if present).
4. **Verification script is a standalone Node script, not a Vitest test.** This keeps the existing `npm test` baseline at 221 passed / 1 skipped and avoids inflating the Vitest count with slow packaging checks. The script is the seam-level test for `npm publish --dry-run`.

## Notable events

- Initial `npm publish --dry-run` on `@okf-kb/core` confirmed the bug: tarball contained `src/`, `tests/`, `tsconfig.json`, and no `dist/` or `LICENSE`.
- The first green verification run after adding metadata still flagged missing `LICENSE`, which led to the per-package LICENSE copy.
- `npm test` passed with the existing baseline: 221 passed, 1 skipped.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "All 6 public package.json files have files:[\"dist\"], license:MIT, publishConfig.access:public, and scripts.prepublishOnly. Root LICENSE exists. npm publish --dry-run for each package shows only dist/**, package.json, LICENSE, and required bin/** for daemon/cli; no src/, tests/, or tsconfig.json. npm run typecheck and npm test both pass."
    }
  ],
  "changedFiles": [
    "LICENSE",
    "packages/auth/LICENSE",
    "packages/auth/package.json",
    "packages/cli/LICENSE",
    "packages/cli/package.json",
    "packages/core/LICENSE",
    "packages/core/package.json",
    "packages/daemon/LICENSE",
    "packages/daemon/package.json",
    "packages/fs/LICENSE",
    "packages/fs/package.json",
    "packages/protocol/LICENSE",
    "packages/protocol/package.json",
    "scripts/verify-publish-metadata.mjs"
  ],
  "testsAddedOrUpdated": [
    "scripts/verify-publish-metadata.mjs"
  ],
  "commandsRun": [
    {
      "command": "node scripts/verify-publish-metadata.mjs",
      "result": "passed",
      "summary": "All 6 packages have required metadata; dry-run tarballs contain dist/, package.json, LICENSE (and bin/ where required); no src/tests/tsconfig.json."
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build completed with no errors."
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "Vitest: 221 passed, 1 skipped (24 test files passed, 1 skipped)."
    }
  ],
  "validationOutput": [
    "Tarball file counts from npm publish --dry-run:",
    "  @okf-kb/core: 16",
    "  @okf-kb/protocol: 8",
    "  @okf-kb/fs: 26",
    "  @okf-kb/daemon: 15",
    "  @okf-kb/cli: 12",
    "  @okf-kb/auth: 6",
    "",
    "All tarballs include dist/**, package.json, LICENSE, and (for daemon/cli) bin/**. None include src/, tests/, or tsconfig.json."
  ],
  "residualRisks": [
    "Per-package LICENSE files duplicate the root LICENSE; any license change must be kept in sync across 7 files.",
    "When package READMEs land, tarball counts will increase by 1 per package, which is expected and acceptable.",
    "dist/tsconfig.tsbuildinfo is included in the cli tarball because files:[\"dist\"] includes the whole dist tree; it does not affect runtime but could be excluded later if desired."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added publish metadata (files, license, publishConfig, prepublishOnly) to 6 public packages; added root and per-package MIT LICENSE files; added scripts/verify-publish-metadata.mjs acceptance test. No runtime code changed.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "Branch: slice/add-publish-metadata. The per-package LICENSE copy is a deliberate divergence from the root-only plan because npm does not inherit root LICENSE into workspace package tarballs."
}
```
