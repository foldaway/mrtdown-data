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

## EWL westbound destinations

`EWL_MAIN_W` keeps its historical revisions and current Pasir Ris–Tuas Link
path. `EWL_MAIN_W_JKN` represents recurring westbound trips terminating at Joo
Koon. The short working began with passenger service on the Tuas West Extension
on 2017-06-18: the [opening speech](https://www.nas.gov.sg/archivesonline/data/pdfdoc/20170616003/2M%20Ng%20Chee%20Meng%20Speech%20for%20TWE%20Opening%20Ceremony.pdf)
dates the opening, [contemporary reporting of SMRT's service announcement](https://www.straitstimes.com/singapore/transport/trains-at-4-new-stations-on-east-west-lines-tuas-west-extension-to-start-plying)
describes alternate trains continuing past Joo Koon, and a
[June 2017 on-site account](https://railtravelstation.com/tuas-west-extension-gul-circle-tuas-crescent-tuas-west-road-and-tuas-link/)
observes the two destinations. The checked
[25 November 2026 LTA GTFS capture](../gtfs/captures/b7b98314655137f0c499897d17a734abe42b76d15a47f5104db32778583fac4c.md)
also contains distinct Joo Koon and Tuas Link headsigns and stopping paths.
The Joo Koon operating hours enclose the 2026 capture's first origin departure
and last terminal arrival; the weekend range covers both Saturday and Sunday.
They do not establish exact hours for earlier years.

Existing `firstLastTrain` entries are retained under `EWL_MAIN_W`; they have not
been reclassified by destination. Confirm destination-specific passenger timing
sources before adding `EWL_MAIN_W_JKN` entries. GTFS mapping proposals from
earlier canonical commits also need reassessment against the new service ID.

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
