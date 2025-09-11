# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **mrtdown-data**, a data repository and API system that tracks Singapore's MRT (Mass Rapid Transit) service disruptions, maintenance, and infrastructure issues. It functions as a comprehensive status monitoring system for Singapore's public transportation.

**Tech Stack**: Node.js + TypeScript, Hono API framework, DuckDB database, Zod validation, Vitest testing, Biome linting.

## Development Commands

```bash
# Database and build
npm run build              # Compile TypeScript (auto-runs db:generate)
npm run db:generate        # Generate DuckDB database from source data
npm test                   # Run Vitest tests
npx biome check            # Lint and format code

# Development server
npm run api:dev            # Start dev server on port 4000

# Data processing
npm run generate-products  # Generate product JSON files
npm run ingest:webhook     # Process incoming webhook data
```

**Database Access**: Use `duckdb -readonly -c <query> mrtdown.duckdb` for querying (add `-readonly` flag when the API server is running to avoid lock conflicts).

## Architecture

### Core Data Models
- **Components**: MRT/LRT lines (NSL, EWL, CCL, etc.) with service schedules
- **Issues**: Disruptions, maintenance, infrastructure problems with time intervals
- **Stations**: Station information with multi-language support
- **Time-aware**: All operations handle Singapore timezone (`Asia/Singapore`)

### API Structure (`/src/api/routes/`)
- **Overview**: System-wide status and line summaries
- **Lines**: Individual line profiles with detailed uptime metrics
- **Issues**: Issue details and historical data
- **Stations**: Station-specific information
- **Analytics**: Statistical analysis endpoints

All endpoints require Bearer token authentication except `/docs`.

### Database Architecture
- **Single DuckDB file** (`mrtdown.duckdb`) with normalized relational schema
- **Source data**: JSON files in `/data/source/` (components, issues)
- **Generated products**: API-ready JSON in `/data/product/`
- **Complex analytics**: Extensive use of CTEs for uptime calculations

## Key Patterns

### Issue Data Structure
- **File naming**: `YYYY-MM-DD-descriptive-slug.json`
- **Types**: `disruption`, `maintenance`, `infra`
- **Time intervals**: Start/end timestamps with timezone awareness
- **Multi-language**: All titles have 4-language translations

### Service Hours Logic
- **Weekday/weekend/holiday schedules**: Components have different operating hours
- **Service windows**: Dynamic calculation based on day type
- **Uptime calculations**: Only count downtime during actual service hours

### Query Patterns
- Use extensive CTEs for complex analytical calculations
- Handle ongoing issues (end_at = NULL) properly in time-based queries
- Calculate uptime ratios excluding infrastructure issues
- Generate day-by-day breakdowns with issue aggregation
- Service window logic accounts for weekday/weekend/holiday schedules

### Schema and Validation
- **Zod schemas** in `/src/schema/` for all data structures
- **OpenAPI integration** for automatic API documentation
- **Type safety**: All database results have proper TypeScript interfaces

### Time Zone Considerations
- **Always use Singapore timezone** for user-facing operations
- **Service window calculations**: Done in local Singapore time
- **Issue intervals**: Stored as UTC, converted to Singapore for calculations
- **Date boundaries**: Use `(timestamp AT TIME ZONE 'Asia/Singapore')::DATE` for consistent day grouping

## Data Flow

1. **Source data** (JSON) → **Database generation** → **Product JSON** → **API endpoints**
2. **Webhook ingestion** for real-time updates
3. **Complex analytical queries** for uptime metrics and status determination
4. **Multi-language content** served based on client preferences

## Development Notes

- Database regeneration required when source data changes
- API responses include related entities for client efficiency
- Consistent error handling and logging throughout
- Performance optimized for read-heavy analytical workloads
