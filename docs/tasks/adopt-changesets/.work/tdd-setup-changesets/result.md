# TDD Worker Result — `setup-changesets`

## Summary

This slice was partially implemented before hitting an environment-level blocker:

- ✅ Installed `@changesets/cli` and `@changesets/changelog-github` as root devDependencies.
- ✅ Created `.changeset/config.json` with the requested settings.
- ✅ Created `.changeset/README.md` as a Changesets format seed.
- ✅ Root `package.json` already has the required `changeset` / `version` / `publish:changes` scripts (from prior commits on `main`).
- ❌ Could **not** switch inter-package `@okf-kb/*` deps from `"*"` to `"workspace:*"` because `npm install` fails with `EUNSUPPORTEDPROTOCOL` in this environment.
- ✅ `npm run typecheck` passes.
- ✅ `npm test` passes: **221 passed, 1 skipped**.

Execution was stopped per the uncertainty protocol. Details are in `docs/tasks/adopt-changesets/.work/uncertainty.md`.

## Divergence from plan

- **Inter-package deps**: The slice doc and arch spec require `"workspace:*"`. This cannot be satisfied with the npm build available in this environment (system npm 11.16.0 and a freshly installed `npm@11.16.0` both reject `workspace:*`).
- **`.changeset/config.json`**: The prior implementation used `updateInternalDependencies: "patch"` and `bumpVersionsWithWorkspaceProtocolOnly: false` to support `"*"` deps. The current instructions asked for a slimmer config without those fields. I implemented the slimmer config as instructed, but because the `workspace:*` switch is blocked, the config may need the workspace-fallback fields restored if the project decides to keep `"*"` deps.
- **Smoke test**: Skipped per parent guidance; instead verified with `typecheck` + `npm test`.

## Notable events

- Discovered that `main` already contained two prior commits (`fe8327e`, `9c175e2`) implementing a Changesets setup that intentionally kept `"*"` deps, explicitly because `workspace:` is rejected by this npm build.
- During troubleshooting of the `workspace:*` failure, `node_modules` was deleted and restored with `npm install --ignore-scripts`. Native modules (e.g., `better-sqlite3`) were not rebuilt, but `npm test` still achieved the expected `221 passed, 1 skipped`.
- The workspace protocol failure occurs in `npm-package-arg` (`unsupportedURLType`) before any install-script stage, so `--ignore-scripts` does not help.

## Commands run

| Command | Result | Notes |
|---|---|---|
| `npm i -D @changesets/cli @changesets/changelog-github` | passed | Added root devDependencies and updated `package-lock.json`. |
| `npm install` (with `workspace:*`) | failed | `EUNSUPPORTEDPROTOCOL` for `workspace:*`. |
| `npm install --ignore-scripts` (with `"*"`) | passed | Restored `node_modules` after deletion. |
| `npm run typecheck` | passed | `tsc --build` completed with no errors. |
| `npm test` | passed | 221 passed, 1 skipped. |

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "not-satisfied",
      "evidence": "The requested change could not be fully implemented: switching inter-package deps to workspace:* causes npm install to fail with EUNSUPPORTEDPROTOCOL in this environment, so the workspace:* switch was reverted. See docs/tasks/adopt-changesets/.work/uncertainty.md."
    }
  ],
  "changedFiles": [
    "package.json",
    "package-lock.json",
    ".changeset/config.json",
    ".changeset/README.md",
    "docs/tasks/adopt-changesets/.work/uncertainty.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "npm i -D @changesets/cli @changesets/changelog-github",
      "result": "passed",
      "summary": "Installed changesets packages and updated lockfile."
    },
    {
      "command": "npm install (with workspace:* deps)",
      "result": "failed",
      "summary": "EUNSUPPORTEDPROTOCOL for workspace:* — npm in this environment does not recognize the workspace: protocol."
    },
    {
      "command": "npm install --ignore-scripts (with '*' deps)",
      "result": "passed",
      "summary": "Restored node_modules after troubleshooting deletion."
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build completed with no errors."
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "221 passed, 1 skipped."
    }
  ],
  "validationOutput": [
    "npm run typecheck: green",
    "npm test: 221 passed, 1 skipped"
  ],
  "residualRisks": [
    "workspace:* is not supported by the npm build in this environment, blocking the exact inter-package dependency form requested by the spec.",
    "If the project keeps '*' deps, .changeset/config.json may need updateInternalDependencies and bumpVersionsWithWorkspaceProtocolOnly restored to let Changesets pin versions correctly.",
    "node_modules was restored with --ignore-scripts; native modules like better-sqlite3 were not rebuilt, although tests currently pass."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added @changesets/cli + @changesets/changelog-github, .changeset/config.json, and .changeset/README.md. Could not apply the workspace:* switch due to npm EUNSUPPORTEDPROTOCOL; inter-package deps remain '*'.",
  "reviewFindings": [
    "blocker: The npm environment (11.16.0) rejects workspace:*, contradicting the arch spec assumption that npm 11 supports it."
  ],
  "manualNotes": "Stopped per the uncertainty protocol. Decision needed from parent/orchestrator on whether to keep workspace:* (requires a different package manager or npm build) or revert to '*' with updateInternalDependencies. See docs/tasks/adopt-changesets/.work/uncertainty.md for full analysis."
}
```
