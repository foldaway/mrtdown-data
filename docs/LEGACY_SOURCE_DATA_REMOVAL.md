# Legacy Source Data Removal Report

This report covers the Step 7.5 split from `docs/DATA_OVERHAUL_SPLIT.md`.

## Scope

- Removed the legacy `data/source/` tree after static canonical data and issue
  bundles were present in the target layout.
- Updated documentation and validation workflow references that still treated
  legacy source data as current.
- Kept runtime/API/DuckDB cleanup out of this split. Legacy runtime code that
  still references the removed source layout belongs to Step 8.

## Coverage Check

Before removal:

- Legacy source issue files: 758
- Target issue bundles: 758

After removal, canonical target data validates with:

```sh
npm run data:validate
```

Expected checked counts:

```json
{
  "station": 230,
  "line": 11,
  "service": 34,
  "operator": 3,
  "town": 46,
  "landmark": 397,
  "issue": 758
}
```

Fixture data still validates separately with:

```sh
npm run fixtures:validate
```
