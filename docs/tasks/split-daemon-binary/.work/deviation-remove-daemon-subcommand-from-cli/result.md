# Deviation report — remove-daemon-subcommand-from-cli

## Summary

Slice 02 of `split-daemon-binary` is fully implemented and matches the arch spec and slice doc with **no deviations**. The `okfkb daemon` subcommand was removed from `@okf-kb/cli`, the cli→daemon severance is complete (zero `@okf-kb/daemon` references in source or tsconfig), and docs were updated to `okfkbd`. The worker added a `severance.test.ts` file that was not explicitly in the arch spec's edit map but is a reasonable in-scope automation of the acceptance criteria.

## Verification

### main.ts — PASS
- `runDaemon` function deleted (was lines ~129-160) ✓
- `argv[0] === 'daemon'` branch deleted (was lines 20-21) ✓
- `import('@okf-kb/daemon')` dynamic import deleted ✓
- All `@okf-kb/daemon` references gone (grep exit 1 = no matches in `packages/cli/src/`) ✓
- Comments updated: line 1 `route to okfkb config or a group command`, line 15 same ✓
- `okfkb config` branch + `runConfig` PRESERVED (lines 20-21, 125) ✓
- `runDaemon` string not found anywhere in main.ts (grep exit 1) ✓

### cli tsconfig.json — PASS
- `../daemon` removed from `references` (now only `../auth`, `../core`, `../protocol`) ✓

### cli package.json — PASS
- `dependencies`: `@okf-kb/auth`, `@okf-kb/protocol`, `@trpc/client`, `commander` — no `@okf-kb/daemon` ✓
- `devDependencies`: `@okf-kb/fs`, `@okf-kb/daemon`, `@types/node`, `typescript`, `vitest` — `@okf-kb/daemon` kept for test fixtures ✓

### docs/setup-guide.md — PASS
- Line 20: `okfkb daemon` → `okfkbd` ✓
- Line 191: `packages/cli/bin/okfkb.js` → `packages/daemon/bin/okfkbd.js` ✓
- Line 223: `ExecStart=$(which node) $REPO/packages/cli/bin/okfkb.js daemon` → `ExecStart=$(which node) $REPO/packages/daemon/bin/okfkbd.js` ✓
- Line 235: `ExecStart runs the daemon` → `ExecStart runs the daemon via okfkbd` ✓
- Line 244: `okfkb daemon listening` → `okfkbd listening` ✓

### docs/dev-env.md — PASS
- Line 16: `node packages/cli/bin/okfkb.js daemon` → `node packages/daemon/bin/okfkbd.js` ✓
- Lines 54-55: `@okf-kb/cli` deps prose updated to reflect `@okf-kb/auth` (no `@okf-kb/daemon` in CLI runtime) ✓
- Line 84: `okfkb daemon and okfkb config` → `okfkb config` (only short name) ✓

### Out-of-scope items — all PRESERVED ✓
- `kb-daemon.service` unit name: 9 occurrences, unchanged
- `KB_HOME`/`KB_URL`/`KB_TOKEN`/`KB_PORT`/`KB_DAEMON_HOST`: 26 occurrences, unchanged
- `kb@local`: 1 occurrence, unchanged
- `kb-*` skill names: not touched
- `startDaemon` logic / daemon server code (`packages/daemon/src/`): git diff empty (untouched)
- CLI `commands.test.ts`: untouched, still imports `startDaemon` from `@okf-kb/daemon` as devDep fixture

### New file: severance.test.ts — IN SCOPE
`packages/cli/tests/severance.test.ts` (37 lines, 2 tests) was not explicitly listed in the arch spec's edit map. Assessment: **reasonable in-scope addition**, not an out-of-scope change. The slice doc says "grep for residual `daemon` refs in cli" as a test-plan seam; the arch spec says "Grep `packages/cli/` for `@okf-kb/daemon`: only the devDependency should remain." The severance test automates exactly this grep gate as a regression test. Test 1 reads `src/main.ts` as a string and asserts no `@okf-kb/daemon`/`runDaemon` substrings. Test 2 runs `runCli(['--help'])` in-process and asserts no `daemon` subcommand listing (arch spec seam #2).

### Build + test results
- `npm run typecheck` (tsc --build): exit 0
- `npm test`: 221 passed, 1 skipped (24 test files) — up from 219 (prior slice's daemon bin test + this slice's 2 severance tests)
- `packages/cli/tests/severance.test.ts`: 2 tests passed
- No staged files (all committed in `25d3e09` + `aa63c03`)

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Slice removes the okfkb daemon subcommand without widening scope. main.ts: runDaemon deleted, daemon branch deleted, import('@okf-kb/daemon') deleted, comments updated, okfkb config preserved. tsconfig: ../daemon removed. package.json: runtime deps light (no daemon), devDeps keep daemon for test fixtures. Docs: ExecStart→okfkbd, listen line→okfkbd, prose→okfkbd. Out-of-scope items all untouched (kb-daemon.service, KB_* env vars, kb@local, startDaemon logic, daemon server code). New severance.test.ts is a reasonable in-scope automation of the acceptance grep gate, not scope widening."
    }
  ],
  "changedFiles": [
    "packages/cli/src/main.ts",
    "packages/cli/tsconfig.json",
    "packages/cli/tests/severance.test.ts",
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
      "summary": "tsc --build exit 0 (clean)"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "221 passed, 1 skipped (24 test files); severance.test.ts 2 tests passed"
    },
    {
      "command": "grep -rn '@okf-kb/daemon' packages/cli/src/",
      "result": "passed",
      "summary": "exit 1 — zero @okf-kb/daemon references in cli source"
    },
    {
      "command": "grep -n 'runDaemon' packages/cli/src/main.ts",
      "result": "passed",
      "summary": "exit 1 — runDaemon not found"
    },
    {
      "command": "grep -n 'argv[0] === .config.' packages/cli/src/main.ts",
      "result": "passed",
      "summary": "okfkb config branch preserved at line 20-21, runConfig at line 125"
    },
    {
      "command": "git diff 80b03cd..HEAD -- packages/daemon/src/",
      "result": "passed",
      "summary": "empty diff — daemon server code untouched"
    },
    {
      "command": "git status --short (staged files check)",
      "result": "passed",
      "summary": "no staged files; all changes committed in 25d3e09 + aa63c03"
    }
  ],
  "validationOutput": [
    "tsc --build: exit 0 (clean)",
    "npm test: 221 passed, 1 skipped, 0 failed",
    "main.ts: zero @okf-kb/daemon refs, runDaemon deleted, config branch preserved",
    "tsconfig.json: ../daemon removed from references",
    "package.json: runtime deps = auth/protocol/trpc/client/commander (no daemon); devDeps keep @okf-kb/daemon + @okf-kb/fs for fixtures",
    "setup-guide: ExecStart→packages/daemon/bin/okfkbd.js, listen line→okfkbd listening, prose→okfkbd",
    "dev-env: daemon start→okfkbd, cli deps prose updated, short-names→okfkb config only",
    "out-of-scope: kb-daemon.service (9), KB_* env (26), kb@local (1), startDaemon logic, daemon src — all untouched",
    "severance.test.ts: in-scope automation of acceptance grep gate (2 tests)"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "2 commits (25d3e09 + aa63c03). main.ts: -47 lines (runDaemon + daemon branch + dynamic import deleted, comments updated). tsconfig: ../daemon removed. severance.test.ts: +37 lines (new, in-scope). setup-guide: 10 lines updated (ExecStart, listen line, prose). dev-env: 8 lines updated (daemon start example, cli deps prose, short-names). No out-of-scope changes.",
  "reviewFindings": [
    "no blockers",
    "observation: severance.test.ts was not in the arch spec edit map but is a reasonable in-scope automation of the slice doc's grep-gate acceptance criterion and arch spec seam #2; +2 tests, net positive",
    "observation: dev-env.md line 54 still lists @okf-kb/core as a cli dep in prose, but cli package.json no longer has @okf-kb/core in dependencies — this is a pre-existing prose staleness from the extract-auth-package task, not introduced by this slice"
  ],
  "manualNotes": "No deviations found. The implementation matches the slice doc and arch spec exactly. The severance.test.ts addition is a reasonable in-scope test automating the acceptance grep gate. One pre-existing prose staleness in dev-env.md (line 54 lists @okf-kb/core as a cli dep but it was dropped in extract-auth-package) — not introduced by this slice, recommend a coherence-pass sweep."
}
```