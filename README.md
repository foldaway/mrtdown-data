# mrtdown-data

Canonical data and package tooling for MRTDown. This repository stores reviewed
Singapore rail entities and issue records, validates them with the MRTDown CLI,
and publishes a static GitHub Pages data artifact.

Runtime serving now belongs outside this repository. The legacy Hono API,
DuckDB generator, Dockerfile, and Fly deploy config have been removed as part of
the data-overhaul split.

## Tech Stack

- **Data packages**: TypeScript workspaces under `packages/*`
- **Validation**: Zod schemas in `@mrtdown/core`
- **Ingest contracts**: shared webhook payload schemas in
  `@mrtdown/ingest-contracts`
- **Storage tooling**: file-backed repositories and writers in `@mrtdown/fs`
- **Triage tooling**: LLM-assisted evidence processing in `@mrtdown/triage`
- **CLI**: validation, inspection, creation, and artifact helpers in
  `@mrtdown/cli`
- **Testing**: Vitest
- **Linting**: Biome

## Quick Start

```bash
# Install dependencies
npm install

# Build workspace packages and validate canonical data
npm run build:packages
npm run data:validate

# Run tests
npm test

# Lint and format
npx biome check
```

## Development Commands

### Agent Harness

```bash
npm run check              # Fast deterministic harness checks
npm run check:docs         # Verify repo-relative documentation links
npm run check:boundaries   # Enforce package import boundaries when packages exist
npm run build              # Build workspace packages with Turborepo
npm run build:packages     # Build workspace packages with Turborepo
npm run build:core         # Build @mrtdown/core
npm run build:ingest-contracts # Build @mrtdown/ingest-contracts
npm run build:fs           # Build @mrtdown/fs
npm run build:triage       # Build @mrtdown/triage
npm run build:cli          # Build @mrtdown/cli
npm run typecheck          # Compile-check workspace packages
npm run test:packages      # Run package tests with Turborepo
npm run test:core          # Run @mrtdown/core deterministic tests
npm run test:ingest-contracts # Run @mrtdown/ingest-contracts deterministic tests
npm run test:fs            # Run @mrtdown/fs deterministic tests
npm run test:triage        # Run @mrtdown/triage deterministic tests
npm run test:eval          # Run paid/model-dependent @mrtdown/triage evals
npm run test:cli           # Run @mrtdown/cli deterministic tests
npm run data:validate      # Validate canonical data with @mrtdown/cli
npm run fixtures:validate  # Validate fixtures/data with @mrtdown/cli
npm run pages:build        # Build the GitHub Pages static data artifact
```

See `AGENTS.md` for the short agent map and `docs/plans/README.md` for active
plans, completed reports, and durable tech debt. The planned data-overhaul
split lives in `docs/plans/active/data-overhaul-split.md`.

### Static Pages Export

`npm run pages:build` writes a GitHub Pages artifact to `pages-dist/`. This
publishes canonical `data/` at the artifact root and keeps `fixtures/data`
available under `fixtures/` for tests and examples.

Preview branches and pull requests build the same bundle in CI and upload it as
a one-day artifact. Only `main` deploys the bundle to GitHub Pages.

The artifact publishes the canonical export at the root:

- `index.html`
- `manifest.json`
- `archive.tar.gz`
- `archive.zip`
- `station/`, `line/`, `service/`, `operator/`, `town/`, `landmark/`, and
  `issue/`

It also includes the deterministic fixture export:

- `fixtures/index.html`
- `fixtures/manifest.json`
- `fixtures/archive.tar.gz`
- `fixtures/archive.zip`
- the fixture data files used to build the fixture manifest

### Data Processing

```bash
npm run ingest:webhook     # Process @mrtdown/ingest-contracts payloads with @mrtdown/triage
```

### Testing and Quality

```bash
npm test                   # Run Vitest tests
npx biome check            # Lint and format code
```

## Architecture Overview

### Core Data Models

- **Lines**: MRT/LRT lines (NSL, EWL, CCL, etc.) with service schedules
- **Issues**: Disruptions, maintenance, infrastructure problems with time
  intervals
- **Stations**: Station information with multi-language support
- **Time-aware**: All operations handle Singapore timezone (`Asia/Singapore`)

### Data Flow

1. **Canonical data** (`/data/{station,line,service,operator,town,landmark,issue}`)
2. **CLI validation and static artifact generation**
3. **Published Pages artifact** for downstream consumers

## Key Features

- **Canonical rail data**: Track MRT line disruptions and maintenance in a
  reviewed file layout
- **Static publishing**: Generate deterministic Pages artifacts for downstream
  consumers
- **Multi-language support**: Content available in 4 languages
- **Time-zone aware**: All operations use Singapore timezone
- **Service hours logic**: Different schedules for weekdays, weekends, and
  holidays
- **Webhook integration**: Canonical data evidence ingestion through
  `@mrtdown/triage`, using `@mrtdown/ingest-contracts` for the payload contract

## Issue Data Structure

- **Directory layout**: `data/issue/YYYY/MM/<issue_id>/`
- **Bundle files**: `issue.json`, `evidence.ndjson`, and `impact.ndjson`
- **Types**: `disruption`, `maintenance`, `infra`
- **Time intervals**: Start/end timestamps with timezone awareness
- **Multi-language**: All titles have 4-language translations

## Development Notes

- CLI validation is required when canonical data changes.
- Keep generated `pages-dist/`, package `dist/`, and local migration scratch
  files out of commits unless a PR explicitly changes artifact policy.
- Keep generated data and hand-authored code in separate PRs whenever practical.
- Properly represent ongoing issues with open-ended periods.
