# Deviation report — wire-auth-into-cli-and-daemon

## Summary

Slice 02 ("wire-auth-into-cli-and-daemon") for task "extract-auth-package"
was inspected at commit `d15d60c` (HEAD on `slice/wire-auth-into-cli-and-daemon`,
to be merged). The implementation **matches the arch spec's API surface
exactly** — the light-dep-tree goal is achieved. Two latent issues were
found (devDeps gap, extension file: dep gap), both traceable to
pre-existing conditions rather than worker deviations.

## CLI dependencies

- **Planned:** `dependencies` = `@okf-kb/auth`, `@okf-kb/protocol`,
  `@trpc/client`, `commander` — no `@okf-kb/daemon`, no `@okf-kb/fs`.
- **Actual:** `{"@okf-kb/auth": "*", "@okf-kb/protocol": "*",
  "@trpc/client": "^11.18.0", "commander": "^14.0.0"}` ✓
- Both `@okf-kb/daemon` AND `@okf-kb/core` removed ✓
- `@okf-kb/auth` added ✓

## CLI src/main.ts

- Static `getOrMintToken` from `@okf-kb/auth` at line 7 ✓
- Dynamic `import('@okf-kb/daemon')` kept at line 131 ✓
- Comments at lines 3, 19 updated to reference `@okf-kb/auth` ✓
- No static `from '@okf-kb/daemon'` import remains ✓

## CLI tsconfig.json

- `{"path": "../auth"}` added to references ✓
- `{"path": "../daemon"}` kept in references ✓ (needed for dynamic import)

## Pi-adapter extension

- `config.ts:6` imports `getOrMintToken` from `@okf-kb/auth` ✓
- Comment at line 18 updated ✓
- Extension `package.json`: `@okf-kb/auth` NOT added as `file:` dep ✗
  (works via workspace hoisting; latent gap for standalone install)

## DevDependencies — DEVIATION (low severity)

- `packages/cli/tests/commands.test.ts:12-13` imports `FakeEmbedder` from
  `@okf-kb/fs` and `startDaemon` from `@okf-kb/daemon`.
- These were **never** in cli's `devDependencies` (verified across
  commits `559b228`, `b4fcf76`, `42b8e50`, `d15d60c^`, `d15d60c`).
- Tests pass via npm workspace hoisting only.
- **Not a worker error** — pre-existing condition. The arch spec's edit
  map focused on `dependencies` (the runtime surface) and did not
  explicitly instruct adding test deps to `devDependencies`.
- **Recommended fix:** Parent coherence pass should add
  `"@okf-kb/fs": "*"` and `"@okf-kb/daemon": "*"` to cli `devDependencies`.
  This does NOT affect the light runtime dep tree.

## Out-of-scope — clean

- Daemon source code (`packages/daemon/src/*`, `packages/daemon/tests/*`)
  — not touched ✓
- `startDaemon` / `buildCommonDeps` logic — not touched ✓
- `okfkb daemon` subcommand — kept (line 20-21, 130) ✓
- Keyring strings — not in this slice's diff ✓

## Light-dep-tree goal — ACHIEVED

- Runtime `dependencies` have no `@okf-kb/daemon` or `@okf-kb/fs` ✓
- No `@xenova/transformers` or `better-sqlite3` in the runtime closure ✓
- Only `@okf-kb/daemon` reference in cli src is the dynamic `import()` ✓

## Validation

- `npm run typecheck` (tsc --build): exit 0 ✓
- `npm test`: 218 passed, 1 skipped ✓
- `git show d15d60c --stat`: 5 files changed, 7 insertions, 8 deletions ✓

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings with file paths, line numbers, commit hashes, and severity for each issue (devDeps gap: low, extension file: dep gap: low)"
    }
  ],
  "changedFiles": [
    "packages/cli/package.json",
    "packages/cli/src/main.ts",
    "packages/cli/tsconfig.json",
    "packages/pi-adapter/extension/src/config.ts",
    "package-lock.json"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "npm run typecheck",
      "result": "passed",
      "summary": "tsc --build exit 0"
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "218 passed, 1 skipped, 0 failed"
    },
    {
      "command": "git show d15d60c --stat",
      "result": "passed",
      "summary": "5 files changed, 7 insertions, 8 deletions — only cli, extension config, lockfile"
    },
    {
      "command": "grep @okf-kb/daemon in cli src (static imports)",
      "result": "passed",
      "summary": "Only dynamic import() at main.ts:131 + comments; no static from-import"
    },
    {
      "command": "grep devDependencies across commits",
      "result": "passed",
      "summary": "@okf-kb/fs + @okf-kb/daemon never in cli devDeps (pre-existing condition, not worker error)"
    }
  ],
  "validationOutput": [
    "tsc --build: exit 0 (clean)",
    "npm test: 218 passed, 1 skipped, 0 failed",
    "git show d15d60c --stat: 5 files (package-lock, cli/package.json, cli/src/main.ts, cli/tsconfig.json, pi-adapter/extension/src/config.ts)",
    "cli dependencies: @okf-kb/auth + @okf-kb/protocol + @trpc/client + commander — no daemon, no fs, no core",
    "cli src: static getOrMintToken from @okf-kb/auth (main.ts:7); dynamic import @okf-kb/daemon (main.ts:131); no static daemon import",
    "cli tsconfig: ../auth added, ../daemon kept",
    "devDependencies: @okf-kb/fs + @okf-kb/daemon NOT present (pre-existing gap, not worker deviation); tests pass via workspace hoisting",
    "extension package.json: @okf-kb/auth not added as file: dep (latent gap for standalone; works in-workspace via hoisting)",
    "out-of-scope: daemon source untouched, startDaemon/buildCommonDeps untouched, okfkb daemon subcommand kept"
  ],
  "residualRisks": [
    "low: @okf-kb/fs + @okf-kb/daemon missing from cli devDependencies — tests resolve via workspace hoisting only; parent should add them as devDeps in coherence pass",
    "low: pi-adapter extension package.json missing @okf-kb/auth as file: dep — resolves via hoisting in-workspace; parent should add file:../../auth in coherence pass",
    "low: @okf-kb/daemon still listed in extension package.json deps even though config.ts no longer imports from it — may be droppable if no other extension file imports from daemon (needs grep)"
  ],
  "noStagedFiles": true,
  "diffSummary": "5 files changed: cli package.json (drop daemon+core deps, add auth), cli main.ts (static getOrMintToken from auth, comments), cli tsconfig.json (add ../auth ref, keep ../daemon), pi-adapter extension config.ts (import from auth), package-lock.json. Light-dep-tree goal achieved. Two latent devDeps/file-dep gaps flagged for parent coherence pass.",
  "reviewFindings": [
    "no blockers",
    "devDeps gap: @okf-kb/fs + @okf-kb/daemon should be in cli devDependencies (test-only; pre-existing, not worker error) — parent coherence fix",
    "extension file: dep gap: @okf-kb/auth should be added to extension package.json deps — parent coherence fix",
    "light-dep-tree goal achieved: runtime dependencies have no @okf-kb/daemon or @okf-kb/fs"
  ],
  "manualNotes": "The two issues found are latent, not blockers, and both trace to pre-existing conditions (devDeps were never declared, even before the rename task). The parent should apply two small coherence fixes: (1) add @okf-kb/fs + @okf-kb/daemon to cli devDependencies, (2) add @okf-kb/auth to extension package.json deps. Neither affects the light runtime dep tree."
}
```
