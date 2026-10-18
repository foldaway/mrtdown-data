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
