# mrtdown-data - GitHub Copilot Instructions

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

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

**Bootstrap and build the repository:**
```bash
npm install                    # ~8 seconds
export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
npm run build                  # ~6.4 seconds - NEVER CANCEL. Set timeout to 300+ seconds.
```

**Run tests:**
```bash
npm test                       # ~1.3 seconds - very fast
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
export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
npm run generate-products     # ~4.7 seconds - generates API-ready JSON files
npm run db:generate           # Regenerates DuckDB database (auto-runs after build)
```

### Critical Timeout Settings
- **npm run build**: MINIMUM 300 seconds timeout (includes TypeScript compilation + database generation)
- **npm test**: 60 seconds timeout
- **npm run generate-products**: 180 seconds timeout
- **npx biome check**: 60 seconds timeout

## Validation

### Manual Validation Requirements
**Always run these validation scenarios after making changes:**

1. **Database Generation Test:**
   ```bash
   export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
   npm run build
   # Verify mrtdown.duckdb file is created (should be ~15MB)
   ls -la mrtdown.duckdb
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
   export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
   npm run build
   npm test
   npm run generate-products
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
export DUCKDB_DATABASE_PATH="./mrtdown.duckdb"
npm run build                # Must succeed without errors
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
│   ├── source/               # Raw JSON data files
│   └── product/              # Generated API-ready JSON
├── dist/                     # Built TypeScript (gitignored)
├── mrtdown.duckdb           # Generated database (gitignored)
└── .github/workflows/        # CI/CD pipelines
```

## Architecture Notes

### Database Architecture
- **Single DuckDB file** (`mrtdown.duckdb`) with normalized relational schema  
- **Source data**: JSON files in `/data/source/` (lines, issues)
- **Generated products**: API-ready JSON in `/data/product/`
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
   npm run build                # Ensure clean build
   npm test                    # Verify existing tests pass
   # Make your changes
   npm run build               # NEVER CANCEL - wait for completion
   npm test                    # Verify tests still pass
   npm run api:dev             # Test API functionality
   ```

3. **Before committing:**
   ```bash
   npm test                    # Must pass
   npm run build               # Must complete successfully
   npx biome check             # Check for issues (many formatting warnings are normal)
   ```

Remember: This system processes complex MRT operational data - always validate that the API returns real transportation data after making changes.