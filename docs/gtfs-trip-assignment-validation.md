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
pairs. The [parent identity correction](gtfs-mapping-disagreements.md#interchange-parent-identity)
also permits snapshot interchange parents whose other-line code starts later than
the child's service date. Source tables, canonical topology and reconciliation
output remain unchanged; passing creates no human approval or published artifact.

## Prepare assignments from mapping decisions

`createScheduledTripAssignmentProposals(context, draft)` turns the matched cells
in a version-2 or version-3 scoped mapping draft into a trip assignment document.
The context contains the verified source tables, reconciliation identity and pinned
canonical topology, as in [scoped review](gtfs-scoped-review.md). Callers must verify
the capture and construct that context from the declared inputs before calling this
in-memory helper.

Each matched pattern/date cell expands to every source trip in that pattern.
Route and agency decisions supply the line and operator; stop decisions supply
stations and complete platform alternatives. Every trip retains its own literal
stop IDs and stop sequences, including repeated stations and identifiers too large
for JavaScript numbers. Dates remain service dates for trips running after midnight.

The helper re-evaluates the entire draft and rejects invalid or stale decisions,
then runs combined assignment validation before returning anything. A valid draft
may still be incomplete, unresolved or unapproved. Only its matched cells become
proposals; omitted, excluded, inactive and unresolved cells add no assignments.
No dates are filled automatically, and a failing matched cell is never skipped.

The result contains `document`, suitable for `gtfs validate-assignments`, together
with `draftSha256`, the full `review` evaluation and `generationEligible: false`.
Assignments are sorted by literal trip ID and first service date, with normalized
date and platform sets. Reordering decisions, date sets or source rows does not
change the result. Inputs remain unchanged. This prepares compatibility proposals;
it does not record human approval or make a publishable schedule.

Against the verified October capture and pinned topology, the helper reproduces
all 2,781 NEL/CCL assignments and 291,967 trip/date pairs from the earlier manual
compatibility check. Snapshot parent identity is checked independently of the
child's dated service code. Source tables, topology and reconciliation proposals
remain unchanged.

With the parent identity correction, the full version-3 draft's matched cells
also pass: 12,106 trip assignments covering 1,502,097 trip/date pairs. This uses
the same verified October capture, pinned topology and full-draft digest recorded
in [grouped-platform review](gtfs-platform-group-review.md#october-snapshot-proposals).
The normalized assignment SHA-256 is
`22d05a49f00f1a444bd2bdf88b0b5403f2ed694e4aa2adc086b405eb907f0d78`.
Verified capture inspection with coverage reports 990,143 unassigned trip/date
pairs out of 2,492,240 active source pairs, grouped into six gap records. The
draft remains unresolved and unapproved; `generationEligible` stays `false`.

## Check a verified local capture

After materializing the [capture and receipt](gtfs-public-handoff.md), run:

```sh
npm run build:cli
node packages/cli/dist/index.js --data-dir /absolute/path/to/pinned/data \
  gtfs validate-assignments \
  --file /absolute/path/schedule.zip \
  --capture /absolute/path/capture.json \
  --assignments /absolute/path/assignments.json \
  --canonical-commit <40-character-commit> \
  --write /absolute/path/validation-report.json
```

The assignment file follows `ScheduledTripAssignmentDocumentSchema`: `schemaVersion`
is `1`, `documentKind` is `gtfs-trip-assignments`, `identity` uses the existing
[reconciliation identity](gtfs-reconciliation.md), and `assignments` contains the
scope/route-mapping pairs described above. It is a supplied validation input,
separate from reviewed mapping drafts or approvals.

The command verifies the capture's size and SHA-256, requires a schedule feed,
and compares the complete table manifest with the document. It also requires the
document's recorded canonical commit to match `--canonical-commit` and recomputes
the topology fingerprint from `--data-dir`. Supply the exact canonical data tree
from that commit; the command does not check out Git revisions or prove Git-tree
membership. Manifest key order and JSON formatting do not affect these checks.

On success, the report records capture/rights metadata, the verified table manifest
and topology fingerprint, the supplied canonical commit, a SHA-256 of normalized
assignments, and assignment, trip and trip/date counts. Counts describe supplied
assignments only. `generationEligible` stays `false`. The assignment hash preserves
array order while normalizing service dates and platform sets; it is not a mapping
approval digest. No current timestamp or local path enters the report.

Omit `--write` for JSON on stdout. Invalid arguments, mismatched provenance or any
assignment failure exit with status 1 before writing a report; existing output is
left untouched. The command does not download files or change source/canonical data.

Programmatic callers can use
`inspectGtfsTripAssignments(file, handoff, { dataDir, canonicalCommit, assignments })`
with the same document and validation behavior.

## Report unassigned source dates

Add `--coverage` to `gtfs validate-assignments` to include coverage after every
supplied assignment passes validation. Programmatic callers can set `coverage: true`
in `inspectGtfsTripAssignments` options. Without this option, the existing report
and validation behavior are unchanged.

The additional `coverage` object records source trip and active trip/date totals,
assigned and missing trip/date counts, inactive trip count, and
`tripDateCoverageComplete`. It also lists `gaps`, grouping source trips with the
same calendar and exact missing service dates. Each group contains
`providerCalendarId`, sorted `providerTripIds` and sorted `serviceDates`.
Trips omitted from the assignment file retain all their active dates as gaps;
partially assigned trips retain just the uncovered dates.

Coverage follows each trip's source calendar: weekly bounds are inclusive,
exceptions override weekday rules, and additions outside the weekly range count.
Dates remain service dates for trips running beyond midnight. Inactive trips
contribute no required dates. Calendars are expanded once per used source calendar,
using the existing 100-year reconciliation audit limit; dated departures are not
expanded.

Gap groups and counts are deterministic regardless of source row or assignment
order. Assignment order still participates in the existing assignment hash.
Partial coverage is informational and returns status 0 when the supplied assignments
are valid. Even complete active trip/date coverage leaves `generationEligible: false`:
agency/route/stop dispositions, source semantics, human approval, licensing and
publication remain separate requirements. No missing date is assigned or excluded
by the report.

For the existing NEL/CCL-only input, the verified October report counts 2,492,240
active source trip/date pairs: 291,967 assigned and 2,200,273 missing. The missing
dates group into six records covering 17,467 source trips. This includes other
unassigned lines and uncovered CCL dates; it describes the supplied pilot's coverage
against the full capture. Its assignment hash is unchanged and generation remains
ineligible.
