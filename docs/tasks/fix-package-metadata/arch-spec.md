# Architecture Spec — `fix-package-metadata`

Add publish metadata to all 6 public packages so `npm publish` ships
working, clean tarballs. This fixes the **current packaging bug**: `dist/`
is gitignored and there's no `files` field, so `npm publish --dry-run`
today packs source-only tarballs (no `dist/`) while `main` points at
`./dist/index.js` — the published package would throw
`ERR_MODULE_NOT_FOUND`.

## Slice (single)

- **add-publish-metadata:** add `files: ["dist"]`, `prepublishOnly: npm
  run build`, `license: MIT`, `publishConfig: { access: public }` to the
  6 public package.jsons; add a root `LICENSE` (MIT); verify each
  `npm publish --dry-run` packs only `dist/` + `package.json` + `README`
  + `LICENSE`.

## Existing abstractions to use

- `npm publish --dry-run` is the acceptance check (already verified the
  bug in planning).
- The packages already have `main`/`exports`/`types` pointing at `dist/`
  (correct once `files` includes it).

## Do NOT reimplement

- Do not change `main`/`exports`/`types` paths — they're correct.
- Do not change the `bin` fields (cli `okfkb`, daemon `okfkbd` — already
  set).
- Do not touch `@okf-kb/pi-adapter` (private, not published).

## Seams under test

1. `npm publish --dry-run` per package lists only `dist/**`,
   `package.json`, `README.md`, `LICENSE` — no `src/`, `tests/`,
   `tsconfig.json`.
2. `npm run typecheck` + `npm test` green (metadata changes don't affect
   tests; `prepublishOnly` only fires on publish).

## Exact edit map

For each of `core, protocol, fs, daemon, cli, auth` `package.json`:
- `"files": ["dist"]`
- `"license": "MIT"`
- `"publishConfig": { "access": "public" }`
- In `scripts`: `"prepublishOnly": "npm run build"`

Root: add `LICENSE` (MIT, copyright "Y4shin").

## Risks
- `@okf-kb/fs` has compiled `.js` test helpers under `tests/` —
  `files: ["dist"]` excludes them correctly (verify in dry-run).
- `prepublishOnly` requires `npm run build` to exist (it does in every
  package).
