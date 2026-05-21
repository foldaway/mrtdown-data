# Runtime Removal and Deploy Cleanup

This report covers the Step 8 split from `docs/DATA_OVERHAUL_SPLIT.md`.

## Scope

- Removed the legacy Hono API entry point and route/query/schema tree.
- Removed the legacy DuckDB generator, database connection code, and runtime
  models.
- Removed the legacy Dockerfile and Fly app configuration from this repository.
- Retargeted root build and typecheck commands to the target package build.
- Kept GitHub Pages publishing and target-layout webhook ingestion active.

## Notes

- Runtime serving now belongs in `mrtdown-site` or another reviewed downstream
  serving target.
- `npm run ingest:webhook` continues to use the target-layout
  `@mrtdown/triage` script.
- `npm run pages:build` remains the static data publication boundary for this
  repository.
