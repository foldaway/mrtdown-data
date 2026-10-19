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

The separate [canonical trip-pattern contract](gtfs-scheduled-trip-patterns.md)
defines identity references and checks them against canonical topology. Binding
those patterns to source trips and service dates still requires reviewed mappings.

## Verified local export

```sh
npm run build:cli
node packages/cli/dist/index.js gtfs timetable \
  --file /absolute/path/schedule.zip \
  --capture /absolute/path/capture.json \
  --write /tmp/source-timetable.json
```

The command verifies the capture's source endpoint, byte count and SHA-256 before
parsing the schedule and assembling the complete timetable. It accepts only a
schedule capture. Omit `--write` to print the same compact JSON to stdout; a saved
file ends with one newline. Invalid arguments, capture failures and invalid
schedules fail before output writing, leaving an existing output file untouched.

The report contains `reportVersion: 1`,
`documentKind: "gtfs-source-timetable"`, the original `capture`, raw-table hash
`manifest`, validated `timetable`, `timetableSha256` and
`generationEligible: false`. The timetable hash covers UTF-8
`JSON.stringify(report.timetable)` without a trailing newline. It excludes
capture metadata and table hashes: reordered source rows can produce the same
normalized timetable while the archive and raw-table hashes still identify the
distinct source bytes. Repeating the export with the same archive and capture
record produces byte-identical reports.

`@mrtdown/fs` exposes the same read-only operation as
`inspectGtfsTimetable(file, captureFile)`. It returns the report without writing
files or fetching the archive reference. Pending-review captures are permitted
for local inspection, with their attribution and rights metadata retained as
supplied. The export does not grant publication rights or approve canonical
mappings. Keep these generated files outside canonical `data/` and Git.

For a compact preview that also includes supplied canonical allocations, use
the optional assignment inputs described in the
[assigned timetable format](gtfs-assigned-timetable.md). The source-only report
above remains the default.

A read-only check against verified October source
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
assembled all 19,150 trips, three calendars and 349,768 occurrences. The trip
timing digest matches the prior standalone assembler check. Reversing all source
rows produced identical output, with source tables unchanged. Serializing the
complete result using `JSON.stringify` without a trailing newline gives SHA-256
`20d37fad21a1ff5a655f168cc57595b8dad8beb08f98f1ecf49fa3bb6d95273d`.
Two verified CLI exports of this retained capture also produced byte-identical
reports with that timetable hash, preserving the archive and capture record.
