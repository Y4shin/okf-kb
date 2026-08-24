# `kb-client-js-api` reference prototype

These two files are a **verified prototype** of `@kb/core`'s type interface,
built and checked during the `decide-js-api-scope-and-contract` grilling. They
**compile clean under `tsc --strict` + Zod 4.4** and demonstrate every
mechanism the `core-types-and-builder` slice must implement:

- `core.prototype.ts` — the Zod-verified types (`Ref`/`Actor`/`Rule`/
  `Frontmatter`/…), `parseRef`/`formatRef`/`parseActor`/`formatActor`, the
  per-method `*InputSchema` with `.meta()` tags, the typestate builder
  (`createKb` → `KbCollector` → `declare` → `Composer` → `build`), the
  conditional-intersection gate (`withRead`/`withSearch`/… keyed on the
  sealed `C`), and the `GroupBindings<G>` exhaustiveness type.
- `core-usage.prototype.ts` — the usage that proves the gates fire:
  intended consumer paths (CLI/pi/MCP) typecheck; forbidden paths (gating
  misses + raw strings where `Ref`/`Actor` expected) error via
  `@ts-expect-error`.

## Status

**Prototype, not production.** Port it into the real `packages/core`
workspace package; don't ship it verbatim. Known gaps to fill when porting:
- the `make*` stubs (`makeRead`/`makeSearch`/…) throw — real impls live in
  `@kb/fs`;
- the manifest `integrity_checks` (A1–A7, B1–B5, B7=error, B8) are listed in
  the decision log but not encoded as a runner here;
- `Embedder`/`Utility` interfaces are declared; the transformers.js +
  `DefaultUtility` impls live in `@kb/fs`;
- the daemon (tRPC/MCP) and CLI are separate slices, not in this file.

## How to re-verify

```sh
npm i zod@latest
npx tsc --noEmit --strict --moduleResolution bundler --module es2022 --lib es2020 \
  core.prototype.ts core-usage.prototype.ts
# expect exit 0 (all intended paths pass; every @ts-expect-error fires)
```

The decisions these encode are recorded in
`docs/tasks/decide-js-api-scope-and-contract/task.md` (the "Type interface"
and "Consumer/wrapper sync enforcement" sections).
