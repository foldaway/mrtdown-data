# Canonical scheduled-trip references

`@mrtdown/core` exports `ScheduledTripPatternSchema` and its inferred
`ScheduledTripPattern` type. This is the canonical identity portion of the
planned arrivals format, separate from the
[source timetable](gtfs-source-timetable.md). It does not assign provider trips
to canonical services or create mapping approvals.

Each record contains `lineId`, `serviceId`, `revisionId`,
`destinationStationId` and at least two ordered `stops`. Each stop contains a
`stationId` and a nonempty set of distinct `platformIds` at that station. One
member represents one platform; several members preserve alternatives without
selecting an individual physical platform. Members sort by literal ID, while
stop order and repeated visits remain intact. Unknown fields are rejected.

The destination identifies the final scheduled station occurrence. A short
working can end before the canonical service revision's endpoint, and a loop
can end at its starting station. It is not a source headsign or a claim about
the passenger-facing destination text.

`@mrtdown/fs` exports
`validateScheduledTripPatternReferences(pattern, topology)`. Supply the canonical
projection returned by `scheduleTopologyProjection`. The checker returns the
parsed pattern or throws before returning a partial result. It requires:

- Exactly one referenced line, service and service revision. The service must
  belong to the line, and the line must list the service.
- Exactly one station for every occurrence, including the destination. Each
  station must appear in the referenced service revision.
- Exactly one platform for every supplied alternative at its stated station.
  Every member must belong to the pattern's line and permit the service when
  the canonical platform declares a service scope.

Unscoped platforms retain their current meaning; an empty service scope in the
projection does not become an exclusion. Duplicate canonical identities fail
rather than selecting the first record. The checker does not modify the pattern
input or canonical projection.

These are reference checks, not path, date or allocation approval. They do not
prove ordered source-to-canonical path correspondence, revision/station-code
effective dates, pickup compatibility, historical platform availability or
completeness of a provider's grouped platform labels. The existing
[grouped-platform review](gtfs-platform-group-review.md) must still verify the
complete source set; a reference-valid subset does not replace that review.
Source occurrence binding and the canonical commit/topology fingerprint must
also be checked by the surrounding artifact workflow. The
[occurrence binder](gtfs-scheduled-trip-bindings.md) checks literal source keys
before joining a supplied pattern to trip timing. No generator, departure
query or publication path calls this checker; mapping and publication gates
remain open.

A read-only compatibility check used every canonical revision of `NEL_MAIN_N`,
`EWL_CG_E` and `PGLRT_E_CW`: nine templates, 92 station occurrences and 19
occurrences with multiple compatible platform references. The projection remained
unchanged. These templates test canonical references only; they do not allocate
source trips, establish effective dates or approve mappings.

## Canonical path and date validity

`validateScheduledTripPatternDateScope(scope, topology)` checks a supplied
[binding date scope](gtfs-scheduled-trip-bindings.md#service-date-scopes) against
the canonical projection. It runs the reference checks above, then requires the
ordered station occurrences to match the selected revision's full path, a
contiguous short working, or a bounded rotation of an explicitly closed loop.
Open paths cannot rotate, repeated occurrences are preserved, and trips cannot
exceed the canonical single circuit. Exact/contiguous matches take precedence
over rotations, using the same matching rules as reconciliation.
Rotations keep the explicit closing occurrence and its display code when crossing
the loop boundary before continuing with the next station.

Every supplied service date must fall within the selected revision's period.
On each date, at least one complete matching segment must have active canonical
station codes matching its revision display codes and line. All occurrences must
be supported by that same segment; evidence from different alignments cannot be
combined to hide a gap. Multiple supported alignments remain possible; the checker
does not choose or publish one.

Revision and relevant station-code bounds must be real ISO civil dates, with
inclusive starts and exclusive ends. A null end remains open; an end at or before
the start is invalid. Relevant malformed periods fail even when another segment
could otherwise match. Checks use the supplied service date, preserving an earlier
service day's identity for trains running beyond midnight. The returned scope
retains normalized dates and platform alternatives without changing either input.

This verifies canonical path and date validity only. The source calendar and
literal occurrence binding, provider station-code/parent correspondence, operator
periods, complete grouped-platform evidence, pickup compatibility and historical
platform assignments still require their own checks. Capture identity, canonical
commit/fingerprint, mapping approval and publication gates remain separate. No
query, generator or publication path calls this checker.

A read-only check against the pinned canonical topology validates all 14 NEL
proposal scopes (1,564 pattern-date pairs) and 31 exact-date CCL proposal scopes
(1,656 pairs). The complete reconciliation proposal JSON is byte-identical before
and after sharing the path matcher, and the canonical projection is unchanged.
These checks establish proposal compatibility only; they create no approval or
published artifact.

## Source stop correspondence

`validateScheduledTripPatternSourceStops(scope, sourceStops, topology)` checks a
supplied scope against the `stops.txt` rows from the same source capture. It runs
the canonical path/date checks above, then checks every bound occurrence:

- Its literal source stop ID must identify exactly one platform row
  (`location_type` empty or `0`) with a nonempty `stop_code`.
- On every scoped date, that code must uniquely identify the supplied canonical
  station on the pattern's line. If a parent is declared, it must identify exactly
  one station row (`location_type=1`) without its own parent. Its `stop_code`, or
  literal `stop_id` when the code is absent, must uniquely identify the same
  canonical station on every date. Interchange parents may use another line's code.
- Every slash-separated `platform_code` label must be distinct and nonempty after
  trimming. Each label must identify exactly one canonical platform at that station
  and line. The supplied platform alternatives must equal the entire resulting
  set; missing members, extra members and ambiguous labels fail.

Code periods use inclusive starts and exclusive ends. Relevant malformed periods
fail, including competing code records that could make station identity ambiguous.
Missing codes or labels are left for review rather than inferred from names. A
parent is optional when the child code itself identifies the station. The returned
scope retains all occurrences and alternatives; neither input nor topology changes.

This check does not inspect trip timing or calendars. Use the
[literal occurrence binder and date resolver](gtfs-scheduled-trip-bindings.md) to
verify the scope against its source trip and active calendar. Route/agency mapping,
operator periods, pickup compatibility, historical platform allocation, capture and
topology identity, human approval and publication remain separate. No query,
generator or publication path calls this checker.

The read-only audit used the verified October capture, pinned canonical topology
and full version-3 draft identified in the
[grouped-platform review](gtfs-platform-group-review.md#october-snapshot-proposals).
Of its 26,268 proposed pattern-date pairs, 22,812 pass this additional check.
The other 3,456 pairs span 54 scopes and fail before 2026-07-12 because the source
parent uses the not-yet-active `CC33` at Marina Bay or `CC34` at Bayfront:

| Line | Affected scopes | Failing pattern-date pairs |
| --- | ---: | ---: |
| NSL | 3 | 192 |
| DTL | 6 | 384 |
| TEL | 45 | 2,880 |

Child codes on those lines do not substitute for the parent's own code period.
These failures require source/parent-date review; the checker does not rewrite
parents, extend canonical code periods or remove dates from the draft. The NEL
and CCL pilot scopes still pass all 3,220 pairs. Existing reconciliation proposals
remain byte-identical and the canonical projection is unchanged. The existing
review evaluator does not yet call this checker, so its proposal counts are not
an assertion that this additional gate has passed.

## Current platform boarding checks

`validateScheduledTripPatternBoarding(trip, binding, topology)` checks every
proposed platform against the bound source occurrence's pickup rule. It validates
canonical references and the literal source-occurrence binding first, then rejects:

- Any `not_in_service` platform, including a final occurrence or one with no pickup.
- Any `alighting_only` platform before the final occurrence when source pickup is
  allowed (`pickupType` 0, 2 or 3). Pickup by arrangement still counts as pickup.

Every member of a platform set must pass. Repeated visits are checked independently,
so an earlier pickup cannot be hidden by the same station's final alighting visit.
The final-occurrence exception matches the existing
[grouped-platform review](gtfs-platform-group-review.md#contract) rule. Null boarding
status and unspecified platform service scope retain their existing meaning.

The returned bound trip preserves source timing, raw occurrence identities,
pickup/drop-off rules, precision and all canonical alternatives. Inputs are unchanged.
This is a check against current, undated platform metadata; it does not establish
historical allocation or change source access rules. Source stop correspondence,
canonical date validity, active calendars, agency/operator mapping, capture identity,
human approval and publication still require their own checks. No departure query,
generator or publication path calls this checker.

A read-only check against the October version-3 draft and its pinned topology
passes all 231 matched proposal patterns: 12,106 source trips, 218,207 occurrences
and 771 occurrences with grouped platform alternatives. Removing the added canonical
fields reproduces every original timing/access record; reconciliation proposals
and canonical topology remain unchanged. This establishes current boarding
compatibility only. The 3,456 parent-code/date gaps recorded above remain unresolved.
