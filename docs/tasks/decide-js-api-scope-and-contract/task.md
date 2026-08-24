---
kind: task
type: grilling
slug: decide-js-api-scope-and-contract
title: Decide the concrete shape of the agent-agnostic JS API surface
map: agent-knowledge-base
status: done
blocked_by: []
---

## Decision to settle

The exact shape of the one agent-agnostic surface every agent touches:
language/runtime, packaging (library + CLI), the operation set, the
transport strategy, and the `search()` contract that adapters (pi first,
others later) depend on. The map settled *that* it's a JS library + CLI;
this grilling settles *what* it concretely is, so the JS API feature task
and the pi adapter build against a fixed contract.

## Parent decisions it depends on

- The agent surface is a JS library + CLI (map, decided).
- Transport is local-filesystem primary with optional HTTP (map, decided).
- Search = literal + graph + semantic behind one query (map, decided).
- The surface must stay agent-agnostic: no pi or SB coupling leaks in
  (map, decided).

## Choices already known

- Agents that support custom tools wrap the library (pi extension); agents
  that don't use the CLI.
- Transport must be pluggable behind one interface (filesystem default,
  HTTP optional) so local and future-remote both work.
- OKF conformance is the only format validation (required `type`; tolerate
  unknown keys/types/broken links).
- **Manifest-driven.** `okf-format-adaptation` SETTLED (Q2) to adopt a root
  `manifest.yaml`; the JS API reads its type/predicate vocab and validation
  rules from it instead of hardcoding them. The API loads the manifest to
  drive type routing, predicates, and the `check` integrity gate.
- The bundle uses `id: type:slug` stable IDs (OKF-format Q3 SETTLED), with a
  raw path-as-identity fallback and a `kb normalize` op that upgrades a
  path to `type:slug` in place (idempotent). Typed `relations` are SETTLED
  (Q4) with controlled predicates + a prose markdown link per relation.
- AI notes carry `generated.by = pi/<version>/<model>` (OKF-format Q5
  SETTLED) — adapters must supply the model id.

## Decisions (settled in grilling)

- **Q6 — Language/runtime: SETTLED yes.** TypeScript/Node. Matches both pi
  extensions and Silverbullet plugs (both TS); env has Node v24 + npm 11.
- **Q7 — Transport: SETTLED — filesystem only in v1, but I/O is an optional
  component.** See "Architecture: packaging-agnostic, core + optional I/O"
  below.
- **Q8 — Index + config location: SETTLED yes.** Index + config in a `.kb/`
  dir at the bundle root, gitignored, so it is not Silverbullet content.
  Config in `.kb/config` with env overrides.
- **Packaging-agnostic: SETTLED.** The JS API is a **standalone library** —
  a separate entity. The CLI and the pi extension are **thin consumers**
  that compose the components they need; the pi extension **wraps** the
  library, it is not the library. Three artifacts, one core.

## Architecture: packaging-agnostic, core + optional I/O module (in-library)

The JS API is a **standalone library** containing a core plus an **optional
I/O module that ships with the library** — "optional" means a consumer can
choose not to wire it in, not that the library omits it. Three artifacts,
one library.

- **Core** (always present): OKF validation, manifest reading, stable-ID
  computation, `normalize`, link checking, the three search engines
  (literal/graph/semantic), the `search()` contract, graph traversal. No
direct I/O of its own; operates over content handed to it.
- **Optional I/O module** (shipped with the library; a consumer opts in):
  - **Filesystem I/O** (v1): reads/writes `.md` files, walks the bundle,
    builds/maintains `.kb/index`. Has a **read/index** part (bundle walk,
    index build, incremental update, query) and a **write** part (create/
    update/delete notes).
  - **HTTP I/O** (deferred, designed-for): talks to SB `/.fs`. A later
    slot-in module for remote agents / remote SB.
- **Consumers** wire in what their environment needs:
  - **CLI (local)**: uses the full fs I/O module (read/index + write).
  - **pi extension (v1 local)**: does **NOT** replicate pi's `read`/`write`/
    `edit`/`bash`. For *authoring*, the agent uses pi's native file tools; the
    extension exposes KB-*semantic* tools (`kb_validate`,
    `kb_frontmatter_for`, `kb_compute_id`, `kb_suggest_links`,
    `kb_stamp_provenance`) that return content the agent writes with pi's
    `write`. For *search/index*, the extension wires in the fs I/O module's
    **read/index** part (bundle walk, index, query) but **not** the write
    part — writes go through pi's native tools.
  - **MCP server (future, e.g. Claude Desktop)**: the agent has **no FS
    access**, so the MCP server wires in the **full** fs I/O module
    (read/index + write) as MCP tools. This is where the bundled I/O
    "interaction methods" live — because the consumer cannot touch files.
- **Discoverability op** (`kb locate`): for a restricted pi context that
  can't do file I/O — finds the KB directory/endpoint. Not needed for v1
  local pi (configured path).

### Search/index I/O — SETTLED by architecture (hybrid)

The earlier fork (extension-side vs CLI-built vs hybrid) is dissolved by the
packaging-agnostic architecture: the fs I/O module ships in the library with a
**read/index** part and a **write** part, and each consumer wires in what it
needs.

- **CLI** uses the read/index part for full builds/rebuilds (`kb index`).
- **pi extension** wires in the **read/index** part for **incremental
  per-file updates** (touching only the one changed file + the index after a
  write) plus query. It never does full walks. The extension does not wire in
  the write part — authoring goes through pi's native `write`/`edit`.
- Net: CLI owns full builds; the extension keeps search fresh with cheap
  incremental updates + queries. This is option **(c) hybrid**, now just the
  natural consequence of the architecture, not a separate decision.

## The specific questions to grill (one at a time)

1. **Language/runtime.** TypeScript/Node (matches both pi extensions and
   Silverbullet plugs, which are TS), or a different runtime? Confirm TS/Node.
2. **Packaging.** One library + a thin `kb` CLI from the same package?
   Distributed as an npm package, vendored into this repo, or a standalone
   binary? Where does the package live (this repo, separate repo)?
3. **Operation set.** Confirm the verbs: `get | put | list | delete | grep |
   graph | semantic | search | index | config`. Add/remove any (e.g. a
   dedicated `link`, `verify`, an `index-md` generator, or a `check`/`lint`
   that runs the manifest's `integrity_checks`)?
4. **Transport strategy.** Confirm pluggable transport with filesystem as
   default and HTTP (`/.fs` + `SB_AUTH_TOKEN`) as an optional backend behind
   the same interface — vs. always-HTTP. (Local deployment makes fs default
   correct, but confirm we design for both now.)
5. **The `search(query, { modes })` contract.** Return shape — concept IDs +
   title + snippet + score + matched-mode, with optional graph context
   (typed relations if the manifest adopts them)? Pagination, and a `--json`
   machine mode for agents?
6. **Index + config location.** The search index lives outside the bundle
   (e.g. `.kb/`, gitignored); config in `.kb/config` or env. Confirm.
7. **Manifest consumption.** If `okf-format-adaptation` adopts a root
   `manifest.yaml`, does the JS API load it to drive type routing, predicate
   vocab, and the `check`/`lint` integrity gate? (Recommend yes — it makes the
   API data-driven and the contract stable when types change.)

## Decisions (settled in grilling) — additional

- **Packaging/distribution (Q2/Q5): SETTLED — npm workspace monorepo in this
  repo.** The repo becomes an **npm workspace** monorepo: `packages/core`
  (the JS API library), `packages/cli` (the `kb` CLI), `packages/pi-extension`
  (the pi extension), and a future `packages/mcp-server`. This lets us manage
  the library + all plugins/consumers like a monorepo and **publish
  selectively** to npm later (the core lib + CLI now; the pi extension and MCP
  server when ready). Selective publish keeps the agent-agnostic core
  independently consumable while the pi-specific and MCP consumers ship when
  they're ready.
- **Operation set (Q3): DEFERRED for deeper detail.** The user wants to dig
  into the operation set more before settling it. Resume this next round.

## What downstream work the answer may create

- Fixes the contract `pi-adapter-skill-and-tools` wraps and other agents
  depend on.
- Sets packaging/distribution for `kb-client-js-api`.
- Determines whether the Fog "SB-embedded search" item calls the JS API's
  `search()` over a local socket/HTTP or embeds it differently.

## Type interface (SETTLED — verified under `tsc --strict` on TS 5.9.3)

A **typestate builder**, two phases via a one-way `declare()` switch:

- **Phase 1 — `KbCollector<C>`** (DI collection): `usingSpace` / `usingManifest`
  / `usingUtil` / `usingEmbedder` add fields to `C`; `declare()` seals `C` and
  returns the phase-2 builder. No output methods here.
- **Phase 2 — `Composer<C, G>`** (output declaration): `withRead` / `withSearch`
  / `withWrite` / `withIndexAdmin` / `withLocalFs` add groups to `G`; `build()`
  returns `Kb<G>`. No `usingX` here — one-way switch.

**The gate is a TYPE, not a class.** `Composer<C, G>` is a **conditional
intersection type**: each gated `withX` is `C extends {…requirement…} ?
{ withX(): … } : {}`, so a method *exists on the public type* iff `C` carries
its required inputs. The runtime `ComposerImpl` (public ctor, all methods
present, impl detail) is lifted into the public `Composer` type via a `lift()`
cast. **Why a type and not class/interface-merge:** TS forbids merged
declarations with differing type-parameter constraints (`TS2428`);
conditional-intersection types have no such limit. (Verified by a dummy
2-input/4-output test and the real shape; both exit 0 under `--strict`.)

**`createKb` must be generic over the call site** — `createKb<T extends
Partial<CommonDeps>>(deps: T): KbCollector<T>`, NOT a fixed
`KbCollector<Partial<…>>`. If you type it `Partial`, the field optionality
leaks into `C` and *every* gate stays closed even when the caller passed the
fields. (The bug the dummy caught first.)

**Inputs (all optional at `createKb`):** `space`, `manifest`, `util`,
`embedder`. `embedder` lives in `CommonDeps` (decision (a)); fs groups that
ignore it simply don't destructure it.

**Gating (each `withX`'s requirement on the sealed `C`):**
- `withRead` / `withWrite` / `withLocalFs` → need `space` + `manifest` + `util`.
- `withSearch` / `withIndexAdmin` → need `space` + `manifest` + `util` +
  `embedder`.

**`Utility` (née `Meta`) is a DI injectable, NOT a group on `Kb`.** It's passed
  in `CommonDeps.util`; the fs groups use it internally (computeId, validate,
  stamp frontmatter/provenance). It is never on the mother object.

**Public API takes `Ref`, not raw strings.** `Note`/`Frontmatter` are internal; the
  public boundary uses `Ref`, content strings, and result shapes
  (`NoteView`, `SearchHit`, `CheckReport`). A structured `Ref` replaces raw
  id/path strings:
  - `Ref = IdRef | PathRef`
  - `IdRef = { slug: string; ty: Type }` — `slug` is *just* the slug (NOT
    the canonical `type:slug`); `ty` is the type. The canonical concept id
    (`type:slug`) is **composed only when needed** (e.g. for the OKF
    frontmatter `id` field) or parsed from a raw string. No redundancy
    between `IdRef` and `PathRef`; no string parsing at the use site.
  - `PathRef = { path: string }`.
  - `parseRef(ref: string): Ref` — the way in from a raw string (a wikilink
    target, a pasted `concept:foo`, or a path). Resolves to `IdRef` for
    `type:slug`-shaped input where the type is known, else `PathRef`.
  `Read` returns a public `NoteView` (read-only view, carries a `ref`), not
  the internal `Note`. Query text (`q`) and content (`content`) stay strings.

**Authoring model (decision (b)):** the skill teaches authoring; the library
  *validates*, it does not scaffold. So pi (no `Write`) authors from
  skill-taught knowledge with pi's native `write`/`edit`; the library's
  `Search.update(ref, content)` / `Search.checkId(ref)` are the post-write
  hygiene pair. `frontmatterFor`/`computeId`/`normalize`/`stampProvenance`/
  `validate` are **internal** (Utility), reached via `check`/`checkId`.

**Consumer exposure (Recovered/refined):**
- CLI: all groups.
- pi extension (v1): `LocalFs` + `Search` only (no `Read`/`Write`/`IndexAdmin`;
  pi's native `read`/`write`/`edit` author).
- MCP server (future, no-fs agent): `Read` + `Search` + `Write` + `LocalFs`
  (no `IndexAdmin`; operator runs builds).

### Methods exported by each group

- **`LocalFs`** (needs `space`+`manifest`+`util`):
  - `resolvePath(ref: Ref): PathRef`
  - `resolveId(ref: Ref): IdRef`
  - `dirFor(type: Type): PathRef`
  - `pathFor(type: Type, slug: Slug): PathRef`
  - `spaceRoot(): PathRef`
- **`Read`** (needs `space`+`manifest`+`util`):
  - `get(ref: Ref): Promise<NoteView>`
  - `list(opts?: { type?: Type; tag?: Tag; status?: string; by?: Actor }):
     AsyncIterable<ListEntry>`
- **`Search`** (needs `space`+`manifest`+`util`+`embedder`):
  - `searchText(q: string, opts?: { fields?: string[] }): Promise<SearchHit[]>`
  - `searchSemantic(q: string, k?: number): Promise<SearchHit[]>`
  - `searchUnified(q: string, opts?: { withGraph?: boolean }):
     Promise<SearchHit[]>`
  - `graph(ref: Ref, dir: 'ancestors' | 'descendants' | 'neighbors'):
     Promise<Ref[]>`
  - `update(ref: Ref, content: string): Promise<void>`  *(incremental index
     refresh; agent passes the content it read natively)*
  - `checkId(ref: Ref): Promise<CheckReport>`  *(post-write conformance;
     lives here so no-`Read` consumers still get it)*
- **`Write`** (needs `space`+`manifest`+`util`):
  - `put(ref: Ref, content: string): Promise<PutResult>`  *(content is full
     markdown fm+body; group parses/validates/stamps/writes/maintains
     index.md+log/triggers `search.update`; returns `{ ref: IdRef; etag?;
     changed; warnings }`)*
  - `delete(ref: Ref): Promise<DeleteResult>`
- **`IndexAdmin`** (needs `space`+`manifest`+`util`+`embedder`):
  - `buildIndex(): Promise<void>`
  - `rebuildIndexes(): Promise<void>`  *(vector + all index.md + log)*
  - `check(): Promise<CheckReport>`  *(full-bundle integrity walk: B1 id
     unique, all cross-note rules)*
- **`Utility`** (DI injectable, NOT on `Kb`):
  - `computeId(type: Type, slug: Slug): IdRef`  *(returns `{ slug, ty }`)*
  - `validate(note: Note): CheckReport`
  (plus internal `frontmatterFor`/`normalize`/`stampProvenance` used by
  `Write`/`check`; not public.)
- **Shared public types & helpers**:
  - `Ref = IdRef | PathRef`; `IdRef = { slug: Slug; ty: Type }`;
    `PathRef = { path: string }`.
  - `parseRef(ref: string): Ref` + `formatRef(ref: Ref): string` — raw
    string ↔ Ref (`type:slug`-shaped → `IdRef`, else `PathRef`), symmetric.
  - `Actor = { kind:'agent'; producer; version; model? } | { kind:'human';
    id } | { kind:'process'; id }` (agent-agnostic; pi is `producer:'pi'`);
    `parseActor(s): Actor` + `formatActor(a): string` (frontmatter stores
    the string form `pi/<ver>/<model>`).
  - `Rule` literal union (`'A1'..'A7' | 'B1'..'B8'`) in `CheckReport.errors[].rule`.
  - `NoteView = { ref: Ref; frontmatter: Readonly<Frontmatter>; body: string }`.
  - `SearchHit = { ref; title; snippet; score; mode }`.
  - `ListEntry = { ref: Ref; title?; description?; mtime }` (progressive
    disclosure; `list` yields entries, not bare refs — no `get` round-trip
    per item).
  - `PutResult = { ref: IdRef; etag?; changed; warnings }`,
    `DeleteResult = { ref: Ref; removed }`.
  - `CheckReport = { ok; errors: { rule: Rule; ref: Ref; msg }[] }`.
  - Branded aliases (pure, low-cost): `Slug = string`, `IsoDate = string`,
    `Tag = string`, `Vector = number[]`.
  - Frontmatter families typed (internal, enables structural `validate`):
    `generated: { by: Actor; at: IsoDate }`, `verified: { by; at }[]`,
    `sources: Source[]` (`author?: Actor`, `last_modified?: IsoDate`).

### Builder surface (the composition API)

- `createKb(deps: Partial<CommonDeps>): KbCollector<…>` (overloaded; no-arg
  variant returns `KbCollector<{}>`)
- `KbCollector`: `usingSpace` / `usingManifest` / `usingUtil` / `usingEmbedder` /
  `declare`
- `Composer` (phase-2, gated): `withRead` / `withSearch` / `withWrite` /
  `withIndexAdmin` / `withLocalFs` / `build`
- `Kb<G>` = `G` (the built mother object: base `{}` plus exactly the composed
  groups).

## Zod-verified, string-coercing, framework-ready (SETTLED — verified under
  `tsc --strict` on TS 5.9.3 + Zod 4.4.3, runtime coercion confirmed)

Every type is a **Zod schema**; the TS types are `z.infer<typeof XSchema>`.
This makes the schemas the single source of truth, so they can be fed directly
  to trpc procedures / OpenAPI (`z.toJSONSchema`, `zod-to-openapi`) / MCP
  tool-input generation.

- **Coercing input schemas** — `RefSchema` and `ActorSchema` are unions that
  **accept a raw string and transform** it: `z.union([IdRefSchema,
  PathRefSchema, z.string().transform(parseRef)])`. The `z.infer` **output** is
  the structured form (`Ref` = `IdRef | PathRef`); a separate `RefInput =
  Ref | string` (and `ActorInput = Actor | string`) is used for **method
  params**, so a caller can pass either the structured form OR a raw string
  (`get('concept:foo')` works). The implementation runs `RefSchema.parse(arg)`
  at the boundary — defensive parsing from the start.
- **Real validation now**, not just aliases: `SlugSchema =
  z.string().regex(/^[a-z0-9][a-z0-9-]*$/)`, `IsoDateSchema =
  z.string().datetime()`, `TypeSchema`/`PredicateSchema`/`RuleSchema` are
  `z.enum(...)`. `FrontmatterSchema` is `.passthrough()` (OKF §11: tolerate
  unknown keys).
- **Per-method INPUT schemas** exported for framework use: `GetInputSchema`,
  `GraphInputSchema`, `PutInputSchema`, `SearchTextInputSchema`, … — these
  are what an HTTP/trpc/MCP layer validates against (e.g.
  `z.toJSONSchema(GetInputSchema)` produces the JSON Schema for an OpenAPI/
  MCP tool).
- **Runtime verified**: `RefSchema.parse('concept:foo')` -> `{slug:'foo',
  ty:'concept'}`; `ActorSchema.parse('pi/0.80.10/claude-opus-4.5')` ->
  `{kind:'agent',producer:'pi',version:'0.80.10',model:'claude-opus-4.5'}`;
  `formatActor(...)` round-trips to the OKF string form; `SlugSchema.parse('BAD
  SLUG')` throws (regex reject). `@kb/core` depends on `zod`.

### Schema metadata tags (`.meta({...})`) — code-gen hints on schemas

Zod v4's `.meta(obj)` attaches arbitrary metadata to any schema; `.meta()`
reads it back, and it **survives `z.toJSONSchema`** (rides inline as a custom
key on each property). This makes the **input schemas the single source of
truth for every consumer** — CLI, HTTP/OpenAPI, MCP all read their per-field
hints from the same schemas, no duplicate arg definitions.

- **Attach** at schema definition:
  ```ts
  z.string().regex(/^[a-z0-9][a-z0-9-]*$/).meta({ cli: { positional: true, desc: 'the note slug' } })
  z.string().meta({ cli: { flag: '--ref', short: '-r', desc: 'note ref, e.g. concept:foo' } })
  z.boolean().default(false).meta({ cli: { flag: '--verbose', short: '-v', desc: 'verbose output' } })
  ```
- **Read** at code-gen time: `schema.meta()?.cli` → `{ positional?, flag?, short?,
  desc?, env? }`.

**Standardized tag namespaces** (so generators agree):
- `cli: { positional?, flag?, short?, desc?, env? }` — CLI generation
  (positional vs `--flag`/`-x`, short aliases, `--help` descriptions, env var
  fallback).
- `api: { path?, query?, header?, deprecated? }` — HTTP/OpenAPI placement.
- `mcp: { hint?, completionFrom? }` — MCP tool UI hints / dynamic completion.
- `doc: { desc?, example?, group? }` — generic, reused by `--help`, OpenAPI
  `description`, and KB `index.md` descriptions (one field, multiple readers).

**Caveat:** `.meta()` is **not** part of the JSON Schema *standard* — it rides
along as a custom key inside the emitted JSON Schema. Strict/standard JSON-
Schema validators ignore unknown keys (allowed), so it doesn't break
validation, but a tool that *only* understands standard JSON Schema won't
read the tags — only our own generators will. If strict-standard emission is
needed later, the generator can strip custom keys on the way out.

## Consumer/wrapper sync enforcement (SETTLED — verified under `tsc --strict`)

**Problem:** adding a method to an API group must not slip past a consumer
(CLI / MCP / pi extension) — a thin wrapper can silently ignore part of an
interface.

**Mechanism (homegrown, ~15 lines, pure `tsc`, no codegen, no framework):**

1. Every group method takes a **single input object** matching its Zod input
   schema (e.g. `get(input: { ref: Ref })`, not `get(ref: Ref)`).
2. A per-consumer **binding record** is typed as a mapped type over the group:
   ```ts
   type MethodBinding<F extends (...a: any[]) => any> = {
     inputSchema: z.ZodType<Parameters<F>[0]>;   // schema OUTPUT must === method param
     meta: { desc: string; cli?: …; api?: …; mcp?: … };
   };
   type GroupBindings<G> = { [K in keyof G]: MethodBinding<Extract<G[K], (...a: any[]) => any>> };
   const cliReadBindings: GroupBindings<Read> = { get: {…}, list: {…}, /* peek: {…} */ };
   ```
3. The consumer wrapper is a **loop over the record** (`for (const [name,b] of
   Object.entries(cliReadBindings)) registerCli(name, b)`), so once a binding
   exists it is auto-used — there is no second place to forget a method.

**What `tsc` enforces (verified by a 3-state demo):**
- **Presence:** adding `peek` to `Read` makes `cliReadBindings` fail to compile
  — `Property 'peek' is missing in type … but required in type
  'GroupBindings<Read>'` — until a `peek` binding is added. Every consumer's
  record errors; none can ship a silently-dropped method.
- **Content drift:** `inputSchema` typed `z.ZodType<Parameters<F>[0]>` means
  the schema's output must equal the method's param. Rename `ref`→`idRef` in
  `get`'s param but forget the schema → `_output … Property 'ref' is missing`.
  Same compile error, same CI gate.

**Scope of the guarantee (honest):** this enforces **shape** (param/result
type + presence), not *semantic* correctness (e.g. that `meta.cli.desc` is
accurate, or that an MCP handler actually routes to `kb.read.get`). Those are a
review/test concern — add one tiny runtime test per consumer that calls each
bound method end-to-end. The *coverage/sync* guarantee is the type system's
job; `tsc --strict` runs in CI.

**Generation policy:** no codegen for wrappers (they're loops). Codegen is
**read-only artifacts only** — a homegrown ~30-line `emitOpenRpc(bindings)`
that walks the records → `z.toJSONSchema(inputSchema)` + `.meta()` → OpenRPC
`methods[]` (transport-agnostic spec; drift just makes a stale spec, never a
broken consumer). Optional ~30-line `emitCli(bindings)` if the CLI grows past
~10 commands; otherwise hand-write the few commands (the type-check keeps them
honest). No `open-rpc` / `@modelcontextprotocol/sdk` / `tsrpc` framework
dependency for enforcement.

**Deliberate per-method opt-out:** if a consumer exposes a group but omits one
method, mark it with an `EXCLUDED` sentinel in the record (the mapped type
still requires a *key*, so omission is explicit, not silent). Whole-group
exclusion (e.g. pi omits `Write`) is handled by not composing that group — the
existing typestate gate already prevents `kb.write` from being on pi's `Kb`.
