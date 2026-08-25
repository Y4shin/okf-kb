## Deviation report — remove-daemon-subcommand-from-cli

### API surface changes
- **Planned:** `@okf-kb/cli` removes the `okfkb daemon` subcommand entirely: `runDaemon` deleted, `argv[0] === 'daemon'` branch deleted, `import('@okf-kb/daemon')` deleted, cli tsconfig `../daemon` reference removed, docs updated to `okfkbd`. `okfkb config` preserved.
- **Actual:** Exactly as planned. `main.ts` has zero `@okf-kb/daemon` references (grep exit 1 = no matches); `runDaemon` deleted; the `argv[0] === 'daemon'` branch deleted; the dynamic `import('@okf-kb/daemon')` deleted; comments updated (line 1 now says `route to okfkb config or a group command`, line 15 says `route to okfkb config or a group command`); `okfkb config` branch + `runConfig` preserved (lines 20-21, 125). `tsconfig.json` has `../daemon` removed from references (now only `../auth`, `../core`, `../protocol`).
- **Impact:** None on dependent slices. Downstream tasks (`fix-package-metadata`, `write-package-readmes`, `adopt-changesets`, `release-ci-workflow`) all assume this final two-binary shape — it's confirmed.

### Abstraction usage
- Used/was specified: yes. The worker correctly removed the `runDaemon` function and its branch, updated the tsconfig references, and updated docs. The `okfkb config` subcommand was correctly preserved. The CLI's devDependency on `@okf-kb/daemon` was correctly kept (tests import `startDaemon` for fixtures at `commands.test.ts:13`).

### Out-of-scope changes

**New file: `packages/cli/tests/severance.test.ts` (37 lines, 2 tests)**

This file was not in the arch spec's exact edit map, which listed `main.ts`, `tsconfig.json`, `setup-guide.md`, and `dev-env.md` as the files to edit. However:

- **The slice doc says:** "CLI tests: remove/adjust any test covering `okfkb daemon`; the daemon-side bin test (prior slice) covers that behavior now." and the test plan says "grep for residual `daemon` refs in cli."
- **The arch spec says:** "Grep `packages/cli/` for `@okf-kb/daemon`: only the **devDependency** in `package.json` (test fixtures) should remain — no source import, no tsconfig reference."

A severance test that asserts `main.ts` has no `@okf-kb/daemon` references and that `--help` doesn't list a `daemon` subcommand is a **reasonable in-scope addition**. It codifies the slice doc's "grep clean" acceptance criterion as an automated test, preventing future regressions. The test reads `src/main.ts` as a string file (not importing from it) and checks for `@okf-kb/daemon`/`runDaemon` substrings — exactly what the arch spec's grep gate asks for. The second test runs `runCli(['--help'])` in-process and asserts no `daemon` subcommand listing — directly verifying arch spec seam #2 ("`okfkb --help` shows no `daemon` subcommand").

**Assessment: in-scope, not an out-of-scope addition.** The test is a direct automation of the slice doc's and arch spec's acceptance criteria. It adds +2 tests (221 total, up from 219).

**No other out-of-scope changes.** All out-of-scope items confirmed untouched:
- `kb-daemon.service` unit name — 9 occurrences, unchanged ✓
- `KB_HOME`/`KB_URL`/`KB_TOKEN`/`KB_PORT`/`KB_DAEMON_HOST` env vars — 26 occurrences, unchanged ✓
- `kb@local` git identity — 1 occurrence, unchanged ✓
- `kb-*` skill names — not touched ✓
- `startDaemon` logic / daemon server code — `packages/daemon/src/` untouched (git diff empty) ✓
- CLI `commands.test.ts` — untouched (still imports `startDaemon` from `@okf-kb/daemon` as a devDep fixture, lines 13/54/186/217) ✓

### Task doc update needed?
No. The implementation matches the slice doc's acceptance criteria exactly. The `severance.test.ts` addition is a reasonable automation of the "grep clean" criterion, not a scope change.

### User attention needed?
No. No scope changes, no API surface differences beyond what was planned. The client CLI is now fully severed from `@okf-kb/daemon` (zero source references, zero tsconfig references; only the devDependency remains for test fixtures).
