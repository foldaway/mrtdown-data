# DTL mapping pilot: proposed identities

These are concrete mapping proposals for the verified October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
(2,991,884 bytes). The [machine-readable draft](gtfs-dtl-pilot-draft.json),
[summary](gtfs-dtl-pilot-review-summary.json) and
[scoped review contract](gtfs-scoped-review.md) retain the full source manifest,
canonical commit and topology fingerprint. Canonical `data` matches the pinned
commit `d034d6babef4ea5bcac256d26c47dcd802bb39ba`. The underlying schedule is
supplied by the Land Transport Authority through DataMall; see
[attribution and licence](gtfs-public-handoff.md).

The pilot has 129 decisions: one agency, seven routes, 35 station parents,
70 platform stops and 16 patterns containing 1,511 distinct source trip records.
Its matched proposal cells cover 1,877 pattern-date pairs. These are unapproved
proposals, not a claim of source-timetable correctness, historical platform
permission or eligibility to generate arrivals. The standalone full DTL draft
keeps the other 995 input records explicitly unresolved. Shared parents and the
SBST agency do not implicitly approve other lines' routes or patterns.

## Agency, routes and actual source paths

All seven declared routes reference provider `SBST`, proposed as canonical
operator `SBS`. Canonical DTL's SBS assignment covers every supplied 2026 active
date. All 16 observed patterns propose `DTL_MAIN_W` or `DTL_MAIN_E` revision
`r_2025_hume`, starting 2025-02-28 with no end. Their DTL station-code periods also
cover each matched date, including Hume `DT4`.

Every source trip's occurrences were independently sorted by `stop_sequence`
and checked against the target's ordered canonical station path. The full
Bukit Panjang–Expo paths have 35 occurrences and are `exact` matches. Short
workings are `contiguousSegment` matches and retain their real endpoints:

| Provider route | Observed source endpoints | Pattern count | Trip records | Match |
| --- | --- | ---: | ---: | --- |
| `DTL_DT1_DT11` | Newton → Bukit Panjang | 3 | 6 | Contiguous segment, 11 stops |
| `DTL_DT1_DT12` | Little India → Bukit Panjang | 1 | 1 | Contiguous segment, 12 stops |
| `DTL_DT1_DT14` | Bugis → Bukit Panjang | 3 | 5 | Contiguous segment, 14 stops |
| `DTL_DT1_DT19` | No trips in this capture | 0 | 0 | Route identity only |
| `DTL_DT1_DT35` | Bukit Panjang ↔ Expo | 6 | 1,485 | Exact, 35 stops |
| `DTL_DT19_DT35` | No trips in this capture | 0 | 0 | Route identity only |
| `DTL_DT24_DT35` | Geylang Bahru → Expo | 3 | 14 | Contiguous segment, 12 stops |

The two zero-trip routes are real declared route records requiring explicit
identity dispositions; their names do not establish that trains operated on
those paths. The draft does not invent patterns or departures for them.

In this capture, source direction `0` accompanies the westbound paths to Bukit
Panjang and `1` the eastbound paths to Expo. The mapping follows station order,
not a general interpretation of these numbers or the ascending route-ID tokens.
For example, `DTL_DT1_DT11` actually starts at Newton. Matching it to
`DTL_MAIN_W` must not prepend Expo or add the rest of the canonical path.

The six full-length patterns include each direction on weekday, Saturday and
Sunday calendars. The Newton, Bugis and Geylang Bahru starts also occur on all
three calendar types. The Little India start occurs only on `SERVICE_PH`, with
one source trip record. That record recurs on its actual enabled dates; it is
not evidence of one isolated departure or an independent holiday calendar.

## Station and physical platform identities

The table uses explicit source platform labels, station-code/parent consistency
and canonical DTL membership. Provider `_A`/`_B` suffixes are identifiers, not
physical platform labels. All 70 platform stops have a unique literal match;
none has a grouped label or requires choosing among alternative platforms.

| Provider code | Provider parent ID | Canonical station | `_A` stop target | `_B` stop target |
| --- | --- | --- | --- | --- |
| DT1 | DT1 | BKP | BKP_DTL_A | BKP_DTL_B |
| DT2 | DT2 | CSW | CSW_DTL_A | CSW_DTL_B |
| DT3 | DT3 | HVW | HVW_DTL_A | HVW_DTL_B |
| DT4 | DT4 | HME | HME_DTL_A | HME_DTL_B |
| DT5 | DT5 | BTW | BTW_DTL_A | BTW_DTL_B |
| DT6 | DT6 | KAP | KAP_DTL_A | KAP_DTL_B |
| DT7 | DT7 | SAV | SAV_DTL_A | SAV_DTL_B |
| DT8 | DT8 | TKK | TKK_DTL_A | TKK_DTL_B |
| DT9 | CC19 | BTN | BTN_DTL_A | BTN_DTL_B |
| DT10 | DT10 | STV | STV_DTL_A | STV_DTL_B |
| DT11 | DT11 | NEW | NEW_DTL_A | NEW_DTL_B |
| DT12 | DT12 | LTI | LTI_DTL_A | LTI_DTL_B |
| DT13 | DT13 | RCR | RCR_DTL_A | RCR_DTL_B |
| DT14 | DT14 | BGS | BGS_DTL_A | BGS_DTL_B |
| DT15 | CC4 | PMN | PMN_DTL_C | PMN_DTL_D |
| DT16 | CC34 | BFT | BFT_DTL_C | BFT_DTL_A |
| DT17 | DT17 | DTN | DTN_DTL_A | DTN_DTL_B |
| DT18 | DT18 | TLA | TLA_DTL_A | TLA_DTL_B |
| DT19 | DT19 | CTN | CTN_DTL_C | CTN_DTL_D |
| DT20 | DT20 | FCN | FCN_DTL_A | FCN_DTL_B |
| DT21 | DT21 | BCL | BCL_DTL_A | BCL_DTL_B |
| DT22 | DT22 | JLB | JLB_DTL_A | JLB_DTL_B |
| DT23 | DT23 | BDM | BDM_DTL_A | BDM_DTL_B |
| DT24 | DT24 | GLB | GLB_DTL_A | GLB_DTL_B |
| DT25 | DT25 | MTR | MTR_DTL_A | MTR_DTL_B |
| DT26 | CC10 | MPS | MPS_DTL_C | MPS_DTL_D |
| DT27 | DT27 | UBI | UBI_DTL_A | UBI_DTL_B |
| DT28 | DT28 | KKB | KKB_DTL_A | KKB_DTL_B |
| DT29 | DT29 | BDN | BDN_DTL_A | BDN_DTL_B |
| DT30 | DT30 | BDR | BDR_DTL_A | BDR_DTL_B |
| DT31 | DT31 | TPW | TPW_DTL_A | TPW_DTL_B |
| DT32 | DT32 | TAM | TAM_DTL_A | TAM_DTL_B |
| DT33 | DT33 | TPE | TPE_DTL_A | TPE_DTL_B |
| DT34 | DT34 | UPC | UPC_DTL_A | UPC_DTL_B |
| DT35 | CG1 | XPO | XPO_DTL_C | XPO_DTL_D |

Five parents deliberately use other-line provider IDs: Botanic Gardens `CC19`,
Promenade `CC4`, Bayfront `CC34`, MacPherson `CC10` and Expo `CG1`. Selecting only
IDs beginning `DT` would miss those dependencies. Bayfront is especially easy
to misread: `DT16_A` explicitly labels platform C, while `DT16_B` labels A.
Promenade, Chinatown, MacPherson and Expo use C/D labels despite A/B suffixes.

Bayfront's snapshot parent ID `CC34` identifies the same station as `DT16`, but
canonical CCL code `CC34` begins on 2026-07-12 (replacing `CE1`). The DTL patterns
use the explicitly supplied DTL code `DT16`, valid throughout their 2026 dates.
Mapping this parent record to BFT does not assert pre-July CCL code validity or
CCL service, and its prefix must not replace the DTL code's temporal check.

Each selected platform's current canonical service scope agrees with the
corresponding pattern. There are no current boarding-status conflicts. This
comparison uses current, undated platform records; it does not independently
establish historical platform assignments or source-timetable correctness.
At Bukit Panjang, both canonical platforms list both DTL directions; the source
still supplies a specific literal platform for each occurrence, not a group.

## Calendars, reproduction and remaining gates

The source calendars span 2026-01-01 through 2026-12-31. `SERVICE_WD` enables
261 weekdays, `SERVICE_WE` 52 Saturdays and `SERVICE_PH` 52 Sundays. There are
no exception rows. Calendar names must not be converted into holiday rules or
used to repair the source. All 52,291 DTL stop-time records omit `pickup_type`,
`drop_off_type` and `timepoint`; retain their GTFS defaults without inferring
extra occurrence restrictions from platform scope.

Reproduce the standalone DTL outputs in a fresh directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json DTL \
  /tmp/new-dtl-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The checked-in draft and summary match the runner's corresponding files.
Independent runs reproduce all five outputs byte-for-byte. The full draft and
large evaluation reports remain outside Git; their hashes are in the summary.
The full standalone DTL draft has complete accounting with 995 unresolved
entries. The pilot subset remains globally incomplete: 995 other entries and
46,514 outside-pilot pattern dates are absent. Neither state grants an approval.

No DTL identity, sequence, calendar/revision-validity or current-platform
contradiction was found within this pilot's checks. This does not settle source
calendar correctness, authoritative snapshot lineage, historical platform
permission, rights/publication validation or normal repository review. The
[mapping disagreement queue](gtfs-mapping-disagreements.md) remains open for other
scopes. Both mapping-review eligibility and generation remain false.
