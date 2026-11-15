# GTFS service-day timing

## Service dates and clock time

A trip keeps the service date on which it started, even when it runs past
midnight. In Singapore, January 1 at `25:00` and January 2 at `01:00` both
resolve to January 1 at `17:00Z`. Check calendar eligibility for each trip's
own service date. A removal on January 2 leaves the January 1 trip eligible,
and two eligible events at the same instant remain distinct occurrences.

Conversion uses the GTFS local-noon-minus-twelve-hours anchor in `Asia/Singapore`
and adds elapsed seconds. This preserves offsets beyond 24 or 48 hours, works
across historical offset changes, and avoids relying on the host timezone.
See the [instant conversion tests](../../../packages/core/src/helpers/scheduledServiceDayInstant.test.ts)
and [trip-on-date examples](../../../packages/core/src/helpers/scheduledTripTimesOnDate.test.ts).
For a clock-time query, use the [departure window guide](scheduled-departure-windows.md#finding-candidate-service-dates)
to find all relevant service dates.

## Calendar availability

An explicit addition or removal takes precedence over the weekly schedule,
including additions outside its bounds. Date-only calendars operate only on
added dates. Source IDs carry no holiday authority. The October capture's
`SERVICE_PH` calendar selected Sundays, so holiday substitutions need an
explicit [reviewed policy](../reviews/holiday-mapping-review.md). See the
[calendar schema](../../../packages/core/src/schema/ScheduledServiceCalendar.ts)
and [parser tests](../../../packages/fs/src/gtfs/scheduledServiceCalendar.test.ts).

## Stop occurrences

Use the original decimal sequence and provider trip ID to identify an
occurrence within a source service date. Repeated visits to a stop stay
separate. Sequence comparisons use exact decimal ordering, so `01` and `1`
conflict even though the original text is retained.

Missing approximate times stay `null`. An explicit zero means a supplied event
at the service-day anchor. Precision and arranged pickup or drop-off rules
carry through to consumers. The [stop-time schema](../../../packages/core/src/schema/ScheduledStopTime.ts)
and [trip assembler tests](../../../packages/fs/src/gtfs/scheduledTripTimes.test.ts)
cover field and ordering constraints.

The [October compatibility report](../reviews/timing-compatibility-2026-10.md)
records counts and digests from a verified capture.
