---
kind: slice
slug: kb-tools-extension
title: pi extension — tRPC client of the daemon, KB tools from the pi-shaped binding subset
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

A pi extension is a **tRPC client** of the KB daemon and registers KB tools
generated from the **pi-shaped `GroupBindings` subset** (no `Write` — pi
authors with native `write`/`edit`). The agent can read/list/search/graph
the KB and trigger `search.update` after authoring.

## Acceptance criteria

- Tools registered: `kb_get`, `kb_list`, `kb_search` (unified),
  `kb_graph`, `kb_update`, `kb_check_id`, `kb_resolve_path`, `kb_resolve_id`
  (and a read-only `kb_frontmatter_for`/`kb_stamp_provenance` helper if
  useful for authoring). **No `kb_put`/`kb_delete`.**
- Each tool is generated from the pi binding subset
  (`GroupBindings<Read> & GroupBindings<Search> & GroupBindings<LocalFs>`,
  no `GroupBindings<Write>`); the binding record enforces completeness (a
  new daemon method → pi's record errors until bound or `EXCLUDED`).
- Tool args accept `RefInput`/`ActorInput` (raw strings auto-coerced via
  `parseRef`/`parseActor`); the daemon's Zod schemas validate at the
  boundary.
- Config via pi settings / env: daemon URL, token (keyring/env). No
  committed secrets.
- Round-trip: `kb_resolve_id` + pi native `write` a note + `kb_update` →
  `kb_get` returns it; `kb_search` finds it.

## Test plan

- **Seams**: tRPC client construction, tool registration from the binding
  subset, arg coercion, error mapping (daemon 401/network/parse errors →
  tool errors the agent can react to).
- **Failure modes**: daemon not running, bad token, OKF validation failure
  surfaced from the daemon, tool called with bad args.
- **Scenarios**: create→read round-trip (via native write + `kb_update` +
  `kb_get`); `kb_list` returns created note; `kb_search` literal+semantic
  hit on a created note; `kb_graph` on a linked pair.
- **Edge cases**: tool called outside a session, very large note,
  concurrent `kb_update`.

## Constraints and dependencies

- Depends on `kb-client-js-api` (the daemon's tRPC surface + the
  `GroupBindings` enforcement + `@kb/core` types). Deps: `@trpc/client`,
  the pi extension API.
- No `@kb/fs` import — pi is a daemon client in V1.
- No Q&A in this slice (that's `conversational-qa-rag`).
