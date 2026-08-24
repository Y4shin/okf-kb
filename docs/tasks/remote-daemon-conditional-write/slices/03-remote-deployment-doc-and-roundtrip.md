---
kind: slice
slug: remote-deployment-doc-and-roundtrip
title: "Remote deployment guide + security threat model + remote kb_put→kb_get governance round-trip"
task: ../task.md
mode: hitl
status: todo
size: m
blocked_by: [pi-adapter-conditional-write]
---

## End-to-end behavior

A deployment guide + security threat-model doc for running the KB daemon
remotely (systemd + caddy/nginx TLS reverse proxy), and an end-to-end
verification that a remote agent can author through the daemon with
correct provenance: `kb_put` a note from a "remote" pi session →
`kb_get` returns it → the note has `generated.by = pi/<ver>/<model>`,
`status: draft`, passes `kb_check_id`, and appears in the Silverbullet
UI (the daemon's `Write` path maintains the bundle on the daemon host;
`SB_FS_WATCH=auto` picks it up).

## Acceptance criteria

- A `docs/remote-deployment.md` guide covering: running the daemon as a
  systemd service (or behind caddy/nginx) with TLS; the `KB_DAEMON_HOST`
  / `KB_DAEMON_TLS_*` / `KB_ALLOW_REMOTE_INSECURE` config; pointing a
  remote pi at it (`KB_URL` + `KB_TOKEN`); the security threat model
  (the Bearer token is authn not network security; TLS is the network
  layer; the token is sniffable without TLS; remote = a network-exposed
  KB, so use a strong token + TLS + ideally a private network/VPN).
- The guide notes the local-vs-remote pi behavior (local: native
  write/edit + `kb_update`; remote: `kb_put`/`kb_delete` through the
  daemon) and the governance (edit-anything + git on the daemon host;
  never self-promote `draft`→`stable`; deprecate with consent).
- An end-to-end test (or a documented manual run) of the remote
  authoring round-trip: with a non-loopback `KB_URL` (or a test daemon
  simulating remote), `kb_put({ref:'concept:remote-test', content})` →
  `kb_get({ref:'concept:remote-test'})` returns the note; the note's
  frontmatter has `generated.by` set (by the daemon's `Write.put`),
  `status: draft`; `kb_check_id({ref})` passes; the note file exists on
  the daemon's bundle path (NOT the agent's local disk — confirming the
  authoring went through the daemon).
- The governance rules (`decide-second-brain-governance`) are confirmed
  to hold via the remote write path: provenance non-negotiable (the
  daemon stamps it), no self-promotion, deprecate-with-consent.

## Test plan

- **Seams**: the deployment doc's correctness (a reader can follow it);
  the remote round-trip; provenance stamped by the daemon (not the
  agent); the note lands on the daemon host's bundle.
- **Failure modes**: TLS misconfigured (the guide's troubleshooting);
  token mismatch (401); the agent's native write/edit silently no-ops
  on a remote bundle (it writes to the *agent's* disk, not the daemon's —
  the guide must warn that native write/edit don't work remotely, use
  `kb_put`).
- **Scenarios**: follow the guide to stand up a TLS-fronted remote daemon
  (or simulate: a loopback daemon + a non-loopback `KB_URL` string to
  trigger the remote branch) → a remote pi `kb_put` → `kb_get` round-trip
  → the note has provenance + passes `kb_check_id`.
- **Edge cases:** the agent tries native `write` on a remote KB (it
  writes locally, not to the daemon — the guide/skill must steer to
  `kb_put`); a deprecated note authored remotely (the daemon excludes it
  from search by default, per the search-layer fix).

## Constraints and dependencies

- Depends on slices 1 + 2 (the daemon's remote bind/TLS + the adapter's
  conditional `kb_put`/`kb_delete`).
- This slice is `mode: hitl` — the deployment guide + the threat model
  are human-reviewed artifacts; the round-trip can be auto-tested but
  the guide quality is the human gate. Auto-gate: the round-trip test +
  a content/structure test on the deployment doc (sections present:
  systemd/caddy, TLS, config env, threat model, local-vs-remote
  behavior, governance). The human review of the guide's usability is a
  follow-up.
- No new infrastructure — the daemon + adapter from slices 1–2 are the
  implementation; this slice is docs + the end-to-end verification.

## Context & references

- **Parent task:** `docs/tasks/remote-daemon-conditional-write/task.md`
  (the security note + governance + downstream "deployment guide" item).
- **Affected files:** `docs/remote-deployment.md` (new), the
  `kb-ask`/`kb-curate`/`kb-save-session`/`kb-research` skills (a one-line
  note each: "when the KB is remote, author with `kb_put`/`kb_delete`,
  not native write/edit"), `packages/pi-adapter/tests/remote-roundtrip.test.ts`
  (new — the remote `kb_put`→`kb_get` + provenance test).
- **Existing building blocks:** the daemon's `Write.put` (stamps
  provenance + validates + maintains index.md/log + reindexes —
  `packages/fs/src/write.ts`); `kb_check_id` (`search.checkId`); the
  `stand-up-silverbullet` evidence (the SB UI verifies the note appears);
  the search-layer deprecated-exclusion (a remote-authored deprecated
  note is excluded by default).
- **Contracts/shapes:** the remote round-trip asserts the note's
  `frontmatter.generated.by` is set (by the daemon, to
  `pi/<ver>/<model>` — the daemon's `DefaultUtility.stampProvenance`),
  `status: 'draft'`, and `kb_check_id` returns `{ok:true}`.
- **Edge cases/gotchas:** native `write`/`edit` on a remote KB writes to
  the *agent's* local disk, not the daemon's bundle — the skills MUST
  steer the agent to `kb_put`/`kb_delete` when remote (the
  `isRemoteKb`-conditional tool set from slice 2 makes this automatic:
  remote = `kb_put`/`kb_delete` registered, and the skills' "author with
  native write/edit" instruction implicitly doesn't apply when those
  aren't the registered tools — but make it explicit in the skill note).
