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

# Build and generate database
npm run build

# Start development API server
npm run api:dev  # Runs on port 4000

# Run tests
npm test

# Lint and format
npx biome check
```

## Development Commands

### Database Operations
```bash
npm run build              # Compile TypeScript (auto-runs db:generate)
npm run db:generate        # Generate DuckDB database from source data
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
- **Components**: MRT/LRT lines (NSL, EWL, CCL, etc.) with service schedules
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
1. **Source data** (JSON files in `/data/source/`)
2. **Database generation** (DuckDB with complex analytics)
3. **API endpoints** (Real-time queries with multi-language support)

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

- Database regeneration required when source data changes
- API responses include related entities for client efficiency
- Performance optimized for read-heavy analytical workloads
- Extensive use of CTEs for complex uptime calculations
- Proper handling of ongoing issues (end_at = NULL)
