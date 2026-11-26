# Maintain published first and last train timings

Completed implementation record. The optional coverage and GTFS cross-check
decision is tracked in [tech debt](../tech-debt.md#station-timing-coverage).
Current source and maintenance policy lives in the
[data guide](../../data/overview.md#first-and-last-train-timings).

## Purpose

Keep official first and last train timings available by station and service
pattern for passenger display and frequency-based estimates.

## Progress

- [x] (2026-06-09) Add optional timing records and validation in
  [PR #298](https://github.com/foldaway/mrtdown-data/pull/298).
- [x] (2026-07-16) Backfill operating hours and add estimated departures in
  [PR #347](https://github.com/foldaway/mrtdown-data/pull/347).
- [x] (2026-11-26) Separate the shipped timing data from the optional coverage
  and GTFS cross-check follow-up, now tracked in tech debt.

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
Exact schedules are documented in the [GTFS guides](../../gtfs/README.md).

## Context

The [station schema](../../../packages/core/src/schema/Station.ts) owns the field
definitions. The [data guide](../../data/overview.md#first-and-last-train-timings)
owns timing source policy and service-pattern conventions.

## Plan of Work

The optional coverage investigation is deferred. It does not block the timing
records or frequency helper already delivered. Start with the tech debt entry
if a consumer establishes a need.

## Validation and Acceptance

From the repository root, run `npm run data:validate` and `npm test` for timing
changes. Check that each affected station resolves to the intended stopping
pattern and that the timing matches the official table. If coverage metadata is
added, build with `npm run pages:build` and verify it matches the station records
in the archive.
