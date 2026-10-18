# Validate supplied trip assignments together

`@mrtdown/fs` exports `ScheduledTripPatternAssignmentSchema`, its inferred
`ScheduledTripPatternAssignment` type and
`validateScheduledTripPatternAssignments(tables, assignments, topology)`.
Each assignment pairs a `scope` from
[service-date bindings](gtfs-scheduled-trip-bindings.md#service-date-scopes) with
an explicit `routeMapping` from
[route/operator checks](gtfs-scheduled-trip-patterns.md#source-route-and-operator-periods).
Unknown fields are rejected.

The validator reads all source timing and calendars from the same supplied GTFS
tables. It assembles the [source timetable](gtfs-source-timetable.md) once for the
batch, including validation of unused calendars, then groups assignments by literal
source trip ID. For every trip, the existing date resolver checks all source
occurrences and active calendar dates together. Scopes cannot overlap on any date,
even when their proposed canonical patterns are identical. Different trips may use
the same dates.

Every assignment must then pass the existing checks for:

- canonical references, ordered paths and revision/station-code periods;
- source stop codes, station parents and complete platform alternatives;
- source pickup rules against every platform's current boarding status; and
- explicit source route/agency aliases and canonical line operator periods.

These checks use one source table set and one canonical topology. A valid source
binding cannot hide an invalid canonical assignment, and one passing platform or
date cannot waive another's failure. A failure throws before any result returns.
The validator preserves the [existing boarding and terminal rules](gtfs-scheduled-trip-patterns.md#current-platform-boarding-checks).

The returned array preserves assignment order, with normalized service dates and
platform sets. Inputs, source tables and canonical topology are unchanged. Trip
timing and pickup/drop-off rules remain in the source timetable, including GTFS
offsets beyond midnight; they are checked without expanding every dated departure.

This is validation of supplied assignments, not whole-snapshot coverage. Omitted
trips and service dates are not allocated or silently filled. Capture identity,
canonical commit/fingerprint, source semantics, historical platform allocation,
human mapping approval, licensing and publication remain separate gates. The
validator creates no approval or eligibility metadata and is not called by a query,
generator or publication path.

A read-only check uses the verified October capture and the version-3 proposal
draft's [pinned canonical topology](gtfs-platform-group-review.md#october-snapshot-proposals).
All 2,781 proposed NEL/CCL trip assignments pass, covering 291,967 supplied trip/date
pairs. The full proposal set still fails at the recorded Marina Bay parent-code
period gap. Source tables, canonical topology and reconciliation output remain
unchanged; passing this check creates no human approval or published artifact.
