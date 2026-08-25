# Changesets

This repo uses [Changesets](https://changesets.dev) for versioning and changelog.

## Adding a changeset

When you make a change that should be released, add a changeset:

```sh
npm run changeset
```

This launches an interactive prompt. Pick the package(s) affected, choose
`minor` / `major` / `patch`, and write a short summary. The changeset file
lands in this directory (`.changeset/*.md`) and is committed.

## Releasing

```sh
npm run version      # apply pending changesets: bump versions + write CHANGELOGs
npm publish:changes  # publish to npm (run in CI; see docs/tasks/release-runbook.md)
```

A changeset file looks like:

```md
---
"@okf-kb/cli": minor
"@okf-kb/daemon": patch
---

Add the okfkbd binary and a new --json flag on the CLI.
```

Inter-package dependencies use the npm-workspaces form `"*"` (npm resolves it
to the local workspace version; the `workspace:` protocol is pnpm/yarn-only and
not supported by npm). Changesets rewrites `"*"` to exact versions at
publish time via `updateInternalDependencies: "patch"` in `.changeset/config.json`.
The private `@okf-kb/pi-adapter` is versioned but not published
(`privatePackages: { version: true, tag: false }`).
