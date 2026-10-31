# Ang Mo Kio platform evidence and correction — 28–29 October 2026

## Finding and correction

**Platforms C and D physically exist.** Dated photographs of station signage
support a missing canonical platform inventory, rather than a typo in the
source's `A / C` and `B / D` labels. On 29 October the user selected a correction
in this PR: add `AMK_NSL_C` and `AMK_NSL_D` on the NSL with
`boardingStatus: "not_in_service"`, reflecting the reviewed non-passenger depot
role. Both have `lastUpdated: "2026-10-29"` and no passenger `serviceIds`.

The photographs support the physical inventory; the non-passenger status is
the user's reviewed operational interpretation. It is not inferred from an empty
platform or one train's display. The date records this review, not a platform
opening date or an effective historical boundary. The source groups remain
literal A/C and B/D; no member is dropped to make a passenger mapping pass.

## What each source establishes

| Evidence | Observation | Limit |
| --- | --- | --- |
| Pinned LTA `stops.txt` | `NS16_A` has literal `platform_code: A / C`; `NS16_B` has `B / D`. Both physical-stop rows reference station parent `NS16`. | These are grouped alternatives, not a per-trip physical-platform selection. |
| [HagenPapa2014 photograph, 12 July 2016](https://commons.wikimedia.org/wiki/File:Ang_Mo_Kio_MRT_Station_(NSL)_-_New_Signage_and_Platforms_C_and_D.jpg) | Ang Mo Kio station signage and a physical D label are visible. | The photograph does not establish a 2026 service allocation. |
| [ZKang123 photograph, 5 November 2020](https://commons.wikimedia.org/wiki/File:NS16_Ang_Mo_Kio_MRT_Platform_C_20201105_131506.jpg) | A C label is visible on the inner platform edge; A is labeled on the other edge of the same island. | An empty platform in one photograph establishes no boarding rule. |
| [ZKang123 photograph, 21 October 2020](https://commons.wikimedia.org/wiki/File:NS16_Ang_Mo_Kio_MRT_Platform_D_Kawasaki_C151A_20201021_200829.jpg) | A D direction sign and a platform passenger display saying “Do not board” are visible. | This records that display at one observation, not a permanent alighting-only or out-of-service status. |
| [ZKang123 concourse photograph, 19 October 2020](https://commons.wikimedia.org/wiki/File:NS16_Ang_Mo_Kio_MRT_concourse_level_20201019_203929.jpg) | Passenger wayfinding identifies A towards Jurong East via Woodlands and B towards Marina South Pier. | It establishes the advertised A/B directions at that observation; omission of C/D from this sign does not establish a permanent passenger prohibition. |
| [ZKang123 / zhenkang middle-platform photograph, 9 June 2020](https://commons.wikimedia.org/wiki/File:NS16_Ang_Mo_Kio_MRT_middle_platform.jpg) | Opposing platform edges face one shared central track. | The physical arrangement alone establishes neither the track's depot connection nor its permitted passenger movements. |
| [SMRT Ang Mo Kio map](https://journey.smrt.com.sg/journey/station_info/ang-mo-kio/map/) | The operator's linked locality map identifies the station, surrounding streets and exits A–D. | Its letters are **exit labels**; it supplies no platform-level C/D allocation. |

The photographs are first-hand observations of operator signage, not operator
statements about the complete timetable. Dates are the photographers' recorded
dates. All five originals are CC BY-SA 4.0; the linked file pages identify
their authors and metadata. Images remain outside Git and are not republished
here. No independently dated SMRT/LTA allocation notice was found in the
official station resources inspected for this review.

### Central track and depot operations — 29 October follow-up

The user identified the concourse photograph and the third track's operational
role. Taken together, the platform photographs support C/D as the two physical
faces of that central track, distinct from the regularly advertised A/B
directions. A physical inventory should retain those faces even when a train
using the track is not carrying passengers.

The reviewer reports that the central track is used for Bishan Depot operations
and does not serve passengers. This is supplied review context, distinct from
the dated photographic observations above. The photographs establish physical
platform faces and advertised A/B directions; they do not by themselves supply
a dated operator allocation for every trip in the 2026 source calendar.

The two newly inspected originals are pinned by SHA-256 and byte length below;
the file pages supply their dates, authors and CC BY-SA 4.0 licensing:

| Original | SHA-256 | Bytes |
| --- | --- | ---: |
| Concourse, 19 October 2020 | `3886822793be5b3eafaf942da2aa723696968c7d91c40e73d7699ccd08d3cf87` | 3,221,711 |
| Middle platform, 9 June 2020 | `762fa208652df40120dac1c519e544b3d7d251407baaa3c1ef472f232916f600` | 3,416,683 |

## Canonical provenance and reviewed status

Before this correction, [the canonical AMK record](../data/station/AMK.json)
contained only `AMK_NSL_A` and `AMK_NSL_B`, assigned to `NSL_MAIN_N` and
`NSL_MAIN_S`. Commit
`07521d33bc07d44e00f661fe70eb9e6f731aef0a` added them on 20 July 2026 using
`same-line-platform-label` inference from `SOM_NSL_A` and `SOM_NSL_B` at Somerset.
That inference was not an Ang Mo Kio inventory survey and does not prove C/D
absent. The record's `lastUpdated` is not a platform opening date.

The correction preserves those A/B records and adds C/D as physical inventory
with explicit non-passenger status. The [station schema](../packages/core/src/schema/Station.ts)
prohibits `serviceIds` on a platform carrying a non-boardable status; the new
records omit them. Omitting service scope alone would be permissive, so the
explicit status is essential. No new directional passenger binding is asserted
for C/D, and NEL's Outram Park assumption supplies no AMK evidence.

The [shared boarding validator](../packages/fs/src/gtfs/scheduledTripPattern.ts)
rejects a `not_in_service` member at every occurrence, including the final
stop and no-pickup occurrences. The group contract requires every represented
member to pass. A/C and B/D can therefore have complete physical identities
while their passenger pattern/date cells remain incompatible. The new records
are current undated metadata; applying that conservative diagnostic to a source
date does not independently establish the historical operating rule on that date.

## Regeneration after correction — 29 October

Both runs use the pinned 21 October capture described below, the same tooling
and literal source calendars. They have valid complete accounting and no mapping
approval. Only the two AMK stop dispositions change: `NS16_A` proposes the full
`AMK_NSL_A` / `AMK_NSL_C` group and `NS16_B` proposes
`AMK_NSL_B` / `AMK_NSL_D`. These are physical identity proposals, not passenger
allocations or approved mappings.

| Measure | Before | After |
| --- | ---: | ---: |
| Matched decision proposals | 965 | 967 |
| Unresolved decisions | 191 | 189 |
| Complete platform-group proposals | 7 | 9 |
| Matched pattern/date cells | 231 | 231 |
| Unresolved pattern/date cells | 188 | 188 |
| Matched pattern/date pairs | 26,268 | 26,268 |
| Trip assignments | 12,075 | 12,075 |
| Assigned trip/date pairs | 1,494,006 | 1,494,006 |
| Unassigned trip/date pairs | 990,143 | 990,143 |

All **46 AMK-dependent cells / 6,154 pattern-date pairs** remain unresolved:

| After-correction diagnostic | Cells | Pattern/date pairs |
| --- | ---: | ---: |
| `group-member-diagnostics` | 42 | 5,737 |
| `current-platform-diagnostics` plus `group-member-diagnostics` at the three Marina South Pier cells below | 3 | 365 |
| `no-path-candidate` plus `temporal-gap` at `NSL_NB_PH_210_5334` | 1 | 52 |

No AMK unmatched dependency remains. Every source manifest hash, exact date set,
affected cell key, trip ID and literal stop order is unchanged, including both
AMK visits in the no-path cell. The assignment payload arrays are identical.
The source's A/C and B/D alternatives are preserved, so C/D's non-passenger
status prevents a passenger-compatible group. No newly recovered departure is
claimed. Whole-feed selection remains blocked on all 365 source dates, with
mapping-review and generation eligibility false.

The regenerated artifacts keep their own identities:

| Identity | Before | After |
| --- | --- | --- |
| Canonical commit | `edc1490eb2420d4c9a0d05a09d95371f7b5679e1` | `41c559feea00bcab8d21318b5ee17b90d40af108` |
| Topology projection 1 SHA-256 | `e376c280fbd6292ed6fe03e7fa81541ad0b0b8c76a09f916f1e3898aac240ec1` | `02ebd83efd71e0facbe7b34ecb374ec0fbec62b581db56417bfc4ede88b3365f` |
| Normalized full-draft SHA-256 | `74401cd87f58a53c225e736494f8f60de2442015c48f142900bdf76d1ca58746` | `4160a58849fe48f1555d633a2d88448559f72d9ebab31466e02e804118a9d2cf` |
| `blockers.json` byte SHA-256 | `37b0519b6aeeff455909abd582d33697d54223b9c01763ca7b7cfa8e04bc262a` | `b5fee5543a71d5fc8f2eec6234dc90347abe0b0e93a821363e48fa71da9356fd` |
| `blockers.json` bytes | 4,216,569 | 4,244,923 |

The normalized assignment digest is unchanged:
`ad4756a9ba792ac3afeb0af55efaed2eff3387e7613413687db73d2989a351b9`.
The assignment document's canonical/topology identity still changes; this digest
does not transfer approval to the corrected topology.

Acquire the pinned ZIP/receipt as in the NEL reproduction instructions below.
With committed `data/` matching the correction commit, reproduce the after run:

```sh
npm run build:cli
TZ=UTC node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/amk-correction-input-20261029/schedule.zip \
  /tmp/amk-correction-input-20261029/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/amk-correction-after-20261029 \
  --canonical-commit 41c559feea00bcab8d21318b5ee17b90d40af108 \
  --platform-groups --blockers --assignments
```

Run the same command against the before commit's committed data, replacing the
output directory with `/tmp/amk-correction-before-20261029` and the canonical
commit with `edc1490eb2420d4c9a0d05a09d95371f7b5679e1`. Use fresh output directories.
For the corrected blocker packet, select AMK cells by `stopIds` containing
`NS16_A` or `NS16_B`; the old unmatched-dependency selector below now returns none.
Both complete generated packets remain outside Git. The local comparison is
`/tmp/amk-correction-comparison-20261029.json`.

Validation on 29 October: CLI build, complete canonical-data validation, lint,
documentation links, 86 existing station-schema/grouped-platform/grouped-review/
blocker tests, both full draft evaluations and both assignment coverage validations
passed with Node 22.21.1 and `TZ=UTC` for the builds, tests and regeneration.

## Affected source population before correction

The source is the [21 October immutable receipt](https://sources.mrtdown.org/captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json)
and [original ZIP](https://sources.mrtdown.org/blobs/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.zip),
SHA-256 `9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`,
2,981,645 bytes. Contains information from LTA DataMall accessed on 20 October
2026; [source attribution and licence](gtfs-public-handoff.md) apply.

The reused blocker/draft pair is bound to canonical commit
`e66664deebfcc4fe22689c2ee35d9165790249c7`, topology projection 1
`e376c280fbd6292ed6fe03e7fa81541ad0b0b8c76a09f916f1e3898aac240ec1`,
and normalized draft
`19698e1f167c47d97e484a377eaa52b6ede2cb91f618ca4ca3b353cdbfabad30`.
It retains its original identity; this is not a regenerated current-main review.

In that original packet, filtering `unmatchedDependencies` for either stop
identifies **46 distinct pattern/date cells, 1,708 recurring source trips and
236,161 trip/date pairs**:

| Literal calendar | Cells | Pattern/date pairs | Exact date-set ID |
| --- | ---: | ---: | --- |
| `SERVICE_WD` | 18 | 4,698 | `9a53ff769a14653ad803b2d799a5cff88d4079a5c2fb1f93b62347d623363fdd` |
| `SERVICE_WE` | 15 | 780 | `71dc7758992ac07e70ceea437989e7ecc4f74a78d4ca15adaf04647a857eb989` |
| `SERVICE_PH` | 13 | 676 | `eefec8dbd582ca6ff9402c99277ad1aab040300d7e1e5b991970ee3a43e0f946` |

Those sets contain 261 weekdays, 52 Saturdays and 52 Sundays respectively,
between 1 January and 31 December 2026. Counts describe the literal capture,
before the agreed prospective public-holiday override.

There are 47 AMK occurrences: seven initial, 31 intermediate and nine final.
`NS16_A` occurs 24 times in 23 cells; `NS16_B` occurs 23 times in 23 cells.
`NSL_NB_PH_210_5334` repeats `NS16_A` at zero-based indices 0 and 7. Both remain
in its literal stop order; neither endpoint nor repeated visit is discarded.

Forty-two cells / 5,737 pattern-date pairs originally reported only the unmatched
dependency. Four cells / 417 pattern-date pairs have overlapping blockers:

| Source trip | Full pattern ID | Independent blocker |
| --- | --- | --- |
| `NSL_SB_WD_401_215` | `46f9f71fd2493e9de94608a6525cc2738e306ffc1876654fea98499997103508` | Final `NS28_A`, index 21, excludes the candidate southbound service. |
| `NSL_SB_WE_204_221` | `9993131ca19bfbc8548834d9f63a587990ae589492a78e1cccfcda9bb4e58978` | Final `NS28_A`, index 15, has the same service-scope conflict. |
| `NSL_SB_PH_401_215` | `f0933ba71d32950793ae9d994deea75033148d06b86161fedf4486f3f3e7314d` | Final `NS28_A`, index 21, has the same service-scope conflict. |
| `NSL_NB_PH_210_5334` | `eb2f75d6eba919e320a8d7fe748f45a9fb3bcad44d4ef11feff664822803f5c7` | No contiguous canonical path; all 52 literal Sunday dates report `no-path-candidate` and `temporal-gap`. |

That no-path trip starts `NS16_A → NS20_A → NS21_A → NS20_A → NS19_A →
NS18_A → NS17_A → NS16_A`, preserving the excursion and both AMK occurrences.
Its PH date set above contains the 52 Sundays from 4 January to 27 December 2026.
The blocker has no candidate revision or candidate occurrence evidence for that
scope; `temporal-gap` accompanies the missing path, not a separately established
dated closure. Completing AMK's physical group cannot make that order contiguous.

Completing the physical inventory does not settle those four cases. It also
does not make the other 42 passenger-compatible: every newly represented
member must pass its own service and boarding checks. The regeneration above
measures the actual effect.

## Reproduce the original affected IDs, dates and occurrences

Reproduce the verified all-line packet using the pinned inputs and instructions
in the [NEL review](gtfs-nel-mapping-review-2026-10-28.md#deterministic-detail-and-reproduction).
Then run against that output directory:

```sh
jq '[.patterns[] | select(any(.unmatchedDependencies[];
  .providerId == "NS16_A" or .providerId == "NS16_B")) |
  {providerId, sourceRecordSha256, dateSetId, routeId, calendarId,
   tripCount, tripIds, stopIds, unmatchedDependencies, dateScopes,
   candidateEvidence}]' /tmp/nel-review-all-lines-20261028/blockers.json \
  > /tmp/amk-dependent-cells.json
jq --slurpfile draft /tmp/nel-review-all-lines-20261028/full-draft.json '
  ($draft[0].dateSets | map({key: .id, value: .serviceDates}) |
    from_entries) as $dates |
  {cells: length, trips: (map(.tripCount) | add),
   patternDates: (map($dates[.dateSetId] | length) | add),
   tripDates: (map(.tripCount * ($dates[.dateSetId] | length)) | add)}' \
  /tmp/amk-dependent-cells.json
```

Join `tripIds` to the original ZIP's `trips.txt` and `stop_times.txt`, preserving
literal IDs and sorting stop occurrences by numeric `stop_sequence`. `dateSetId`
joins the draft's exact date arrays; `candidateEvidence` retains every candidate
revision, role and conflicting index. No convenient example substitutes for
the full affected population.

Private inspected originals and detail are in
`/tmp/amk-platform-investigation-20261028/`; `evidence-files.json` records their
SHA-256/lengths. The operator locality image hashes to
`9c9c9b193c4b04c0e039b5e5bbb0cd5589ea718fd72767addf13ed0906883170`.
The [image URL](https://connect-cdn.smrt.wwprojects.com/autoupdate/images/locality/Ang%20Mo%20Kio.jpg)
was resolved from the official station view's `showLocalityMap` resource.
Remote resources may change independently of the pinned GTFS capture.

Original evidence validation on 28 October: the capture hash/length and
affected-population queries were rechecked; lint, documentation links and
74 existing grouped-platform,
grouped-review and blocker tests passed with Node 24 and `TZ=UTC`.

The canonical correction is limited to the two AMK platform records. No source
correction, approval, holiday implementation, eligibility change or publication
is included. The next platform batch remains Expo,
both Choa Chu Kang occurrences and Sengkang East, as recorded in the
[cross-line review](gtfs-cross-line-mapping-review-2026-10-28.md#next-prerequisite-and-validation).
