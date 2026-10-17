# EWL mapping pilot: supported proposals and unresolved platform allocation

This partial pilot uses the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [matched-only draft](gtfs-ewl-pilot-draft.json),
[summary](gtfs-ewl-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) retain the exact source manifest,
canonical commit and topology fingerprint. Canonical `data` matches pinned commit
`d034d6babef4ea5bcac256d26c47dcd802bb39ba`. The underlying timetable is supplied
by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

There are **72 observed EWL patterns: 45 have matched proposals and 27 remain
unresolved within EWL**. The focused draft contains 165 proposed matches: one
agency, 17 routes, 35 station parents, 67 physical platform stops and 45 patterns.
Supported paths account for 856 source trip records and 5,893 pattern-date pairs.
The unresolved paths add 1,436 trips and 3,285 pattern-date pairs, for 2,292 source
trips and 9,178 pattern-date pairs overall. Five additional source platform stop
entities remain unresolved. This is not acceptance of the whole line, either
mainline direction, or the airport branch. No proposal is approved or eligible
for generation.

## Agency, route and ordered-path review

All 17 route records reference `SMRT`, proposed as `SMRT_TRAINS` on line `EWL`.
Its canonical operator period starts 1987-12-12 and covers every supplied active
date. Route mappings establish line identity, not that every route has trips or
that every referenced pattern is accepted.

Every raw EWL trip was independently sorted by decimal `stop_sequence`, preserving
all occurrences. All 72 ordered station paths have a unique geometry in a
canonical revision covering their 2026 dates. Their source station codes and
parent dependencies are consistent. Platform allocation and scope keep the 27
unsupported paths unresolved even though their station geometry is recognizable.

The 45 supported paths use `EWL_MAIN_E` or `EWL_MAIN_W` revision
`r_2017_tuas_west_extension`, effective from 2017-06-18 with no end.
Twelve Pasir Ris → Tuas Link patterns are `exact` matches (390 trips); 33 patterns
are `contiguousSegment` matches (466 trips). Source endpoints remain intact;
assigning a service must not extend a short working to the service's full path.
There are no cyclic matches, skipped station disagreements or repaired paths
in this scope.

| Provider route | Actual source station-code endpoints | Supported / observed patterns | Supported / observed trip records | Source stop occurrences |
| --- | --- | ---: | ---: | ---: |
| `EWL_EW1_EW29` | EW1→EW29 | 6 / 6 | 341 / 341 | 29 |
| `EWL_EW1_EW33` | EW1→EW33 | 12 / 12 | 390 / 390 | 33 |
| `EWL_EW2_EW29` | No source trips | 0 / 0 | 0 / 0 | — |
| `EWL_EW2_EW33` | No source trips | 0 / 0 | 0 / 0 | — |
| `EWL_EW3_EW1` | EW3→EW1 | 6 / 6 | 46 / 46 | 3 |
| `EWL_EW4_EW1` | EW4→EW1 | 6 / 6 | 13 / 13 | 4 |
| `EWL_EW4_EW29` | EW4→EW29 | 1 / 1 | 17 / 17 | 26 |
| `EWL_EW4_EW33` | EW4→EW33 | 2 / 2 | 15 / 15 | 30 |
| `EWL_EW23_EW1` | EW23→EW1 | 6 / 6 | 6 / 6 | 23 |
| `EWL_EW24_EW33` | EW24→EW33 | 6 / 6 | 28 / 28 | 10 |
| `EWL_EW28_EW1` | No source trips | 0 / 0 | 0 / 0 | — |
| `EWL_EW29_EW1` | EW29→EW1 | 0 / 6 | 0 / 345 | 29 |
| `EWL_EW30_EW33` | No source trips | 0 / 0 | 0 / 0 | — |
| `EWL_EW32_EW1` | No source trips | 0 / 0 | 0 / 0 | — |
| `EWL_EW33_EW1` | EW33→EW1 | 0 / 12 | 0 / 413 | 33 |
| `EWL_CGL_CG_CG2` | CG→CG2 | 0 / 3 | 0 / 339 | 3 |
| `EWL_CGL_CG2_CG` | CG2→CG | 0 / 6 | 0 / 339 | 3 |

Five route records have no observed trips: `EWL_EW2_EW29`, `EWL_EW2_EW33`,
`EWL_EW28_EW1`, `EWL_EW30_EW33` and `EWL_EW32_EW1`. Their route identity
proposals do not create inactive pattern dispositions or manufacture departures.
The EW4→EW29 and EW4→EW33 patterns occur only on `SERVICE_WD`; their missing
weekend variants are not inferred. Other observed route/path shapes occur across
all three calendars, with the literal platform choices kept as separate patterns.

In this capture, mainline direction `1` paths run westward and direction `0`
paths eastward; airport direction `0` runs toward Changi Airport and `1` toward
Tanah Merah. Service assignment follows station order, not a direction-number,
provider suffix or route-name rule. The two Pasir Ris platforms and two Tuas Link
platforms occur in multiple terminal combinations; current canonical records
allow both mainline services there. A terminal stop occurrence does not prove
actual boarding, alighting or a particular train's platform allocation.

## All unresolved EWL cells

There are two independent issues: unresolved single-platform allocation from
literal provider groups, and an explicit current platform/service disagreement
at Expo. The groups themselves are not treated as corrupt source data. They
could support a future truthful platform-set contract after review; this initial
contract requires unique physical platforms and does not select one arbitrarily.

| Ordered source dependency group | Unresolved patterns | Source trip records | Pattern-date pairs | Additional current conflict |
| --- | ---: | ---: | ---: | --- |
| EW24_A, literal B / C | 18 | 758 | 2,190 | None found outside allocation ambiguity |
| CG_A → CG1_A → CG2_A | 3 | 339 | 365 | Expo B excludes eastbound EWL_CG_E |
| CG2_B → CG1_B → CG_B | 3 | 336 | 365 | Expo A excludes westbound EWL_CG_W |
| CG2_A → CG1_A → CG_A | 3 | 3 | 365 | Expo B permits westbound; grouped endpoints still unresolved |

The 18 Jurong East cases are six Joo Koon → Pasir Ris patterns (345 trips,
730 pattern-date pairs) and twelve Tuas Link → Pasir Ris patterns (413 trips,
1,460 pattern-date pairs). Both literal B and C are present in current canonical
`EWL_MAIN_E` scope, so service direction cannot choose between them. Their
station paths match the current mainline revision geometrically; no temporal
gap or missing station explains their unresolved state.

All nine airport patterns have three ordered occurrences and match the station
geometry of `EWL_CG_E/r_2010` or `EWL_CG_W/r_2010`, effective from 2010-01-01.
`CG_A` and `CG_B` both literally label Tanah Merah platforms **D / E**;
`CG2_A` and `CG2_B` both label Changi Airport platforms **A / B**. Both members
of each literal set exist and currently support both airport services, but no
unique allocation is established.

Expo `CG1_A` literally labels physical **B**, uniquely proposed as `XPO_EWL_B`,
whose current scope is `EWL_CG_W`. `CG1_B` literally labels physical **A**,
proposed as `XPO_EWL_A`, currently scoped to `EWL_CG_E`. These identity proposals
do not approve the six direction-conflicting patterns (675 trips, 730 pattern-date
pairs). The other three westbound patterns use `CG1_A` and agree with current
Expo B scope, but retain both grouped endpoint dependencies. Resolving grouped
labels alone would therefore leave six branch patterns blocked. The
[disagreement queue](gtfs-mapping-disagreements.md) preserves the Expo source
drift concern; neither suffixes nor an assumed label swap repair these paths.

The following inventory names every unresolved pattern. The summary preserves
all exact IDs and date-set references; the full draft also preserves source-record
digests and explicit unresolved dispositions. Counts describe recurring source
trip records and calendar dates, not isolated departure instances.

| Exact provider pattern ID | Provider route | Calendar | Trip records | Active dates | Blockers |
| --- | --- | --- | ---: | ---: | --- |
| `0d578d8d385bfa3e2b01a8a8bb4ded076accdd3931122bd26cc8576cb0902831` | EWL_CGL_CG_CG2 | SERVICE_WE | 116 | 52 | CG_A, CG2_A; Expo service conflict |
| `8d9296c5e62d320f76207b6af5f8d5fdf218f1c6a076cda0e21b9d247adcac1e` | EWL_CGL_CG_CG2 | SERVICE_WD | 109 | 261 | CG_A, CG2_A; Expo service conflict |
| `d43d898a8a251f7fad28777abdab9e7733e2736ce5724238730f90d0df5f1f7f` | EWL_CGL_CG_CG2 | SERVICE_PH | 114 | 52 | CG_A, CG2_A; Expo service conflict |
| `487952a1f69577368a1b54047b453ee718f5c65ece7fbf923106143868d27f9a` | EWL_CGL_CG2_CG | SERVICE_WD | 108 | 261 | CG2_B, CG_B; Expo service conflict |
| `ad6345ca0f9bb30f5961ae10be6de24a4607ca46781007d37b50bdb3fd24205a` | EWL_CGL_CG2_CG | SERVICE_WE | 115 | 52 | CG2_B, CG_B; Expo service conflict |
| `d05f45d0da2c14c4c4776da3cc4ad46415e5003ccc55e442d0422dfa2558fdd3` | EWL_CGL_CG2_CG | SERVICE_PH | 1 | 52 | CG2_A, CG_A |
| `d92f0d87e2a1d5e93a164a7144c0231c11adc975a1ade609ed64cc340c24b03d` | EWL_CGL_CG2_CG | SERVICE_WE | 1 | 52 | CG2_A, CG_A |
| `f2a72fee6ab2ebb33a78bd1b728e92ae415bbc52176777a03af72edd8576b574` | EWL_CGL_CG2_CG | SERVICE_WD | 1 | 261 | CG2_A, CG_A |
| `f41cb9b724a9dc2e3c658b00d16645438840554690c54ff045b05cfc398bb654` | EWL_CGL_CG2_CG | SERVICE_PH | 113 | 52 | CG2_B, CG_B; Expo service conflict |
| `064079d0b459c59829f0542cc5af20a6a328eb7a773cf2f4222e494d4ec3eb0b` | EWL_EW29_EW1 | SERVICE_PH | 75 | 52 | EW24_A |
| `09ceb2eeda1e47e23a8857d19a2c7c894b184151fcebc4204281dbeb4343968f` | EWL_EW29_EW1 | SERVICE_PH | 40 | 52 | EW24_A |
| `5b2e63c184449be3a38979826ecc194a31df9ecb6ca251a8a06bd6d89f0dc2b8` | EWL_EW29_EW1 | SERVICE_WD | 43 | 261 | EW24_A |
| `b62739b334abb6f03ad6b996eabb0ba41672e505792bb4154e8c71bfd607bfa1` | EWL_EW29_EW1 | SERVICE_WE | 64 | 52 | EW24_A |
| `ce661faa2df8d8ae5aa31a238ec93fd9cf23186a89c68426806f9b8cc2e3c431` | EWL_EW29_EW1 | SERVICE_WE | 46 | 52 | EW24_A |
| `eb9ee6beb473f2e23c8fc8584bf32b83f96f789b9c82d3663a72d7d1227d401c` | EWL_EW29_EW1 | SERVICE_WD | 77 | 261 | EW24_A |
| `17291ce6e41c1c52a260c07f06e878c457a536e15bf592ab7942a82f1e8b2aac` | EWL_EW33_EW1 | SERVICE_WD | 55 | 261 | EW24_A |
| `3a6779d76af6cd4d9e53f19fb267b0e87314352177c60c9f2a21ba2dff7b4a20` | EWL_EW33_EW1 | SERVICE_WE | 21 | 52 | EW24_A |
| `433ef694837edae215b674eaef5d1910e9cac8e9dd0782aba6f0562372459e19` | EWL_EW33_EW1 | SERVICE_WE | 44 | 52 | EW24_A |
| `5970dfe0d9750cf4f721c9da6c4d36c827f5e745d5d248c3c01281d9f5d90f82` | EWL_EW33_EW1 | SERVICE_PH | 27 | 52 | EW24_A |
| `60d100c8f5cca33cf57f846f45ba4c7f97d0257415f3e415a30fe65591857e3b` | EWL_EW33_EW1 | SERVICE_WD | 46 | 261 | EW24_A |
| `8607b18784e04c088e85c7a195dc652a429dae68b1187a756bf2b3731ec679bd` | EWL_EW33_EW1 | SERVICE_WD | 50 | 261 | EW24_A |
| `aa780f5d5c48fc7fcf015ed41fc0da322dc95ae47fe17b270aa95ee4522fb373` | EWL_EW33_EW1 | SERVICE_PH | 24 | 52 | EW24_A |
| `b5f7e39f54cdcb9635f66aed8b04655f9ccd88c7d59280bfdb3536da7a1c0b4f` | EWL_EW33_EW1 | SERVICE_PH | 27 | 52 | EW24_A |
| `ceffda02681721b97a71dd20e6946d59c7266619c74e7b3a32fcbdb71ebced2e` | EWL_EW33_EW1 | SERVICE_WE | 31 | 52 | EW24_A |
| `d034987ef277db19955d2e54bec6ad962eeea2ca8350972d2d9be137b9cebe4e` | EWL_EW33_EW1 | SERVICE_WE | 16 | 52 | EW24_A |
| `d4eb5e22d28186af6935475c34fbecbdb27d7d8f6ac003e4af66d2b0ee10c98c` | EWL_EW33_EW1 | SERVICE_WD | 34 | 261 | EW24_A |
| `dc802e511fa07e39e18b4d3a88f07b603623ed834978b453336aceb4558e635e` | EWL_EW33_EW1 | SERVICE_PH | 38 | 52 | EW24_A |

## Station and physical platform identities

Every source stop and recursively referenced parent was checked against canonical
station codes and explicit labels. There are 72 source platform stop IDs and 35
parent IDs in the EWL dependency set; 67 platforms and all 35 parents have unique
identity proposals. The table quotes literal labels independently of suffixes.
An unresolved row records its station identity without assigning one physical
platform from a group.

| Source station code | Provider parent | Canonical station | Source _A stop: literal label → target | Source _B stop: literal label → target |
| --- | --- | --- | --- | --- |
| EW1 | EW1 | PSR | EW1_A: **A** → PSR_EWL_A | EW1_B: **B** → PSR_EWL_B |
| EW2 | DT32 | TAM | EW2_A: **A** → TAM_EWL_A | EW2_B: **B** → TAM_EWL_B |
| EW3 | EW3 | SIM | EW3_A: **A** → SIM_EWL_A | EW3_B: **B** → SIM_EWL_B |
| EW4 | EW4 | TNM | EW4_A: **A** → TNM_EWL_A | EW4_B: **F** → TNM_EWL_F |
| EW5 | EW5 | BDK | EW5_A: **A** → BDK_EWL_A | EW5_B: **B** → BDK_EWL_B |
| EW6 | EW6 | KEM | EW6_A: **A** → KEM_EWL_A | EW6_B: **B** → KEM_EWL_B |
| EW7 | EW7 | EUN | EW7_A: **A** → EUN_EWL_A | EW7_B: **B** → EUN_EWL_B |
| EW8 | CC9 | PYL | EW8_A: **A** → PYL_EWL_A | EW8_B: **B** → PYL_EWL_B |
| EW9 | EW9 | ALJ | EW9_A: **A** → ALJ_EWL_A | EW9_B: **B** → ALJ_EWL_B |
| EW10 | EW10 | KAL | EW10_A: **A** → KAL_EWL_A | EW10_B: **B** → KAL_EWL_B |
| EW11 | EW11 | LVR | EW11_A: **A** → LVR_EWL_A | EW11_B: **B** → LVR_EWL_B |
| EW12 | DT14 | BGS | EW12_A: **A** → BGS_EWL_A | EW12_B: **B** → BGS_EWL_B |
| EW13 | EW13 | CTH | EW13_A: **D** → CTH_EWL_D | EW13_B: **B** → CTH_EWL_B |
| EW14 | EW14 | RFP | EW14_A: **A** → RFP_EWL_A | EW14_B: **C** → RFP_EWL_C |
| EW15 | EW15 | TPG | EW15_A: **A** → TPG_EWL_A | EW15_B: **B** → TPG_EWL_B |
| EW16 | EW16 | OTP | EW16_A: **A** → OTP_EWL_A | EW16_B: **B** → OTP_EWL_B |
| EW17 | EW17 | TIB | EW17_A: **A** → TIB_EWL_A | EW17_B: **B** → TIB_EWL_B |
| EW18 | EW18 | RDH | EW18_A: **A** → RDH_EWL_A | EW18_B: **B** → RDH_EWL_B |
| EW19 | EW19 | QUE | EW19_A: **A** → QUE_EWL_A | EW19_B: **B** → QUE_EWL_B |
| EW20 | EW20 | COM | EW20_A: **A** → COM_EWL_A | EW20_B: **B** → COM_EWL_B |
| EW21 | CC22 | BNV | EW21_A: **A** → BNV_EWL_A | EW21_B: **B** → BNV_EWL_B |
| EW22 | EW22 | DVR | EW22_A: **A** → DVR_EWL_A | EW22_B: **B** → DVR_EWL_B |
| EW23 | EW23 | CLE | EW23_A: **A** → CLE_EWL_A | EW23_B: **B** → CLE_EWL_B |
| EW24 | EW24 | JUR | EW24_A: **B / C** → unresolved | EW24_B: **F** → JUR_EWL_F |
| EW25 | EW25 | CNG | EW25_A: **A** → CNG_EWL_A | EW25_B: **B** → CNG_EWL_B |
| EW26 | EW26 | LKS | EW26_A: **A** → LKS_EWL_A | EW26_B: **B** → LKS_EWL_B |
| EW27 | EW27 | BNL | EW27_A: **A** → BNL_EWL_A | EW27_B: **B** → BNL_EWL_B |
| EW28 | EW28 | PNR | EW28_A: **A** → PNR_EWL_A | EW28_B: **B** → PNR_EWL_B |
| EW29 | EW29 | JKN | EW29_A: **A** → JKN_EWL_A | EW29_B: **B** → JKN_EWL_B |
| EW30 | EW30 | GCL | EW30_A: **A** → GCL_EWL_A | EW30_B: **B** → GCL_EWL_B |
| EW31 | EW31 | TCR | EW31_A: **A** → TCR_EWL_A | EW31_B: **B** → TCR_EWL_B |
| EW32 | EW32 | TWR | EW32_A: **A** → TWR_EWL_A | EW32_B: **B** → TWR_EWL_B |
| EW33 | EW33 | TLK | EW33_A: **A** → TLK_EWL_A | EW33_B: **B** → TLK_EWL_B |
| CG | EW4 | TNM | CG_A: **D / E** → unresolved | CG_B: **D / E** → unresolved |
| CG1 | CG1 | XPO | CG1_A: **B** → XPO_EWL_B | CG1_B: **A** → XPO_EWL_A |
| CG2 | CG2 | CGA | CG2_A: **A / B** → unresolved | CG2_B: **A / B** → unresolved |

Other-line parent IDs are intentional: `DT32` (Tampines), `CC9` (Paya Lebar),
`DT14` (Bugis) and `CC22` (Buona Vista). Airport code `CG` is a canonical
Tanah Merah code alongside `EW4`, sharing parent `EW4`; it does not denote a
separate station. Explicit F labels at Tanah Merah and Jurong East, B/C/D labels
at city interchanges, and Expo's labels demonstrate why provider _A/_B suffixes
cannot be used as physical labels.

Supported occurrences agree with the selected physical platform's current
service restrictions, and no current boarding-status conflict was found. All
literal grouped members exist in the current EWL platform records; the only
explicit service-scope conflicts in this audit are the six Expo cases above.
These are comparisons with current, undated platform records, not independent
proof of effective-dated historical allocations or timetable correctness. No
canonical or source correction, implicit exclusion, grouped-platform selection,
or historical permission is created.

## Calendars, occurrence semantics and coverage limits

The source calendars cover 2026-01-01 through 2026-12-31: `SERVICE_WD` has 261
weekdays, `SERVICE_WE` 52 Saturdays and `SERVICE_PH` 52 Sundays, with no
exception rows. These supplied flags are authoritative for this mapping input;
the names do not establish holiday operation. Exact date arrays, not their
envelope bounds, define the active cells.

All EWL trips contain 49,927 raw stop-time rows: 24,259 supported and 25,668
unresolved. The source omits `pickup_type`, `drop_off_type` and `timepoint`;
preserve their GTFS defaults without deriving occurrence rules from terminals
or current platform restrictions. Across all EWL rows, 585 departure times are
at or after `24:00:00`, with a maximum of `24:50:46`. Preserve service-day
times rather than wrapping them into a different date. These observations also
include unresolved trips and confer no acceptance on them.

The full standalone draft has complete input accounting and **959 unresolved
entries: 32 within EWL (five platform stops and 27 patterns), plus 927 outside**.
The matched-only pilot omits those same entries; its 42,498 missing pattern-date
pairs include **3,285 within EWL** and 39,213 outside. Its unresolved decision
count is zero only because unresolved entries are absent from that projection.
Mapping-review eligibility and generation remain false for both artifacts.

Reproduce in a fresh directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json EWL \
  /tmp/new-ewl-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the generated outputs. All five runner
outputs reproduced byte-for-byte across independent runs; full drafts and large
evaluations remain outside Git, with hashes in the summary. Normal repository
review, source semantics, calendar correctness, authoritative lineage, historical
platform evidence and rights/publication checks remain separate gates. No
approval metadata is supplied, no cells are excluded, and generation stays
blocked.
