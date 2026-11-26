# GTFS

## Inspect a capture

- [Local inspection](operations/local-inspection.md) explains how to verify a
  capture, inspect schedule and realtime files, and look up departures.
- [Capture handoff](operations/public-handoff.md) explains crawler storage,
  inspection, and snapshot review. [Capture records](captures/README.md) link to
  the validation evidence for each captured ZIP hash.

## Review mappings and evidence

Use the [mapping review index](reviews/README.md) for reconciliation, service-date
and platform decisions, per-line pilot packets, and supporting audits. It
separates reusable review procedures from evidence for particular captures.

## Publish or recover a timetable

Start with [automatic publication](operations/automatic-publication.md) for
routine qualification, desired release definitions, deployment, and failure
handling. The reviewed [desired release](../../releases/README.md) lives in Git;
the standard [Pages export workflow](../operations/pages-exports.md) publishes it.

- [Publication policy](operations/schedule-publication.md) defines rights and
  attribution requirements.
- [Timetable release](operations/timetable-release.md) covers explicit approval,
  bundle verification, and packaging for manual releases and exceptions.
- [Release recipes](operations/release-recipes.md) covers compact reviewed inputs
  and exact replay using the archived generator.
- [Release retention](operations/release-retention.md) covers storage promotion,
  recovery and current/previous ready bundles.
- [Consumer import](operations/timetable-import.md) covers source lineage, retained
  versions, and reviewed rollback.

A capture review records what was observed. Publication requires the approvals
and checks in the release procedures.

## Timetable reference

- [Service-day timing](reference/service-day-timing.md) covers calendar rules,
  overnight events, and stop occurrence identity.
- Canonical matching is described in [trip patterns](reference/scheduled-trip-patterns.md),
  [trip bindings](reference/scheduled-trip-bindings.md), and [assignment validation](reference/trip-assignment-validation.md).
- File formats are described in [source timetable](reference/source-timetable.md),
  [assigned timetable](reference/assigned-timetable.md), and [artifact files](reference/timetable-artifact.md).
- Queries are described in [departure windows](reference/scheduled-departure-windows.md)
  and [retained departures](reference/retained-departures.md).

## Find ongoing work

The [realtime plan](../plans/active/gtfs-static-realtime.md) tracks service-alert
ingestion and trip-update observations. The [plan index](../plans/README.md)
links release adoption and [completed static work](../plans/completed/gtfs-static-schedules.md).
