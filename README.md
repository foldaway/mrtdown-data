# mrtdown-data

A comprehensive data repository and API system that tracks Singapore's MRT (Mass Rapid Transit) service disruptions, maintenance, and infrastructure issues. Functions as a status monitoring system for Singapore's public transportation network.

## Tech Stack

- **Backend**: Node.js + TypeScript, Hono API framework
- **Database**: DuckDB with normalized relational schema
- **Validation**: Zod schemas with OpenAPI integration
- **Testing**: Vitest
- **Linting**: Biome

## Quick Start

```bash
# Install dependencies
npm install

# Build target packages and validate canonical data
npm run build:packages
npm run data:validate

# Start legacy development API server
npm run api:dev  # Runs on port 4000

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
npm run build:packages     # Build target packages with Turborepo
npm run build:core         # Build the new @mrtdown/core package
npm run build:fs           # Build the new @mrtdown/fs package
npm run build:triage       # Build the new @mrtdown/triage package
npm run build:cli          # Build the new @mrtdown/cli package
npm run test:packages      # Run target package tests with Turborepo
npm run test:core          # Run @mrtdown/core deterministic tests
npm run test:fs            # Run @mrtdown/fs deterministic tests
npm run test:triage        # Run @mrtdown/triage deterministic tests
npm run test:eval          # Run paid/model-dependent @mrtdown/triage evals
npm run test:cli           # Run @mrtdown/cli deterministic tests
npm run data:validate      # Validate canonical data with @mrtdown/cli
npm run fixtures:validate  # Validate fixtures/data with @mrtdown/cli
npm run pages:build        # Build the GitHub Pages static data artifact
```

See `AGENTS.md` for the short agent map and `docs/DATA_OVERHAUL_SPLIT.md` for
the planned data-overhaul split. Fly production deploys are temporarily frozen
during the transition; see `docs/PRODUCTION_DEPLOY_FREEZE.md`.

### Static Pages Export

`npm run pages:build` writes a GitHub Pages artifact to `pages-dist/`. This
publishes canonical target-layout `data/` at the artifact root and keeps
`fixtures/data` available under `fixtures/` for tests and examples.

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
- the fixture target-layout data files used to build the fixture manifest

### Legacy Database Operations
```bash
npm run typecheck          # Compile-check TypeScript without legacy postbuild
npm run build              # Legacy production build path pending runtime cleanup
npm run db:generate        # Legacy DuckDB generator pending runtime cleanup
```

### API Development
```bash
npm run api:dev            # Start dev server on port 4000
```

### Data Processing
```bash
npm run ingest:webhook     # Process incoming webhook data
```

### Testing & Quality
```bash
npm test                   # Run Vitest tests
npx biome check            # Lint and format code
```

### Database Queries
```bash
# Query the database (use -readonly when API server is running)
duckdb -readonly -c "SELECT * FROM issues LIMIT 10" mrtdown.duckdb
```

## Architecture Overview

### Core Data Models
- **Lines**: MRT/LRT lines (NSL, EWL, CCL, etc.) with service schedules
- **Issues**: Disruptions, maintenance, infrastructure problems with time intervals
- **Stations**: Station information with multi-language support
- **Time-aware**: All operations handle Singapore timezone (`Asia/Singapore`)

### API Structure
Located in `/src/api/routes/`:
- **Overview**: System-wide status and line summaries
- **Lines**: Individual line profiles with detailed uptime metrics
- **Issues**: Issue details and historical data
- **Stations**: Station-specific information
- **Analytics**: Statistical analysis endpoints

All endpoints require Bearer token authentication except `/docs`.

### Data Flow
1. **Canonical data** (`/data/{station,line,service,operator,town,landmark,issue}`)
2. **Target CLI validation and static artifact generation**
3. **Legacy API endpoints** (pending runtime cleanup in the overhaul split)

## Key Features

- **Real-time Status Monitoring**: Track MRT line disruptions and maintenance
- **Historical Analytics**: Complex uptime calculations and service metrics
- **Multi-language Support**: Content available in 4 languages
- **Time-zone Aware**: All operations in Singapore timezone
- **Service Hours Logic**: Different schedules for weekdays/weekends/holidays
- **Webhook Integration**: Real-time data ingestion capabilities

## Issue Data Structure

- **File naming**: `YYYY-MM-DD-descriptive-slug.json`
- **Types**: `disruption`, `maintenance`, `infra`
- **Time intervals**: Start/end timestamps with timezone awareness
- **Multi-language**: All titles have 4-language translations

## Development Notes

- Target CLI validation required when canonical data changes
- API responses include related entities for client efficiency
- Performance optimized for read-heavy analytical workloads
- Extensive use of CTEs for complex uptime calculations
- Proper handling of ongoing issues (end_at = NULL)
