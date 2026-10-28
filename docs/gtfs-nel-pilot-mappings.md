# NEL mapping pilot: proposed identities

For the newer source capture, use the
[28 October candidate review packet](gtfs-nel-mapping-review-2026-10-28.md).
The input-bound proposals below remain the 14 October baseline.

These are concrete mapping proposals for the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`.
The [machine-readable draft](gtfs-nel-pilot-draft.json) and
[scoped review contract](gtfs-scoped-review.md) record the exact decisions and dates.
These are not approvals, a claim of source-timetable correctness, or permission
to generate arrivals. The full source manifest, canonical commit and topology
fingerprint must accompany every draft using these decisions. The underlying train
schedule is supplied by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md) for the source terms.

The pilot contains 69 decisions: one agency, three routes, 17 station parents,
34 platform stops and 14 trip patterns. The patterns contain 1,683 distinct
provider trip records. The other 1,055 input records remain explicitly
unresolved in the full draft; shared station parents do not implicitly approve
other lines' routes or patterns.

## Agency and routes

All three routes reference provider agency `SBST`, proposed as operator `SBS`.
Canonical NEL operator assignment covers their 2026 calendar dates. Route names
identify the line, not the train's direction or actual destination:

| Provider route | Proposed line | Actual pattern endpoints | Pattern count |
| --- | --- | --- | ---: |
| `NEL_NE1_NE18` | `NEL` | HarbourFront ↔ Punggol Coast | 6 |
| `NEL_NE16_NE18` | `NEL` | Sengkang ↔ Punggol Coast | 5 |
| `NEL_NE3_NE18` | `NEL` | Outram Park → Punggol Coast | 3 |

Every pattern proposes revision `r_2024_punggol_coast` of `NEL_MAIN_N` or
`NEL_MAIN_S`, selected by its ordered station occurrences. The revision starts
on 2024-12-10 and has no end, covering all supplied 2026 active dates.
Provider direction `1` occurs on the northbound patterns and `0` on southbound
patterns in this capture; this observed association is not a general GTFS
number-to-direction rule.

Full HarbourFront–Punggol Coast paths are `exact` matches. Sengkang shuttles and
Outram Park starts are `contiguousSegment` matches. In particular, a southbound
shuttle matched to `NEL_MAIN_S` still ends at Sengkang. A consumer must retain the
provider pattern's endpoint and stop sequence, not substitute HarbourFront as
the destination or append the rest of the canonical path.

## Station and platform identities

Each provider code has `_A` and `_B` stop IDs. Those suffixes are provider
identifiers, not a rule for physical platform letters. The mappings below use
explicit platform labels, canonical line membership and station/parent
consistency. For example, `NE3_A` maps to Outram Park platform C.

| Provider code | Provider parent ID | Canonical station | `_A` stop target | `_B` stop target |
| --- | --- | --- | --- | --- |
| NE1 | CC29 | HBF | HBF_NEL_A | HBF_NEL_B |
| NE3 | EW16 | OTP | OTP_NEL_C | OTP_NEL_D |
| NE4 | DT19 | CTN | CTN_NEL_A | CTN_NEL_B |
| NE5 | NE5 | CRQ | CRQ_NEL_A | CRQ_NEL_B |
| NE6 | NS24 | DBG | DBG_NEL_A | DBG_NEL_B |
| NE7 | DT12 | LTI | LTI_NEL_A | LTI_NEL_B |
| NE8 | NE8 | FRP | FRP_NEL_A | FRP_NEL_B |
| NE9 | NE9 | BNK | BNK_NEL_A | BNK_NEL_B |
| NE10 | NE10 | PTP | PTP_NEL_A | PTP_NEL_B |
| NE11 | NE11 | WLH | WLH_NEL_A | WLH_NEL_B |
| NE12 | CC13 | SER | SER_NEL_A | SER_NEL_B |
| NE13 | NE13 | KVN | KVN_NEL_A | KVN_NEL_B |
| NE14 | NE14 | HGN | HGN_NEL_A | HGN_NEL_B |
| NE15 | NE15 | BGK | BGK_NEL_A | BGK_NEL_B |
| NE16 | NE16 | SKG | SKG_NEL_A | SKG_NEL_B |
| NE17 | NE17 | PGL | PGL_NEL_A | PGL_NEL_B |
| NE18 | NE18 | PGC | PGC_NEL_A | PGC_NEL_B |

The six other-line parent IDs are intentional source identities. Restricting
parent review to IDs beginning `NE` would leave interchange dependencies
unreviewed. All 34 platform stops have a unique explicit target in this pilot;
none requires choosing from a grouped platform label. Current platform service
restrictions agree with the candidate services. That does not establish dated
historical platform assignments independently of the source.

## Calendar and remaining gates

The draft preserves the source calendars exactly: `SERVICE_WD` enables 261
weekdays, `SERVICE_WE` 52 Saturdays, and `SERVICE_PH` 52 Sundays in 2026. There
are no exception rows. `SERVICE_PH` must not be silently expanded to public
holidays, and a successful mapping review does not confirm holiday service or
repair a deficient provider calendar.

Draft integrity, complete mapping review, source correctness, source lineage,
rights and publication validation are separate conditions. No approval is
created by generating the draft or by the evidence having one candidate. The
pilot does not resolve grouped platforms, skipped stops or date conflicts on
other lines, and it does not complete Phase 2.
