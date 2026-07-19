# LTA Station Exit Layout Data

## Scope

Canonical `station.layout` data comes exclusively from the Land Transport
Authority's **LTA MRT Station Exit (GEOJSON)** dataset. The layout model mirrors
only fields supported by that source: exit identity, label, coordinates,
checksum, and source update date.

The source does not provide levels, platforms, transfer paths, road names,
nearby landmarks, paid-area status, accessibility details, temporary closure
status, or passenger-flow guidance. Those fields must not be added to
`station.layout` from operator websites, maps, community sources, or manual
inference.

Stations with no feature in the LTA dataset have no `layout` property. A layout
is not evidence that a station is currently open; the dataset also includes
some future or unopened stations.

## Source and Licence

- Dataset: [LTA MRT Station Exit (GEOJSON)](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view)
- Dataset ID: `d_b39d3a0871985372d7e1637193335da5`
- Publisher: Land Transport Authority
- Licence: [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence)
- Canonical source ID: `lta-mrt-station-exit-geojson`

The current canonical import was retrieved on 19 July 2026. See
`LICENSE-DATA.md` for the repository's attribution notice and the boundary
between upstream LTA material and MRTDown's normalization.

## Canonical Shape

```json
{
  "layout": {
    "sourceId": "lta-mrt-station-exit-geojson",
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
    ]
  }
}
```

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

## Import Workflow

Download the GeoJSON file from the dataset page, then run:

```bash
npm run data:import:lta-station-exits -- /path/to/LTAMRTStationExitGEOJSON.geojson
npm run data:validate
```

The importer:

- matches source features to canonical stations by English name or station
  code;
- replaces every source-backed layout instead of merging with existing layout
  content;
- removes `layout` from stations absent from the source;
- fails when a source feature cannot be matched, an object ID is duplicated,
  or the number of written exits differs from the number of source features;
- produces deterministic ordering and formatting, so rerunning the same source
  is idempotent.

Any future layout expansion must first be present in this same LTA dataset and
must preserve its applicable upstream licence notice.
