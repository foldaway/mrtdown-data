# Local GTFS inspection

The crawler retains original LTA files and capture JSON in private Tigris. This
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

Download an original object and its matching successful capture record from private object storage
outside this build. Keep raw captures and generated reports outside canonical
`data/` and Git until their retention terms are reviewed. The inspector never
resolves the archive reference or fetches a URL.

## Checks and reports

Capture schema v1 matches the crawler: kind, source endpoint, retrieval time,
byte count, SHA-256, archive reference, attribution and publication rights status.
Both original pending-review and public redistribution-permitted records validate.
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

Built-in findings are not a complete GTFS standards validator. The pinned independent
validator below complements these checks. In particular,
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
The historical August captures have not been run through this implementation yet.
Unpacked-directory inspector input, reviewed mappings,
second-capture drift checks, scheduled-arrivals generation/publication and alert
writes remain future phases. No network calls, model calls or canonical writes
are performed by these commands.

See [public snapshot handoff](gtfs-public-handoff.md) for the separate acquisition
step and GitHub schedule-inspection workflow.

## Independent schedule validation

[MobilityData Canonical GTFS Validator 8.0.1](https://github.com/MobilityData/gtfs-validator/releases/tag/v8.0.1)
is pinned in `scripts/gtfs-validator-lock.json`, including the release JAR SHA-256,
Java major version and complete fixed arguments. Acquire the JAR from the lock's
URL separately, then run with Java 17:

```sh
node scripts/validate-gtfs-independent.mjs \
  /absolute/path/gtfs-validator-8.0.1-cli.jar \
  /absolute/path/schedule.zip /tmp/new-independent-report
```

The wrapper verifies the executable digest before running, refuses existing output
directories, and records the lock digest, input hash/size, Java version, invocation
and process status in `invocation.json`. Validation uses country SG, one thread,
a fixed date of 2026-10-14, and disables the update check. After acquisition this
command uses local inputs. Upgrades or a changed validation date require a new
lock and separately identified audit; preserve previous findings.

Review `report.json` and `system_errors.json` separately from the MRTDown report.
The wrapper fails for ERROR notices or system errors; warnings remain findings.
A zero-error result does not establish reviewed canonical mapping coverage. The
receiver uploads both report sets and execution provenance even on failure.
Upstream report timing, paths and memory metrics vary; reproducibility applies to
findings with identical inputs/configuration, not byte-identical upstream reports.

The verified public schedule `e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes) was audited on 2026-10-14: 113 routes, 1,211 stops, 19,150 trips
and 349,768 stop times. Built-in inspection found zero errors. Independent
validation found zero ERROR notices and zero system errors, with these findings:

| Code | Severity | Count |
| --- | --- | ---: |
| duplicate_route_name | WARNING | 103 |
| mixed_case_recommended_field | WARNING | 13 |
| missing_feed_contact_email_and_url | WARNING | 1 |
| feed_valid_beyond_total_service_window | INFO | 1 |

This capture differs from the historical August capture. The initial route mapping
in the plan is historical guidance and needs fresh review against these 113 routes.
The aggregate audit and lock digest are recorded in `docs/gtfs-independent-audit.json`.
Full generated reports remain outside Git; their immutable input is the public
capture/blob pair recorded in the handoff documentation.
