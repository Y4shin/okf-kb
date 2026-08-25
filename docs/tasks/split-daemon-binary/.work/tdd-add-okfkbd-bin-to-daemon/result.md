# Slice result: add-okfkbd-bin-to-daemon

Implemented the `okfkbd` binary for `@okf-kb/daemon` and a spawn-based bin test.

## Changes

- `packages/daemon/bin/okfkbd.js` (new, executable): shebang, imports `startDaemon` from `../dist/index.js`, parses `--port`/`-p`/`--space`/`-s` (with `=` forms), calls `startDaemon({ port, space })`, writes `okfkbd listening on ${handle.url}` to stderr, and shuts down cleanly on `SIGINT`/`SIGTERM`.
- `packages/daemon/package.json`: added `"bin": { "okfkbd": "./bin/okfkbd.js" }`.
- `packages/daemon/tsconfig.json`: added `"bin"` to `include` so the shim is in the tsc scope, matching `@okf-kb/cli`.
- `packages/daemon/tests/bin.test.ts` (new): spawns `node packages/daemon/bin/okfkbd.js --port 0 --space <tmpdir>`, waits for the stderr listen line, parses the URL, fetches `GET /`, asserts `{ ok: true, service: 'kb-daemon' }`, sends `SIGTERM`, asserts exit code 0. Includes a 15 s timeout guard and a `distExists` skip (mirrors the CLI built-bin test).

## Verification

- `npm run build` — passed (dist produced for all workspaces).
- `npm run typecheck` — passed.
- `npm test` — 219 passed, 1 skipped (was 218 passed, 1 skipped before the slice).

## Divergence from plan

None. The implementation follows the slice doc and the architecture spec's "Slice 01" edit map exactly.

## Notable events

- Accidentally ran `git add -A`, which staged a large number of unrelated untracked `docs/tasks/*` files from other tasks. Reset and re-staged only the slice files before committing.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Created packages/daemon/bin/okfkbd.js, updated package.json and tsconfig.json, added packages/daemon/tests/bin.test.ts. No CLI source files or other unrelated packages were touched."
    }
  ],
  "changedFiles": [
    "packages/daemon/bin/okfkbd.js",
    "packages/daemon/package.json",
    "packages/daemon/tsconfig.json",
    "packages/daemon/tests/bin.test.ts"
  ],
  "testsAddedOrUpdated": [
    "packages/daemon/tests/bin.test.ts"
  ],
  "commandsRun": [
    {
      "command": "npm run build",
      "result": "passed",
      "summary": "All workspace tsc builds succeeded; packages/daemon/dist/index.js exists for the shim to import."
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build completed with no errors."
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "219 passed, 1 skipped (baseline 218 + 1 new daemon bin test)."
    }
  ],
  "validationOutput": [
    "daemon bin > okfkbd starts, serves health, and exits cleanly on SIGTERM (packages/daemon/tests/bin.test.ts) passed in ~393ms."
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "Added okfkbd binary shim, package.json bin entry, tsconfig include, and a spawn+fetch+SIGTERM integration test in the daemon package.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "Slice branch: slice/add-okfkbd-bin-to-daemon. Commit: wip: add-okfkbd-bin-to-daemon okfkbd binary + test passing."
}
```
