# GTFS mapping review inventory

For the 21 October capture, use the
[cross-line review based on the NEL decisions](gtfs-cross-line-mapping-review-2026-10-28.md).
It records reusable reasoning and consolidated exceptions with refreshed source
identities and counts; the inventory below remains the earlier baseline.

All nine observed line families now have concrete proposal packets. The inventory
is complete; the mappings are not approved or fully resolved, and Phase 2 remains
open. Every source entry and actual pattern date is accounted for without
automatic ignores, exclusions, source repair or canonical-data changes.

The common input is October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`,
canonical commit `d034d6babef4ea5bcac256d26c47dcd802bb39ba` and topology
projection 1 digest
`e376c280fbd6292ed6fe03e7fa81541ad0b0b8c76a09f916f1e3898aac240ec1`.
See the [scoped contract](gtfs-scoped-review.md) for verification and readiness
semantics and the [source handoff](gtfs-public-handoff.md) for attribution.

This page records the version-2 baseline. The opt-in
[version-3 grouped-platform review](gtfs-platform-group-review.md) proposes seven
complete alternative sets and 27 additional patterns while preserving this
baseline and its artifacts. Its remaining evidence and approval gates stay open.

## Pattern coverage proposals

Counts below describe proposed matches, not accepted operation. A source pattern
can have a complete matched calendar, a partially matched calendar, or no matched
date. Exact active-date arrays govern coverage; calendar envelopes and provider
names do not establish operation on other dates or public holidays.

| Line review | Source patterns | Proposed on every active date | Partially proposed | No matched date | Matched pattern-date pairs | Unresolved pattern-date pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [NSL](gtfs-nsl-pilot-mappings.md) | 59 | 4 | 0 | 55 | 417 | 7,458 |
| [EWL](gtfs-ewl-pilot-mappings.md) | 72 | 45 | 0 | 27 | 5,893 | 3,285 |
| [NEL](gtfs-nel-pilot-mappings.md) | 14 | 14 | 0 | 0 | 1,564 | 0 |
| [CCL](gtfs-ccl-pilot-mappings.md) | 119 | 0 | 31 | 88 | 1,656 | 13,101 |
| [DTL](gtfs-dtl-pilot-mappings.md) | 16 | 16 | 0 | 0 | 1,877 | 0 |
| [TEL](gtfs-tel-pilot-mappings.md) | 77 | 75 | 0 | 2 | 9,125 | 104 |
| [BPLRT](gtfs-bplrt-pilot-mappings.md) | 6 | 0 | 0 | 6 | 0 | 730 |
| [SKLRT](gtfs-sklrt-pilot-mappings.md) | 12 | 6 | 0 | 6 | 730 | 730 |
| [PGLRT](gtfs-pglrt-pilot-mappings.md) | 13 | 13 | 0 | 0 | 1,721 | 0 |
| **Total** | **388** | **173** | **31** | **184** | **22,983** | **25,408** |

The 204 patterns with at least one matched cell reference 11,338 distinct
recurring trip records. That does not accept every date of those records: the
1,098 CCL records in partially proposed patterns retain their earlier unresolved
dates. A pattern-date pair can represent many recurring trip records; neither
count is a count of individual dated departures.

NSL adds four short-working pattern proposals containing 18 records and 417
pattern-date pairs. SKLRT adds six West-loop patterns containing 1,618 records
and 730 pairs; its six East patterns remain unresolved. BPLRT adds 41 entity
identity proposals and **no matched pattern or departure coverage**. Entity
identity, source-path geometry and platform/service allocation are separate
claims.

## Complete accounting and unresolved cells

The source inventory has 1,124 unique entries: three agencies, 113 routes,
620 referenced stops/recursive parents, and 388 trip patterns. The 620 stop
entries comprise 186 station parents and 434 physical stops; unrelated entrance
rows are outside this referenced-stop review scope.

The cumulative full draft has 1,155 decision cells:

- 930 matched proposals: two agencies, all 113 routes, all 186 station parents,
  425 physical stops and 204 pattern/date cells.
- 225 unresolved cells: one unused agency, nine physical stops and 215
  pattern/date cells. The latter comprise 184 wholly unresolved patterns and
  the unresolved portions of 31 partially matched CCL patterns.

Splitting those 31 patterns accounts for the difference between source entries
and decision cells. There are no new source patterns, implicit exclusions or
inactive decisions. The full draft has valid complete **accounting**, with
readiness `unresolved`. The focused matched-only draft is valid but omits 194
source entries entirely and 25,408 pattern dates, including dates in the 31
partially present CCL patterns. Its readiness remains `incomplete`.

All declared routes have proposed line identities, including declarations with
no source trips. A route identity does not establish service, and an entity-only
BPLRT packet does not create departures. Neither draft has approval metadata;
both keep `mappingReviewEligible` and `generationEligible` false.

## Remaining decisions

The following blockers overlap. Counts in different rows must not be added as
independent populations. Each line packet names its affected source patterns,
dates, trip records and literal platform evidence.

| Scope | Unresolved evidence | Required next work |
| --- | --- | --- |
| Jurong East NSL `NS1_A`/`NS1_B` | Both source labels contain A / D / E. Existing canonical members do not establish a single allocation. | Define and review truthful platform alternatives without selecting one member. |
| Jurong East EWL `EW24_A` | Source label B / C; both candidates support the direction. | Preserve the alternatives rather than infer an allocation from direction. |
| Tanah Merah `CG_A`/`CG_B` and Changi Airport `CG2_A`/`CG2_B` | Literal D / E and A / B groups. | Review complete alternative sets and resulting occurrence semantics. |
| Ang Mo Kio `NS16_A`/`NS16_B` | Source groups A / C and B / D; canonical layout contains only A and B. Dated signage confirms physical C/D labels. | Review their dated service/boarding allocation before a separate canonical correction; see the [AMK evidence](gtfs-amk-platform-evidence-2026-10-28.md). Choosing the known member would hide incomplete representation. |
| Expo airport services | Six patterns conflict with current literal-label/service scopes, overlapping grouped endpoint blockers. | Resolve dated allocation evidence or a source correction; grouped-platform support alone does not resolve these conflicts. |
| CCL | Revision/code gaps, multiple candidates and conflicts with undated current platform scopes, including unresolved dates in all 119 patterns. | Review these causes separately; do not choose the latest revision or use current records as historical proof. |
| Sengkang East | Six patterns conflict at the five intermediate stations. West patterns have supported proposals. | Verify intermediate-station labels and service allocations without applying town-centre evidence to other stations. |
| Bukit Panjang LRT | All six patterns conflict at both Choa Chu Kang occurrences; their ordered station geometry is valid. | Verify physical allocations and preserve both endpoint occurrences. Dropping the return occurrence would leave the initial conflict. |
| Marina South Pier | Four geometric NSL patterns conflict at their terminal physical platform; two no-geometry skip paths also have that endpoint concern. | Distinguish terminal arrival and source occurrence rules before changing service scope or diagnostics. |
| Five source-path disagreements | Three NSL patterns contain skipped/excursion occurrences; two TEL patterns omit Gardens by the Bay. | Obtain service-specific evidence or a provider correction. No interpolation, reversal, deleted occurrence or implicit exclusion is supplied. |
| Unused `LTA` agency | The source declares it but no route references it. | Record a reviewed explicit disposition rather than infer an operator alias or automatic ignore. |

Seven unresolved physical records have complete sets of existing canonical
alternatives; the two Ang Mo Kio records have incomplete sets. This distinguishes
the original seven ambiguous candidate sets from the **nine** unresolved source
platform records under the literal-label review contract.

The [disagreement queue](gtfs-mapping-disagreements.md) retains station-specific
evidence limits. Source calendar correctness, authoritative snapshot lineage,
historical platform evidence, rights/publication validation and digest-bound
mapping review remain separate requirements. No later artifact should treat
complete inventory accounting as permission to publish arrivals.

## Reproduce the cumulative packet

After materializing the verified schedule and capture receipt, run in a fresh
output directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-all-lines-review \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The normalized full-draft digest is
`eafa4f4ef798fa053ab030c09dd9c4031afce29074becc14205fee061f705eb5`;
the focused-draft digest is
`bdafd9c9b8f9451107050c89703087ac7e44a2f511c091818c5241ebd264d88c`.
All five output files reproduce byte for byte with reordered/repeated line IDs.
The cumulative focused draft is the conflict-free union of the nine standalone
pilots, preserving all earlier decisions. Full generated drafts and large
evaluations remain outside Git and can be rebuilt from the pinned inputs.
