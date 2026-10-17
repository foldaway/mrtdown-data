# TEL mapping pilot: supported proposals and unresolved source paths

This pilot uses the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [matched-only draft](gtfs-tel-pilot-draft.json),
[summary](gtfs-tel-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) retain the exact source manifest,
canonical commit and topology fingerprint. Canonical `data` matches pinned commit
`d034d6babef4ea5bcac256d26c47dcd802bb39ba`. The underlying timetable is supplied
by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

There are **77 observed TEL patterns, of which 75 have matched proposals and two
remain unresolved within TEL**. The checked-in focused draft contains only the
172 proposed matches: one agency, 15 routes, 27 station parents, 54 platform stops
and 75 patterns. It is not a whole-line acceptance. The full standalone draft
explicitly retains both unresolved TEL patterns and all other pending inputs;
they are neither excluded nor repaired by the matched-only projection.

Supported patterns account for 1,619 source trip records and 9,125 pattern-date
pairs. The two unresolved patterns add 14 source trip records and 104 pattern-date
pairs, making the complete TEL input 1,633 trips and 9,229 pattern-date pairs.
None of these proposals is approved or eligible for generation.

## Agency, route and ordered-path review

All 15 TEL route records reference `SMRT`, proposed as canonical operator
`SMRT_TRAINS` on line `TEL`. The canonical operator period covers every supplied
2026 active date. All route records have observed source trips.

Every raw TEL trip was independently sorted by `stop_sequence`. The 1,619
supported paths match current revision `r_2024_stage_4` of `TEL_MAIN_N` or
`TEL_MAIN_S`, effective from 2024-06-23 with no end. Their explicit TEL station
codes are valid on the matched dates. Six full Woodlands North–Bayshore patterns
are `exact` matches, and 69 short-working patterns are `contiguousSegment`
matches. There are no cyclic matches or invented stop occurrences.

| Provider route | Actual source endpoints | Supported / observed patterns | Supported / observed trip records | Source stop occurrences |
| --- | --- | ---: | ---: | ---: |
| `TEL_TE1_TE3` | TE3 → TE1 | 3 / 3 | 69 / 69 | 3 |
| `TEL_TE1_TE9` | TE1 ↔ TE9 | 6 / 6 | 6 / 6 | 9 |
| `TEL_TE1_TE14` | TE1 ↔ TE14 | 6 / 6 | 12 / 12 | 13 |
| `TEL_TE1_TE17` | TE1 → TE17 | 3 / 3 | 3 / 3 | 16 |
| `TEL_TE1_TE22` | TE1 ↔ TE22 | 6 / 6 | 6 / 6 | 20 |
| `TEL_TE1_TE26` | TE1 ↔ TE26 | 5 / 5 | 17 / 17 | 24 |
| `TEL_TE1_TE27` | TE1 ↔ TE27 | 6 / 6 | 6 / 6 | 25 |
| `TEL_TE1_TE29` | TE1 ↔ TE29 | **6 / 8** | **1,379 / 1,393** | 27 supported; 26 unresolved |
| `TEL_TE3_TE26` | TE3 → TE26 | 1 / 1 | 6 / 6 | 22 |
| `TEL_TE3_TE29` | TE3 ↔ TE29 | 6 / 6 | 85 / 85 | 25 |
| `TEL_TE9_TE29` | TE9 ↔ TE29 | 6 / 6 | 6 / 6 | 19 |
| `TEL_TE14_TE29` | TE14 ↔ TE29 | 6 / 6 | 6 / 6 | 15 |
| `TEL_TE17_TE29` | TE17 → TE29 | 3 / 3 | 3 / 3 | 12 |
| `TEL_TE22_TE29` | TE22 ↔ TE29 | 6 / 6 | 6 / 6 | 8 |
| `TEL_TE27_TE29` | TE27 ↔ TE29 | 6 / 6 | 9 / 9 | 3 |

The TE1–TE29 route includes six supported full-length patterns across both
directions and all three calendars, plus the two unresolved southbound patterns.
The current canonical path omits TE10 and TE21; their absent numeric indices do
not call for inserting stations. TE22 is different: it is present in the current
revision and is missing from the two unresolved source paths.

Source direction `0` accompanies the observed southbound patterns and `1` the
northbound patterns in this capture. Canonical service assignment follows the
ordered stops, not a general direction-number or route-name rule. For example,
`TEL_TE1_TE3` actually travels Woodlands South → Woodlands North. Assigning it
`TEL_MAIN_N` must not prepend Bayshore or insert the rest of the canonical path.

Calendar asymmetries also remain as supplied: `TEL_TE1_TE26` has no weekday
southbound pattern, while `TEL_TE3_TE26` occurs only on `SERVICE_WD`, with six
source trip records. `TEL_TE1_TE3` is northbound only, and the TE1→TE17 and
TE17→TE29 starts are southbound only. No reverse working or missing calendar
variant is manufactured from a route ID.

## Unresolved inside TEL: TE22 omitted

Both unresolved patterns belong to `TEL_TE1_TE29`, direction `0`, travelling
`TE1_A` → `TE29_A`. Each has 26 source occurrences and jumps directly from
`TE20_A` to `TE23_A`, omitting `TE22_A` (Gardens by the Bay). The canonical
southbound path requires `TE20 → TE22 → TE23` and has 27 occurrences overall.
Neither path is an exact or contiguous match of any reported canonical revision.

| Exact provider pattern ID | Calendar | Source trip records | Active source dates |
| --- | --- | ---: | ---: |
| `07c0933b39e35a27d221c62f785c2dbe3764559d995155b92eb166cfddfd2740` | `SERVICE_WE` | 7 | 52 Saturdays |
| `6e84f2113f0968bd922fbe5f70f3fd7236feee54f421dc20e4116e3d46c90410` | `SERVICE_PH` | 7 | 52 Sundays |

Their source-record SHA-256 values are respectively
`9f8d1c8884b3ea17e29fbaf190f9995161489205496eff0c94d1d1307e6d2cb7`
and `37cd3fd06f45e502db9dfc874a94fe02d87d8da037eaa9961da0da160f4013c3`.
The full draft and compact global unresolved inventory preserve both IDs and
their exact date-set references. The [disagreement queue](gtfs-mapping-disagreements.md)
retains the source trip-level traces.

These 14 trip records are not 14 isolated calendar departures: each belongs to
its source recurring calendar. Mapping TE22's station/platform identity through
other supported trips does not authorize inserting it into these paths. No
stop interpolation, time repair, implicit exclusion, express-service assumption
or canonical data correction is made. The source-versus-canonical disagreement
requires separate evidence and review before those cells can be matched.

## Station and physical platform identities

All 54 referenced TEL platform stops have one literal label and a unique canonical
identity. The table uses explicit labels, code/parent consistency and TEL line
membership, rather than provider `_A`/`_B` suffixes:

| Provider code | Provider parent ID | Canonical station | `_A` stop target | `_B` stop target |
| --- | --- | --- | --- | --- |
| TE1 | TE1 | WDN | WDN_TEL_A | WDN_TEL_B |
| TE2 | NS9 | WDL | WDL_TEL_C | WDL_TEL_D |
| TE3 | TE3 | WDS | WDS_TEL_A | WDS_TEL_B |
| TE4 | TE4 | SPL | SPL_TEL_A | SPL_TEL_B |
| TE5 | TE5 | LTR | LTR_TEL_A | LTR_TEL_B |
| TE6 | TE6 | MFL | MFL_TEL_A | MFL_TEL_B |
| TE7 | TE7 | BRH | BRH_TEL_A | BRH_TEL_B |
| TE8 | TE8 | UTS | UTS_TEL_A | UTS_TEL_B |
| TE9 | CC17 | CDT | CDT_TEL_C | CDT_TEL_D |
| TE11 | DT10 | STV | STV_TEL_C | STV_TEL_D |
| TE12 | TE12 | NPR | NPR_TEL_A | NPR_TEL_B |
| TE13 | TE13 | OBV | OBV_TEL_A | OBV_TEL_B |
| TE14 | NS22 | ORC | ORC_TEL_C | ORC_TEL_D |
| TE15 | TE15 | GRW | GRW_TEL_A | GRW_TEL_B |
| TE16 | TE16 | HVL | HVL_TEL_A | HVL_TEL_B |
| TE17 | EW16 | OTP | OTP_TEL_E | OTP_TEL_F |
| TE18 | TE18 | MAX | MAX_TEL_A | MAX_TEL_B |
| TE19 | TE19 | SHW | SHW_TEL_A | SHW_TEL_B |
| TE20 | CC33 | MRB | MRB_TEL_E | MRB_TEL_F |
| TE22 | TE22 | GRB | GRB_TEL_A | GRB_TEL_B |
| TE23 | TE23 | TRH | TRH_TEL_A | TRH_TEL_B |
| TE24 | TE24 | KTP | KTP_TEL_A | KTP_TEL_B |
| TE25 | TE25 | TKT | TKT_TEL_A | TKT_TEL_B |
| TE26 | TE26 | MPR | MPR_TEL_A | MPR_TEL_B |
| TE27 | TE27 | MTC | MTC_TEL_A | MTC_TEL_B |
| TE28 | TE28 | SGL | SGL_TEL_A | SGL_TEL_B |
| TE29 | TE29 | BSR | BSR_TEL_A | BSR_TEL_B |

Six parents deliberately use other-line provider IDs: `NS9`, `CC17`, `DT10`,
`NS22`, `EW16` and `CC33`. A TEL-prefix-only dependency selection would miss
those parents. At Marina Bay, `CC33` is the snapshot parent identity, but the
canonical CCL code begins on 2026-07-12, replacing `CE2`. The supplied TEL child
code `TE20` is valid throughout the source's 2026 dates; mapping the shared MRB
station does not assert pre-July CCL code validity or CCL service.

Current canonical platform/service restrictions agree with the selected supported
occurrences, and there are no grouped-label or boarding-status conflicts in this
pilot. This is a comparison with current, undated records, not independent proof
of historical platform allocation or timetable correctness. Literal C/D and E/F
labels at interchanges must remain distinct from provider suffixes.

## Calendar, occurrence semantics and incomplete coverage

The source calendars cover 2026-01-01 through 2026-12-31: `SERVICE_WD` enables
261 weekdays, `SERVICE_WE` 52 Saturdays and `SERVICE_PH` 52 Sundays, with no
exception rows. Calendar names do not establish public-holiday behavior and
must not be expanded or repaired during mapping.

TEL contains 41,312 raw stop-time rows: 40,948 in supported trips and 364 in the
14 unresolved trips. The source table omits `pickup_type`, `drop_off_type` and
`timepoint`; preserve their GTFS defaults without inventing occurrence rules
from platform scope or short-working endpoints. Across all TEL source rows,
879 departures are at or after `24:00:00`, and the latest is `24:46:13`. Preserve
those service-day times and each source stop occurrence; those observations do
not grant acceptance to an unresolved path.

Reproduce the standalone outputs in a fresh directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json TEL \
  /tmp/new-tel-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the corresponding generated files. All
five runner outputs reproduce byte-for-byte across independent runs. Full drafts
and large evaluation reports stay outside Git, with their hashes in the summary.

The full standalone TEL draft has complete accounting with 952 unresolved entries:
**two TEL patterns plus 950 other inputs**. The focused matched-only artifact is
globally incomplete and omits those same 952 entries. Its 39,266 missing
pattern-date pairs include **104 within TEL** and 39,162 outside TEL. Neither
projection means that whole-line coverage has been accepted or that missing
cells were intentionally excluded.

Normal repository review, source-semantic/calendar correctness, authoritative
lineage, historical platform evidence and rights/publication checks remain
separate gates. No approval is created, mapping-review eligibility remains false
and generation remains false. The two internal TEL disagreements and all other
unresolved scopes retain their existing gates.
