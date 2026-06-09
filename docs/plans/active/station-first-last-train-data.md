# Station First And Last Train Data Plan

## Context

Station records currently do not store published first and last train timings.
Service records already describe ordered station paths and operating windows,
but the service catalog is intentionally incomplete: it does not yet include
every full scheduled stopping pattern, including short workings that appear in
first and last train tables.

This plan adds current first/last train timing data directly to
`data/station/*.json`. Timing rows reference `serviceId`, where a service is the
full scheduled stopping pattern. A last-train short working should therefore be
represented as a distinct service rather than as a destination override on the
timing row.

Related references:

- `packages/core/src/schema/Station.ts`
- `packages/core/src/schema/Service.ts`
- `packages/fs/src/validate.ts`
- `docs/plans/active/station-layout-data.md`
- `docs/plans/active/gtfs-static-realtime.md`

## Goals

- Store current published first and last train timings in station records.
- Reference full scheduled stopping patterns through `serviceId`.
- Support rows that have only a first train, only a last train, or both.
- Support calendar categories used by operator timing tables.
- Validate that the station appears in every referenced service path.
- Validate platform coverage when station layout data exists.
- Keep the shape compatible with later GTFS timetable or frequency generation.

## Non-Goals

- This plan does not store source or provenance fields on timing data.
- This plan does not introduce timing revision history in the first
  implementation.
- This plan does not model temporary early closures, late openings, or holiday
  extensions as baseline first/last train data.
- This plan does not require the full scheduled service catalog to be completed
  before one station or one line slice can be seeded.
- This plan does not generate complete stop-by-stop timetables.

## Service Semantics

For first/last train data, `serviceId` must mean a full scheduled stopping
pattern:

- direction;
- branch;
- stopping sequence;
- terminal;
- recurring public short working, when relevant.

Do not add `terminatingAtStationId` to timing rows. If a first or last train
terminates before the normal line terminal, add or reference a service whose
path ends at that station.

Example services:

- `TEL_MAIN_N`: northbound main TEL stopping pattern to the normal terminal.
- `TEL_MAIN_N_TO_ORC`: northbound short-working pattern ending at Orchard.

The exact naming convention can be settled when the expanded service catalog is
implemented, but the semantic boundary should be documented before timing data
lands.

## Station Record Shape

Add an optional `firstLastTrain` object to `StationSchema`:

```json
{
  "firstLastTrain": {
    "services": [
      {
        "serviceId": "TEL_MAIN_N",
        "times": {
          "weekday": {
            "firstTrain": "06:07",
            "lastTrain": "00:07"
          },
          "saturday": {
            "firstTrain": "06:07",
            "lastTrain": "00:07"
          },
          "sunday_public_holiday": {
            "firstTrain": "06:27",
            "lastTrain": "00:07"
          }
        },
        "specialTimes": {
          "eve_public_holiday": {
            "firstTrain": null,
            "lastTrain": "00:35"
          }
        }
      },
      {
        "serviceId": "TEL_MAIN_N_TO_ORC",
        "times": {
          "weekday": {
            "firstTrain": null,
            "lastTrain": "00:25"
          },
          "saturday": {
            "firstTrain": null,
            "lastTrain": "00:25"
          },
          "sunday_public_holiday": {
            "firstTrain": null,
            "lastTrain": "00:25"
          }
        }
      }
    ]
  }
}
```

Rules:

- `serviceId` is required.
- `times` is keyed by normal calendar category.
- `specialTimes` is keyed by recurring special calendar category.
- Timing values always use the same shape:
  `{ "firstTrain": "HH:mm" | null, "lastTrain": "HH:mm" | null }`.
- At least one of `times` or `specialTimes` must be present for each service.
- In every timing value, `firstTrain` and `lastTrain` are nullable, but at
  least one must be non-null.
- Times are local operating-day times in Singapore time. Values after midnight
  should use the displayed clock time, such as `00:25`, unless GTFS generation
  later needs a derived service-day offset.

## Calendar Categories

Start with the categories used by published operator tables:

- `weekday`
- `saturday`
- `sunday_public_holiday`
- `weekday_saturday`
- `daily`

Add more normal categories only when a published table requires them. Candidate
future categories:

- `school_holiday`
- `special`

Start with these recurring special categories:

- `eve_public_holiday`

Calendar categories should be data categories first. Any mapping to GTFS
`calendar.txt` or `calendar_dates.txt` can happen in generator metadata later.

## Source Policy

Seed first/last train timings from official operator or agency sources, such as
SMRT, SBS Transit, LTA, or published operator station pages. Transport
enthusiast sites, wiki pages, blogs, and route guides can be useful for manual
sanity checks, but they should not be the authoritative source for canonical
timing values.

When official sources disagree or expose different levels of detail, prefer the
source that directly represents the operator-published passenger timing table.
Do not add reusable ingestion scripts for undocumented operator APIs unless a
later plan explicitly accepts that maintenance risk.

## Seeded Data Notes

The first narrow seeds are intentionally hand-reviewed station records rather
than outputs from a reusable operator ingest script:

- `CDT` seeds one SMRT-operated CCL/TEL platform relationship slice at an
  interchange station, including current pre-CCL6 CCL main-service timings.
- `LTI` seeds one SBS Transit-operated interchange slice from the public SBS
  Transit first/last train page, covering both NEL and DTL timing table shapes.

## Platform Relationship

When a station also has `layout.platforms`, first/last train validation should
check whether each timing `serviceId` is served by at least one platform in the
same station.

This keeps timing rows simple:

```json
{
  "serviceId": "TEL_MAIN_N",
  "times": {
    "weekday": {
      "firstTrain": "06:07",
      "lastTrain": "00:07"
    }
  }
}
```

The platform can be derived from:

```json
{
  "id": "OTP_TEL_E",
  "serviceIds": ["TEL_MAIN_N"]
}
```

If later data proves that the same service uses different platforms by time of
day, the exception should be represented in the service catalog or a narrowly
scoped timing-platform override, not added prematurely.

## Validation

Add validation that catches:

- timing `serviceId` values that do not exist;
- timing rows where the station is not in the referenced service path;
- rows with both `firstTrain` and `lastTrain` set to `null`;
- invalid local time values;
- duplicate rows for the same `serviceId`;
- timing rows whose `serviceId` is not present on any station layout platform
  when layout data exists;
- stations with no `firstLastTrain` continuing to validate.

## Phases

### Phase 1: Schema

- Add `firstLastTrain` schemas to `packages/core/src/schema/Station.ts`.
- Add a reusable enum or schema for first/last train calendar categories.
- Keep the field optional so existing station data validates unchanged.

Exit criteria:

- Existing station JSON validates unchanged.
- Fixture station records can include first-only, last-only, and first-plus-last
  rows.

### Phase 2: Service Catalog Semantics

- Document that service records represent full scheduled stopping patterns.
- Add naming guidance for short workings and branch-specific patterns.
- Add fixture services for at least one normal through service and one short
  working.

Exit criteria:

- First/last timing examples do not need destination fields.
- Validation can derive terminal and direction from the referenced service.

### Phase 3: Repository Validation

- Add timing validation in `packages/fs/src/validate.ts`.
- Validate service existence and station membership.
- Add cross-validation with `layout.platforms[].serviceIds` when layout exists.
- Add deterministic tests for invalid references, invalid time rows, duplicate
  rows, and missing platform coverage.

Exit criteria:

- Broken first/last train rows fail `npm run data:validate`.
- Stations without timing data remain valid.

### Phase 4: Seed One Slice

- Seed one small reviewed slice first, such as one station across all current
  services or one line across several representative stations.
- Include at least one short-working service if the published table has a
  last-train row for it.
- Keep the first data PR small enough for manual timetable review.

Exit criteria:

- The seeded slice demonstrates normal through service and short-working timing
  rows.
- The service catalog contains the stopping patterns needed by that slice.

### Phase 5: GTFS And Publication

- Decide whether first/last train data feeds timetable-like GTFS trips, a
  validation report, or both.
- Keep baseline first/last timings separate from temporary service-change issue
  evidence.
- Include timing coverage in generated Pages metadata once enough stations are
  populated for consumers.

Exit criteria:

- Downstream consumers can discover which station records include first/last
  train data.
- GTFS generation can use timing data without inventing destination semantics
  outside `serviceId`.
