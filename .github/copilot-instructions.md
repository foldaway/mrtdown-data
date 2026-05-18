# mrtdown-data - GitHub Copilot Instructions

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

Also read `AGENTS.md`. It is the maintained short map for agents and points to
the current data-overhaul split plan.

## Project Overview

mrtdown-data is a comprehensive data repository and API system that tracks Singapore's MRT (Mass Rapid Transit) service disruptions, maintenance, and infrastructure issues. It functions as a status monitoring system for Singapore's public transportation network.

**Tech Stack:** Node.js + TypeScript, Hono API framework, DuckDB database, Zod validation, Vitest testing, Biome linting.

## Working Effectively

### Environment Setup
- **Node.js Version**: v22.12.0 (specified in `.nvmrc`)
- **Required Environment Variables**:
  - `DUCKDB_DATABASE_PATH="./mrtdown.duckdb"` (CRITICAL - required for all database operations)
  - `API_TOKENS="test-token"` (required for API server)

### Essential Commands (All Validated)

**Bootstrap and build the target packages:**
```bash
npm install                    # ~8 seconds
npm run build:packages
npm run data:validate
npm run fixtures:validate
```

**Run tests:**
```bash
npm test                       # ~1.3 seconds - very fast
```

**Run harness checks:**
```bash
npm run check                  # Fast deterministic docs/boundary checks
```

**Lint and format code:**
```bash
npx biome check               # ~0.9 seconds - shows many formatting issues but this is normal
npx biome check --fix         # Apply formatting fixes if needed
```

**Development server:**
```bash
export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
export API_TOKENS="test-token"
npm run api:dev               # Starts on port 4000 - NEVER CANCEL during development
```

**Data processing:**
```bash
npm run pages:build           # Builds the static Pages data artifact
npm run db:generate           # Legacy DuckDB generator pending runtime cleanup
```

### Critical Timeout Settings
- **npm run build:packages**: 300 seconds timeout
- **npm test**: 60 seconds timeout
- **npm run pages:build**: 180 seconds timeout
- **npx biome check**: 60 seconds timeout

## Validation

### Manual Validation Requirements
**Always run these validation scenarios after making changes:**

1. **Canonical Data Validation Test:**
   ```bash
   npm run data:validate
   npm run fixtures:validate
   ```

2. **API Server Test:**
   ```bash
   export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
   export API_TOKENS="test-token"
   npm run api:dev
   # In another terminal:
   curl -s http://localhost:4000/healthz                                    # Should return 204
   curl -s http://localhost:4000/docs                                       # Should return HTML docs
   curl -s -H "Authorization: Bearer test-token" http://localhost:4000/overview | head -n 5  # Should return complex JSON
   ```

3. **Complete End-to-End Test:**
   ```bash
   npm install
   npm run build:packages
   npm run data:validate
   npm test
   npm run pages:build
   export API_TOKENS="test-token"
   npm run api:dev &
   sleep 5
   curl -s -H "Authorization: Bearer test-token" http://localhost:4000/overview | jq '.success'  # Should return true
   ```

### Pre-commit Validation
Always run before committing:
```bash
npm test                      # Must pass
npx biome check              # Will show formatting issues - this is expected
npm run build:packages       # Must succeed without errors
npm run data:validate        # Must validate canonical data
```

## Common Issues and Solutions

### Build Failures
- **"DUCKDB_DATABASE_PATH must be set"**: Always export `DUCKDB_DATABASE_PATH="./mrtdown.duckdb"` before running build commands
- **Database generation hangs**: Wait at least 300 seconds - this is normal for complex data processing

### API Server Issues  
- **"API_TOKENS must be set"**: Export `API_TOKENS="test-token"` before starting server
- **Server starts but no data**: Ensure database was built first with `npm run build`

### Linting Issues
- Biome shows 1000+ formatting issues - this is normal and doesn't break functionality
- Use `npx biome check --fix` to apply automatic fixes if needed

## Key Directory Structure

```
├── src/                      # Source code
│   ├── api/                  # Hono API framework routes
│   ├── db/                   # Database operations and generation
│   ├── helpers/              # Utility functions
│   ├── model/                # Data models
│   └── schema/               # Zod validation schemas
├── data/
│   ├── station/              # Canonical static station entities
│   ├── line/                 # Canonical line entities
│   ├── service/              # Canonical service entities
│   ├── operator/             # Canonical operator entities
│   ├── town/                 # Canonical town entities
│   ├── landmark/             # Canonical landmark entities
│   └── issue/                # Canonical issue bundles
├── dist/                     # Built TypeScript (gitignored)
├── mrtdown.duckdb           # Generated database (gitignored)
└── .github/workflows/        # CI/CD pipelines
```

## Architecture Notes

### Database Architecture
- **Single DuckDB file** (`mrtdown.duckdb`) with normalized relational schema  
- **Canonical data**: target-layout files in `/data/{station,line,service,operator,town,landmark,issue}`
- **Legacy runtime**: DuckDB/API cleanup is a later data-overhaul split
- **Complex analytics**: Extensive use of CTEs for uptime calculations

### Core Data Models
- **Lines**: MRT/LRT lines (NSL, EWL, CCL, etc.) with service schedules
- **Issues**: Disruptions, maintenance, infrastructure problems with time intervals  
- **Stations**: Station information with multi-language support
- **Time-aware**: All operations handle Singapore timezone (`Asia/Singapore`)

### API Structure
All endpoints in `/src/api/routes/` require Bearer token authentication except `/docs`:
- `/overview` - System-wide status and line summaries
- `/lines` - Individual line profiles with detailed uptime metrics  
- `/issues` - Issue details and historical data
- `/stations` - Station-specific information
- `/analytics` - Statistical analysis endpoints

## Development Workflow

1. **Always set environment variables first:**
   ```bash
   export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
   export API_TOKENS="test-token"
   ```

2. **For new features:**
   ```bash
   npm run build:packages       # Ensure target packages build
   npm run data:validate        # Validate canonical data
   npm test                    # Verify existing tests pass
   # Make your changes
   npm run build:packages      # NEVER CANCEL - wait for completion
   npm run data:validate
   npm test                    # Verify tests still pass
   npm run api:dev             # Test API functionality
   ```

3. **Before committing:**
   ```bash
   npm test                    # Must pass
   npm run build:packages      # Must complete successfully
   npm run data:validate       # Must validate canonical data
   npx biome check             # Check for issues (many formatting warnings are normal)
   ```

Remember: This system processes complex MRT operational data - always validate that the API returns real transportation data after making changes.
