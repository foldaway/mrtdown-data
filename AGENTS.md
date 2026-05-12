# Agent Map

This file is the entry point for coding agents. Keep it short. Put durable details
in `docs/` and link to them from here.

## Current State

`main` is still the legacy MRTDown data API repository:

- `src/api/` contains Hono routes and response schemas.
- `src/db/` generates and reads the DuckDB database.
- `src/schema/`, `src/model/`, and `src/helpers/` contain shared runtime types and
  calculations.
- `src/util/ingestContent/` and `src/scripts/` handle ingestion and maintenance
  utilities.
- `data/source/` is the legacy source-data layout.

The data-overhaul work is being split into smaller PRs. Follow
`docs/DATA_OVERHAUL_SPLIT.md` before moving package, data, workflow, or deploy
surface between branches.

## Target Layout

The target architecture is a package/data repository:

- `packages/core`: schemas, shared period helpers, and state helpers.
- `packages/fs`: file-backed repositories and writers. It depends on `core`.
- `packages/triage`: LLM-assisted evidence triage and replay utilities. It may
  depend on `core` and `fs`.
- `packages/cli`: command-line entry point that wires packages together.
- `data/{station,line,service,operator,town,landmark}`: canonical static
  entities.
- `data/issue/YYYY/MM/<issue_id>/`: append-only issue records with
  `issue.json`, `evidence.ndjson`, and `impact.ndjson`.
- `fixtures/data`: small deterministic data set for tests and examples.

## Commands

For the current legacy app:

- `npm ci`: install dependencies from the lockfile.
- `npm run build`: compile TypeScript and run the legacy postbuild pipeline.
- `npm test`: run deterministic tests.
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
- Do not merge temporary branch names, one-off deploy triggers, or local
  generated artifacts.

## Deeper Docs

- `README.md`: current legacy app overview and commands.
- `docs/DATA_OVERHAUL_SPLIT.md`: planned split sequence for the data overhaul.
- `CLAUDE.md`: Claude-specific compatibility entry point.
- `.github/copilot-instructions.md`: Copilot compatibility entry point.
