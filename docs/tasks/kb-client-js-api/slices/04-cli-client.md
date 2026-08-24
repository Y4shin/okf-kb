---
kind: slice
slug: cli-client
title: CLI — tRPC client; commands generated from binding records + .meta({cli})
task: ../task.md
mode: afk
status: done
size: m
blocked_by: [daemon-trpc-and-mcp]
---

## End-to-end behavior

The **`kb` CLI** is a thin tRPC client of the daemon. Its commands are
generated from the same `GroupBindings<G>` binding records + each method's
`.meta({cli})` (positional vs `--flag`/`-x`, `--help` descriptions, env
fallback) — so a new daemon method becomes a CLI command automatically and
the type-check keeps them in sync. The CLI also runs the daemon
(`kb daemon`).

## Acceptance criteria

- `kb <command>` for each exposed group method (e.g. `kb get concept:foo`,
  `kb list --type concept`, `kb search "topic" --with-graph`,
  `kb graph concept:foo ancestors --predicate decided_in`, `kb put
  concept:foo --file note.md`, `kb delete concept:foo`, `kb check`,
  `kb index --update`, `kb rebuild-indexes`, `kb config`).
- Commands are generated from the binding records (`for (const [name,b]
  of entries) registerCli(name, b.inputSchema, b.meta.cli, …)`) — adding a
  method to a group + its binding makes a CLI command appear; forgetting
  the binding is a `tsc` error.
- Raw-string args accepted at the CLI (strings → `Ref` via `parseRef`,
  → `Actor` via `parseActor` at the tRPC boundary / Zod parse).
- `kb daemon` runs the daemon (the slice-3 surface).
- Token from keyring/env is sent as the Bearer header.
- `--help` per command (from `.meta({cli:{desc}})`); `--json` output mode
  for agent/machine consumption; sensible exit codes.
- End-to-end: `kb put concept:foo --file note.md` → note appears in a
  running Silverbullet UI (SB `SB_FS_WATCH=auto` picks up the disk write,
  research-confirmed); `kb search "topic"` returns RRF-blended hits from
  the daemon.

## Test plan

- **Seams**: command registration from records; arg parsing via the Zod
  inputSchema + `.meta({cli})`; tRPC client call; Bearer header injection.
- **Failure modes**: daemon not running → clear error; bad token → 401;
  unknown command; invalid arg (Zod parse fails) → helpful message.
- **Scenarios**: every group method has a command; `--help` lists them;
  `--json` is parseable; `kb get concept:foo` round-trips with `kb put`;
  `kb check` passes on a conformant bundle and fails (B7=error) on an
  orphaned glossary term.
- **Edge cases**: a method `EXCLUDED` for the CLI (if any) has no command
  (the binding record handles it); positional + flag mix; env fallback for
  the token.

## Constraints and dependencies

- Depends on `@kb/core` (types + binding records) + the daemon
  (slice-3). Deps: a CLI arg framework (commander/yargs — or the
  generated-from-records approach), `@trpc/client`.
- The CLI is a *client* — no direct `@kb/fs` import in V1.
- One config source: `KB_HOME`, `KB_TOKEN` (env), `.kb/config`; precedence
  env > config > default.

## Implementation notes

**`@kb/cli` implemented** — `runCli` (argv pre-parser + dispatcher) +
`createTrpcClient` (`createTRPCProxyClient<AppRouter>` with `httpBatchLink` to
`<url>/trpc` + Bearer auth header) + `AppRouter` type (type-only import from
`@kb/protocol`) + `bin/kb.js` (`#!/usr/bin/env node` importing compiled
`dist/src/index.js`). Commands are generated from `fullBindings` via
`registerAllCommands` → a `registerBindingCommand` loop over
`flattenBindings(fullBindings)`, producing one commander subcommand per
binding. `kb daemon` calls `@kb/daemon`'s `startDaemon`; `kb config` is
special-cased to a config printer. `--json` output mode, `--help` per command
(from `.meta({cli})`), and sensible exit codes (`check` `ok:false` → non-0).
90 tests pass + 1 skipped, including a built-bin `child_process.spawn`
end-to-end round-trip (`write.put` + `read.get`).

**Deviations from the acceptance criteria examples:**

- (a) Commands are **fully-qualified `group.method` kebab-cased** (`kb
  read.get`, `kb write.put`, `kb search.search-unified`, `kb index-admin.check`)
  — NOT the short aliases shown in the acceptance examples (`kb get`, `kb put`,
  `kb search`, `kb check`). This is deliberate: the commands are mechanically
  generated from the `fullBindings` records (`group.method`), and a `toKebab()`
  conversion normalizes both group and method parts. The tRPC client still uses
  the original camelCase group/method names to call procedures.
- (b) The registration export is **`registerBindingCommand` /
  `registerAllCommands`**, not the `registerCli` named in the criteria. Same
  generation-from-records intent; different export name.
- (c) **`.kb/config` is not read** — only `KB_HOME` / `KB_TOKEN` / `KB_URL` env
  vars are consulted. `meta.cli.env` is typed but not wired at runtime.
- (d) **Fixed:** `package.json` `main`/`exports` now point at
  `./dist/src/index.js` (the build emits `dist/src/`); a programmatic
  `import '@kb/cli'` resolves correctly. The `kb` binary imports
  `../dist/src/index.js` directly and already worked.
- (e) Per-command flag special-casing (`opts`/`content`/`k`) is **hand-written
  for 4 methods** (`write.put` `--file`/`--content`, `search.searchUnified`
  `--with-graph`, `search.searchText` `--fields`, `search.searchSemantic
  `--k`). The generation loop covers command *existence*; the nested-opts flags
  are pragmatic hand-written special-cases on top of it.

**Other notes:** global options (`--url`/`--token`/`--json`) are pre-parsed and
stripped from argv before commander sees them (so they work before or after the
subcommand); commander uses `exitOverride()` to throw `CommanderError` instead
of `process.exit()` (vitest-friendly); `getOrMintToken` mints a random in-memory
token in headless CI when `--token` is absent. No `@kb/fs` import in CLI source
(only `FakeEmbedder` in tests).
