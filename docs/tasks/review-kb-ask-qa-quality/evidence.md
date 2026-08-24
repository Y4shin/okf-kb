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
  broken (the hitl contract: "I don't know" + name what was tried) and again
  when the only hit was a deprecated note. Did not hallucinate or answer
  from outside knowledge.
- **Config/transport: was BROKEN, now FIXED** — the three defects above
  are resolved; the daemon+CLI+extension now agree on port 30700 by default
  and a shared `KB_TOKEN` env wins over per-user keyrings.
- **Search relevance: PASS** — the obvious match is the top hit once the
  embeddings are warm.
- **Skill tightened during review**: Step 2 (lifecycle filter) now says
  deprecated notes are **DROPPED** (not cited, paraphrased, or flagged
  inline); the first Q2 run had the agent flag+cite a deprecated note, the
  post-fix Q2 run correctly dropped it and refused. Step 7 restates that a
  deprecated note is not evidence.

## Questions asked (non-interactive `pi -p`, daemon on 30700, shared token)

1. **`how does silverbullet pick up filesystem writes?`** (draft note) →
   PASS. Grounded in `concept:silverbullet`; cited `[Silverbullet
   filesystem-write pickup](concept:silverbullet)`; marked `[draft]` inline
   (the note is `status: draft`). Facts match the note (notify crate,
   `/.events` SSE, `SB_FS_WATCH=auto/off/poll`, ~20s fallback).
2. **`what is the old vector store approach used by the KB?`** (deprecated
   note) → PASS (after the Step 2 fix). The agent **dropped** the
   `status: deprecated` `concept:old-approach` note and refused with "I
   don't know", naming the query + the deprecated status + the empty graph
   neighbors + the absence of a non-deprecated `decision` note. (Pre-fix
   it had flagged+cited the deprecated note — the fix was needed.)
3. **`what is the capital of France?`** (no match) → PASS. "I don't know";
   named the query, the top hits, the ~0.03 scores below the ~0.25 floor;
   explicitly refused outside knowledge ("Paris is the capital of France
   is outside knowledge I'm permitted to use here").
4. **`what does the OKF manifest drive in the knowledge base?`** (stable
   note) → PASS. Grounded in `concept:okf-format`; cited `[OKF v0.2 manifest
   as the data-driven spine](concept:okf-format)`; **no draft marker**
   (stable, correct); stated "The citation resolves" (verify-before-emit
   fired). Facts match (types/predicates/conventions/integrity checks;
   A1–A7, B1–B5, B7, B8).
5. **`give me everything in the KB about reciprocal rank fusion`** (context
   budget) → PASS. Grounded in `term:rrf` (formula `1/(k+rank)`, `k≈60`,
   damping, `searchUnified`, FTS5 + embedding cosine); cited; pulled
   `concept:okf-format` as related context; **explicitly excluded** the
   deprecated `concept:old-approach` ("intentionally excluded here — it
   is not evidence"). No budget overflow (notes are short).

## Remaining minor gap (not blocking)

`searchUnified` returns hits with **empty `snippet`** fields; the `kb-ask`
   context-budget step `kb_get`s the full note body (works, but coarser than
   using snippets). A future nicety: populate snippets from the matched
   chunks.

## Outcome

The `kb-ask` skill passes the human review. The transport defects found
in the first session are fixed; the one skill-adherence gap (deprecated
notes) is fixed and re-verified. The `conversational-qa-rag` slice's hitl
gate is satisfied. Mark `review-kb-ask-qa-quality` done.
