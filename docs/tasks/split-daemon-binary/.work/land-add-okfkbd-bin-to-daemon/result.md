# Land slice: add-okfkbd-bin-to-daemon (split-daemon-binary)

## Summary

Landed slice `add-okfkbd-bin-to-daemon` into `main` for task
`split-daemon-binary`. The slice adds the `okfkbd` binary to
`@okf-kb/daemon` plus a daemon bin test.

## Steps performed

1. **Confirmed branch state**: work was on `slice/add-okfkbd-bin-to-daemon`
   as commit `1b54aee` ("wip: add-okfkbd-bin-to-daemon okfkbd binary + test
   passing"). Diff vs `main`: 4 files (`packages/daemon/bin/okfkbd.js` +38,
   `packages/daemon/package.json` ±1, `packages/daemon/tests/bin.test.ts` +93,
   `packages/daemon/tsconfig.json` ±1). No task branches existed; landed
   directly into `main` per instructions.
2. **Merged** `slice/add-okfkbd-bin-to-daemon` into `main` with `--no-ff`:
   `git merge --no-ff slice/add-okfkbd-bin-to-daemon -m "slice(split-daemon-binary): Add okfkbd binary to @okf-kb/daemon"`
   → merge commit `2deded3`. Then **deleted** the slice branch
   (`git branch -d slice/add-okfkbd-bin-to-daemon`, was 1b54aee).
3. **Set slice doc frontmatter** `status: done` in
   `docs/tasks/split-daemon-binary/slices/01-add-okfkbd-bin-to-daemon.md`.
4. **Appended** a `### Slice 01 — add-okfkbd-bin-to-daemon (landed)`
   subsection to the task doc's new `## Implementation notes` section
   (`docs/tasks/split-daemon-binary/task.md`), recording: landed commit
   1b54aee, verified 219 passed/1 skipped (new daemon bin test), okfkbd.js
   shim (parses --port/--space, startDaemon, SIGINT/SIGTERM, listen line),
   bin field added, bin.test.ts isolates tmp space, okfkb daemon subcommand
   preserved (slice 02 removes it), and the 2 cosmetic non-blockers.
5. **Updated** `docs/tasks/state.yaml` to reflect the current task
   `split-daemon-binary` and the landed slice (slice 02 remains, so the
   task is NOT marked done).
6. **Committed** the doc-only changes: `git commit -m "docs(slice): land
   add-okfkbd-bin-to-daemon ..."` → `80b03cd`. Also committed previously-
   untracked task planning docs (task.md, arch-spec.md, both slice docs)
   that had never been added to the repo. No source/test/config files
   were modified in this landing commit.

## Verification

- `npm run typecheck`: clean (tsc --build, no output).
- `npm test`: **219 passed / 1 skipped** (24 test files; 23 passed + 1
  skipped). The new `packages/daemon/tests/bin.test.ts` (1 test, 368ms)
  — "okfkbd starts, serves health, and exits cleanly on SIGTERM" — is
  present and green, accounting for the +1 over the prior 218.
- CLI `okfkb daemon` subcommand still present in
  `packages/cli/src/main.ts` (`argv[0] === 'daemon'` → `runDaemon`,
  dynamic `import('@okf-kb/daemon')`); slice 02 removes it.

## Residual risks

- None blocking. Two cosmetic non-blockers carried forward from the TDD
  worker (no acceptance impact):
  1. Duplicate stderr `data` handler in `bin.test.ts` (a top-level
     accumulator plus the listen-line-matching `onData`) — a
     coherence/cleanup candidate, not a correctness issue (both append to
     the same `stderr` string).
  2. `allowJs` is declarative-only via the `bin` tsconfig `include`
     (no `allowJs:true`); the `.js` shim is still type-checked through the
     include, so behavior is unaffected.
- The `@okf-kb/daemon` package is not yet published; `bin` will resolve on
  `npm i -g @okf-kb/daemon` once published (out of scope for this slice).

## Branch / commit graph

```
80b03cd docs(slice): land add-okfkbd-bin-to-daemon   (doc-only landing)
2deded3 slice(split-daemon-binary): Add okfkbd binary to @okf-kb/daemon  (--no-ff merge)
1b54aee wip: add-okfkbd-bin-to-daemon okfkbd binary + test passing
947bfeb docs(coherence): declare cli test devDeps + ...
```

Slice branch `slice/add-okfkbd-bin-to-daemon` deleted. Task
`split-daemon-binary` remains `ready` — slice 02
(`remove-daemon-subcommand-from-cli`) is not yet landed.
