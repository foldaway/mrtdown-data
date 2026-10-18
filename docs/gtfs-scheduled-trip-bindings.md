# Binding source occurrences to canonical patterns

`@mrtdown/core` exports `ScheduledTripPatternBindingSchema`, its inferred
`ScheduledTripPatternBinding` type and
`bindScheduledTripPattern(trip, binding)`. The helper joins
[source-trip timing](gtfs-scheduled-trip-times.md) to a supplied
[canonical pattern](gtfs-scheduled-trip-patterns.md) without selecting a mapping.

A binding contains:

- `providerTripId`, identifying the exact source trip;
- `pattern`, containing the canonical identities and ordered stop occurrences;
- `occurrences`, an equally long ordered array of source `providerStopId` and
  `stopSequence` pairs, corresponding one-to-one with `pattern.stops`.

The helper validates both inputs. The trip ID must match, all three occurrence
arrays must have equal length, and every source stop ID and sequence must match
the binding at that position. Missing, extra, duplicated or reordered occurrences
fail instead of truncating, sorting or deduplicating the join. Sequence comparison
uses literal text, preserving arbitrary-length decimal IDs and leading zeroes.
Even a numerically equivalent spelling is rejected when it differs from the
retained source text; occurrence binding does not normalize IDs across captures.

The returned `ScheduledTripWithPattern` retains the original source trip, route
and calendar IDs. It adds `lineId`, `serviceId`, `revisionId` and
`destinationStationId`; each `stopTimes` entry gains its corresponding `stationId`
and complete `platformIds` set. Source offsets beyond midnight, missing
approximate times, pickup/drop-off restrictions, precision and raw occurrence
identity remain unchanged. Platform alternatives are normalized by the pattern
schema without selecting a member. Neither input is modified.

This enriched record is separate from the source-only timing contract. Existing
source timing schemas and departure queries continue to consume the original
source records. No export, generation or publication path calls the binder.

Binding proves structural correspondence to the supplied source keys. It does
not prove that the supplied canonical stations or platform sets represent those
source stops. Callers must separately run
`validateScheduledTripPatternReferences(binding.pattern, topology)` and verify
source-to-canonical path matching, complete grouped-platform alternatives,
service-date scopes, effective periods, pickup compatibility, capture identity
and the canonical commit/topology fingerprint through the reviewed mapping
workflow. The helper creates no approval or eligibility metadata. Existing
mapping review and publication gates remain open.

A read-only compatibility check used the verified October capture and the
canonical commit/topology recorded in the existing NEL proposal packet. All 14
proposed patterns and 1,683 source trips bind successfully, preserving 27,054
occurrences and 114 short workings with their actual scheduled endpoints.
Stripping the added canonical fields reproduces every original timing record.
The source tables and pinned canonical projection remain unchanged. This checks
proposal compatibility only; it creates no reviewed mapping or published output.
