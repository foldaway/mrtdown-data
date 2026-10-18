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
node packages/cli/dist/index.js gtfs inspect \
  --directory /absolute/path/gtfs_schedule \
  --manifest docs/gtfs-historical-schedule-manifest.json \
  --write /tmp/historical-schedule-report.json
node packages/cli/dist/index.js --data-dir data gtfs topology
node packages/cli/dist/index.js gtfs timetable \
  --file /absolute/path/gtfs_schedule.zip \
  --capture /absolute/path/capture.json \
  --write /tmp/source-timetable.json
node packages/cli/dist/index.js gtfs departures \
  --file /absolute/path/gtfs_schedule.zip \
  --capture /absolute/path/capture.json \
  --trip provider-trip-id \
  --service-date 2026-01-01 --service-date 2026-01-02 \
  --from 2026-01-02T00:00:00+08:00 --to 2026-01-02T02:00:00+08:00 \
  --write /tmp/departures-report.json
```

Download an original object and its matching successful capture record from private object storage
outside this build. Keep raw captures and generated reports outside canonical
`data/` and Git until their retention terms are reviewed. The inspector never
resolves the archive reference or fetches a URL.

## Checks and reports

Use [`gtfs validate-assignments`](gtfs-trip-assignment-validation.md#check-a-verified-local-capture)
to check supplied canonical trip assignments against the verified source capture
and its pinned canonical topology.

Capture schema v1 matches the crawler: kind, source endpoint, retrieval time,
byte count, SHA-256, archive reference, attribution and publication rights status.
Both original pending-review and public redistribution-permitted records validate.
File bytes must match both count and digest before parsing. Source endpoint must
match the declared kind. Capture metadata is preserved as supplied; inspection
does not grant publication rights.

Schedule input is a ZIP or an unpacked directory containing root-level GTFS CSV
tables, with a 256 MiB expanded limit. Directory input requires `--manifest`:
a JSON object mapping every table filename to its previously recorded SHA-256.
The directory must contain exactly that file set; symlinks, subdirectories and
non-table filenames are rejected. Hash verification precedes CSV parsing. Directory
reports record the total byte length and SHA-256 of the sorted compact JSON table
manifest as `input.manifestSha256`, independently of the manifest file's whitespace.
They do not invent a ZIP digest or crawler capture receipt. Both inputs use the
same CSV parser and structural audit. Reports include per-file hashes, counts, feed metadata,
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

## Timetable export

`gtfs timetable` exports all source trip timing and calendars from a verified
schedule ZIP. Its compact JSON contains capture provenance, raw-table hashes and
a separate normalized timetable hash. Invalid captures or schedules fail before
writing. See the [timetable contract and export format](gtfs-source-timetable.md#verified-local-export)
for the hash definition and complete contents. This local inspection output
retains `generationEligible: false`; canonical mappings and publication remain
subject to review.

## Departure lookup

`gtfs departures` inspects provider trips or stops in a verified schedule ZIP.
Use repeated `--trip` flags for specific trips, or repeated `--stop` flags to find
all trips visiting those provider stops. The two selectors are mutually exclusive.
Without `--service-date`, relevant dates are chosen from the window, source
calendars and maximum supplied departure offset at the selected trips or stops.
This includes earlier service dates for trains running after midnight or beyond
48 hours, without assuming that yesterday is the oldest possible date. Calendar
removals still apply to their own service dates. The report records the derived
dates and `query.serviceDateSelection: "automatic"`.

Use repeated `--service-date` flags to restrict the query to explicit dates;
each trip is checked against its calendar on every selected date. Explicit query
reports retain their existing shape. Values are literal IDs, so commas in a trip
ID are preserved. Window timestamps require UTC or an
explicit offset; the start is included and the end excluded.

The JSON report includes capture metadata, table hashes, the query and ordered
source departures. It preserves repeated visits, exact decimal stop sequences,
boarding restrictions and exact/approximate timing. Missing departure times stay
absent. Results follow the [departure-window rules](gtfs-scheduled-departure-windows.md).
Trip/date argument ordering does not change the report, and duplicate selections
fail. Stop argument order also leaves report bytes unchanged. Unknown trips and
stops fail rather than returning a misleading empty result.

Stop lookup includes only occurrences at the requested stop IDs, including repeat
visits on the same trip. A trip visiting several requested stops is selected once.
Only provider stops/platforms (`location_type` empty or `0`) are accepted; station
parents, entrances and other location types are rejected. A known unused platform
returns an empty list. This selects literal provider IDs without assigning a
canonical platform or splitting grouped provider stops into physical allocations.

For example, replace `--trip provider-trip-id` in the command above with
`--stop provider-stop-id` to inspect that stop across every source trip.

The full source schedule must pass the timing assembler before querying. Agency
timezones must be `Asia/Singapore`; selected trips described by `frequencies.txt`
are rejected because this lookup does not expand frequency-based schedules.
`@mrtdown/fs` exposes the same operation as
`inspectGtfsDepartures(file, captureFile, query)` for local tools.
Omit `query.serviceDates` for automatic selection; an explicitly empty list is
invalid. A known unused platform produces no derived dates or departures.

This is source evidence for inspection, with `generationEligible: false`.
It does not assign canonical stations/platforms, prove mapping coverage or clear
publication review. A successful query with no departures only describes the
selected trips or stops, dates and window. Failed queries leave an existing output report
untouched. Keep generated reports outside canonical `data/` and Git.

## Current implementation boundary

Synthetic tests exercise the pipeline without retaining licensed LTA fixtures.
The historical August captures have been hash-verified and audited as documented
below. Reviewed mappings, second-capture drift checks, scheduled-arrivals
generation/publication and alert writes remain gated future work. No network calls, model calls or canonical writes
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


## Historical August audit

On 2026-10-14, the eight tables in `/Users/duncanleo/Downloads/gtfs_schedule`
and the files `/Users/duncanleo/Downloads/gtfs_realtime.pb` and
`/Users/duncanleo/Downloads/gtfs_trip_update.pb` matched **every exact SHA-256**
recorded in the plan for the supplied 2026-08-13 captures. These are retained
local copies, not crawler acquisitions: the original ZIP, download receipt,
retrieval timestamp and immutable remote archive reference are unavailable.
Do not substitute the October public capture or fabricate that metadata.
An authorized maintainer needs these exact local files or another copy matching
[the table manifest](gtfs-historical-schedule-manifest.json) and protobuf hashes
in [the aggregate audit](gtfs-historical-audit.json).

Reproduce the full built-in reports offline in a fresh directory:

```sh
npm run build:fs
node scripts/audit-gtfs-historical.mjs \
  /absolute/path/gtfs_schedule \
  /absolute/path/gtfs_realtime.pb \
  /absolute/path/gtfs_trip_update.pb \
  /tmp/new-historical-audit
node scripts/validate-gtfs-independent.mjs \
  /absolute/path/gtfs-validator-8.0.1-cli.jar \
  /tmp/new-historical-audit/schedule-repacked.zip \
  /tmp/new-historical-independent
```

The script verifies the recorded inputs, preserves table bytes, and creates an
audit-only ZIP using the lockfile-installed `fflate`, level 9 and nominal ZIP
mtime 2000-01-01 00:00:00. Its digest is
`f9ed36a59d3d1fa6a729ded63119afdbaf52899d24f818e2bf4e9b7ada922fdb`
(2,381,717 bytes); this identifies the reproducible repack, **not the original
LTA archive**. The aggregate stores normalized manifest identity, full built-in
report digests, and the separate independent validator lock and findings.
Full reports and repack remain outside Git; no capture rights are inferred by
this script. The installed validator and Java 17 are acquired separately.

The schedule audit reproduced 19 routes, 1,211 stops, 17,576 trips, 333,262 stop
times, 116 normalized trip patterns and zero built-in structural errors.
MobilityData 8.0.1 with the existing fixed 2026-10-14 configuration found zero
ERROR notices and zero system errors:

| Code | Severity | Count |
| --- | --- | ---: |
| duplicate_route_name | WARNING | 9 |
| fast_travel_between_consecutive_stops | WARNING | 1 |
| missing_feed_contact_email_and_url | WARNING | 1 |
| mixed_case_recommended_field | WARNING | 3 |
| big_gap_in_service | INFO | 1 |
| feed_valid_beyond_total_service_window | INFO | 1 |

The fast-travel finding identifies trip `CCL_Anticlockwise_PH_MBT_PMN_1st_6`,
Caldecott `CC17_A` to Botanic Gardens `CC19_A`, scheduled 06:47:50–06:48:50.
It remains a source-quality finding for reconciliation; neither validator silently
corrects it. The service-gap notice concerns `SERVICE_WE`, 2025-11-10 through
2026-01-03. Full notice samples are retained in the aggregate audit.

Both protobufs decode as valid GTFS 2.0 `FULL_DATASET`: service alerts contain
two entities with timestamp `1786611484`, and trip updates contain zero entities
with timestamp `1786612320`. This reproduces the historical observations without
claiming current runtime behavior or reviewed alert selector mappings.
