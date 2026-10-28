# Ang Mo Kio platform evidence — 28 October 2026

## Finding and recommendation

**Platforms C and D physically exist.** Dated photographs of station signage
support a missing canonical inventory, rather than a typo in the source's
`A / C` and `B / D` labels. The remaining question is their dated service and
boarding allocation. Physical existence alone does not establish that every
member is a boardable alternative throughout the source calendar.

Prepare a separate canonical correction after that allocation is reviewed.
The concrete candidate is `AMK_NSL_C` alongside A in the northbound group,
and `AMK_NSL_D` alongside B in the southbound group, following the **source's
asserted alternatives**. Those service bindings remain a proposal, not an
independently verified allocation. No canonical data, mapping decisions or
approval records change in this evidence PR.

## What each source establishes

| Evidence | Observation | Limit |
| --- | --- | --- |
| Pinned LTA `stops.txt` | `NS16_A` has literal `platform_code: A / C`; `NS16_B` has `B / D`. Both physical-stop rows reference station parent `NS16`. | These are grouped alternatives, not a per-trip physical-platform selection. |
| [HagenPapa2014 photograph, 12 July 2016](https://commons.wikimedia.org/wiki/File:Ang_Mo_Kio_MRT_Station_(NSL)_-_New_Signage_and_Platforms_C_and_D.jpg) | Ang Mo Kio station signage and a physical D label are visible. | The photograph does not establish a 2026 service allocation. |
| [ZKang123 photograph, 5 November 2020](https://commons.wikimedia.org/wiki/File:NS16_Ang_Mo_Kio_MRT_Platform_C_20201105_131506.jpg) | A C label is visible on the inner platform edge; A is labeled on the other edge of the same island. | An empty platform in one photograph establishes no boarding rule. |
| [ZKang123 photograph, 21 October 2020](https://commons.wikimedia.org/wiki/File:NS16_Ang_Mo_Kio_MRT_Platform_D_Kawasaki_C151A_20201021_200829.jpg) | A D direction sign and a platform passenger display saying “Do not board” are visible. | This records that display at one observation, not a permanent alighting-only or out-of-service status. |
| [SMRT Ang Mo Kio map](https://journey.smrt.com.sg/journey/station_info/ang-mo-kio/map/) | The operator's linked locality map identifies the station, surrounding streets and exits A–D. | Its letters are **exit labels**; it supplies no platform-level C/D allocation. |

The photographs are first-hand observations of operator signage, not operator
statements about the complete timetable. Dates are the photographers' recorded
dates. All three originals are CC BY-SA 4.0; the linked file pages identify
their authors and metadata. Images remain outside Git and are not republished
here. No independently dated SMRT/LTA allocation notice was found in the
official station resources inspected for this review.

## Canonical provenance and the outstanding decision

[The canonical AMK record](../data/station/AMK.json) has only `AMK_NSL_A` and
`AMK_NSL_B`, assigned to `NSL_MAIN_N` and `NSL_MAIN_S`. Commit
`07521d33bc07d44e00f661fe70eb9e6f731aef0a` added them on 20 July 2026 using
`same-line-platform-label` inference from `SOM_NSL_A` and `SOM_NSL_B` at Somerset.
That inference was not an Ang Mo Kio inventory survey and does not prove C/D
absent. The record's `lastUpdated` is not a platform opening date.

The source supports a **source-bound proposal** that A/C and B/D are the
respective NSL alternatives. The evidence above independently supports the
physical labels, but not an all-date operating rule. The next review decision
is whether the source assertion is sufficient allocation evidence for those
groups on the supplied 2026 dates, or whether dated operator confirmation is
required before changing canonical service bindings.

In particular, empty `serviceIds` are not an unknown-allocation marker: the
[shared validator](../packages/fs/src/gtfs/scheduledTripPattern.ts) treats them
as unrestricted within the line. Likewise, an absent `boardingStatus` imposes
no boarding restriction. Neither value should conceal the unresolved question.
The 2020 D display cannot justify marking D permanently `alighting_only` or
`not_in_service`, and the literal GTFS groups cannot pick A/B to hide C/D.
NEL's explicitly assumed Outram Park correspondence supplies no AMK evidence.

This evidence review therefore leaves both grouped stop decisions unresolved.
A subsequent correction should record its allocation basis and observation date,
regenerate the topology-bound proposals and inspect every member at every
occurrence. Historical validity remains distinct from a current observation.

## Exact affected source population

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

Filtering `unmatchedDependencies` for either stop identifies **46 distinct
pattern/date cells, 1,708 recurring source trips and 236,161 trip/date pairs**:

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

Forty-two cells / 5,737 pattern-date pairs currently report only the unmatched
dependency. Four cells / 417 pattern-date pairs have overlapping blockers:

| Source trip | Full pattern ID | Independent blocker |
| --- | --- | --- |
| `NSL_SB_WD_401_215` | `46f9f71fd2493e9de94608a6525cc2738e306ffc1876654fea98499997103508` | Final `NS28_A`, index 21, excludes the candidate southbound service. |
| `NSL_SB_WE_204_221` | `9993131ca19bfbc8548834d9f63a587990ae589492a78e1cccfcda9bb4e58978` | Final `NS28_A`, index 15, has the same service-scope conflict. |
| `NSL_SB_PH_401_215` | `f0933ba71d32950793ae9d994deea75033148d06b86161fedf4486f3f3e7314d` | Final `NS28_A`, index 21, has the same service-scope conflict. |
| `NSL_NB_PH_210_5334` | `eb2f75d6eba919e320a8d7fe748f45a9fb3bcad44d4ef11feff664822803f5c7` | No contiguous canonical path; temporal-gap diagnostic follows. |

Removing the missing-member dependency would not settle those four cases.
The other 42 are not a promise of recovered coverage: new members would require
their own service, boarding and grouped-member validation. No assignments or
eligibility counts change here. Whole-feed unassigned coverage remains
**990,143 trip/date pairs**, so NEL and other lines remain unavailable under
the current whole-date selection rule.

## Reproduce the affected IDs, dates and occurrences

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

Validation: the capture hash/length and affected-population queries were
rechecked; lint, documentation links and 74 existing grouped-platform,
grouped-review and blocker tests passed with Node 24 and `TZ=UTC`.

No source correction, canonical edit, approval, holiday implementation, eligibility
change or publication is included. The next platform batch remains Expo,
both Choa Chu Kang occurrences and Sengkang East, as recorded in the
[cross-line review](gtfs-cross-line-mapping-review-2026-10-28.md#next-prerequisite-and-validation).
