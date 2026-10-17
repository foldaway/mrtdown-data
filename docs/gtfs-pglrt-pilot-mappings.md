# Punggol LRT mapping pilot: proposed identities

These are concrete proposals for provider route `PG` and canonical line `PGLRT`
in the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [draft](gtfs-pglrt-pilot-draft.json),
[summary](gtfs-pglrt-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) retain the exact source manifest,
canonical commit and topology fingerprint. Canonical `data` matches pinned commit
`d034d6babef4ea5bcac256d26c47dcd802bb39ba`. The underlying schedule is supplied
by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

The standalone pilot has 60 proposed matches: one agency, one route, 15 station
parents, 30 platform stops and 13 patterns. Those patterns contain 2,935 distinct
source trip records and 1,721 pattern-date pairs. The full standalone draft keeps
1,064 other input records explicitly unresolved. No approval or exclusion is
created, and shared station/agency identities do not approve other services.

## Agency, route and ordered loops

Provider route `PG` references `SBST`, proposed as canonical operator `SBS` on
`PGLRT`. The canonical operator period covers all supplied 2026 active dates.
The one route ID contains all four loop shapes; it does not select clockwise,
counterclockwise, East or West service by itself.

Every source trip's raw `stop_times.txt` records were independently sorted by
`stop_sequence`. All 2,935 paths match their complete canonical revision exactly,
including the first and last town-centre occurrences:

| Proposed service | Actual ordered provider stop IDs | Town-centre platform | Revision and effective start |
| --- | --- | --- | --- |
| `PGLRT_E_CW` | `PTC_A → PE7_B → PE6_B → PE5_B → PE4_B → PE3_B → PE2_B → PE1_B → PTC_A` | 2 | `r_2011_damai`, 2011-06-20 |
| `PGLRT_E_CCW` | `PTC_B → PE1_A → PE2_A → PE3_A → PE4_A → PE5_A → PE6_A → PE7_A → PTC_B` | 1 | `r_2011_damai`, 2011-06-20 |
| `PGLRT_W_CW` | `PTC_B → PW7_B → PW6_B → PW5_B → PW4_B → PW3_B → PW2_B → PW1_B → PTC_B` | 1 | `r_2016_teck_lee`, 2024-08-15 |
| `PGLRT_W_CCW` | `PTC_A → PW1_A → PW2_A → PW3_A → PW4_A → PW5_A → PW6_A → PW7_A → PTC_A` | 2 | `r_2016_teck_lee`, 2024-08-15 |

Each revision has no end and covers the actual source dates. The West revision's
identifier contains `2016`, but its effective start is the recorded 2024-08-15;
the name must not replace that date. Station-code periods, including Teck Lee
`PW2`, also cover every matched date.

All 13 proposals have match type **`exact`**, not `contiguousSegment` or
`cyclicSegment`. There are no partial, rotated or multiple-circuit paths in this
pilot. Each trip has nine ordered stop occurrences and eight distinct physical
stop IDs: Punggol town centre appears twice at the same provider stop, surrounding
seven intermediate stations. Preserve both town-centre occurrences and their
separate sequence/time values. Deduplicating the stop IDs would destroy the
return arrival and the provider occurrence identity used by future trip updates.

## The 13 source patterns and direction metadata

Source `direction_id` does not reliably select a loop service even within this
capture. In particular, the weekday East-clockwise path appears in two distinct
patterns: 170 trip records carry direction `0`, and 115 carry direction `1`.
Both retain their own provider pattern IDs, source digests and trip identities;
the draft neither merges them nor repairs their source direction values.

| Calendar | Source direction | Ordered-loop match | Trip records |
| --- | --- | --- | ---: |
| `SERVICE_WD` | 0 | `PGLRT_E_CW` | 170 |
| `SERVICE_WD` | 1 | `PGLRT_E_CW` | 115 |
| `SERVICE_WD` | 1 | `PGLRT_E_CCW` | 285 |
| `SERVICE_WD` | 0 | `PGLRT_W_CW` | 223 |
| `SERVICE_WD` | 1 | `PGLRT_W_CCW` | 223 |
| `SERVICE_WE` | 0 | `PGLRT_E_CW` | 170 |
| `SERVICE_WE` | 1 | `PGLRT_E_CCW` | 252 |
| `SERVICE_WE` | 0 | `PGLRT_W_CW` | 230 |
| `SERVICE_WE` | 1 | `PGLRT_W_CCW` | 234 |
| `SERVICE_PH` | 0 | `PGLRT_E_CW` | 330 |
| `SERVICE_PH` | 1 | `PGLRT_E_CCW` | 248 |
| `SERVICE_PH` | 0 | `PGLRT_W_CW` | 226 |
| `SERVICE_PH` | 1 | `PGLRT_W_CCW` | 229 |

The weekday East-clockwise IDs begin `054a6add…` (direction 0) and `946acfcc…`
(direction 1); full IDs and exact trip-set digests are recorded in the summary.
The observed metadata disagreement does not change their unambiguous station
order. It remains a source-semantic caveat, not evidence that one path should
be reversed or assigned to another service. Future joins must preserve source
trip identity rather than derive it from direction alone.

## Station and physical platform identities

All 30 platform stops have a unique literal numeric label and a consistent
station/parent relationship. The following table was checked against the source
rows and canonical platform records; it does not derive labels from suffixes:

| Provider code | Provider parent ID | Canonical station | `_A` stop target (label 2) | `_B` stop target (label 1) |
| --- | --- | --- | --- | --- |
| PTC | NE17 | PGL | PGL_PGLRT_2 | PGL_PGLRT_1 |
| PE1 | PE1 | COV | COV_PGLRT_2 | COV_PGLRT_1 |
| PE2 | PE2 | MRD | MRD_PGLRT_2 | MRD_PGLRT_1 |
| PE3 | PE3 | CRE | CRE_PGLRT_2 | CRE_PGLRT_1 |
| PE4 | PE4 | RIV | RIV_PGLRT_2 | RIV_PGLRT_1 |
| PE5 | PE5 | KDL | KDL_PGLRT_2 | KDL_PGLRT_1 |
| PE6 | PE6 | OAS | OAS_PGLRT_2 | OAS_PGLRT_1 |
| PE7 | PE7 | DAM | DAM_PGLRT_2 | DAM_PGLRT_1 |
| PW1 | PW1 | SMK | SMK_PGLRT_2 | SMK_PGLRT_1 |
| PW2 | PW2 | TKL | TKL_PGLRT_2 | TKL_PGLRT_1 |
| PW3 | PW3 | PGP | PGP_PGLRT_2 | PGP_PGLRT_1 |
| PW4 | PW4 | SMD | SMD_PGLRT_2 | SMD_PGLRT_1 |
| PW5 | PW5 | NBG | NBG_PGLRT_2 | NBG_PGLRT_1 |
| PW6 | PW6 | SMG | SMG_PGLRT_2 | SMG_PGLRT_1 |
| PW7 | PW7 | STK | STK_PGLRT_2 | STK_PGLRT_1 |

Town-centre parent `NE17` is intentionally an NEL-coded provider station record;
its canonical station is PGL, while the supplied child code `PTC` identifies the
PGLRT platforms. A prefix filter limited to `PG`, `PE` or `PW` would miss this
recursive parent dependency. It does not confer approval on NEL trips.

The current canonical service restrictions agree with every selected platform
occurrence, including both town-centre visits. Punggol platform 2 serves East CW
and West CCW; platform 1 serves East CCW and West CW. Intermediate stations use
source label 1 for the shown CW paths and 2 for CCW paths. These associations
come from the actual explicit labels and ordered paths in this snapshot, not
from a general `_A`/`_B`, route-ID or direction-number rule. There are no grouped
labels or current boarding-status conflicts. Current undated platform records
do not independently establish historical allocation or timetable correctness.

## Calendar, occurrence rules and remaining gates

The exact calendars span 2026-01-01 through 2026-12-31: `SERVICE_WD` enables
261 weekdays, `SERVICE_WE` 52 Saturdays and `SERVICE_PH` 52 Sundays. There are
no exception rows. The calendar name `SERVICE_PH` must not be expanded into
public-holiday service or treated as an authoritative holiday timetable.

The 26,415 source stop-time rows retain their separate occurrence identity.
The supplied table omits `pickup_type`, `drop_off_type` and `timepoint`; preserve
the GTFS defaults, without inventing final-stop pickup/alighting restrictions
from the loop shape or platform scope. Departure times reach `24:47:30`, and
805 rows have departures at or after `24:00:00`. Preserve those source service-day
times rather than wrapping them into a different calendar day or dropping the
last town-centre occurrence.

Reproduce the standalone pilot in a fresh directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json PGLRT \
  /tmp/new-pglrt-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the runner's corresponding files.
All five generated outputs reproduce byte-for-byte across independent runs.
Full drafts and large evaluation reports remain outside Git; their hashes are
recorded in the summary. The full standalone draft has complete accounting
with 1,064 unresolved records. The focused subset is globally incomplete:
1,064 other entries and 46,670 outside-pilot pattern dates remain absent.

No PGLRT identity, ordered-path, temporal-validity or current-platform conflict
was found within these checks. The weekday direction split is retained explicitly.
Normal repository review, source-semantic acceptance, calendar correctness,
authoritative lineage and rights/publication validation remain separate gates.
No approval is created, mapping-review eligibility is false, generation remains
false, and the [other mapping disagreements](gtfs-mapping-disagreements.md) remain
unresolved.
