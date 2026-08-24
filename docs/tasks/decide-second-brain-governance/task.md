---
kind: task
type: grilling
slug: decide-second-brain-governance
title: Decide second-brain governance — AI autonomy, review policy, lifecycle transitions
map: agent-knowledge-base
status: done
blocked_by: []
---

## Decision to settle

The autonomy and governance rules for the AI acting as a second brain:
what the agent may create vs edit, who transitions lifecycle states, the
deprecation policy, the duplicate/near-match policy, provenance discipline,
and what would unlock the deferred scheduled/autonomous expansion. You
said the agent should "treat the KB like its memory/second brain" — this
grilling finds the line between useful autonomy and human control, so the
curation workflows have explicit rules instead of implied ones.

## Parent decisions it depends on

- Shared second brain: AI and human notes coexist, separated by
  `generated.by` (map, decided).
- AI-distilled notes are `status: draft`, trust `unverified` (map, decided).
- v1 expansion is on-demand; scheduled/autonomous is Fog (map, decided).
- OKF actor convention: `pi/<version>` for the agent, `human:<id>` for
  people (OKF spec §7).

## Choices already known

- Curation links to existing concepts rather than duplicating (curation
  task acceptance).
- Provenance required: `generated.by` + `sources` (OKF spec).
- AI notes start draft/unverified; lifecycle transitions are human-driven
  except the agent marking its own drafts (map, decided — confirm here).

## The specific questions to grill (one at a time)

1. **Create vs edit.** May the agent edit existing notes — its own?
  human-authored? Or only create new notes and link? (Recommend: agent may
  freely edit notes it authored; it must *not* silently edit human-authored
  notes — it proposes/links/creates a new note instead.)
2. **Lifecycle transitions.** Who flips `draft`→`stable` and
  `unverified`→`human-reviewed`? May the agent ever mark its own notes
  `stable`? (Recommend: a human review flips both; the agent leaves its
  notes `draft`/`unverified`.)
3. **Deprecation.** May the agent mark notes `deprecated`? Who can? What
  triggers deprecation? (Recommend: only humans deprecate; the agent may
  *flag* a note as suspect in a new note or log, not deprecate directly.)
4. **Duplicate/near-match policy.** Confirm "link, don't duplicate"; what
  similarity threshold; what if a near-match is human-authored and slightly
  wrong? (Recommend: link at a clear threshold; for a wrong human note, the
  agent creates a correcting `Decision`/`Note` and links, not edit the
  human note.)
5. **Provenance discipline.** What `sources` are required for AI-distilled
  notes vs research notes? Session transcripts as sources? How to record
  partial or conflicting sources? (Recommend: distilled notes cite the
  session; research notes cite URLs with author/last_modified; conflicting
  sources recorded as separate entries and noted in the body.)
6. **Scope of autonomy.** On-demand only in v1 (confirm). What would
  unlock scheduled/autonomous background expansion (Fog) — explicit
  guardrails, a review queue, a bounded scope? Define the graduation
  criteria so the Fog item has an exit condition.
7. **Conflict resolution.** When agent and human disagree in the same
  note, who wins; is there a review queue? (Recommend: human-authored
  content is authoritative; the agent never overwrites it; disagreements
  become a linked `Decision` note for the human.)

## Recommended starting answer

- Agent edits its own notes freely; never silently edits human notes
  (propose/link/create instead).
- Humans flip draft→stable and unverified→human-reviewed; agent leaves its
  notes draft/unverified.
- Only humans deprecate; agent may flag via a new linked note.
- Link, don't duplicate; correct a wrong human note via a linked
  Decision/Note, not an edit.
- Distilled notes cite the session; research notes cite URLs; conflicts
  recorded as separate sources + noted in body.
- v1 on-demand only; scheduled expansion graduates only after a review
  queue + bounded scope exist (define in this task).

## What downstream work the answer may create

- Shapes all three `second-brain-curation` slices with explicit rules.
- Sets the review policy and the graduation criteria for the
  `scheduled-background-expansion` Fog item.
- May create a `Reference` note in the bundle documenting the governance
  rules (an OKF "profile" note).

## Decisions (settled in grilling)

- **Q1 — Create vs edit authority: SETTLED (b) — agent edits anything; git is
  the safety net.** The agent may edit existing notes — its own *and*
  human-authored. **Git versioning prevents oopsies**: every edit is a
  recoverable commit; `git revert`/history is the undo. This **supersedes**
  the earlier "agent never silently edits human notes" recommendation.
  Architecturally consistent: pi authors via its **native `write`/`edit`**
  (the daemon's pi-facing tRPC surface still omits `Write.put` — pi doesn't
  use the KB daemon to write; it edits files directly and the daemon
  reindexes). So "edits anything" is a *skill policy + git*, not a daemon
  permission. The curation skill teaches: edit freely, commit, rely on git
  history for recovery.
- **Q2 — Lifecycle transitions: SETTLED (a) for now.** A **human review**
  flips `draft`→`stable` and `unverified`→`human-reviewed`; the agent leaves
  its notes `draft`/`unverified` and never self-promotes to `stable`.
  "For now — we'll see once it's in use" (may revisit if the policy proves
  too strict in practice).
- **Q3 — Deprecation: SETTLED — agent has the tool, but only with explicit
  consent.** The agent **may** deprecate (it has the capability at its
  disposal), but is **only allowed to use it with explicit human consent** —
  the skill/prompt requires asking before deprecating (e.g. pi's
  `ctx.ui.confirm`, or a native edit gated by a confirmation). Not a blanket
  prohibition, not a blanket permission — a consent gate. Humans can
  deprecate freely.
- **Q4 — Duplicate/near-match: SETTLED (a) — link, don't duplicate; correct
  via a linked note.** `kb.search` (RRF ranking) detects near-matches before
  creating; link at a clear threshold. For a **wrong human note**, the agent
  creates a **correcting `Decision`/`Note`** and links it — but per Q1=(b),
  "never edit the human note to fix it" is **relaxed**: the agent *may* edit
  the human note (git is the safety net), though creating a correcting linked
  note is still the *preferred* path (it records the disagreement visibly
  rather than silently rewriting). Threshold configurable.
- **Q5 — Provenance discipline: SETTLED (a).** Distilled notes cite the
  **session transcript/log** as a `sources` entry; research notes cite
  **URLs** with `author` + `last_modified` where known; **conflicting
  sources recorded as separate `sources` entries** and noted in the body;
  never omit provenance for an AI note. "We'll see what that means once
  implemented" — the concrete `sources` shape is settled in OKF
  (`decide-js-api-scope-and-contract`: `Source.author: Actor`,
  `last_modified: IsoDate`); the curation skill fills it in per note.
- **Q6 — Scope of autonomy: SETTLED — on-demand only for the foreseeable
  future.** v1 is on-demand curation (session distillation + topic research
  on request). **Scheduled/autonomous background expansion stays in Fog
  indefinitely** — no near-term graduation; revisit only if a real need
  appears. When/if it does, it still respects Q1–Q3 (scheduling widens
  frequency, not authority).
- **Q7 — Conflict resolution: SETTLED (a) — human authoritative; disagreements
  become a linked `Decision` note.** Human-authored content is
  authoritative; the agent records its differing view as a linked
  `Decision`/`Note` for the human to resolve. The KB records both views, it
  doesn't silently pick one. (Per Q1=(b), the agent *could* edit the human
  note, but the governance says it shouldn't — it links a Decision instead;
  git history is the backstop if it does edit.)

## Reconciliation note

Q1=(b) "agent edits anything + git safety net" is the meaningful change
here. It means:
- The **curation skill** teaches: edit freely (own and human notes), commit
  often, rely on `git` history for undo. No "don't touch human notes"
  prohibition.
- The **daemon architecture is unaffected**: pi still has no `Write.put` on
  its tRPC surface (pi authors via native `write`/`edit`, not the daemon);
  the daemon reindexes after. "Edits anything" is a file-level permission via
  pi's native tools, not a KB-daemon permission.
- The **OKF lifecycle (Q2/Q3) is still human-gated**: the agent leaves its
  notes `draft`/`unverified`, never self-promotes to `stable`, and only
  deprecates with consent. "Edits anything" is about *content*, not about
  *lifecycle state* — the agent can fix a typo in a human note, but it
  can't mark that note `stable` or `deprecated` without a human.
