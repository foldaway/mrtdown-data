# Issue Data Migration Report

This report covers the Step 7 split from
`docs/plans/completed/data-overhaul-split.md`.

## Scope

- Migrated legacy `data/source/issue/*.json` records into the target
  `data/issue/YYYY/MM/<issue_id>/` layout.
- Removed `data/source/` in the follow-up Step 7.5 split after validating that
  target issue coverage matched the legacy source set. See
  `docs/plans/completed/legacy-source-data-removal.md`.
- Did not change runtime, API, DuckDB, deploy, or package publishing surfaces.

## Source Coverage

- Legacy source issue files: 758
- Target issue bundles: 758
- Target evidence rows: 3,469
- Target impact rows: 11,493
- Missing source IDs after migration: 0
- Extra target IDs after migration: 0

## Extraction Notes

- Started from the issue bundles already extracted on `duncanleo/data-overhaul`.
- Added 14 source records that were present on current `main` but absent from
  the extracted branch dataset.
- Normalized three legacy issue IDs with uppercase slug fragments to the target
  lowercase ID format:
  - `2015-03-27-EWL-train-fault` -> `2015-03-27-ewl-train-fault`
  - `2016-06-16-slight-delay-HBF-BNV-train-fault` ->
    `2016-06-16-slight-delay-hbf-bnv-train-fault`
  - `2017-01-13-track-fault-NSL` -> `2017-01-13-track-fault-nsl`
- Replaced 17 descriptive evidence IDs in recent extracted records with
  schema-compliant `ev_<ULID>`-shaped IDs, then updated the 62 matching
  `basis.evidenceId` impact references.

## Validation

Validated the full target data root with:

```sh
node packages/cli/dist/index.js validate
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
