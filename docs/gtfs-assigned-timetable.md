# Compact assigned timetable preview

`gtfs timetable` can include supplied canonical assignments in a local preview:

```sh
npm run build:cli
node packages/cli/dist/index.js --data-dir /path/to/pinned/data gtfs timetable \
  --file /path/to/schedule.zip --capture /path/to/capture.json \
  --assignments /path/to/assignments.json --canonical-commit <full-commit> \
  --write /tmp/assigned-timetable.json
```

The assignment and commit options must be supplied together. The caller supplies
the exact canonical data tree for that commit. Before assembly, the command uses
the [combined assignment checks](gtfs-trip-assignment-validation.md#check-a-verified-local-capture)
to verify the capture, raw-table manifest, canonical commit and topology, and
every supplied assignment. Source occurrences, active dates, canonical paths,
platform alternatives and route/operator periods must all pass. Invalid inputs
fail before writing, preserving any existing output.

Without these options, the existing [source timetable](gtfs-source-timetable.md)
report and hash are unchanged. `@mrtdown/fs` exposes the same operation as
`inspectGtfsTimetable(file, captureFile, { dataDir, canonicalCommit, assignments })`.

## Content format

`@mrtdown/core` exports `ScheduledAssignedTimetableSchema` and the inferred
`ScheduledAssignedTimetable` type. The content contains:

- `schemaVersion: 1`;
- `timetable`: the complete source timetable with shared calendars and every trip;
- `patterns`: `{ id, pattern }` records containing canonical line, service,
  revision, destination and ordered station/platform occurrences; and
- `assignments`: `{ providerTripId, patternId, dateRanges }` records.

Each date range has inclusive ISO `startDate` and `endDate` values. It restricts
an assignment; the trip's source calendar still determines whether a service
date is active. A range never activates service on an inactive calendar date.
Source stop times join to canonical pattern stops by occurrence index, retaining
repeated visits, literal source IDs and sequences, access rules, precision and
times beyond 24:00. No absolute departure instants are stored.

Pattern IDs and source trip IDs must be unique in their definitions. Assignment
references must resolve and source/canonical occurrence counts must agree.
Ranges for a trip cannot overlap, including across different patterns. Nested
source and pattern validation applies; unknown fields are rejected. Empty
allocation arrays and unassigned source trips are valid content, so this schema
alone cannot establish completeness or mapping approval.

The assembler stores each distinct normalized pattern once, naming it by the
SHA-256 of its JSON. It groups scopes by literal source trip and pattern, merging
consecutive assigned dates in the source calendar. Ranges may span inactive
calendar days but never cross an unassigned active date. Patterns sort by hash;
allocations sort by source trip
and pattern hash; ranges sort by date. The same normalized input produces
identical content even if scopes or dates are reordered. Inputs are unchanged.

## Preview report and publication boundary

The compact JSON report has `documentKind: "gtfs-assigned-timetable"`,
`reportVersion: 1`, the original `capture`, verified reconciliation `identity`,
`assignmentsSha256`, `timetable`, `timetableSha256`, complete assignment `coverage`
and `generationEligible: false`. Hashes cover UTF-8 JSON without a trailing
newline. The assignment hash covers the validated array in supplied order;
the timetable hash covers the normalized compact content independently.

Every source trip and calendar remains in the content. Missing trip/date
assignments remain explicit in the [coverage report](gtfs-trip-assignment-validation.md#report-unassigned-source-dates);
they are not filled or silently discarded. The report can be incomplete and
unapproved, and pending-review captures remain valid for private inspection.

The [artifact file helpers](gtfs-timetable-artifact.md) can wrap this content with
provenance, correction metadata and an attribution notice. This preview does not
approve mappings, confirm capture-specific release conditions, publish to Pages
or enable a site import. Those steps must
apply the [publication policy](gtfs-schedule-publication.md). Keep generated
previews outside canonical `data/` and Git.

Against the [verified October assignments](gtfs-trip-assignment-validation.md),
the preview retains all 19,150 source trips, three calendars and 349,768 stop
occurrences with the existing source-timetable digest. Its 86 shared patterns
and 12,106 ranges reproduce exactly 1,502,097 assigned trip/date pairs when
intersected with the source calendars. The same 990,143 active pairs remain
unassigned. Pattern/allocation JSON uses 2,312,526 bytes compared with 44,345,747
bytes for the normalized assignment input; source timing is retained separately
within the bundle. The compact content SHA-256 is
`e2fc66e75994c04f93d54dec55bd711d9cf5d170f1698b5ab730ab15e89c1d3c`.
