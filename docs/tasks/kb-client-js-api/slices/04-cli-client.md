---
kind: slice
slug: cli-client
title: CLI — tRPC client; commands generated from binding records + .meta({cli})
task: ../task.md
mode: afk
status: todo
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
