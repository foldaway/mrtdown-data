# Data Overhaul Split Plan

PR #177 is the backup/source branch for this migration. Do not keep expanding
that branch. Split it into small PRs that can be reviewed and validated
independently.

Each split PR should start by extracting the relevant implementation from
PR `#177`, then adapting only what is necessary for the current branch. Do not
recreate target-package behavior from scratch when the backup/source branch
already contains it; doing so makes it easy to miss supporting surfaces that the
large PR introduced across package boundaries.

## Goals

- Make `mrtdown-data` the canonical reviewed data repository for MRTDown.
- Move runtime serving and Postgres import concerns to `mrtdown-site`.
- Keep agent instructions short and make repository feedback mechanical.
- Keep generated/migrated data separate from package and workflow changes.

## PR Sequence

1. Harness foundation
   - Add `AGENTS.md`, this split plan, doc-link checks, package-boundary checks,
     generated-file ignores, and validation workflow wiring.
   - Do not move runtime code or migrate data in this PR.

2. Package scaffold and core schemas
   - Add workspaces and `packages/core`.
   - Move shared schemas and period/state helpers.
   - Keep tests focused on pure deterministic behavior.

3. File-backed repository and CLI
   - Add `packages/fs` and `packages/cli`.
   - Add fixtures and commands for validate, list, show, create, id, manifest,
     and pages-index.

Step 3.5: Turborepo package task harness

- Add Turborepo for dependency-aware package build and test orchestration.
- Keep the legacy production build, Docker/Fly.io surfaces, generated data,
  publishing, and runtime removal out of this PR.
- Preserve the existing root command names so production stabilization patches
  continue to run the same entry points.

4. GitHub Pages publishing foundation
   - Add GitHub Pages static data artifact generation and deployment before
     triage so `mrtdown-site` can begin consuming published data.
   - Use the existing target CLI manifest and pages-index behavior as the
     publication boundary.
   - Keep this PR limited to Pages workflow wiring, artifact generation, and
     docs for the published contract.
   - Do not add Changesets/npm package publishing in this PR.

5. Triage package
   - Add `packages/triage` with deterministic tests.
   - Document `test:eval`, required environment variables, model dependency,
     and expected cost before running paid/model-dependent evals.

6. Static canonical data
   - Migrate `station`, `line`, `service`, `operator`, `town`, and `landmark`
     data into the target `data/` layout.
   - Validate with CLI tooling from earlier PRs.

7. Issue dataset migration
   - Migrate `data/issue/YYYY/MM/<issue_id>/`.
   - Keep replay/repair reports with the PR so reviewers can inspect the
     generator behavior instead of reading every generated file.

Step 7.5: Legacy source-data removal

- Remove `data/source/` only after the static canonical data and issue dataset
  have both been migrated into the target layout and validated.
- Keep this PR limited to deleting legacy source-data files and updating
  documentation or checks that still reference `data/source/`.
- Do not combine this with runtime/API/DuckDB cleanup unless the diff is
  trivially small; reviewers should be able to verify data completeness without
  also reviewing serving-code removal.

8. Runtime removal and deploy cleanup
   - Remove old Hono/API/DuckDB runtime files from this repo.
   - Remove or move `Dockerfile`, `fly.toml`, and Fly deploy workflow surfaces
     once the serving target exists in `mrtdown-site`.

9. Package publishing
   - Add Changesets/npm publishing only after package APIs and branch triggers
     are reviewed.

## Mechanical Checks

Every PR should run the fastest applicable subset:

- `npm run check`
- `npm run build`
- `npm run build:packages`
- `npm test`
- `npm run test:packages`
- target CLI validation once the CLI exists

When packages exist, `npm run check:boundaries` enforces the intended dependency
direction:

- `core` must not import `fs`, `triage`, or `cli`.
- `fs` may import `core`, but not `triage` or `cli`.
- `triage` may import `core` and `fs`, but not `cli`.
- `cli` may wire all packages together.

## Review Notes

- Keep branch names, workflow triggers, and deploy targets production-safe before
  merge.
- Do not commit generated `data/manifest.json`, generated `data/index.html`,
  `.turbo/`, `dist/`, DuckDB files, or migration scratch files unless a PR
  explicitly changes artifact policy.
- If a split PR depends on an earlier split PR, target the earlier branch rather
  than hiding the dependency in a large diff.
