# Canonical data

The dataset lives in `data/`. External GTFS files can be inspected locally.

| Data | Contents |
| --- | --- |
| `station/` | Stations, including exits and optional platform information. |
| `line/`, `service/`, `operator/`, `town/`, `landmark/` | The rail network and nearby places. |
| `public-holiday/` | Shared Singapore holiday calendars by year; see [public holidays](public-holidays.md). |
| `issue/YYYY/MM/<issue_id>/` | Issue metadata (`issue.json`), source evidence (`evidence.ndjson`), and append-only impact events (`impact.ndjson`). |
| `schematic-map/system/` | Map rules and design constraints; see the [map reference inventory](../schematic-map/reference-inventory.md). |
| `rights/source-registry.json` | Source rights and attribution rules. |
| External GTFS files | [GTFS guides](../gtfs/README.md) cover local inspection, mapping review, and timetable publication. |

Issue types are `disruption`, `maintenance`, and `infra`; ongoing issues use
open-ended periods.

Service names put secondary specifiers in parentheses, for example
`Main Service (Northbound)` or `East Loop (Inner)`. Chinese names use full-width
parentheses, for example `主线（北向）`.

Validate every data change with `npm run data:validate`. For station layout
updates, follow the [exit and platform source policy](station-layout.md).

## First and last train timings

Station `firstLastTrain` records describe recurring published timings, including
holiday categories where applicable. Reference the full stopping pattern by
`serviceId` so its path defines direction and destination; use a separate service
for a recurring short working. The [station schema](../../packages/core/src/schema/Station.ts)
owns the fields and calendar categories.

Use official operator or agency passenger tables. When sources differ, prefer
the table describing the operator's service directly; use third-party sites to
cross-check. Store Singapore clock times as published, including `00:25` after
midnight. Derive service-day offsets at a consuming timetable boundary when needed.
Record one-off early closures, late openings, and extensions as issue evidence.
Establish a stable source contract and maintenance process before automating imports.

Timing validation checks service paths independently of station layouts; it does
not establish service-to-platform assignments. Optional coverage reporting and
comparison with exact GTFS remain [follow-up work](../plans/tech-debt.md#station-timing-coverage).

## Licenses and sources

| Material | License or terms |
| --- | --- |
| MRTDown-authored data, curation, and export metadata | [CC-BY-4.0](../../LICENSE-DATA.md). |
| Code, scripts, tooling, and documentation | [MIT License](../../LICENSE-CODE.md). |
| LTA data in station exits | [Singapore Open Data Licence v1.0](../../LICENSE-DATA.md#singapore-open-data). |
| Third-party evidence | Upstream rights and terms apply; MRTDown does not relicense these materials. |

Observed platform facts and recorded inferences follow the
[station layout source policy](station-layout.md).
The [source registry](../../data/rights/source-registry.json) records recurring
source classes and attribution requirements.
