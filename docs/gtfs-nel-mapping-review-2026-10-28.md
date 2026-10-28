# NEL candidate mapping review — 28 October 2026

## Decision requested

Review the 69 proposed NEL dispositions below against this exact capture and
canonical tree: one agency, three routes, 17 recursive station parents,
34 physical stops and 14 pattern/date cells. All 14 cells pass compatibility
checks on every source-active date: **1,683 recurring trips, 1,564 pattern/date
pairs and 238,205 trip/date pairs**, with every NEL cell mechanically matched
and no missing NEL assignment. These are proposals, not approval or proof of actual operation.
Two mechanically matched southbound short-working cells need explicit semantic
review: their final listed stop is Sengkang but their source headsign is HarbourFront.

A reviewer should accept or correct the identity/platform table, the three route
families and their literal calendars. Record objections with the full pattern ID
and date-set ID from the detail queries below. There is no approval record in
this packet. NEL review alone cannot make any public service date eligible.

## Review discussion — 28 October

The user reviewed the packet step by step and selected these outcomes:

| Scope | Discussion outcome |
| --- | --- |
| Operator and line | Accept `SBST` → `SBS` and all three source route IDs → `NEL`. |
| Service paths | Accept both complete 17-station paths, the northbound Sengkang and Outram Park starts, and the southbound three-stop path correspondence. |
| Station identities | Accept the six interchange-parent correspondences. |
| Platforms | Accept same-label correspondences at the other 16 stations; assume Outram Park C/D mappings, with independent verification unconfirmed. |
| Holidays | Assume the Sunday timetable on public holidays, replacing the ordinary weekday/Saturday selection; implementation and validation remain pending. |
| After midnight | Preserve the recorded service date and times beyond 24:00. Apply the prospective holiday rule to that service date. |
| Short-working destinations | Keep the two southbound Sengkang endpoint / HarbourFront headsign disagreements pending. |

This is a prose recap of the discussion, not a digest-bound mapping approval.
The source calendar evidence and generated proposals below remain unchanged;
the selected assumptions do not establish operational correctness or publication eligibility.

## Pinned evidence

The source is LTA DataMall's `GTFSScheduleTrain`, supplied under the
[Singapore Open Data Licence v1.0](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html).
Contains information from LTA DataMall accessed on 2026-10-20; see the
[attributed source handoff](gtfs-public-handoff.md). MRTDown is independent of LTA.

- [Immutable receipt](https://sources.mrtdown.org/captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json)
  and [original ZIP](https://sources.mrtdown.org/blobs/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.zip):
  source SHA-256 `9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`,
  2,981,645 bytes, retrieved `2026-10-20T20:00:12.476Z` (21 October, 04:00 Singapore).
  Receipt re-fetched on 28 October matches the locally verified input.
- Canonical and tooling commit: `e66664deebfcc4fe22689c2ee35d9165790249c7`.
  Canonical `data/` matches that Git tree. Topology projection 1:
  `e376c280fbd6292ed6fe03e7fa81541ad0b0b8c76a09f916f1e3898aac240ec1`.
- All-line v3 `full-draft.json` normalized SHA-256:
  `19698e1f167c47d97e484a377eaa52b6ede2cb91f618ca4ca3b353cdbfabad30`.
  Its `identity.sourceManifest` contains every raw-table hash; `summary.json`
  additionally binds the exact bytes/lengths of all eight generated files.
- All-line normalized assignments SHA-256:
  `ad4756a9ba792ac3afeb0af55efaed2eff3387e7613413687db73d2989a351b9`.
  `assignment-validation.json` reproduced byte for byte. NEL is a subset of
  these files; neither digest denotes NEL-only approval.

This is the newest **discoverable distinct hash** in the dated investigation,
not proof of the latest successful poll or provider publication order.
`provider_timestamp` is null and `feed_version` remains opaque `0.1`.
The initial source is still a candidate requiring explicit source review.
The [receiver inspection and independent validator](https://github.com/foldaway/mrtdown-data/actions/runs/39488256960)
are supporting structural evidence; they do not establish timetable correctness.

## Three route families

All three source routes explicitly reference `SBST`, proposed as canonical `SBS`
on line `NEL`. The pinned [line](../data/line/NEL.json) assigns `SBS` from
2003-11-20 without an end. Ordered station/code paths select
[NEL_MAIN_N](../data/service/NEL_MAIN_N.json) or
[NEL_MAIN_S](../data/service/NEL_MAIN_S.json), revision
`r_2024_punggol_coast` (2024-12-10 onward). Dates, operator periods, station codes,
platform membership/service restrictions and boarding checks pass together.
No other candidate is substituted merely because it is current.

| Source route | Ordered family | Proposed service / destination | Match and evidence |
| --- | --- | --- | --- |
| `NEL_NE1_NE18` | HarbourFront → Punggol Coast, 17 stops | `NEL_MAIN_N` / `PGC` | Exact source path; WD/WE/PH |
| `NEL_NE1_NE18` | Punggol Coast → HarbourFront, 17 stops | `NEL_MAIN_S` / `HBF` | Exact reversed station path; WD/WE/PH |
| `NEL_NE16_NE18` | Sengkang → Punggol → Punggol Coast, 3 stops | `NEL_MAIN_N` / `PGC` | Contiguous segment; WD/WE/PH |
| `NEL_NE16_NE18` | Punggol Coast → Punggol → Sengkang, 3 stops | `NEL_MAIN_S` / `SKG` | Contiguous segment; WE/PH only, **no WD trip supplied** |
| `NEL_NE3_NE18` | Outram Park → Punggol Coast, 16 stops | `NEL_MAIN_N` / `PGC` | Contiguous segment; WD/WE/PH |

Southbound short-working stop lists end at **Sengkang**, despite matching `NEL_MAIN_S`.
Do not append the canonical path to HarbourFront. Provider direction `1` is
northbound and `0` southbound in these rows; those numbers have no universal
meaning. Source stop IDs and sequence strings remain literal at every occurrence.

**Open destination question:** Sengkang is the last listed stop, not an
independently confirmed operating destination. All 36 southbound short-working
trip rows have `trip_headsign: HarbourFront`, with no populated `stop_headsign`
override. This affects `56bb3839f6f45314637c8f1e3eee1fe2501d822cdf1176235484630dce3c9602`
(WE, 18 trips) and `fe06007fb37e46782ff475f710174428af16687f9d2bd6e624e4bf412180e0ca`
(PH, 18 trips), totaling 1,872 trip/date pairs under the exact sets below.
The [GTFS definition](https://gtfs.org/documentation/schedule/reference/#tripstxt)
describes the headsign as rider-facing destination text. The stop list and text
therefore need reconciliation; passing path checks does not settle this.

For example, `NEL_SB_WE_308_2222` declares HarbourFront but lists only
`NE18_A` at 23:06:00, `NE17_A` arriving 23:08:06/departing 23:08:41, and
`NE16_A` at 23:10:57. Its `block_id` is empty. The proposal uses the final
listed stop (`SKG`); it does not establish whether the headsign is generic,
the stop list is incomplete, or an operational continuation exists. Keep
destination acceptance pending until source-backed evidence resolves that
question. No continuation, extra stop, source correction or changed machine
disposition is supplied here.

### Follow-up: evidence for a scheduled short working

Inspection of every affected source trip supports the interpretation that the
published timetable intentionally contains a shorter journey:

| Check | Verified source result |
| --- | --- |
| Route and stop order | All 36 trips use the dedicated `NEL_NE16_NE18` route and exactly `NE18_A` → `NE17_A` → `NE16_A`. |
| Calendars | 18 Saturday and 18 Sunday trips; both sets have the same 18 Punggol Coast departure times. No weekday southbound short working is supplied. |
| Time span | First short departure 23:06:00; last 24:36:00, reaching Sengkang at 24:40:57. These retain their source service date. |
| Full-route comparison | The last full HarbourFront-bound departure from Punggol Coast is 23:25:30 in both calendars. Fifteen of the 18 short departures in each calendar occur later. |
| Continuation evidence | All 36 `block_id` values are empty; no NEL southbound trip starts at `NE16_A`, and the ZIP contains no `transfers.txt`. No explicit onward link is supplied. |

[SBS Transit's first/last-train page](https://www.sbstransit.com.sg/first-train-last-train),
checked on 28 October, lists the last Punggol Coast → HarbourFront train at
23:25. This corroborates the full-route cutoff at minute precision; it does not
independently confirm these individual short workings or their exact times.
The inspected operator material did not explicitly explain the 36 trips or the
HarbourFront headsign. A generic direction headsign is a plausible interpretation,
not an established explanation. No depot movement is inferred.

**Recommendation for the pending review decision:** accept Sengkang as the last
served station represented by these source trips, preserve all three occurrences
and the original HarbourFront headsign as source evidence, and do not infer travel
beyond Sengkang. This supports a source-faithful short-working mapping without
claiming independent confirmation of the actual operating destination. The
recommendation remains pending user review; no approval record or source edit is
created by this investigation.

To reproduce the comparison from the pinned ZIP, filter `trips.txt` to
`route_id == NEL_NE16_NE18` and `direction_id == 0`, join all `stop_times.txt`
rows by literal `trip_id`, and sort each trip by numeric `stop_sequence`.
For each source calendar, compare first-stop departures with the maximum
first-stop departure among `NEL_NE1_NE18`, direction `0`, trips. The private
joined detail is `/tmp/nel-shortworking-evidence-2026-10-28.json`; the pinned
original tables remain the evidence authority.

## Actual date sets and all 14 cells

All three NEL calendars span 2026-01-01 through 2026-12-31 inclusively, with
**no exception rows**. The declared feed envelope starts in 2025; it supplies no
NEL active dates in 2025. The exact sets are:

| Calendar suffix | Actual enabled dates | Count | Full date-set ID |
| --- | --- | ---: | --- |
| WD | Every Monday–Friday, 2026-01-01 to 2026-12-31 | 261 | `9a53ff769a14653ad803b2d799a5cff88d4079a5c2fb1f93b62347d623363fdd` |
| WE | Every Saturday, 2026-01-03 to 2026-12-26 | 52 | `71dc7758992ac07e70ceea437989e7ecc4f74a78d4ca15adaf04647a857eb989` |
| PH | Every Sunday, 2026-01-04 to 2026-12-27 | 52 | `eefec8dbd582ca6ff9402c99277ad1aab040300d7e1e5b991970ee3a43e0f946` |

The `PH` identifier alone does not activate public holidays. Whether the source's
literal rules are operationally correct remains a source-semantic review question.
Service dates remain attached to after-midnight GTFS times.

**Review assumption selected on 28 October:** for NEL, use the Sunday
`SERVICE_PH` timetable on official Singapore public holidays, replacing the
ordinary weekday/Saturday selection. Ordinary weekdays retain `SERVICE_WD`,
ordinary Saturdays retain `SERVICE_WE`, and Sundays retain `SERVICE_PH`.
The user selected this as a Foldaway policy assumption.
[SBS Transit's published NEL first-train timings](https://www.sbstransit.com.sg/first-train-last-train)
group Sundays and public holidays together; that supports the choice but does not
establish that every departure throughout the day is identical.

This prospective override needs a separately reviewed implementation, authoritative
holiday dates and validation before serving. The original source calendars and
generated proposals remain unchanged. All counts, date-set IDs and digests in this
packet describe the literal source, without the override. This discussion decision
does not create mapping/release approval or clear whole-feed eligibility.

Pattern prefixes below are unique in the full draft. Retrieve full IDs, source
record hashes, exact date arrays and trip lists using the detail queries.

| Pattern prefix | Actual endpoints | Calendar | Direction | Trips | Trip/date pairs |
| --- | --- | --- | --- | ---: | ---: |
| `fe06007fb37e` | PGC → SKG | PH | 0 | 18 | 936 |
| `56bb3839f6f4` | PGC → SKG | WE | 0 | 18 | 936 |
| `1379aba99195` | SKG → PGC | PH | 1 | 12 | 624 |
| `7cd7a11ba29f` | SKG → PGC | WD | 1 | 51 | 13,311 |
| `830d799be5f1` | SKG → PGC | WE | 1 | 12 | 624 |
| `c8d32c4c6a58` | PGC → HBF | PH | 0 | 221 | 11,492 |
| `51fa21346d38` | PGC → HBF | WD | 0 | 331 | 86,391 |
| `23dcd9e8ddef` | PGC → HBF | WE | 0 | 225 | 11,700 |
| `34158b095cb1` | HBF → PGC | PH | 1 | 225 | 11,700 |
| `d13e865f1ec1` | HBF → PGC | WD | 1 | 338 | 88,218 |
| `e009886bdd67` | HBF → PGC | WE | 1 | 229 | 11,908 |
| `0fcf6780e7f9` | OTP → PGC | PH | 1 | 1 | 52 |
| `e9d1bc3bb237` | OTP → PGC | WD | 1 | 1 | 261 |
| `e391c2f1c965` | OTP → PGC | WE | 1 | 1 | 52 |

## All physical stops and recursive parents

The table is also the full northbound station order; southbound reverses it.
`_A` and `_B` are source ID suffixes. The literal source `platform_code` is A/B
except Outram Park's C/D; each proposed alternative set is a singleton.
No NEL platform group, missing member or inferred platform was introduced.

| Source code | Source parent | Canonical station | `_A` → platform | `_B` → platform |
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

All 17 parents are location-type-1 rows with no further parent. Six interchange
parents use other-line IDs (`CC29`, `EW16`, `DT19`, `NS24`, `DT12`, `CC13`);
source-code, parent and canonical station checks agree. Reviewing only `NE*`
parents would miss these dependencies. Names alone are not the identity evidence.

Every one of the 27,054 NEL stop-time rows was compared with its assignment's
ordered source occurrence and canonical station/platform. All 1,683 source trips
have exactly one binding on their complete active date set. `pickup_type`,
`drop_off_type` and `timepoint` are absent in this source: inspection preserves
defaults 0, 0 and 1, including endpoints. No terminal exception or boarding
restriction is invented. Combined validation found no current canonical conflict;
undated platform layouts do not independently prove historical allocations.

In the 28 October review discussion, the user chose to assume the Outram Park
correspondences `NE3_A` → `OTP_NEL_C` and `NE3_B` → `OTP_NEL_D`.
Independent physical-platform verification remains unconfirmed; this assumption
does not establish dated historical allocation.

## Difference from the 14 October packet

The [older NEL packet](gtfs-nel-pilot-mappings.md) binds source hash
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
and canonical commit `d034d6babef4ea5bcac256d26c47dcd802bb39ba`.
The new full feed has 114 routes, six calendars, 19,119 trips and 348,777 stop-time
rows, versus 113, three, 19,150 and 349,768 previously. Raw calendar, route,
trip and stop-time table hashes changed; agency, stops and feed-info hashes did not.
The topology digest is unchanged, but the canonical commit binding is new.

A field-for-field comparison of the NEL subset found **no source changes**:
`SBST`, all three routes, all 1,683 trip rows, all 27,054 timing rows, all 51
stop/parent rows and all three used calendars are identical; both captures have
zero exceptions. All 69 proposed targets/source-record hashes and the 14 exact
date cells agree with the older draft (proposal wording aside). NEL coverage is
unchanged. This is fresh verification under a new whole-source identity, not
transfer of an approval; the old packet contains none to transfer.

## Deterministic detail and reproduction

The reused all-line files are in `/tmp/mrtdown-investigation-latest-review/`.
Keep originals and generated reports outside Git. Reproduce with the existing
[acquisition](gtfs-public-handoff.md#receiver),
[scoped runner](gtfs-review-blockers.md#generate-and-inspect) and
[assignment validator](gtfs-trip-assignment-validation.md#check-a-verified-local-capture),
using tooling and canonical data from the pinned commit above. For example,
in that checkout, with a clean committed `data/` tree and fresh output paths:

```sh
npm run build:cli
GTFS_SNAPSHOT_BASE_URL=https://sources.mrtdown.org \
GTFS_CAPTURE_KEY=captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json \
GTFS_INPUT_DIR=/tmp/nel-review-input-20261028 \
node scripts/acquire-gtfs-capture.mjs
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/nel-review-input-20261028/schedule.zip \
  /tmp/nel-review-input-20261028/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/nel-review-all-lines-20261028 \
  --canonical-commit e66664deebfcc4fe22689c2ee35d9165790249c7 \
  --platform-groups --blockers --assignments
node packages/cli/dist/index.js gtfs inspect \
  --file /tmp/nel-review-input-20261028/schedule.zip \
  --capture /tmp/nel-review-input-20261028/capture.json \
  --write /tmp/nel-review-source-20261028.json
```

Using the existing output directory, these queries retain every NEL cell and
assignment rather than selecting a convenient example:

```sh
cd /tmp/mrtdown-investigation-latest-review
jq '.pilotPatterns[] | select(.routeId | startswith("NEL"))' summary.json
jq --slurpfile s summary.json '
  ($s[0].pilotPatterns | map(select(.routeId | startswith("NEL")) |
    .providerId)) as $ids |
  .decisions[] | select(.kind == "pattern" and
    (.providerId as $id | $ids | index($id)))' full-draft.json
jq '.dateSets[] | select(.serviceDates | length == 261 or length == 52)' \
  full-draft.json
jq '.assignments[] | select(.routeMapping.lineId == "NEL")' assignments.json
```

`gtfs inspect`'s `schedule.patterns` provides full literal trip lists and ordered
stop IDs for each pattern; join its `id` to the summary's `providerId`.
`full-draft.json` has entity dispositions by literal `providerId`, source-record
hashes and exact `dateSets`; `assignments.json` has each trip's sequence strings,
station/platform/destination and complete `serviceDates`. These references cover
all cells in the tables, including shared parents. Normalized digests above
must match before relying on the counts. The old receipt/ZIP are obtained by
substituting the old source hash to repeat the source-subset comparison.

Validation on 28 October: CLI build, verified capture inspection (zero structural
errors), v3 draft re-evaluation and full assignment validation with coverage passed.
The reused packet's file hashes/lengths were checked against `summary.json`.
Source-subset comparison and every NEL occurrence/date/target check passed.
Lint, documentation links and 29 existing assignment/grouped-review tests passed.
No model calls, source edits, canonical writes or review records were made.

## What remains before serving

Human NEL review can establish the proposed source-to-canonical correspondence
for this exact input. It must explicitly assess the short-working destinations,
interchange parents, literal platform labels, and sufficiency of the source's
calendar/platform evidence. Independent dated operational confirmation and
holiday correctness are not established by compatible current topology.
A reviewer can leave a particular cell pending rather than invent an allocation
or repair a calendar. The two source headsign/endpoint disagreements above remain
explicitly pending human review despite their mechanically matched dispositions.

The all-line draft still has **191 unresolved decisions**. Its assignments cover
1,494,006 of 2,484,149 active source trip/date pairs; **990,143 remain unassigned
on every one of the 365 dates in 2026**. Both the [shared selector](https://github.com/foldaway/mrtdown-data/blob/e66664deebfcc4fe22689c2ee35d9165790249c7/packages/fs/src/gtfs/timetableSelection.ts)
and [site selector](https://github.com/foldaway/mrtdown-site/blob/b80fbf799e317ca3f13bc522e34fccc05c88d0f7/app/util/dbQueries/withSelectedScheduledTimetable.ts) reject a date with any active unassigned source trip anywhere in the feed. A fully mapped
NEL does **not** authorize a usable public NEL timetable. Resolve remaining
whole-source mapping/coverage, or separately review and implement a sound scoped
coverage design; do not drop other lines, add ignored/excluded dispositions or
relax eligibility in this packet. See the [remaining mapping evidence](gtfs-mapping-review-inventory.md#remaining-decisions).

Then obtain exact-draft mapping approval, capture-specific condition review,
exact-manifest release approval under [publication policy](gtfs-schedule-publication.md)
and [release review](gtfs-timetable-release.md), and explicit initial-baseline
source admission. Raw receipt rights status does not clear these gates, and
retrieval time/version `0.1` cannot supply provider ordering. Pinned capture,
trusted reviews/configuration and Pages flags still need a separately authorized
publication connection that persists across canonical-only builds.

Site [PR #289](https://github.com/foldaway/mrtdown-site/pull/289) merged as
`b80fbf799e317ca3f13bc522e34fccc05c88d0f7` and retired frequency estimation.
Absent timetable coverage stays unavailable. Actual publication and a real
producer-to-retention/projection/API/UI test remain necessary before claiming
arrival enablement. No release, source-lineage approval, Pages change, publication
or deployment is performed by this review packet.
