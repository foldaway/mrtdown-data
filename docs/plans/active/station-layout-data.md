# Station Layout Data

## Scope

Canonical `station.layout` data has two distinct source boundaries:

- `exits` come exclusively from the Land Transport Authority's **LTA MRT
  Station Exit (GEOJSON)** dataset; and
- `platforms` are MRTDown-authored factual records supported by independent
  personal observation or recollection, or by a recorded same-line platform
  label inference rooted in directly observed canonical platforms.

The LTA exit source provides exit identity, label, coordinates, checksum, and
source update date. It does not provide platforms. The platform schema is
deliberately narrower than the earlier mixed-source layout model: it supports
only a station-local ID, public label, last-reviewed date, line, and optional
scheduled services or non-boardable status.

Levels, transfer paths, road names, nearby landmarks, paid-area status,
accessibility details, door counts, access points, and passenger-flow guidance
remain out of scope. They must not be copied from operator websites, maps,
Google Maps, Google Street View, community databases, or unlicensed photos.

A station may have exits, platforms, or both. A layout is not evidence that a
station is currently open; the LTA dataset also includes some future or
unopened stations.

## LTA Exit Source and Licence

- Dataset: [LTA MRT Station Exit (GEOJSON)](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view)
- Dataset ID: `d_b39d3a0871985372d7e1637193335da5`
- Publisher: Land Transport Authority
- Licence: [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence)
- Canonical source ID: `lta-mrt-station-exit-geojson`

The current canonical import was retrieved on 19 July 2026. See
`LICENSE-DATA.md` for the attribution notice and the boundary between upstream
LTA material and MRTDown's normalization.

`layout.exitSourceId` applies only to `layout.exits`. Platform records do not
inherit the LTA source or licence.

## Canonical Shape

```json
{
  "layout": {
    "exitSourceId": "lta-mrt-station-exit-geojson",
    "exits": [
      {
        "sourceObjectId": 21404,
        "sourceChecksum": "122980157DCB57C6",
        "label": "1",
        "lastUpdated": "2025-12-02",
        "geo": {
          "latitude": 1.3987872483653485,
          "longitude": 103.81800341495403
        }
      }
    ],
    "platforms": [
      {
        "id": "YIS_NSL_1",
        "label": "1",
        "lastUpdated": "2026-07-19",
        "lineId": "NSL",
        "serviceIds": ["NSL_MAIN_S"]
      }
    ]
  }
}
```

`exitSourceId` and `exits` must appear together. Either `exits` or `platforms`
must be present. Empty placeholder arrays are not valid.

## Exit Import

The importer maps source fields as follows:

| LTA field | Canonical field | Rule |
| --- | --- | --- |
| `OBJECTID` | `sourceObjectId` | Preserve as the stable feature identity. |
| `INC_CRC` | `sourceChecksum` | Preserve exactly for source-change detection. |
| `EXIT_CODE` | `label` | Trim whitespace and a leading `Exit `. |
| `FMEL_UPD_D` | `lastUpdated` | Convert the source timestamp to `YYYY-MM-DD`. |
| GeoJSON point | `geo` | Convert `[longitude, latitude]` to named coordinates. |

Exit labels are not unique in the upstream dataset, so duplicate labels within
a station are valid. `sourceObjectId` must be unique across the repository.

Download the GeoJSON file from the dataset page, then run:

```bash
npm run data:import:lta-station-exits -- /path/to/LTAMRTStationExitGEOJSON.geojson
npm run data:validate
```

The importer:

- matches source features to canonical stations by English name or station
  code;
- replaces the LTA-backed exit fields while preserving independently sourced
  platforms;
- removes `exitSourceId` and `exits` from stations absent from the source, and
  removes `layout` only when no platforms remain;
- fails when a source feature cannot be matched, an object ID is duplicated,
  or the number of written exits differs from the number of source features;
- produces deterministic ordering and formatting, so rerunning the same source
  is idempotent.

## Platform Provenance Policy

Personal observation or personal recollection is the unwritten default source
for a platform record without `inference`. The canonical JSON does not repeat
that default or store contributor or confidence metadata. Git history preserves
authorship and review context.

An inferred platform must include:

```json
{
  "inference": {
    "method": "same-line-platform-label",
    "basis": [
      {
        "stationId": "SOM",
        "platformId": "SOM_NSL_A"
      }
    ]
  }
}
```

Every basis must identify a directly observed canonical platform at another
station with the same line and public label. Inference may not be chained. Each
inferred scheduled service must also appear on at least one basis platform.
This records the reasoning without treating a service direction as the
platform's permanent identity: `serviceIds` remain a dated assignment hosted by
the independently identified platform.

Same-line inference is limited to ordinary through-stations. Interchanges,
termini, branch junctions, repeated loop stops, conflicting observations, and
other structurally ambiguous stations require direct review. The temporary
inference tool must leave those cases unapplied by default.

Run a dry report or apply the eligible subset with:

```bash
npm run data:platforms:infer -- --write /tmp/platform-inference.json
npm run data:platforms:infer -- --apply --write /tmp/platform-inference.json
```

`lastUpdated` is the exact `YYYY-MM-DD` date when the complete platform record
was last reviewed and accepted as the current canonical fact. Updating any
platform field requires reviewing the whole record and advancing that date.

A contributor's own photograph may be retained privately as corroboration for
their personal observation, but photographs are not a canonical evidence kind
and no photograph attribution or licence metadata is stored in station data.
External photos, Google Maps, Google Street View, Google-hosted user photos,
operator maps, agency websites, and community databases may be used to test the
general inference hypothesis but are not canonical provenance and must not be
referenced from platform records.

Repository validation additionally requires unique station-local platform
IDs, valid line and service references, a platform line assigned to the
station, and platform services belonging to that line and serving the station
in a revision active on `lastUpdated`. Inference bases must exist, belong to the
same line and label, predate or match the inferred review date, be directly
observed, and support every inferred service assignment.
