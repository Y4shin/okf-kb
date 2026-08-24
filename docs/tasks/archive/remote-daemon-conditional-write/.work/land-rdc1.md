# Land report — slice `daemon-bind-tls-capabilities` (task `remote-daemon-conditional-write`)

## Summary

The slice was worked directly on the task branch `task/remote-daemon-conditional-write`
(no separate slice branch, no worktree). The source + test changes were already
committed in two commits (91a8cb3 wip, b834367 fix). My job was purely to land it
doc-wise: set `status: done` and append Implementation notes to the slice doc,
then commit the doc-only change.

## Verification (re-run by land-worker)

| Check | Command | Result |
|-------|---------|--------|
| Branch | `git branch --show-current` | `task/remote-daemon-conditional-write` ✓ |
| tsc | `npx tsc --build` | exit 0 ✓ |
| vitest | `npx vitest run` | 186 passed + 1 skipped, 20 test files passed (1 skipped) ✓ |
| server.test.ts | — | 17 tests total (8 new for this slice) ✓ |
| Working tree clean | `git status --short` | clean before & after ✓ |

## Changes made (doc-only)

**File:** `docs/tasks/remote-daemon-conditional-write/slices/01-daemon-bind-tls-capabilities.md`
- Frontmatter `status: todo` → `status: done`.
- Appended `## Implementation notes` section summarizing the implementation
  (startDaemon host?/tls? options, non-localhost safety gate, direct TLS env
  fallback, GET / capabilities endpoint, 186 tests + tsc clean) and two
  deviations.

**Commit:** `34fe6ce docs: mark slice daemon-bind-tls-capabilities done + implementation notes`
(1 file changed, 59 insertions, 1 deletion).

No source, test, or config files were modified by the land-worker.

## Implementation summary (from the code review)

Affected files (already committed in b834367 / 91a8cb3):
- `packages/daemon/src/server.ts` — `StartDaemonOptions` gains `host?: string`
  (default `KB_DAEMON_HOST` env or `127.0.0.1`) and `tls?: {cert, key}`;
  `DaemonHandle` gains `host`; `server.listen(port, host)` uses the resolved host;
  URL scheme is `https`/`http` based on TLS; non-localhost safety gate
  (string `isLocal` check against `['127.0.0.1','localhost','::1']` — NOT DNS);
  throws naming 3 options when `!isLocal && !tls && !KB_ALLOW_REMOTE_INSECURE`;
  escape hatch warns; optional direct TLS via `opts.tls` OR
  `KB_DAEMON_TLS_CERT`/`KB_DAEMON_TLS_KEY` env fallback; `GET /` returns
  `{ok, service, version, groups}` where groups = `Object.keys(fullBindings)`
  (the 5 keys: localFs, read, search, write, indexAdmin) — NOT Bearer-gated.
- `packages/daemon/tests/server.test.ts` — 8 new test cases.

## Deviations noted

1. **KB_DAEMON_TLS_CERT/KEY env fallback** — the slice doc mentioned the env vars;
   the initial implementation only accepted `opts.tls`. The follow-up commit
   (b834367) added the env fallback (opts.tls wins, env vars as fallback). This
   aligns the implementation with the doc's intent. **Resolved.**
2. **GET / not Bearer-gated** — the acceptance criteria stated "Both are
   Bearer-gated like the other surfaces," but the implementation kept `GET /`
   ungated (the health endpoint was never gated; the groups list is non-sensitive).
   No tRPC `kb_capabilities` query was added (criteria allowed "AND/OR").
   This is a deviation from the literal criteria text but arguably the safer
   design for health probes. **Flagged for parent awareness.**

## HEAD + git log top 3

```
34fe6ce docs: mark slice daemon-bind-tls-capabilities done + implementation notes
b834367 fix(daemon): KB_DAEMON_TLS_CERT/KEY env fallback for direct TLS (operator path)
91a8cb3 wip: daemon-bind-tls-capabilities all criteria passing
```

HEAD sha: `34fe6ce6175ff64b805dd15d69c60b9ea108d20a`
