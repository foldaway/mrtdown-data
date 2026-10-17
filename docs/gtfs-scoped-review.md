# Scoped GTFS mapping draft and review contract

The version-2 draft turns verified reconciliation candidates into concrete,
reviewable mapping proposals. The checked-in packets now cover all nine observed
line families, with unresolved cells and entity-only proposals retained explicitly.
The [consolidated inventory](gtfs-mapping-review-inventory.md) records current
coverage and remaining blockers. Neither the pilots nor the full generated draft
is approved or eligible for generation. Proposal and review schemas version 1
remain unchanged.

## Reproduce the NEL pilot

Materialize the verified October ZIP and receipt using the
[public handoff](gtfs-public-handoff.md), then run:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json NEL \
  /tmp/new-nel-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The pilot argument also accepts comma-separated line IDs, such as `NEL,DTL`.
Order and repeated IDs do not change the result; empty and unknown IDs fail.
The optional full commit defaults to HEAD. The runner rejects dirty canonical
records and verifies that the selected commit's complete `data` tree matches the
checkout. It verifies the schedule receipt, source endpoint, SHA-256 and byte
length before parsing, rebuilds the canonical topology and candidates, and refuses
to overwrite an output directory. There are no network/model calls, canonical
writes, approvals or arrivals generation.

Outputs are deterministic for the same inputs, canonical commit and implementation:

- `full-draft.json`: every observed entry and every actual active pattern date
  has a proposed disposition. Outside-pilot scope remains explicitly unresolved.
- `pilot-draft.json`: only concrete matched proposals inside the pilot, with the
  exact shared date sets they reference. It is a globally incomplete subset.
- `full-evaluation.json` and `pilot-evaluation.json`: detailed validation,
  completeness and missing-scope inventories. The larger generated evaluation
  stays outside Git.
- `summary.json`: source identities, draft/file digests, pilot endpoints and
  cardinalities, readiness, and the compact global unresolved inventory. Pattern
  IDs are grouped by exact date-set ID; no exclusion is inferred.

The checked-in [NEL pilot draft](gtfs-nel-pilot-draft.json) and
[summary](gtfs-nel-pilot-review-summary.json) reproduce those two corresponding
files. The full draft and evaluation reports stay outside Git and can be rebuilt
from the pinned source receipt/manifest and canonical commit. The input is the
same public schedule and topology audited in
[reconciliation evidence](gtfs-reconciliation.md).

## Draft decisions and exact dates

`ScopedReconciliationDraftSchema` records `documentKind`, schema version 2,
complete `ReconciliationIdentity`, `preparedBy`, explicit pilot line IDs, shared
`dateSets`, and decisions. `preparedBy` identifies the proposal tool or author;
it is not a reviewer or an approval. Each decision binds `kind`, `providerId`,
`sourceRecordSha256`, a reason and a disposition:

| Entry | Dispositions | Target and date scope |
| --- | --- | --- |
| Agency, route or referenced stop/parent | `matched`, `ignored`, `unresolved` | Match requires one reported canonical target; other dispositions prohibit a target. |
| Trip pattern | `matched`, `excluded`, `unresolved`, `inactive` | Every cell names a shared exact date set. Match requires one reported service-revision target valid on every date. |

Each date-set ID is the SHA-256 of its sorted exact ISO civil-date list. The
checker validates all declared lists, including unreferenced ones, and rejects
invalid dates, duplicates, changed IDs and unused date sets. A pattern's cells
must partition its actual calendar dates without overlap or omissions. Dates
outside that pattern's calendar fail. Calendar exceptions and service dates are
preserved exactly; a date envelope never substitutes for an exact list.

A zero-active-date pattern still requires an explicit decision. `inactive` can
only refer to an empty date set and an actually empty calendar. Empty matched
cells are rejected, and an all-inactive/all-excluded review cannot yield matched
mapping readiness.

An explicit exclusion can account for omitted coverage, but those dates are
never counted as matched or available. The creator produces **no exclusions or
ignores**: unsupported, outside-pilot, ambiguous or conflicting inputs remain
unresolved. Missing entries in the focused subset remain missing, not ignored.

## Validation and readiness

`evaluateScopedReconciliation(context, draft, approval?)` rebuilds the report and
evidence from the supplied source tables, exact identity and canonical topology.
Callers of this pure helper must first verify that those tables belong to the
recorded source manifest and that the canonical data belongs to the exact commit;
the runner performs those checks. It validates:

- Exact source/canonical/topology identity and per-entry source-record digests;
  unknown entries, targets, date sets and duplicate decisions fail.
- Every observed entry and each active pattern date is accounted for explicitly.
  A missing empty-calendar pattern also leaves coverage incomplete.
- Each matched pattern target exists in the candidate set on **every** claimed
  date. Neither an approval assertion nor an exclusion can turn a temporal gap
  into a match. Ambiguous target choices require an explicit decision; the
  creator proposes matches only when temporal candidates are unique.
- Matched route/agency and recursive stop/parent dependencies exist. A child's
  selected platform belongs to the selected parent station. Matched physical
  identities require one source candidate and a single literal platform label.
  Same-label alternatives and grouped labels remain unresolved in this initial
  v2 contract; it does not pretend one alternative has been allocated.
- Matched dates have no explicit current platform/service/boarding diagnostic
  conflict, and the mapped agency agrees with the canonical line operator period.
  These current, undated platform records do not prove historical assignments.
  The checker cannot authenticate source semantics or replace repository review.

The creator recursively checks entity dependencies before proposing a child or
route, rather than creating a draft with knowingly broken dependencies. It also
leaves operator-period conflicts and unresolved pattern dates pending.

`scopedReviewDraftSha256` binds exact proposal text and decisions, normalizing
unordered draft/date-set/target-property order. Optional
`ScopedReconciliationApprovalSchema` metadata names the reviewer, reason, exact
identity and that digest. It is an ordinary repository-review assertion, not an
authenticated identity or a signature. No approval metadata is supplied by the
creator or included in the real pilot. Editing a bound proposal or changing its
input identity invalidates an earlier assertion.

The evaluator reports structural `valid`, separate `coverageComplete`, unresolved
counts, matched/excluded pattern-date counts, `approvalMatches`, `reviewComplete`
and `readiness`. `mappingReviewEligible` additionally requires complete, valid,
resolved, digest-bound repository-review metadata and at least one matched date.
Even then it applies only to the artifact's explicit matched coverage. Excluded
or inactive dates never become match-eligible. `generationEligible` is **always
false**: independent validation, source/calendar correctness, reviewed lineage,
rights/attribution, semantic acceptance and publication contracts remain separate
unimplemented prerequisites for arrivals generation.

## Concrete NEL pilot

The full draft has 1,124 decisions: 69 matched proposals and 1,055 unresolved
entries. There are zero exclusions/ignores and no approval. The focused pilot has:

| Scope | Draft matches |
| --- | ---: |
| SBST to canonical SBS | 1 |
| Provider route to canonical NEL line | 3 |
| Station parents | 17 |
| Physical platform stops | 34 |
| Pattern/date decisions | 14 |

Those 14 patterns contain 1,683 distinct source trip records and 1,564 pattern-date
pairs. The three exact source route IDs are `NEL_NE1_NE18`, `NEL_NE16_NE18` and
`NEL_NE3_NE18`. Targets use `NEL_MAIN_N` or `NEL_MAIN_S` revision
`r_2024_punggol_coast`, valid from 2024-12-10, and preserve exact versus contiguous
segment matching. Sengkang–Punggol Coast shuttles and Outram Park starts keep their
actual source endpoints and stop cardinality. Assigning a main service identity
does not extend a short working to HarbourFront or insert missing stops.

Refer to the [NEL station/platform review table](gtfs-nel-pilot-mappings.md) for
all 17 mappings, including six provider parent IDs from other lines and Outram
Park's explicit C/D platform labels despite A/B provider stop-ID suffixes. Parent
coverage is computed recursively from referenced source stops, never by an `NE`
ID prefix. The summary lists each pattern's real endpoints, stop count, trip count,
calendar, date-set ID and source-record digest for review.

`SERVICE_WD`, `SERVICE_WE` and `SERVICE_PH` are preserved as supplied. Their actual
calendars mean weekdays, Saturdays and Sundays in this capture; no public-holiday
behavior is inferred from a name. The [mapping disagreement queue](gtfs-mapping-disagreements.md)
retains the other-line and source-quality questions.

The full draft validates complete accounting but has readiness `unresolved`.
The pilot subset validates its claims but has readiness `incomplete`: 1,055 other
entries and 46,827 outside-pilot pattern dates are absent. Both are unapproved,
both report `mappingReviewEligible: false`, and generation stays blocked. The
pilot is a concrete proposal for normal repository review, not completed Phase 2.

## DTL and cumulative pilot scope

The [DTL mapping table](gtfs-dtl-pilot-mappings.md),
[draft](gtfs-dtl-pilot-draft.json) and
[summary](gtfs-dtl-pilot-review-summary.json) extend the same review process to
Downtown Line. Reproduce them with the command above using `DTL` as the pilot
argument. Its 129 proposed decisions cover one agency, seven declared routes,
35 station parents, 70 platform stops and 16 patterns: 1,511 trip records and
1,877 pattern-date pairs. Two declared routes have no trips in this capture;
matching their line identities does not establish service on those routes.

To accumulate the pilots, regenerate from their common verified inputs rather
than concatenate independently generated documents:

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json NEL,DTL \
  /tmp/new-nel-dtl-review-draft \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba
```

The combined draft deduplicates the shared SBST agency and the `DT12` (Little
India) and `DT19` (Chinatown) station parents. It contains 195 proposed matches:
one agency, ten routes, 50 parents,
104 platform stops and 30 patterns. Those patterns contain 3,194 trip records
and 3,441 pattern-date pairs. The full document still accounts for all 1,124
entries, with 929 unresolved and no inferred exclusions or ignores. Its focused
subset omits those 929 entries and 44,950 outside-pilot pattern dates. The
normalized combined pilot digest is
`ef9e98368bbfca600086faa52bfec6cbe38a77f42641761f08bbbf7f15fc1192`.

All five output files reproduce byte for byte with `DTL,NEL,NEL` as well as
`NEL,DTL`. The original single-line NEL draft and summary also reproduce unchanged.
Combining scopes supplies no approval: full readiness remains `unresolved`,
subset readiness remains `incomplete`, and generation stays blocked.

## Punggol LRT and cumulative pilot scope

The [Punggol LRT mapping table](gtfs-pglrt-pilot-mappings.md),
[draft](gtfs-pglrt-pilot-draft.json) and
[summary](gtfs-pglrt-pilot-review-summary.json) add the provider route `PG` to
canonical `PGLRT`. Its 60 proposed decisions cover one agency, one route,
15 station parents, 30 platform stops and 13 patterns: 2,935 trip records and
1,721 pattern-date pairs. All patterns preserve nine ordered occurrences,
including the separate departure and return at the same Punggol platform stop.
They are exact full loops, with no short workings or rotated matches.

The weekday East Loop clockwise path occurs with both source direction IDs.
Both source patterns remain separate; station order and explicit platform labels
determine their common service target. No direction ID or platform suffix is
promoted into a general mapping rule.

Regenerate the cumulative pilot from the same verified inputs and canonical
commit using `NEL,DTL,PGLRT` as the pilot argument. It contains 253 proposed
matches: one agency, eleven routes, 64 parents, 134 platform stops and 43
patterns. Shared dependencies include the existing SBST agency and Punggol's
`NE17` station parent. The patterns contain 6,129 trip records and 5,162
pattern-date pairs. The full document still accounts for all 1,124 entries,
with 871 unresolved and no exclusions or ignores. Its focused subset omits
those 871 entries and 43,229 outside-pilot pattern dates. The normalized
combined pilot digest is
`9a4c35f381249d44338597ab9ceb08f4be4057592ceba9ac7c3b069c2b9e22b4`.

All five cumulative output files reproduce byte for byte with
`PGLRT,NEL,DTL,PGLRT` as well as `NEL,DTL,PGLRT`. Full readiness remains
`unresolved`, subset readiness remains `incomplete`, and neither mapping review
nor arrivals generation is enabled. Source/calendar correctness and reviewed
lineage remain separate open conditions.

## TEL supported patterns and remaining gaps

The [TEL mapping table](gtfs-tel-pilot-mappings.md),
[draft](gtfs-tel-pilot-draft.json) and
[summary](gtfs-tel-pilot-review-summary.json) add 172 proposed matches: one
agency, fifteen routes, 27 station parents, 54 platform stops and 75 patterns.
Those patterns contain 1,619 source trip records and 9,125 pattern-date pairs.
Full paths and short workings retain their supplied endpoints and occurrences.

This is a partial TEL proposal. Two other TEL patterns contain fourteen source
trips that omit `TE22_A` (Gardens by the Bay), jumping from `TE20_A` to `TE23_A`.
Their 104 pattern-date pairs remain unresolved in the full draft. The focused
matched-only draft omits these two patterns along with outside-pilot entries;
it must not be interpreted as complete TEL coverage. Source stops and times are
neither repaired nor excluded to force a canonical match.

Using `NEL,DTL,PGLRT,TEL` as the pilot argument produces 423 proposed matches:
two agencies, 26 routes, 89 station parents, 188 platform stops and 118 patterns.
TEL adds the SMRT agency and shares Stevens' `DT10` and Outram Park's `EW16`
station parents with earlier pilots. The matched patterns contain 7,748 trip
records and 14,287 pattern-date pairs. The full document accounts for all 1,124
entries, with 701 unresolved and no exclusions or ignores. Its focused subset
omits those 701 entries, including the two TEL patterns, and 34,104 pattern
dates. The normalized cumulative pilot digest is
`fafaca6f14651c35145515adef5c31d022d94b4b81dd819f1b824ef0500816ec`.

All five cumulative output files reproduce byte for byte with
`TEL,PGLRT,NEL,DTL,TEL` as well as `NEL,DTL,PGLRT,TEL`. The combined focused
draft preserves all earlier pilot decisions. Full readiness remains `unresolved`,
subset readiness remains `incomplete`, and mapping review and generation remain
blocked. The source/calendar and lineage questions remain open independently of
the supported mapping proposals.

## EWL supported patterns and platform gaps

The [EWL mapping table](gtfs-ewl-pilot-mappings.md),
[draft](gtfs-ewl-pilot-draft.json) and
[summary](gtfs-ewl-pilot-review-summary.json) add 165 proposed matches: one
agency, seventeen routes, 35 station parents, 67 platform stops and 45 patterns.
The supported patterns contain 856 source trip records and 5,893 pattern-date
pairs. Five declared route records have no trips; their line identities do not
establish observed service.

The whole EWL input has 72 patterns and 2,292 trip records. Twenty-seven patterns
containing 1,436 trips remain unresolved across 3,285 pattern-date pairs. Their
dependencies include five grouped platform records: `EW24_A` (`B / C`),
`CG_A`/`CG_B` (`D / E`) and `CG2_A`/`CG2_B` (`A / B`). The draft does not select
one physical platform from those alternatives. Six of those patterns also have
the Expo literal-label/service-direction conflict. These are overlapping
blockers, not separate populations to add together.

The supported paths retain their actual endpoints and ordered occurrences.
All supplied EWL station paths fit a canonical revision, but a station-path match
does not resolve grouped physical allocation or an explicit platform conflict.
The matched-only focused draft omits all 27 unresolved EWL patterns and five
grouped stops; it does not establish whole-line or airport-branch coverage.

Using `NEL,DTL,PGLRT,TEL,EWL` as the pilot argument produces 583 proposed matches:
two agencies, 43 routes, 120 station parents, 255 platform stops and 163 patterns.
EWL shares the existing SMRT agency and the `CG1`, `DT14`, `DT32` and `EW16`
station parents. Matched patterns contain 8,604 trip records and 20,180
pattern-date pairs. The full document accounts for all 1,124 entries with 541
unresolved and no exclusions or ignores. Its focused subset omits those 541
entries and 28,211 pattern dates, including the internal TEL and EWL gaps. The
normalized cumulative pilot digest is
`908178e46f8a0e67079c0e700ef57616ec2a5d419618a08c70efff4a35248a83`.

All five cumulative output files reproduce byte for byte with
`EWL,TEL,PGLRT,NEL,DTL,EWL` as well as `NEL,DTL,PGLRT,TEL,EWL`, and the
combined draft preserves all earlier pilot decisions. Full readiness remains
`unresolved`, subset readiness remains `incomplete`, and mapping review and
generation remain blocked. Source/calendar correctness and reviewed lineage
remain independent open conditions.

## Circle Line exact-date cells and accounting

The [CCL mapping table](gtfs-ccl-pilot-mappings.md),
[draft](gtfs-ccl-pilot-draft.json) and
[summary](gtfs-ccl-pilot-review-summary.json) add 178 proposed matches: one
agency, 47 routes, 33 station parents, 66 platform stops and 31 pattern/date
cells. Those cells cover 31 distinct source patterns, 1,098 recurring trip
records and 1,656 pattern-date pairs. Twenty-one cells use contiguous segments
and ten use cyclic segments of an explicitly closed canonical path. Source
endpoints, order and occurrences remain intact.

Every matched CCL cell uses revision `r_2026_stage_6` on its exact active dates
on or after 2026-07-12. None of the 119 CCL source patterns is matched for its
whole calendar. The 31 partially matched patterns retain 1,837 earlier unresolved
pattern-date pairs, while 88 wholly unresolved patterns retain 11,264 pairs.
The matched-only draft omits both kinds of unresolved cells; it does not truncate
or exclude the source calendars.

An unresolved date can have no effective geometry/code candidate, multiple
candidates, or a unique candidate conflicting with current undated platform
records. Those causes remain separate in the CCL review. A platform diagnostic
against current records does not independently establish historical invalidity,
and a date envelope never substitutes for the exact supplied calendar dates.

Using `NEL,DTL,PGLRT,TEL,EWL,CCL` as the pilot argument produces 749 proposed
matches: two agencies, 90 routes, 142 station parents, 321 platform stops and
194 pattern/date cells. These matched cells reference 194 distinct source
patterns and 9,702 recurring trip records, covering 21,836 pattern-date pairs.
All earlier pilot decisions are preserved.

The source still has **1,124 unique entries**, but the full draft now has
**1,155 decision cells**, because 31 patterns each have a matched cell and an
unresolved cell. Its 406 unresolved cells comprise 375 wholly unmatched source
entries and the unresolved portions of those 31 partially matched CCL patterns.
The focused draft omits 375 source entries entirely and 26,555 pattern dates,
including dates from patterns it partially matches. Complete input accounting
does not mean complete matched coverage.

The normalized cumulative pilot digest is
`9ca930840c836552508609f3acde85b6e2e2ebbbd3e592f5228ad404a74a57d8`.
All five cumulative files reproduce byte for byte with
`CCL,EWL,TEL,PGLRT,NEL,DTL,CCL` as well as `NEL,DTL,PGLRT,TEL,EWL,CCL`.
Full readiness remains `unresolved`, focused readiness remains `incomplete`,
and neither mapping review nor generation is enabled. Source/calendar correctness
and reviewed lineage remain separate open conditions.

## Remaining NSL/LRT packets and complete line inventory

The [NSL](gtfs-nsl-pilot-mappings.md), [SKLRT](gtfs-sklrt-pilot-mappings.md) and
[BPLRT](gtfs-bplrt-pilot-mappings.md) packets cover the remaining source line
families. NSL proposes four patterns (18 trip records; 417 pattern-date pairs),
retaining grouped/incomplete platform labels, terminal conflicts and three
unmatched source paths. SKLRT proposes six West patterns (1,618 records; 730
pairs), retaining all six East patterns as unresolved. BPLRT proposes 41 entity
identities with zero matched patterns or departure coverage.

Selecting all nine line IDs yields 930 matched decisions: two agencies, all 113
routes, all 186 station parents, 425 physical stops and 204 pattern/date cells.
There are 225 unresolved decisions: one unused agency, nine physical stops and
215 pattern/date cells. Thirty-one CCL patterns occur in both categories on
different exact dates. The full draft still has 1,155 decisions over 1,124 source
entries; the matched-only subset omits 194 source entries entirely and 25,408
pattern dates. Both remain ineligible for mapping review and generation.

See the [complete matrix, next decisions and reproduction command](gtfs-mapping-review-inventory.md)
for the cumulative digests and distinction between complete accounting and
matched coverage. All nine standalone packets compose without conflicting
decisions, and the cumulative output is byte-identical under line reordering
and repetition. No automatic ignore, exclusion, source repair or canonical
change is supplied.
