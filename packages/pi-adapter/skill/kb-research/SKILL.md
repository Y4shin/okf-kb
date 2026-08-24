---
name: kb-research
description: "Research a topic into the KB as OKF notes with real sources. Use when the user says 'research X into the KB' or asks to study a topic and save synthesized, sourced notes."
---

# kb-research — Research a Topic into the Knowledge Base

This skill teaches you to **research a topic** (web + repo) and synthesize
the findings into OKF notes with **real `sources`**, correct provenance, and
cross-links, so they are browsable in Silverbullet.

This skill is **pure instructions** — it teaches you to call the `kb_*` tools
registered by the pi extension and pi's `web_search`/`fetch_content` for web
research, plus your native `read`/`grep` for the repo. It does not build a
tRPC client or call the daemon directly; you use the tools, not code.

The **shared curation rules** (type selection, provenance, lifecycle,
governance, frontmatter shape, link-don't-duplicate, edit-anything + git)
live in the **kb-curate** skill. **See kb-curate for type selection,
provenance, and lifecycle rules** — this skill adds the research-specific
steps and defers to kb-curate for everything shared. Do not repeat those
rules here; follow them.

Follow the 6 steps below, **in order**, for every research request.

---

## Step 1 — Research the Topic

Gather real sources for the topic using **two channels**:

- **Web**: pi's `web_search` (search the open web) and `fetch_content` (fetch
  a page's content). Use `web_search` to find authoritative pages, then
  `fetch_content` to read them.
- **Repo**: your native `read`/`grep` (the local codebase / workspace). Use
  these when the topic touches code or docs that already live in the repo.

For **every** source you gather, capture its **credibility signals**:

- the **URL** (`resource`)
- `title`
- `author` (who wrote it)
- `last_modified` (when it was last updated — page date, commit date, etc.)

where each is known. These populate the `sources` entries in Step 3.

**If no sources found → say so, do not fabricate.** Tell the user you could
not find sources for the topic; do not invent sources or claims.

**If the topic is too broad → narrow with the user.** A topic like "databases"
is too broad to research into coherent notes. Ask the user to narrow it
(e.g. "databases → SQLite for local-first apps", or "vector search → sqlite-vec
vs sqlite-fts5"). Do not attempt to boil the ocean; scope the research first.

---

## Step 2 — Synthesize Notes

Synthesize the gathered sources into OKF notes. Pick the `type` per
**kb-curate's type-selection rule** (see kb-curate): `reference`, `concept`,
or `term` for research notes.

- A **`reference` note per key source** — summarize each authoritative source
  as its own `reference` note (type `reference`, id `reference:slug`).
- `concept` notes for "how does X work?" explanations synthesized across
  sources.
- `term` notes for glossary definitions of key terms the research introduces.

Do **not** produce a verbatim dump of a page. Summarize, then distill into
typed notes that future-you would look up.

Author each note with pi's **native write/edit** (per kb-curate's authoring
model, you write files directly with native write/edit and the daemon
reindexes after — there are no separate put/delete tools). Include proper
frontmatter (see kb-curate for the frontmatter shape).

---

## Step 3 — Attribute Sources

Every synthesized note must attribute its sources. This is the
**research-specific** part of provenance (see kb-curate for the general
provenance rule).

For each note, set the frontmatter `sources` field to a list of entries:

```
sources:
  - resource: <URL>
    title: <page title, if known>
    author: <author, if known>
    last_modified: <date, if known>
```

where `resource` is a **real URL** and `title`/`author`/`last_modified` are
filled in **where known**.

Rules:

- **A `reference` note per key source** — each key source gets its own
  `reference` note whose `sources` entry is that source's URL + signals.
- **Claims not supported by a source → marked or omitted.** If you cannot
  tie a claim to a gathered source, either **mark** it (e.g. `[unverified]`
  inline) or **omit** it entirely. Do not present an unsupported claim as
  if it were sourced.
- **Conflicting sources → separate `sources` entries**, and **noted in the
  body**. If two sources disagree, record each as its own `sources` entry and
  describe the disagreement in the note body — do not merge a conflict into
  one entry. The KB records both views visibly.
- **Paywalled or inaccessible source → note it.** If a source is behind a
  paywall or otherwise inaccessible (you found it via `web_search` but
  `fetch_content` could not retrieve the content), record its URL in
  `sources` and note in the body that the content was inaccessible; do not
  claim you read what you could not.

---

## Step 4 — Provenance (per kb-curate)

Stamp every note with provenance per **kb-curate's provenance rule** (see
kb-curate):

- **`generated.by = pi/<version>/<model>`** — stamp the frontmatter with your
  pi version and model name (e.g. `pi/0.80.10/<model>`).
- **`status: draft`** — AI notes start draft.
- trust: **`unverified`**.

You **never self-promote** a note from `draft` to `stable`; a human review
flips both. Do not mark a note `human-reviewed` yourself. (See kb-curate's
lifecycle rule for the full lifecycle and deprecate-with-consent gate.)

---

## Step 5 — Cross-Link (link, don't duplicate)

Before creating any note, **`kb_search` before creating** — search the KB for
a near-match (per kb-curate's link-don't-duplicate rule; see kb-curate):

```
kb_search({ q: <the note's subject>, opts: { withGraph: true } })
```

- If a **near-match** exists, **link** to it (add a typed `relation` + a
  prose markdown link in the body) instead of creating a duplicate.
- Cross-link your synthesized notes to **existing concepts** in the KB —
  research that connects to prior notes should link to them.
- For a **wrong human note**: a **correcting linked `decision`/`concept`
  note is preferred** — it records the disagreement visibly. You *may* edit
  the human note (git is the backstop, per kb-curate), but linking is the
  taught default.
- On re-researching the same topic later: **link, don't duplicate** — link
  the new notes to the prior ones.

---

## Step 6 — Reindex & Validate

After writing/editing each note (per kb-curate's authoring model):

1. **Reindex** — call `kb_update({ ref, content })` so the daemon reindexes
   the note and it becomes searchable. The daemon auto-maintains `index.md`
   and `log/` and the root `log.md` on the `kb_update` reindex path — do not
   maintain those manually.
2. **Validate** — call `kb_check_id({ ref })` to validate the note's
   conformance (id format, frontmatter shape, required fields). Fix any
   conformance issue and re-validate.

Use both after every write/edit.

---

## Example — Researching "sqlite-vec vs sqlite-fts5 for vector search"

The user says: "research sqlite-vec vs sqlite-fts5 for vector search into the
KB."

1. **Research** (Step 1): `web_search` for "sqlite-vec vector search" and
   "sqlite-fts5"; `fetch_content` the sqlite-vec docs page and the SQLite FTS5
   docs page. `grep` the repo for any existing usage. Capture each source's
   URL, title, author, and last_modified.

2. **Synthesize** (Step 2): create a `reference:sqlite-vec` note summarizing
   the sqlite-vec docs, and a `concept:vector-search-in-kb` note explaining
   how vector search works in the KB context (synthesized across sources).

3. **Attribute** (Step 3): the `reference:sqlite-vec` note's `sources`:

```yaml
id: reference:sqlite-vec
type: reference
title: "sqlite-vec — vector search for SQLite"
description: "Summary of the sqlite-vec extension for vector similarity search."
tags: [sqlite, vector-search]
relations:
  - rel: explains
    target: concept:vector-search-in-kb
generated:
  by: pi/0.80.10/<model>
sources:
  - resource: https://github.com/asg017/sqlite-vec
    title: "sqlite-vec docs"
    author: Alex Garcia
    last_modified: 2024-01-15
status: draft
```

   And the `concept:vector-search-in-kb` note, **cross-linked** to the
   reference note:

```yaml
id: concept:vector-search-in-kb
type: concept
title: "Vector search in the KB"
description: "How vector search works for KB retrieval; sqlite-vec vs sqlite-fts5."
tags: [vector-search, retrieval]
relations:
  - rel: references
    target: reference:sqlite-vec
generated:
  by: pi/0.80.10/<model>
sources:
  - resource: https://github.com/asg017/sqlite-vec
    title: "sqlite-vec docs"
    author: Alex Garcia
    last_modified: 2024-01-15
  - resource: https://www.sqlite.org/fts5.html
    title: "SQLite FTS5 docs"
    author: SQLite Consortium
status: draft
```

   In the body of `concept:vector-search-in-kb`, a prose link:

> Vector search in the KB uses [sqlite-vec](reference:sqlite-vec) for
> embedding similarity, contrasted with FTS5's full-text approach.

4. **Provenance** (Step 4): both notes carry `generated.by =
   pi/0.80.10/<model>`, `status: draft`.

5. **Cross-link** (Step 5): `kb_search({ q: "vector search", opts: {
   withGraph: true } })` — if no near-match, create; the concept note links
   (`references`) to the reference note.

6. **Reindex & Validate** (Step 6): `kb_update({ ref:
   "reference:sqlite-vec", content })` and `kb_update({ ref:
   "concept:vector-search-in-kb", content })`; then `kb_check_id({ ref:
   "reference:sqlite-vec" })` and `kb_check_id({ ref:
   "concept:vector-search-in-kb" })` — both pass conformance.

---

## Summary

- **Research** (Step 1): `web_search` + `fetch_content` (web) + `read`/`grep`
  (repo); gather sources with credibility signals; no sources → say so,
  don't fabricate; too broad → narrow with the user.
- **Synthesize** (Step 2): `reference`/`concept`/`term` notes; a `reference`
  note per key source; see kb-curate for type selection.
- **Attribute** (Step 3): `sources` entries with URL + title/author/
  last_modified where known; unsupported claims marked/omitted; conflicting
  sources as separate entries; paywalled/inaccessible → note it.
- **Provenance** (Step 4): `generated.by = pi/<version>/<model>`, `status:
  draft`, `unverified`; see kb-curate for lifecycle.
- **Cross-link** (Step 5): `kb_search` before create; link-don't-duplicate;
  see kb-curate.
- **Reindex & Validate** (Step 6): `kb_update` reindex (daemon auto-maintains
  index.md/log); `kb_check_id` validate.
