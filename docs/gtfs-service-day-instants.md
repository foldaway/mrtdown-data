# Scheduled service-day instants

`@mrtdown/core` exports `scheduledServiceDayInstant(serviceDate, offsetSeconds)`.
It converts a chosen civil service date and elapsed stop-time offset to a UTC ISO
instant, using `Asia/Singapore`. It is a time-conversion building block; it does
not choose calendars, map trips or publish departures. Phase 2 review and existing
generation gates remain open.

```ts
scheduledServiceDayInstant('2026-01-01', 90000);
// '2026-01-01T17:00:00Z', which is 01:00 on 2 January in Singapore
```

The [GTFS time definition](https://gtfs.org/documentation/schedule/reference/#field-types)
uses a service-date local-noon anchor minus twelve elapsed hours. The helper uses
that anchor and adds the supplied seconds without reducing them modulo one day.
Singapore's [IANA timezone history](https://data.iana.org/time-zones/tzdb/asia)
is respected, rather than assuming a fixed offset for every historical date.
The host's default timezone does not affect the result.

The helper requires a valid ISO civil date and a nonnegative safe integer offset,
validated with the shared `ScheduledServiceDaySecondsSchema`. Impossible dates,
fractional/negative/nonfinite offsets and values beyond Temporal's representable
instant range throw. A missing approximate stop time remains `null` in the
[stop-time contract](gtfs-scheduled-stop-times.md); callers must handle that
absence rather than passing it as a scheduled midnight. Conversion does not
change source precision or access restrictions.

Calendar availability remains tied to the **service date**, using
[`isScheduledServiceDate`](gtfs-service-calendars.md). At 01:00 on 2 January,
1 January's `25:00` and 2 January's `01:00` resolve to the same instant. Each
requires its own calendar check and source identity; a removal on 2 January does
not cancel a trip belonging to an enabled 1 January service day. Future consumers
must merge eligible instants in chronological order while retaining service date,
provider trip and stop occurrence identity. Instant equality alone does not
establish that two source departures are the same record.

The existing source, reconciliation and approval paths do not call this helper.
It does not turn a syntactically valid offset into reviewed allocation,
source-calendar correctness or publication eligibility.

A read-only compatibility check extracted all 68,677 distinct arrival/departure
offsets from verified October source
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`.
Using the synthetic anchor date `2026-01-01`, every UTC difference matched the
supplied elapsed seconds, including 2,264 distinct offsets at/after 24:00. The
maximum was 90,292 seconds. This checks conversion only, not trip-date operation.
Serializing `[offsetSeconds, instant]` pairs in ascending offset order with
`JSON.stringify` plus a newline gives SHA-256
`afd36b50eae5b00e2f60f0cce72cba81b428fe86ce2f8009b2b8f70e6832ee9c`.
