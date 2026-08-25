# Slice 02 — `remove-daemon-subcommand-from-cli` — TDD Worker Result

## Summary

Removed the `okfkb daemon` subcommand from `@okf-kb/cli`, severed the
`packages/cli` → `@okf-kb/daemon` import/reference, updated the CLI
tsconfig project references, and updated `docs/setup-guide.md` and
`docs/dev-env.md` to reference `okfkbd` instead of `okfkb daemon`.

## Changes made

- `packages/cli/src/main.ts`:
  - Deleted the `runDaemon` function (including the dynamic
    `import('@okf-kb/daemon')`).
  - Deleted the `if (argv[0] === 'daemon')` branch.
  - Updated the header comment and `runCli` JSDoc to remove the
    `okfkb daemon` mention.
  - Preserved the `okfkb config` branch and `runConfig` unchanged.
  - Preserved the static `import { getOrMintToken } from '@okf-kb/auth'`.

- `packages/cli/tsconfig.json`:
  - Removed `{"path": "../daemon"}` from `references`.
  - Kept `../auth`, `../core`, `../protocol`.

- `packages/cli/tests/severance.test.ts` (new):
  - Asserts `packages/cli/src/main.ts` contains no `@okf-kb/daemon`
    references and no `runDaemon`.
  - Asserts `okfkb --help` does not list a `daemon` subcommand.

- `docs/setup-guide.md`:
  - TL;DR: `okfkb daemon` Node → `okfkbd` Node.
  - Section 4a: described the daemon binary as
    `packages/daemon/bin/okfkbd.js`.
  - `ExecStart` → `$(which node) $REPO/packages/daemon/bin/okfkbd.js`.
  - `ExecStart` prose updated to reference `okfkbd`.
  - Status comment listen line → `okfkbd listening on http://127.0.0.1:30700`.

- `docs/dev-env.md`:
  - Start-the-daemon example → `node packages/daemon/bin/okfkbd.js` /
    `okfkbd`.
  - Updated the CLI dependency list to remove `@okf-kb/daemon` and add
    `@okf-kb/auth` (matching the actual runtime deps).
  - Updated the short-name prose: only `okfkb config` is special-cased
    now.

## Verification

- `grep -R '@okf-kb/daemon' packages/cli/src/` → ZERO results.
- `grep -R '@okf-kb/daemon' packages/cli/` → only the devDependency in
  `package.json` and test fixture imports in `tests/` remain.
- `npm run typecheck` → clean (exit 0).
- `npm test` → 221 passed, 1 skipped. The +2 tests over the prior
  219/1 are the new `severance.test.ts` assertions.

## Divergence from plan

No functional divergence. The slice doc and arch spec did not prescribe
a new test file, but the TDD loop added `packages/cli/tests/severance.test.ts`
to guard the severance contract (zero daemon refs in source, no `daemon`
subcommand in help). This is scoped to the slice's acceptance criteria.

## Notable events

- The initial `git add -A` accidentally staged many unrelated untracked
  `docs/tasks/*` work artifacts; the commit was reset and re-done with
  only the slice-relevant files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Deleted runDaemon and the argv[0]==='daemon' branch from packages/cli/src/main.ts; removed ../daemon from packages/cli/tsconfig.json references; grep shows zero @okf-kb/daemon references in packages/cli/src/; only devDependency and test fixture imports remain. Docs updated to okfkbd. npm run typecheck and npm test both pass."
    }
  ],
  "changedFiles": [
    "packages/cli/src/main.ts",
    "packages/cli/tsconfig.json",
    "docs/setup-guide.md",
    "docs/dev-env.md"
  ],
  "testsAddedOrUpdated": [
    "packages/cli/tests/severance.test.ts"
  ],
  "commandsRun": [
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build clean"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "221 passed, 1 skipped"
    },
    {
      "command": "grep -R '@okf-kb/daemon' packages/cli/src/",
      "result": "passed",
      "summary": "zero source references"
    }
  ],
  "validationOutput": [
    "packages/cli/src/main.ts: runDaemon removed, dynamic import('@okf-kb/daemon') removed, daemon branch removed",
    "packages/cli/tsconfig.json: ../daemon reference removed",
    "packages/cli/tests/severance.test.ts: asserts no @okf-kb/daemon refs and no daemon subcommand in help",
    "docs/setup-guide.md: ExecStart updated to okfkbd, listen line updated, prose updated",
    "docs/dev-env.md: start daemon example updated to okfkbd, deps list corrected",
    "npm run typecheck: clean",
    "npm test: 221 passed, 1 skipped"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "Removed runDaemon and daemon routing from CLI; dropped cli→daemon tsconfig reference; added severance test; updated setup-guide and dev-env docs to reference okfkbd binary.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "Slice branch: slice/remove-daemon-subcommand-from-cli. Two wip commits on branch. Unrelated untracked docs/tasks/* artifacts exist in working tree but are not staged or committed."
}
```
