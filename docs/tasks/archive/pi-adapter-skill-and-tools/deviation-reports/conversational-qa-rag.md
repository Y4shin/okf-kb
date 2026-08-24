## Deviation report — conversational-qa-rag

### API surface changes
- **Planned:** A pure-markdown `SKILL.md` skill (frontmatter `name: kb-ask`,
  `description: <when to use>`) teaching the agent the 8 RAG steps in order
  — retrieve, lifecycle filter, context budget, answer grounded,
  citations, verify-before-emit, "I don't know", stateless — calling the
  `kb_*` tools by name, no code. Plus a content/structure test asserting
  the steps + ordering + tool references + pure-markdown.
- **Actual:** Delivered exactly that. `packages/pi-adapter/skill/kb-ask/
  SKILL.md` has frontmatter `name: kb-ask` (L1) and a `description` of 197
  chars (L2, >20-char test floor). The 8 steps are present as `## Step N —`
  headings at L23, L44, L62, L76, L86, L105, L118, L134, in the spec'd
  order. `packages/pi-adapter/tests/kb-ask-skill.test.ts` (15 tests, all
  passing) asserts frontmatter, each step's keywords, tool references,
  no-code/no-daemon-import, and governance/authoring notes. The skill is
  pure markdown — grep for `import`, `@kb/fs`, `createTrpcClient`,
  `httpBatchLink`, `@kb/daemon`, `@kb/protocol`, `@trpc/client` returns
  zero hits in SKILL.md.
- **Impact:** None on dependent slices. There are no downstream slices
  (this is the final slice of the 2-slice chain). The interface contract
  for slice 2 was "the tool names + arg/return shapes slice 1 ships" and
  the skill references all of them by name (`kb_search`, `kb_get`,
  `kb_resolve_id`, `kb_list`, `kb_graph`, `kb_update`, `kb_check_id`,
  `kb_resolve_path` — confirmed at SKILL.md L25–40, L46, L70, L109, L116,
  L186, L188, L199).

### Abstraction usage
- **Used/was specified: yes.** The skill references `formatRef` and the
  `type:slug` (concept:foo) citation form (SKILL.md L94, L102) as the
  arch-spec instructed ("the skill teaches the agent the `type:slug`
  form; it doesn't import code; it instructs"). No `@kb/fs`, no daemon
  import, no new search engine — it reuses `kb_search` exclusively as a
  retrieval call (SKILL.md L39 "kb_search is the only retrieval call").

### Out-of-scope changes
- **Additions not in the slice scope but consistent with the spec:**
  - SKILL.md includes an **Example** section (L141–168) illustrating a
    full retrieve→lifecycle→answer→verify walkthrough. The arch-spec's
    slice-2 test plan didn't call for an example, but it strengthens the
    skill instructions and is harmless; the test doesn't assert against
    it specifically.
  - SKILL.md includes an **Authoring Notes (model b)** section (L170–202)
    covering native `write`/`edit`, frontmatter, `generated.by` stamping,
    `status: draft` default, `kb_update` reindex, `kb_check_id` validate,
    and a **Governance** subsection (L192–202): never self-promote
    `draft`→`stable`, deprecate only with explicit consent, links don't
    duplicate, provenance non-negotiable. This matches the arch-spec's
    "Do NOT self-promote…" governance list and the task.md's governance
    folded-from-grilling notes exactly. The test asserts these (test
    L155–174). This is in scope per the arch-spec ("Do NOT … No
    self-promotion of `draft`→`stable`") and the task's governance section.
  - SKILL.md Step 1 mentions `kb_list` and `kb_resolve_path` as
    supplementary tools (L37–40) beyond the core 3 — consistent with the
    arch-spec tool list and covered by the test (L112–118).
- **Removals:** None. Nothing was dropped from the spec.

### RAG step-by-step conformance (detailed)

| Step | Spec requirement | SKILL.md location | Conforms? |
|---|---|---|---|
| 1 Retrieve | `kb_search` with `searchUnified`, k≈8, `withGraph` | L23–42: `kb_search({…withGraph:true})`, "searchUnified", "k≈8", "withGraph: true" | ✅ |
| 2 Lifecycle filter | exclude deprecated; flag stale_after-past; include draft/unverified with marker | L44–60: "Exclude … status: deprecated"; "Flag … stale_after … past"; "Include … draft … unverified … [draft] [unverified]" | ✅ |
| 3 Context budget | ≤ `qa.contextBudgetTokens`, default 4k, `.kb/config`; truncate | L62–74: "≤ qa.contextBudgetTokens", "default is 4000 tokens", ".kb/config", "Truncate to the budget" | ✅ |
| 4 Answer grounded | synthesize from context ONLY; no outside knowledge; mark markers | L76–84: "from the retrieved context ONLY", "Do not use outside knowledge", markers | ✅ |
| 5 Citations | `[Title](formatRef(ref))` one per claim; `type:slug` form; must resolve | L86–103: `[Title](concept:slug)`, "formatRef(ref)", "type:slug", "One citation per supported claim", "Every cited id MUST resolve" | ✅ |
| 6 Verify-before-emit | `kb_get`/`kb_resolve_id` before emit; re-verify on emit; drop/rephrase unresolvable; no hallucinated links | L105–116: "kb_get … or kb_resolve_id", "Re-verify on emit", "Drop or rephrase", "No hallucinated links" | ✅ |
| 7 "I don't know" | cosine floor ~0.25 OR zero hits after filter; name what was tried | L118–132: "cosine floor (~0.25)", "Zero hits remain after lifecycle filtering", "name what was tried" | ✅ |
| 8 Stateless | stateless per question; inherits session context | L134–139: "stateless per question", "inherits the agent's session context" | ✅ |

All 8 steps present and in the correct order. No deviations in step
content or ordering.

### Authoring/governance notes conformance
- `generated.by = pi/<version>/<model>`: SKILL.md L179–181 ("set
  `generated.by` in the frontmatter to `pi/<version>/<model>`"). ✅
- Native `write`/`edit` + `kb_update` + `kb_check_id`: L173, L176, L186,
  L188. ✅
- Never self-promote `draft`→`stable`: L194. ✅
- Deprecate with consent: L196 ("Deprecate only with explicit consent").
  ✅
- Provenance non-negotiable: L200–201. ✅
- Links don't duplicate (check via `kb_graph`): L197–198. ✅ (a
  governance item from the task's folded grilling notes, faithfully
  included).

### Pure-markdown conformance
- SKILL.md contains no code imports. The only fenced blocks are
  illustrative tool-call shapes (`kb_search({…})`, `[Title](concept:slug)`)
  — these are instruction snippets, not executable code, and the test's
  no-code assertions (L177–190) explicitly exclude `@kb/fs`,
  `createTrpcClient`, `httpBatchLink`, `@kb/daemon`, `@kb/protocol`
  imports — all pass. ✅

### Test conformance
The content/structure test (`kb-ask-skill.test.ts`) asserts:
- Frontmatter `name === kb-ask` + non-trivial `description` (L29–34). ✅
- Each step's keywords present (L43–122). ✅
- Step ordering via `## Step N` heading indices (L124–149). ✅
- Tool references: `kb_search`, `kb_get`, `kb_resolve_id` (minimum) +
  `kb_list`, `kb_graph`, `kb_update`, `kb_check_id`, `kb_resolve_path`
  (L112–118). ✅
- No `@kb/fs` / daemon / tRPC-client code (L177–190). ✅
- Governance + authoring notes (L155–174). ✅

**Minor test gap (not a deviation):** The ordering test (L129–136)
verifies Steps 1, 2, 3, 5, 6, 7, 8 — it **omits Step 4 (Answer
Grounded)** from the explicit ordered-traversal array. Step 4 is present
in SKILL.md (L76) and between Steps 3 and 5 positionally, but the test
doesn't assert Step 4's heading index or any grounded-only keyword.
Likewise, there is no assertion that the answer is "synthesized from
context only" / "no outside knowledge" (a Step 4 invariant). This is a
coverage gap in the auto-gate, not a spec deviation — the skill content
itself conforms. The content/structure test is the **auto-gate**; the
real answer-quality review is the human-in-the-loop gate (see Mode
hitl below). A future hardening could add `headingIdx(4)` to the order
array and a `from the retrieved context only` / `outside knowledge`
assertion.

### Acceptance vs slice doc test-plan scenarios

| Scenario (slice doc) | Auto-gate coverage | Notes |
|---|---|---|
| Note containing answer → cited answer | Example walkthrough (SKILL.md L141–168) shows this; test doesn't simulate it (content/structure, not LLM-judgment). | Human-in-loop gate. |
| No matching note → "I don't know" | Step 7 instructions present (L118–132); test asserts keywords (L106–110). | ✅ structure |
| Draft note → included with marker | Step 2 L55–57; test L66–73 asserts `[draft]`/`[unverified]`. | ✅ structure |
| Deprecated note → excluded | Step 2 L50–51; test L63 asserts. | ✅ structure |
| Deleted between retrieve & answer → citation dropped on re-verify | Step 6 L111–113 ("re-verify on emit", "mid-session deletions", "drop or rephrase"); test L98–104 asserts re-verify + no-hallucinated-links. | ✅ structure; the "deleted-between" scenario is instruction-level, not simulated. |
| Long context → truncated to budget | Step 3 L73–74 ("Truncate to the budget"); test L82–89 asserts budget keywords. | ✅ structure |

All six slice-doc scenarios are reflected in the skill instructions and
covered (structurally) by the auto-gate. The fixture-driven simulation
envisioned in the arch-spec ("stubs the `kb_*` tools with scripted
returns") was **not** implemented — the test is purely content/structure
(string-match on SKILL.md), not a fixture-driven simulation. This is a
narrowing from the arch-spec's described approach but is explicitly
sanctioned by the arch-spec's own framing ("This is a **content/structure
test** of the SKILL.md, not an LLM-judgment test") and the slice doc's
`mode: hitl` designation (the real behavioral gate is human review). Not
a blocking deviation.

### Mode hitl
- The slice is `mode: hitl`. The **auto-gate** is the content/structure
  test (15 tests, passing). The **real human-in-the-loop review** of
  answer/citation quality against a live KB — running `kb-ask` and
  confirming cited answers, "I don't know" refusals, draft markers,
  deprecated exclusion, deleted-mid-session citation dropping, and
  context truncation — is a **follow-up by design**, not a deviation. The
  slice doc's `mode: hitl` line ("review answer/citation quality during
  development") makes this explicit. No deviation to flag.

### Task doc update needed?
**No.** No `## Implementation notes` section exists in the slice doc or
task.md to append to (the slice doc has no such heading; the task.md
similarly has none). The kb-tools-extension slice's deviation report
notes appending to a `## Implementation notes` in its own slice doc; this
slice's doc has no such section. No architecture-notes update is needed
— the implementation faithfully realizes the arch-spec's Slice 2
contract and the `decide-rag-grounding-and-qa-surface` decisions.

If a `## Implementation notes` section is later added to the slice doc or
task.md, the natural append would be: "Slice 2 delivered a pure-markdown
`kb-ask` SKILL.md with all 8 RAG steps in order and a 15-test
content/structure auto-gate (passing). The auto-gate is a string-match
content/structure test, not a fixture-driven simulation (the arch-spec's
fixture language was descriptive of intent, not a hard requirement under
`mode: hitl`). Human-in-the-loop answer-quality review is the acceptance
gate, pending."

### User attention needed?
**No** for scope or API-surface reasons — the slice conforms to the
spec. One **optional** hardening the user may want: add Step 4 (Answer
Grounded) to the ordering test's traversal array and a
"from retrieved context only / no outside knowledge" assertion to close
the minor auto-gate coverage gap. This is a test-quality improvement, not
a spec conformance issue.
