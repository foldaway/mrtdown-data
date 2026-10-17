# Scheduled service-calendar contract

`@mrtdown/core` exports `ScheduledServiceCalendarSchema`, its inferred type,
`ScheduledWeekdaysSchema`, and `isScheduledServiceDate(calendar, date)`.
`@mrtdown/fs` exports `scheduledServiceCalendarFromGtfs(tables, providerCalendarId)`
to parse one verified source calendar. These are format building blocks for
scheduled arrivals. Generation and publication remain gated on Phase 2 review.

The compact record contains:

| Field | Representation |
| --- | --- |
| `providerCalendarId` | Original GTFS `service_id`, identifying a source calendar rather than a canonical service |
| `weekly` | Explicit `null` for a date-only calendar, or inclusive `startDate` / `endDate` and seven boolean `weekdays` |
| `exceptions` | Unique ISO civil dates with explicit boolean `available`, sorted by date |

The [GTFS calendar reference](https://gtfs.org/documentation/schedule/reference/#calendartxt)
defines weekly bounds and date overrides. The lookup applies a matching addition
or removal before weekly rules, including additions outside the weekly range.
With no override, the date must be in the inclusive range and have its weekday
enabled. A date-only calendar has no implicit weekly service. Removal-only rules
and an all-disabled weekly calendar can represent no active dates without
inventing coverage. A missing source definition is rejected.

```ts
const calendar = scheduledServiceCalendarFromGtfs(tables, 'SERVICE_WD');
const enabled = isScheduledServiceDate(calendar, '2026-01-05');
```

The parser requires literal source weekday flags `0` or `1`, exception types
`1` or `2`, valid eight-digit source dates and a unique weekly row. Duplicate
exception dates fail even if their values agree. Invalid civil dates, inverted
bounds, omitted flags and unsupported enum values fail rather than silently
selecting a row or defaulting to no service. Parsing preserves source records;
reordered exception rows yield identical compact output.

The date lookup validates its input and uses the supplied civil service date,
independently of the host timezone. It does not expand a year into date arrays,
infer public holidays from identifiers, or choose the service day for a wall-clock
query. The future consumer must consider the previous service day's after-midnight
[stop-time offsets](gtfs-scheduled-stop-times.md) separately from the current day.
The [service-day time helper](gtfs-service-day-instants.md) converts each chosen
date/offset independently to an instant; it does not select calendar coverage.
A valid calendar does not establish canonical allocation, reviewed semantics,
snapshot lineage or publication eligibility. Existing reconciliation and review
paths retain their current date logic and outputs.

The read-only check of verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
compared every date in each source range, plus the day before and after, against
`activeServiceDates`. All 1,101 comparisons matched:

| Source calendar | Actual enabled dates in 2026 | Exception rows |
| --- | ---: | ---: |
| `SERVICE_PH` | 52 Sundays | 0 |
| `SERVICE_WD` | 261 weekdays | 0 |
| `SERVICE_WE` | 52 Saturdays | 0 |

These are source-calendar observations; `PH` does not establish public-holiday
coverage. Serializing each compact calendar with `JSON.stringify` plus a newline,
sorted by provider ID, gives SHA-256
`67b8776fb9f53c1ee1c9a712d320bd7f48f5bab474472efb6b4e242d4a07ca8d`.
The audit does not publish or approve scheduled departures.
