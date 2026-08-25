# Slice result: create-auth-package

## Summary

Created the new `@okf-kb/auth` workspace package, moved `packages/daemon/src/auth.ts` and `packages/daemon/tests/auth.test.ts` into it, and rewired `@okf-kb/daemon` to import/re-export `getOrMintToken` from `@okf-kb/auth`. The keyring `SERVICE='kb'` / `ACCOUNT='daemon'` constants were preserved byte-identically so existing minted tokens keep resolving.

Verification commands all passed:
- `npm install` picked up the new workspace package.
- `npm run typecheck` clean.
- `npm test` green: 218 passed, 1 skipped.

## Divergence from plan

- **auth package dependencies exclude `env-paths`.** The slice doc (`01-create-auth-package.md`) lists `env-paths ^4.0.0` as a dependency of `@okf-kb/auth`, but the arch spec explicitly corrects this: "Do not change env-paths ownership: it stays in `@okf-kb/daemon`" and "Only `@napi-rs/keyring` moves to `@okf-kb/auth`." `env-paths` is used by `packages/daemon/src/deps.ts` for `KB_HOME`, not by auth code. I followed the arch spec, so `packages/auth/package.json` depends only on `@napi-rs/keyring`.
- No other scope changes.

## Notable events

- The 6 existing auth assertions passed from the new location without modification.
- The daemon `server.test.ts` still passes via the re-export/import change.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Implemented the exact move+rewire per the arch-spec edit map; no new behavior added. npm test: 218 passed, 1 skipped."
    }
  ],
  "changedFiles": [
    "packages/auth/package.json",
    "packages/auth/tsconfig.json",
    "packages/auth/src/auth.ts",
    "packages/auth/src/index.ts",
    "packages/auth/tests/auth.test.ts",
    "packages/daemon/package.json",
    "packages/daemon/src/index.ts",
    "packages/daemon/src/server.ts",
    "packages/daemon/tsconfig.json",
    "tsconfig.json",
    "package-lock.json"
  ],
  "testsAddedOrUpdated": [
    "packages/auth/tests/auth.test.ts (moved from packages/daemon/tests/auth.test.ts; identical assertions)"
  ],
  "commandsRun": [
    {
      "command": "npm install",
      "result": "passed",
      "summary": "New workspace package @okf-kb/auth registered; package-lock updated."
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build clean."
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "218 passed, 1 skipped. Auth tests run from packages/auth; daemon server tests still pass."
    }
  ],
  "validationOutput": [
    "vitest: 22 test files passed, 1 skipped; 218 tests passed, 1 skipped."
  ],
  "residualRisks": [
    "Slice 02 still needs to switch @okf-kb/cli and pi-adapter to import from @okf-kb/auth and drop @okf-kb/daemon from cli dependencies.",
    "Keyring SERVICE/ACCOUNT constants preserved; existing tokens remain valid."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added packages/auth/ containing moved auth.ts + test; daemon package now depends on @okf-kb/auth and imports getOrMintToken from it; deleted daemon src/auth.ts and tests/auth.test.ts; root tsconfig references packages/auth before packages/daemon.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "Committed on branch slice/create-auth-package as a49d4a9."
}
```
