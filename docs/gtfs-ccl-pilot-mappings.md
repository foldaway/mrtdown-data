# CCL mapping pilot: exact-date proposals across the July revision boundary

This partial pilot uses the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [matched-only draft](gtfs-ccl-pilot-draft.json),
[summary](gtfs-ccl-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) retain the exact source manifest,
canonical commit and topology fingerprint. Canonical `data` matches pinned commit
`d034d6babef4ea5bcac256d26c47dcd802bb39ba`. The underlying timetable is supplied
by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

**All 119 observed CCL source patterns retain unresolved dates.** Thirty-one
have a matched proposal on part of their actual calendar; 88 have no matched
cell. The focused draft contains 178 matched decision cells: one agency, 47
routes, 33 station parents, 66 platform stops and 31 pattern cells. In this
capture those cells represent 31 distinct source patterns, each with one matched
cell. They cover 1,656 pattern-date pairs from 2026-07-12 onward. None is a
whole-year pattern acceptance, an approval or permission to generate arrivals.

There are 3,003 distinct recurring source trip records in CCL. The 31 partially
covered patterns contain 1,098 of them; the 88 wholly unresolved patterns contain
1,905. These counts identify records referenced by patterns, not date-eligible
departure instances. Reusing a trip record across its calendar does not make its
earlier unresolved dates eligible. There are 14,757 CCL pattern-date pairs in
all: 1,656 matched and 13,101 unresolved.

## Exact dates, temporal ambiguity and current diagnostics

Every raw trip was sorted by decimal `stop_sequence`; its ordered occurrences
and source-record digest were independently checked. For each source calendar
date, all geometric candidates were tested against inclusive revision/code
starts and exclusive ends. No candidate is selected merely because it is latest,
and no calendar is shortened to hide a gap. The canonical operator assignment
`SMRT_TRAINS`, effective from 2009-05-28, covers all supplied CCL dates.

The independent classification below gives temporal candidates precedence:
zero candidates is a temporal gap; multiple candidates is unresolved temporal
ambiguity; a unique candidate then undergoes current platform diagnostics.
Platform conflicts can also coexist with temporal ambiguity and do not resolve it.

| Exact source date side | Matched | No valid temporal candidate | Multiple temporal candidates | Unique temporal candidate blocked by current platform scope | Total pattern-date pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before 2026-07-12 | 0 | 5,374 | 795 | 1,592 | 7,761 |
| From 2026-07-12 | 1,656 | 0 | 1,731 | 3,609 | 6,996 |

The 5,374 earlier gaps have two distinct causes: 4,415 pairs have no effective
revision matching their ordered station geometry (and also use new station/code
identities), while 959 have an effective geometric revision but the supplied
station code is not yet valid. Codes `CC30`, `CC31`, `CC32`, `CC33` and
`CC34` begin on 2026-07-12. Marina Bay and Bayfront previously use `CE2` and
`CE1`, respectively; source `CC33`/`CC34` is not silently rewritten to those
historical codes. The existence of an old station does not validate a supplied
new code for every date.

Earlier `CCL_MAIN_*` and `CCL_EXT_*` revisions end exclusively on 2026-07-12;
`CCL_BRANCH_*` and `CCL_LOOP_*` revision `r_2026_stage_6` starts inclusively
that day. Shared subsequences can match multiple services on either side. Even
when a current platform is scoped to one option, this pilot does not use that
undated record to resolve temporal service ambiguity.

The 1,592 earlier unique-candidate conflicts are comparisons against **current,
undated platform records**, not proof that historical CCL trains were invalid.
For example, short Dhoby Ghaut–Stadium paths have a pre-July main service
candidate but current platforms are scoped to the new branch services. Effective
historical platform evidence remains separate. The same distinction applies to
the 3,609 unique-candidate conflicts after the boundary: their explicit current
scope disagreements must remain visible and require review.

All 31 selected cells have one temporal candidate and agree with their actual
selected platform's literal label, station parent, line, service restriction and
boarding status on the checked dates. Their target is one of the four stage-6
branch/loop services. Their earlier unresolved cells total 1,837 pattern-date
pairs; all their post-boundary active dates are proposed matched. The 88 other
patterns retain 11,264 unresolved date pairs across the year. No pattern has two
matched cells here, so the summary's 1,098 trip count is not inflated by repeated
matched decisions.

## Actual source calendar partitions

The source calendars cover 2026-01-01 through 2026-12-31 with no exceptions.
`SERVICE_WD` supplies 261 weekdays, `SERVICE_WE` 52 Saturdays and
`SERVICE_PH` 52 Sundays. Names do not establish public-holiday behavior.

| Calendar | Earlier unresolved dates in each partially covered pattern | Matched dates in that pattern | First / last matched date |
| --- | ---: | ---: | --- |
| SERVICE_WD | 137 | 124 | 2026-07-13 / 2026-12-31 |
| SERVICE_WE | 28 | 24 | 2026-07-18 / 2026-12-26 |
| SERVICE_PH | 27 | 25 | 2026-07-12 / 2026-12-27 |

Each decision references a shared exact `serviceDates` list. These dates are
not continuous intervals: bounds are envelopes, and weekdays/Saturdays/Sundays
inside a different calendar's envelope do not gain coverage. Full-draft cells
partition every original calendar without overlap or missing dates. The focused
projection omits unresolved dates; it does not change those calendars or exclude
the omitted cells.

## Routes, short workings and ordered loop paths

All 47 route records reference `SMRT`, proposed as `SMRT_TRAINS` on line `CCL`.
Route identities remain separate from direction, endpoints and pattern readiness.
The route table's first numerator counts patterns with **partial** date coverage;
its trip numerator counts their distinct recurring source records. No numerator
means every date of those records is accepted.

| Provider route | Actual observed source endpoints | Partially covered / observed patterns | Records in partially covered / all patterns | Matched / unresolved pattern-date pairs |
| --- | --- | ---: | ---: | ---: |
| CCL_CC1_CC11 | CC11→CC1; CC1→CC11 | 0 / 9 | 0 / 49 | 0 / 1304 |
| CCL_CC1_CC17 | CC1→CC17; CC17→CC1 | 0 / 2 | 0 / 2 | 0 / 104 |
| CCL_CC1_CC23 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC1_CC26 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC1_CC29 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC1_CC32 | CC1→CC32; CC32→CC1 | 0 / 5 | 0 / 202 | 0 / 1096 |
| CCL_CC1_CC4 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC1_CC6 | CC1→CC6; CC6→CC1 | 12 / 12 | 1045 / 1045 | 692 / 768 |
| CCL_CC1_CC7 | CC1→CC7 | 3 / 3 | 4 / 4 | 74 / 82 |
| CCL_CC11_CC17 | CC17→CC11 | 0 / 1 | 0 / 2 | 0 / 52 |
| CCL_CC11_CC32 | CC11→CC32 | 0 / 3 | 0 / 21 | 0 / 365 |
| CCL_CC11_CC33 | CC33→CC11; CC11→CC33 | 0 / 4 | 0 / 4 | 0 / 417 |
| CCL_CC12_CC17 | CC12→CC17 | 0 / 1 | 0 / 5 | 0 / 52 |
| CCL_CC12_CC26 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC12_CC32 | CC32→CC12; CC12→CC32 | 0 / 4 | 0 / 61 | 0 / 626 |
| CCL_CC12_CC33 | CC33→CC12 | 3 / 3 | 3 / 3 | 173 / 192 |
| CCL_CC17_CC32 | CC17→CC32 | 0 / 2 | 0 / 6 | 0 / 313 |
| CCL_CC17_CC33 | CC33→CC17; CC17→CC33 | 0 / 4 | 0 / 8 | 0 / 417 |
| CCL_CC19_CC32 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC23_CC33 | CC33→CC23 | 0 / 3 | 0 / 4 | 0 / 365 |
| CCL_CC26_CC32 | CC26→CC32 | 0 / 3 | 0 / 5 | 0 / 365 |
| CCL_CC26_CC33 | CC33→CC26 | 0 / 3 | 0 / 7 | 0 / 365 |
| CCL_CC29_CC32 | CC29→CC32 | 0 / 3 | 0 / 24 | 0 / 365 |
| CCL_CC30_CC32 | CC30→CC32 | 0 / 1 | 0 / 2 | 0 / 52 |
| CCL_CC31_CC32 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC32_CC32 | CC32→CC32 | 0 / 3 | 0 / 577 | 0 / 365 |
| CCL_CC32_CC33 | CC32→CC33; CC33→CC32 | 1 / 4 | 2 / 26 | 25 / 392 |
| CCL_CC4_CC11 | CC4→CC11 | 0 / 1 | 0 / 2 | 0 / 52 |
| CCL_CC4_CC12 | CC12→CC4 | 3 / 3 | 30 / 30 | 173 / 192 |
| CCL_CC4_CC17 | CC4→CC17 | 0 / 2 | 0 / 10 | 0 / 104 |
| CCL_CC4_CC23 | CC4→CC23 | 0 / 3 | 0 / 6 | 0 / 365 |
| CCL_CC4_CC24 | CC24→CC4 | 3 / 3 | 6 / 6 | 173 / 192 |
| CCL_CC4_CC26 | CC4→CC26 | 0 / 3 | 0 / 10 | 0 / 365 |
| CCL_CC4_CC27 | CC27→CC4 | 1 / 1 | 1 / 1 | 25 / 27 |
| CCL_CC4_CC29 | CC4→CC29 | 0 / 1 | 0 / 3 | 0 / 261 |
| CCL_CC4_CC30 | CC30→CC4 | 1 / 1 | 1 / 1 | 25 / 27 |
| CCL_CC4_CC31 | CC31→CC4 | 1 / 1 | 3 / 3 | 24 / 28 |
| CCL_CC4_CC32 | CC4→CC32; CC32→CC4 | 2 / 3 | 2 / 3 | 148 / 426 |
| CCL_CC4_CC33 | CC4→CC33; CC33→CC4 | 1 / 4 | 1 / 26 | 124 / 502 |
| CCL_CC4_CC4 | CC4→CC4 | 0 / 3 | 0 / 577 | 0 / 365 |
| CCL_CC4_CC7 | CC7→CC4 | 0 / 3 | 0 / 12 | 0 / 365 |
| CCL_CC4_CC9 | CC9→CC4 | 0 / 1 | 0 / 1 | 0 / 261 |
| CCL_CC7_CC17 | No trips | 0 / 0 | 0 / 0 | 0 / 0 |
| CCL_CC7_CC32 | CC32→CC7; CC7→CC32 | 0 / 4 | 0 / 21 | 0 / 626 |
| CCL_CC9_CC17 | CC17→CC9; CC9→CC17 | 0 / 4 | 0 / 195 | 0 / 208 |
| CCL_CC9_CC23 | CC23→CC9 | 0 / 1 | 0 / 1 | 0 / 52 |
| CCL_CC9_CC32 | CC9→CC32; CC32→CC9 | 0 / 4 | 0 / 38 | 0 / 626 |

The 8 routes with no source trips are `CCL_CC1_CC23`, `CCL_CC1_CC26`, `CCL_CC1_CC29`, `CCL_CC1_CC4`, `CCL_CC12_CC26`, `CCL_CC19_CC32`, `CCL_CC31_CC32`, `CCL_CC7_CC17`.
No reverse working, inactive pattern or missing calendar variant is created from
a route name. For example, `CCL_CC4_CC12` actually travels CC12 → CC4, while
`CCL_CC32_CC33` includes both a 30-occurrence CC32 → CC33 working and a separate
two-occurrence CC33 → CC32 working. Only the latter has a supported date cell.

The selected cells break down as follows; every target uses `r_2026_stage_6`:

| Target service and match type | Distinct patterns / matched cells | Source trip records | Matched pattern-date pairs |
| --- | ---: | ---: | ---: |
| CCL_BRANCH_CCW, contiguousSegment | 9 | 532 | 420 |
| CCL_BRANCH_CW, contiguousSegment | 6 | 517 | 346 |
| CCL_LOOP_CCW, contiguousSegment | 5 | 7 | 321 |
| CCL_LOOP_CW, contiguousSegment | 1 | 2 | 25 |
| CCL_LOOP_CCW, cyclicSegment | 7 | 37 | 371 |
| CCL_LOOP_CW, cyclicSegment | 3 | 3 | 173 |

A `cyclicSegment` is an ordered partial path rotated around an **explicitly
closed** canonical circuit, with at most that circuit's occurrence count. It
does not imply a complete loop or permission to add stops. For example,
CC33 → CC12 clockwise has 21 source occurrences and CC12 → CC4 counter-clockwise
has 23; neither is relabelled as a HarbourFront-origin full circuit. The selected
31 paths have no repeated station occurrence and no `exact` full-circuit match.

The raw source nevertheless includes six full-circuit patterns (1,154 trips):
three CC4_A → CC4_A patterns and three CC32_B → CC32_B patterns, each with 31
occurrences and the same station at both ends. These repeated occurrences are
preserved, not deduplicated. Their post-July station geometry fits a rotated
closed circuit, but current platform-service diagnostics keep them unresolved.
Their pre-July source calendars also retain the revision/code gaps. A recognized
loop geometry is not platform or historical review permission.

## All partially covered source patterns

The following 31 IDs have one matched cell and one unresolved earlier cell each.
Their source-record digests, exact date-set IDs, endpoints and occurrence counts
remain in the draft/summary. No source pattern is duplicated to manufacture a
new trip identity.

| Exact provider pattern ID | Route | Calendar | Trip records | Matched / unresolved dates | Target and match |
| --- | --- | --- | ---: | ---: | --- |
| `059504478c96f776e43661f41a0c4f7c055c78fefdf22b3715fed85829dd5ec9` | CCL_CC1_CC6 | SERVICE_WD | 64 | 124 / 137 | CCL_BRANCH_CCW; contiguousSegment |
| `1671eed8d3e49a5fcbf8e7ef223064602884841f5219e6127a09a7ed87ca4d76` | CCL_CC1_CC6 | SERVICE_PH | 100 | 25 / 27 | CCL_BRANCH_CCW; contiguousSegment |
| `1df9c0dc7844902a42aa6307e9bdc4e1465a4c3ea1f874d938c8491d38652b8b` | CCL_CC1_CC6 | SERVICE_WD | 61 | 124 / 137 | CCL_BRANCH_CW; contiguousSegment |
| `379d153140ab157fba76f84dd094ca272b0d026f480036989fc25ff6abf0a432` | CCL_CC1_CC6 | SERVICE_WE | 100 | 24 / 28 | CCL_BRANCH_CCW; contiguousSegment |
| `396507cc620357115aab7664cd5eb428963ab77434ca458102ee7f39dd14a531` | CCL_CC1_CC6 | SERVICE_PH | 98 | 25 / 27 | CCL_BRANCH_CW; contiguousSegment |
| `4237cfb77799afa63cbb14de93a1227937f3fbedf52816e7c036cae8cb7e2a7e` | CCL_CC1_CC6 | SERVICE_PH | 96 | 25 / 27 | CCL_BRANCH_CW; contiguousSegment |
| `488ecc74c7d56f4ee07ffb4625b522e276f351ccc6c7d979376a24393c92bed3` | CCL_CC1_CC6 | SERVICE_PH | 100 | 25 / 27 | CCL_BRANCH_CCW; contiguousSegment |
| `56cc321408e2a6988334dc8216478521ac95bd3ccb4b5651aea81def2a862281` | CCL_CC1_CC6 | SERVICE_WE | 100 | 24 / 28 | CCL_BRANCH_CW; contiguousSegment |
| `5b8e313f62cdff7ab773e1cce53b950efab239b6dc523a59534b638ca610dca3` | CCL_CC1_CC6 | SERVICE_WD | 61 | 124 / 137 | CCL_BRANCH_CW; contiguousSegment |
| `aac45d88f5a432c6810d00842279f0402d5b0bf0bbc8ab99b1f8ec89b3cd22a1` | CCL_CC1_CC6 | SERVICE_WE | 102 | 24 / 28 | CCL_BRANCH_CCW; contiguousSegment |
| `b18c3cc22a1d9d533dfe24348864180eb3b597e72636592e81247f7b5d274bed` | CCL_CC1_CC6 | SERVICE_WE | 101 | 24 / 28 | CCL_BRANCH_CW; contiguousSegment |
| `d3f15c4517f9c85ebc84f3a442bd9dbb601d4eb6c2187b6d4943014e4b28f2a0` | CCL_CC1_CC6 | SERVICE_WD | 62 | 124 / 137 | CCL_BRANCH_CCW; contiguousSegment |
| `0693a44c735464fa59fe244e403c17afed076d9358a641c797de750c3db57ad4` | CCL_CC1_CC7 | SERVICE_WE | 1 | 24 / 28 | CCL_BRANCH_CCW; contiguousSegment |
| `c6f7d0872e981c16ad4523deeb357167cb53f901a1bf0f0efe6df5de26402b28` | CCL_CC1_CC7 | SERVICE_PH | 1 | 25 / 27 | CCL_BRANCH_CCW; contiguousSegment |
| `e83c235b651f50d3b763033f19bdc3a70f413926e4654dd63b505634ecaa577a` | CCL_CC1_CC7 | SERVICE_PH | 2 | 25 / 27 | CCL_BRANCH_CCW; contiguousSegment |
| `11fd8411e2c0710d5947d0a05bf5de242f1eb1497c5556b28a348cfa5d9128e6` | CCL_CC12_CC33 | SERVICE_WE | 1 | 24 / 28 | CCL_LOOP_CW; cyclicSegment |
| `3775f154021cd55d048f35274d6d3b81719adcf9bb6afbad435523599788f802` | CCL_CC12_CC33 | SERVICE_WD | 1 | 124 / 137 | CCL_LOOP_CW; cyclicSegment |
| `c8b23431e73a6f1db965d07879cf1684b04c154e06839a8ae76f8b4a72c42c9d` | CCL_CC12_CC33 | SERVICE_PH | 1 | 25 / 27 | CCL_LOOP_CW; cyclicSegment |
| `9582d1289a9d3c2e05d1a7f78ec85bbf0a08f1db22ac66a986ca31052b355d72` | CCL_CC32_CC33 | SERVICE_PH | 2 | 25 / 27 | CCL_LOOP_CW; contiguousSegment |
| `1d9431840c4c8ebc04f3adb4b904af77992bef4f16a360cc338e0071079a7c0f` | CCL_CC4_CC12 | SERVICE_WD | 16 | 124 / 137 | CCL_LOOP_CCW; cyclicSegment |
| `24f136d68a3e33024175dc0bcaad4bb54acbb57c712a1401cdc2dbb8ec918deb` | CCL_CC4_CC12 | SERVICE_WE | 7 | 24 / 28 | CCL_LOOP_CCW; cyclicSegment |
| `66ec6331bc9ad40097d45762352fbc544d4932cec8e281d6e4261e84765a0352` | CCL_CC4_CC12 | SERVICE_PH | 7 | 25 / 27 | CCL_LOOP_CCW; cyclicSegment |
| `56001cfe949f82c4a5bd60cbeb9be30480c35f4e007c78d182dae08637664ddf` | CCL_CC4_CC24 | SERVICE_WE | 2 | 24 / 28 | CCL_LOOP_CCW; cyclicSegment |
| `b0643acabded18c841a467670f4e5d954831afed9e16111f9976f94725491cf8` | CCL_CC4_CC24 | SERVICE_PH | 1 | 25 / 27 | CCL_LOOP_CCW; cyclicSegment |
| `d8dd2b654ca0fa47a228a6e7aa3d405c19c2800c06181ce83c5ce7596e4632df` | CCL_CC4_CC24 | SERVICE_WD | 3 | 124 / 137 | CCL_LOOP_CCW; cyclicSegment |
| `bbf56bbe6b3abbb84e8c041e39a50b647d1c3db7cc6b9d8265ea7c23495510fd` | CCL_CC4_CC27 | SERVICE_PH | 1 | 25 / 27 | CCL_LOOP_CCW; cyclicSegment |
| `e4cc07b95dcfa3719a4c1fb5b70a041a798fc93db9c350fbcba93a678211da3a` | CCL_CC4_CC30 | SERVICE_PH | 1 | 25 / 27 | CCL_LOOP_CCW; contiguousSegment |
| `2d6be246197431b6833cc3c83f7b415d4733ff0c09412cdb49f6d183a9d12049` | CCL_CC4_CC31 | SERVICE_WE | 3 | 24 / 28 | CCL_LOOP_CCW; contiguousSegment |
| `104400a56defa398c840490efb51f3c528ed66f4d841ca1ab1f21b61da2570dd` | CCL_CC4_CC32 | SERVICE_WE | 1 | 24 / 28 | CCL_LOOP_CCW; contiguousSegment |
| `b14cad8b017256bff4c58497184367e3600750e7737e78c6405b71f48d9ac5f0` | CCL_CC4_CC32 | SERVICE_WD | 1 | 124 / 137 | CCL_LOOP_CCW; contiguousSegment |
| `d5db59f94bdeb6aa0f62a60dd71b979a4f190505057a8514f83c66b996f22910` | CCL_CC4_CC33 | SERVICE_WD | 1 | 124 / 137 | CCL_LOOP_CCW; contiguousSegment |

## Wholly unresolved source patterns

All dates in the supplied calendar remain unresolved for each of these 88 IDs.
The date count is the complete source calendar: 261 weekdays, 52 Saturdays or
52 Sundays. Counts do not imply deliberate exclusions; the classification above
and route inventory explain the temporal and current diagnostic blockers.

| Exact provider pattern ID | Route | Calendar | Trip records | Unresolved dates |
| --- | --- | --- | ---: | ---: |
| `3ef96345470027cbfac467daabaaa83fa7686a37f46ff2a82bd299c3fa3da87d` | CCL_CC1_CC11 | SERVICE_WD | 2 | 261 |
| `87639b0b456e80cdb8ec09639fecf0a9d678af85d66f106384f4541963d9f38e` | CCL_CC1_CC11 | SERVICE_WE | 1 | 52 |
| `87af2221019502e95ecb69d2d9b3d57184c9ae55f0e59684b852053aa49faea7` | CCL_CC1_CC11 | SERVICE_WE | 1 | 52 |
| `a111d16d7f33ed92e1eace849141f491f2603d5b55c0d68c637ec37fa85df641` | CCL_CC1_CC11 | SERVICE_PH | 1 | 52 |
| `aaebb9d3074e80df0f2b16035904b7596d443bfe751973a86550b8ef3691db1a` | CCL_CC1_CC11 | SERVICE_WD | 18 | 261 |
| `bd410d569516ac5fa6a4c820e46932f14d430505136e97edbc2efb7906d9b3b6` | CCL_CC1_CC11 | SERVICE_PH | 3 | 52 |
| `d2b8feb6c5199c6a1c71cf1c9a7ed347447e648792fb43c1cb581ec66b096cb7` | CCL_CC1_CC11 | SERVICE_WD | 2 | 261 |
| `eb3e66996dc8bd8e4f758cd1791289dae1055fee1af9b114edae650c9ab92e19` | CCL_CC1_CC11 | SERVICE_WD | 18 | 261 |
| `edcddcaed6bf2038a9d7f7d6b3a79c34db2deb068b66fbed468e48b7427edd89` | CCL_CC1_CC11 | SERVICE_WE | 3 | 52 |
| `928d0dda80df6540019efaf52c94b1efb747e407819afe465bfa9d08b750333c` | CCL_CC1_CC17 | SERVICE_WE | 1 | 52 |
| `b94a7099481d21c40abad2baddb0f3d4779482e7cd74232d7d9019c1c7060741` | CCL_CC1_CC17 | SERVICE_WE | 1 | 52 |
| `43bdd4fc4ba2dc167821bddcef612cce7d4484b76d1d154c42976597099e69c9` | CCL_CC1_CC32 | SERVICE_WE | 1 | 52 |
| `51945f24e38e8651ff99c80c90ecf22e28675990ed0c2d29cb4168dae3e7cf43` | CCL_CC1_CC32 | SERVICE_WD | 43 | 261 |
| `541ec0a6d7c45659544c1fae75df8ea8057c8733ee6c6704826f6b2bc4c4c298` | CCL_CC1_CC32 | SERVICE_WD | 44 | 261 |
| `65c67f852999312562ed4da3df1651f596060f4204251301be257e394388cd53` | CCL_CC1_CC32 | SERVICE_WD | 59 | 261 |
| `8981d76723b0ec2e7bbf985a8e8a8108f13a9fc8c6e19d060601ded8790a9e9a` | CCL_CC1_CC32 | SERVICE_WD | 55 | 261 |
| `a204cea211ce04b2481e7cb0c0bdd07feaef699c43962207288a931f1c4b5fdd` | CCL_CC11_CC17 | SERVICE_PH | 2 | 52 |
| `b1997dda49776f11012c01484bc485abdeeb449363d64193fd23514b7f5b3e90` | CCL_CC11_CC32 | SERVICE_WE | 9 | 52 |
| `b5a04151412d4ace66a23b6cdc3621cf309009b189b0b94ae701721ed5aa5c2c` | CCL_CC11_CC32 | SERVICE_PH | 7 | 52 |
| `e22f82c006d4abc84991fc629be47b12437703c0bfbf8dfb49f7fcd40ed5e318` | CCL_CC11_CC32 | SERVICE_WD | 5 | 261 |
| `29e764e49b9de6347beb8cbea5289fed077eb7e267d552adf078d64ba7b818a2` | CCL_CC11_CC33 | SERVICE_PH | 1 | 52 |
| `574c6d05d47bd0b94d25afc786efcfd86b8a54cdac0438fc0b5654ea85fc5f77` | CCL_CC11_CC33 | SERVICE_PH | 1 | 52 |
| `dc70d1d9f9616ccc5c7aa598b567f853b36120812b2e6ecf277a08034531519f` | CCL_CC11_CC33 | SERVICE_WD | 1 | 261 |
| `ecbb14b7f8cac7cfd607bfd4715eaf4038d720bb64e05e556f3b393b57f7371b` | CCL_CC11_CC33 | SERVICE_WE | 1 | 52 |
| `80887ce740ae3293967d67650d5f9a30129510fa3f51c875e8985a8f14cc5498` | CCL_CC12_CC17 | SERVICE_PH | 5 | 52 |
| `1460b3884ce17dbcfe51984b805dbb0bdc82aa4d21046a58caaf43d7234c78da` | CCL_CC12_CC32 | SERVICE_WD | 35 | 261 |
| `3d2a93d8851b9048d5711a0c26bc8f147c387afd0eb000b7e7e32a90d5f4b982` | CCL_CC12_CC32 | SERVICE_WD | 18 | 261 |
| `42b3aaf671f586ea0d47d76b3ed57c2edae96c7b8c1c7ba44b139bc6b586a04e` | CCL_CC12_CC32 | SERVICE_WE | 5 | 52 |
| `c5e32095fd744f1ac056c324a7d06b3b69f49af8f1f87db998f53cbc1f0120f5` | CCL_CC12_CC32 | SERVICE_PH | 3 | 52 |
| `5493064ef5047a1631dc46deddf2c564cc4d40e350477b6add2db4496abba20c` | CCL_CC17_CC32 | SERVICE_WD | 4 | 261 |
| `b5c6f037114ce1884b96b87c10002d7dbafed76c0b654523197ad48a13f1c7a3` | CCL_CC17_CC32 | SERVICE_WE | 2 | 52 |
| `2b0b6e1674a6d9ac17fc57cdec7767712c8321bd73cb9e75634ede5e19785045` | CCL_CC17_CC33 | SERVICE_WD | 4 | 261 |
| `3601cd4642a0009bb6df82dc61c406fc45ff0a572f332cc25ab2c82fad9c04ca` | CCL_CC17_CC33 | SERVICE_PH | 2 | 52 |
| `3de07806d72b669593786b6bb5f2ac479bd9f8beca528a0c9258dca3100a590f` | CCL_CC17_CC33 | SERVICE_PH | 1 | 52 |
| `e7078b91b6a077420428af35cf763320b4a550f8f48c0bbe9f737a9e2d887263` | CCL_CC17_CC33 | SERVICE_WE | 1 | 52 |
| `37046958a90d830691651b5772e3132c16467e00feb51adc115ec7543eb92de1` | CCL_CC23_CC33 | SERVICE_WD | 2 | 261 |
| `4e9d934dd7a8ad574e53043ab812a882772694bb49cfb215b53c5baf9389753d` | CCL_CC23_CC33 | SERVICE_PH | 1 | 52 |
| `8efb99e614ed39ebe48b29e56a824fdd560bc1b0f403e50c229cfc066f352d25` | CCL_CC23_CC33 | SERVICE_WE | 1 | 52 |
| `0b25800dfa425e79beb0a2d1a9466c5f62e755fce55e53e8702d648da76bde79` | CCL_CC26_CC32 | SERVICE_PH | 1 | 52 |
| `9413465093a0019ad4e59c4869afa6a76103811fb5c642abcaadb1a8f5c62c73` | CCL_CC26_CC32 | SERVICE_WE | 2 | 52 |
| `fe44d1bb7813b157bfc8c9512a049fdca3612227f90b19ac58c050d4668ec759` | CCL_CC26_CC32 | SERVICE_WD | 2 | 261 |
| `2047771bf717501abc411b4ce093ee074485a7b990a94b2f8f8b0acd7028a9dc` | CCL_CC26_CC33 | SERVICE_PH | 1 | 52 |
| `4f334d823e28a0c9a5371ac1c4e786429c750cf3ee4ea34e48740fce68031c50` | CCL_CC26_CC33 | SERVICE_WE | 1 | 52 |
| `7b7fdb624f0204ecb6d6ad9f021ced872ff656c6315167046d4b5c58a8b366e4` | CCL_CC26_CC33 | SERVICE_WD | 5 | 261 |
| `15fb341e2ff761205fbe47f4bf44b027794dd037d1c0d10fbba55478e6e49d9d` | CCL_CC29_CC32 | SERVICE_WD | 10 | 261 |
| `618aaf09d25071294b46690ac2eb0eb61e9abdbb38e231d88b23d70da305f353` | CCL_CC29_CC32 | SERVICE_WE | 7 | 52 |
| `a65da97f9939898a96426f9d29627a742cfea04df828312c36fb7fbfc9d66bfa` | CCL_CC29_CC32 | SERVICE_PH | 7 | 52 |
| `4452fe9d6d3da90bc1323a57854cc87781c88c84069febf314e64f755b2288cb` | CCL_CC30_CC32 | SERVICE_PH | 2 | 52 |
| `5ed70e6be58bf6d7b930cd24b383cf7da13dbb1f50aa51ffddea1b8e85ea6958` | CCL_CC32_CC32 | SERVICE_WD | 219 | 261 |
| `9e38f6e716324ebf44fc2d3397075dde4b2d1c745bed25f55b4adbaa01b2ca32` | CCL_CC32_CC32 | SERVICE_WE | 182 | 52 |
| `f30865082d1f6a5b84e0488f91b0f361ab3f97786d6b32188f2463e501d75544` | CCL_CC32_CC32 | SERVICE_PH | 176 | 52 |
| `8ea762a9ab946c89fae61adffb4d621baacd137d1640b4405bba67f746eafe83` | CCL_CC32_CC33 | SERVICE_WE | 5 | 52 |
| `a0140df686205dcca33f2f105559a8ed50977bbf5ce3b4ae5ac5e2f6ebd16a55` | CCL_CC32_CC33 | SERVICE_PH | 7 | 52 |
| `ed0153129a272e325fb0186c75d3f156e0097d092255afdbf38754e02cad8491` | CCL_CC32_CC33 | SERVICE_WD | 12 | 261 |
| `add7137fdcfe42b8172b7db53d4003ee8b0e5471625cc4b380855d8f534d1a8d` | CCL_CC4_CC11 | SERVICE_WE | 2 | 52 |
| `45d09b1d47fe4e8417a524276d685ab37476c2d9fe191697f5e86a4debe4dfa9` | CCL_CC4_CC17 | SERVICE_PH | 4 | 52 |
| `c67f1578b87546ff3e4e83c3dbadb42be282116a087aba5c6f80d241b5812e0f` | CCL_CC4_CC17 | SERVICE_WE | 6 | 52 |
| `41720f385e178c6200a0bbfd515030cd5ca0af0b8686684acb5c103f8abf44dd` | CCL_CC4_CC23 | SERVICE_WD | 1 | 261 |
| `9c3afc6b1103feb7e0abc5dbff9cd878fe7bf8f2c483e137b748f5d46296d9d8` | CCL_CC4_CC23 | SERVICE_WE | 3 | 52 |
| `b2e09279448c2e562111a26bf90ea75e1d45d1e3a8eb0b653349ae6fef45a7c0` | CCL_CC4_CC23 | SERVICE_PH | 2 | 52 |
| `461e3166b450426c85ff081c0a1f6e48fd537ac80cb1f3152130b0d5130cca5c` | CCL_CC4_CC26 | SERVICE_WD | 1 | 261 |
| `a29db4ad5b843996b200528d116137b833e0d5aeefb8aeca3539780da7ee0be3` | CCL_CC4_CC26 | SERVICE_PH | 5 | 52 |
| `ddb4f1d9131f86e66fa618b72bb3054f13e39af0b8b520414c14dff0db545892` | CCL_CC4_CC26 | SERVICE_WE | 4 | 52 |
| `f38f1195371f41bb2d302b2b99b4681a428934363fdba91f2247d96cfeab58eb` | CCL_CC4_CC29 | SERVICE_WD | 3 | 261 |
| `fd589f8b1f69c21870d8bec12b01be023eb6268c8447450773a111ff1feff4ff` | CCL_CC4_CC32 | SERVICE_WD | 1 | 261 |
| `aa766b1d4c717db4c9d95629f495128d26e94e31ba3b774a8ca70fce6b0d0411` | CCL_CC4_CC33 | SERVICE_PH | 5 | 52 |
| `e21f906a040af236e8dfc919cb6e45f5b3677ba0ae82bc68d2121c7cc96a52ae` | CCL_CC4_CC33 | SERVICE_WE | 3 | 52 |
| `edc00130b2a1e380072e5fcbe668a04d12a58601f128465351d0929689b0155b` | CCL_CC4_CC33 | SERVICE_WD | 17 | 261 |
| `81eb0976ed3115cae4b3d693815b9a52fbf1493aeb9b57c4fdae57059507b0ab` | CCL_CC4_CC4 | SERVICE_WD | 209 | 261 |
| `a2fbcd483b43806ca1df3c80b5271b687d9ef79210de00dfcf19bae60c8ee495` | CCL_CC4_CC4 | SERVICE_WE | 187 | 52 |
| `c937ef12556e3303c4f30dba60ff833e51418a05615b91d5901f1d539316e050` | CCL_CC4_CC4 | SERVICE_PH | 181 | 52 |
| `0969e30d872667cc472eadbd1738c5cd2484b95e486e69a4c51eb78930a96fe4` | CCL_CC4_CC7 | SERVICE_WE | 5 | 52 |
| `69bbe3ea1042563c20d2a9beb0af4487394f20b2dbc0d9e97248fda533a433a2` | CCL_CC4_CC7 | SERVICE_WD | 1 | 261 |
| `cd3374243999db3de89e8f1a4669fb6fc90d92a5f394b9c3f4c95e4070afbbda` | CCL_CC4_CC7 | SERVICE_PH | 6 | 52 |
| `bd1406b4921b2cd444c8a0c9bb069db2267bffa1e132d96e7f44da276d7d9c55` | CCL_CC4_CC9 | SERVICE_WD | 1 | 261 |
| `363391c2ff9bb2cca17c5e0a2c5db68e122e30f6f8ebc3532d110a2edf6b0bd9` | CCL_CC7_CC32 | SERVICE_WD | 5 | 261 |
| `819061c6d488cb4b3589e057cca0b11b5f7ab5c32988ffdb87a0884876186a1e` | CCL_CC7_CC32 | SERVICE_PH | 5 | 52 |
| `84e2da74cc8be5bd6ac2cfd2785d77224e440ee833dfad370be1dfb91d819cbb` | CCL_CC7_CC32 | SERVICE_WE | 6 | 52 |
| `d9dbf12b32af29666b58d7e75245c218cdcf0ef715e068fb7cb8c52b0a5cc787` | CCL_CC7_CC32 | SERVICE_WD | 5 | 261 |
| `06e076bbea2d0996b5e24fe49c51e718b5a90c4ceee73fdd83a5803afa078100` | CCL_CC9_CC17 | SERVICE_PH | 69 | 52 |
| `31a1a343bb611aa2787acb9712608983909369ecb70d27a00bd1e88de7a5a1ce` | CCL_CC9_CC17 | SERVICE_PH | 68 | 52 |
| `3540fc07268724b2822aee15d2548a98aee86ddb8da9d99acdd2688fcf4c2362` | CCL_CC9_CC17 | SERVICE_WE | 30 | 52 |
| `4558900800cf2519ff07ffd5c2b6daae6f07bf65774a5d9152f541eff60a8fd7` | CCL_CC9_CC17 | SERVICE_WE | 28 | 52 |
| `e9c02b4d174dc8168981a8af69417c051143abba59a150b3e03fc62a4fb17a06` | CCL_CC9_CC23 | SERVICE_PH | 1 | 52 |
| `0a662999851b27ddffd69e4e4fa4564a279055c11f320df05e27b6c01dbe90b8` | CCL_CC9_CC32 | SERVICE_PH | 4 | 52 |
| `560fdaa9e48a401d9740c34edfe38dee4409d0f6bae6a1b10b7318174d8a36f0` | CCL_CC9_CC32 | SERVICE_WD | 5 | 261 |
| `aa28d7c896ccaa7a735546b6445a5e6a02542f38891ffc6db0e3e5af05b0a396` | CCL_CC9_CC32 | SERVICE_WD | 25 | 261 |
| `b1fe3fbc656b40d37c2a0e22cbb92378c9a511883158269c64a18bba1fdda397` | CCL_CC9_CC32 | SERVICE_WE | 4 | 52 |

## Station, platform and parent identities

All 66 source platform stops have one literal physical label and unique identity
proposal, with all 33 recursively referenced station parents included. Identity
proposals can exist even when no pattern using that platform is ready. Code-date
validity is enforced on pattern cells; an undated parent proposal does not approve
every historical date of a new code.

| Source code | Provider parent ID | Canonical station | Source _A stop: literal label → target | Source _B stop: literal label → target |
| --- | --- | --- | --- | --- |
| CC1 | NS24 | DBG | CC1_A: **A** → DBG_CCL_A | CC1_B: **B** → DBG_CCL_B |
| CC2 | CC2 | BBS | CC2_A: **A** → BBS_CCL_A | CC2_B: **B** → BBS_CCL_B |
| CC3 | CC3 | EPN | CC3_A: **A** → EPN_CCL_A | CC3_B: **B** → EPN_CCL_B |
| CC4 | CC4 | PMN | CC4_A: **A** → PMN_CCL_A | CC4_B: **B** → PMN_CCL_B |
| CC5 | CC5 | NCH | CC5_A: **A** → NCH_CCL_A | CC5_B: **B** → NCH_CCL_B |
| CC6 | CC6 | SDM | CC6_A: **A** → SDM_CCL_A | CC6_B: **B** → SDM_CCL_B |
| CC7 | CC7 | MBT | CC7_A: **A** → MBT_CCL_A | CC7_B: **B** → MBT_CCL_B |
| CC8 | CC8 | DKT | CC8_A: **A** → DKT_CCL_A | CC8_B: **B** → DKT_CCL_B |
| CC9 | CC9 | PYL | CC9_A: **A** → PYL_CCL_A | CC9_B: **B** → PYL_CCL_B |
| CC10 | CC10 | MPS | CC10_A: **A** → MPS_CCL_A | CC10_B: **B** → MPS_CCL_B |
| CC11 | CC11 | TSG | CC11_A: **A** → TSG_CCL_A | CC11_B: **B** → TSG_CCL_B |
| CC12 | CC12 | BLY | CC12_A: **A** → BLY_CCL_A | CC12_B: **B** → BLY_CCL_B |
| CC13 | CC13 | SER | CC13_A: **A** → SER_CCL_A | CC13_B: **B** → SER_CCL_B |
| CC14 | CC14 | LRC | CC14_A: **A** → LRC_CCL_A | CC14_B: **B** → LRC_CCL_B |
| CC15 | CC15 | BSH | CC15_A: **A** → BSH_CCL_A | CC15_B: **B** → BSH_CCL_B |
| CC16 | CC16 | MRM | CC16_A: **A** → MRM_CCL_A | CC16_B: **B** → MRM_CCL_B |
| CC17 | CC17 | CDT | CC17_A: **A** → CDT_CCL_A | CC17_B: **B** → CDT_CCL_B |
| CC19 | CC19 | BTN | CC19_A: **A** → BTN_CCL_A | CC19_B: **B** → BTN_CCL_B |
| CC20 | CC20 | FRR | CC20_A: **A** → FRR_CCL_A | CC20_B: **B** → FRR_CCL_B |
| CC21 | CC21 | HLV | CC21_A: **A** → HLV_CCL_A | CC21_B: **B** → HLV_CCL_B |
| CC22 | CC22 | BNV | CC22_A: **A** → BNV_CCL_A | CC22_B: **B** → BNV_CCL_B |
| CC23 | CC23 | ONH | CC23_A: **A** → ONH_CCL_A | CC23_B: **B** → ONH_CCL_B |
| CC24 | CC24 | KRG | CC24_A: **A** → KRG_CCL_A | CC24_B: **B** → KRG_CCL_B |
| CC25 | CC25 | HPV | CC25_A: **A** → HPV_CCL_A | CC25_B: **B** → HPV_CCL_B |
| CC26 | CC26 | PPJ | CC26_A: **A** → PPJ_CCL_A | CC26_B: **B** → PPJ_CCL_B |
| CC27 | CC27 | LBD | CC27_A: **A** → LBD_CCL_A | CC27_B: **B** → LBD_CCL_B |
| CC28 | CC28 | TLB | CC28_A: **A** → TLB_CCL_A | CC28_B: **B** → TLB_CCL_B |
| CC29 | CC29 | HBF | CC29_A: **A** → HBF_CCL_A | CC29_B: **B** → HBF_CCL_B |
| CC30 | CC30 | KPL | CC30_A: **A** → KPL_CCL_A | CC30_B: **B** → KPL_CCL_B |
| CC31 | CC31 | CTM | CC31_A: **A** → CTM_CCL_A | CC31_B: **B** → CTM_CCL_B |
| CC32 | CC32 | PER | CC32_A: **A** → PER_CCL_A | CC32_B: **B** → PER_CCL_B |
| CC33 | CC33 | MRB | CC33_A: **C** → MRB_CCL_C | CC33_B: **D** → MRB_CCL_D |
| CC34 | CC34 | BFT | CC34_A: **D** → BFT_CCL_D | CC34_B: **B** → BFT_CCL_B |

`CC1` uses the other-line parent ID `NS24` for Dhoby Ghaut. All other CCL
platform pairs in this input share their listed CC-code parent. Canonical Bukit
Brown (`BKB`, `CC18`) is absent from this source and the reviewed service paths;
its canonical record does not authorize inserting a scheduled occurrence.
At Marina Bay the source labels
are **C/D**, and at Bayfront **D/B**; provider _A/_B suffixes do not establish
physical labels. There are no grouped provider labels in this CCL dependency set.
All supported occurrences pass the current boarding/service checks, while the
unsupported conflicts remain unresolved. Current platform assignments have no
effective historical periods and do not establish allocations across 2026.

## Occurrences, reproducibility and incomplete coverage

CCL contains 58,217 raw stop-time rows; 7,168 belong to the recurring trip records
in partially covered patterns, whose earlier dates remain unresolved. The other
51,049 rows belong to wholly unresolved patterns. The source omits `pickup_type`,
`drop_off_type` and `timepoint`; preserve their GTFS defaults without inferring
boarding or alighting from loop endpoints or current platform scope. Across all
CCL rows, 608 departures are at or after `24:00:00`, with a maximum
`24:43:20`. Preserve those service-day times and all repeated occurrences.

The global source inventory still has **1,124 unique entries**. Its full draft
has **1,155 decision cells**, because the 31 partial CCL patterns each require
an additional unresolved date cell. There are 977 unresolved cells: 119 within
CCL (31 earlier partial cells plus 88 whole-calendar cells) and 858 outside.
The focused artifact has 178 matched cells and is globally incomplete: its 946
wholly missing source entries are 88 CCL patterns plus 858 outside inputs. Its
46,735 missing pattern-date pairs include **13,101 within CCL** and 33,634
outside. The 31 partially present patterns' 1,837 earlier missing dates are
included in the date count even though those patterns are not wholly missing
entries. The focused unresolved-decision count of zero reflects omitted cells,
not resolution of their gaps.

Reproduce in a fresh directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json CCL \
  /tmp/new-ccl-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the corresponding generated files. All
five outputs reproduce byte-for-byte across independent runs; full drafts and
large evaluation reports remain outside Git, with hashes in the summary. Full
draft accounting is valid and complete, but readiness remains unresolved. The
matched-only projection is valid and incomplete. No approval metadata or
exclusions are supplied; mapping-review eligibility and generation remain false.
Source semantics, calendar correctness, authoritative lineage, historical
platform evidence, rights/publication checks and normal repository review remain
separate gates.
