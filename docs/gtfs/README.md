# GTFS

## Operations

- [Local inspection](operations/local-inspection.md) explains how to verify a
  capture, inspect schedule and realtime files, and look up departures.
- [Capture handoff](operations/public-handoff.md) explains crawler storage,
  inspection, and snapshot review. [Capture records](captures/README.md) link to
  the validation evidence for each captured ZIP hash.
- [Schedule publication policy](operations/schedule-publication.md) defines rights
  and attribution requirements.
- [Timetable release](operations/timetable-release.md) covers approval, packaging,
  and Pages deployment for [combined releases](operations/timetable-release.md#packaging-an-approved-combined-release-for-pages)
  and [legacy releases](operations/timetable-release.md#packaging-a-release-for-pages).
- [Consumer import](operations/timetable-import.md) covers source lineage, retained
  versions, and reviewed rollback.

## Mapping and evidence

Use the [mapping review index](reviews/README.md) for reconciliation, service-date
and platform decisions, per-line pilot packets, and supporting audits. A capture
review records what was observed. The release procedure describes the approvals
required to publish a timetable.

## Timetable reference

- Source fields and time semantics are in [stop times](reference/scheduled-stop-times.md),
  [calendars](reference/service-calendars.md), [service day instants](reference/service-day-instants.md),
  [trip timing](reference/scheduled-trip-times.md), and [service date resolution](reference/scheduled-trip-service-dates.md).
- Canonical matching is described in [trip patterns](reference/scheduled-trip-patterns.md),
  [trip bindings](reference/scheduled-trip-bindings.md), and [assignment validation](reference/trip-assignment-validation.md).
- File formats are described in [source timetable](reference/source-timetable.md),
  [assigned timetable](reference/assigned-timetable.md), and [artifact files](reference/timetable-artifact.md).
- Queries are described in [departure windows](reference/scheduled-departure-windows.md)
  and [retained departures](reference/retained-departures.md).

The [GTFS execution plan](../plans/active/gtfs-static-realtime.md) tracks
remaining schedule and realtime work.
