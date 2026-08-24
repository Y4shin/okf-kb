# Architecture spec — `pi-adapter-skill-and-tools`

> Shared across the 2 slice chains for task `pi-adapter-skill-and-tools`.
> Lives at `docs/tasks/pi-adapter-skill-and-tools/arch-spec.md`. Consumes
> the landed `kb-client-js-api` (the daemon + `@kb/protocol`'s `AppRouter`
> + `piBindings`).

## What this task delivers

A **pi extension** (a tRPC client of the daemon) that registers KB tools the
agent can call, and a **pi skill** (`kb-ask`) that gives cited, grounded
Q&A over the KB. Both consume the agent-agnostic daemon — proving the
tRPC surface is agent-agnostic (pi is the first adapter).

## Placement

- **Extension**: `~/.pi/agent/extensions/pi-kb/` (global) — a directory with
  `package.json` (deps: `@trpc/client`, `@kb/core`, `@kb/protocol` via the
  monorepo workspace OR published; for v1, a local workspace link or a
  vendored copy — decide at port time, prefer a `file:` link to the
  monorepo's `packages/protocol` + `packages/core` so it stays in sync).
  The extension is auto-discovered from `~/.pi/agent/extensions/pi-kb/index.ts`.
  For dev, it can also be tested via `-e ./path` from a clone.
- **Skill**: `~/.pi/agent/skills/kb-ask/SKILL.md` (global) — discovered as
  `/skill:kb-ask`. The skill is a markdown instruction set (no code; it
  teaches the agent to call the extension's `kb_*` tools in the right
  order with the right citation/refusal rules).

Both live in the user's `~/.pi/agent/` tree (global), NOT in the project
repo — they are *adapter* artifacts, not KB content. The repo ships their
source under `packages/pi-extension/` (for versioning + tests) and an
install step (or a `pi install` package entry) links them into
`~/.pi/agent/`. Decide at port time: simplest v1 is to ship the source in
the repo under `packages/pi-extension/` + `packages/pi-skill/` (or a single
`packages/pi-adapter/` with `extension/` + `skill/` subdirs) and have a
`npm run install:pi` script that symlinks them into `~/.pi/agent/`.

## Monorepo layout (added packages)

```
packages/
  pi-adapter/                  # the pi adapter (extension + skill source + installer)
    extension/
      package.json             # deps: @trpc/client, @kb/core, @kb/protocol; "pi": {"extensions": ["./src/index.ts"]}
      src/index.ts             # the extension factory (default export): builds the tRPC client, registers tools from piBindings
      src/client.ts            # createKbTrpcClient(url, token) -> createTRPCProxyClient<PiAppRouter>
      src/tools.ts             # registerKbTools(pi, client): loop piBindings -> pi.registerTool per binding
      src/config.ts            # resolveKbConfig(): KB_URL, KB_TOKEN (env > keyring via @kb/daemon's getOrMintToken)
      tests/tools.test.ts      # tool registration + round-trip against a test daemon (FakeEmbedder)
    skill/
      kb-ask/SKILL.md          # the kb-ask skill (frontmatter name/description + instructions)
    package.json               # workspace root for the adapter; scripts: install:pi (symlink into ~/.pi/agent/)
    tsconfig.json
```

### `PiAppRouter` (the pi-facing tRPC type)

The daemon's `AppRouter` (from `@kb/protocol`) includes all groups
(`Read`/`Search`/`Write`/`LocalFs`/`IndexAdmin`). The pi-facing surface
**omits `Write`**. The cleanest way: derive a `PiAppRouter` type that is
`Omit<AppRouter, 'write'>` (or build a pi-shaped router via a
`piBindings`-driven `buildRouter` variant — but `Omit` on the client type
is simpler and sufficient for v1; pi just never calls `client.write.*`).
The extension's tRPC client is typed `createTRPCProxyClient<PiAppRouter>`,
so `client.write` is absent from the type — pi can't call put/delete
through the client. (The daemon still *has* `Write`; pi's client type
just doesn't expose it.) Decide at port time: `type PiAppRouter = Omit<
AppRouter, 'write'>` in `packages/pi-adapter/extension/src/client.ts`,
re-exported from `@kb/protocol` if cleaner.

## Slice 1 — `kb-tools-extension` (the pi extension, mode afk, size m)

### Exports / deliverables

- `packages/pi-adapter/extension/src/index.ts`: the default factory
  `function(pi: ExtensionAPI)` that, on `session_start`, resolves config
  (`KB_URL`, `KB_TOKEN`), builds the tRPC client (`createTRPCProxyClient<
  PiAppRouter>` with `httpBatchLink` to `<KB_URL>/trpc` + `Authorization:
  Bearer <token>`), and registers the KB tools.
- **Tools registered** (each maps a daemon tRPC procedure → a pi tool,
  args via typebox `Type.Object` mirroring the daemon's Zod inputSchema;
  raw strings accepted where `RefInput`/`ActorInput` apply, coerced by the
  daemon at the boundary):
  - `kb_get` → `read.get({ref})` — get a note by ref.
  - `kb_list` → `read.list({type?, tag?, status?, by?})` — list notes
    (returns the entries; the tRPC query returns an array — handle the
    async-iterable shape: the daemon's `list` returns `AsyncIterable`, so
    the tRPC procedure must materialize it to an array; if it doesn't,
    `kb_list` calls a list procedure that returns `ListEntry[]`).
  - `kb_search` → `search.searchUnified({q, opts?})` — unified RRF search.
  - `kb_graph` → `search.graph({ref, dir})` — graph traversal (accepts an
    optional `predicate` via an extra typebox field — the daemon impl
    reads it).
  - `kb_update` → `search.update({ref, content})` — post-write reindex.
  - `kb_check_id` → `search.checkId({ref})` — post-write conformance.
  - `kb_resolve_path` → `localFs.resolvePath({ref})`.
  - `kb_resolve_id` → `localFs.resolveId({ref})`.
  - (Read-only authoring helpers, optional: `kb_frontmatter_for` /
    `kb_stamp_provenance` — these are `Utility` methods, NOT on the
    daemon. Decide: the skill teaches authoring frontmatter by hand
    (model (b): the skill teaches, the library validates via
    `kb_check_id`); skip dedicated tools for them in v1 unless trivial.)
  - **No `kb_put`/`kb_delete`** — pi authors with native `write`/`edit`,
    then `kb_update` to reindex.
- **Binding-subset enforcement**: the tool list is driven by `piBindings`
  (the `@kb/protocol` subset that omits `Write`). A `GroupBindings`-
  enforced loop: `for (const [name, b] of flatten(piBindings))
  pi.registerTool(...)`. Adding a daemon method makes `piBindings` fail
  `tsc` until bound or `EXCLUDED`. (If `piBindings` isn't already exported
  as a flat list, flatten it in the extension; the type is the gate.)
- **Config**: `KB_URL` (default `http://127.0.0.1:3000/trpc` — note: the
  daemon's tRPC is at `/trpc`; the client links to `<KB_URL>/trpc` where
  `KB_URL` is the base, OR `KB_URL` is the full `/trpc` endpoint — pick
  one and document), `KB_TOKEN` (env; via `@kb/daemon`'s `getOrMintToken`
  if reachable, else a keyring read). No committed secrets.
- **Error mapping**: daemon 401 → tool error "KB daemon auth failed (check
  KB_TOKEN)"; network error → "KB daemon not running at <url>"; Zod
  parse error → the daemon's message. Tools return `{content:[{type:text,
  text}], isError}` per the pi tool contract.

### Existing abstractions to use

- `@trpc/client` `createTRPCProxyClient` + `httpBatchLink`.
- `@kb/protocol`'s `AppRouter` type (+ `piBindings` + `flattenBindings`).
- `@kb/core`'s `Ref`/`Actor`/`formatRef`/`parseRef` for arg/citation shapes.
- The pi extension API: `pi.registerTool`, `typebox` `Type.Object` for
  tool params (the pi tool schema format is typebox, NOT Zod — translate
  the Zod inputSchema shapes to typebox by hand for the ~8 tools; the
  `GroupBindings` type-gate is on the *binding record* / call site, not
  the typebox schema, so the typebox schemas are hand-written mirrors).
- `@kb/daemon`'s `getOrMintToken` (re-exported) for the keyring path.

### Do NOT reimplement

- No `@kb/fs` import — pi is a daemon client in V1. No search/index logic
  in the extension (it calls the daemon).
- No `kb_put`/`kb_delete` (governance + the pi-facing subset omits Write).
- No Q&A / RAG in this slice (that's slice 2's skill).
- Do NOT duplicate the Zod input schemas as the source of truth for tool
  args — typebox is the pi tool format; write them by hand and rely on
  the `piBindings` loop + an end-to-end test for sync (a runtime test per
  tool calling the daemon).

### Interface contract (what slice 2 calls)

Slice 2 (the `kb-ask` skill) is a markdown instruction set; it doesn't
import code — it *teaches the agent* to call the tools slice 1 registers
(`kb_search`, `kb_get`, `kb_resolve_id`) in the RAG order with the
citation/refusal rules. So the contract is the **tool names + arg shapes +
return shapes** slice 1 ships: `kb_search({q, withGraph?}) ->
SearchHit[]`, `kb_get({ref}) -> NoteView`, `kb_resolve_id({ref}) -> IdRef`,
etc. The skill's SKILL.md references these tools by name.

### Test plan (slice 1)

- `tests/tools.test.ts`: start a test daemon (ephemeral port, tmp space,
  `FakeEmbedder` via `buildCommonDeps` — reuse `@kb/daemon`'s test
  helpers or replicate), build the tRPC client, register the tools, and:
  - `kb_resolve_id` + native `write` a note + `kb_update` → `kb_get`
    returns it (round-trip).
  - `kb_list` returns the created note.
  - `kb_search` finds the created note (literal + semantic).
  - `kb_graph` on a linked pair returns the edge.
  - error mapping: stop the daemon → `kb_get` returns an `isError` tool
    result with a clear message.
  - Confirm `kb_put`/`kb_delete` are NOT registered (piBindings omits
    Write; the tool list has exactly the 8 tools).
- Use `pi.registerTool`'s `execute` directly (call it with stub args) OR
  a minimal pi harness — check what's testable without a full pi session.
  Prefer unit-style: call the `execute` fn with args, assert the tRPC
  round-trip. (A full pi-session integration test may be hard; the
  end-to-end round-trip via `execute` is the load-bearing test.)

## Slice 2 — `conversational-qa-rag` (the `kb-ask` skill, mode hitl, size l)

### Deliverable

`packages/pi-adapter/skill/kb-ask/SKILL.md` — a markdown instruction set
(frontmatter `name: kb-ask`, `description: <when to use>`) that teaches
the agent to answer a natural-language question from the KB with cited,
verified answers, and to say "I don't know" when there's no evidence.
**No code** — the skill is pure instructions; it calls the tools slice 1
registers.

### Skill content (the RAG rules, from `decide-rag-grounding-and-qa-surface`)

The SKILL.md instructs the agent to, for a user question:

1. **Retrieve**: call `kb_search` with `{ q: <the question>, opts:
   { withGraph: true } }` (unified RRF literal+semantic, k≈8 top hits;
   `withGraph` pulls linked-concept context). `kb_search` is the
   `searchUnified` tRPC procedure.
2. **Lifecycle filter** (document-level, from each hit's frontmatter via
   `kb_get`):
   - **Exclude** `status: deprecated`.
   - **Flag** notes past `stale_after` ("past its freshness date").
   - **Include** `status: draft` / trust `unverified` with a
     `[draft]`/`[unverified]` marker in the answer.
3. **Context budget**: fill ≤ `qa.contextBudgetTokens` (default 4k,
   configurable via `.kb/config`) of top hit chunks — use each hit's
   `title` + `description` + the most-relevant chunks (from per-section
   chunking; `kb_search` returns `snippet` per hit — use that; if more
   is needed, `kb_get` the note and use its body sections). Truncate to
   the budget; don't exceed it.
4. **Answer grounded**: synthesize from the retrieved context ONLY; do
   not use outside knowledge for factual claims about the KB. Mark
   `draft`/`unverified`/`stale` inline where relevant.
5. **Citations**: inline `[Title](formatRef(ref))` markdown links, one
   per supported claim, using `formatRef` (emits `concept:foo` — the OKF
   id, traceable in the SB UI). Every cited id MUST resolve.
6. **Verify-before-emit**: before emitting, for each cited id, call
   `kb_get` (or `kb_resolve_id`) to confirm the note still exists;
   re-verify on emit to catch mid-session deletions. Drop or rephrase
   any unresolvable citation. **No hallucinated links.**
7. **"I don't know"**: if no hit clears the cosine floor (~0.25) OR zero
   hits remain after lifecycle filtering, **refuse** — say "I don't
   know" and name what was tried (the query, the filters). Do not guess.
8. **Stateless** per question (the skill inherits the session context;
   memory is not a separate decision).

### Existing abstractions to use

- The tools slice 1 registers (`kb_search`, `kb_get`, `kb_resolve_id`).
- `formatRef` from `@kb/core` (the citation form) — the skill teaches the
  agent the `type:slug` form (it doesn't import code; it instructs).
- The pi skill format: `SKILL.md` + frontmatter (`name`, `description`),
  discovered from `~/.pi/agent/skills/kb-ask/`.

### Do NOT

- No code in the skill (it's markdown instructions). No `@kb/fs` / daemon
  imports. No new search engine (reuse `kb_search`).
- No self-promotion of `draft`→`stable` (governance: the agent may edit
  anything, but never self-promotes lifecycle; deprecates only with
  explicit consent).
- No rendering inside the SB UI (Fog).

### Test plan (slice 2, mode hitl)

`mode: hitl` — the test is a human-in-the-loop review of answer/citation
quality. The slice doc's test plan: a note containing the answer → cited
answer; no matching note → "I don't know"; a `draft` note → included
with a marker; a deprecated note → excluded; a note deleted between
retrieve and answer → citation dropped on re-verify; long context →
truncated to budget.

For automation (what the tdd-worker can do without a human):
- A **fixture-driven** test that loads the SKILL.md, stubs the `kb_*`
  tools with scripted returns (a note with the answer / no hits / a
  deprecated note / a draft note), and asserts the *skill's instructions*
  are well-formed (the retrieve→filter→budget→cite→verify→refuse steps
  are present and correctly ordered). This is a **content/structure
  test** of the SKILL.md, not an LLM-judgment test.
- The human-in-the-loop review (answer quality, citation correctness on
  a real KB) is the acceptance gate — flag for the user to run `kb-ask`
  against the global KB (which now has the `test-term` probe note) and
  confirm.

## Cross-cutting decisions

- **Daemon-mediated V1**: the extension is a tRPC client, not an
  `@kb/fs` linker. pi consumes the daemon like any other agent.
- **No `Write` for pi**: `PiAppRouter = Omit<AppRouter, 'write'>`; pi
  authors with native `write`/`edit`, then `kb_update` to reindex.
  Governance: agent may edit anything (git is the safety net); never
  self-promotes `draft`→`stable`.
- **typebox tool schemas are hand-written mirrors** of the Zod
  inputSchemas (pi tools use typebox). The `piBindings` loop +
  end-to-end tests keep them in sync; a `tsc` gate on `piBindings`
  catches a missing binding.
- **`kb-ask` is pure instructions** — no code, no new search, reuses
  `kb_search`. The skill is the agent-agnostic RAG contract expressed
  for pi.
- **Config**: `KB_URL` (default `http://127.0.0.1:3000`; tRPC at
  `/trpc`), `KB_TOKEN` (env > keyring). No committed secrets. The
  `.kb/config` `qa.contextBudgetTokens` (default 4k) is read by the
  agent at Q&A time (the skill instructs; if a tool is needed to read
  it, add a `kb_config` tool — optional, likely defer).
- **Install**: a `npm run install:pi` script symlinks
  `packages/pi-adapter/extension` → `~/.pi/agent/extensions/pi-kb` and
  `packages/pi-adapter/skill/kb-ask` → `~/.pi/agent/skills/kb-ask` for
  dev. (A real `pi install` package entry is a later nicety.)
