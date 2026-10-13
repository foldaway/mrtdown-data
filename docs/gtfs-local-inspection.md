# Local GTFS inspection

The crawler retains original LTA files and capture JSON in private R2. This
repository now consumes manually materialized copies without credentials or
network requests. Canonical entities are unchanged by inspection.

## Commands

```sh
npm run build:cli
node packages/cli/dist/index.js gtfs inspect \
  --file /absolute/path/gtfs_schedule.zip \
  --capture /absolute/path/capture.json \
  --write /tmp/schedule-report.json
node packages/cli/dist/index.js gtfs inspect \
  --file /absolute/path/gtfs_realtime.pb \
  --capture /absolute/path/alert-capture.json
node packages/cli/dist/index.js --data-dir data gtfs topology
```

Download an original object and its matching successful capture record from R2
outside this build. Keep raw captures and generated reports outside canonical
`data/` and Git until their retention terms are reviewed. The inspector never
resolves the archive reference or fetches a URL.

## Checks and reports

Capture schema v1 matches the crawler: kind, source endpoint, retrieval time,
byte count, SHA-256, archive reference, attribution and pending rights review.
File bytes must match both count and digest before parsing. Source endpoint must
match the declared kind. Capture metadata is preserved as supplied; inspection
does not grant publication rights.

Schedule input is a ZIP containing root-level GTFS CSV tables, with a 256 MiB
expanded limit. Reports include per-file hashes, counts, feed metadata,
calendars/exceptions, station/platform/entrance counts and normalized trip
patterns. Built-in checks cover required tables/columns, duplicate primary IDs,
parent/route/calendar/trip/stop references, stop sequences, basic calendar values,
time syntax and progression, and pickup/drop-off/timepoint enums. CSV quoting
and GTFS times past 24:00 are preserved. Input stop-time rows need not be sorted;
stop occurrences are ordered by stop_sequence, including repeated stop IDs.

Built-in findings are not a complete GTFS standards validator. A separate pinned
independent validator is still required by Phase 1 of the plan. In particular,
complete calendar/date, coordinate, route-type, optional-table and interpolation
rules are not covered by this initial inspector. An invalid report exits 1,
including when the report is saved with --write.

Realtime input is decoded using MobilityData's protobuf bindings. Only GTFS 2.0
FULL_DATASET is accepted. IDs must be unique and entities must match the declared
feed kind. Valid zero-entity files are accepted. Original selectors, source text,
translations and open active periods remain in the decoded report; no canonical
scope or resolution is inferred. Provider timestamps are reported as decimal
seconds strings separately from capture retrieval time, preserving integer
precision and distinguishing an omitted timestamp from zero. Reports do not
claim a live-feed freshness guarantee.

The topology fingerprint hashes projection v1 from the GTFS plan. It includes
identity, effective station codes, platforms and ordered service revisions,
excluding editorial/geographic changes. It is separate from a canonical commit
and full-record manifest; future reviewed mappings must record all three.

## Current implementation boundary

Synthetic tests exercise the pipeline without retaining licensed LTA fixtures.
The historical captures have not been run through this implementation yet.
Unpacked-directory input, pinned independent validation, reviewed mappings,
second-capture drift checks, scheduled-arrivals generation/publication and alert
writes remain future phases. No network calls, model calls or canonical writes
are performed by these commands.
