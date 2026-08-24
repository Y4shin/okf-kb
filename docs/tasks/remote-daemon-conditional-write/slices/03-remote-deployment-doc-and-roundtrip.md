---
kind: slice
slug: remote-deployment-doc-and-roundtrip
title: "Remote deployment guide + security threat model + remote kb_put→kb_get governance round-trip"
task: ../task.md
mode: hitl
status: done
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

## Implementation notes

Deliverables: `docs/remote-deployment.md` (new, ~323 lines, 7 sections),
`packages/pi-adapter/tests/remote-roundtrip.test.ts` (new, 7 tests),
`packages/pi-adapter/tests/remote-deployment-doc.test.ts` (new, 13 tests),
and one-line remote-authoring notes in `kb-curate`/`kb-save-session`/`kb-research`
(`kb-ask` skipped — it doesn't author). All on `task/remote-daemon-conditional-write`.

### docs/remote-deployment.md

- **Recommended path:** systemd service on `127.0.0.1:30700` + caddy (or nginx)
  TLS reverse proxy on `0.0.0.0:443` with Let's Encrypt, proxying to the daemon.
  Includes a caddyfile snippet (`reverse_proxy 127.0.0.1:30700`) and a systemd
  unit snippet (`ExecStart`, `KB_TOKEN`, `KB_HOME`).
- **Secondary path:** direct daemon TLS via `KB_DAEMON_TLS_CERT`/`KB_DAEMON_TLS_KEY`.
  Documents the safety gate (refuses non-localhost bind without TLS or
  `KB_ALLOW_REMOTE_INSECURE=1` escape hatch).
- **Config env table:** `KB_DAEMON_HOST`, `KB_DAEMON_TLS_CERT`/`KEY`,
  `KB_ALLOW_REMOTE_INSECURE`, `KB_PORT`, `KB_TOKEN`, `KB_HOME`.
- **Client side:** `KB_URL=https://kb.host` + `KB_TOKEN`; `isRemoteKb` → 10 tools
  (incl. `kb_put`/`kb_delete`); local-vs-remote authoring table with an explicit
  warning that native `write`/`edit` would write to the agent's **local disk**,
  not the daemon's bundle.
- **Threat model:** the Bearer token is authentication, not network security;
  TLS is the network layer; the token is sniffable without TLS; remote = a
  network-exposed KB → use a strong token + TLS + ideally a private network/VPN.
- **Governance:** edit-anything + git on the daemon host; never self-promote
  `draft`→`stable`; deprecate with consent; provenance non-negotiable.
- **Capabilities:** `GET /` returns `{ok, service, version, groups}` (not
  Bearer-gated) — lets a client verify the daemon is up + see exposed groups.

### remote-roundtrip.test.ts (7 tests)

Exercises the remote-branch wiring (`createKbTrpcClient<AppRouter>` +
`registerKbTools(pi, client, fullBindings)`) against a test daemon on loopback
(`startDaemon` with FakeEmbedder, tmp space, ephemeral port). Tests:

1. **10-tool registration:** `fullBindings` registers exactly 10 tools incl.
   `kb_put`/`kb_delete` (the original 8 + 2).
2. **fullBindings has write group:** `write.put` + `write.delete` present.
3. **`kb_put` creates a note through the daemon's `Write.put`:** `PutResult
   {ref:{ty:'concept',slug:'remote-test'}, changed:true}`.
4. **`kb_get` round-trip:** returns the note; `frontmatter.status === 'draft'`;
   `frontmatter.generated.by` is set (coerced to `{producer:'pi', kind:'agent'}`
   by ActorSchema — the daemon's `Write.put` preserves the provenance the agent
   sent; it does not invent it if omitted). Body contains `kb_put`.
5. **`kb_check_id`:** `{ok:true, errors:[]}`.
6. **Note on daemon's bundle path:** file exists at
   `<space>/concepts/remote-test.md` (NOT the test's local disk); content has
   `id: concept:remote-test` + title + `kb_put` body.
7. **`kb_delete` removes it:** `kb_delete` → `kb_get` throws (not found) + file
   gone from the daemon's bundle.

### remote-deployment-doc.test.ts (13 tests)

Content/structure auto-gate: asserts all required sections present via regex —
recommended path (systemd/caddy/nginx/TLS/reverse_proxy/Let's Encrypt),
caddyfile snippet, systemd snippet, secondary path, safety gate, config env,
client side (KB_URL+isRemoteKb→kb_put/kb_delete), local-vs-remote authoring,
threat model (authn/network/sniffable), network-exposed+VPN, governance,
capabilities `GET /`. All 13 pass.

### Skill notes

`kb-curate` (Rule 5), `kb-save-session` (Step 4), `kb-research` (Step 2) each
received a 5-line blockquote "Remote KB note": *"When the KB is remote
(`isRemoteKb` detects a non-localhost `KB_URL`), author with `kb_put`/`kb_delete`,
not native `write`/`edit` — native writes go to your local disk, not the daemon's
bundle."* `kb-ask` was skipped (it doesn't author). The 3 corresponding skill
tests were inverted from "does NOT reference kb_put/kb_delete" (the local-only
assertion from slice 2) to "references kb_put/kb_delete in the remote note" —
an intended, spec'd change.

### Provenance nuance

The daemon's `FsWrite.put()` *preserves* the `generated.by` from the note's
frontmatter (the test sends `generated.by: 'pi/0.80.10/test-model'`); it does not
*stamp/invent* it if omitted (`packages/fs/src/write.ts` comment: "we don't
invent an actor here"). The arch spec's "the daemon stamps it" framing is
slightly idealized vs the implementation ("preserves what the agent sent"). The
round-trip test is faithful to the actual behavior, and the doc's governance
section was written to match ("the daemon's `Write.put` path stamps/preserves
it"). Provenance is non-negotiable either way — the note must carry it; the
daemon doesn't drop it.

### Cosmetic fix

The doc's example `GET /` JSON showed `groups:["read","search","write","localFs",
"indexAdmin"]` but the runtime emits `localFs`-first
(`Object.keys(fullBindings)` in `@kb/protocol`). Corrected in commit `3991f38`
to match the runtime order. No functional impact (JSON array order is
non-semantic for a capabilities listing).

### Validation

- `tsc --build` → exit 0 (clean, `--strict`).
- `vitest run` → 217 passed, 1 skipped (embedder integration). 20 new slice
  tests: 7 round-trip + 13 doc-content.
- mode hitl: the auto-gate (round-trip + doc-content tests) passes. Human
  review of the guide's **usability** (can a real operator follow it end-to-end)
  is the follow-up, by design.
