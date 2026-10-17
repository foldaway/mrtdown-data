# Compact source timetable

`@mrtdown/core` exports `ScheduledTimetableSchema` and its inferred
`ScheduledTimetable` type. It combines source calendars and complete trip timing
into one validated content document:

- `schemaVersion: 1` and `timeZone: "Asia/Singapore"`;
- a nonempty `calendars` array of
  [source calendar rules](gtfs-service-calendars.md), without expanding dates;
- a nonempty `trips` array of
  [ordered source-trip timing](gtfs-scheduled-trip-times.md).

Calendar IDs and trip IDs must each be unique. Every trip must reference a
calendar in the document. IDs are case-sensitive source text; calendars may be
shared by multiple trips, and unused calendars remain valid. Nested calendar,
occurrence identity, chronology, precision and access validation still apply.
The schema validates the supplied trip and calendar order; it does not reorder
those arrays. Calendar exceptions retain their existing date normalization.

`@mrtdown/fs` exports `scheduledTimetableFromGtfs(tables)` for parsed GTFS tables.
It assembles every source trip and every declared calendar, including calendars
defined solely by exceptions and unused definitions. Invalid unused calendars
fail rather than disappearing. Existing structural, reference and fixed-stop
timing checks apply. Every agency must declare `Asia/Singapore`; absent agencies,
other timezones and nonempty `frequencies.txt` fail because this format cannot
represent their timing semantics.

The assembler sorts calendars and trips by their literal provider IDs using
code-point order. Occurrences sort by exact decimal sequence, preserving raw
sequence text and repeated visits. Reordering source table rows produces the
same serialized content without modifying the source tables. Arrays of service
dates or absolute departure instants are not stored; consumers can use the
existing service-date and window helpers when querying.

This is the source timing portion of the planned arrivals format. It does not
contain every GTFS field, canonical station/service/platform/destination
allocations, capture provenance, attribution or mapping approval. The caller
must verify the retained capture before assembly and bind this content to that
provenance when constructing a surrounding artifact. Passing this schema does
not establish source correctness, reviewed mapping coverage or publication
eligibility. No generation or Pages publication path calls the assembler.

A read-only check against verified October source
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
assembled all 19,150 trips, three calendars and 349,768 occurrences. The trip
timing digest matches the prior standalone assembler check. Reversing all source
rows produced identical output, with source tables unchanged. Serializing the
complete result using `JSON.stringify` without a trailing newline gives SHA-256
`20d37fad21a1ff5a655f168cc57595b8dad8beb08f98f1ecf49fa3bb6d95273d`.
