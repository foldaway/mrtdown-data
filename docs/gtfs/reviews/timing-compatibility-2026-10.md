# October 2026 GTFS timing compatibility checks

These read-only checks used one verified schedule ZIP with SHA-256
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`.
The [timing reference](../reference/service-day-timing.md) covers current
semantics. The timing checks hash rows serialized with `JSON.stringify` plus
a newline per row. The artifact check hashes exact file bytes.

## Stop times

The parser accepted all 349,768 rows, including 5,313 with an offset at or
beyond 24:00 and 8,448 repeat visits. All rows supplied both times. Precision
defaulted to exact and the maximum offset was 90,292 seconds.
The parsed rows in source order give SHA-256
`1e23c844c26bba07fd000cdfabff1cc971a822c7849873973d0fdd6db7943be8`.

## Service calendars

All 1,101 comparisons against `activeServiceDates` matched. The check covered
every date in each source range plus the day before and after.

| Source calendar | Actual enabled dates in 2026 | Exception rows |
| --- | ---: | ---: |
| `SERVICE_PH` | 52 Sundays | 0 |
| `SERVICE_WD` | 261 weekdays | 0 |
| `SERVICE_WE` | 52 Saturdays | 0 |

The compact calendars in provider ID order give SHA-256
`67b8776fb9f53c1ee1c9a712d320bd7f48f5bab474472efb6b4e242d4a07ca8d`.

## Service-day instants

Using the synthetic anchor date `2026-01-01`, all 68,677 distinct arrival and
departure offsets matched their supplied elapsed seconds. This includes 2,264
offsets at or after 24:00, up to 90,292 seconds. The test covered time conversion
on that single date. The `[offsetSeconds, instant]` pairs in ascending offset
order give SHA-256
`afd36b50eae5b00e2f60f0cce72cba81b428fe86ce2f8009b2b8f70e6832ee9c`.

## Source-trip timing

The assembler retained all 19,150 trips and 349,768 occurrences, including
8,448 repeat visits and 5,313 occurrences at or after 24:00. The source tables
were unchanged. The assembled trips in returned order give SHA-256
`f55c11a40b5ae5643c49956eb419caca8b5a0f234dc83be50e6b23634c82164c`.

## Trips on a service date

Each trip was resolved on its calendar's first enabled date. These were
`2026-01-04` for `SERVICE_PH`, `2026-01-01` for `SERVICE_WD`, and `2026-01-03`
for `SERVICE_WE`. All 19,150 trips, 349,768 occurrences, and 699,536 supplied
time events kept their expected elapsed offsets. The resolved trips in provider
trip order give SHA-256
`9b9b5592bf2d8646b7e93559af7a51dccedba5a3dde328636cc5e2226725309d`.

## Artifact reproducibility

A local check wrapped the retained October preview twice and produced identical
manifest, timetable and notice bytes. Verification preserved its
`e2fc66e75994c04f93d54dec55bd711d9cf5d170f1698b5ab730ab15e89c1d3c`
content digest and all 19,150 source trips. This used proposal metadata and
remained ineligible for generation.

The verified preparation path subsequently rebuilt that same bundle directly
from the October ZIP and full version-3 mapping draft. All three files matched
byte for byte, including manifest SHA-256
`4dc1ef4abd15e8ec7f8704be960a6cec437c3474b6071cb04dc9128a920963c1`.
The review recorded 1,502,097 assigned and 990,143 unassigned trip/date pairs.
