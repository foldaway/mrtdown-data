# Sengkang LRT mapping pilot: West loops and unresolved East allocations

This packet reviews provider route `SK` against canonical line
`SKLRT` in the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [draft](gtfs-sklrt-pilot-draft.json),
[summary](gtfs-sklrt-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) preserve the full source manifest,
canonical commit `d034d6babef4ea5bcac256d26c47dcd802bb39ba` and topology
fingerprint. The current canonical data tree matches that pinned commit. The
schedule is supplied by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

The focused draft proposes 50 matches: one agency, one route, 14 station parents,
28 physical platform stops and six West-loop patterns. They contain 1,618 trip
records and 730 pattern-date pairs. The route also contains six East-loop patterns
with 1,491 trip records and 730 pattern-date pairs; all remain unresolved because
the source's explicit intermediate platform labels conflict with current canonical
service scopes. Matching those station and platform identities does not approve
these East-loop allocations. No approval, ignore, exclusion or inactive decision
is created.

## Agency, route and complete ordered paths

Provider `SBST` proposes operator `SBS`, whose SKLRT operator period starts
2003-01-18 with no end. The single route `SK` contains four ordered loop shapes;
it cannot select East, West or direction by itself. All 3,109 trips were checked
against their complete raw stop-time sequence, not only a representative trip.
The pattern IDs were independently recalculated from route, calendar, direction
and ordered provider stop IDs.

| Ordered-path candidate | Actual provider stop occurrences | Revision | Draft result |
| --- | --- | --- | --- |
| `SKLRT_W_CW` | `STC_A → SW8_A → SW7_A → SW6_A → SW5_A → SW4_A → SW3_A → SW2_A → SW1_A → STC_A` | `r_2015_kupang`, from 2015-06-27 | Matched |
| `SKLRT_W_CCW` | `STC_B → SW1_B → SW2_B → SW3_B → SW4_B → SW5_B → SW6_B → SW7_B → SW8_B → STC_B` | `r_2015_kupang`, from 2015-06-27 | Matched |
| `SKLRT_E_CW` | `STC_B → SE1_B → SE2_B → SE3_B → SE4_B → SE5_B → STC_B` | `r_initial`, from 2003-01-18 | Unresolved |
| `SKLRT_E_CCW` | `STC_A → SE5_A → SE4_A → SE3_A → SE2_A → SE1_A → STC_A` | `r_initial`, from 2003-01-18 | Unresolved |

Every path candidate is an exact revision match, including both town-centre
occurrences. The West paths have ten stop occurrences and nine distinct physical
stop IDs; East paths have seven occurrences and six distinct physical stop IDs.
No partial, rotated or multiple-circuit pattern is substituted. Preserve the
repeated town-centre stop and its separate sequence, arrival and departure values.
Source direction 0 selects the shown CW paths and 1 the CCW paths in this capture;
that observation is not a general numeric-direction or platform-label rule.

The active revisions have no end and cover all actual 2026 dates. Earlier West
revisions end before 2026; the current full paths include Cheng Lim and Kupang.
All selected station-code periods cover every active source date: West codes
start between 2005-01-29 and 2015-06-27, East codes on 2003-01-18. Both the
Sengkang parent `NE16` code (from 2003-06-20) and its SKLRT child `STC` code
(from 2003-01-18) are valid throughout 2026. Operator, revision and code dates
were checked against every actual calendar date, independently of the platform
allocation diagnostic.

## Station and explicit physical platform identities

All children have unique literal labels; their platform identities remain proposed
even where a particular service allocation is unresolved. The table is based on
source `platform_code` and canonical platform records, not suffix inference.

| Provider child code | Provider parent ID | Canonical station | `_A` source (literal label 1) | `_B` source (literal label 2) |
| --- | --- | --- | --- | --- |
| STC | NE16 | SKG | SKG_SKLRT_1 | SKG_SKLRT_2 |
| SE1 | SE1 | CPV | CPV_SKLRT_1 | CPV_SKLRT_2 |
| SE2 | SE2 | RMB | RMB_SKLRT_1 | RMB_SKLRT_2 |
| SE3 | SE3 | BAK | BAK_SKLRT_1 | BAK_SKLRT_2 |
| SE4 | SE4 | KGK | KGK_SKLRT_1 | KGK_SKLRT_2 |
| SE5 | SE5 | RNG | RNG_SKLRT_1 | RNG_SKLRT_2 |
| SW1 | SW1 | CGL | CGL_SKLRT_1 | CGL_SKLRT_2 |
| SW2 | SW2 | FMW | FMW_SKLRT_1 | FMW_SKLRT_2 |
| SW3 | SW3 | KPG | KPG_SKLRT_1 | KPG_SKLRT_2 |
| SW4 | SW4 | TNG | TNG_SKLRT_1 | TNG_SKLRT_2 |
| SW5 | SW5 | FNV | FNV_SKLRT_1 | FNV_SKLRT_2 |
| SW6 | SW6 | LYR | LYR_SKLRT_1 | LYR_SKLRT_2 |
| SW7 | SW7 | TKG | TKG_SKLRT_1 | TKG_SKLRT_2 |
| SW8 | SW8 | RNJ | RNJ_SKLRT_1 | RNJ_SKLRT_2 |

Town-centre parent `NE16` maps to SKG through its NEL identity; the child `STC`
code selects SKLRT physical platforms. A filter restricted to `STC`, `SE` or `SW`
would omit that required parent dependency. This parent match does not approve
NEL service patterns.

The six West patterns have no current service-scope or boarding-status conflict:
intermediate label 1 is listed for West CW and label 2 for West CCW. Both
Sengkang town-centre platforms list all four SKLRT services. In contrast, the
source East CW path uses label 2 at all five intermediate stations, while current
canonical records list label 2 for East CCW. The source East CCW path uses label 1
where current records list East CW. Thus each of the six East patterns conflicts
at zero-based occurrence indices 1–5; both town-centre occurrences agree.

This is a service-allocation disagreement between the explicit source and current
canonical records, not uncertain station identity, a missing path, grouped labels
or a calendar gap. No boarding-status conflict is reported. Current platform
scopes are undated: the disagreement neither proves historical source error nor
authorizes editing canonical labels, switching directions or waiving the check.

## All 12 observed source patterns

| Full provider pattern ID | Calendar | Direction | Path candidate | Trips | Draft result |
| --- | --- | ---: | --- | ---: | --- |
| `7f491d2843768b0add75fc0d67974c4863844ff4434e376ac35f38622c047d7e` | `SERVICE_PH` | 0 | `SKLRT_W_CW` | 248 | matched |
| `9f7879b17389a2c18a9968dcf69500c3b98081de24b727d3cc00eeed884eecba` | `SERVICE_PH` | 0 | `SKLRT_E_CW` | 248 | unresolved |
| `f5585af854ba8467c5b366ad89170876ed89b1d9baed87ae57b984efe3bb5c93` | `SERVICE_PH` | 1 | `SKLRT_E_CCW` | 248 | unresolved |
| `f900c26cd63ef8477a8cd8022062b11355fbb7e16db4559ba2941dc7a6c530f9` | `SERVICE_PH` | 1 | `SKLRT_W_CCW` | 248 | matched |
| `73ac31f3e3427448434b42bf9b2667185684777a2571a3622f52715b04222aeb` | `SERVICE_WD` | 0 | `SKLRT_W_CW` | 280 | matched |
| `94dc8a9b7b2e449458e57a8fd4544672b1cf71ddfffc4466ae64c780a640dca7` | `SERVICE_WD` | 0 | `SKLRT_E_CW` | 235 | unresolved |
| `e60f0652fc80284b32b8489e7ba4ca3838bc7fbcb50486e7590bae559bb9e447` | `SERVICE_WD` | 1 | `SKLRT_E_CCW` | 256 | unresolved |
| `7d310d46d4b5db95f23692f9252f4f767ad1cd486ca99d924ac106ab70eb0e0f` | `SERVICE_WD` | 1 | `SKLRT_W_CCW` | 336 | matched |
| `6a69f7d6acf7a245153746c4bee64f7be654f4e969efbddbf41c164c09165dec` | `SERVICE_WE` | 0 | `SKLRT_W_CW` | 253 | matched |
| `e5b2610c547b5872e4923dff0d690b34f2f56cedcb55be52d6b5eb50fe1dc3c3` | `SERVICE_WE` | 0 | `SKLRT_E_CW` | 252 | unresolved |
| `514e72d11a6f3cc2a32fb341a6de664a64f86ccb5d48847804aaea12ae253d54` | `SERVICE_WE` | 1 | `SKLRT_E_CCW` | 252 | unresolved |
| `6c231863c62caa84b6d08ae75a51fc15ef679d5fad980d8ea9c14cbbeb308bcb` | `SERVICE_WE` | 1 | `SKLRT_W_CCW` | 253 | matched |

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
26,617 raw stop-time rows. The source omits `pickup_type`, `drop_off_type`
and `timepoint`; retain their GTFS defaults rather than inventing terminal or
loop restrictions. Departures reach `24:49:40`, with
830 rows departing at or after `24:00:00`. Preserve the service-day
time and repeated occurrence identities; do not wrap after-midnight times into a
new calendar date.

Reproduce the packet in a fresh output directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json SKLRT \
  /tmp/new-sklrt-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the runner's corresponding files. All five
outputs reproduce byte-for-byte across two independent runs. The full draft and
large evaluation reports remain outside Git, with byte digests recorded in the
summary. Full standalone accounting is valid and complete, with
1,074 unresolved input records. The focused subset is valid but globally
incomplete: 1,074 input entries and 47,661 pattern-date pairs remain absent.
Those omissions include all six East patterns and their 730 pattern-date pairs,
as well as every out-of-pilot pattern. Supported West proposals do not approve
the entire route.

Normal mapping review, disputed allocation evidence, calendar correctness,
authoritative source lineage and rights/publication validation remain separate
gates. No approval metadata is supplied, mapping-review eligibility remains
false and generation remains false. The
[other mapping disagreements](gtfs-mapping-disagreements.md) remain open.
