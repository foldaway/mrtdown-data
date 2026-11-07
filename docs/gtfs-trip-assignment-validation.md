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
optionally checking a third `approval` argument against that draft and identity,
then runs combined assignment validation before returning anything. A valid draft
may still be incomplete, unresolved or unapproved. Only its matched cells become
proposals; omitted, excluded, inactive and unresolved cells add no assignments.
No dates are filled automatically, and a failing matched cell is never skipped.

The result contains `document`, suitable for `gtfs validate-assignments`, together
with `draftSha256`, the full `review` evaluation and `generationEligible: false`.
Assignments are sorted by literal trip ID and first service date, with normalized
date and platform sets. Reordering decisions, date sets or source rows does not
change the result. Inputs remain unchanged. This prepares compatibility proposals;
it does not create human approval or make a publishable schedule. When supplied,
the approval affects the returned review evaluation; generation eligibility
remains false.

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

## Export assignments with a review packet

Add `--assignments` to the existing scoped-review command to save assignment
proposals and their verified coverage report alongside the mapping drafts:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-review-with-assignments \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba \
  --platform-groups --assignments
```

Use the verified October inputs and pinned canonical data described in
[grouped-platform review](gtfs-platform-group-review.md#reproduce) to reproduce
the counts above. Other pilot selections export only their matched cells while
reporting coverage against the whole supplied capture. Version-2 drafts work too;
omit `--platform-groups` to retain their individual-platform rules.

The new files are:

- `assignments.json`: the assignment document accepted by `gtfs validate-assignments`.
- `assignment-validation.json`: capture provenance, normalized assignment hash,
  supplied counts and complete source-date coverage, including unassigned gaps.

`summary.json` adds file digests and `assignmentProposals`, which binds the full
draft's normalized digest to the assignment hash and coverage counts. The original
mapping drafts and evaluations remain byte-identical. Without `--assignments`,
the existing files and summary remain unchanged. Combine it with `--blockers`
to include the separate [investigation report](gtfs-review-blockers.md).

All draft, assignment and capture checks finish before the output directory is
created. Validation failures leave no review packet; an existing output directory
is rejected rather than overwritten. Use a fresh directory for each run and keep
these large generated files outside Git.

The assignments contain compatibility proposals from the full draft's matched
cells. Unresolved cells remain in that draft and in the coverage report; creating
these files supplies no approval and leaves `generationEligible: false`.

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

## Preview departures with canonical identities

Use the exported assignment document with `gtfs departures` to inspect dated
departures carrying MRTDown identities:

```sh
npm run build:cli
node packages/cli/dist/index.js --data-dir /absolute/path/to/pinned/data \
  gtfs departures \
  --file /absolute/path/schedule.zip \
  --capture /absolute/path/capture.json \
  --assignments /absolute/path/assignments.json \
  --canonical-commit <40-character-commit> \
  --stop NE6_A \
  --from 2026-10-18T00:00:00+08:00 \
  --to 2026-10-19T00:00:00+08:00 \
  --boarding-only \
  --write /absolute/path/assigned-departures.json
```

`--assignments` and `--canonical-commit` must appear together. The command verifies
the capture, complete source manifest, supplied commit and actual topology, then
runs combined validation on every supplied assignment, including unselected trips.
It shares those checks with `gtfs validate-assignments`. Supply the exact pinned
data tree; the commit flag remains an assertion checked against the document,
not proof of Git-tree membership.

Trip and stop selectors still use literal provider IDs. The result's
`documentKind` is `gtfs-assigned-departures`; it includes the verified `identity`
and normalized `assignmentsSha256`. Each departure adds canonical `stationId`,
`lineId`, `serviceId`, `revisionId`, `destinationStationId` and complete `platformIds`
to the original timing, occurrence identities and pickup/drop-off rules.

The existing [window, calendar and boarding rules](gtfs-scheduled-departure-windows.md)
apply. Every selected active trip/date requires exactly one supplied binding.
A missing binding fails even if its events fall outside the window or boarding
filtering would remove them. Automatic date selection is conservative; all its
selected active dates must be assigned. Use `--service-date` for an explicit date
selection. Inactive dates produce no departures after validation. Missing dates
are never filled or silently skipped, and failures leave an existing output
untouched.

Programmatic callers pass a fourth argument to `inspectGtfsDepartures`:
`{ dataDir, canonicalCommit, assignments }`. Without that argument or the paired
CLI flags, the existing source-only report and lookup behavior remain unchanged.
Both modes retain `generationEligible: false`. This is a local compatibility
preview; it provides no mapping approval, publication artifact or live serving.

Using the pinned October assignment packet, the example query returns 221 boarding
candidates for source stop `NE6_A`, identified as canonical Dhoby Ghaut (`DBG`) on
NEL with service, destination and platform identities. Removing the added canonical
fields reproduces source-only inspection's timing and access records exactly.

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

## Assignments from combined mappings

`createScheduledCombinedTripAssignmentProposals(inputs, report, approval?)`
rebuilds the [combined mapping report](gtfs-holiday-mapping-review.md#combined-review-on-supported-service-dates)
from the verified capture context and exact policies before expanding proposed
cells into trip assignments. It preserves each source trip, route, calendar,
ordered occurrence and final represented destination. Reversals, omitted stops,
repeated visits, 24+ times, pickup/drop-off fields and timepoint precision remain
as supplied. No stop or time is interpolated.

The distinct `gtfs-combined-trip-assignments` format binds the original canonical
and source identity, all policy/date-population identities, exact report digest,
optional approval digest and explicit applicability. Each assignment has one
source trip, exact supported service dates, one or more service memberships,
route/operator mapping, ordered calls and a declared path basis. A shared trip
has one call per source occurrence, with per-service access on every physical
platform. Its memberships do not duplicate its trip/date coverage.

A/C and B/D remain complete distinct associations. Restricted platforms retain
false passenger boarding and alighting eligibility. Access is derived from each
trip's actual pickup/drop-off fields, rather than the pattern's aggregated access
alternatives. Boarding additionally requires a later eligible alighting occurrence
on that service, so the final occurrence cannot become an onward departure.
Source timing and precision accompany every call. Group association never selects
one actual platform or establishes simultaneous physical use.

`ScheduledCombinedTripAssignmentDocumentSchema` checks the persisted structure.
`verifyScheduledCombinedTripAssignments(inputs, report, document, approval?)`
reconstructs the entire document against original inputs; schema parsing alone
is not semantic validation. Missing assignments, changed dates/times/service
memberships, collapsed physical groups, altered access or false coverage fail.
The normalized `assignmentsSha256` covers the complete parsed document, including
its policy, approval and coverage metadata, rather than only assignment rows.
Existing literal assignment readers and artifact/release consumers reject this
new document kind. Their invariants are unchanged; consumer integration follows
separately.

### Exact combined mapping approval

`ScheduledCombinedMappingApprovalSchema` defines a separate record:

```ts
{
  schemaVersion: 1,
  documentKind: 'gtfs-combined-mapping-approval',
  identity: report.identity,
  draftSha256: report.draftSha256,
  reviewer: 'Actual reviewer',
  reason: 'Actual review decision',
}
```

This describes the contract, not an issued approval. Tooling never creates a
reviewer record. `evaluateScheduledCombinedMapping(inputs, report, approval?)`
reconstructs the report before checking its exact identity and digest. The
normalized approval digest also binds the supplied reviewer and reason text. Missing approval leaves readiness `unapproved`; stale identity/digest is
invalid. Other mapping approval kinds cannot approve the combined report.
A matching approval with unresolved entities or supported dates remains
`unresolved`. Only valid, fully resolved supported coverage with matching
approval reaches `reviewed-mapping-only`, with `mappingReviewEligible: true`.
Generation eligibility remains false. Mapping approval is review metadata, not
authentication, release approval, source admission or permission to publish.

Proposal preparation permits valid unapproved or unresolved reports for inspection.
Only proposed cells expand; unresolved supported dates remain explicit gaps with
trip IDs, exact dates and blockers. Coverage distinguishes literal, effective,
supported, outside-applicability, assigned and unassigned populations. Outside
dates are preserved as unsupported source diagnostics, not inactive dates,
approved exclusions or unassigned supported dates. A matching approval cannot
remove a gap. Incomplete proposals remain unsuitable for generation.

### Prepare and replay from the runner

Use Node 24 with `TZ=UTC` after `npm run build:fs`. Run the
[combined reproduction](gtfs-holiday-mapping-review.md#reproduce-the-combined-november-review)
with canonical commit `6d634f8db415252f5bcbbe5b1dc807607816f2ac` (merged #465),
regenerating the exact-base CCL claims for that commit and choosing new output
directories. Add `--combined-assignments` to prepare `combined-assignments.json`
alongside the mapping report, evaluation and summary. The assignment file uses
compact JSON; large generated files remain outside Git.

Actual reviewer metadata, if supplied, uses `--combined-approval <json>`.
This option and `--combined-assignments` require the combined applicability mode;
legacy mapping/approval/assignment flags cannot substitute for them. The summary
records the evaluated approval, assignment digest and supported coverage, without
manufacturing a reviewer record or granting generation eligibility. Saved report
replay uses `--combined-review <json>` with the same original inputs, policies,
exact-base shared claims and optional approval. Persisted assignment validation
uses the reconstruction API above.

October 31 trips remain outside November applicability even when their 24+ events
fall on November 1. November 30 trips retain their December 1 tails, without
establishing December 1 service-date coverage. Artifact and serving integration
must carry these same bounds; early November 1 still needs another applicable
source or an explicit availability gap.

### November assignment verification

Using the pinned November capture, canonical data at merged #465 and freshly
bound explicit CCL claims, the unapproved proposals contain **19,140 recurring
trips and 203,064 assigned supported trip/date pairs**, with zero supported gaps
or exclusions. All 2,275,284 outside-applicability effective pairs remain
separately accounted for. Shared memberships account for 3,960 pairs once;
all 17 unusual source trips retain their complete supplied journeys.

An independent raw-ZIP comparison checks all **349,581 source calls**: original
trip/route/calendar IDs, stop IDs, arbitrary-size sequence strings, exact parsed
arrival/departure seconds, access fields, precision and complete literal physical
platform labels. All 1,709 restricted per-service platform access entries remain
false for boarding and alighting. Each assigned date/membership is checked against
the exact reconstructed mapping cell. No actual approval record was generated;
readiness remains `unapproved`, mapping-review eligibility false and generation
eligibility false.

The canonical/report-bound normalized document digest is
`d741fcb65ff2fff4998379592e120ad8d602ba14b96202b4870612c65331f865`;
the regenerated combined report digest is
`56d12f77b96b311879b6b7c0c3f982d6e0ab5cf4963e9b1505f178328ae08e4d`.
These refer to the exact policies and claim text used for this run, rather than
transferring an earlier report identity. Generated packets are under
`/tmp/gtfs-assignment-integration-20261107-{base,complete,replay}`, with exact-main
membership claims at `/tmp/gtfs-assignment-integration-20261107-memberships.json`.
Large generated files remain outside Git; compact artifact packaging is separate.

Validation under Node 24 with `TZ=UTC`: all 866 deterministic tests, package
builds, lint, package boundaries and documentation links pass. Five assignment
scenarios cover complete and incomplete approvals, shared/repeated physical
occurrences, per-trip access differences, precision, 25-hour times, large sequence
strings, old-format rejection and persisted tampering. Saved-report replay
reproduces the mapping report, evaluation, assignments and summary byte for byte.
