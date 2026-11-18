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
