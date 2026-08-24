---
name: kb-curate
description: "Curate knowledge into the KB — when and how the agent distills sessions/research into OKF notes with provenance, lifecycle, and links. Use when the user says 'save this to the KB' or the agent identifies durable knowledge worth distilling."
---

# kb-curate — Curating Knowledge into the Knowledge Base

This skill teaches you **when and how** to distill knowledge into the KB as
OKF notes: which concept `type` to use, how to set provenance
(`generated.by`, `sources`), the draft/unverified lifecycle, link-don't-duplicate,
and the governance rules (edit anything + git; deprecate only with consent).

This skill is **pure instructions** — it teaches you to call the `kb_*` tools
registered by the pi extension and use pi's native `write`/`edit` to author
notes. It does not build a tRPC client or call the daemon directly; you use the
tools, not code.

Follow the 8 rules below, **in order**, for every curation act.

---

## Rule 1 — Triggers

Curate (distill into the KB) when **either**:

- The user explicitly asks: "save this session to the KB", "research X into
  the KB", or "add this to the KB".
- You identify a **durable, reusable** claim or decision in the current
  session worth distilling — something future-you (or another session) would
  look up.

Do **NOT** curate **ephemeral / one-off work** — throwaway scratch, a
task-specific tweak, or a fact useful only for the immediate request. If the
knowledge is not reusable, do not write a note. When in doubt, ask the user
whether it's worth saving.

---

## Rule 2 — Type Selection

Every OKF note has a `type`. Pick from the 5 types:

- **`term`** — a glossary definition: "what is X?" Defines a term.
- **`concept`** — how something works: "how does X work?" Explains a mechanism
  or design.
- **`decision`** — why X over Y (ADR-style): "why X over Y?" Records a choice
  and its rationale.
- **`reference`** — a spec / external-source summary: "what's the spec?"
  Summarizes an authoritative source.
- **`generic`** — the **gauge type**: anything that doesn't fit the four is
  `generic` until the type vocab is extended. A non-empty set of `generic`
  notes is a **signal to add a type** — raise it with the user rather than
  letting generic accumulate silently.

If no single type is a clear fit, default to `generic` (the gauge) and note
why the fit is unclear in the note body.

---

## Rule 3 — Provenance (non-negotiable for AI notes)

Every note you author must carry provenance. This is non-negotiable.

- **`generated.by = pi/<version>/<model>`** — stamp the note's frontmatter
  with your pi version and model name (e.g. `pi/0.80.10/<model>`).
- **`sources`** on derived notes: a list of `{ resource, title?, author?,
  last_modified? }` objects.
  - For **session distillation**, the `resource` is the **session
    transcript/log** (or a pointer to it).
  - For **topic research**, the `resource` is a **real URL** with credibility
    signals (author, last_modified where known).
- **Conflicting sources → separate `sources` entries**, and **noted in the
  body**. Do not merge a conflict into one entry; record each source's claim
  distinctly so the disagreement is visible.

Never omit provenance for an AI note. A note without `generated.by` and
`sources` (where the note derives from something) is not a valid AI note.

---

## Rule 4 — Lifecycle

AI-distilled notes start as:

- **`status: draft`**
- trust: **`unverified`**

You **never self-promote** a note from `draft` to `stable` — and you never
self-mark `unverified` to `human-reviewed`. A **human review flips both**:
when a human reviews the note, the human promotes it to `stable` and marks
it `human-reviewed`. You leave your notes `draft`/`unverified`.

**Deprecate only with explicit consent.** You may deprecate (the capability
is at your disposal), but you are only allowed to use it with **explicit human
consent** — ask the user first (e.g. pi's `ctx.ui.confirm`, or a native edit
gated by a confirmation). Not a blanket prohibition, not a blanket permission
— a consent gate. **Humans can deprecate freely**; you cannot, without asking.

---

## Rule 5 — Authoring Model (b) — native write/edit + kb_update + kb_check_id

Pi authors with its **native `write`/`edit`** tools. The daemon's pi-facing
surface has no `Write` — pi edits files directly and the daemon reindexes
after. There are no separate put/delete tools; you author with native
`write`/`edit` only. So the authoring flow is:

1. **Write the note** with native `write`/`edit` — the file on disk, with
   proper frontmatter (see Rule 7).
2. **Reindex** — call `kb_update({ ref, content })` so the daemon reindexes
   the note and it becomes searchable.
3. **Validate** — call `kb_check_id({ ref })` to validate the note's
   conformance (id format, frontmatter shape, required fields).

`kb_update` reindexes; `kb_check_id` validates conformance. Use both after
every write/edit. (There are no separate put/delete tools — author with
native `write`/`edit` only.)

---

## Rule 6 — Link, Don't Duplicate

**`kb_search` before creating.** Before you write a new note, search the KB
for a near-match:

```
kb_search({ q: <the note's subject>, opts: { withGraph: true } })
```

- If a **near-match** exists at a clear threshold, **link** to it instead of
  creating a duplicate: add a typed `relation` + a prose markdown link in the
  body. Do not duplicate.
- For a **wrong human note**: a **correcting linked `decision`/`concept`
  note is preferred** — it records the disagreement visibly rather than
  silently rewriting. You *may* edit the human note (git is the backstop, per
  Rule 8), but **linking is the taught default**: create the correcting note
  and link it, so the KB records both views.

Link, don't duplicate, on every create — including re-distilling the same
session or topic later (link the new note to the prior one).

---

## Rule 7 — Frontmatter Shape

Every OKF note's frontmatter has this shape:

- **`id`**: `type:slug` (e.g. `decision:use-better-sqlite3`). The id is the
  `type`, a colon, and a kebab-case slug.
- **`type`**: one of `term` / `concept` / `decision` / `reference` / `generic`
  (per Rule 2).
- **`title`**: a short human title.
- **`description`**: one-line summary.
- **`tags?`**: optional tags.
- **`relations?`**: typed relations, **plus a prose markdown link per
  relation** in the body (per OKF). Each relation is a typed edge to another
  note's `type:slug` id.
- **`generated`**: the `generated.by = pi/<version>/<model>` provenance (per
  Rule 3).
- **`sources?`**: the sources list (per Rule 3), present on derived notes.
- **`status: draft`**: AI notes start draft (per Rule 4).
- **`stale_after?`**: use sparingly — only when the note has a real freshness
  date.

---

## Rule 8 — Edit-Anything + Git

You **may edit any note** in the KB — your own and human-authored. **Git is
the undo**: every edit is a recoverable commit; `git revert` / history is the
safety net. Edit freely; commit often.

On edit, **append your provenance — don't erase the original author's.** If
you edit an existing note, add your `generated.by` to the provenance (append
to `generated` / note the edit in the body), rather than overwriting the
original author's stamp. The note's history should show who authored what.

"Edit anything" is about **content**, not **lifecycle state** — you can fix
a typo in a human note, but you cannot mark that note `stable` or
`deprecated` without a human (Rule 4).

---

## Example — Distilling a Decision-Making Session

A session debated the database driver choice and landed on `better-sqlite3`.
To curate it:

1. **Trigger**: the user says "save this session to the KB" (Rule 1). The
   decision is durable and reusable.
2. **Type**: it's a "why X over Y" choice → `decision` (Rule 2).
3. **`kb_search`** for a near-match (Rule 6): `kb_search({ q: "database
   driver choice better-sqlite3" })`. No near-match → create.
4. **Author** with native `write` (Rule 5) into a note with this frontmatter:

```yaml
id: decision:use-better-sqlite3
type: decision
title: "Use better-sqlite3 as the DB driver"
description: "Chose better-sqlite3 over node:sqlite for synchronous API + maturity."
tags: [database, decision]
relations:
  - rel: decided_in
    target: concept:search
generated:
  by: pi/0.80.10/<model>
sources:
  - resource: <session transcript/log pointer>
    title: "Session — DB driver decision"
status: draft
```

   And in the body, a **prose markdown link** for the relation:

> This decision backs the [search concept](concept:search) — it chose
> `better-sqlite3` for its synchronous API and maturity.

5. **Provenance** (Rule 3): `generated.by = pi/0.80.10/<model>`, `sources` →
   the session transcript/log (the session is the source for this distilled
   decision).
6. **Lifecycle** (Rule 4): `status: draft`, unverified. You do not promote it.
7. **Reindex**: `kb_update({ ref: "decision:use-better-sqlite3", content })`.
8. **Validate**: `kb_check_id({ ref: "decision:use-better-sqlite3" })` —
   passes conformance (id format, frontmatter shape, required fields).

The note links (via `decided_in`) to the `concept:search` note it backs, with
a prose markdown link in the body.

---

## Summary (governance)

- **Triggers** (Rule 1): user asks, or durable reusable claim found; not
  ephemeral work.
- **Type** (Rule 2): `term` / `concept` / `decision` / `reference` / `generic`
  (the gauge).
- **Provenance** (Rule 3): `generated.by = pi/<ver>/<model>` + `sources`;
  conflicts as separate entries.
- **Lifecycle** (Rule 4): `draft`/`unverified`; never self-promote; deprecate
  with consent.
- **Authoring** (Rule 5): native `write`/`edit` → `kb_update` reindex →
  `kb_check_id` validate. No separate put/delete tools — native `write`/`edit`.
- **Link, don't duplicate** (Rule 6): `kb_search` before create; link
  near-matches.
- **Frontmatter** (Rule 7): `id: type:slug`, `type`, `title`, `description`,
  `tags?`, `relations?`, `generated`, `sources?`, `status: draft`,
  `stale_after?`.
- **Edit-anything + git** (Rule 8): may edit any note (git is undo); append
  provenance on edit.
