# stand-up-silverbullet — completion evidence

> Local record (also committed to this repo's task dir as evidence). No
> secrets — v1 has no SB auth token. The daemon has its own Bearer auth,
> separate from SB.

## What was done

- Created the **global KB** at `$KB_HOME` = `~/.local/share/kb` (default
  `env-paths('kb').data`), standalone git-versioned in its own repo.
  - `manifest.yaml` (trimmed to 5 types: `term`/`concept`/`decision`/
    `reference`/`generic`; 8 predicates; A1–A5+A7, B1–B5, B7=error, B8;
    B6 skipped; conventions for id/relations/links/provenance/log).
  - Typed dirs: `glossary/`, `concepts/`, `decisions/`, `reference/`,
    `generic/`, plus `log/` archive.
  - Root `index.md` (carries `okf_version: v0.2`) and thin root `log.md`.
  - Git: one commit `chore: initialize global OKF v0.2 KB`.
- Ran **Silverbullet in Docker** (official image `zefhemel/silverbullet:latest`),
  bind-mounting `$KB_HOME` as the SB space, port 3000, `SB_FS_WATCH=auto`,
  `restart: unless-stopped`, **no auth** (localhost test fixture).
- Verified all four evidence points (below).

## Who/what performed it

- Agent (pi) ran Docker, wrote the probe note to disk, ran the `curl`
  checks, and opened the SB UI in a headless browser for the screenshot.
- Container name: `kb-sb`; image: `zefhemel/silverbullet:latest`.

## Resulting facts

- **SB base URL / port:** `http://localhost:3000` (host), container `kb-sb`.
- **Space = `$KB_HOME`:** `~/.local/share/kb` (the global OKF v0.2 KB).
- **Auth:** none on SB in v1 (localhost single-user test fixture).
- **Filesystem-write pickup:** confirmed — `SB_FS_WATCH=auto` (default)
  picks up direct disk writes; a note written to
  `$KB_HOME/glossary/test-term.md` appeared in `/.fs` within ~3 s with no
  client save. (Research-confirmed behavior reproduced.)

## Evidence

### `GET /.ping` → 200 OK
```
HTTP 200
OK
```

### `GET /.fs` → JSON listing of the bundle
Returns an array including our `index.md`, `manifest.yaml`, `log.md`, and
the probe `glossary/test-term.md`. HTTP 200.

### `GET /.fs/glossary/test-term.md` → returns the note body
HTTP 200; body is the full markdown (frontmatter + `# Test Term` body).

### Filesystem-write pickup
Wrote `glossary/test-term.md` directly to `$KB_HOME` (not via SB HTTP).
Within ~3 s, `GET /.fs` listed it:
```
"name":"glossary/test-term.md","created":1787587628519,"lastModified":1787587628519,"contentType":"text/markdown","size":382,"perm":"rw"
```
and `GET /.fs/glossary/test-term.md` returned its body — no client save
performed. Confirms `SB_FS_WATCH=auto` (default) pushes external disk
writes to the server index.

### SB UI loads
Screenshot: `evidence-sb-ui.png` (this directory). The SB client at
`http://localhost:3000` loads and renders `index.md` — the
"pi-knowledgebase (global KB)" page with frontmatter folded. The space
folder is the global KB.

## Remaining risks / follow-up

- The `kb-sb` container uses `--restart unless-stopped`; it will restart
  on boot. To stop: `docker rm -f kb-sb`.
- The probe note `glossary/test-term.md` is a `draft` test term left in the
  global KB; it can be removed or promoted to a real term later. (Leaving
  it does not violate any integrity rule — it is linked nowhere, but B7
  only flags *orphaned glossary terms defined but never linked* once
  `kb check` runs the rule; a single seed term is acceptable for now.)
- No auth token is stored (v1 has none). The daemon (slice 3) will mint
  its own Bearer token via the keyring — separate from SB.
