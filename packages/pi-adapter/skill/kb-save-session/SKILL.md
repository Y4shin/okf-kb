---
name: kb-save-session
description: "Distill the current session into the KB as OKF notes. Use when the user says 'save this session to the KB' or asks to capture what was learned/decided."
---

# kb-save-session — Distill the Current Session into the KB

This skill teaches you to extract the **durable, reusable** knowledge from
the current session — decisions, facts, and references — and distill it into
OKF notes in the knowledge base. It is a *session-distill* workflow: you read
the session's transcript/log (pi's session context), pull out what is worth
keeping, and author/link OKF notes with provenance and lifecycle metadata.

This skill is **pure instructions** — it teaches you to call the `kb_*` tools
registered by the pi extension and use pi's native `write`/`edit` to author
notes. It does not build a tRPC client or call the daemon directly; you use
the tools, not code.

**Shared rules live in `kb-curate`.** Type selection, provenance
(`generated.by`, `sources`), lifecycle (`status: draft` / `unverified`,
never self-promote, deprecate with consent), frontmatter shape, link-don't-
duplicate, and edit-anything+git governance are all defined in `kb-curate`.
**See kb-curate for type selection and provenance rules** — this skill does
not repeat them; it adds the session-distill-specific steps below. Apply the
kb-curate rules at each step where they apply (type in Step 2, provenance and
lifecycle in Step 4, link-don't-duplicate in Steps 3 and 8).

Follow the 8 steps below, **in order**, for every "save this session" request.

---

## Step 1 — Extract (Summarize, Then Distill — Not a Verbatim Dump)

Read the current session's context — pi's session transcript/log — and
**extract structured knowledge**: the decisions, facts, and references that
are **durable and reusable** (something future-you or another session would
look up).

This is **not a verbatim dump** of the transcript. **Summarize, then
distill**: boil the session down to the reusable claims — "we decided X over
Y because Z", "fact: W is the case", "reference R says …" — and discard the
ephemeral scaffolding (the false starts, the debug thrash, the one-off
tweaks). A note that says "the conversation went …" is not a distilled note.

If the session has **nothing durable** — nothing reusable, nothing a future
session would look up — **say so and stop**. Do not manufacture a note to
justify the request. Tell the user there was nothing worth saving and why.

Group what you extract into candidate items, one per durable claim. A
session that spans multiple topics yields **multiple notes** (one per topic);
a single-topic session may yield just one.

> You are distilling, not transcribing. The output is reusable knowledge,
> not a chat log.

---

## Step 2 — Type-Select (Per kb-curate)

For each extracted item, pick its `type` per **kb-curate's type selection
rules** (`term` / `concept` / `decision` / `reference` / `generic`, with
`generic` as the gauge for anything that doesn't fit the four). **See
kb-curate for type selection** — the rules and the gauge are defined there;
apply them here, do not restate them.

A "why X over Y" choice is a `decision`; a "how X works" explanation is a
`concept`; a "what is X" definition is a `term`; an external-source summary
is a `reference`. If no type is a clear fit, default to `generic` and note
why in the body (and flag the type-vocab gap with the user, per kb-curate).

---

## Step 3 — kb_search (Link If Near-Match, Else Create)

Before authoring any note, **`kb_search` before creating** (this is
kb-curate's link-don't-duplicate rule, applied per item):

```
kb_search({ q: <the item's subject>, opts: { withGraph: true } })
```

- If a **near-match** exists at a clear threshold, **link instead of creating**
  a duplicate: do not author a new note. Add a typed `relation` + a prose
  markdown link to the existing note (see Step 5), and record the distilled
  session's angle in the existing note's body if it adds something (appending
  your provenance, per kb-curate's edit-anything rule). Link instead of creating
  when a near-match exists; do not duplicate.
- If **no near-match**, proceed to Step 4 to author a new note.

This applies to every item, on every distill — including re-distilling the
same session later (Step 8).

---

## Step 4 — Author (Native Write, Provenance + Lifecycle)

> **Remote KB note:** When the KB is remote (the pi adapter's `isRemoteKb`
> detects a non-localhost `KB_URL`), author with `kb_put`/`kb_delete`, not
> native `write`/`edit` — native writes go to your local disk, not the
> daemon's bundle. The remote tool set registers `kb_put`/`kb_delete`
> automatically; use `kb_put` to author instead of native `write`/`edit`.

Author each new note with pi's **native `write`/`edit`** (the daemon's
pi-facing surface has no `Write; you edit files directly and the daemon
reindexes after — see kb-curate's authoring model). Use the frontmatter shape
from kb-curate: `id: type:slug`, `type`, `title`, `description`, `tags?`,
`relations?`, `generated`, `sources?`, `status: draft`, `stale_after?`.

Set provenance and lifecycle, per kb-curate (non-negotiable for AI notes):

- **`generated.by = pi/<version>/<model>`** — stamp the note with your pi
  version and model name (e.g. `pi/0.80.10/<model>`).
- **`sources` → the session transcript/log** — for a session-distilled note,
  the `sources` entry's `resource` is the **session transcript/log** (or a
  pointer to it), with `title?` describing the session. The session *is* the
  source for the distilled decision/fact/reference.
- **`status: draft`**, trust **`unverified`** — you never self-promote
  (per kb-curate); a human review flips both.

If the session contained conflicting claims, record them as **separate
`sources` entries**, noted in the body (per kb-curate) — don't merge a
conflict into one entry.

---

## Step 5 — Link Relations (Typed Relation + Prose Markdown Link)

For each new note, add typed `relations` to existing concepts it connects to,
**plus a prose markdown link per relation** in the body (per OKF and
kb-curate). Each relation is a typed edge to another note's `type:slug` id.

Use the relation type that fits: `decided_in` (a decision backs a concept),
`relates_to`, `supersedes`, `corrects`, etc. If the session decided something
that affects an existing concept, link the new `decision` note to that
concept with `decided_in` and a prose link in the body, e.g.:

> This decision backs the [search concept](concept:search).

Link, don't duplicate: if the relation already exists, don't re-add it. The
goal is a connected graph, not duplicate edges.

---

## Step 6 — kb_update (Reindex; Daemon Auto-Maintains index.md + log/)

After writing each note (native `write`/`edit`), **reindex** so the note
becomes searchable and the KB's bookkeeping is updated:

```
kb_update({ ref, content })
```

The daemon **auto-maintains `index.md` + `log/` + the root `log.md`** on the
reindex path — you do **no manual maintenance** of these. `kb_update` is the
single call that triggers reindex; the `index.md` listing, the `log/` dated
entry, and the root `log.md` are all maintained by the daemon as part of the
reindex. Do not hand-edit `index.md` or `log/`.

Call `kb_update({ ref, content })` after every write (and after every edit, if
you amended an existing note in Step 3/5).

---

## Step 7 — kb_check_id (Validate Conformance)

After reindexing, **validate** the note's conformance:

```
kb_check_id({ ref })
```

`kb_check_id` checks the id format (`type:slug`), the frontmatter shape, and
the required fields. If it reports a conformance failure, fix the frontmatter
and re-run `kb_update` + `kb_check_id` until it passes. Do not leave a note
that fails conformance checks.

`kb_update` reindexes; `kb_check_id` validates conformance. Use both after
every write/edit (per kb-curate's authoring model).

---

## Step 8 — Re-Distill: Link, Don't Duplicate

If you distill the **same session again** (a later "save this session" for a
session you already distilled), **link, don't duplicate**:

- `kb_search` for the session's subject — it will find the **prior notes**
  you (or a prior distill) authored.
- **Link** the new/distilled angle to those prior notes (typed relation +
  prose markdown link), rather than creating a duplicate. If the prior note
  already captures the decision/fact, just add the relation; if the new
  distill adds an angle, append to the prior note's body (appending your
  provenance, per kb-curate) and re-link.

Re-distilling the same session links to the prior notes; it does not create a
second copy of the same decision. `kb_search` is how you find them.

---

## Example — Distilling a DB-Driver Decision Session

A session debated the database driver choice and landed on `better-sqlite3`
over `sqlite-vec`. To distill it:

1. **Extract** (Step 1): the durable claim is "we chose better-sqlite3 over
   sqlite-vec for its synchronous API and maturity." Discard the debug
   thrash. Not a verbatim dump — summarize, then distill.
2. **Type-select** (Step 2): "why X over Y" → `decision` (per kb-curate).
3. **`kb_search`** (Step 3): `kb_search({ q: "database driver choice
   better-sqlite3" })`. No near-match → create.
4. **Author** (Step 4) with native `write` into a note with this frontmatter:

```yaml
id: decision:use-better-sqlite3
type: decision
title: "Use better-sqlite3 as the DB driver"
description: "Chose better-sqlite3 over sqlite-vec for synchronous API + maturity."
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
> `better-sqlite3` over `sqlite-vec` for its synchronous API and maturity.

5. **Link relations** (Step 5): the `decided_in` relation + the prose markdown
   link above connect this `decision:use-better-sqlite3` note to the
   `concept:search` note it backs.
6. **Reindex** (Step 6): `kb_update({ ref: "decision:use-better-sqlite3",
   content })` — the daemon auto-maintains `index.md`, `log/`, and the root
   `log.md`.
7. **Validate** (Step 7): `kb_check_id({ ref: "decision:use-better-sqlite3"
   })` — passes conformance (id format, frontmatter shape, required fields).
8. **Re-distill** (Step 8): if a later session re-decides the driver, `kb_search`
   finds `decision:use-better-sqlite3` — link the new angle to it, don't
   duplicate.

The note is `status: draft`, `unverified`, with `generated.by` and `sources →
the session transcript/log` — a human review later promotes it.
