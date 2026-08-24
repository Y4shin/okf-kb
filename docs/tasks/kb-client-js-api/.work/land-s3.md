# Land report — slice `daemon-trpc-and-mcp`

## Summary

Landed the `daemon-trpc-and-mcp` slice for task `kb-client-js-api`.

**No merge was needed** — per the task brief, the tdd-worker worked directly
on `task/kb-client-js-api` (HEAD = 1d732cb). There was no separate
`slice/daemon-trpc-and-mcp` branch. The work was already on the task branch
and all green (tsc --build exit 0, vitest 80 pass + 1 skipped).

## Actions taken

1. **Confirmed git state**: on `task/kb-client-js-api`, HEAD = 1d732cb.
2. **Set `status: done`** in the slice doc frontmatter
   (`docs/tasks/kb-client-js-api/slices/03-daemon-trpc-and-mcp.md`),
   keeping the file in place (no archiving — no slice branch, per task brief).
3. **Appended `## Implementation notes`** to the slice doc, summarizing:
   - **`@kb/protocol`**: `fullBindings` + `piBindings` (binding records with
     `GroupBindings<G>` exhaustiveness), `buildRouter(kb)` (loops binding
     records into a nested tRPC router — no per-method handlers), `type
     AppRouter = ReturnType<typeof buildRouter>` (CLI shares the type).
   - **`@kb/daemon`**: `startDaemon` + `getOrMintToken` + `buildCommonDeps`;
     `/trpc` (tRPC) + `/mcp` (MCP) on separate paths; Bearer auth on both
     via keyring + `KB_TOKEN` env + mint-on-first-run; 127.0.0.1 only; 80
     tests pass + 1 skipped.
   - **4 deviations**:
     - (a) `@kb/protocol` depends on `@trpc/server` + `zod` (not only
       `@kb/core` — `buildRouter` is runtime, needs `initTRPC`; graph stays
       acyclic; spec's "protocol → core only" was unsatisfiable).
     - (b) `mcpServerFromBindings` is internal (not re-exported from daemon
       index).
     - (c) MCP passes raw Zod schemas to `registerTool` (SDK converts to
       JSON Schema internally) rather than explicit `z.toJSONSchema`.
     - (d) No-arg method records use `z.undefined()` (core's `z.void()`
       no-arg schemas can't satisfy `GroupBindings` since `void ≠ undefined`
       for `MethodBinding`).
4. **Updated task doc** (`docs/tasks/kb-client-js-api/task.md`): added a
   `## Implementation notes` section with the `@kb/protocol` deps
   correction (so slice 04 / future readers see it) and the `z.undefined()`
   note.
5. **Updated `docs/tasks/state.yaml`**: slice pointer → `cli-client`
   (slice 03 is done; slice 04 remains).
6. **Committed**: `cbef880 docs: mark slice daemon-trpc-and-mcp done +
   implementation notes` (3 files changed, 105 insertions, 2 deletions).

## Final state

- **HEAD sha**: `cbef8801eb13c13c900dc68be3cff94471f64d90`
- **Git log (top 3)**:
  - `cbef880 docs: mark slice daemon-trpc-and-mcp done + implementation notes`
  - `1d732cb fix(daemon): trpc createContext type (node:http signal mismatch); drop dead no-arg schema imports in records`
  - `78a1648 chore: add @trpc/server, @modelcontextprotocol/sdk, @napi-rs/keyring, env-paths, @trpc/client deps`
- **Working tree**: clean (no staged or unstaged files).

## Review findings

- **No blockers.** Only docs were modified (slice doc + task doc +
  state.yaml). No source code, tests, or config files were touched.
- Verified all 4 deviations against the actual source code:
  - `packages/protocol/package.json` deps include `@trpc/server` + `zod` ✓
  - `packages/protocol/src/router.ts` imports `initTRPC` from `@trpc/server` ✓
  - `packages/daemon/src/index.ts` does NOT re-export `mcpServerFromBindings` ✓
  - `packages/daemon/src/mcp.ts` passes `fb.inputSchema` (raw Zod) to
    `server.registerTool` without calling `z.toJSONSchema` ✓
  - `packages/protocol/src/records.ts` uses `z.undefined()` for `spaceRoot`,
    `buildIndex`, `rebuildIndexes`, `check` ✓
- `npx tsc --build` → exit 0 ✓
- `npx vitest run` → 80 passed, 1 skipped ✓

## Residual risks

- **`@kb/protocol` is not a pure-types package**: it owns the router
  factory (runtime) + binding records (runtime). Future slices that need a
  pure type-only dependency on the router shape should import `type
  AppRouter` only (the CLI does this). If a consumer accidentally imports
  `buildRouter` at runtime, it pulls in `@trpc/server`.
- **MCP stateless mode**: each `/mcp` POST creates a fresh `McpServer` +
  `StreamableHTTPServerTransport`. This is simple and correct for v1 but
  means no session reuse; if MCP clients expect stateful sessions (e.g.
  for SSE streaming), a stateful mode would be needed.
- **Builder not used at runtime**: the daemon constructs `Fs*` classes
  directly rather than calling `createKb(deps).declare()…build()`. The
  builder's `make*` stubs throw; its purpose is compile-time type gating
  only. If a future slice wants to use the builder's output at runtime, the
  builder would need to accept injected implementations.
- **Slice 04 (cli-client) remains**: the task is not done; state.yaml now
  points to `cli-client` as the next slice.
