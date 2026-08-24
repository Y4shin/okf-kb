## Deviation report — session-distill-workflow & topic-research-workflow

Combined report covering slices `session-distill-workflow` (Slice 2) and
`topic-research-workflow` (Slice 3) of task `second-brain-curation`.

Branch: `task/second-brain-curation`. Reviewed commits:
`1426d81` (kb-save-session), `b45396b` + `73e8dbc` (kb-research + install-pi).
Baseline: `88f43bc` (kb-curate, end of Slice 1).

Verification: `vitest run packages/pi-adapter/tests/kb-save-session-skill.test.ts
packages/pi-adapter/tests/kb-research-skill.test.ts` → **44 passed (2 files)**;
no staged files (`git status` clean except `state.yaml` and this report dir).

---

## Slice 2 — session-distill-workflow

### API surface changes
- **Planned:** A "save this session to the KB" workflow — either a section
  in `kb-curate/SKILL.md` or a sibling `kb-save-session/SKILL.md`. Arch spec
  recommended sibling skills for distinct `/skill:` entry points. The
  workflow has 4 logical steps (extract → type-select+kb_search+author+link
  → kb_update/kb_check_id → re-distill).
- **Actual:** Built as a sibling skill `packages/pi-adapter/skill/kb-save-session/SKILL.md`
  (frontmatter `name: kb-save-session`, `description` at lines 2–3). The 4
  logical steps were **expanded to 8 numbered `## Step N` headings**
  (SKILL.md lines 32, 58, 73, 95, 120, 138, 158, 176): (1) Extract,
  (2) Type-Select, (3) kb_search, (4) Author, (5) Link Relations,
  (6) kb_update, (7) kb_check_id, (8) Re-Distill. This matches the arch
  spec's *test plan* (which enumerates the 6-step sequence
  `extract → type-select → kb_search → author → kb_update → kb_check_id`
  and adds link-don't-duplicate on re-distill) more than the 4-step *skill
  content* prose. No functional deviation — the same workflow is taught,
  just decomposed more granularly.
- **Impact:** None on dependent slices. The workflow is a pure-markdown
  instruction set; the step count is internal structure. The test asserts
  all 8 headings present and ordered.

### Step-by-step conformance (SKILL.md line refs)

| Spec step (Slice 2 skill content) | Present? | Location |
|---|---|---|
| Extract, not verbatim / summarize then distill | ✅ | Step 1, lines 32–54; "not a verbatim dump" line 38; "Summarize, then distill" line 41 |
| Nothing durable → say so and stop | ✅ | Step 1, lines 44–46 |
| Type-select (references kb-curate) | ✅ | Step 2, lines 58–69; "See kb-curate for type selection" line 63 |
| kb_search link if near-match | ✅ | Step 3, lines 73–91; `kb_search({…})` line 76 |
| Author: native write | ✅ | Step 4, line 96 ("native `write`/`edit`") |
| sources → session transcript/log | ✅ | Step 4, lines 108–110 |
| generated.by = pi/<version>/<model> | ✅ | Step 4, line 105 |
| status: draft | ✅ | Step 4, line 111 |
| Link relations (typed + prose markdown) | ✅ | Step 5, lines 120–134 |
| kb_update reindex | ✅ | Step 6, line 138 |
| daemon auto-maintains index.md + log/ + log.md | ✅ | Step 6, lines 145–148 |
| kb_check_id | ✅ | Step 7, line 158 |
| Re-distill → link, don't duplicate | ✅ | Step 8, lines 176–190 |

### Abstraction usage
- Used/was specified: **yes.** References `kb_search`, `kb_update`,
  `kb_check_id` (the `kb_*` tools from `pi-adapter-skill-and-tools`) and
  pi's native `write`/`edit` (model b). No `kb_put`/`kb_delete` (test
  explicitly asserts absence — `kb-save-session-skill.test.ts` lines
  230–234). References `kb-curate` for shared rules (type selection,
  provenance, lifecycle, frontmatter shape, link-don't-duplicate,
  edit-anything+git) — SKILL.md lines 19–25; test lines 150–165 assert
  deferral and that the phrase "gauge type" is *not* repeated inline.

### Out-of-scope changes
- **Added a worked example** (SKILL.md lines 194–242): a DB-driver-decision
  distillation producing `decision:use-better-sqlite3` with `decided_in`
  relation + prose link. The arch spec's Slice 2 test plan does not
  require an example, but the Slice 1 `kb-curate` skill had one and the
  pattern is consistent. Test asserts the example's content (lines
  240–289). **Not a deviation** — additive, within the skill's scope.
- No new infrastructure, no `@kb/fs`/daemon code. Test asserts
  no `@kb/fs` and no tRPC/daemon imports (lines 200–227). Confirmed.

### Task doc update needed?
- **No** for Slice 2. The slice doc `02-session-distill-workflow.md` was
  not modified (status remains `todo`; implementation notes were only
  appended to Slice 1's doc). A follow-up to mark Slice 2 done + append
  implementation notes is routine finalize work, not a deviation-report
  finding.

### User attention needed?
- **No.** The 4-step→8-heading decomposition is a presentation choice
  consistent with the arch spec's test plan; no scope or API change.

---

## Slice 3 — topic-research-workflow

### API surface changes
- **Planned:** A "research X into the KB" workflow — section in
  `kb-curate/SKILL.md` or sibling `kb-research/SKILL.md`. Arch spec skill
  content lists 5 logical steps (research → synthesize+attribute →
  provenance → cross-link → kb_update/kb_check_id) plus edge-case rules.
- **Actual:** Built as a sibling skill `packages/pi-adapter/skill/kb-research/SKILL.md`
  (frontmatter `name: kb-research`, lines 2–3). The 5 logical steps were
  **expanded to 6 numbered `## Step N` headings** (SKILL.md lines 28, 57,
  79, 118, 134, 156): (1) Research, (2) Synthesize, (3) Attribute,
  (4) Provenance, (5) Cross-Link, (6) Reindex & Validate. The arch spec's
  *test plan* enumerates the sequence as
  `research → synthesize → attribute → cross-link → kb_update → kb_check_id`
  (6 markers) — the implementation splits `provenance` out as its own
  Step 4 and merges `kb_update`+`kb_check_id` into Step 6. The test
  (`kb-research-skill.test.ts` lines 30–39) asserts 6 headings:
  research(1) → synthesize(2) → attribute(3) → provenance(4) →
  cross-link(5) → reindex-validate(6). This is a **minor test-vs-spec
  ordering divergence**: the arch spec's test-plan sequence puts
  `cross-link` at position 4 (after attribute) and has no separate
  `provenance` heading; the implementation + test add `provenance` as
  Step 4 and push `cross-link` to Step 5. The *skill content* prose in
  the arch spec (lines 3–4 of the Slice 3 section) *does* list
  `generated.by`/`status: draft`/`unverified` as step 3 before
  cross-link as step 4, so the implementation's ordering is actually
  **more faithful to the skill-content prose** than the test-plan's
  compressed sequence. No functional deviation.
- **Impact:** None on dependent slices. Pure-markdown instruction set;
  step decomposition is internal.

### Step-by-step conformance (SKILL.md line refs)

| Spec requirement (Slice 3) | Present? | Location |
|---|---|---|
| Research: web_search/fetch_content (web) + read/grep (repo) | ✅ | Step 1, lines 30–33 |
| Credibility signals: URL/title/author/last_modified | ✅ | Step 1, lines 35–42 |
| No sources found → don't fabricate | ✅ | Step 1, lines 44–45 |
| Topic too broad → narrow with user | ✅ | Step 1, lines 47–49 |
| Synthesize: reference/concept/term types | ✅ | Step 2, lines 60–63 |
| A reference note per key source | ✅ | Step 2, line 61 |
| Attribute: sources with URL + title/author/last_modified | ✅ | Step 3, lines 84–90 |
| Unsupported claims → marked or omitted | ✅ | Step 3, line 99 |
| Conflicting sources → separate entries, noted in body | ✅ | Step 3, lines 101–103 |
| Paywalled/inaccessible → note it | ✅ | Step 3, lines 105–107 |
| Provenance: generated.by, draft, unverified | ✅ | Step 4, lines 122–126 |
| Never self-promote | ✅ | Step 4, line 127 |
| References kb-curate | ✅ | Step 4, line 120; Step 2 line 60; Step 5 line 137 |
| Cross-link: kb_search before create | ✅ | Step 5, line 137 |
| Link-don't-duplicate; near-match → link | ✅ | Step 5, lines 139–140 |
| Wrong human note → correcting linked note preferred | ✅ | Step 5, lines 143–145 |
| kb_update reindex | ✅ | Step 6, line 159 |
| Daemon auto-maintains index.md + log/ + log.md | ✅ | Step 6, lines 160–161 |
| kb_check_id validate | ✅ | Step 6, line 162 |

### Abstraction usage
- Used/was specified: **yes.** References `kb_search`, `kb_update`,
  `kb_check_id` + `web_search`/`fetch_content` (web) + native
  `read`/`grep` (repo) + native `write`/`edit` (authoring). No
  `kb_put`/`kb_delete` (test asserts absence — `kb-research-skill.test.ts`
  lines 250–254). References `kb-curate` for shared rules (type selection,
  provenance, lifecycle, frontmatter, link-don't-duplicate, governance) —
  SKILL.md lines 21–25; test lines 216–228 assert deferral.

### Out-of-scope changes
- **Added a worked example** (SKILL.md lines 172–248): researching
  "sqlite-vec vs sqlite-fts5 for vector search" producing
  `reference:sqlite-vec` + `concept:vector-search-in-kb` notes with full
  frontmatter, cross-links, and sources. Test asserts example content
  (lines 256–287). Same pattern as Slice 1/2 — additive, consistent,
  not a deviation.
- No new infrastructure, no `@kb/fs`/daemon code. Test asserts no
  `@kb/fs` and no tRPC/daemon imports (lines 230–248). Confirmed.

### Task doc update needed?
- **No** for Slice 3. The slice doc `03-topic-research-workflow.md` was
  not modified (status remains `todo`). Routine finalize work.

### User attention needed?
- **No.** The step decomposition (adding `provenance` as its own heading)
  is a presentation choice more faithful to the arch spec's skill-content
  prose than its test-plan compressed sequence; no scope or API change.

---

## install:pi script

- **Planned:** The arch spec's Placement section says the
  `install:pi` script "already symlinks `packages/pi-adapter/skill/*`"
  and to "confirm it picks up `kb-curate`." Slice 1's implementation notes
  say it was updated to an array `['kb-ask', 'kb-curate']`.
- **Actual:** `install-pi.mjs` (diff `88f43bc..HEAD`) was changed from a
  hard-coded array `['kb-ask', 'kb-curate']` to a **glob**: it now reads
  all subdirectories of `packages/pi-adapter/skill/` via `readdir` and
  symlinks each one (lines 17–21). This means `kb-save-session` and
  `kb-research` are picked up **automatically without editing the list** —
  strictly better than the spec asked. The comment was updated to match
  (lines 14–16).
- **Impact:** Positive — future skills are auto-discovered. No deviation
  in the negative direction.

---

## Cross-cutting findings

### Architecture notes updates
- The arch spec's "Skill split vs. one skill" recommendation (lines
  197–207) said to decide at port time between one skill with sections or
  sibling skills, recommending sibling skills. **Both Slice 2 and Slice 3
  chose sibling skills** (`kb-save-session`, `kb-research`), matching the
  recommendation. No architecture-notes update needed — the decision was
  made as advised.
- No new abstractions were introduced; both skills defer to `kb-curate`
  for shared rules as specified.

### Test robustness note
- Both tests use `## Step N ` heading matching as the canonical ordering
  marker (save-session test lines 50–51; research test lines 33–34). This
  is robust to prose reordering but **fragile to heading rewording** — if
  a future edit changes "## Step 1 — Extract" to "## Step 1: Extract", the
  `indexOf('## step 1 ')` / `indexOf('## Step 1 ')` check would break.
  Minor, not a deviation.

### Summary
Both slices are **fully conformant** to the arch spec. The only notable
difference is presentation: both expanded the spec's compressed logical
steps into more granular numbered headings (4→8 for Slice 2, 5→6 for
Slice 3), which aligns with the arch spec's *test-plan* enumerations
rather than its *skill-content* prose. No API surface change, no
abstraction misuse, no out-of-scope infrastructure, no `kb_put`/`kb_delete`,
no `@kb/fs`/daemon code. Both auto-gate tests pass (44/44). The `install:pi`
glob improvement auto-discovers both new skills.
