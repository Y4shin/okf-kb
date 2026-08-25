## Deviation report — add-publish-metadata

### API surface changes
- **Planned:** No API surface changes — metadata-only (files, license, publishConfig, prepublishOnly) added to package.json files + a root LICENSE.
- **Actual:** No API surface changes. All `main`/`exports`/`types`/`bin` fields are unchanged. The only code artifact is a new `scripts/verify-publish-metadata.mjs` verification script (see Out-of-scope changes).
- **Impact:** None on dependent slices. Downstream tasks (write-package-readmes, adopt-changesets, release-ci-workflow) consume the metadata as-is.

### Abstraction usage
- Used/was specified: yes. `npm publish --dry-run` is the acceptance check as specified. The packages' existing `main`/`exports`/`types` pointing at `dist/` are unchanged and now work because `files: ["dist"]` includes the compiled output.

### Out-of-scope changes

1. **Per-package LICENSE files** (6 files, one per public package, duplicating the root LICENSE). The arch spec said "Root: add `LICENSE` (MIT, copyright 'Y4shin')" — only a root LICENSE. The worker added per-package LICENSE files in addition to the root one. **Rationale (from the worker's result artifact):** "npm does not inherit root LICENSE into workspace package tarballs." This is correct — `npm publish` packs from the package directory, so a root LICENSE wouldn't be included in `@okf-kb/core`'s tarball. The per-package copies are the mechanism that gets LICENSE into each tarball (verified: each `npm publish --dry-run` lists `LICENSE`). **Severity: low.** Not a deviation from the *intent* (every tarball should include a LICENSE), but it does diverge from the spec's literal "root only" edit map. **Residual risk:** any future license change must be synced across 7 files (root + 6 packages).

2. **`scripts/verify-publish-metadata.mjs`** (155 lines, committed at repo root `scripts/`). Not mentioned in the arch spec or slice doc. It's an acceptance-test script that checks all 6 packages' metadata fields + runs `npm publish --dry-run` per package + asserts tarball contents. **Severity: low.** It automates the slice's acceptance criteria (the `npm publish --dry-run` seam) as a reusable script. Not harmful, but it's a new file at the repo root `scripts/` dir (first use of that directory). The worker's own result artifact references it. Could be moved to a test file or removed; currently it's a standalone verification tool.

### Detailed findings

#### Metadata fields — all 6 packages ✓

All 6 public packages (`core`, `protocol`, `fs`, `daemon`, `cli`, `auth`) have the four required fields:

| Package | files | license | publishConfig | prepublishOnly |
|---------|-------|---------|---------------|----------------|
| @okf-kb/core | `["dist"]` | MIT | `{access: public}` | `npm run build` |
| @okf-kb/protocol | `["dist"]` | MIT | `{access: public}` | `npm run build` |
| @okf-kb/fs | `["dist"]` | MIT | `{access: public}` | `npm run build` |
| @okf-kb/daemon | `["dist"]` | MIT | `{access: public}` | `npm run build` |
| @okf-kb/cli | `["dist"]` | MIT | `{access: public}` | `npm run build` |
| @okf-kb/auth | `["dist"]` | MIT | `{access: public}` | `npm run build` |

#### Root LICENSE ✓

`LICENSE` at repo root: MIT License, Copyright (c) 2026 Y4shin. Standard MIT text.

#### main/exports/types/bin unchanged ✓

- `core`, `protocol`, `fs`, `daemon`, `auth`: `main: ./dist/index.js` — unchanged.
- `cli`: `main: ./dist/src/index.js` (subpath) — unchanged. `files: ["dist"]` correctly includes the whole `dist/` tree (verified: `npm publish --dry-run` for cli lists `dist/src/index.js`, `dist/src/commands.js`, etc.).
- `cli` `bin: { okfkb: ./bin/okfkb.js }` — unchanged.
- `daemon` `bin: { okfkbd: ./bin/okfkbd.js }` — unchanged.
- All `exports`/`types` fields — unchanged.

#### @okf-kb/pi-adapter NOT touched ✓

`packages/pi-adapter/package.json` is unchanged in commit `b2a4201` (confirmed via `git show b2a4201 -- packages/pi-adapter/` — no diff). No LICENSE added for pi-adapter. Correct — it's `private: true` and not published.

#### npm publish --dry-run tarball verification ✓

All 6 packages' tarballs include only `dist/**`, `package.json`, `LICENSE`, and (for cli/daemon) `bin/**`:
- No `src/` in any tarball.
- No `tests/` in any tarball (including `@okf-kb/fs` which has compiled `.js` test helpers — correctly excluded by `files: ["dist"]`).
- No `tsconfig.json` in any tarball.

#### Build + tests ✓

- `npm run typecheck` (tsc --build): exit 0.
- `npm test`: 221 passed, 1 skipped (24 test files + 1 skipped). Unchanged from baseline.

### Residual risks

1. **`dist/tsconfig.tsbuildinfo` in the `@okf-kb/cli` tarball** (53.1 kB). The cli package has `rootDir: "."` (includes `src` + `bin`) while other packages have `rootDir: "src"`, so tsc writes `tsconfig.tsbuildinfo` into `dist/` for cli only. `files: ["dist"]` includes it. It's build-metadata bloat, not breakage — the published package works fine. Could be excluded with `"files": ["dist", "!dist/tsconfig.tsbuildinfo"]` or by moving the tsbuildinfo out of `dist/`. **Severity: cosmetic.**

2. **npm `bin` field warning**: `npm publish --dry-run` warns `"bin[okfkb]" script name bin/okfkb.js was invalid and removed` for both cli and daemon. npm auto-corrects `./bin/okfkb.js` → `bin/okfkb.js` (strips the leading `./`). `npm pkg fix` confirms this is the fix. The bin still works (the file is packed + the symlink is created), but the warning is noise. The bin paths were set by prior tasks (`rename-to-okf-kb-scope`, `split-daemon-binary`), not this slice. **Severity: low.** Fix: strip the `./` prefix from bin values (e.g., `"okfkb": "bin/okfkb.js"` not `"./bin/okfkb.js"`). Not this slice's job but should be fixed before first publish.

3. **Per-package LICENSE duplication**: 7 identical MIT LICENSE files (root + 6 packages). Any future license change must be synced across all 7. Consider a symlink or a publish-time copy mechanism later. **Severity: low.**

4. **`scripts/verify-publish-metadata.mjs` at repo root**: A new 155-line script in a new `scripts/` directory at the repo root. Not harmful but not in the spec. Consider moving it to a test file or documenting it. **Severity: cosmetic.**

### Task doc update needed?
No. The implementation matches the slice doc's acceptance criteria (all 6 packages have the 4 fields, root LICENSE exists, dry-runs are clean, tests green). The per-package LICENSE + verify script are out-of-scope additions that don't conflict with the acceptance criteria.

### User attention needed?
No. No scope changes or API surface differences. The residual risks (tsbuildinfo bloat, bin `./` warning, LICENSE duplication, verify script) are all low-severity and can be addressed in the coherence pass or before first publish. The bin `./` warning (risk #2) is the most actionable — it should be fixed before the first real publish, but it's not this slice's concern (the bin fields were set by prior tasks).

### Process note

The TDD worker stalled on the final report step after completing and committing the work (commits `b2a4201` + `707082d`). The implementation was fully landed (221 passed, 1 skipped, all metadata in place). The parent diagnosed via repo state and dispatched this deviation report directly. Not a deviation — a process observation already recorded as feedback.
