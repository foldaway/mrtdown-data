# GTFS mapping disagreements

This is a review queue for the October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
and the canonical topology identified in the
[reconciliation audit](gtfs-reconciliation-audit.json). Findings are proposed,
not approved mapping decisions. No canonical correction or source repair is
justified solely by a disagreement between these two inputs.

The [consolidated review inventory](gtfs-mapping-review-inventory.md) now accounts
for all nine observed line families and records remaining source/platform/date
decisions. Its nine unresolved platform records include Ang Mo Kio's incomplete
literal groups, in addition to seven ambiguous sets of existing alternatives.

## Circle Line date boundary

[LTA's Circle Line 6 project page](https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/circle_line_6.html)
records passenger-service opening on 12 July 2026 and the three stations closing
the HarbourFront–Marina Bay gap. This supports retaining the canonical July 12
boundary. It does not authenticate each all-year provider calendar or prove that
a post-opening loop pattern operated before the boundary. Date-scoped evidence
must preserve a gap when no valid revision covers a supplied service date.

## Interchange parent identity

The verified October snapshot uses station parent `CC33` for Marina Bay's NSL
and TEL platforms, and `CC34` for Bayfront's DTL platforms. The parent rows have
matching `stop_code` values, `location_type=1` and no parent. Their child rows
explicitly retain `NS27`, `TE20` and `DT16`, respectively. Canonical code history
maps `CC33` uniquely to MRB and `CC34` uniquely to BFT; those CCL codes begin on
2026-07-12, while the child codes already cover the proposed dates.

The [GTFS reference](https://gtfs.org/documentation/schedule/reference/#stopstxt)
defines `parent_station` as location hierarchy and `stop_code` as a rider-facing
location identifier. It does not attach a separate service calendar to station
parents. We therefore treat the snapshot parent's code as identity evidence,
independent of the dated service represented by its child. This is the repository's
mapping rule; the specification does not itself approve the LTA-to-MRTDown mapping.

The earlier source-stop checker applied service-date validity to the parent too,
rejecting 3,456 NSL/DTL/TEL pattern-date pairs across 54 scopes. The corrected rule
requires one well-formed parent row and one consistent canonical station across
code history. Unknown, conflicting or ambiguous parent identities still fail.
Each child's explicit code must remain valid on the actual line and every scoped
date, alongside canonical path, revision, platform and boarding checks.

This resolves the parent identity mismatch without changing source rows or
canonical history. It does not authorize pre-opening CCL service or accept the
source calendars as historical operating evidence. Human mapping review and
publication requirements remain open. Sources rechecked on 2026-10-18.

## Platform evidence

| Scope | Established evidence | Disposition and evidence still needed |
| --- | --- | --- |
| Expo | Retained provider stop IDs `CG1_A`/`CG1_B` swap `platform_code` between August and October. Canonical A serves `EWL_CG_E`, B serves `EWL_CG_W`. October eastbound trips use the stop now labelled B, and westbound trips use the stop now labelled A. | Keep six pattern conflicts unresolved. Obtain dated operator platform-direction evidence or a provider correction. Matching the stop-ID suffix would conceal the explicit label disagreement. |
| Choa Chu Kang | October `BP1_A` (platform 1) occurs at both ends of Service A paths via Senja; `BP1_B` (platform 2) occurs at both ends of Service B paths via Petir. Canonical 1/3 list B; 2/4 list A. | Keep six pattern conflicts unresolved. Verify which boarding platforms can serve each loop and separately verify alighting-only platforms. A timetable's repeated terminal stop does not establish boarding/alighting infrastructure. |
| Sengkang East intermediate stations | October clockwise paths via Compassvale use platform 2; counterclockwise paths via Ranggung use platform 1 at SE1–SE5. Canonical scope is the reverse, rooted in direct Bakau/Rumbia observations and same-line inference. | Keep six pattern conflicts unresolved. Verify station-specific physical labels and direction. Evidence about Sengkang town-centre platform changes does not establish labels at SE1–SE5. |
| Marina South Pier | Four southbound patterns end at `NS28_A`, mapped by label to canonical A, whose scope lists the northbound service. The conflict is only at the final occurrence. | Distinguish terminal arrival from a boardable southbound departure. Confirm turnaround and occurrence pickup rules before changing canonical service scope or dropping the conflict. |

Canonical platform provenance is described in
[station layout](plans/active/station-layout-data.md): records without
`inference` use personal observation/recollection; explicit inference records
name their observed basis. These are independently maintained records, not
copies of the GTFS platform labels. In particular, changing an inferred record
requires revisiting its basis rather than making the feed its implicit source.

Official documents help bound the investigation but do not resolve the conflicts:

- [SMRT lift-upgrade schedule](https://www.smrt.com.sg/getmedia/4dc714c8-1a2c-4cf7-ac49-e5ea12425ab1/Annex-B-%E2%80%93-Further-details-and-schedule-of-lift-upgrading-work.pdf)
  distinguishes stem stations from loop stations: its loop rows identify platform
  1 with Service B via Petir and platform 2 with Service A via Senja. Its Choa
  Chu Kang row says both directions and does not assign A/B to platforms there.
  Applying the loop-station rule at the terminus would be an unsupported inference.
- [LTA's Sengkang enhancement announcement](https://www.lta.gov.sg/content/ltagov/en/newsroom/2023/12/news-releases/the-rail-report-construction-in-full-swing-for-jrl-crl.html)
  describes separate loop boarding locations at Sengkang town centre. It does
  not establish Compassvale, Rumbia, Bakau, Kangkar or Ranggung platform labels.
- [SBS Transit's historical maintenance schedule](https://www.sbstransit.com.sg/Uploads/files/annex_maintenance_works_schedule_apr_2016.pdf)
  explicitly concerns 2015–2016 town-centre departures. It cannot authenticate
  2026 intermediate-station labels or override later layout changes.

These links were inspected on 2026-10-14; their stated periods and station scope
remain part of the evidence. No external photo, station plan or platform dataset
is imported into canonical records by this investigation.

## Unmatched source occurrences

All five unmatched patterns are structurally valid under the current audits.
The following exact trip IDs locate the source rows; keep their original times
and ordered stop occurrences. No missing times are interpolated as a repair.

| Provider route/calendar | Affected trips | Source trace and unresolved question |
| --- | --- | --- |
| `NSL_NS13_NS28` / `SERVICE_WD` | `NSL_SB_WD_203_3103` | Sequence 1 departs `NS13_B` at `5:29:39`; sequence 2 arrives `NS18_B` at `5:45:03`. NS14–NS17 are absent. Confirm missing stop-time rows versus a documented skip-stop operation. |
| `NSL_NS13_NS28` / `SERVICE_WE` | `NSL_SB_WE_203_4559` | Sequence 1 departs `NS13_B` at `5:34:18`; sequence 2 arrives `NS18_B` at `5:49:47`. Same unresolved omission. |
| `NSL_NS16_NS1` / `SERVICE_PH` | `NSL_NB_PH_210_5334` | Starts `NS16_A, NS20_A, NS21_A, NS20_A, NS19_A, NS18_A`. Preserve the excursion and repeated NS20 occurrence. Confirm the intended stop sequence before selecting a northbound canonical path. |
| `TEL_TE1_TE29` / `SERVICE_PH` and `SERVICE_WE` | Seven per calendar: `TEL_CB_<calendar>_103_0101`, `104_0139`, `105_0177`, `125_0874`, `142_0891`, `143_1101`, `144_1117` | Here `<calendar>` is `PH` or `WE`; the suffixes after the first entry retain the same `TEL_CB_<calendar>_` prefix. All fourteen omit `TE22_A`. The `103_0101` example departs `TE20_A` at `18:00:25` and arrives `TE23_A` at `18:06:41`. Confirm omitted rows versus a documented station bypass. |

[LTA's TEL station list](https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/thomson_east_coast_line.html/1000)
includes Gardens by the Bay in Stage 3 and Tanjong Rhu in Stage 4. That supports
retaining the canonical station in the ordinary path; it does not prove the
stop behavior or missing time of an individual trip. The closed future stations
Marina South and Founders' Memorial are separate from the omitted Gardens by
the Bay stop.

`SERVICE_PH` is the provider identifier. The October calendar enables Sunday
service with no exception rows; its name alone does not establish public-holiday
applicability. None of the five representative trip IDs above occurs in the
August `trips.txt`, so those exact IDs cannot supply a historical correction.

The default disposition for these 17 trips is unresolved. Any later reviewed
exclusion must record its affected scope and resulting coverage gap. Neither
silently deleting supplied occurrences nor adding unobserved scheduled stops is
an acceptable way to make the sequence matcher succeed.

## November source-journey model

The maintainer subsequently accepted two capture-specific Foldaway assumptions:
use the supplied LTA journeys as authoritative, including reversals and repeated
visits, and treat each supplied station timing as a passenger-service call.
Possible AMK turnaround or “DO NOT BOARD” movements no longer justify withholding
the station-level passenger-call interpretation. This is a modelling decision,
not first-party confirmation of why a movement occurs or which physical member
of A/C or B/D a train uses.

The [source-journey policy](gtfs-source-journey-policy-2026-11-02.json) binds the
November ZIP's original table manifest, five exact pattern IDs, explicit
same-line service associations, review reasons and exact effective service dates.
The associations follow source route/destination evidence: `NSL_NS13_NS28` to
`NSL_MAIN_S`, `NSL_NS16_NS1` to `NSL_MAIN_N`, and `TEL_TE1_TE29` to `TEL_MAIN_S`.
An association does not assert that every leg travels in the service's nominal
direction, and platform preferences never select it.

The scope is **November 1–30, 2026 service dates**, an explicit diagnostic cohort
under the accepted November-download applicability assumption. These are not
provider-confirmed validity bounds. The existing holiday policy derives the
November 9 substitution. The literal source calendars, the complete effective
date population and all out-of-cohort dates remain present; no date is excluded
or silently approved. The wider applicability contract and assignment/release
consumers remain separate work.

| Source pattern group | All-year effective trip/date pairs | November cohort |
| --- | ---: | ---: |
| Yishun–Braddell omission, WD | 251 | 20 |
| Yishun–Braddell omission, WE | 51 | 4 |
| Reversing NSL PH journey | 63 | 6 |
| Seven TEL WE trips omitting Gardens by the Bay | 357 | 28 |
| Seven TEL PH trips omitting Gardens by the Bay | 441 | 42 |
| **Total** | **1,163** | **100** |

The 100 November trip/date pairs occupy 40 pattern/date pairs. Literal November
calendars supply 93 trip/date pairs before holiday substitution. All 1,063
effective pairs outside November remain accounted for without gaining a
source-order association from this policy. Service dates are in Asia/Singapore:
a `25:00` call belongs to the previous civil day's service date, including at
month and holiday boundaries. None of these 17 source trips has a `24+` time.

`createScheduledSourceJourneyMappingDraft` composes this policy with the existing
[platform-allocation review](gtfs-source-platform-allocation-review.md) and
holiday policy. It retains raw trip/stop-time rows, source stop IDs, original
stop-sequence strings, normalized times, explicit/default access rules, every
ordered/repeated occurrence and complete literal platform alternatives. Each
timed occurrence carries `passengerService: true`. Missing stations gain no call
or interpolated time. A Yishun–Braddell or Marina Bay–Tanjong Rhu association
can follow the ordinary route without claiming an unlisted intermediate call.

The `sourceJourney` match distinguishes this association from exact, contiguous
and cyclic canonical paths. No source or canonical path is rewritten, and the
strict canonical assignment path validator still rejects these journeys.
Known same-line service references, revision periods, station-code dates,
operators and platform diagnostics remain checked. Duplicate/unknown patterns,
dates outside the effective population, changed source manifests, cross-line
or unknown services and attempts to replace existing ordered-path candidates
are rejected. Timed calls retain source access fields; the passenger assumption
does not turn an explicit no-pickup rule into permission to board. A station
passenger call does not select an A/C member or establish C as boardable.

The distinct `gtfs-source-journey-mapping-draft` and
`gtfs-source-journey-mapping-approval` bind original canonical/source identity,
all three policies, reviewed platform topology and bound journey rules, raw
occurrence evidence, date
review and editable mapping text. Evaluation reconstructs those claims from the
verified inputs. Older literal/holiday/allocation approvals do not approve this
wrapper. Approval never bypasses unresolved platform evidence or missing dates;
no approval is emitted and generation remains false. Existing assignment and
release consumers do not accept this wrapper.

Run with Node 24 and `TZ=UTC` after `npm run build:fs`, using a new output folder:

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/gtfs-current-capture-20261105/schedule.zip \
  /tmp/gtfs-current-capture-20261105/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-source-journey-review \
  --canonical-commit 6ea959633e5a0f2db0c087d17075a461c8f933f9 \
  --holiday-policy docs/gtfs-shared-holiday-policy-2026-11-02.json \
  --holiday-calendar SG-2026 \
  --platform-allocation-policy docs/gtfs-platform-allocation-policy-2026-11-02.json \
  --source-journey-policy docs/gtfs-source-journey-policy-2026-11-02.json
```

The output contains `source-journey-review.json`, `source-journey-evaluation.json`
and `summary.json`. To evaluate saved edits, add `--source-journey-review <json>`;
actual separately reviewed metadata uses `--source-journey-approval <json>`.
These cannot mix with holiday-only or platform-only review/approval files.
The original receipt/ZIP identity and LTA attribution are retained in the
[platform review](gtfs-source-platform-allocation-review.md#capture-comparison)
and [public handoff](gtfs-public-handoff.md). No claim that this is the latest
capture, permanent platform correction or release approval follows.

`applyScheduledSourceJourneyServiceMemberships` adopts #461's explicit
shared-service claims within this wrapper. The claim's `baseDraftSha256` binds
the exact nested grouped mapping. The complete independently resolved date
population is passed to validation, including literal dates for patterns outside
the holiday-policy families. Existing source-journey evidence, unrelated mapping
decisions and source/effective dates remain intact. Claims still require every
member's complete ordered canonical path; a reversing source journey cannot be
recast as several canonical shared paths. Single-service assignments and #461's
deduplicated multi-service departure queries retain their existing contracts.
The runner also retains #463’s independent platform-association mode; mixed
source-journey/association policy or review inputs are rejected before any mode
can silently ignore the other’s arguments.

Use `--shared-service-memberships <claims.json>` together with the source-journey
policy to adopt such claims before evaluating the new wrapper. Saved mappings
retain their shared targets when replayed with `--source-journey-review`; no
membership is automatically selected and no approval is generated.

### November model verification

Fresh runs use the pinned November ZIP and canonical data at merged #463
(`6ea959633e5a0f2db0c087d17075a461c8f933f9`).
The model supplies a unique dated source-order association for all 100 cohort
trip/date pairs. The 70 TEL pairs gain passing mapping proposals. The 24 NSL
southbound pairs retain the separately reviewed MSP terminal-platform conflict;
the six reversing NSL pairs retain AMK's complete A/C physical-platform checks.
The station passenger-call assumption is represented for all supplied timings,
including both AMK visits, without selecting a physical alternative.

The complete population stays 2,478,348 effective trip/date pairs; unresolved
pairs fall 462,756 → 462,686. All 387 non-policy pattern reviews, every previously
passing per-date target, all source pattern/row hashes, original/effective dates,
trip memberships and source stop orders remain unchanged. Original stop-time
rows for all 17 affected trips compare exactly with the pinned ZIP. No calls or
times are interpolated. All 1,063 out-of-cohort pairs remain unresolved.
The review has complete accounting, zero exclusions, no approval, unresolved
readiness and mapping/generation eligibility false.

The normalized source-journey wrapper digest is
`f61b5b53daa9c9bbc7afd82ace989c55f044a208af3a87f470fa0026b96eab69`;
the separately bound review topology digest is
`9310411c737278e0599c5d53704631b7a4d87ea65b317274daf59f6f5748bb27`.
The original canonical topology digest remains
`16f1700e9a37fedb3c08adeb762f4cf1832968d0acfd773a9a027f2ea80a7297`.
The source-allocation baseline wrapper digest for the same canonical commit and
implementation is `0b4816962bf7056b5c986384dd953f26362f6ad5b295c97d18a91c372f145576`.
Fresh packets are under `/tmp/gtfs-source-journey-rebase-463-20261107-u3KEOl/`;
the earlier #460- and #461-bound packets remain historical. Large generated packets remain
outside Git.

A separate combined run regenerates #461's 34 explicit CCL membership claims
against the current source-journey draft: 382 pattern/date pairs and 3,960
trip/date pairs. Applying them changes exactly those CCL cells, preserves the
source-journey and holiday-date evidence, and retains every unrelated mapping
claim. The combined wrapper digest is
`d1072933d34a91ce2ca8fd7aac9c08194b407aa7b91e177b635518e8487e2db6`;
all-year unresolved pairs become 458,726, with complete accounting, zero
exclusions and no mapping/generation eligibility. This combined result is
separate from the 70-pair source-journey gain above.

Validation uses Node 24 with `TZ=UTC`: all 411 filesystem-package tests and 214
core tests pass,
including 19 source-journey tests covering reversals, omissions, repeated calls,
access fields, 25-hour service dates, holiday substitution, revision/code
boundaries, overlapping candidates, complete platform alternatives, stale
identities/evidence, approval separation, strict assignment rejection and shared
service membership claims with patterns outside the holiday policy.
Package builds, lint, package boundaries and documentation links also pass.
Saved-review replay reproduces the review, evaluation and summary byte for byte;
four invalid CLI mode combinations are rejected before input/output access.
