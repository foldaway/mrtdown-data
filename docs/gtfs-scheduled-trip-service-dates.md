# Source-trip timing on a service date

`@mrtdown/core` exports `scheduledTripTimesOnDate(trip, calendar, serviceDate)`
and its non-null result type, `ScheduledTripTimesOnDate`. It combines the
[source-trip timing contract](gtfs-scheduled-trip-times.md),
[calendar availability](gtfs-service-calendars.md) and
[Singapore instant conversion](gtfs-service-day-instants.md).

Pass a valid civil service date such as `2026-01-01`. The helper validates the
trip and calendar, requires their provider calendar IDs to match exactly, and
tests availability on that date. An inactive date returns `null`. Invalid inputs
and calendar mismatches throw even when the requested date is inactive.
Weekly rules, date-only calendars and explicit additions/removals retain the
existing calendar semantics; the helper does not infer public holidays.

For an enabled date, the result preserves all source trip fields and adds
`serviceDate`. Each occurrence keeps its original stop-sequence text, offsets,
pickup/drop-off codes and precision, and gains `arrivalInstant` and
`departureInstant` as UTC ISO strings. Missing approximate times remain `null`
independently for arrival and departure. Explicit offset zero becomes a real
instant. Offsets beyond the supported instant range throw without returning a
partial result. Inputs remain untouched, and returned occurrences are independent
objects.

For example, an enabled `2026-01-01` trip with departure offset `90000` retains
that service date and resolves to `2026-01-01T17:00:00Z`, or 01:00 on 2 January
in Singapore. Removing 2 January from the calendar does not cancel this
1 January trip. A separately enabled 2 January trip with offset `3600` may have
the same instant; service date, provider trip and stop sequence still identify
distinct occurrences. The helper never deduplicates events by instant or stop ID.

The [departure-window lookup](gtfs-scheduled-departure-windows.md) resolves an
explicit list of trip/date selections, filters supplied departures by absolute
window boundaries and merges them chronologically.

The caller chooses each service date explicitly. Future window queries must
resolve eligible dates independently and merge their events chronologically,
including earlier service dates when offsets exceed 24 or 48 hours. This helper
does not select a wall-clock query window, filter boarding restrictions or choose
canonical services, platforms or destinations.

The result is an in-memory source timing view, not the published arrivals
artifact. Existing reconciliation and publication paths do not call the helper;
Phase 2 mapping review, source licence requirements and generation gates remain
open.

A read-only compatibility check used verified October source
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`.
Each trip was resolved on its calendar's first enabled date: `SERVICE_PH` on
`2026-01-04`, `SERVICE_WD` on `2026-01-01`, and `SERVICE_WE` on `2026-01-03`.
All 19,150 trips, 349,768 occurrences and 699,536 supplied time events were
retained with their expected elapsed offsets; source tables remained unchanged.
This checks one enabled date per calendar, not every operating date. Serializing
resolved trips with `JSON.stringify` plus a newline in the assembler's provider
trip order gives SHA-256
`9b9b5592bf2d8646b7e93559af7a51dccedba5a3dde328636cc5e2226725309d`.
No mapped arrivals artifact was generated or published.
