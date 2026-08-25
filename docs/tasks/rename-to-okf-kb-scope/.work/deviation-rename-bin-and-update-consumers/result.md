## Deviation report — rename-bin-and-update-consumers

### Commander: `.name('kb')` → `.name('okfkb')` and `.description('kb — ...')` → `.description('okfkb — ...')`

- **Planned:** `main.ts:43` `.name('kb')` → `.name('okfkb')`; `main.ts:44` `.description('kb — knowledge base CLI ...')` → `.description('okfkb — knowledge base CLI ...')`.
- **Actual:** Done exactly as specified. Commit `6d15ea1` changed `.name('kb')` → `.name('okfkb')` (line 43) and `.description('kb — knowledge base CLI (tRPC client of the daemon)')` → `.description('okfkb — knowledge base CLI (tRPC client of the daemon)')` (line 44). ✓
- **Impact:** None. Downstream slices see the correct program name.

### Stderr line: `main.ts:152` `kb daemon listening` → `okfkb daemon listening`

- **Planned:** Update `main.ts:152` `process.stderr.write(\`kb daemon listening on ${handle.url}\n\`)` → `okfkb daemon listening`.
- **Actual:** Done. Commit `6d15ea1` changed the stderr line to `okffb daemon listening on ${handle.url}` (line 152). ✓
- **Impact:** None. Matches the setup-guide status-line expectation.

### main.ts comments: `kb daemon` subcommand mentions (lines 1, 19, 129, 164)

- **Planned:** Arch spec: line 1 comment `route to \`kb daemon\`` → `route to \`okfkb daemon\``; line 19 comment `\`kb daemon\`` → `\`okfkb daemon\``. Also the `runDaemon` JSDoc (line 129) and `runConfig` JSDoc (line 164) which say `\`kb daemon\`` / `\`kb config\``.
- **Actual:** All four comment references updated:
  - Line 1: `route to \`okfkb daemon\`` ✓ (commit `6d15ea1`)
  - Line 15 (runCli JSDoc): `route to \`okfkb daemon\`` ✓ (commit `6d15ea1`)
  - Line 19 (inline): `\`okfkb daemon\` is special` ✓ (commit `6d15ea1`)
  - Line 129 (runDaemon JSDoc): `\`okfkb daemon\`` ✓ (commit `bdcb11e`)
  - Line 164 (runConfig JSDoc): `\`okfkb config\`` ✓ (commit `bdcb11e`)
- **Impact:** None.

### docs/setup-guide.md: kb command refs → okfkb

- **Planned:** Lines 20, 223, 244, 309, 311, 340, 343 — all `kb <subcommand>` → `okfkb <subcommand>`; `ExecStart` path → `bin/okfkb.js`.
- **Actual:** All updated (commit `bdcb11e`):
  - Line 20: `okfkb daemon` Node ✓
  - Line 191: `packages/cli/bin/okfkb.js` (the "daemon binary" description) ✓
  - Line 223: `ExecStart=$(which node) $REPO/packages/cli/bin/okfkb.js daemon` ✓
  - Line 244: `"okfkb daemon listening on http://127.0.0.1:30700"` ✓
  - Lines 262-263: `node $REPO/packages/cli/bin/okfkb.js index-admin.check` + `read.list` ✓
  - Line 309: `okfkb index-admin.check` ✓
  - Line 311: `okfkb index-admin.rebuild-indexes` ✓
  - Line 340: `okfkb index-admin.rebuild-indexes` ✓
  - Line 343: `okfkb index-admin.check` + `okfkb write.delete` ✓
  - Line 348: `okfkb search.search-semantic "warmup"` ✓
- **Impact:** None. Grep for residual bare `kb ` command invocations (excluding out-of-scope items) returns empty.

### docs/dev-env.md: kb command mentions → okfkb

- **Planned:** All `kb` command mentions → `okfkb`.
- **Actual:** Done (commit `bdcb11e`). 9 lines updated:
  - Line 7: `the \`okfkb\` binary` ✓
  - Lines 16-20: `node packages/cli/bin/okfkb.js <cmd>` (5 lines) ✓
  - Lines 82-84: `okfkb read.get`, `okfkb write.put`, etc. ✓
- **Note:** `@kb/*` package name references in dev-env.md (lines 5-7, 37-55) were **not** updated — these are package-scope references, which are in slice 01's scope (already landed). The arch spec's slice 02 section only specifies "kb command mentions → okfkb" for dev-env. Slice 01's edit map did not list dev-env.md. This is a minor gap — the `@kb/*` prose references in dev-env.md are now stale (the packages were renamed to `@okf-kb/*` in slice 01). **Not a deviation from slice 02's spec** (slice 02's scope is command names), but it's a **cross-slice gap**: neither slice 01 nor slice 02 was explicitly assigned to update `@kb/*` package-name prose in `docs/dev-env.md`. See "Out-of-scope changes" below.
- **Impact:** Cosmetic doc staleness in dev-env.md (`@kb/*` package names). No functional impact.

### Abstraction usage
- Used/was specified: yes. commander `.name()` / `.description()` were used as specified. The new `--help` test spawns the bin via `child_process` exactly as the existing bin test does.

### Out-of-scope changes

**1. New `--help` test added** (commit `6d15ea1`, `packages/cli/tests/commands.test.ts`, +36 lines)

- **What:** A new test `'okfkb --help prints the okfkb program name and description'` was added to the `CLI — built bin end-to-end` describe block. It spawns `node packages/cli/bin/okfkb.js --help`, asserts the stdout contains `Usage: okfkb`, `okfkb — knowledge base CLI`, and does **not** contain `Usage: kb`.
- **Is it in scope?** The slice doc says "CLI help text / commander program name updated to `okfkb`" and "npm test green (CLI command tests updated)". The arch spec's seam #3 says "CLI program name — `okfkb --help` prints `okfkb` (not `kb`). Verified by the bin test's behavior." Adding a dedicated test that verifies this seam is **arguably in scope** — it's the verification of the seam the spec defined. The test is a net positive (the existing bin test only tests `write.put`/`read.get`, not the program name). **Not a deviation** — it's a reasonable interpretation of "CLI command tests updated" + seam #3.
- **Impact:** None. Test count went from 217 → 218 (all pass). The test is correctly guarded (skips if dist not found) and uses the same spawn pattern.

**2. `@kb/*` package-name prose in `docs/dev-env.md` left stale** (not updated)

- **What:** `docs/dev-env.md` lines 5-7, 37-55 still say `@kb/core`, `@kb/fs`, `@kb/protocol`, `@kb/daemon`, `@kb/cli` — the old scope names. Slice 01 renamed the actual packages to `@okf-kb/*` but did not update dev-env.md's prose. Slice 02 updated the command names in dev-env.md but not the package-name references.
- **Is it in scope?** Neither slice's edit map explicitly lists `@kb/*` → `@okf-kb/*` prose updates in `docs/dev-env.md`. The arch spec's slice 01 section lists source files + package.json + bin, not docs. The slice 02 section says "docs/dev-env.md: grep for `kb` command mentions → `okfkb`" — only command mentions, not package names. So this is a **gap in the spec's edit map**, not a deviation by the worker. Both workers correctly stayed within their assigned scope.
- **Impact:** Cosmetic. A reader of dev-env.md sees `@kb/core` in prose but `@okf-kb/core` in the actual packages. Should be swept in a coherence pass or a docs-cleanup task. Not a blocker.

### Out-of-scope items verified NOT touched

All items the arch spec says "not changed" were confirmed untouched:

- `kb-daemon.service` unit name — **not touched** ✓ (lines 213, 243, 316-319, 326 still say `kb-daemon.service`)
- `kb-silverbullet.service` — **not touched** ✓
- `kb@local` git identity — **not touched** ✓ (line 105: `user.email=kb@local -c user.name=kb`)
- `$KB_HOME` / `$KB_URL` / `$KB_TOKEN` env vars — **not touched** ✓ (all references intact)
- `kb-*` skill names (`kb-ask`, `kb-curate`, `kb-research`, `kb-save-session`) — **not touched** ✓
- `kb_update` / `kb_get` / `kb_search` tool names — **not touched** ✓
- `kb-daemon` MCP server name (`mcp.ts:27 { name: 'kb-daemon' }`) — **not touched** ✓
- `install-pi.mjs` `pi-kb` extension dest — **not touched** ✓ (line 12: `extensions/pi-kb`)
- Keyring service string (`auth.ts:9 const SERVICE = 'kb'`) — **not touched** ✓
- `kb daemon` / `kb config` subcommands (the `argv[0] === 'daemon'` branch) — **not touched** ✓ (subcommand logic unchanged; only the displayed name and comments updated)

### Task doc update needed?
- **No** for slice 02's scope. The implementation matches the slice doc's acceptance criteria exactly.
- **Minor note:** The `it()` test label at line 305 still says `'kb binary (child_process) round-trips write.put + read.get'` — this is a cosmetic test-description string, not an assertion. The arch spec's slice 01 deviation report already noted this as a non-blocker. It could be updated to `okfkb binary` in a coherence pass, but it's not a slice 02 acceptance criterion.

### User attention needed?
- **No.** No scope changes, no API surface differences, no out-of-scope code changes. The only observation is a cross-slice gap in the spec's edit map (`@kb/*` prose in dev-env.md), which is a planning gap, not an implementation deviation.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings with file paths and severities: commander name (main.ts:43 ✓), description (main.ts:44 ✓), stderr line (main.ts:152 ✓), 4 comment refs (lines 1,15,19,129,164 ✓), setup-guide 10+ lines (20,191,223,244,262,263,309,311,340,343,348 ✓), dev-env 9 lines (7,16-20,82-84 ✓). Out-of-scope items verified untouched: kb-daemon.service, kb-silverbullet.service, kb@local, KB_HOME/URL/TOKEN, kb-* skills, kb_update/get/search, kb-daemon MCP name, pi-kb dest, keyring SERVICE='kb', kb daemon/config subcommands. No deviations found. Two observations: (1) new --help test added (in-scope per arch spec seam #3), (2) @kb/* prose in dev-env.md left stale (spec edit-map gap, not worker deviation)."
    }
  ],
  "changedFiles": [
    "packages/cli/src/main.ts",
    "packages/cli/tests/commands.test.ts",
    "docs/dev-env.md",
    "docs/setup-guide.md"
  ],
  "testsAddedOrUpdated": [
    "packages/cli/tests/commands.test.ts (new --help test, +36 lines)"
  ],
  "commandsRun": [
    {
      "command": "git show 6d15ea1",
      "result": "passed",
      "summary": "commit 1: commander .name/.description, stderr line, main.ts comments, new --help test"
    },
    {
      "command": "git show bdcb11e",
      "result": "passed",
      "summary": "commit 2: docs/setup-guide.md + dev-env.md command-name updates, main.ts runDaemon/runConfig JSDoc"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "218 passed, 1 skipped (up from 217 — new --help test)"
    },
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build exit 0"
    },
    {
      "command": "grep out-of-scope items",
      "result": "passed",
      "summary": "all 10 out-of-scope items confirmed untouched"
    },
    {
      "command": "grep residual bare 'kb ' in docs",
      "result": "passed",
      "summary": "no residual bare kb command invocations in setup-guide or dev-env (excluding out-of-scope items)"
    }
  ],
  "validationOutput": [
    "tsc --build: exit 0 (clean)",
    "npm test: 218 passed, 1 skipped, 0 failed",
    "git show 6d15ea1: main.ts .name('okfkb'), .description('okfkb — ...'), stderr 'okfkb daemon listening', comments updated, new --help test (+36 lines)",
    "git show bdcb11e: setup-guide 12 lines updated, dev-env 9 lines updated, main.ts 2 JSDoc comments updated",
    "out-of-scope grep: kb-daemon.service ✓, kb-silverbullet ✓, kb@local ✓, KB_HOME/URL/TOKEN ✓, kb-* skills ✓, kb-daemon MCP name ✓, pi-kb dest ✓, keyring SERVICE='kb' ✓, kb daemon/config subcommands ✓"
  ],
  "residualRisks": [
    "cosmetic: docs/dev-env.md lines 5-7,37-55 still reference @kb/* package names (spec edit-map gap — neither slice assigned to update these); should be swept in a coherence pass or docs-cleanup task",
    "cosmetic: CLI test it() label at commands.test.ts:305 still says 'kb binary' (non-assertion string; noted in slice 01 deviation report as non-blocker)"
  ],
  "noStagedFiles": true,
  "diffSummary": "Slice 02 renamed the commander program name kb→okfkb (main.ts:43-44), the stderr listen line (main.ts:152), 4 JSDoc/inline comments, 12 setup-guide command refs (incl ExecStart path), and 9 dev-env command refs. Added a new --help test (+36 lines, 218 total). No out-of-scope items touched. No deviations from spec.",
  "reviewFindings": [
    "no blockers",
    "observation: @kb/* package-name prose in docs/dev-env.md (lines 5-7,37-55) is stale — spec edit-map gap, not a worker deviation; recommend coherence-pass sweep",
    "observation: new --help test is in-scope per arch spec seam #3 ('okfkb --help prints okfkb'); net positive, not a deviation"
  ],
  "manualNotes": "No deviations found. The implementation matches the slice doc and arch spec exactly. Two cosmetic observations (dev-env @kb/* prose staleness, test it() label) are non-blockers and traceable to spec edit-map gaps rather than worker errors. The new --help test is a reasonable in-scope addition that verifies arch spec seam #3."
}
```
