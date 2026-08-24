# review-kb-ask-qa-quality — evidence

> Human review of the `kb-ask` skill, run via a pi session
> (`01a034cf-7473-754c-8121-fb73e0d71988`). The session diagnosed the
> failures; this records the verdict + the fixes applied.

## What was asked

`/skill:kb-ask how does silverbullet pick up filesystem writes?`

## What happened (the session's own diagnosis)

Every `kb_*` tool call failed:
- `kb_search({q, opts:{withGraph:true}})` → `Unexpected token '<', "<!doctype "... is not valid JSON`
- `kb_list({type:"concept"})` → same

The agent **correctly refused** per the skill's rules: "I don't know — the KB is currently unreachable", naming what it tried (the query + the transport failure). **The `kb-ask` skill behaved exactly as designed** — it did not hallucinate, did not answer from general knowledge, and refused with a clear reason. ✅

## Root causes (two real config defects, now fixed)

1. **Default port collision**: the pi extension defaulted `KB_URL` to
   `http://127.0.0.1:3000`, which is **Silverbullet's web UI** port (the
   Docker fixture). So the tools hit SB, got HTML, and JSON-parse failed.
   The CLI already defaulted to `30700`; the extension + daemon did not.
2. **Auth token mismatch across the Docker/user boundary**:
   `getOrMintToken()` was keyring-first. A daemon in Docker (root) and pi
   (the user) don't share a keyring → each mints a *different* token →
   guaranteed 401 even after the port fix. The env-fallback only kicked
   in when the keyring was *empty*, not when it held a *different* token.
3. **(Found while fixing)** The CLI's `kb daemon` hardcoded `port=0`
   (ephemeral) and passed it to `startDaemon`, overriding the daemon's
   default → `kb daemon` with no `--port` bound a random port the client
   couldn't know.

## Fixes applied (commit `279a6e3` + the CLI port fix)

- **`packages/pi-adapter/extension/src/config.ts`**: default `KB_URL` →
  `http://127.0.0.1:30700` (matches the CLI; no SB collision).
- **`packages/daemon/src/auth.ts`**: `getOrMintToken` now prefers `KB_TOKEN`
  **env over keyring** (so a shared env token agrees across user/container
  boundaries; keyring is the fallback). `auth.test.ts` updated for the new
  precedence (env wins; keyring is the fallback when env unset).
- **`packages/daemon/src/server.ts`**: default port → `KB_PORT` env or
  `30700` (was ephemeral `0`).
- **`packages/cli/src/main.ts`**: `runDaemon` only passes `port` to
  `startDaemon` when `--port` is given, so the daemon's default applies.
- 116 tests + `tsc --strict` clean.

## Re-verification after fixes

With **no `KB_URL` set** (defaults), a shared `KB_TOKEN` env, and the global
KB at `$KB_HOME`:
- `kb daemon` (no `--port`) → listens on `http://127.0.0.1:30700`.
- `kb read.list --type concept` → returns the 3 seeded probe notes
  (`concept:silverbullet`, `concept:okf-format`, `concept:old-approach`).
- `kb search.search-unified "how does silverbullet pick up filesystem writes"`
  → **top hit is `concept:silverbullet`** (literal, score 0.0328), then
  `old-approach` and `okf-format` (semantic). Relevance is correct.

## Verdict

- **`kb-ask` skill behavior: PASS** — refused correctly when retrieval was
  broken (the hitl contract: "I don't know" + name what was tried). Did not
  hallucinate or answer from general knowledge.
- **Config/transport: was BROKEN, now FIXED** — the three defects above
  are resolved; the daemon+CLI+extension now agree on port 30700 by default
  and a shared `KB_TOKEN` env wins over per-user keyrings.
- **Search relevance: PASS** — the obvious match is the top hit once the
  embeddings are warm.
- **Remaining minor gap (not blocking)**: `searchUnified` returns hits with
  **empty `snippet`** fields; the `kb-ask` skill's context-budget step will
  `kb_get` the full note body (works, but coarser than using snippets). A
  future nicety: populate snippets from the matched chunks.

## Follow-up

The human review of **answer/citation quality on a successful retrieval**
(lifecycle filter on deprecated/stale, citation form `[Title](concept:slug)`,
verify-before-emit, context-budget truncation) should be re-run now that the
transport works — start a pi session with `KB_TOKEN=review-test-token` (and
optionally `KB_URL=http://127.0.0.1:30700`, though it's the default now) and
re-ask the questions. This evidence covers the transport + the skill's
refusal behavior; the successful-path quality is the remaining check.
