# Agent Map

This file is the entry point for coding agents. Keep it short. Put durable details
in `docs/` and link to them from here.

## Current State

This repository is the canonical target-layout MRTDown data repository. The
legacy runtime, API, DuckDB generator, and Fly deploy surfaces have been removed
from this repo.

- `data/{station,line,service,operator,town,landmark,issue}` contains the
  canonical target-layout data.
- `packages/core` contains shared schemas and pure period helpers.
- `packages/ingest-contracts` contains the published webhook payload schemas
  shared by external evidence producers and the triage ingester.
- `packages/fs` contains file-backed repositories and writers for the target
  data layout.
- `packages/triage` contains LLM-assisted evidence triage and replay utilities.
- `packages/cli` contains the command-line entry point for validating,
  inspecting, creating, and generating target-layout data artifacts.
- `fixtures/generated/data` is generated on demand for package and CLI tests.

The data-overhaul split sequence is complete. Keep
`docs/plans/completed/data-overhaul-split.md` as historical context when
changing package, data, workflow, or deploy surfaces.

## Target Layout

The target architecture is a package/data repository:

- `packages/core`: schemas, shared period helpers, and state helpers.
- `packages/ingest-contracts`: external ingest webhook payload schemas and
  inferred TypeScript types.
- `packages/fs`: file-backed repositories and writers. It depends on `core`.
- `packages/triage`: LLM-assisted evidence triage and replay utilities. It may
  depend on `core`, `fs`, and `ingest-contracts`.
- `packages/cli`: command-line entry point that wires packages together.
- `data/{station,line,service,operator,town,landmark}`: canonical static
  entities.
- `data/issue/YYYY/MM/<issue_id>/`: append-only issue records with
  `issue.json`, `evidence.ndjson`, and `impact.ndjson`.
- `fixtures/generated/data`: on-demand generated fixture data for tests and
  examples.

## Commands

- `npm ci`: install dependencies from the lockfile.
- `npm run typecheck`: compile-check target packages.
- `npm run build`: build all target packages with Turborepo.
- `npm run build:packages`: build all target packages with Turborepo.
- `npm run build:core`: compile the target `@mrtdown/core` package.
- `npm run build:ingest-contracts`: compile the target
  `@mrtdown/ingest-contracts` package.
- `npm run build:fs`: compile the target `@mrtdown/fs` package.
- `npm run build:triage`: compile the target `@mrtdown/triage` package.
- `npm run build:cli`: compile the target `@mrtdown/cli` package.
- `npm test`: run deterministic tests.
- `npm run test:packages`: run all target package tests with Turborepo.
- `npm run test:core`: run `@mrtdown/core` deterministic tests.
- `npm run test:ingest-contracts`: run `@mrtdown/ingest-contracts`
  deterministic tests.
- `npm run test:fs`: run `@mrtdown/fs` deterministic tests.
- `npm run test:triage`: run `@mrtdown/triage` deterministic tests.
- `npm run test:eval`: run model-dependent `@mrtdown/triage` evals. This is
  paid and must be run intentionally with the package's documented environment
  variables.
- `npm run test:cli`: run `@mrtdown/cli` deterministic tests.
- `npm run data:validate`: validate canonical `data` with the target CLI.
- `npm run fixtures:validate`: generate and validate fixture data with the
  target CLI.
- `npm run pages:build`: build the static GitHub Pages data artifact.
- `npm run ingest:webhook`: process incoming webhook evidence with
  `@mrtdown/triage`.
- `npm run check`: run harness checks that should stay fast and deterministic.
- `npm run check:boundaries`: enforce package import boundaries when packages
  exist.
- `npm run check:docs`: verify repo-relative documentation links.

For the target package architecture, each split PR should keep these commands
truthful in its own branch and update this file only when the branch changes
the repository shape.

## Review Rules

- Prefer small PRs that isolate one concern: harness, package scaffold, core
  schemas, file-backed repositories, CLI, triage, data migration, workflows, or
  deploy cleanup.
- Keep generated data and hand-authored code in separate PRs whenever practical.
- If documentation and code disagree, fix the documentation or narrow the PR
  before adding more implementation.
- Use Conventional Commits style for commit messages and PR titles, for example
  `feat: add Pages artifact publishing foundation`. Do not add tool or agent
  prefixes such as `[codex]` to PR titles.
- Do not merge temporary branch names, one-off deploy triggers, or local
  generated artifacts.

## Deeper Docs

- `README.md`: repository overview and commands.
- `docs/plans/README.md`: active plans, completed reports, and durable tech
  debt.
- `docs/plans/completed/data-overhaul-split.md`: completed split sequence for
  the data overhaul.
- `docs/plans/completed/ingest-contracts-package.md`: completed ingest
  contracts package plan.
- `docs/plans/completed/legacy-source-data-removal.md`: Step 7.5 source-data
  removal report.
- `docs/plans/completed/runtime-removal-deploy-cleanup.md`: Step 8 runtime and
  deploy cleanup report.
- `CLAUDE.md`: Claude-specific compatibility entry point.
- `.github/copilot-instructions.md`: Copilot compatibility entry point.
