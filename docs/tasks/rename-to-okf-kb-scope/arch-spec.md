# Architecture Spec — `rename-to-okf-kb-scope`

Rename the npm scope from `@kb/*` to `@okf-kb/*` across the whole monorepo,
and rename the `kb` CLI binary to `okfkb`. This is the foundational rename
that every downstream task (auth extraction, daemon bin, metadata, CI)
assumes. It is mechanical but wide: 6 packages, ~80 import sites, 1 bin
file, 1 test that spawns the bin, and 2 live docs.

This task does **not** touch the pi extension symlink name
(`~/.pi/agent/extensions/pi-kb`) — that is out of scope by owner decision.

## Slices

- **01 — rename-scope-packages-and-imports:** `@kb/*` → `@okf-kb/*` in all
  `package.json` `name` fields + every `@kb/...` import across source/tests;
  rename `@kb/cli`'s bin file + entry; update the spawning test. tsc + tests green.
- **02 — rename-bin-and-update-consumers:** the `kb` → `okfkb` bin name in
  `commander` (`main.ts`), the bin field, and the live docs (setup-guide,
  dev-env). The `kb daemon` *subcommand* is kept (removed later by
  `split-daemon-binary`).

## Existing abstractions to use

- **npm workspaces** (`root package.json` `workspaces: ["packages/*"]`) —
  unaffected; a package rename doesn't change the workspace layout.
- **tsc project references** (`tsconfig.base.json` + per-package
  `tsconfig.json`) — unaffected by package *name* changes; only `import`
  paths change. The `paths` mapping (if any) should be checked.
- **commander** (`packages/cli/src/main.ts:43`) — `.name('kb')` is the
  program name shown in `--help`; rename to `.name('okfkb')`.
- The `@kb/*` scope on npm is **unclaimed** (verified), so `@okf-kb` is free
  to create later (`npm-account-setup`, already done: org `okf-kb` exists).

## Do NOT reimplement

- Do not change any runtime behavior, types, or test logic. This is a
  rename-only task. The only behavioral change is the string the CLI
  prints as its program name and the filename of the bin shim.
- Do not touch the pi extension dest `pi-kb` in `install-pi.mjs`.
- Do not remove the `kb daemon` / `kb config` *subcommands* — that's
  `split-daemon-binary`. Only the bin *name* changes here.
- Do not rename the systemd unit `kb-daemon.service` (operator's choice;
  out of scope — only the `ExecStart` command path updates).

## Seams under test

The public boundaries this task verifies at:

1. **Import resolution** — `tsc --build` across all packages. A missed
   `@kb/...` import → "Cannot find module '@kb/...'". This is the primary
   seam; it covers source, tests, and the pi-adapter extension.
2. **Bin execution** — `packages/cli/tests/commands.test.ts` spawns
   `node packages/cli/bin/<bin>.js`. The bin file must exist at the new
   path and import the compiled `dist/src/index.js`.
3. **CLI program name** — `okfkb --help` prints `okfkb` (not `kb`).
   Verified by the bin test's behavior (it runs the binary end-to-end).
4. **Full test suite** — `npm test` (217 tests) stays green. No test
   *logic* changes; only string labels and the spawned bin path may update.
5. **No residual `@kb/`** — grep across source (excl `node_modules`, `dist`,
   `package-lock`, archived docs) returns nothing.

## Interface contract (for downstream tasks)

After this task lands, the following are the canonical names downstream
tasks build on:

- **Package names:** `@okf-kb/core`, `@okf-kb/protocol`, `@okf-kb/fs`,
  `@okf-kb/daemon`, `@okf-kb/cli`, `@okf-kb/pi-adapter` (private).
- **Inter-package deps in `package.json`:** all `"@okf-kb/<x>": "*"` (the
  `"*"` is left intact; `adopt-changesets` later switches to `workspace:*`).
- **CLI bin:** `okfkb` (file `packages/cli/bin/okfkb.js`), program name
  `okfkb`. The `okfkb daemon` and `okfkb config` subcommands still exist
  (removed in `split-daemon-binary`).
- **Token import:** `@okf-kb/cli` still imports `getOrMintToken` from
  `@okf-kb/daemon` (unchanged here — `extract-auth-package` moves it).
- **pi-adapter extension:** package name `@okf-kb/pi-adapter`; its
  `extension/package.json` `name` is `@kb/pi-extension` → `@okf-kb/pi-extension`,
  and its `file:../../core` etc. deps become `file:../../core` (paths
  unchanged, names in those files change). The install dest stays `pi-kb`.

## Exact edit map

### Slice 01 — scope + imports + bin file

**package.json `name` fields (6):**
- `packages/core` → `@okf-kb/core`
- `packages/protocol` → `@okf-kb/protocol`
- `packages/fs` → `@okf-kb/fs`
- `packages/daemon` → `@okf-kb/daemon`
- `packages/cli` → `@okf-kb/cli`
- `packages/pi-adapter` → `@okf-kb/pi-adapter` (stays `private: true`)
- `packages/pi-adapter/extension/package.json` `name` `@kb/pi-extension` → `@okf-kb/pi-extension`

**package.json `dependencies`/`devDependencies` entries:** every
`"@kb/<x>": ...` → `"@okf-kb/<x>": ...` (same version spec). Affects:
core (none), protocol (deps `@kb/core`), fs (deps `@kb/core`), daemon
(deps `@kb/core`, `@kb/fs`, `@kb/protocol`), cli (deps `@kb/core`,
`@kb/protocol`, `@kb/daemon`), pi-adapter (deps `@kb/core`, `@kb/protocol`,
`@kb/daemon`; devDeps `@kb/fs`), pi-adapter/extension (`file:../../core`
etc. — paths unchanged; the *names* resolve from the target package.json
which are now `@okf-kb/*`).

**Source imports (`import`/`require`/type imports) across `packages/**/*.ts`:**
every `@kb/core` / `@kb/protocol` / `@kb/fs` / `@kb/daemon` → `@okf-kb/*`.
Files (from grep):
- `packages/protocol/src/{records,router}.ts`
- `packages/daemon/src/{trpc,mcp,deps,server,auth,index}.ts`
- `packages/daemon/tests/{auth,server,deps}.test.ts`
- `packages/cli/src/{commands,client,main,index}.ts`
- `packages/cli/tests/commands.test.ts`
- `packages/fs/src/{write,index-admin,check,search,walk,utility,local-fs,embedder,read,db,index}.ts`
- `packages/fs/tests/{local-fs,write,search,check,index-admin,read,helpers}.ts` + `helpers.d.ts`
- `packages/pi-adapter/extension/src/{client,config,tools,index}.ts`
- `packages/pi-adapter/tests/{tools,remote-roundtrip,kb-ask-skill,kb-curate-skill,kb-research-skill,kb-save-session-skill}.test.ts`

**Comment references to `@kb/...`:** many source files have `// @kb/core —`
header comments and inline `@kb/fs`/`@kb/daemon` mentions. For consistency,
update these too (they're cosmetic but the "no residual `@kb/`" grep
acceptance criterion includes comments — decide: update comments to keep
the grep clean). **Decision: update comments** so the grep is genuinely
clean and future readers aren't misled.

**pi-adapter skill tests (special):** `kb-ask-skill.test.ts`,
`kb-curate-skill.test.ts`, `kb-research-skill.test.ts`,
`kb-save-session-skill.test.ts` assert that the skill markdown does *not*
contain `@kb/fs` / `@kb/daemon` / `@kb/protocol` imports. These are
**negative assertions** about the skill content. After rename, update
these assertions to check for `@okf-kb/*` instead (the skill markdown
itself, if it mentions these, would also need updating — check the skill
files).

**Bin file:** `packages/cli/bin/kb.js` → `packages/cli/bin/okfkb.js`
(content: the `import { runCli } from '../dist/src/index.js'` is
path-relative, unaffected by scope rename). Delete `bin/kb.js`.

**`packages/cli/package.json`:** `bin: { "kb": "./bin/kb.js" }` →
`{ "okfkb": "./bin/okfkb.js" }`.

**CLI test spawn path:** `packages/cli/tests/commands.test.ts:287`
`spawn('node', ['packages/cli/bin/kb.js', ...])` → `'packages/cli/bin/okfkb.js'`.

### Slice 02 — bin name in commander + docs

**`packages/cli/src/main.ts`:**
- line 43: `.name('kb')` → `.name('okfkb')`
- line 44: `.description('kb — knowledge base CLI ...')` → `.description('okfkb — knowledge base CLI ...')`
- line 1 comment `// @kb/cli — main entry: parse argv, route to \`kb daemon\`` →
  keep `okfkb daemon` mention (subcommand kept).
- line 19 comment `\`kb daemon\`` → `\`okfkb daemon\``.

**`docs/setup-guide.md`:**
- line 20: ``one for the `kb daemon` Node`` → `` `okfkb daemon` ``
- line 223: `ExecStart=$(which node) $REPO/packages/cli/bin/kb.js daemon` →
  `$REPO/packages/cli/bin/okfkb.js daemon`
- line 244: `"kb daemon listening on http://...` → `"okfkb daemon listening...`
  (this is the stderr line the program prints — must match `main.ts:152`
  which says `kb daemon listening on ${handle.url}`. **Update `main.ts:152`
  to `okfkb daemon listening`** so the doc + code match. This is a code
  change in slice 02.)
- Other `kb <subcommand>` prose mentions (lines 309, 311, 340, 343) →
  `okfkb <subcommand>`.

**`docs/dev-env.md`:** grep for `kb` command mentions → `okfkb`.

**Not changed:** `kb-daemon.service` (unit name), `kb-silverbullet.service`,
`kb@local` git identity, `$KB_HOME`/`KB_URL`/`KB_TOKEN` env vars, the
`kb-*` skill names, `kb-daemon` MCP server name string (in `mcp.ts:24`
`{ name: 'kb-daemon', ... }` — leave; it's the MCP server's advertised
name, a product identity, not the npm scope).

## Risks / watch-outs

- **pi-adapter extension `file:` deps:** `extension/package.json` uses
  `file:../../core` (relative path). The path is unchanged; the *name*
  in `packages/core/package.json` changes. npm resolves `file:` deps by
  reading the target's `name`, so no path edit needed — just ensure the
  target name is `@okf-kb/core`. Verify with `npm install` after.
- **`@napi-rs/keyring` service string:** in `auth.ts`, the keyring
  service/entry name must stay stable so existing minted tokens still
  resolve. **Not touched** by this rename (the service string isn't
  `@kb`-prefixed; verify it's unchanged).
- **Archived docs:** `docs/tasks/archive/...` contain historical `@kb/`
  and `pi-knowledgebase` references. **Do not touch** — they're a record
  of what was. The "no residual `@kb/`" grep excludes `docs/tasks/archive/`.
- **`package-lock.json`:** will be regenerated by `npm install`. It's
  expected to change; commit it.
- **`tsconfig.tsbuildinfo`:** gitignored; `tsc --build` rebuilds it.
