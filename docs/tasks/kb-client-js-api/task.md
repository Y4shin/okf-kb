---
kind: task
type: feature
slug: kb-client-js-api
title: KB daemon + core library + CLI (tRPC/MCP) — the agent-agnostic surface
map: agent-knowledge-base
status: ready
blocked_by:
- research-sb-filesystem-and-plugs
- okf-format-adaptation
- decide-js-api-scope-and-contract
- decide-deployment-and-layout
slices:
- core-types-and-builder
- fs-groups-and-sqlite-index
- daemon-trpc-and-mcp
- cli-client
---

## User-visible outcome

One **daemon** owns the KB state (sqlite-vec vectors + literal + graph
indexes, the transformers.js embedder, the single `Kb` instance) and serves
two localhost-HTTP surfaces with Bearer auth: **tRPC** (`/trpc`, for the CLI
and the pi extension — TS, end-to-end typed) and **MCP** (`/mcp`, for any MCP
client). A **CLI** is a tRPC client. The **core library** (`@kb/core`) holds
the Zod-verified types, the typestate builder, and the group interfaces; the
fs-backed groups live in `@kb/fs`; the daemon, CLI, and (future) MCP server
are thin consumers in an npm-workspace monorepo. All of it is agent-agnostic;
pi is the first consumer but consumes via the daemon like any other.

## User story

As an operator I run `kb daemon` (or it's managed); as an agent/user I run
`kb <command>` (a tRPC client) and it reads/writes/searches the global KB at
`$KB_HOME`; an MCP client (e.g. Claude Desktop) connects to `/mcp` and gets
the same operations as tools. The exhaustiveness guarantee (a new method
can't slip past a consumer) is enforced by `tsc` on the binding records.

## Scope boundaries

- **In scope (v1):** `@kb/core` (types + builder + group interfaces + Zod
  schemas + binding-record enforcement), `@kb/fs` (fs-backed groups +
  sqlite-vec for vectors/literal/graph + transformers.js embedder +
  per-section chunking + hybrid index lifecycle), the **daemon** (tRPC +
  MCP surfaces, Bearer auth, token from keyring/env), and the **CLI**
  (tRPC client, commands generated from binding records + `.meta({cli})`).
- **Out of scope (v1):** the pi extension (next task), the in-process /
  optional-daemon V2 path, remote/non-localhost deployment, hosted/Ollama
  embedders, a file-watcher indexer, SB-embedded search (Fog).
- **Transport:** filesystem *inside the daemon*; tRPC + MCP *from consumers
  to the daemon*. (No consumer links `@kb/fs` directly in V1.)

## Acceptance criteria

- `@kb/core`: Zod-verified types (`Ref`/`Actor`/`Rule`/`Frontmatter`/…,
  `z.infer`-derived, `.meta()` tags), `parseRef`/`formatRef`/
  `parseActor`/`formatActor`, the typestate builder
  (`createKb(common).usingX().declare().withX().build()`), the group
  interfaces (`LocalFs`/`Read`/`Search`/`Write`/`IndexAdmin`) with `RefInput`
  params, per-method `*InputSchema` Zod schemas, and the `GroupBindings<G>`
  mapped type that enforces exhaustiveness (a forgotten method → `tsc`
  error). Verified under `tsc --strict`.
- `@kb/fs`: fs-backed group classes constructed from `CommonDeps`; sqlite-vec
  stores vectors + literal + graph indexes (one `.kb/index.db`); transformers.js
  `Embedder` impl; per-section chunking (split by headings, parent-note
  pointer); `put`/`delete` auto-maintain `index.md` + the `log/` dated
  archive + root `log.md`, and trigger incremental `search.update`; `check`
  runs the manifest's `integrity_checks` (A1–A7, B1–B5, B7=error, B8).
- **Daemon**: builds the `Kb` from `CommonDeps` (space = `$KB_HOME` or
  `--space`, manifest loaded); exposes `/trpc` (router built from the binding
  records — each binding → a `.query`/`.mutation` with its Zod inputSchema)
  and `/mcp` (each binding → an MCP tool with `inputSchema` via
  `z.toJSONSchema`); Bearer auth (token from `@napi-rs/keyring`, `KB_TOKEN`
  env fallback); localhost only.
- **CLI**: tRPC client; commands generated from the binding records +
  `.meta({cli})` (positional vs `--flag`/`-x`, `--help`); `kb <command>`
  for each exposed group method; `kb daemon` to run the daemon.
- **End-to-end**: write a note via CLI → it appears in the SB UI (SB's
  `SB_FS_WATCH=auto` picks up the disk write — confirmed by research);
  `kb search` returns RRF-blended hits; `kb check` passes on a conformant
  bundle and fails (B7=error) on an orphaned glossary term.

## Existing abstractions to use

- OKF v0.2 (frontmatter, typed `relations` + prose-link rule, manifest,
  integrity checks) — from `okf-format-adaptation`.
- `manifest.yaml` as the data-driven spine (types/predicates/conventions/
  integrity_checks) — from `okf-format-adaptation`.
- Zod v4 (`z.infer`, `.meta()`, `z.toJSONSchema`), tRPC, MCP SDK,
  `env-paths`, `@napi-rs/keyring`, `sqlite-vec`, transformers.js.
- Silverbullet `SB_FS_WATCH=auto` (filesystem-write pickup — research-confirmed).

## Architecture / domain decisions (folded from grilling)

- **Daemon-mediated V1**: daemon owns `.kb/`; CLI/pi/MCP are clients (tRPC
  or MCP). V2 optional-daemon is Fog.
- **One IDL → two projections**: the Zod input schemas + `GroupBindings<G>`
  feed both the tRPC router and the MCP emitter; the `keyof Group`
  exhaustiveness guarantee propagates to clients (tRPC infers; MCP regenerates).
- **`@kb/core` pure** (no fs/embedder deps); `@kb/fs` carries the heavy deps;
  consumers are thin. npm-workspace monorepo; selective npm publish later.
- **Ref/Actor/Rule** friendliness types; `parseRef`/`formatRef`/
  `parseActor`/`formatActor`; `IdRef = {slug, ty}`, `PathRef = {path}`.
- **Search**: sqlite-vec for all three indexes; transformers.js embedder
  (only impl in v1, configurable shape); per-section chunking; RRF ranking
  (k≈60); graph is a mode + optional `withGraph` context, not a rank signal;
  `graph(ref, dir, {predicate?})` (signature kept, predicate filter added).
- **Utility** (computeId/validate/frontmatterFor/normalize/stampProvenance)
  is a DI injectable, NOT a group on `Kb`; authoring model (b): the skill
  teaches authoring, the library validates.
- **`generated.by = pi/<version>/<model>`** for AI notes.
- **Global KB** at `$KB_HOME` (default `env-paths('kb').data`); standalone,
  git-versioned in its own repo. `.kb/` (index+config) sits beside the
  bundle, gitignored. No auth on SB in v1; daemon Bearer auth via keyring.
- **Enforcement**: `GroupBindings<G>` mapped type + `tsc --strict` in CI
  catches a forgotten method (`Property 'peek' is missing`) and schema
  drift (`_output … Property 'ref' is missing`). No codegen for wrappers
  (they loop the records); codegen is read-only OpenRPC (optional).
