# Choa Chu Kang LRT platform correction — 31 October 2026

## Canonical correction and its limits

[Choa Chu Kang](../data/station/CCK.json) now permits `BPLRT_A` and `BPLRT_B`
at **each of platforms 1 and 2**, and records **each of platforms 3 and 4** as
`alighting_only`, without `serviceIds`. All four records were reviewed on
31 October 2026. Previously, 1/3 listed only B and 2/4 only A, without boarding
restrictions.

The shared A/B allocation is a **MRTDown data assumption based on the
maintainer's tentative recollection**: “I believe so” in response to the compound
question about either service using either boarding platform and both outer
faces being alighting-only. The [merged review packet](gtfs-platform-allocation-review-2026-10-31.md#maintainer-input--31-october)
preserves that uncertainty. The correction adopts the arrangement for current
canonical metadata; it does not upgrade the recollection into operator-confirmed
allocation on every 2026 date or digest-bound mapping approval.

Independent station-specific evidence now corroborates both outer faces.
It also supports retaining drop-off at 1/2. No inspected primary source
independently demonstrates all four combinations A/1, A/2, B/1 and B/2.
The broader permission follows the reviewed recollection, rather than selecting
the feed's convenient A/1 and B/2 allocation or claiming those are exclusive.

## Independent evidence

| Source | Observation | Limit |
| --- | --- | --- |
| [LTA commissioning release, 23 December 2016, archived official copy](https://web.archive.org/web/20200516110737id_/https://www.lta.gov.sg/content/ltagov/en/newsroom/2016/12/2/two-new-platforms-at-choa-chu-kang-lrt-station-completed.html), paragraphs 2–3 | Both new platforms receive alighting passengers before doors on the existing island open for boarding. Passengers needing lifts continue to alight at the island. Operations were announced for 27 December 2016. | Commissioning intent, not proof of unchanged operation on every later date. It does not assign services A/B to numbered boarding faces. |
| [LTA's attached photo annex](https://web.archive.org/web/20200516110737id_/https://www.lta.gov.sg/content/dam/ltagov/news/press/2016/20161223_NewPlatformCCKLRT_vF.pdf), page 1 | Separately labelled photographs identify **Platform 3** and **Platform 4** beneath the designated-alighting heading. Platform 3's photographed sign also explicitly prohibits boarding. | Establishes each outer face independently; platform 3 is not inferred from the platform 4 photograph. |
| [ZKang123 / zhenkang, platform 1, 17 February 2021](https://commons.wikimedia.org/wiki/File:BP1_Choa_Chu_Kang_LRT_Platform_1_20210217_155346.jpg) | Service B via Petir is displayed while passengers board at 1. | One observed B/1 departure, not exclusive service allocation. |
| [ZKang123 / zhenkang, platform 4, 17 February 2021](https://commons.wikimedia.org/wiki/File:BP1_Choa_Chu_Kang_LRT_Platform_4_20210217_155442.jpg) | A notice directs boarding passengers to 1 or 2. | Its one observed out-of-service display does not establish permanent non-service status. |
| [Chainwit., 21 March 2025](https://commons.wikimedia.org/wiki/File:Choa_Chu_Kang_LRT_station_(2025)_-_img_01.jpg) | Newly retrieved original pixels show Service B via Petir at platform 1; platform 2 displays an out-of-service message. | Another B/1 observation. The platform 2 message is one observed display, not a reason to close that face or restrict its services. |

The live LTA release and annex returned HTTP 404; the linked archived official
copies were retrieved. All five annex pages were rendered and inspected.
The newly retrieved 2025 original supersedes only the earlier packet's retrieval
failure, not its historical diagnostics. The Commons photograph is CC BY 4.0;
the two 2021 photographs are CC BY-SA 4.0, with authors and dates on their file
pages. No images or PDF pages are republished in Git.

Newly retrieved bytes remain under `/tmp/platform-allocation-evidence-20261031/`:

| File | SHA-256 | Bytes |
| --- | --- | ---: |
| `lta-cck-completed-archive.html` | `4d06b3aaabad0e66712fd10a780929703ffaa3808bf3b4304ac307ea363c9dc5` | 35,189 |
| `lta-cck-annex.pdf` | `5c27218fab0ebf568f297a40d6e33978b5500100a5c199d8063aaed5936b2365` | 564,692 |
| `cck-2025.jpg` | `23c36ef263a19a9e9b38acc6764992f82b2bc599f0e81d263d3ace739e88cd38` | 2,635,481 |

Under the [platform provenance policy](plans/active/station-layout-data.md#platform-provenance-policy),
maintainer recollection supplies canonical provenance. External material tests
and corroborates the interpretation; platform records contain no photo/operator
provenance or new same-line inference. The review date is neither an opening
date nor an effective historical boundary.

## Boarding and repeated terminal occurrences

The [station schema](../packages/core/src/schema/Station.ts) forbids service lists
on non-boardable records. Removing `serviceIds` alone would be permissive;
explicit `alighting_only` is therefore essential for both 3 and 4. This permits
alighting, unlike `not_in_service`, which rejects every occurrence.
The [occurrence validator](../packages/fs/src/gtfs/scheduledTripPattern.ts)
rejects ordinary pickup on an alighting-only face before the final occurrence.
No validator or schema changes are needed.

The pinned source repeats `BP1_A`, literal platform 1, at indices **0 and 18**
for A; it repeats `BP1_B`, literal platform 2, at both indices for B.
All six complete 19-occurrence paths and ordinary/default pickup/drop-off rows
are preserved. The correction addresses the initial service conflict as well
as the final one. It neither drops the final visit nor substitutes outer faces
3/4. LTA's lift-access exception also explains why an arrival at 1/2 is not
inherently incompatible with the alighting infrastructure.

## Before/after diagnostics

Both packets use the pinned [21 October receipt](https://sources.mrtdown.org/captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json)
and [ZIP](https://sources.mrtdown.org/blobs/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.zip),
SHA-256 `9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`,
2,981,645 bytes. Attribution and licence are in the
[public handoff](gtfs-public-handoff.md).

The fresh baseline is merged #445, `fa4eb0cb8f76a258e948d31de56f831b68c7f7dc`;
the correction is `06375446e2b64b1eaa7a189aa22f1b8b58569b04`.
Generated packets remain outside Git in `/tmp/cck-before-20261031/` and
`/tmp/cck-after-20261031/`. The original #444 packet retains its original identity.

| Diagnostic | Before | After |
| --- | ---: | ---: |
| Unresolved decisions | 189 | 183 |
| Matched pattern/date cells | 231 | 237 |
| Matched pattern/date pairs | 26,268 | 26,998 |
| Assigned recurring trips | 12,075 | 13,323 |
| Assigned trip/date pairs | 1,494,006 | 1,653,370 |
| Unassigned trip/date pairs | 990,143 | 830,779 |
| Source trip/date pairs | 2,484,149 | 2,484,149 |

Exactly six decisions change from unresolved to matched. All other decisions
are identical, including their targets and reasons. All 12,075 existing trip
assignments are identical; the only additions are the 1,248 CCK trips, covering
**730 pattern/date pairs and 159,364 trip/date pairs**. For every added
assignment, the literal route/calendar, all 19 ordered source occurrences,
source-row digest, target service and complete exact date array were checked.
Both source pickup and drop-off are ordinary/default throughout those trips.

| Service | Literal calendar | Trips | Exact dates | Trip/date pairs |
| --- | --- | ---: | ---: | ---: |
| A | WD | 226 | 261 | 58,986 |
| B | WD | 226 | 261 | 58,986 |
| A | WE | 201 | 52 | 10,452 |
| B | WE | 201 | 52 | 10,452 |
| A | PH | 197 | 52 | 10,244 |
| B | PH | 197 | 52 | 10,244 |

These are the literal 2026 source calendars: WD weekdays, WE Saturdays and PH
Sundays, before any holiday overrides or dated engineering corrections. A
successful match applies current undated platform metadata diagnostically; it
does not establish actual historical operation on every source date. In
particular, the [independently recorded BPLRT closures](gtfs-cross-line-mapping-review-2026-10-28.md#smrt-investigation-stronger-baseline-evidence-separate-dated-exceptions)
and prospective holiday policy still require their own changes.

| Generated identity | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| Topology projection 1 | `02ebd83efd71e0facbe7b34ecb374ec0fbec62b581db56417bfc4ede88b3365f` | `11c4859f99d75c66aebe93f05e7e4e140c9b8842df02d250a904d69311e0921f` |
| Normalized full draft | `b234404250e2557215f232a6461eda4b8751f839f89a1fe5c729bd579061171f` | `7b2735021f4e955b5b542f79fc78e8137a3c9c7201647465f107a48d9b305fdb` |
| Blocker bytes | `c7685909f06f6481b20c05df497882d00bb819005fa9733428efa103de17c3e4` | `884561cf0b536d8f23160ab9aa89e60384327b39e3d84c3f079e520d20597509` |
| Normalized assignments | `ad4756a9ba792ac3afeb0af55efaed2eff3387e7613413687db73d2989a351b9` | `aad58793312fcd63488e292dfb1a1811a7245d33bd1546b9738a9e59e61657da` |

The baseline blockers are 4,244,923 bytes; corrected blockers are 4,119,786
bytes. Both full-accounting evaluations and assignment validations pass.
Coverage accounting is complete because unresolved cells remain explicit;
assigned-trip coverage is still incomplete. Mapping review and generation
eligibility remain **false**. The whole-feed selection rule is unchanged:
remaining gaps continue to block every affected service date. These are
additional draft assignments, not newly serving public departures.

## Reproduction and validation

Use Node 24 with `TZ=UTC`, build the CLI, and run against committed data at each
of the two revisions. The script verifies that `data/` matches the supplied
commit. Download and verify the same receipt/ZIP for each run:

```sh
npm run build:cli
TZ=UTC node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/amk-correction-input-20261029/schedule.zip \
  /tmp/amk-correction-input-20261029/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/cck-after-20261031 \
  --canonical-commit 06375446e2b64b1eaa7a189aa22f1b8b58569b04 \
  --platform-groups --blockers --assignments
```

For the baseline use its commit and a separate output directory. Select baseline
`blockers.json` patterns whose `stopIds` contain `BP1_A` or `BP1_B`; these are
exactly the six CCK IDs in the [cross-line appendix](gtfs-cross-line-mapping-review-2026-10-28.md#no-path-traces-and-exact-smaller-exception-cells).
Join their `dateSetId` to the full draft's exact `serviceDates`, and every
`tripIds` member to source `trips.txt` and numerically ordered `stop_times.txt`.
Compare those same pattern IDs, dates and all trip assignments in the corrected
packet. Compare every other decision and prior trip assignment for exact
equality to verify that only the six CCK cells and their trips changed.

Validation: CLI build, canonical data validation and 111 existing station-schema,
topology, occurrence-boarding, grouped-platform, grouped-review, blocker,
assignment and timetable-selection tests passed, along with lint and
documentation links. The source joins and before/after equality checks also
passed. No paid evals were run.

This correction supplies no mapping/source/release approval, holiday override,
source repair or publication wiring. Expo, Sengkang East, AMK restrictions,
historical CCL scopes, terminal semantics and missing source paths remain
separate work.
