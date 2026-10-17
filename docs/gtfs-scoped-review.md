# Scoped GTFS mapping draft and review contract

The version-2 draft turns verified reconciliation candidates into concrete,
reviewable mapping proposals. The checked-in pilots cover NEL, DTL, PGLRT and
supported TEL patterns, retaining unresolved TEL patterns explicitly in the review.
Neither the pilots nor the full generated draft is approved or eligible for
generation. Proposal and review schemas version 1 remain unchanged.

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
