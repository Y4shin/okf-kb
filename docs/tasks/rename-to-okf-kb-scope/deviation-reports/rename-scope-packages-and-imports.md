## Deviation report — rename-scope-packages-and-imports

### API surface changes
- **Planned:** Rename all 6 package `name` fields (`@kb/*` → `@okf-kb/*`), the pi-extension's `@kb/pi-extension` → `@okf-kb/pi-extension`, every `@kb/...` import across `packages/**/*.ts` (source + tests + extension), all `@kb/*` dep entries in `package.json` files, all `@kb/` comment references, and the bin file `kb.js` → `okfkb.js` with its `package.json` bin field + CLI test spawn path.
- **Actual:** All of the above was done exactly as specified. No API surface changes (this is a rename-only task; no runtime behavior changed). The `@okf-kb/*` package names, imports, deps, comments, and bin are all correctly renamed. The `@kb/pi-extension` → `@okf-kb/pi-extension` was done (including its `file:` dep name refs, paths unchanged). The extension's own `package-lock.json` was regenerated and committed.
- **Impact:** None on dependent slices — the interface contract is met: downstream tasks see `@okf-kb/*` everywhere, `okfkb` bin, no residual `@kb/`.

### Abstraction usage
- Used/was specified: yes. npm workspaces, tsc project references, and commander were used as specified. No reimplementations.

### Out-of-scope changes
- **None.** The worker correctly stayed within scope:
  - `install-pi.mjs` `pi-kb` extension dest — **not touched** ✓ (line 12 still `extensions/pi-kb`)
  - `kb daemon` / `kb config` *subcommands* — **kept** ✓ (removed in `split-daemon-binary`, not here)
  - `kb-daemon` MCP server name string (`mcp.ts:27 { name: 'kb-daemon' }`) — **not touched** ✓
  - Keyring service string (`auth.ts: service 'kb', account 'daemon'`) — **not touched** ✓
  - Archived docs — **not touched** ✓
  - `$KB_HOME` / `$KB_URL` / `$KB_TOKEN` env var names — **not touched** ✓ (only the `@kb/daemon` reference in adjacent comments was updated, not the env var names)
  - Docs (`setup-guide.md`, `dev-env.md`) — **not touched** ✓ (correctly deferred to slice 02)
  - `commander` `.name('kb')` / `.description('kb — ...')` — **not touched** ✓ (correctly deferred to slice 02)
  - `main.ts:152` stderr line `"kb daemon listening on"` — **not touched** ✓ (correctly deferred to slice 02)
  - `main.ts` comments referring to `` `kb daemon` `` / `` `kb config` `` as subcommand names — **not touched** ✓ (correctly deferred to slice 02 per arch spec)

### Minor observations (not deviations, not blockers)

1. **CLI test `it()` labels still say `kb`** (e.g., `'kb write.put --content puts a note...'`, `'kb binary (child_process) round-trips...'`). These are cosmetic test-description strings, not assertions about the command name — the tests call `cli('write.put', ...)` which routes through the program, not through a `kb` literal. The slice doc says "any `kb` command-string assertions change" — these are not assertions, so no change was needed. However, slice 02 or a later coherence pass could update them for consistency with `okfkb`. **Not a blocker.**

2. **`helpers.d.ts` is gitignored** (`.gitignore:11` matches `packages/*/tests/**/*.d.ts`). It was updated on disk to `@okf-kb/core` but is not tracked by git, so it doesn't appear in the commit. This is correct — the file is a local type declaration that's gitignored by design. The worker updated it locally (verified), but it won't show in the diff. **Not a blocker.**

3. **`main.ts` comments: `kb daemon` / `kb config` subcommand references left as-is.** The arch spec explicitly assigns these to slice 02 (lines "line 1 comment → keep `okfkb daemon` mention" and "line 19 comment → `okfkb daemon`"). Slice 01 correctly updated only the `@okf-kb/` parts of those same comments (e.g., `@kb/daemon` → `@okf-kb/daemon` on lines 3, 19, 129), leaving the `kb daemon` subcommand name reference for slice 02. This is the correct boundary between the two slices. **Not a deviation.**

### Task doc update needed?
- No. The implementation matches the slice doc's acceptance criteria exactly. No `## Implementation notes` update needed.

### User attention needed?
- No. No scope changes, no API surface differences, no out-of-scope changes. The rename is clean and complete for slice 01's scope.
