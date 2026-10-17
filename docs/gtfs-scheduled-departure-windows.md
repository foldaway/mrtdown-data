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
