# Slice result: add-release-workflow

## Summary

Implemented `.github/workflows/release.yml` on branch `slice/add-release-workflow`.
The workflow has two jobs:

1. `build` — runs automatically on push to `main` or `workflow_dispatch`: checkout, setup-node (Node 24, npm cache), `npm ci`, `npm run build`, `npm test`.
2. `release` — requires `build`, uses GitHub environment `release` (manual approval gate), then checks out, sets up Node, installs, builds, and runs `changesets/action@v1` with `npx changeset publish --provenance`.

Auth is OIDC-only: workflow permissions include `id-token: write`, and there is no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `secrets.NPM` reference.

## Divergence from plan

- **Env comment wording**: the arch spec's exact YAML included the comment `# NOTE: no NPM_TOKEN / NODE_AUTH_TOKEN — OIDC authenticates.`. I changed it to `# NOTE: OIDC authenticates the publish — no long-lived npm token is set.` so that a literal grep for `NPM_TOKEN` / `NODE_AUTH_TOKEN` returns no matches. The semantic meaning (documenting OIDC-only auth) is preserved.

## Validation performed

- YAML parse via `node -e` using the `yaml` package: **valid**.
- Grep for `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `secrets.NPM`: **no matches**.
- Structural checks via parsed YAML:
  - two jobs: `build`, `release`;
  - `release.needs === 'build'`;
  - `release.environment === 'release'`;
  - `on.push.branches === ['main']` plus `workflow_dispatch`;
  - `changesets/action@v1` step uses `publish: npx changeset publish --provenance` and `NPM_CONFIG_PROVENANCE: "true"`.
- `npm test`: **221 passed, 1 skipped**.
- `actionlint`: not installed; skipped (as allowed by slice doc/arch spec).

## Notable events

- The only source of friction was reconciling the arch spec's exact comment with the validation instruction to grep-clean the file for token strings; resolved by rewording the comment while preserving intent.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Created only .github/workflows/release.yml; no source/test/package changes. Scope limited to the workflow file as required."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "YAML parsed successfully; grep confirms no NPM token references; structural checks confirm two-job build→release with environment: release and changesets/action@v1 provenance publish; npm test passes 221/1."
    }
  ],
  "changedFiles": [
    ".github/workflows/release.yml"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "node -e \"const fs=require('fs'); const y=require('yaml'); y.parse(fs.readFileSync('.github/workflows/release.yml','utf8')); console.log('valid')\"",
      "result": "passed",
      "summary": "Workflow YAML parsed successfully."
    },
    {
      "command": "grep -nE \"NPM_TOKEN|NODE_AUTH_TOKEN|secrets\\.NPM\" .github/workflows/release.yml",
      "result": "passed",
      "summary": "No NPM token secret references found."
    },
    {
      "command": "node -e \"const fs=require('fs'); const y=require('yaml'); const d=y.parse(fs.readFileSync('.github/workflows/release.yml','utf8')); console.log('jobs:', Object.keys(d.jobs)); console.log('release needs:', d.jobs.release.needs); console.log('release environment:', d.jobs.release.environment); console.log('on push branches:', d.on.push.branches);\"",
      "result": "passed",
      "summary": "Confirmed two jobs, release needs build, environment release, and main branch trigger."
    },
    {
      "command": "npm test",
      "result": "passed",
      "summary": "221 passed, 1 skipped; workflow file did not affect tests."
    }
  ],
  "validationOutput": [
    "YAML valid (node yaml parse).",
    "No NPM_TOKEN / NODE_AUTH_TOKEN / secrets.NPM references.",
    "Jobs: build, release; release needs build; release environment: release.",
    "changesets/action@v1 step uses publish: npx changeset publish --provenance and NPM_CONFIG_PROVENANCE=true.",
    "npm test: 221 passed, 1 skipped."
  ],
  "residualRisks": [
    "Owner must create GitHub environment named 'release' with a required reviewer before the release job will pause for approval.",
    "Trusted-publisher registration on npm for all 6 @okf-kb packages is deferred to slice 02.",
    "actionlint is not installed locally; validation relied on YAML parse plus manual schema review."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added .github/workflows/release.yml: a two-job GitHub Actions workflow that builds/tests on push to main and, after manual environment approval, publishes changed packages via changesets/action@v1 with npm OIDC Trusted Publishing and provenance.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "The env comment was reworded from the arch spec to keep a literal grep for token strings clean; semantics unchanged."
}
```
