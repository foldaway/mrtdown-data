# Station Layout Data Plan

## Context

Station records currently contain identity, translated names, coordinates,
station codes, landmarks, and town membership. They do not yet describe the
current physical station layout: levels, station exits, platforms,
platform-to-service mapping, doors, vertical circulation, or interchange
movement inside the paid area.

The `mrtdown-site` station and line pages already derive titles, meta
descriptions, Open Graph metadata, sitemaps, and `TrainStation` JSON-LD from
canonical station, line, town, landmark, and issue data. This repository should
therefore add durable station facts that the site can render visibly and expose
as structured data, instead of adding site-specific SEO strings.

This plan adds current-state station layout data directly to
`data/station/*.json`. Layout is station-owned data for authoring purposes, so
it should stay embedded with the station record instead of moving to a separate
collection.

Related references:

- `packages/core/src/schema/Station.ts`
- `packages/core/src/schema/Service.ts`
- `packages/fs/src/validate.ts`
- `docs/plans/active/gtfs-static-realtime.md`

## Goals

- Model current station levels and public platforms inside station records.
- Map each platform to the full scheduled service patterns that normally board
  from it.
- Record useful door-level anchors without enumerating every door by default.
- Record stairs, escalators, lifts, travellators, and other access points near
  platform doors.
- Record public station exits with stable labels, coordinates where available,
  and useful landmark or road associations.
- Record interchange and transfer paths between platforms or access points.
- Add station-root discovery metadata that helps downstream consumers identify
  and describe stations: addresses, aliases, external references, and reviewed
  source identifiers.
- Keep the shape compatible with later GTFS `stops.txt`, `levels.txt`,
  `pathways.txt`, and `transfers.txt` generation.
- Add deterministic validation for references and common authoring mistakes.

## Non-Goals

- This plan does not track historical station layout revisions.
- This plan does not store source or provenance fields on station layout data.
- This plan does not require every platform door to be enumerated when a door
  count and nearest-door anchors are enough.
- This plan does not attempt detailed CAD geometry or public wayfinding map
  rendering.
- This plan does not model temporary works, temporary platform closures, or
  incident-specific access restrictions as static station layout.
- This plan does not add hand-authored page titles or meta descriptions. The
  site should continue deriving them from canonical station facts.

## Station Discovery Metadata

Some SEO-relevant station facts are not layout internals and should live at the
station root next to `geo`, `stationCodes`, `landmarkIds`, and `townId`.

```json
{
  "address": {
    "streetAddress": "20 Tampines Central 1",
    "postalCode": "529538",
    "addressLocality": "Singapore",
    "addressCountry": "SG"
  },
  "aliases": ["Tampines MRT", "Tampines MRT Station", "EW2", "DT32"]
}
```

Initial fields:

- `address`: structured postal address suitable for visible station pages and
  `TrainStation`/`SubwayStation` structured data. Keep fields optional because
  reliable source coverage may vary.
- `aliases`: reviewed alternate names, search variants, station-code phrases,
  and common public names that should not be inferred from templates alone.

Rules:

- Do not duplicate generated aliases that every consumer can safely derive,
  unless the phrase is a real public search form worth preserving.
- Use `address.addressCountry = "SG"` for Singapore station addresses.
- Preserve `geo` as the authoritative station point; exit-specific coordinates
  belong in `layout.exits`.

## Source Policy

Seed station layout data from official operator or agency sources wherever
available, such as LTA, SMRT, SBS Transit, operator station pages, official
wayfinding maps, OneMap, or station signage reviewed directly. Transport
enthusiast sites, wiki pages, blogs, and route guides can be used as
non-authoritative cross-checks, but they should not be the source of record for
canonical layout facts.

When an official source does not expose a needed layout detail, leave that
field absent until it can be reviewed from an official source or direct
observation. Do not fill canonical layout fields solely from enthusiast
secondary sources.

## Station Record Shape

Add an optional `layout` object to `StationSchema`:

```json
{
  "layout": {
    "levels": [],
    "exits": [],
    "platforms": [],
    "transferPaths": []
  }
}
```

Layout data is current state. If a station changes, update the embedded layout
to the new current state in the same way the canonical station record is
updated.

## Levels

Levels identify station floors for platforms and access points.

```json
{
  "id": "B2",
  "index": -2,
  "name": {
    "en-SG": "EWL and TEL platforms",
    "zh-Hans": null,
    "ms": null,
    "ta": null
  }
}
```

Rules:

- `id` is station-local and stable enough for references inside the station
  record.
- `index` is relative floor order: street level can be `0` or `1`, underground
  levels are negative, elevated levels are positive.
- `name` uses the existing translations shape.

## Exits

Exits describe public station entrances and exits at street or concourse level.
They are station-owned because exit labels, nearby landmarks, and station
access routing are part of the passenger-facing station layout.

```json
{
  "id": "TAM_EXIT_A",
  "label": "A",
  "levelId": "L1",
  "geo": {
    "latitude": 1.35395,
    "longitude": 103.94501
  },
  "nearbyLandmarkIds": ["tampines-mall"],
  "roadNames": ["Tampines Central 1"],
  "paidArea": false,
  "accessibility": {
    "stepFree": true,
    "lift": true
  }
}
```

Initial fields:

- `id`: station-local id.
- `label`: public exit label such as `A`, `B`, `1`, or `Exit A`.
- `levelId`: optional reference to `layout.levels`.
- `geo`: optional exit coordinate when a reviewed source provides it.
- `nearbyLandmarkIds`: optional references to existing landmark records.
- `roadNames`: optional visible road or street names associated with the exit.
- `paidArea`: whether the exit is inside the paid area. Most public exits
  should be `false`.
- `accessibility`: optional stable accessibility facts for the exit.

Rules:

- Prefer source-provided exit coordinates over approximations.
- Use `nearbyLandmarkIds` for landmarks already modeled in
  `data/landmark`; use `roadNames` for roads that are not landmarks.
- Keep exit labels as strings because public labels are not always numeric.
- Do not model temporary construction diversions as static exits.

## Platforms

Platforms represent public boarding areas. They should reference full scheduled
service patterns through `serviceIds`.

```json
{
  "id": "OTP_EWL_A",
  "label": "A",
  "lineId": "EWL",
  "levelId": "B2",
  "serviceIds": ["EWL_MAIN_E"],
  "doorCount": 24,
  "accessPoints": []
}
```

Rules:

- Use `serviceIds`, not `towardsStationId`. The service path is the source of
  truth for direction, stopping pattern, and terminal.
- Use an array because platforms can host multiple scheduled patterns.
- `doorCount` is preferred over enumerating every door when doors have no
  individual metadata.
- Keep `lineId` for simple validation and authoring, even though it can be
  derived from services.

## Access Points

Access points describe useful platform features for passenger routing and
wayfinding. They are anchored to doors when possible.

```json
{
  "id": "OTP_EWL_A_ESC_01",
  "kind": "escalator",
  "nearestDoor": "12",
  "position": "middle",
  "connectsToLevelId": "B1",
  "direction": "up"
}
```

Initial `kind` values:

- `stairs`
- `escalator`
- `lift`
- `travellator`
- `ramp`
- `gate`
- `concourse_link`
- `other`

Initial `position` values:

- `front`
- `middle`
- `rear`
- `unknown`

Rules:

- `nearestDoor` is a string because public door labels may not always be plain
  numbers.
- `direction` is optional and should be used only where it is stable and
  meaningful: `up`, `down`, `bidirectional`, or `unknown`.
- Full `doors` arrays can be added later if doors need individual metadata.

## Transfer Paths

Transfer paths describe public movement between platforms or access points.

```json
{
  "id": "OTP_EWL_TEL_PAID_LINK",
  "from": {
    "kind": "platform",
    "id": "OTP_EWL_A"
  },
  "to": {
    "kind": "platform",
    "id": "OTP_TEL_E"
  },
  "paidArea": true,
  "modes": ["walk", "escalator"],
  "levelChange": 0,
  "classification": "short",
  "estimatedTraversalSeconds": null,
  "distanceMeters": null
}
```

Initial endpoint `kind` values:

- `platform`
- `access_point`
- `level`

Initial `modes` values:

- `walk`
- `stairs`
- `escalator`
- `lift`
- `travellator`
- `ramp`

Initial `classification` values:

- `same_platform`: same platform or cross-platform transfer.
- `short`: expected to be under 2 minutes.
- `medium`: expected to be 2 to 5 minutes.
- `long`: expected to be 5 to 10 minutes.
- `out_of_station`: public out-of-station interchange.
- `not_recommended`: physically possible but poor passenger routing.
- `restricted`: not normally available to the public.
- `unknown`: usable when the path is known but distance is not.

The classification is intentionally coarse. It is useful for routing and user
interfaces without pretending that all stations have measured distance data.

## Validation

Add validation that catches:

- duplicate level, platform, access point, and transfer path ids within a
  station;
- duplicate exit ids and duplicate public exit labels within a station;
- station address country values that are not valid ISO country codes;
- malformed external URLs and unsupported external ref keys;
- duplicate station aliases after case-insensitive normalization;
- exit `levelId` values that do not exist in `layout.levels`;
- exit `nearbyLandmarkIds` values that do not exist;
- platform `lineId` values that do not exist;
- platform `levelId` values that do not exist in `layout.levels`;
- platform `serviceIds` values that do not exist;
- services whose `lineId` differs from the platform `lineId`;
- transfer endpoints that do not reference an existing level, platform, or
  access point;
- access point `connectsToLevelId` values that do not exist;
- invalid `nearestDoor` values when `doorCount` is present and the door label
  is numeric;
- stations with no `layout` continuing to validate.

## Phases

### Phase 1: Schema

- Add layout schemas to `packages/core/src/schema/Station.ts`.
- Add station-root schemas for `address` and `aliases`.
- Keep all new station fields optional to avoid a full-network migration.
- Export inferred TypeScript types from the core package.

Exit criteria:

- Existing station JSON validates unchanged.
- New fixture station records can exercise levels, platforms, access points,
  exits, transfer paths, address metadata, and aliases.

### Phase 2: Repository Validation

- Add layout reference validation in `packages/fs/src/validate.ts`.
- Add tests for missing references, duplicate ids, duplicate aliases,
  service-line mismatches, and numeric door bounds.
- Keep validation deterministic and offline.

Exit criteria:

- Broken layout references fail `npm run data:validate`.
- Stations without layout data remain valid.

### Phase 3: Fixtures

- Extend generated fixture data with:
  - a simple non-interchange station;
  - a same-platform or cross-platform interchange;
  - a complex interchange with multiple levels and access-point anchored
    transfer paths;
  - a station with multiple exits, address metadata, aliases, and external
    refs.

Exit criteria:

- Package and CLI tests cover representative layout shapes.

### Phase 4: Seed Real Data

- Seed `CDT` first as a narrow CCL/TEL platform-to-service mapping slice
  because its reviewed platform direction data maps cleanly to current service
  patterns. The CCL rows use the current pre-CCL6 service catalog until the CCL6
  service revisions are added.
- Keep `OTP` as a later complete-layout candidate because it covers three
  lines, multiple platform levels, door-anchored access points, and multiple
  transfer path classifications.
- Include reviewed station-root discovery metadata in the first station PR
  where reliable: address and aliases.
- Include public exits for the first station if reviewed exit labels and
  coordinates are available.
- Keep the first data PR small enough for manual review.
- The initial seed can start with platform-to-service mappings before levels,
  exits, or access points when only platform direction data is reviewed.

Exit criteria:

- One real station has useful current-state layout data.
- The same station has enough discovery metadata for downstream visible page
  content and structured data.
- Validation catches intentional broken edits in tests.

### Phase 5: GTFS Mapping

- Map station-level stops and platform child stops without changing existing
  station ids.
- Map levels to GTFS `levels.txt`.
- Map access points and transfer paths to GTFS `pathways.txt` where useful.
- Map coarse transfer rules to GTFS `transfers.txt` where they have a clear
  consumer-facing meaning.

Exit criteria:

- GTFS export can include platform and pathway data for stations that have
  layout data while omitting it for stations that do not.
