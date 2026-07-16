# Plans

Durable execution plans and migration reports live here. Keep `AGENTS.md` as
the short entry point, then link from there to the relevant active or completed
plan.

## Active

- [Direct-to-main ingestion reliability](active/direct-main-ingestion.md):
  historical replay, semantic guards, canonical issue audits, shadow mode, and
  staged removal of the automated ingestion PR queue.
- [GTFS static and realtime support](active/gtfs-static-realtime.md):
  deterministic GTFS Static export, Pages publication, and GTFS Realtime
  evidence ingest boundaries.
- [Data licensing and attribution](active/data-licensing-attribution.md):
  source registry, evidence rights classification, and generated attribution
  artifacts for data publication.
- [Schematic system map generation](active/schematic-system-map.md): canonical
  schematic map generator, rule schema, validation, and publication.
- [Station first and last train data](active/station-first-last-train-data.md):
  embedded station timing data keyed by full scheduled service patterns.
- [Station layout data](active/station-layout-data.md): embedded current-state
  station layout, platform, door-anchor, and transfer path data.

## Completed

- [Crowdsourced reports canonical ingest](completed/crowdsourced-reports.md):
  public report payload contract and canonical evidence ingestion path.
- [Data overhaul split](completed/data-overhaul-split.md): historical split
  sequence for the package/data repository migration.
- [Ingest contracts package](completed/ingest-contracts-package.md): shared
  webhook payload contract for external evidence producers.
- [Issue data migration](completed/issue-data-migration.md): Step 7 issue data
  migration report.
- [Legacy source data removal](completed/legacy-source-data-removal.md): Step
  7.5 source-data removal report.
- [Runtime removal and deploy cleanup](completed/runtime-removal-deploy-cleanup.md):
  Step 8 runtime and deploy cleanup report.

## Tech Debt

- [Tech debt](tech-debt.md): durable follow-up items that are too broad for a
  single issue or PR.
