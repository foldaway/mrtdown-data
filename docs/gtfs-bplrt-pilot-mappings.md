# Bukit Panjang LRT mapping pilot: identities with no accepted patterns

This packet reviews provider route `BP` against canonical line
`BPLRT` in the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [draft](gtfs-bplrt-pilot-draft.json),
[summary](gtfs-bplrt-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) preserve the full source manifest,
canonical commit `d034d6babef4ea5bcac256d26c47dcd802bb39ba` and topology
fingerprint. The current canonical data tree matches that pinned commit. The
schedule is supplied by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

The focused draft has 41 proposed entity matches: one agency, one route,
13 station parents and 26 physical platform stops. It has **zero matched patterns,
zero accepted trip records and zero matched pattern-date pairs**. All six observed
patterns, containing 1,248 trips and 730 pattern-date pairs, remain unresolved.
This identity packet provides no accepted departure coverage. No approval,
ignore, exclusion or inactive decision is created.

## Agency, route and complete ordered paths

Provider `SMRT` proposes operator `SMRT_TRAINS`, whose BPLRT operator period
starts 1999-11-06 with no end. Route `BP` contains both A and B path orders; its
single route ID does not choose either service. All 1,248 raw trips were checked
against their complete ordered stop-time paths. Pattern IDs were independently
recalculated from route, calendar, direction and ordered provider stop IDs.

| Ordered-path candidate | Actual provider stop occurrences | Revision | Draft result |
| --- | --- | --- | --- |
| `BPLRT_A` | `BP1_A → BP2_B → BP3_B → BP4_B → BP5_B → BP6_B → BP13_B → BP12_B → BP11_B → BP10_B → BP9_B → BP8_B → BP7_B → BP6_A → BP5_A → BP4_A → BP3_A → BP2_A → BP1_A` | `r_initial`, from 1999-11-06 | Unresolved |
| `BPLRT_B` | `BP1_B → BP2_B → BP3_B → BP4_B → BP5_B → BP6_B → BP7_A → BP8_A → BP9_A → BP10_A → BP11_A → BP12_A → BP13_A → BP6_A → BP5_A → BP4_A → BP3_A → BP2_A → BP1_B` | `r_initial`, from 1999-11-06 | Unresolved |

Both ordered station paths match their canonical revisions exactly and cover all
2026 dates by revision, station code and operator. Each path has 19 stop
occurrences, 13 distinct stations and 18 distinct physical stop IDs. Choa Chu
Kang repeats at the same physical stop; Bukit Panjang and the shared approach
stations appear in both travel directions at different physical stops. Keep every
occurrence and its sequence/time value. No deduplication, reversal, partial path
or platform substitution resolves the conflict.

Source direction 0 accompanies the shown A order and 1 the B order in this
capture. Neither value establishes physical platform labels. Canonical Service C
and Ten Mile Junction remain present as historical entities, but Service C ended
2019-01-13 and no observed path visits Ten Mile Junction. Their absence from
these paths does not mean the canonical entities are missing or should be removed.
The future JRL code `JS1` at Choa Chu Kang starts 2028-06-30; it is unrelated to
this 2026 BP1 identity and is not used as support for it.

## Station and explicit physical platform identities

Every source child has one literal numeric label and a consistent parent. All
13 used BPLRT station codes start 1999-11-06 with no end. Choa Chu Kang uses
provider parent `BP1`, and Bukit Panjang uses `BP6` despite interchange codes in
canonical data. The source and canonical records independently support these
identities; their matches do not authorize every service to use those platforms.

| Provider child code | Provider parent ID | Canonical station | `_A` source (literal label 1) | `_B` source (literal label 2) |
| --- | --- | --- | --- | --- |
| BP1 | BP1 | CCK | CCK_BPLRT_1 | CCK_BPLRT_2 |
| BP2 | BP2 | SHV | SHV_BPLRT_1 | SHV_BPLRT_2 |
| BP3 | BP3 | KTH | KTH_BPLRT_1 | KTH_BPLRT_2 |
| BP4 | BP4 | TKW | TKW_BPLRT_1 | TKW_BPLRT_2 |
| BP5 | BP5 | PNX | PNX_BPLRT_1 | PNX_BPLRT_2 |
| BP6 | BP6 | BKP | BKP_BPLRT_1 | BKP_BPLRT_2 |
| BP7 | BP7 | PTR | PTR_BPLRT_1 | PTR_BPLRT_2 |
| BP8 | BP8 | PND | PND_BPLRT_1 | PND_BPLRT_2 |
| BP9 | BP9 | BKT | BKT_BPLRT_1 | BKT_BPLRT_2 |
| BP10 | BP10 | FJR | FJR_BPLRT_1 | FJR_BPLRT_2 |
| BP11 | BP11 | SGR | SGR_BPLRT_1 | SGR_BPLRT_2 |
| BP12 | BP12 | JLP | JLP_BPLRT_1 | JLP_BPLRT_2 |
| BP13 | BP13 | SNJ | SNJ_BPLRT_1 | SNJ_BPLRT_2 |

At Choa Chu Kang, source `BP1_A` literally means platform 1 and maps uniquely to
`CCK_BPLRT_1`, whose current scope lists only `BPLRT_B`. The source A-order path
uses this stop both first and last. Source `BP1_B` literally means platform 2 and
maps to `CCK_BPLRT_2`, whose scope lists only `BPLRT_A`; the B-order path uses
it first and last. Consequently **every pattern conflicts at both zero-based
indices 0 and 18**, despite complete station-path and temporal coverage. The
intermediate loop labels agree with the A/B path candidates; the shared approach
platforms list both services. No boarding-status conflict is reported.

The current undated platform restrictions cannot prove that the provider's 2026
allocation is wrong, nor do they permit swapping explicit platform identities or
approving trips through a conflict. Both source and canonical records must remain
intact pending allocation review. Relabelling `_A` or `_B`, inferring labels from
`direction_id`, or mapping the A path to B would lose independently verified
physical identity or ordered path.

## All six unresolved source patterns

The focused JSON intentionally contains entity proposals only. Every pattern
below remains explicit in the full standalone draft and its unresolved inventory;
none is silently excluded or treated as inactive.

| Full provider pattern ID | Calendar | Direction | Path candidate | Trips | Draft result |
| --- | --- | ---: | --- | ---: | --- |
| `0d68d8b458a63eba80c0fa49d7ae54014e96d3d1dfd3246329150942fd444311` | `SERVICE_PH` | 0 | `BPLRT_A` | 197 | unresolved |
| `41cc4832a457d664ce946ef632ff5d5f45bff72b0c47bc6eac8bcd8f88f8e9e5` | `SERVICE_PH` | 1 | `BPLRT_B` | 197 | unresolved |
| `5d72377c77349c7dfe10b564956eba0f306156e65a0a27f94ffaa2f897f07d74` | `SERVICE_WD` | 0 | `BPLRT_A` | 226 | unresolved |
| `c8a157915aa4b8e394842010023644f9b038a16f8249375238c53bbb2470685b` | `SERVICE_WD` | 1 | `BPLRT_B` | 226 | unresolved |
| `2631425097b532d1efa9adaddced66c55c9528cb1b067e123fff94ca4f7b4295` | `SERVICE_WE` | 0 | `BPLRT_A` | 201 | unresolved |
| `9f6db5a1f6f5b7fff94aa842caf9157b427dd7f0b5e361513391b07e92a4418b` | `SERVICE_WE` | 1 | `BPLRT_B` | 201 | unresolved |

The summary binds matched pattern IDs and source trip-set digests. For unresolved
patterns, the full draft digest binds their unresolved decisions and the exact
source manifest permits raw trip reconstruction. The table above records the
line's complete observed pattern inventory, including omitted focused patterns.

## Calendar, occurrence rules and review gates

The actual calendars span 2026-01-01 through 2026-12-31: `SERVICE_WD` enables
261 weekdays, `SERVICE_WE` 52 Saturdays and `SERVICE_PH` 52 Sundays. There are
no calendar exception rows. `SERVICE_PH` does not independently establish public
holiday service and must not be expanded into holiday exceptions.

Across all observed route patterns, including unresolved ones, there are
23,712 raw stop-time rows. The source omits `pickup_type`, `drop_off_type`
and `timepoint`; retain their GTFS defaults rather than inventing terminal or
loop restrictions. Departures reach `24:05:10`, with
14 rows departing at or after `24:00:00`. Preserve the service-day
time and repeated occurrence identities; do not wrap after-midnight times into a
new calendar date.

Reproduce the packet in a fresh output directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json BPLRT \
  /tmp/new-bplrt-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the runner's corresponding files. All five
outputs reproduce byte-for-byte across two independent runs. The full draft and
large evaluation reports remain outside Git, with byte digests recorded in the
summary. Full standalone accounting is valid and complete, with
1,083 unresolved input records. The focused subset is valid but globally
incomplete: 1,083 input entries and 48,391 pattern-date pairs remain absent.
Those omissions include all six BPLRT patterns and their 730 pattern-date pairs,
as well as every out-of-pilot pattern. A valid entity-only subset has no accepted
departure coverage.

Normal mapping review, disputed allocation evidence, calendar correctness,
authoritative source lineage and rights/publication validation remain separate
gates. No approval metadata is supplied, mapping-review eligibility remains
false and generation remains false. The
[other mapping disagreements](gtfs-mapping-disagreements.md) remain open.
