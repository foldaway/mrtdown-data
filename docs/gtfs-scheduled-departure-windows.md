# Source departures in a time window

`@mrtdown/core` exports `scheduledDeparturesInWindow(selections, window)`,
`ScheduledTripDateSelection` and `ScheduledDeparture`. Each selection supplies a
source trip, its matching calendar and an explicit civil service date. The helper
uses [service-date resolution](gtfs-scheduled-trip-service-dates.md) to combine
enabled events across those dates.

The window contains `startInstant` and `endInstant` as absolute ISO timestamps
with UTC or explicit offsets. The end must follow the start. Departures at the
start are included; departures at the end are excluded. This permits adjacent
windows without counting a boundary event twice. Inputs with different offsets
are compared as instants, not as timestamp text.

Results contain the original stop-time fields, source route/calendar IDs,
`serviceDate`, and UTC `arrivalInstant`/`departureInstant`. Only occurrences with
a supplied departure in the window appear. Missing approximate departure times
are skipped, while explicit offset zero remains a real event. Arrival-only
information does not become an invented departure. Approximate precision and all
pickup/drop-off codes remain intact, including restricted boarding. Consumers
must apply those restrictions before presenting a passenger boarding option.

Results sort by departure instant, then service date, provider trip ID using
code-point order, and exact decimal stop sequence. Repeated stop visits and
coincident events retain separate occurrence identities, including large source
sequences and their original leading zeroes. Input selection order does not
affect the result. Duplicate provider-trip/service-date selections throw rather
than double-count events or choose between conflicting source records. Source
inputs remain unchanged.

Each selection is validated before filtering its events. Calendar mismatches or
invalid source timing cannot disappear merely because the trip is inactive or
outside the window. An empty selection returns an empty result for a valid
window. Invalid selections or windows throw without returning partial results.

The caller chooses all relevant service dates and the eligible snapshot for each
date before calling this helper. For example, a query shortly after midnight may
need both yesterday's `25:00` and today's `01:00`; offsets exceeding 48 hours may
require still earlier dates. A removal on the new civil date does not cancel an
enabled earlier service day. The helper does not discover those dates, decide
snapshot lineage, establish coverage or select canonical platforms/destinations.

This remains an in-memory source timing lookup. Reconciliation and publication
paths do not call it; mapping review, source licence requirements and generation
gates remain open.

## Boarding candidates with onward travel

Both departure helpers accept a third argument, `ScheduledDepartureOptions`:

```ts
scheduledDeparturesInWindow(selections, window, { boardingOnly: true });
scheduledDeparturesWithPatternsInWindow(selections, window, { boardingOnly: true });
```

This mode retains an occurrence only when it has a supplied departure, pickup is
allowed, and at least one later occurrence in the same trip permits alighting.
Pickup/drop-off code `1` prohibits the corresponding action; codes `0`, `2` and
`3` remain eligible with their original regular or arranged-access restrictions.
An arranged pickup or drop-off must still be presented with that restriction.

The [GTFS stop-time reference](https://gtfs.org/documentation/schedule/reference/#stop_timestxt)
defines travel between an occurrence and later stops, subject to pickup/drop-off
rules. MRTDown uses that ordering to filter boarding candidates. A trip's final
timestamp supplies no later stop within that trip, even when its source pickup
code is the default `0`. The source value is preserved; no pickup rule is rewritten.
Linked trips or vehicle turnarounds are not inferred as continuations.

Onward alighting is checked against the entire trip before filtering by time or
provider stop. A destination outside the requested window or stop selection can
still support a boarding occurrence inside it. Repeated visits to the same station
remain distinct: an earlier visit may permit boarding while the last one does not.
Missing approximate times are not interpolated, and a missing boarding departure
still produces no candidate.

The default lookup retains its existing raw-event results. Calendar, binding and
duplicate-selection checks run before either mode returns results, including when
boarding filtering would remove every event. Source access rules, platform
alternatives and canonical identities remain unchanged. This option does not
validate physical platform suitability, resolve terminal platform/service
disagreements or approve a mapping.

On the verified October capture's 12,106 matched trip proposals, querying each
trip's first assigned service date returns 218,207 raw departure events. The
boarding-only lookup returns 206,101, excluding exactly the 12,106 final
occurrences. Source pickup/drop-off defaults, assignment documents and mapping
coverage remain unchanged. This is a read-only compatibility check against the
[pinned assignment packet](gtfs-trip-assignment-validation.md#prepare-assignments-from-mapping-decisions).

## Finding candidate service dates

`scheduledServiceDatesForWindow(calendar, window, maximumOffsetSeconds)` finds
enabled dates whose service-day interval from zero through the supplied maximum
could intersect the window. The maximum must cover every departure offset being
queried; the source inspector derives it from the selected trips or stops. The
result is a conservative candidate list, so actual events still need the window
lookup above. A candidate date is not proof that a trip departs in the window.

The helper uses the Singapore noon-based time anchor, clips iteration to both
the query window and calendar bounds, and includes explicit additions outside
weekly bounds. Calendar removals remain authoritative. It supports offsets over
48 hours and historical timezone changes without treating midnight as a fixed
UTC offset. Invalid calendars, windows or offsets throw through the existing
validators. It does not select an eligible source snapshot or establish mapping
coverage.

## Departures with canonical patterns

`scheduledDeparturesWithPatternsInWindow(selections, window)` accepts
`ScheduledTripPatternDateSelection` records: the same source `trip`, `calendar`
and explicit `serviceDate`, plus all supplied binding `scopes` for that trip.
It applies the [date-scoped binding rules](gtfs-scheduled-trip-bindings.md#service-date-scopes)
before filtering departures. An active trip without one applicable binding,
overlapping scopes or invalid bindings fails even when its events fall outside
the window. Valid inactive selections produce no events but still participate in
duplicate trip/date checks.

Each `ScheduledDepartureWithPattern` retains all source departure fields and
adds `lineId`, `serviceId`, `revisionId`, `destinationStationId`, `stationId` and
the complete `platformIds` alternatives. Date-specific identities remain attached
to their own source occurrences, including previous-day trains after midnight.
Coincident events and repeated visits remain distinct. Missing departures are
filtered after binding, so later visits cannot inherit an earlier visit's
canonical identity. Pickup/drop-off restrictions remain present; consumers must
honor them before presenting boarding options.

Both lookup helpers share inclusive-start/exclusive-end filtering, chronological
ordering, deterministic tie-breaking and duplicate-selection checks. Empty
selections still require a valid absolute window. Invalid inputs throw without
returning partial results. The source-only helper retains its existing API and
output, and source inspection commands continue to use it.

The caller must supply eligible source snapshots, relevant service dates and
binding scopes. This helper does not establish canonical reference/path/effective
date validity, complete platform-group membership, mapping approval or publication
rights. No CLI, generator or publication path calls it.

A read-only check of the existing NEL proposal packet queries all 1,683 trips
on their source calendars' first active dates in a January 1–6 window. The 27,054
departures exactly match the source-only lookup after removing the added
canonical fields, with source tables and pinned topology unchanged. Separately,
the retained October `PTC_B` January 4 00:00–02:00 inspection still returns the
same 28 departures and byte-identical JSON after the shared-window refactor.
These compatibility checks create no mapping approval or published artifact.
