# Maintain published first and last train timings

## Purpose

Keep official first and last train timings available by station and service
pattern for passenger display and frequency-based estimates.

## Progress

- [x] (2026-06-09) Add optional timing records and validation in
  [PR #298](https://github.com/foldaway/mrtdown-data/pull/298).
- [x] (2026-07-16) Backfill operating hours and add estimated departures in
  [PR #347](https://github.com/foldaway/mrtdown-data/pull/347).
- [ ] Decide whether consumers need a timing coverage report or Pages index,
  and whether these timings have a validation role alongside exact LTA GTFS.

## Surprises & Discoveries

The exit dataset has no service-to-platform assignments. Timing references
validate against service paths independently of station layouts. See
[repository validation](../../../packages/fs/src/validate.ts).

## Decision Log

- **2026-06-09** — Reference the full stopping pattern by `serviceId` so its
  path defines direction and destination. Use a separate service for a
  recurring short working that ends before the usual terminal.

## Outcomes & Retrospective

The timing records are available in canonical station data and feed the
[frequency-based departure helper](../../../packages/core/src/helpers/generateEstimatedStationFrequencySchedules.ts).
See [Caldecott](../../../data/station/CDT.json) for SMRT examples and
[Little India](../../../data/station/LTI.json) for SBS Transit examples.
The [GTFS plan](gtfs-static-realtime.md) tracks exact schedules separately.

## Context

Use the [station schema](../../../packages/core/src/schema/Station.ts) for
field definitions and calendar categories. Store local Singapore clock times
as published, including after-midnight values such as `00:25`. Derive service-day
offsets at the timetable boundary if a downstream use needs them.

### Source policy

Use official passenger timing tables from the operator or agency. When official
sources differ, prefer the table that directly describes the operator's service.
Use third-party sites only to cross-check the reviewed values. Document a stable
source contract and maintenance process before introducing automated imports.

Record recurring published timings here, including recurring holiday categories
where applicable. Record one-off early closures, late openings, and extensions
as issue evidence.

## Plan of Work

1. Check how the site and other Pages consumers discover `firstLastTrain` today.
   Add coverage metadata only if a concrete consumer needs it to find records.
2. Decide whether a coverage report or cross-check against reviewed GTFS would
   catch meaningful gaps. If needed, define the evidence and service-date rules
   for the cross-check before implementing it.

## Validation and Acceptance

From the repository root, run `npm run data:validate` and `npm test` for timing
changes. Check that each affected station resolves to the intended stopping
pattern and that the timing matches the official table. If coverage metadata is
added, build with `npm run pages:build` and verify it matches the station records
in the archive.
