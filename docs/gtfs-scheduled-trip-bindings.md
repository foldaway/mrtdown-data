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

For a date-scoped binding,
[`validateScheduledTripPatternSourceStops`](gtfs-scheduled-trip-patterns.md#source-stop-correspondence)
adds canonical path/date checks and verifies station codes, parent identity and the
complete source platform-label set against the supplied capture's stop rows.

A read-only compatibility check used the verified October capture and the
canonical commit/topology recorded in the existing NEL proposal packet. All 14
proposed patterns and 1,683 source trips bind successfully, preserving 27,054
occurrences and 114 short workings with their actual scheduled endpoints.
Stripping the added canonical fields reproduces every original timing record.
The source tables and pinned canonical projection remain unchanged. This checks
proposal compatibility only; it creates no reviewed mapping or published output.

## Service-date scopes

`ScheduledTripPatternDateScopeSchema` and its inferred
`ScheduledTripPatternDateScope` type pair a `binding` with a nonempty set of
distinct ISO `serviceDates`. Dates normalize into ascending order without
modifying the input. They describe supplied applicability, not mapping approval.
These lookup inputs do not replace the compact source calendar rules.

`scheduledTripWithPatternOnDate(trip, calendar, scopes, serviceDate)` resolves
one source trip against all its supplied scopes. It validates the source timing,
matching calendar and requested civil date, then every scope and its literal
source-occurrence binding. Every scoped date must be active in that source
calendar. Scopes must be disjoint, even when the overlap is outside the requested
date or the proposed patterns are identical. Invalid or conflicting scopes cannot
disappear behind an inactive query date.

For an active source date, exactly one scope must apply. A gap throws instead of
returning a misleading empty result or extending another scope. The helper does
not choose the latest revision or prefer an input's position. Dates not requested
may remain uncovered; whole-snapshot mapping coverage is still checked separately.
An empty scope list is allowed for an inactive source date and fails for an active
one. A valid inactive source date returns `null` after input validation.

An enabled result is a `ScheduledTripWithPatternOnDate`: the bound trip plus
`serviceDate` and UTC `arrivalInstant`/`departureInstant` on each occurrence.
Existing Singapore service-day rules apply, including elapsed offsets beyond
midnight and explicit missing times. A removal on the next civil date does not
cancel an earlier enabled service day's late train or change its binding.
Source timing, access restrictions, canonical references and all platform
alternatives remain intact; inputs are unchanged.

Scope selection proves only that one supplied binding applies to the requested
source service date. Canonical reference/path/effective-date checks, complete
platform-group review, snapshot identity, human approval and publication remain
separate gates. No export, departure query or generator calls this resolver.

The NEL proposal compatibility check also resolves all 1,683 trips on the first
supplied active date of each source calendar: 2026-01-01, 2026-01-03 and
2026-01-04. All 27,054 occurrences match the source-only resolver's UTC events,
with canonical references and all 114 short-working endpoints retained. Source
tables and the pinned canonical projection remain unchanged; no approval or
publication is inferred.
