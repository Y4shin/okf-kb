# Slice Result — `rename-bin-and-update-consumers`

## Summary

Completed slice 02 of `rename-to-okf-kb-scope`. The CLI program name,
description, and daemon startup message now read `okfkb`. Consumer docs
(`docs/setup-guide.md`, `docs/dev-env.md`) were updated so all
user-facing command invocations reference `okfkb` / `okfkb.js` while the
`kb daemon` / `kb config` *subcommands* (internal argv tokens) and
systemd/env/skill identifiers were left unchanged as required.

A new CLI end-to-end test asserts that the built `packages/cli/bin/okfkb.js`
`--help` output contains `Usage: okfkb` and the `okfkb — knowledge base CLI`
description.

`npm run typecheck` and `npm test` both pass: **218 passed, 1 skipped**
(up from 217 passed because of the added help test).

## Changed files

- `packages/cli/src/main.ts` — program name, description, comments,
  daemon listen message.
- `packages/cli/tests/commands.test.ts` — added built-bin `--help` test
  asserting `okfkb` program name.
- `docs/setup-guide.md` — updated all user-facing `kb` / `kb.js`
  command references to `okfkb` / `okfkb.js`.
- `docs/dev-env.md` — updated all user-facing `kb` / `kb.js` command
  references to `okfkb` / `okfkb.js`.

## Divergence from plan

1. **Stale `@kb/*` package-scope references remain in consumer docs.**
   `docs/setup-guide.md` still mentions `@kb/protocol` / `@kb/*`
   (troubleshooting section) and `npm run install:pi --workspace @kb/pi-adapter`.
   `docs/dev-env.md` still lists package identities as `@kb/core`,
   `@kb/fs`, etc. These were **not** part of this slice's explicit
   command-reference edit map, so they were intentionally left for a
   coherence/docs pass (or the parent may decide they fall under the
   already-landed package rename). They are **not** source imports, so the
   task's "no stale `@kb/` imports" grep criterion is unaffected.

2. **Extra comment updates in `main.ts`.** The exact edit map only called
   out line 1 and line 19 comments. The JSDoc comments for `runDaemon`
   and `runConfig` (`/** \`kb daemon\` … */`, `/** \`kb config\` … */`)
   were also updated to `okfkb daemon` / `okfkb config` to keep the file
   free of stale user-facing bin references. This is a comment-only change
   and does not affect runtime behavior.

3. **Test count increased by one.** The acceptance contract expected
   217 passed tests; the suite now reports 218 passed because of the new
   `--help` regression test. This is intentional and verifies the public
   program-name seam.

## Notable events

- The first RED run of the new `--help` test correctly caught the old
  commander output (`Usage: kb …`), confirming the seam was meaningful.
- `npm run build` was required before the built-bin test could go green,
  because `bin/okfkb.js` imports from `dist/src/index.js`.
- No foreign tests broke; the full suite passed on the first run after the
  doc/code changes.

## Commands run

```text
npm run build        # passed
npm run typecheck    # passed
npm test             # 218 passed, 1 skipped
```

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "@okf-kb/cli package.json bin field is {\"okfkb\":\"./bin/okfkb.js\"} (verified in packages/cli/package.json); bin shim packages/cli/bin/okfkb.js exists and imports dist/src/index.js."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "packages/cli/src/main.ts now calls program.name('okfkb') and program.description('okfkb — knowledge base CLI ...'); new built-bin test asserts --help contains 'Usage: okfkb' and 'okfkb — knowledge base CLI'."
    },
    {
      "id": "criterion-3",
      "status": "satisfied",
      "evidence": "docs/setup-guide.md updated: 'okfkb daemon' prose, ExecStart path to bin/okfkb.js, listen message to 'okfkb daemon listening...', and all kb <subcommand> invocations to okfkb <subcommand>."
    },
    {
      "id": "criterion-4",
      "status": "satisfied",
      "evidence": "docs/dev-env.md updated: all node packages/cli/bin/kb.js ... examples changed to okfkb.js, 'kb daemon'/'kb config' and kb group.method examples changed to okfkb."
    },
    {
      "id": "criterion-5",
      "status": "satisfied",
      "evidence": "npm test passed with 218 passed / 1 skipped (the added --help test plus all previously passing tests)."
    }
  ],
  "changedFiles": [
    "packages/cli/src/main.ts",
    "packages/cli/tests/commands.test.ts",
    "docs/setup-guide.md",
    "docs/dev-env.md"
  ],
  "testsAddedOrUpdated": [
    "packages/cli/tests/commands.test.ts"
  ],
  "commandsRun": [
    {
      "command": "npm run build",
      "result": "passed",
      "summary": "All workspace packages built successfully."
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build clean across the monorepo."
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "218 passed, 1 skipped (22 files passed, 1 skipped integration)."
    }
  ],
  "validationOutput": [
    "Typecheck: clean",
    "Tests: 218 passed, 1 skipped"
  ],
  "residualRisks": [
    "Stale '@kb/*' package-scope prose remains in docs/setup-guide.md and docs/dev-env.md (not source imports); a coherence/docs pass may want to align these with the already-renamed packages.",
    "The new --help test requires a prior build of packages/cli/dist; CI must ensure build runs before test."
  ],
  "noStagedFiles": true,
  "diffSummary": "Rename CLI program name/description/listen message from kb to okfkb; add built-bin --help regression test; update setup-guide and dev-env command examples from kb/kb.js to okfkb/okfkb.js while preserving systemd unit names, env vars, skill names, and tool names.",
  "reviewFindings": [
    "none"
  ],
  "manualNotes": "All changes are committed on branch slice/rename-bin-and-update-consumers. The kb daemon / kb config subcommand argv tokens were intentionally kept; only the published bin name and user-facing program strings changed."
}
```
