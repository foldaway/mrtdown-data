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
