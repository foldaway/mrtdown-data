# Cross-line GTFS review using the NEL decisions — 28 October 2026

## Review result

Carry the [accepted NEL reasoning](gtfs-nel-mapping-review-2026-10-28.md#review-discussion--28-october)
to evidence-equivalent inputs on the other eight line families. This covers
**896 additional existing proposed cells**, including **217 matched pattern/date
cells, 24,704 pattern/date pairs and 1,255,801 assigned trip/date pairs**.
It removes repeated routine identity/path questions from the human review queue.
It changes **zero** machine dispositions or assignments: **990,143 trip/date
pairs remain unassigned**, and **191 decisions remain mechanically unresolved**.

The transfers below record the reasoning applied under the user's instruction;
they are not an all-line approval, reviewer signature or operational verification.
The user accepted extending NEL's ordinary Sunday-on-PH assumption to the five
SMRT line families on 28 October. Implementation remains pending. The remaining
exceptions require specific evidence, rather than another vote on NEL's general rules.

**29 October AMK follow-up:** the [platform correction and regeneration](gtfs-amk-platform-evidence-2026-10-28.md)
adds physical C/D with reviewed non-passenger status. The missing-member
descriptions, counts and identities below retain this packet's original canonical
tree; consult that follow-up for the corrected topology and remaining boarding
conflicts.

## Exact evidence and scope

Contains information from LTA DataMall's `GTFSScheduleTrain`, accessed
2026-10-20, under the
[Singapore Open Data Licence v1.0](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html).
MRTDown is independent of LTA. The [source handoff](gtfs-public-handoff.md)
explains attribution and acquisition.

| Input | Verified identity |
| --- | --- |
| [Original ZIP](https://sources.mrtdown.org/blobs/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.zip) / [receipt](https://sources.mrtdown.org/captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json) | SHA-256 `9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`; 2,981,645 bytes; retrieved 21 October at 04:00 Singapore |
| Evidence canonical commit | `e66664deebfcc4fe22689c2ee35d9165790249c7` |
| Current review base | `13278e6b4ea2b8bc7473d55497f3b4d74449c367`, merged NEL PR #442 |
| Topology projection 1 | `e376c280fbd6292ed6fe03e7fa81541ad0b0b8c76a09f916f1e3898aac240ec1` |
| Normalized v3 full draft | `19698e1f167c47d97e484a377eaa52b6ede2cb91f618ca4ca3b353cdbfabad30` |
| Normalized assignments | `ad4756a9ba792ac3afeb0af55efaed2eff3387e7613413687db73d2989a351b9` |
| Blocker file bytes | `b21694b6fa772adb3b5df4c670cc12297ee33dbb7effbb9a31e043824a35f82e` |

The ZIP, every raw-table hash, all seven generated file hashes/lengths in
`summary.json`, normalized draft and assignment identities were rechecked.
Current `data/{operator,line,station,service}` and GTFS tooling match the evidence
commit; the topology fingerprint was recomputed. The whole `data/` tree differs
by an unrelated March DTL issue-history correction. Consequently the old commit
identity remains attached to the old evidence; it is not relabelled as current
main. Re-evaluation reproduced `blockers.json` and `assignment-validation.json`
byte for byte against the unchanged topology.

The private evidence directory is `/tmp/mrtdown-investigation-latest-review/`.
The [older inventory](gtfs-mapping-review-inventory.md) and nine pilot packets
linked there use the **14 October** capture. They remain useful explanations,
but their source-bound pattern IDs, route inventories and trip counts cannot
replace this packet's refreshed identities. In particular, CCL now has 48 routes
and its own three calendar IDs; DTL now has 1,480 source trips. Source admission,
freshness and publication readiness remain separate from this review.

## Decisions carried as one batch

| NEL principle | Exact transferred scope and conclusion | Limit retained |
| --- | --- | --- |
| Operator and route identity | `SBST` → `SBS` for DTL/SKLRT/PGLRT; `SMRT` → `SMRT_TRAINS` for NSL/EWL/CCL/TEL/BPLRT. All 111 non-NEL declared route IDs map to the line in the table below, including routes without trips. Source agency IDs, canonical membership and operator periods agree. | An identity creates no departures. Unused `LTA` has no alias candidate and stays unresolved. |
| Recursive station identity | All 186 referenced station parents identify one canonical station through code history and child/parent consistency; 169 are additional to NEL's 17. This includes other-line interchange parents. | Names alone are insufficient. Parent identity does not make the child's code valid before its effective date. |
| Literal physical platform | 391 additional unique single-label stop proposals match the literal `platform_code` at the same identified station and line. With NEL's 34, the draft has 425 individual platform proposals. | Identity does not approve every service allocation. NEL's Outram Park C/D assumption stays confined to `NE3_A`/`NE3_B`; it cannot supply Ang Mo Kio C/D or settle another station's labels. |
| Preserve complete alternatives | Seven existing v3 groups below retain every literal member, with station/line identity and every member's service, boarding and date checks on matched cells. | No direction/suffix-based member selection. Groups do not resolve Expo, missing Ang Mo Kio members or historical allocations. |
| Actual ordered journey | Apply the accepted source-faithful endpoint rule to all 217 non-NEL matched cells: 149 contiguous segments, 10 cyclic segments and 58 exact paths. Retain the full ordered occurrence list and final listed station as represented destination. | Do not prepend/append the canonical service, reverse a source path, deduplicate a loop return or infer onward travel. A compatible path does not prove operation. |
| Service dates and defaults | All 348,777 source stop-time rows omit `pickup_type`, `drop_off_type` and `timepoint`: preserve GTFS defaults 0, 0 and 1 respectively. All 19,119 trips retain their original source service dates and literal times, including 24+ hours. | Default pickup is not an alighting-only instruction. These semantics do not waive a platform restriction or add a holiday exception. |

The [GTFS stop-time reference](https://gtfs.org/documentation/schedule/reference/#stop_timestxt)
defines those defaults and after-midnight service-day times. Access semantics
and exact times are preserved according to the actual fields in this capture.
Across the whole source, 5,376 departure rows are at or after 24:00; NSL reaches
25:04:52. The other eight families contribute 5,169 such rows. These observations
also include unresolved trips and confer no eligibility on them.

Direction is derived from **stop order**. In this capture NSL 0 is northbound,
NEL 0 southbound, DTL 0 westbound and TEL 0 southbound; EWL 0 is eastbound on
both mainline and airport branch. SKLRT 0 is CW, BPLRT 0 Service A. PGLRT's
weekday East-CW path has **both** direction values: patterns
`054a6add0baa0d0fcbe7b465bd01b44000dafb005ff411a14140df4173d6462f`
(170 trips) and
`946acfcc266a2f18c40cf46343521a6b849c1bf9848fc81e139d8324d6efeee5`
(115 trips), both in WD. Retain both identities; do not repair the metadata.
CCL likewise follows the ordered CW/CCW path and exact revision, not NEL's
numeric convention.

Headsign text remains evidence. Among matched proposals, the only headsign
naming a different terminal station is the already-discussed NEL HarbourFront /
Sengkang case. Twelve CCL matched cells have directional headsigns, and the
19 matched LRT loop cells describe loops; those strings need not equal the
final station's name. For example current CCL pattern
`a7ff8ca52e643b551367066c7b0c46ec0ff58221794e434ae9ec34a91170b0f3`
(PH-after, two trips) represents Marina Bay → Prince Edward Road with source
headsign `Clockwise`. NEL's rule supports representing that listed segment;
it does not assert a continuation around the loop. All 12,075 assigned trips'
ordered occurrences and final represented destinations were checked against
the raw tables.

### Covered cells on the other lines

Matched/unresolved counts are **cells**, not disjoint pattern populations:
CCL's 31 partially matched patterns also have an unresolved earlier cell.
Assigned recurring trip records count only their assigned dates.

| Line | Declared routes | Matched / unresolved cells | Matched pattern/date pairs | Assigned recurring trips | Assigned trip/date pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| NSL | 21 | 10 / 49 | 1,147 | 25 | 4,435 |
| EWL | 17 | 66 / 6 | 8,448 | 1,617 | 218,680 |
| DTL | 7 | 16 / 0 | 1,877 | 1,480 | 200,897 |
| CCL | 48 | 31 / 119 | 1,656 | 1,098 | 53,762 |
| TEL | 15 | 75 / 2 | 9,125 | 1,619 | 200,183 |
| BPLRT | 1 | 0 / 6 | 0 | 0 | 0 |
| SKLRT | 1 | 6 / 6 | 730 | 1,618 | 212,880 |
| PGLRT | 1 | 13 / 0 | 1,721 | 2,935 | 364,964 |
| **Other eight** | **111** | **217 / 188** | **24,704** | **10,392** | **1,255,801** |

This extends the review reasoning to 896 cells beyond the 69 NEL cells: one new
agency, 111 routes, 169 parents, 391 individual stops, seven groups and 217
pattern/date cells. Shared NEL agency/parent keys are counted once. The exact
set is the matched full draft minus the 69 keys in the existing NEL pilot draft;
the detail query below emits every full input ID, source-record hash and target.

| Source stop IDs | Literal alternatives retained | Complete canonical target members |
| --- | --- | --- |
| `NS1_A`, `NS1_B` | A / D / E | `JUR_NSL_A`, `JUR_NSL_D`, `JUR_NSL_E` |
| `EW24_A` | B / C | `JUR_EWL_B`, `JUR_EWL_C` |
| `CG_A`, `CG_B` | D / E | `TNM_EWL_D`, `TNM_EWL_E` |
| `CG2_A`, `CG2_B` | A / B | `CGA_EWL_A`, `CGA_EWL_B` |

These are the seven records already represented in the refreshed draft. Their
27 matched patterns / 3,285 pattern dates are already included in the totals;
this review does not newly recover them. The groups permit the compatible
westbound Expo-B short workings, while the six incompatible airport cells stay
unresolved.

Interchange examples checked in the refreshed source include `CC33` → MRB for
NSL/TEL children, `CC34` → BFT for DTL, `NE16` → SKG for SKLRT, `NE17` → PGL
for PGLRT and `EW4` → TNM for `CG` children. Child codes and line membership
remain separately dated. The [parent-identity explanation](gtfs-mapping-disagreements.md#interchange-parent-identity)
applies; it cannot approve pre-July CCL `CC33`/`CC34` occurrences.

## Holiday families: one policy exception

All six source calendars cover 2026-01-01 through 2026-12-31 with **zero exception
rows**. `SERVICE_WD/WE/PH` are used by every family except CCL;
`SERVICE_WD_CCL/WE_CCL/PH_CCL` are used by CCL alone. Each corresponding pair
has identical literal date arrays: 261 Monday–Friday dates, 52 Saturdays and
52 Sundays. `PH` names do not activate public holidays. There are no source
holiday-eve or engineering-adjustment exception rows.

| Family | Primary evidence checked on 28 October | Transfer conclusion |
| --- | --- | --- |
| NEL | [SBS first/last trains](https://www.sbstransit.com.sg/first-train-last-train), NEL table updated 10 December 2024 | The user already selected full Sunday-on-PH substitution as a **Foldaway assumption**. Full-day equivalence is unproven. |
| DTL, SKLRT, PGLRT | Same SBS page explicitly groups Sunday/PH first trains for each; DTL table updated 28 February 2025, LRT tables 2 June 2020 | Carry the same rationale and proposed assumption within SBS, with the older LRT evidence date visible. This does not establish every 2026 departure or settle East-loop platforms. |
| NSL, EWL, airport branch | [SMRT Jurong East first/last trains](https://journey.smrt.com.sg/journey/station_info/jurong-east/first-and-last-train/) and [Changi Airport's rail information](https://www.changiairport.com/en/at-changi/transport-and-directions/leaving-the-airport.html) group Sunday/PH | Supports the same day-type rationale and the recorded assumption below; full-day departure equality remains unproven. |
| TEL | [SMRT Marine Terrace first/last trains](https://journey.smrt.com.sg/journey/station_info/marine-terrace/first-and-last-train/) groups Sunday/PH, with separate holiday-eve last trains | Supports ordinary holiday day type; it does not supply the extra eve trips. |
| CCL | [SMRT Marymount first/last trains](https://journey.smrt.com.sg/journey/station_info/marymount/first-and-last-train/) groups Sunday/PH for full-loop and short workings | Supports current day-type rationale, using `SERVICE_PH_CCL`. It cannot validate pre-opening loop dates or resolve ambiguous services. |
| BPLRT | Live SMRT Journeys tables for [Choa Chu Kang](https://journey.smrt.com.sg/journey/station_info/choa-chu-kang/first-and-last-train/) and [Bukit Panjang](https://journey.smrt.com.sg/journey/station_info/bukit-panjang/first-and-last-train/) group Sunday/PH. A [joint LTA/SMRT release](https://www.lta.gov.sg/content/ltagov/en/newsroom/2024/11/news-releases/service_adjustments_for_bukit_panjang_LRT.html) confirms full dual-loop availability throughout weekends and PH from 28 September 2024. | Stronger support than the 2019 appendix alone. Full-day availability does not prove identical departure times, and dated engineering exceptions remain separate. No Service A/B platform allocation is established at Choa Chu Kang. |

**H1 — discussion decision accepted on 28 October:** the user agreed to carry
NEL's ordinary Sunday-on-PH assumption to NSL, EWL (including airport), TEL, CCL
and BPLRT. Prospectively use the corresponding Sunday/PH timetable on official
public holidays, replacing ordinary WD/WE selection, with explicit dated
adjustments reviewed separately. Preserve original service dates for 24+ times
and holiday-eve extensions. This remains a Foldaway assumption; do not describe
it as operator-confirmed full-day equality. The SBS evidence supports carrying
the NEL reasoning to DTL/SKLRT/PGLRT as the same review recommendation; no
additional line-by-line question is needed. This prose decision creates no
digest-bound mapping/release/source approval or implementation. Original source
calendars, date sets, proposal digests and coverage counts remain unchanged.

### SMRT investigation: stronger baseline evidence, separate dated exceptions

Direct retrieval on 28 October at 19:01 Singapore confirmed the Sunday/PH grouping
in all six sampled live tables: Jurong East, Marine Terrace, Marymount, Choa Chu
Kang, Bukit Panjang and Changi Airport. SMRT Journeys loads these from
`https://connect-cdn.smrt.wwprojects.com/autoupdate/mrt-timing/<station name>.html`.
This address is declared by its public `helpers/common.js` and used by
`views/mrt/station_info.js`; it is the website's own displayed source. The plain
station-page response is only a JavaScript shell, so it was not counted as a
freshly retrieved timetable. Private originals and their URL/time/byte/hash
manifest are in `/tmp/smrt-holiday-investigation-2026-10-28/`.

| Retrieved timetable | SHA-256 of original HTML bytes |
| --- | --- |
| Jurong East | `5101fa62296549530b98ccf52c584dec8215391bb9de479948b21871247ed372` |
| Marine Terrace | `5a402b027db52598b6db5db42bd29a609a4bf09a4f8f34aaed3ab1df2d5e256f` |
| Marymount | `b882f8ddae8297714bada76732f8508a4714c83acdd23f452e1126e59457587b` |
| Choa Chu Kang | `5f5dc6fb7a047732819f994a01cea3da1950411980bf30814ea905129e1b07cc` |
| Bukit Panjang | `9be65e4a5ed1ab100987261bebc06c489baaf3eab7aa85c6a262a46d33098dbc` |
| Changi Airport | `a015a7ca9b19390e7bedfdaeb1eef59ea112fee79c1e13ab2f99667c1ff994f7` |

To re-fetch, substitute the lowercase station name with spaces percent-encoded
in the CDN URL above; keep later observations separate if bytes change. To
reproduce the source comparison, filter `trips.txt` by each literal trip ID,
join `stop_times.txt`, and inspect `NS1_B`, `EW24_B`, `CC16_A`, `TE27_B` and
the initial `BP1_A` occurrence respectively. Confirm the WD equivalents by
substituting `_WD_` in these sample trip IDs, with the CCL WD ID given below.

These sampled first departures compare the pinned ZIP's WD/PH trips with the
live operator's published Sunday/PH first train. Source seconds remain literal;
agreement is at the published minute precision and does not prove full-day equality.

| Line / represented journey | Source WD departure | Source PH departure / exact trip ID | Published Sunday/PH first train |
| --- | --- | --- | --- |
| NSL, Jurong East → Marina South Pier | 05:16:15 | 05:35:18, `NSL_SB_PH_403_217` | 05:35 |
| EWL, Jurong East → Tuas Link | 05:14:02 | 05:44:23, `EWL_MAIN_WB_PH_111_323` | 05:44 |
| CCL, Marymount anticlockwise | 05:26:35 | 05:49:25, `CCL_Anticlockwise_PH_0002_0001` | 05:49 |
| TEL, Marine Terrace → Woodlands North | 05:56:15 | 06:16:00, `TEL_WB_PH_113_0479` | 06:16 |
| BPLRT, Choa Chu Kang departure | 05:13:40 | 05:32:40, `BPLRT_A_PH_1` | 05:32 at both listed platforms |

The CCL WD comparison uses `CCL_Anticlockwise_WD_0004_0001`, sequence `5`;
the PH comparison is also sequence `5`. Other table examples are sequence `1`.
TEL's WD equivalent is `TEL_WB_WD_126_1178`, rather than the PH trip's suffix.

For example, [MOM lists 1 January 2026 as a Thursday public holiday](https://www.mom.gov.sg/employment-practices/public-holidays).
The literal source enables WD that day, so it selects the earlier WD examples;
the prospective policy would select the PH examples. Their platform/path blockers
still apply. All five families exhibit the same need for an explicit holiday
date rule; changing operators alone does not establish a different baseline.
No published comparison of every Sunday and holiday departure was found.

The BPLRT release also supplies a concrete counterexample to unconditional
Sunday/PH equality: from **14 November 2024 through 31 October 2025**, ordinary
Thursday–Sunday services closed early, while PH were exempt. That finite period
is outside this source's 2026 calendars and must not be extended into 2026.
The live BPLRT tables still display rows explicitly ending on 31 October 2025;
retrieval today does not renew their applicability. Separately,
[LTA's 2026 service-adjustment notice](https://www.lta.gov.sg/content/ltagov/en/map/announcement.html/1000)
records BPLRT closures on **20 and 27 September 2026**. The literal source still
activates 394 BPLRT trips on each of those Sundays, without exceptions. Ordinary
calendar recurrence therefore does not establish actual historical operation.

[SMRT's 27 October announcement for Deepavali Eve](https://www.smrt.com.sg/news-publications/newsroom/service-announcements/last-bus-train-timings-extension-for-deepavali-eve-2026/)
provides a current example of a separate dated extension: NSL/EWL/CCL/TEL run
later on **7 November 2026**, while BPLRT and the airport service receive no
extension. Those after-midnight runs belong to the 7 November service day;
they must not be replaced merely because the wall clock reaches the 8 November
holiday. The 21 October capture predates this announcement, which does not
supply a complete extended trip list.

One additional source-versus-operator discrepancy needs reconciliation separately
from H1: at Marine Terrace, the live operator table lists Saturday's first
Woodlands North train at **05:56**, but the earliest supplied northbound Saturday
occurrence is **06:16:00**, `TEL_WB_WE_113_0479`, sequence `1`, `TE27_B`.
Its pattern is `473814e41987be427fa0bb461415e4504773418a39087b72feea75ad38802de2`,
WE date set `71dc7758992ac07e70ceea437989e7ecc4f74a78d4ca15adaf04647a857eb989`.
The complete Saturday stop-time scan found no earlier occurrence in that direction.
The cell remains mechanically compatible; the disagreement does not establish
which publication is operationally correct. Preserve both sources for semantic
review rather than inserting a missing trip or changing the calendar. The
holiday assumption cannot resolve this ordinary-Saturday disagreement.

A separate implementation must preserve source calendars, bind authoritative
holiday dates and a policy revision, replace the ordinary WD/WE family on each
holiday's **service date**, select the corresponding CCL family, and validate
exact revision/code/platform coverage on every resulting date. Holiday eves,
special closures and extra trains need their own evidence; Sunday substitution
does not model them. No calendar or holiday implementation is included here.
All counts and date-set IDs below still describe the **literal source**.

## Consolidated exceptions requiring evidence

Counts overlap across rows. A physical identity can be carried while a pattern
using that platform stays incompatible. None of these needs the user to reaccept
NEL's generic identity, short-working or after-midnight rule.

| Shared cause | Exact affected scope | What NEL reasoning resolves; evidence still needed |
| --- | --- | --- |
| Missing group members | `NS16_A` A/C and `NS16_B` B/D; 46 dependent NSL cells / 6,154 pattern dates | AMK identity and literal A/B are clear; C/D have no canonical members. Obtain independent station-layout/allocation evidence before a separate canonical correction or provider correction. Neither dropping alternatives nor borrowing Outram Park's assumption is supported. |
| Current platform/service disagreement | Expo: six cells / 675 recurring trips / 730 pattern dates, occurrence 1. Eastbound `CG_A → CG1_A → CG2_A` uses literal B (`XPO_EWL_B`), scoped westbound. Westbound `CG2_B → CG1_B → CG_B` uses literal A, scoped eastbound. | Complete endpoint groups remove those dependencies, but the intermediate allocation still fails. Seek dated operator evidence or provider correction; suffix matching and a presumed label swap would contradict the source. |
| Same disagreement, different infrastructure | Sengkang East: six cells / 1,491 trips / 730 pattern dates. CW uses `SE1_B` through `SE5_B` (label 2); CCW uses `SE5_A` through `SE1_A` (label 1), at indices 1–5. Current scopes permit the opposite East service. | Both STC occurrences and the full loop geometry pass; town-centre platform evidence does not establish intermediate labels. Verify Compassvale, Rumbia, Bakau, Kangkar and Ranggung allocations against the observed/inferred canonical provenance. |
| Same disagreement at both terminal occurrences | BPLRT: all six cells / 1,248 trips / 730 pattern dates. Service A uses `BP1_A` (literal 1, currently B-scoped); Service B uses `BP1_B` (literal 2, currently A-scoped), at indices **0 and 18**. | Preserve both Choa Chu Kang occurrences. Final-arrival reasoning cannot fix the initial boarding conflict. Verify boarding allocations and alighting infrastructure separately; keep the 19-occurrence path intact. |
| Terminal arrival versus pickup/service scope | Marina South Pier: four geometric cells / four trips / 626 pattern dates end at `NS28_A` → `MSP_NSL_A`, currently northbound-scoped. Two no-path skip cells also end there. | Final listed station is MSP; no onward travel is inferred. That does not change default pickup/drop-off or waive the southbound service restriction. Obtain occurrence/turnaround evidence before a separately reviewed semantics or data change. Three of the four geometric cells also depend on AMK groups. |
| Historical dates, ambiguous service identity and undated allocations | CCL: 119 unresolved cells / 13,101 pattern dates; 31 also have matched later cells | Parent identity and source-faithful short workings carry. They do not select among multiple canonical services, backdate codes or turn current platform restrictions into historical facts. Exact cause/date partition follows below. |
| Non-contiguous supplied stop order | Five no-path cells / 17 recurring trips / 469 pattern dates; three NSL, two TEL | Short-working acceptance preserves a contiguous segment; it cannot make an interior omission or excursion contiguous. Retain every source occurrence and seek service-specific evidence or provider correction. |
| Declared unused agency | `LTA`, source-record SHA-256 `29b2287c0b78538657dca32abede5560a3948c7fb01a16474e1e4ed7eb45cb7f`; no route references it | Do not invent an operator alias. A future reviewed accounting disposition must preserve this declaration; no ignored/excluded disposition is introduced here. |

Current undated platform records are independent observations/inferences, not
proof that the feed is operationally wrong. The [disagreement evidence](gtfs-mapping-disagreements.md#platform-evidence)
retains its station and period limits. The [platform contract](gtfs-platform-group-review.md#contract)
continues to require every literal alternative to pass.

### CCL: retain dates and distinguish three causes

[LTA confirms the CCL6 passenger opening on 12 July 2026](https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/circle_line_6.html).
The canonical July boundary remains supported. The following is a disjoint
classification of unresolved **dates** by temporal candidate count, then current
platform compatibility; it does not add overlapping diagnostic counts.

| Date side | No valid temporal candidate | Multiple candidates | Unique candidate, current platform conflict | Matched |
| --- | ---: | ---: | ---: | ---: |
| Before 12 July | 5,374 | 795 | 1,592 | 0 |
| From 12 July | 0 | 1,731 | 3,609 | 1,656 |

Of the earlier gaps, 4,415 pattern dates have no effective matching geometry;
959 have a revision but fail the supplied child-code periods. `CC30`–`CC34`
start on 12 July; `CC33`/`CC34` are not rewritten to older `CE2`/`CE1`.
Ambiguous dates match main/extension services before July or branch/loop services
afterward. A current platform preference cannot choose the historical service.
Post-July platform conflicts occur at `CC9_A`/`CC9_B` (Paya Lebar); earlier
main/extension conflicts involve the undated service scopes at multiple stations.
This is a request for dated allocation/service evidence and source-calendar
reconciliation, not permission to backdate platform scopes or truncate January–July.

Three representative full pattern IDs locate each cause in the refreshed source:

- Gap then current allocation conflict: `00136f828d2178d39313554bcf2951396353cb01b6d74ee375781e7aa5f124ff`,
  `CCL_CC11_CC33`, trip `CCL_Anticlockwise_PH_0015_0009`, PH-before / PH-after.
- Ambiguity on both sides: `000127124977c15464ea576ab14c3c96da07de5eafdf03dd53dd0a84a5eaebc4`,
  `CCL_CC4_CC17`, trip `CCL_Anticlockwise_PH_0026_0017`, PH-before / PH-after.
- Unique earlier candidate blocked by undated scope, later matched:
  `000a13bbfa5d47b2fad1ab2e0051f792c53071f894ebd34967a46ed8fbda721c`,
  `CCL_CC1_CC6`, trip `CCL_Clockwise_WE_0002_0005`, WE-before / WE-after.

The deterministic exception query below identifies **all 119** CCL cell keys,
every diagnostic sub-date-set and each conflicting occurrence/candidate, rather
than asking for 119 separate decisions. None is resolved by merely accepting
its final listed station.

### No-path traces and exact smaller exception cells

The two NSL southbound source trips `NSL_SB_WD_203_3103` and
`NSL_SB_WE_203_4559` go directly `NS13_B → NS18_B`, omitting NS14–NS17.
`NSL_NB_PH_210_5334` begins `NS16_A → NS20_A → NS21_A → NS20_A → NS19_A →
NS18_A`, later repeating NS16; preserve the excursion and both repeats.
The two TEL cells omit `TE22_A` between `TE20_A` and `TE23_A`; each contains
seven trips, with suffixes `103_0101`, `104_0139`, `105_0177`, `125_0874`,
`142_0891`, `143_1101`, `144_1117` under `TEL_CB_WE_` or `TEL_CB_PH_`.
No NEL principle authorizes inserting their absent stops/times or deleting an
excursion. The following keys identify every smaller allocation/terminal/path
exception; the 46 AMK-dependent and 119 CCL cells are selected exhaustively by
the query instead of duplicated here.

| Exception | Full pattern ID | Date-set alias | Recurring trips | One exact source trip |
| --- | --- | --- | ---: | --- |
| Expo | `0d578d8d385bfa3e2b01a8a8bb4ded076accdd3931122bd26cc8576cb0902831` | WE | 116 | `EWL_CGL_EB_WE_101_102` |
| Expo | `487952a1f69577368a1b54047b453ee718f5c65ece7fbf923106143868d27f9a` | WD | 108 | `EWL_CGL_WB_WD_101_2097` |
| Expo | `8d9296c5e62d320f76207b6af5f8d5fdf218f1c6a076cda0e21b9d247adcac1e` | WD | 109 | `EWL_CGL_EB_WD_101_10` |
| Expo | `ad6345ca0f9bb30f5961ae10be6de24a4607ca46781007d37b50bdb3fd24205a` | WE | 115 | `EWL_CGL_WB_WE_101_471` |
| Expo | `d43d898a8a251f7fad28777abdab9e7733e2736ce5724238730f90d0df5f1f7f` | PH | 114 | `EWL_CGL_EB_PH_101_102` |
| Expo | `f41cb9b724a9dc2e3c658b00d16645438840554690c54ff045b05cfc398bb654` | PH | 113 | `EWL_CGL_WB_PH_101_473` |
| Sengkang East | `514e72d11a6f3cc2a32fb341a6de664a64f86ccb5d48847804aaea12ae253d54` | WE | 252 | `SKLRT_EI_WE_1` |
| Sengkang East | `94dc8a9b7b2e449458e57a8fd4544672b1cf71ddfffc4466ae64c780a640dca7` | WD | 235 | `SKLRT_EO_WD_1` |
| Sengkang East | `9f7879b17389a2c18a9968dcf69500c3b98081de24b727d3cc00eeed884eecba` | PH | 248 | `SKLRT_EO_PH_1` |
| Sengkang East | `e5b2610c547b5872e4923dff0d690b34f2f56cedcb55be52d6b5eb50fe1dc3c3` | WE | 252 | `SKLRT_EO_WE_1` |
| Sengkang East | `e60f0652fc80284b32b8489e7ba4ca3838bc7fbcb50486e7590bae559bb9e447` | WD | 256 | `SKLRT_EI_WD_1` |
| Sengkang East | `f5585af854ba8467c5b366ad89170876ed89b1d9baed87ae57b984efe3bb5c93` | PH | 248 | `SKLRT_EI_PH_1` |
| Choa Chu Kang | `0d68d8b458a63eba80c0fa49d7ae54014e96d3d1dfd3246329150942fd444311` | PH | 197 | `BPLRT_A_PH_1` |
| Choa Chu Kang | `2631425097b532d1efa9adaddced66c55c9528cb1b067e123fff94ca4f7b4295` | WE | 201 | `BPLRT_A_WE_1` |
| Choa Chu Kang | `41cc4832a457d664ce946ef632ff5d5f45bff72b0c47bc6eac8bcd8f88f8e9e5` | PH | 197 | `BPLRT_B_PH_1` |
| Choa Chu Kang | `5d72377c77349c7dfe10b564956eba0f306156e65a0a27f94ffaa2f897f07d74` | WD | 226 | `BPLRT_A_WD_1` |
| Choa Chu Kang | `9f6db5a1f6f5b7fff94aa842caf9157b427dd7f0b5e361513391b07e92a4418b` | WE | 201 | `BPLRT_B_WE_1` |
| Choa Chu Kang | `c8a157915aa4b8e394842010023644f9b038a16f8249375238c53bbb2470685b` | WD | 226 | `BPLRT_B_WD_1` |
| Marina South Pier | `393edbb5b9c60c4a7266761fe0240f654b415bdba5f6367a74f0d57b7a294799` | WD | 1 | `NSL_SB_WD_215_3105` |
| Marina South Pier | `46f9f71fd2493e9de94608a6525cc2738e306ffc1876654fea98499997103508` | WD | 1 | `NSL_SB_WD_401_215` |
| Marina South Pier | `9993131ca19bfbc8548834d9f63a587990ae589492a78e1cccfcda9bb4e58978` | WE | 1 | `NSL_SB_WE_204_221` |
| Marina South Pier | `f0933ba71d32950793ae9d994deea75033148d06b86161fedf4486f3f3e7314d` | PH | 1 | `NSL_SB_PH_401_215` |
| No path | `63ebed8183bc66609a130a29023c4d4fc832369a8e7405333b06dd28cb38770f` | WD | 1 | `NSL_SB_WD_203_3103` |
| No path | `ca38177593d5ce418035d20b1c1bcb818985f20d6805c385e7b01918094c8329` | WE | 1 | `NSL_SB_WE_203_4559` |
| No path | `eb2f75d6eba919e320a8d7fe748f45a9fb3bcad44d4ef11feff664822803f5c7` | PH | 1 | `NSL_NB_PH_210_5334` |
| No path | `07c0933b39e35a27d221c62f785c2dbe3764559d995155b92eb166cfddfd2740` | WE | 7 | `TEL_CB_WE_103_0101` |
| No path | `6e84f2113f0968bd922fbe5f70f3fd7236feee54f421dc20e4116e3d46c90410` | PH | 7 | `TEL_CB_PH_103_0101` |

Occurrence indices are zero-based. Use `blockers.json` for all trips in a cell
and each raw `stop_sequence`; repeated stops are separate occurrences.

## Deterministic detail and reproduction

These nine aliases bind exact arrays, not continuous envelope intervals:

| Alias | Count / enabled days | Full date-set ID |
| --- | --- | --- |
| WD | 261 Monday–Friday dates in 2026 | `9a53ff769a14653ad803b2d799a5cff88d4079a5c2fb1f93b62347d623363fdd` |
| WE | 52 Saturdays in 2026 | `71dc7758992ac07e70ceea437989e7ecc4f74a78d4ca15adaf04647a857eb989` |
| PH | 52 Sundays in 2026 | `eefec8dbd582ca6ff9402c99277ad1aab040300d7e1e5b991970ee3a43e0f946` |
| WD-before | 137 weekdays, through 10 July | `26e3b2f8d8bc83678ed290788bf66a14e019c3041f3997b35ecbd5f027dd880c` |
| WE-before | 28 Saturdays, through 11 July | `c54bffc4aec58c8d98d3af96cbd0069317098f7eaaecf54dffac4d089f43bd89` |
| PH-before | 27 Sundays, through 5 July | `49ce5a57dc8a8fbee96d2365a50490b036a0664d33c51331a2d42effab0e5017` |
| WD-after | 124 weekdays, from 13 July | `50b346a62d2864e73b1538f360a6df7fd4ed048473d50f9b89f24c4c9df25b51` |
| WE-after | 24 Saturdays, from 18 July | `b7c66debcc945c82b9c42270e3db274c52c62ffd114e4123fee52c186861922b` |
| PH-after | 25 Sundays, from 12 July | `4cfffeb6c4c1cca842b497db769d826afe64fe8ce7831f28ff72c78f75062a45` |

The [existing runner](gtfs-review-blockers.md#generate-and-inspect) can regenerate
the counts on this review's main base in a new output directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/mrtdown-investigation-latest-schedule.zip \
  /tmp/mrtdown-investigation-latest-capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/gtfs-cross-line-main-recheck-2026-10-28 \
  --canonical-commit 13278e6b4ea2b8bc7473d55497f3b4d74449c367 \
  --platform-groups --blockers --assignments
```

The exact old draft reproduces only with its recorded canonical identity;
the command above produces a different identity even with the same topology.
Never change the old digest to disguise that difference. Large outputs stay
outside Git.

This main-base regeneration passed: normalized full draft
`3f86b04220e44ab2667079d1a6f66ab6496aec2e8004dd4928315e5568101b6c`.
All decisions, exact dates, assignment contents, evaluations and diagnostics
equal the older evidence after accounting for the canonical commit identity
and derived digest fields. The normalized assignment digest remains
`ad4756a9ba792ac3afeb0af55efaed2eff3387e7613413687db73d2989a351b9`.

The reusable transfer set can be emitted from the verified existing directory:

```sh
jq -n --slurpfile d /tmp/mrtdown-investigation-latest-review/full-draft.json \
  --slurpfile n docs/gtfs-nel-pilot-draft.json '
  def key: [.kind, .providerId, (.dateSetId // "")] | tojson;
  ($n[0].decisions | map(key)) as $nel |
  [$d[0].decisions[] | select(.disposition == "matched") |
   select((key as $k | $nel | index($k)) == null)]
' > /tmp/gtfs-cross-line-transferred-cells.json
```

That file has 896 rows; pattern rows join to `summary.json.pilotPatterns` by
`providerId` **and** `dateSetId` for route/calendar/trip counts. Entity rows
retain literal provider IDs and source-record hashes; recursively referenced
parents are included. For the complete exception index, this query emits all
188 unresolved pattern cells, their exact original cell keys, diagnostic
sub-date-set IDs, representative source trip and conflicting occurrences:

```sh
jq '[.patterns[] | {
  providerId, dateSetId, sourceRecordSha256, routeId, calendarId, tripCount,
  representativeTripId: .tripIds[0], stopIds, unmatchedDependencies,
  dateScopes: [.dateScopes[] | {
    dateSetId, codes, temporalStatus, candidates,
    dateCount: (.serviceDates | length),
    firstDate: .serviceDates[0], lastDate: .serviceDates[-1]
  }],
  candidateEvidence: [.candidateEvidence[] |
    (.platformConflicts + .boardingConflicts | unique) as $indices |
    {target, revisionPeriod, conflicts:
      [.occurrences[] | select(.index as $i | $indices | index($i))]}]
}]' /tmp/mrtdown-investigation-latest-review/blockers.json \
  > /tmp/gtfs-cross-line-exception-cells.json
```

Filter that result by `routeId | startswith("CCL_")` for all 119 CCL cells;
by `unmatchedDependencies` containing provider ID `NS16_A` or `NS16_B` for all
46 AMK-dependent cells; or by a full pattern ID in the table. Original
`blockers.json.patterns[].tripIds` supplies every trip, and its `dateScopes` and
`full-draft.json.dateSets` supply every exact date. Join those trip IDs to the
pinned ZIP's `trips.txt` / `stop_times.txt`, sorted numerically by `stop_sequence`,
to inspect source headsigns, labels and literal occurrence times.

## Next prerequisite and validation

With H1 settled as a discussion assumption, the next concrete review work is
dated platform/service and source-path evidence for the grouped exceptions.
Start with Ang Mo Kio's missing C/D members, which affect 46 NSL pattern cells,
then review the Expo, Choa Chu Kang and Sengkang East allocation conflicts as a
batch. Overlapping terminal/path blockers mean those counts are not a promise
of recovered assignments. CCL's dated service/revision conflicts and the source
omission/Marine Terrace Saturday discrepancies remain separate evidence work.
Evidence
may justify a focused canonical correction or a source-bound proposal change;
prepare that separately, with honest before/after coverage. This packet supplies
neither. Holiday override implementation is also a separate coding task.

Before and after this prose transfer, the draft has 965 matched proposals and
191 unresolved cells. Assignments remain **1,494,006 / 2,484,149** source trip/date
pairs, with **990,143 unassigned on all 365 dates in 2026**. Current data and site
selectors block any date containing an active unassigned source trip anywhere
in the feed. Fully matched NEL/DTL/PGLRT proposals do not clear that rule.
No ignored/excluded disposition, date truncation or relaxed eligibility is
proposed. Site [PR #289](https://github.com/foldaway/mrtdown-site/pull/289)
retired frequency estimates; absent timetable coverage stays unavailable.

Then obtain exact-draft mapping review, capture-specific condition review,
exact-manifest release approval and initial source admission under the
[publication policy](gtfs-schedule-publication.md). Pinned Pages wiring,
publication and producer-to-site verification require separate authorized work.
No machine approval, canonical/source change, calendar override, deployment,
publication, external message or paid eval is supplied by this document.

Validation: `npm run build:fs`, deterministic raw-table/pattern/occurrence and
literal-platform checks, unchanged-topology fingerprint verification, full draft
evaluation, byte-for-byte blocker/assignment-report reproduction,
`npm run lint`, `npm run check:docs`, and `git diff --check`. No new unit tests
are needed for this document-only change.
