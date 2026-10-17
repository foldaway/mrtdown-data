# NSL mapping pilot: limited supported paths and overlapping source blockers

This partial pilot uses the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [matched-only draft](gtfs-nsl-pilot-draft.json),
[summary](gtfs-nsl-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) retain the exact source manifest,
canonical commit and topology fingerprint. Canonical `data` matches pinned commit
`d034d6babef4ea5bcac256d26c47dcd802bb39ba`. The underlying timetable is supplied
by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

**Four of 59 observed NSL patterns have matched proposals; 55 remain wholly
unresolved.** The focused draft contains 103 matches: one agency, 21 routes,
27 station parents, 50 physical platform stops and four patterns. Four further
source platform stops remain unresolved: `NS1_A`, `NS1_B`, `NS16_A` and
`NS16_B`. This is not whole-line acceptance or approval to generate arrivals.

The four supported patterns contain 18 distinct recurring source trip records
and 417 pattern-date pairs. The 55 unsupported patterns contain 1,718 records
and 7,458 pattern-date pairs. Complete NSL input therefore comprises 1,736 source
trip records and 7,875 pattern-date pairs. Calendar recurrence is not a count of
isolated departures, and matched platform identities do not approve every path
that references them.

## Agency, routes and actual ordered paths

Every raw NSL trip was independently sorted by decimal `stop_sequence`, and
all 59 pattern IDs and source-record digests were re-derived without changing
occurrences. All 21 route records reference `SMRT`, proposed as canonical
`SMRT_TRAINS` on line `NSL`. The canonical operator period starts 1987-11-07
and covers every supplied 2026 date. All source child codes and recursively
referenced parents identify consistent stations on those dates.

Fifty-six source station paths have one effective ordered candidate in
`NSL_MAIN_N` or `NSL_MAIN_S`, revision `r_2019_canberra`, effective from
2019-11-02 with no end. Identity/allocation and current platform diagnostics
keep 52 of those paths unresolved. The other three source paths have no ordered
candidate in any canonical NSL revision, as detailed below. There are no temporal
revision/code gaps among the 56 geometrically matched paths in this capture.

| Provider route | Actual source station-code endpoints | Supported / observed patterns | Supported / observed trip records | Matched / unresolved pattern-date pairs |
| --- | --- | ---: | ---: | ---: | ---: |
| NSL_NS1_NS5 | NS1→NS5 | 0 / 3 | 0 / 3 | 0 / 365 |
| NSL_NS1_NS7 | No source trips | 0 / 0 | 0 / 0 | 0 / 0 |
| NSL_NS1_NS16 | NS1→NS16 | 0 / 6 | 0 / 52 | 0 / 730 |
| NSL_NS1_NS19 | NS1→NS19 | 0 / 3 | 0 / 14 | 0 / 365 |
| NSL_NS1_NS28 | NS1→NS28 | 0 / 6 | 0 / 765 | 0 / 730 |
| NSL_NS5_NS1 | NS5→NS1 | 0 / 3 | 0 / 4 | 0 / 365 |
| NSL_NS7_NS28 | NS7→NS28 | 0 / 3 | 0 / 3 | 0 / 365 |
| NSL_NS13_NS26 | NS13→NS26 | 0 / 2 | 0 / 2 | 0 / 313 |
| NSL_NS13_NS28 | NS13→NS28 | 0 / 4 | 0 / 7 | 0 / 626 |
| NSL_NS16_NS1 | NS16→NS1 | 0 / 4 | 0 / 67 | 0 / 417 |
| NSL_NS16_NS13 | NS16→NS13 | 0 / 2 | 0 / 3 | 0 / 313 |
| NSL_NS16_NS28 | NS16→NS28 | 0 / 1 | 0 / 3 | 0 / 261 |
| NSL_NS17_NS1 | NS17→NS1 | 0 / 1 | 0 / 1 | 0 / 261 |
| NSL_NS17_NS26 | NS17→NS26 | 1 / 1 | 1 / 1 | 52 / 0 |
| NSL_NS17_NS28 | NS17→NS28 | 3 / 4 | 17 / 18 | 365 / 261 |
| NSL_NS21_NS1 | NS21→NS1 | 0 / 2 | 0 / 2 | 0 / 313 |
| NSL_NS27_NS1 | NS27→NS1 | 0 / 3 | 0 / 3 | 0 / 365 |
| NSL_NS28_NS1 | NS28→NS1 | 0 / 3 | 0 / 755 | 0 / 365 |
| NSL_NS28_NS7 | NS28→NS7 | 0 / 3 | 0 / 3 | 0 / 365 |
| NSL_NS28_NS13 | NS28→NS13 | 0 / 2 | 0 / 13 | 0 / 313 |
| NSL_NS28_NS16 | NS28→NS16 | 0 / 3 | 0 / 17 | 0 / 365 |

`NSL_NS1_NS7` has no source trips; its route identity proposal creates no
pattern or departure. Route mappings identify the line, not service direction,
endpoint correctness or acceptance of unresolved trips. Observed direction `0`
is associated with northbound paths and `1` southbound paths in this capture;
service selection follows ordered stations, not that numeric convention.
Calendar/path variants remain exactly as supplied rather than manufacturing a
reverse working or a missing weekend variant.

All four supported patterns are southbound `contiguousSegment` matches of
`NSL_MAIN_S/r_2019_canberra`, with actual starts at Bishan (NS17). Three terminate
at Marina South Pier (NS28), with 12 occurrences, and one terminates at Raffles
Place (NS26), with 10. Their service assignment does not prepend Jurong East
or extend a short working beyond its source endpoint. No supported path is a
full-length, cyclic or repeated-station match.

| Exact supported pattern ID | Route | Calendar | Trip records | Active dates | Source endpoints and occurrence count |
| --- | --- | --- | ---: | ---: | --- |
| `11fd607f184bbc6b6098654fb0b422f1e1e17c31110a146f86fdf1cee6b3910f` | NSL_NS17_NS26 | SERVICE_PH | 1 | 52 | NS17_B → NS26_B (10) |
| `2d32742323c6aa49c25e0960c07a7add8e75fbac1cfb3af5f1f93d131ac5d9b6` | NSL_NS17_NS28 | SERVICE_WD | 12 | 261 | NS17_B → NS28_B (12) |
| `2f236a0d9e021315a491b40a4e5bd4d98558f9c8c9d9218656c90a73b7992176` | NSL_NS17_NS28 | SERVICE_PH | 2 | 52 | NS17_B → NS28_B (12) |
| `d582ee4c900f4d6264c8581b8767c536a51ab2f00799b03b6dd26e4334abc12f` | NSL_NS17_NS28 | SERVICE_WE | 3 | 52 | NS17_B → NS28_B (12) |

## Grouped labels, incomplete alternative sets and terminal scope

The internal blockers overlap; the following counts must not be summed.

| Evidence group | Affected source patterns | Trip records | Pattern-date pairs |
| --- | ---: | ---: | ---: |
| NS1_A or NS1_B grouped A / D / E | 34 | 1,666 | 4,276 |
| NS16_A or NS16_B grouped A / C or B / D | 46 | 1,708 | 6,154 |
| Both NS1 and NS16 groups | 28 | 1,659 | 3,546 |
| Current NS28_A conflict on a geometrically matched southbound path | 4 | 4 | 626 |
| No ordered canonical path: skips/excursion | 3 | 3 | 365 |

At Jurong East, both `NS1_A` and `NS1_B` literally label **A / D / E**.
All three members exist in canonical NSL platform records and currently support
both NSL services. The source offers alternatives, not one physical allocation;
neither direction nor suffix chooses a member. A future reviewed platform-set
contract could represent such alternatives truthfully, but this unique-platform
pilot leaves both stops unresolved.

At Ang Mo Kio, `NS16_A` literally labels **A / C** and `NS16_B` labels
**B / D**. Current canonical NSL platform records contain only A and B; C and D
are absent. This is an **incomplete literal alternative set**, in addition to
unresolved unique allocation. Selecting the one recorded member would silently
discard part of the source group. The audit does not assert whether source or
canonical data is wrong, add platforms, or claim historical allocation evidence.
These two source entities therefore remain unresolved even where the recorded
A or B member supports the station path's direction.

At Marina South Pier, literal `NS28_A` uniquely identifies `MSP_NSL_A`,
currently scoped to `NSL_MAIN_N`; `NS28_B` identifies `MSP_NSL_B`, scoped to
`NSL_MAIN_S`. Four otherwise geometrically matched southbound patterns terminate
at `NS28_A`: the identity is clear, but the current scope does not include their
service. Three also depend on an unresolved Ang Mo Kio group; one weekday
`NSL_NS17_NS28` pattern has only this terminal conflict. Two additional
unmatched skip patterns also terminate at `NS28_A`, retaining the same literal
north-scoped target as a separate evidence concern without assigning them a
canonical service candidate.

Arrival at a terminal does not authorize changing the source to alighting-only,
overriding pickup/drop-off defaults or ignoring a current service restriction.
Current platform records are undated and do not independently prove historical
allocation or timetable correctness. All four supported paths agree with their
selected current platform restrictions and have no boarding-status conflict.
The unresolved terminal cases require separate source/occurrence evidence.

## Three unmatched source paths

The two `NSL_NS13_NS28` paths begin `NS13_B → NS18_B`, skipping NS14, NS15,
NS16 and NS17. Both have 12 occurrences and end at `NS28_A`. The source records
are one weekday trip and one Saturday trip; they represent 313 recurring calendar
dates, not two isolated operating days. Do not insert stops/times, assume an
express service, repair the source calendar or ignore their terminal evidence.

The `SERVICE_PH` path under `NSL_NS16_NS1` begins
`NS16_A → NS20_A → NS21_A → NS20_A → NS19_A → NS18_A`, then proceeds through
`NS17_A → NS16_A` and onward to `NS1_A`. It has 22 occurrences, repeating
both NS20 and NS16. Preserve that excursion and both repeats; truncating it to
a normal northbound path would change the source identity. Its calendar supplies
52 Sundays, not independently verified public holidays. It also references both
unresolved Ang Mo Kio and Jurong East platform groups.

| Exact unmatched pattern ID | Exact source trip ID | Active dates | Source-record SHA-256 |
| --- | --- | ---: | --- |
| `63ebed8183bc66609a130a29023c4d4fc832369a8e7405333b06dd28cb38770f` | NSL_SB_WD_203_3103 | 261 | `7010af82c6b5914e2ca7422910b36a6514f0231f5f14e4b5a04ff6d82bd4f4d7` |
| `ca38177593d5ce418035d20b1c1bcb818985f20d6805c385e7b01918094c8329` | NSL_SB_WE_203_4559 | 52 | `75dc793227ab7a1135db1aaeec194e9ab2b858e96ba92f2b7b11c635374381d4` |
| `eb2f75d6eba919e320a8d7fe748f45a9fb3bcad44d4ef11feff664822803f5c7` | NSL_NB_PH_210_5334 | 52 | `3e849fe7bf3e240b893ce01fd94754d61a7b53be4fe6f64fd349a11e6d89f92c` |

The [disagreement queue](gtfs-mapping-disagreements.md) retains the source
trip-level traces. These findings distinguish an unresolved source-versus-path
disagreement from a justified canonical correction; none is made here.

## Every unresolved NSL pattern

All dates in each listed source calendar remain unresolved. The summary retains
these exact IDs and date-set references, while the full draft preserves each
explicit disposition and source-record digest. Multiple blockers in a row are
intentional and remain after fixing only one issue.

| Exact provider pattern ID | Route | Calendar | Trip records | Unresolved dates | Evidence blockers |
| --- | --- | --- | ---: | ---: | --- |
| `04214d06974a4cda5b1efd1fd2223e58a4b7cacc8068085c3abc65a2f0a20559` | NSL_NS1_NS16 | SERVICE_PH | 7 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `0bf863b4d0c78463824920fd3871eb359df85342d90bb685182676661ccd233e` | NSL_NS1_NS16 | SERVICE_WE | 5 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `0e5ed11bd46340a3224fd2ea51b1f33d2c39ce652f5be68aa03f0ec5b5a21d2a` | NSL_NS1_NS16 | SERVICE_WD | 8 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `255c1797d2b9a4e06ef9fe6bce6fae477236b6f3eef0a75c2b548b1aa0266021` | NSL_NS1_NS16 | SERVICE_WD | 20 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `41b27984aaca6ad1e6d7056c9393e8aca9a5524af7b8c254a7a72e596ea97ed5` | NSL_NS1_NS16 | SERVICE_WE | 9 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `739d45fe0b79dc0b99fb51f8df5f89249a8272f5260a007d4f8bcfb1f6e6ab4f` | NSL_NS1_NS16 | SERVICE_PH | 3 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `6203dbd1b6d011b40b9be2dde4a0d36dfdb1c156f58404db96fa4f00877af7f8` | NSL_NS1_NS19 | SERVICE_PH | 4 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `a3b0172b0bc0410d7704de4d74f45d95b6bfc4a9c8c75155f9ed331925ab8ddd` | NSL_NS1_NS19 | SERVICE_WE | 4 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `b3289c346a14915edaf565e8d78cab81f1db8da58dcad6de494388ac87464961` | NSL_NS1_NS19 | SERVICE_WD | 6 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `1ee7e356aee197b199622fd50bbb6a5deccf49615972dfee6760f3c1ec64b111` | NSL_NS1_NS28 | SERVICE_WE | 207 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `297702265e11d6be897023b27b957f8e7ca0de6f1e13f4b75a636cc96cb7434b` | NSL_NS1_NS28 | SERVICE_WD | 256 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `4192c13f8a62d3879d882c88357ffedfa137b571d504d0453e544293b695ebb4` | NSL_NS1_NS28 | SERVICE_WE | 23 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `560724e519450cf00c583765c4269f08a3b9546b9bf4691504a80429fa800ccb` | NSL_NS1_NS28 | SERVICE_PH | 204 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `abb4d06c08f6406195f0750057d7c68215a0c2fc9fd99b5e79915835370fd340` | NSL_NS1_NS28 | SERVICE_PH | 27 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `ac7e8280c19e82f2469d74f3d4eb533db8f1af4b79d5f9fced29fb7cd57fbb8b` | NSL_NS1_NS28 | SERVICE_WD | 48 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `3375d866478a65402f5357a1dd3188edc00d0320b628c131b85de954f15edf61` | NSL_NS1_NS5 | SERVICE_WD | 1 | 261 | NS1 A / D / E group |
| `6892ca84bcca40ac8e66791da155bab8fb0d6e3e3115d4621c822bb7044d1dc0` | NSL_NS1_NS5 | SERVICE_WE | 1 | 52 | NS1 A / D / E group |
| `9a28fb2f7e5fca0a7706d06c6a99bf7c6d030528e3641f6dc044a762a8e3f03a` | NSL_NS1_NS5 | SERVICE_PH | 1 | 52 | NS1 A / D / E group |
| `76130275966d6ceb1cb26f9899911ef73283bde4323410e8207b66535b54eb0a` | NSL_NS13_NS26 | SERVICE_WD | 1 | 261 | NS16 group; C/D absent canonically |
| `eb088608b414b56e2c8174cfab2a15c945e05529d98bd1f20452d0a6123b51aa` | NSL_NS13_NS26 | SERVICE_WE | 1 | 52 | NS16 group; C/D absent canonically |
| `63ebed8183bc66609a130a29023c4d4fc832369a8e7405333b06dd28cb38770f` | NSL_NS13_NS28 | SERVICE_WD | 1 | 261 | NS14–NS17 skipped; also ends at north-scoped NS28_A |
| `9993131ca19bfbc8548834d9f63a587990ae589492a78e1cccfcda9bb4e58978` | NSL_NS13_NS28 | SERVICE_WE | 1 | 52 | NS16 group; C/D absent canonically; NS28_A current southbound scope conflict |
| `c29083b6965cdb7d1c1955a4cc1d727e09e6eaef3dbf1782f15819d09b626655` | NSL_NS13_NS28 | SERVICE_WD | 4 | 261 | NS16 group; C/D absent canonically |
| `ca38177593d5ce418035d20b1c1bcb818985f20d6805c385e7b01918094c8329` | NSL_NS13_NS28 | SERVICE_WE | 1 | 52 | NS14–NS17 skipped; also ends at north-scoped NS28_A |
| `826e7cad2667515806450623b97a401b5a682316d06917d9dd2ddfc9cc72a03a` | NSL_NS16_NS1 | SERVICE_WE | 15 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `eb2f75d6eba919e320a8d7fe748f45a9fb3bcad44d4ef11feff664822803f5c7` | NSL_NS16_NS1 | SERVICE_PH | 1 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically; NS16/NS20 excursion and repetition |
| `eeb566161c02533576668df5b3cde55384f3f1fa274c75ba0c88d99194df6066` | NSL_NS16_NS1 | SERVICE_WD | 36 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `fdfb1c2821d3a27cd2edb6528546946c448a2deeeb57e512dc90c82fa06a5a05` | NSL_NS16_NS1 | SERVICE_PH | 15 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `3861cbf94e30f2e2914be7ba2375f67612fdcb3f31bcf9ec49cae82e82509082` | NSL_NS16_NS13 | SERVICE_WD | 1 | 261 | NS16 group; C/D absent canonically |
| `600fad2b6f8c3bc59cde7f4efa35faf8091fc51b9960e53a52294501a0cab0b6` | NSL_NS16_NS13 | SERVICE_WE | 2 | 52 | NS16 group; C/D absent canonically |
| `084f66ba9135e364f2a0266197574df221e81e2e1ae221d580f79bd5846ce512` | NSL_NS16_NS28 | SERVICE_WD | 3 | 261 | NS16 group; C/D absent canonically |
| `dc6b9539b0b582af980db51375a687e2d0a7313c5aa149fceac7aaa5fcdd018d` | NSL_NS17_NS1 | SERVICE_WD | 1 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `393edbb5b9c60c4a7266761fe0240f654b415bdba5f6367a74f0d57b7a294799` | NSL_NS17_NS28 | SERVICE_WD | 1 | 261 | NS28_A current southbound scope conflict |
| `0b2d2817b32392e9dfb52bb1cb90c6fc52d4f72eaa14a2f9ebb396ad9aaac4bd` | NSL_NS21_NS1 | SERVICE_WD | 1 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `ceea74c5a53e5b73017c5645309b4f4e890b5f117561af56f7fc88b43649ccef` | NSL_NS21_NS1 | SERVICE_PH | 1 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `78561b963fde145d3c381ca80103b732bd9cbf3506acd962f1944d35393f01e8` | NSL_NS27_NS1 | SERVICE_PH | 1 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `85d648c00867aa2b1d38889f8a3f720e5004563c412cbc579d8a0295fcd9d733` | NSL_NS27_NS1 | SERVICE_WE | 1 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `aefe5623664c9e523795792c66c6c0ead96d2bafedec3bc14c28f09231054f51` | NSL_NS27_NS1 | SERVICE_WD | 1 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `43769f044242f5bc4d825e8d2ff98ae1e9eed6b11f4794b58a51562f87607eb4` | NSL_NS28_NS1 | SERVICE_WE | 231 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `5295d1049e11dd127cebd04274cb850fdfc41f6ad28c08d46b911aa00eef4ceb` | NSL_NS28_NS1 | SERVICE_WD | 298 | 261 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `5d610a8adcb3896369ec6aad8e03d5bee0b433f20b6a12db9e35415f067f3d30` | NSL_NS28_NS1 | SERVICE_PH | 226 | 52 | NS1 A / D / E group; NS16 group; C/D absent canonically |
| `c5602fbe74b84d4f80700d187760ee6a3c9afe10f2db93e998be8104444f28f2` | NSL_NS28_NS13 | SERVICE_WE | 1 | 52 | NS16 group; C/D absent canonically |
| `cafa257b2ef0df697ba94d9736b8c1497e8c4a20660743316898a3d2c1ca988c` | NSL_NS28_NS13 | SERVICE_WD | 12 | 261 | NS16 group; C/D absent canonically |
| `afb8db2c31a86a35d6ac9607e3fc59cb9c2496eba71c816ee5b0eba281aaf264` | NSL_NS28_NS16 | SERVICE_PH | 7 | 52 | NS16 group; C/D absent canonically |
| `b9127f64a86f30aa42fc7e41b36658bf159072827c77d89dad954c23528b6b07` | NSL_NS28_NS16 | SERVICE_WE | 3 | 52 | NS16 group; C/D absent canonically |
| `be693f741ffd3740fdf40a8014dec00a3e9ac2f8ffda402e8db8bec2ad47ca8e` | NSL_NS28_NS16 | SERVICE_WD | 7 | 261 | NS16 group; C/D absent canonically |
| `1697b9ec0be3c0c1947499869380bdea14296d5feaa7fb36184873f547293786` | NSL_NS28_NS7 | SERVICE_PH | 1 | 52 | NS16 group; C/D absent canonically |
| `35ad7997d50931fc40fd1bd9bb5ac93563e059eb02c3e39aa25ab8af263a02d9` | NSL_NS28_NS7 | SERVICE_WE | 1 | 52 | NS16 group; C/D absent canonically |
| `d4e2f175b4156676a189807070634c60e6defdc8a394a0aa382f0c9b40c27b50` | NSL_NS28_NS7 | SERVICE_WD | 1 | 261 | NS16 group; C/D absent canonically |
| `53270ded9c701c22f5d670d5fe542b4f1e06c22d7c9bf1005ca7477de104f298` | NSL_NS5_NS1 | SERVICE_WD | 2 | 261 | NS1 A / D / E group |
| `5bd89561110059e16550e35a2d7bf5385c9b2d344596c5e73f0ffa3458aaddbf` | NSL_NS5_NS1 | SERVICE_PH | 1 | 52 | NS1 A / D / E group |
| `ee95e789659dbbfa9b004b03ee355a1515d9eaaa67b7b2f6040768acb0c17d6f` | NSL_NS5_NS1 | SERVICE_WE | 1 | 52 | NS1 A / D / E group |
| `02fc1f5f0cad4e1e3e1a994d798d47d9a9cf2e906e9aaac7ad3a3c3f08a97b6d` | NSL_NS7_NS28 | SERVICE_WE | 1 | 52 | NS16 group; C/D absent canonically |
| `46f9f71fd2493e9de94608a6525cc2738e306ffc1876654fea98499997103508` | NSL_NS7_NS28 | SERVICE_WD | 1 | 261 | NS16 group; C/D absent canonically; NS28_A current southbound scope conflict |
| `f0933ba71d32950793ae9d994deea75033148d06b86161fedf4486f3f3e7314d` | NSL_NS7_NS28 | SERVICE_PH | 1 | 52 | NS16 group; C/D absent canonically; NS28_A current southbound scope conflict |

## Station, parent and physical platform identities

The dependency set has 54 source platform stops and 27 station parents. Fifty
platforms and all parents have unique identity proposals; the four grouped stops
are explicitly unresolved. Literal labels drive physical identities independently
of provider _A/_B suffixes.

| Source code | Provider parent ID | Canonical station | Source _A stop: literal label → target | Source _B stop: literal label → target |
| --- | --- | --- | --- | --- |
| NS1 | EW24 | JUR | NS1_A: **A / D / E** → unresolved | NS1_B: **A / D / E** → unresolved |
| NS2 | NS2 | BBT | NS2_A: **A** → BBT_NSL_A | NS2_B: **B** → BBT_NSL_B |
| NS3 | NS3 | BGB | NS3_A: **A** → BGB_NSL_A | NS3_B: **B** → BGB_NSL_B |
| NS4 | NS4 | CCK | NS4_A: **A** → CCK_NSL_A | NS4_B: **B** → CCK_NSL_B |
| NS5 | NS5 | YWT | NS5_A: **A** → YWT_NSL_A | NS5_B: **B** → YWT_NSL_B |
| NS7 | NS7 | KRJ | NS7_A: **A** → KRJ_NSL_A | NS7_B: **B** → KRJ_NSL_B |
| NS8 | NS8 | MSL | NS8_A: **A** → MSL_NSL_A | NS8_B: **B** → MSL_NSL_B |
| NS9 | NS9 | WDL | NS9_A: **A** → WDL_NSL_A | NS9_B: **B** → WDL_NSL_B |
| NS10 | NS10 | ADM | NS10_A: **A** → ADM_NSL_A | NS10_B: **B** → ADM_NSL_B |
| NS11 | NS11 | SBW | NS11_A: **A** → SBW_NSL_A | NS11_B: **B** → SBW_NSL_B |
| NS12 | NS12 | CBR | NS12_A: **A** → CBR_NSL_A | NS12_B: **B** → CBR_NSL_B |
| NS13 | NS13 | YIS | NS13_A: **A** → YIS_NSL_A | NS13_B: **B** → YIS_NSL_B |
| NS14 | NS14 | KTB | NS14_A: **A** → KTB_NSL_A | NS14_B: **B** → KTB_NSL_B |
| NS15 | NS15 | YCK | NS15_A: **A** → YCK_NSL_A | NS15_B: **B** → YCK_NSL_B |
| NS16 | NS16 | AMK | NS16_A: **A / C** → unresolved | NS16_B: **B / D** → unresolved |
| NS17 | CC15 | BSH | NS17_A: **A** → BSH_NSL_A | NS17_B: **B** → BSH_NSL_B |
| NS18 | NS18 | BDL | NS18_A: **A** → BDL_NSL_A | NS18_B: **B** → BDL_NSL_B |
| NS19 | NS19 | TAP | NS19_A: **A** → TAP_NSL_A | NS19_B: **B** → TAP_NSL_B |
| NS20 | NS20 | NOV | NS20_A: **A** → NOV_NSL_A | NS20_B: **B** → NOV_NSL_B |
| NS21 | DT11 | NEW | NS21_A: **A** → NEW_NSL_A | NS21_B: **B** → NEW_NSL_B |
| NS22 | NS22 | ORC | NS22_A: **A** → ORC_NSL_A | NS22_B: **B** → ORC_NSL_B |
| NS23 | NS23 | SOM | NS23_A: **A** → SOM_NSL_A | NS23_B: **B** → SOM_NSL_B |
| NS24 | NS24 | DBG | NS24_A: **A** → DBG_NSL_A | NS24_B: **B** → DBG_NSL_B |
| NS25 | EW13 | CTH | NS25_A: **A** → CTH_NSL_A | NS25_B: **C** → CTH_NSL_C |
| NS26 | EW14 | RFP | NS26_A: **B** → RFP_NSL_B | NS26_B: **D** → RFP_NSL_D |
| NS27 | CC33 | MRB | NS27_A: **A** → MRB_NSL_A | NS27_B: **B** → MRB_NSL_B |
| NS28 | NS28 | MSP | NS28_A: **A** → MSP_NSL_A | NS28_B: **B** → MSP_NSL_B |

The other-line parent IDs are `EW24` (Jurong East), `CC15` (Bishan), `DT11`
(Newton), `EW13` (City Hall), `EW14` (Raffles Place) and `CC33` (Marina Bay).
The snapshot parent `CC33` identifies Marina Bay, but its canonical CCL code
begins on 2026-07-12, replacing CE2. The supplied NSL child code `NS27` is valid
throughout 2026. Mapping the station parent does not grant pre-July CCL code or
service validity. City Hall's literal A/C and Raffles Place's B/D labels further
show why suffixes do not establish platform identity.

No NS6 occurrence is supplied or inserted into these paths. The two missing-stop
patterns are different: NS14–NS17 are required by the otherwise corresponding
canonical path and omitted from those source records. This audit makes no claim
that absent source indices imply absent canonical station entities.

## Calendars, occurrence rules and incomplete coverage

The source calendars cover 2026-01-01 through 2026-12-31 with no exceptions.
`SERVICE_WD` supplies 261 weekdays, `SERVICE_WE` 52 Saturdays and
`SERVICE_PH` 52 Sundays. Every pattern's exact date list was independently
checked against those flags. Names do not establish holiday operation, and
envelope bounds do not create dates absent from the authoritative list.

NSL contains 44,223 raw stop-time rows: 214 in supported trip records and 44,009
in unresolved records. The source omits `pickup_type`, `drop_off_type` and
`timepoint`; preserve their GTFS defaults, including at terminals, without
inventing occurrence rules. Across all NSL rows, 916 departures are at or after
`24:00:00`, with a maximum `25:04:52`. Preserve service-day times and all
repeated stop occurrences; these observations also include unsupported trips.

The full standalone draft has valid, complete accounting with **1,021 unresolved
entries: 59 within NSL (55 patterns and four platform stops), plus 962 outside**.
The matched-only projection omits those entries and remains incomplete. Its
47,974 missing pattern-date pairs include **7,458 within NSL** and 40,516 outside.
Its unresolved-decision count of zero reflects omission, not resolution or
intentional exclusion. No source pattern is partially covered in this standalone
NSL pilot; its four matched patterns cover their whole supplied calendars.

Reproduce in a fresh directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json NSL \
  /tmp/new-nsl-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the generated files. All five runner
outputs reproduce byte-for-byte across independent runs. Full drafts and large
evaluations remain outside Git, with hashes in the summary. No approval metadata
or exclusions are supplied; mapping-review eligibility and generation remain
false. Normal repository review, source semantics, calendar correctness,
authoritative lineage, historical platform evidence and rights/publication checks
remain separate gates.
