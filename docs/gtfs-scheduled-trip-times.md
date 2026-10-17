# Scheduled source-trip timing

`@mrtdown/core` exports `ScheduledTripTimesSchema` and its inferred TypeScript
type. `@mrtdown/fs` exports `scheduledTripTimesFromGtfs(tables)` to assemble
all fixed-stop source trips from parsed GTFS tables. These are format preparation
for scheduled arrivals. Existing reconciliation, approval and publication paths
do not call the assembler; Phase 2 review and generation gates remain open.

Each timing record contains nonempty `providerTripId`, `providerRouteId` and
`providerCalendarId`, plus at least two ordered
[`ScheduledStopTime`](gtfs-scheduled-stop-times.md) occurrences. Every occurrence
must belong to the containing trip. The schema validates the supplied order;
it does not sort or repair an invalid record.

The [service-date resolver](gtfs-scheduled-trip-service-dates.md) combines one
validated trip with its matching calendar and an explicit service date, adding
UTC event instants only when that date is enabled.

Sequences must strictly increase as decimal integers. Comparison retains exact
precision beyond JavaScript's safe integer range, while output keeps the original
text, including leading zeroes. Decimal aliases such as `1` and `01` are duplicate
identities. Repeated visits to the same provider stop remain separate occurrences.

The [GTFS stop-time reference](https://gtfs.org/documentation/schedule/reference/#stop_timestxt)
requires arrival times at the first and last stop, including approximate
timepoints. Approximate boundary departure times may remain absent. Exact
timepoints still require both times through the child contract. All supplied
arrival/departure events must be nondecreasing in occurrence order. Missing
intermediate times stay `null` and do not reset chronology: a later arrival or
departure cannot precede an earlier known event. Equal times are permitted;
offsets after midnight retain their elapsed service-day meaning.

The batch assembler:

- Refuses structural errors from the existing schedule audit, including missing
  references, duplicate source identifiers and orphan stop-time rows.
- Validates each referenced [source calendar](gtfs-service-calendars.md), including
  actual civil dates, without selecting dates of operation.
- Requires referenced locations to be stops/platforms (`location_type` empty or
  `0`); parent stations, entrances and other location types cannot become visits.
- Groups all stop-time rows once, sorts trips by provider ID using code-point
  order, and sorts each trip's occurrences by exact decimal sequence.
- Applies the existing stop-time parser, then the complete trip timing schema.
  Invalid timing throws with the provider trip ID and underlying cause; no
  partial result is returned. Source arrays and records remain untouched.

This contract describes timing and source identity, not every trip column.
Headsigns, direction, continuous access, booking rules and other metadata still
belong to the retained source and future surrounding artifact. The source
manifest must be verified before parsing. This API is not an independent GTFS
validator, a canonical mapping decision or approval to publish arrivals.

A read-only check against verified October source
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
assembled all 19,150 trips and 349,768 occurrences. It preserved 8,448 repeat
visits and 5,313 occurrences at/after 24:00, with source tables unchanged.
Serializing each assembled trip using `JSON.stringify` plus a newline, in
returned trip order, gives SHA-256
`f55c11a40b5ae5643c49956eb419caca8b5a0f234dc83be50e6b23634c82164c`.
The check did not assign canonical identities or publish a departure dataset.
