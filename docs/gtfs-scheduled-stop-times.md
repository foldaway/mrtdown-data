# Scheduled stop-time contract

`@mrtdown/core` exports `ScheduledStopTimeSchema` and its inferred TypeScript type.
`@mrtdown/fs` exports `scheduledStopTimeFromGtfs(row)` to parse a fixed-stop source
row into that contract. This is a building block for the planned scheduled-arrivals
format; no generator or publication path consumes it yet. Phase 2 review and all
existing generation gates remain open.

A record contains:

| Field | Representation |
| --- | --- |
| `providerTripId`, `providerStopId` | Nonempty source identifiers |
| `stopSequence` | Original decimal text, including leading zeroes; never coerced to a number |
| `arrivalSeconds`, `departureSeconds` | Nonnegative safe integers measured within the service day, or explicit `null` |
| `pickupType`, `dropOffType` | Explicit numeric source access codes, 0 through 3 |
| `timepoint` | Explicit source precision, 0 or 1 |

For example, `24:10:00` is represented as 87,000 seconds. It retains its source
service day; it is not reduced to a clock time or converted to a dated instant.
Calendar, timezone and previous-service-day selection belong to the future
consumer.

The parser follows the [GTFS stop-time reference](https://gtfs.org/documentation/schedule/reference/#stop_timestxt):
blank access fields use code 0; absent precision uses 1. Precision 0 denotes
approximate timing, while 1 denotes exact timing. Supplied phone/driver-arranged
access codes remain distinct from ordinary boarding. Missing approximate times
stay `null`; neither interpolation nor scheduled midnight is supplied. An exact
record requires both times, and a supplied departure cannot precede arrival.
Invalid enums, malformed times and unsafe numeric offsets fail.

Repeated visits to the same stop remain separate occurrences through their source
sequence. The parser neither sorts nor drops them. The strict output schema has
no canonical platform, service, date, mapping approval or eligibility fields.
Source records remain intact. This timing contract is not a lossless encoding of
all source columns: headsigns, continuous access, booking details and other fields
still belong to the retained source and future surrounding artifact. On-demand
location/window records are rejected rather than converted into fixed-stop times.

Per-trip ordering, duplicate decimal sequence identity, first/last-stop timing,
route inheritance, calendar correctness and reference validation require the
surrounding schedule audit/assembler. The existing source audit and mapping
review paths remain unchanged. A parsed stop time is not proof of a reviewed
canonical allocation or permission to publish scheduled arrivals.

The read-only compatibility check of the verified October source
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
parsed all 349,768 rows, including 5,313 with an offset at or beyond 24:00 and
8,448 visits repeating a stop already visited by that trip. All source rows have
both times; precision defaults to exact. The maximum offset is 90,292 seconds.
Serializing each parsed object with `JSON.stringify` plus a newline in source
row order gives SHA-256
`1e23c844c26bba07fd000cdfabff1cc971a822c7849873973d0fdd6db7943be8`.
No normalized departure dataset was published by this check.
