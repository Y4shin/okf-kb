## Deviation report — curation-skill

### API surface changes

- **Planned:** The arch-spec defined no code API — slice 1 is a pure-markdown
  SKILL.md instruction set with frontmatter `name: kb-curate` and a
  `description`, plus a content/structure auto-gate test. No executable
  surface was specified.
- **Actual:** No API surface was added. The deliverable is exactly as
  planned: `packages/pi-adapter/skill/kb-curate/SKILL.md` (249 lines, pure
  markdown) + `packages/pi-adapter/tests/kb-curate-skill.test.ts` (239
  lines, 17 tests) + `install-pi.mjs` updated to symlink `kb-curate`.
- **Impact:** None — dependent slices (2: session-distill-workflow, 3:
  topic-research-workflow) consume the *rules* documented in this skill.
  The skill text (Rule 2 type selection, Rule 5 authoring flow, Rule 6
  link-don't-duplicate) is the contract they build on, and it matches the
  spec verbatim.

### Abstraction usage
- Used/was specified: yes. The skill instructs the agent to call the `kb_*`
  tools (`kb_search`, `kb_update`, `kb_check_id`) by name and to use pi's
  native `write`/`edit` — exactly as the arch-spec's "Existing abstractions
  to use" section prescribes. No `@kb/fs` or daemon imports (asserted by
  test). No `kb_put`/`kb_delete` references (asserted by test; the skill
  explicitly states "no separate put/delete tools" at lines 105, 116, 242).

### SKILL.md frontmatter
- **Planned:** `name: kb-curate`, `description: <when to use>`.
- **Actual:** `name: kb-curate` (line 2), `description:` is a full sentence
  describing triggers + the "save this to the KB" / durable-knowledge
  condition (line 3). Matches. The test asserts `name === 'kb-curate'` and
  `description.length > 20`.

### The 8 rule-areas — all present and ordered

The test asserts all 8 rules appear as `## Rule N` headings in order
(1→8), and each rule's content matches the spec:

| # | Rule | Spec requirement | SKILL.md location | Status |
|---|------|-------------------|-------------------|--------|
| 1 | Triggers | user says save/research/add; durable reusable claim; NOT ephemeral/one-off | Lines 22–37 | ✅ Matches (incl. "do NOT curate ephemeral / one-off work", line 31) |
| 2 | Type selection | 5 types incl `generic` as gauge; non-empty generic → signal to add type | Lines 39–57 | ✅ All 5 named (term L43, concept L44, decision L46, reference L48, generic L50); "gauge type" L50; "signal to add a type" L51–53 |
| 3 | Provenance | `generated.by = pi/<version>/<model>`; `sources` with author/last_modified; conflicts as separate entries | Lines 60–78 | ✅ `generated.by = pi/<version>/<model>` L64; sources shape with resource/title/author/last_modified L66–68; conflicts→separate entries L72–74 |
| 4 | Lifecycle | draft/unverified; never self-promote; deprecate with consent; humans deprecate freely | Lines 81–98 | ✅ `status: draft` L85, `unverified` L86; "never self-promote" L88; "deprecate only with explicit consent" + `ctx.ui.confirm` L93–97; "humans can deprecate freely" L97 |
| 5 | Authoring model | native write/edit + kb_update + kb_check_id; no kb_put/kb_delete | Lines 101–117 | ✅ native write/edit L102; `kb_update({ref, content})` L110; `kb_check_id({ref})` L112; "no separate put/delete tools" L105, L116 |
| 6 | Link-don't-duplicate | kb_search before create; near-match→link; wrong human note→correcting linked note preferred, may edit (git backstop) | Lines 121–141 | ✅ "kb_search before creating" L123; near-match→link L130; wrong human note→correcting linked decision/concept L133–137; "may edit (git is the backstop)" L135; "linking is the taught default" L136 |
| 7 | Frontmatter shape | id: type:slug, type, title, description, tags?, relations? (+prose link), generated, sources?, status: draft, stale_after? | Lines 144–163 | ✅ All 10 fields enumerated; `id: type:slug` L148; `relations?` + "prose markdown link per relation" L156; `status: draft` L161; `stale_after?` L162 |
| 8 | Edit-anything + git | may edit any note; git is undo; append provenance on edit, don't erase original; edit=content not lifecycle | Lines 167–181 | ✅ "may edit any note" L169; "git is the undo" L169; "append your provenance — don't erase" L174; "about content, not lifecycle state" L178–180 |

**All 8 rule-areas are present, correctly ordered, and match the arch-spec
content.** No deviations.

### Pure markdown (no code, no daemon imports)
- **Spec:** "No code in the skill (pure markdown). No `@kb/fs`/daemon imports."
- **Actual:** ✅ The skill contains no TypeScript/JavaScript code, no `import`
  statements, no `@kb/fs`, no `@kb/daemon`, no tRPC client creation. The only
  fenced code blocks are a `kb_search` call example (YAML-ish, L126–128) and
  the example note's YAML frontmatter (L197–211) — both are illustrative
  markdown, not executable code. The test asserts this explicitly (4 tests
  under "pure markdown — no code / no daemon imports").

### Content/structure test
- **Spec:** Asserts frontmatter, the 8 rule-areas present+ordered, kb_* tool
  references (kb_search, kb_update, kb_check_id minimum), pure-markdown
  (no @kb/fs/daemon), no kb_put/kb_delete. Optional: fixture-driven
  link-not-duplicate test.
- **Actual:** ✅ 17 tests across 6 describe blocks:
  - `frontmatter` (1 test): name + description.
  - `8 rule-areas present and ordered` (9 tests): one per rule + an
    order-check test asserting `## Rule 1`→`## Rule 8` heading indices are
    ascending.
  - `tool references` (1 test): kb_search, kb_update, kb_check_id.
  - `no kb_put / kb_delete` (1 test): `not.toMatch(/kb_put|kb_delete/)`.
  - `pure markdown` (3 tests): no @kb/fs, no daemon/tRPC imports, instructs
    tool-by-name.
  - `example note` (2 tests): example distills a decision-making session;
    includes a `decided_in` relation + prose link.
- **Optional fixture-driven test:** Not implemented. The arch-spec marked it
  "(Optional, if feasible)". This is an acceptable omission — the
  link-don't-duplicate rule is asserted via content matching in the Rule 6
  test. No deviation.

### install:pi updated
- **Spec:** "The `install:pi` script already symlinks
  `packages/pi-adapter/skill/*`; add `kb-curate` to it." / "confirm it picks
  up `kb-curate` (it currently globs or lists `kb-ask`; update if needed)."
- **Actual:** ✅ The script was changed from a single hard-coded `kb-ask`
  symlink to an array `const skills = ['kb-ask', 'kb-curate']` iterated in a
  loop (install-pi.mjs L13, L34–36). This is a *list*, not a glob — the spec
  offered "globs or lists" as either option; the implementer chose the list
  approach (minimal change to existing pattern). Functionally equivalent:
  `kb-curate` is now symlinked. No deviation.

### Governance conformance (vs decide-second-brain-governance)

| Governance decision | Spec | SKILL.md | Status |
|--------------------|------|----------|--------|
| Q1 — edit-anything + git | agent may edit any note; git is undo | Rule 8, L169 "may edit any note", "Git is the undo" | ✅ |
| Q2 — lifecycle human-gated | draft/unverified; never self-promote; human review flips | Rule 4, L85–91 | ✅ |
| Q3 — deprecate with consent | may deprecate only with explicit consent; humans freely | Rule 4, L93–97 | ✅ |
| Q4 — link-don't-duplicate | kb_search before create; correct via linked note (may edit, git backstop) | Rule 6, L123–137 | ✅ |
| Q5 — provenance non-negotiable | generated.by + sources; conflicts as separate entries | Rule 3, L60–78 | ✅ |
| Q7 — conflict resolution | human authoritative; disagreements → linked Decision note; KB records both views | Rule 6, L133–137 "records both views"; Rule 3 L72–74 | ✅ |

All governance decisions from `decide-second-brain-governance` are
correctly reflected. The Q1=(b) "edit-anything + git" reconciliation note
(append provenance, edit=content not lifecycle) is faithfully captured in
Rule 8 L174–180.

### Out-of-scope changes
- **No session-distill workflow code** (slice 2): ✅ The skill contains only
  the shared *rules* — no "save this session" workflow steps. The example
  (L184–229) demonstrates a single decision distillation as an illustration
  of the rules, not a workflow definition. This is within slice 1's scope
  (the spec says the example "demonstrates distilling a sample session").
- **No topic-research workflow code** (slice 3): ✅ Not present.
- **No `kb_resolve_id` reference:** The arch-spec lists `kb_resolve_id` in
  the "Existing abstractions to use" but the skill does not reference it.
  The test only requires `kb_search`/`kb_update`/`kb_check_id` at minimum.
  `kb_resolve_id` is a resolution helper (id → note); the curation rules
  don't need it (the agent knows the id it's writing). This is a minor
  scope narrowing, not a deviation — the skill correctly uses the tools it
  needs. No impact on dependent slices.

### Acceptance criteria check (slice doc)

| Criterion | Status | Evidence |
|-----------|--------|---------|
| Skill specifies triggers, type selection (5 types incl generic), provenance (generated.by, sources, conflicts separate), lifecycle (draft/unverified, never self-promote, deprecate consent), edit-anything+git, link-don't-duplicate (kb_search before create), consent-gated deprecation | ✅ | Rules 1–8 (all verified above) |
| Frontmatter shape specified | ✅ | Rule 7, L144–163 |
| Running curation on a sample session produces one OKF note passing kb_check_id with correct provenance | ⚠️ Manual (hitl) | The skill *teaches* this flow (Rule 5 + Example L184–229 shows kb_check_id validation at L223). Actual note-quality review is a follow-up manual task per the kb-ask precedent. The auto-gate test verifies the *instructions* are present, not that a real note was produced. This matches the spec's "mode: hitl" design. |
| Agent checks for near-match before creating (kb_search) and links instead of duplicating | ✅ | Rule 6, L123–141; test asserts `kb_search.*before creat` |

### Acceptance — sample-session example, type selection incl generic, kb_check_id after writing
- **Sample-session distillation example present:** ✅ Lines 184–229 — a full
  worked example distilling a decision-making session (DB driver choice)
  into a `decision:use-better-sqlite3` note, with frontmatter, provenance,
  lifecycle, and the kb_update→kb_check_id flow.
- **Type selection incl generic:** ✅ Rule 2 (L39–57) names all 5 types
  including `generic` as the gauge; the example uses `decision` (L191).
- **kb_check_id after writing:** ✅ Rule 5 step 3 (L112) + Example step 8
  (L223) both show `kb_check_id({ ref })` called after `kb_update`.

### Task doc update needed?
- **No.** The implementation matches the arch-spec and slice doc with no
  API-surface deviations. No `## Implementation notes` append is needed.
  The arch-spec's "Placement" note ("confirm it picks up `kb-curate`") is
  resolved — install-pi.mjs now lists it.

### User attention needed?
- **No.** Scope did not change; no API surfaces differ from the spec. The
  only follow-up is the manual note-quality review (the hitl acceptance
  gate), which is expected per the spec's "mode: hitl" design and the
  kb-ask precedent — not a deviation.

### Architecture-notes updates
- None needed. The arch-spec is accurate as written. One minor note: the
  spec mentioned `kb_resolve_id` as an available abstraction, but the skill
  doesn't use it — this is expected (it's an id-resolution helper not
  needed for authoring). No arch-spec edit required.

---

### Test run

```
npx vitest run "packages/pi-adapter/tests/kb-curate-skill.test.ts"
→ Test Files  1 passed (1)
→ Tests       17 passed (17)
→ Duration    550ms
```

All 17 content/structure tests pass. No staged files (`git diff --cached`
empty). The commit `88f43bc` is on branch `task/second-brain-curation`.
