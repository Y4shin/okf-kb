# TDD Result — slice `topic-research-workflow` (task `second-brain-curation`)

## Summary

Implemented the `kb-research` pi skill (a pure-markdown SKILL.md instruction
set) at `packages/pi-adapter/skill/kb-research/SKILL.md`, plus a content/structure
auto-gate test at `packages/pi-adapter/tests/kb-research-skill.test.ts` (23
tests). The skill teaches the agent to research a topic (web + repo) and
synthesize OKF notes with real `sources`, correct provenance, and cross-links.
It references `kb-curate` for shared rules (type selection, provenance,
lifecycle, governance) and adds the 6 research-specific steps. Updated the
`install:pi` script to glob `skill/*` instead of a hardcoded list.

## What was built

### SKILL.md (`packages/pi-adapter/skill/kb-research/SKILL.md`)

Frontmatter: `name: kb-research`, `description: "Research a topic into the KB
as OKF notes with real sources. Use when the user says 'research X into the
KB' or asks to study a topic and save synthesized, sourced notes."`

6-step workflow (mirrors kb-ask/kb-curate heading pattern):
1. **Research the Topic** — `web_search` (web) + `fetch_content` (pages) +
   `read`/`grep` (repo); gather sources with credibility signals (URL, title,
   author, last_modified). Edge cases: no sources → don't fabricate; too
   broad → narrow with the user.
2. **Synthesize Notes** — `reference`/`concept`/`term`-typed; a `reference`
   note per key source; native write/edit (no kb_put/kb_delete).
3. **Attribute Sources** — `sources` entries: `{resource: <URL>, title?,
   author?, last_modified?}`; unsupported claims → marked/omitted; conflicting
   sources → separate entries, noted in body; paywalled/inaccessible → note it.
4. **Provenance** (per kb-curate) — `generated.by = pi/<version>/<model>`,
   `status: draft`, `unverified`; never self-promote.
5. **Cross-Link** (link-don't-duplicate, per kb-curate) — `kb_search` before
   create; link near-matches; correcting linked note for wrong human note.
6. **Reindex & Validate** — `kb_update({ref, content})` reindex (daemon
   auto-maintains index.md/log); `kb_check_id({ref})` validate.

Includes the requested example: researching "sqlite-vec vs sqlite-fts5 for
vector search" → `reference:sqlite-vec` note (sources → sqlite-vec docs URL,
generated.by, status: draft) + `concept:vector-search-in-kb` note cross-linked
to it.

References kb-curate for shared rules ("see kb-curate for type selection,
provenance, and lifecycle rules") — does not repeat them.

### Test (`packages/pi-adapter/tests/kb-research-skill.test.ts`)

Content/structure test mirroring `kb-ask-skill.test.ts` (23 tests):
- Frontmatter assertion (name === 'kb-research', description).
- Workflow steps present + ordered (Step 1→6 headings).
- Step-specific assertions: research (web_search/fetch_content + read/grep +
  credibility signals), synthesize (reference/concept/term + reference note
  per key source + native write/edit), attribute (sources with URL +
  title/author/last_modified; unsupported marked/omitted; conflicting separate
  entries; paywalled → note it), provenance (generated.by, draft, unverified,
  references kb-curate), cross-link (kb_search before create,
  link-don't-duplicate, references kb-curate), reindex & validate (kb_update
  reindex + auto-maintains index.md/log, kb_check_id validate).
- Edge cases: no sources → don't fabricate; too broad → narrow with user;
  paywalled/inaccessible → note it.
- References kb-curate for shared rules (type selection, provenance, lifecycle).
- Tool references: kb_* tools (kb_search, kb_update, kb_check_id) + web_search
  + fetch_content + native read/grep + native write/edit.
- Pure markdown: no @kb/fs, no daemon imports, no tRPC client, no kb_put/kb_delete.
- Example: sqlite-vec vs sqlite-fts5, reference:sqlite-vec + concept:vector-search-in-kb.

### install:pi script update

`packages/pi-adapter/scripts/install-pi.mjs` — replaced the hardcoded
`['kb-ask', 'kb-curate']` list with a glob over `skill/` subdirectories so
new skills (kb-research, kb-save-session, and future) are picked up
automatically.

## TDD cycle

- RED→GREEN: wrote SKILL.md + test, ran → 2 failures (Step 2 mentioned
  `kb_put`/`kb_delete` by name and used backticked `native `write`/`edit``
  which didn't match the regex; the kb_put/kb_delete mention also tripped the
  no-kb_put test). Fixed by removing the kb_put/kb_delete mention (defer to
  kb-curate's authoring model) and using `native write/edit` without
  backticks. Re-ran → 23 passed (GREEN). Committed.
- Refactor: updated install:pi to glob skill/*. Committed.
- Full suite: 86 tests pass across 5 files (kb-ask, kb-curate, kb-research,
  kb-save-session, tools). Typecheck clean. No foreign test breakage.

## Divergence from plan

- **install:pi glob**: the arch spec said "update if needed (should glob
  skill/* now)". The script had a hardcoded list `['kb-ask', 'kb-curate']`.
  I replaced it with a `readdir` glob over `skill/` subdirectories. This is
  the spec's recommended direction and also picks up the sibling
  kb-save-session skill (parallel slice) automatically. No API surface change.
- No other divergences. The skill is a sibling skill (own dir, own
  `/skill:kb-research` command) per the arch spec's recommendation, not a
  section in kb-curate/SKILL.md.

## Notable events

- Initial RED run caught two issues: (1) Step 2 named `kb_put`/`kb_delete`
  by reference (mirroring kb-curate's pattern), which tripped the
  no-kb_put/kb_delete test — fixed by deferring to kb-curate's authoring model
  without naming the unregistered tools; (2) the `native `write`/`edit``
  with backticks didn't match the test's `native write` regex — fixed by
  removing backticks. Both fixed in one edit, re-ran GREEN.
- The sibling kb-save-session slice's test (21 tests) passes alongside this
  slice's test — no cross-contamination, stayed in own dir/test file.
