# GTFS static reconciliation proposals

Phase 2 can prepare mappings while Phase 1 audits historical inputs. This tooling
produces deterministic proposals and validates explicit review coverage. It does
not write canonical entities, generate arrivals, or approve its own proposals.

## Run against a verified public capture

Build the package, materialize the ZIP and matching receipt using the
[public handoff](gtfs-public-handoff.md), then run:

```sh
npm run build:fs
node scripts/reconcile-gtfs-schedule.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json \
  /tmp/new-reconciliation.json
```

The script uses this checkout's canonical `data` directory, requires it to match
HEAD (including no untracked data files), records the full HEAD commit, and
refuses to overwrite the output. It verifies the receipt's feed kind, source,
archive SHA-256 and byte length before reading the schedule. Structural errors
block proposals. No network or model calls occur in this command.

The exported `reconcileGtfsCapture` helper accepts the canonical commit from its
caller; callers other than this script must independently verify that the data
tree belongs to that exact commit.

## Artifact and review contract

`ReconciliationReportSchema` defines schema version 1. Identity contains the
complete sorted per-table SHA-256 manifest, full canonical Git commit, and
versioned schedule-topology fingerprint. The fingerprint is checked against the
actual normalized canonical projection before reconciliation. No timestamp or
local path enters the report. Given identical inputs, output is byte identical.

Each entry records provider kind/id, a normalized source-record digest, candidate
canonical targets, rationale and one of `proposed`, `ambiguous`, or `unresolved`.
Even a unique proposal is unreviewed. Entries cover every agency and route,
every stop used by stop times and its recursive station parents, and every
normalized trip pattern. Unreferenced entrances are outside arrivals scope.
Canonical lines absent from the schedule are listed separately; absence does
not establish that a canonical future line is an error.

Candidate rules are deliberately limited:

- Agency aliases: SMRT to SMRT_TRAINS; SBST to SBS. LTA has no automatic operator
  match. Its publisher role needs an explicit disposition even if no route uses it.
- Route families: NSL, EWL, NEL, CCL, DTL, TEL, BP, SK and PG have explicit line
  aliases. Provider route suffixes are not canonical service identities.
- Stations: exact canonical station codes with consistent provider parent codes.
  Names and coordinates never establish a match. Effective-date validity needs review.
- Platforms: parent/code-consistent station, code-associated line and an explicit
  matching canonical platform label. A provider label such as `A / D / E` may
  produce multiple candidates; a provider stop-id suffix does not resolve it.
- Patterns: compare ordered station occurrences, including repetitions, with
  canonical service-revision paths. Exact paths, contiguous short workings and bounded cyclic segments of
  explicitly closed paths are candidates. Historical revisions are retained for review; calendar/revision
  effective dates, direction, platform service restrictions and loop/branch
  semantics are not inferred or approved by sequence matching alone.

`ReconciliationReviewSchema` defines a separate version 1 review artifact. Copy
its identity from the proposal report. Every decision must include `kind`,
`providerId`, `sourceRecordSha256`, `disposition` (`matched` or `ignored`),
`reviewer` and a substantive `reason`. A match also names a `target` copied from
that entry's candidates. An ignored record must not include a target.
An unresolved record can receive a reviewed ignore disposition; adding a missing
canonical match requires fixing or extending the candidate rules and regenerating
the report rather than injecting an arbitrary target.

`checkReconciliationReview(report, review)` rejects missing, duplicate, unknown
or changed entries, identity changes and targets outside the reported candidates.
Its `generationEligible` result is only the mapping-review gate. Independent
validation, source rights, feed/calendar validity and publication contracts remain
separate prerequisites for any future generator. An ignored scope must be omitted
from generated coverage; it cannot be silently treated as a matched service.
The unreviewed proposal always has `generationEligible: false`.

Review records are assertions by the named reviewer, not authenticated signatures.
Keep them under normal repository review before consuming them. No real capture
has received human-reviewed mappings in this change.

## Initial public capture proposals

The 2026-10-14 proposal audit used public schedule SHA-256
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
and canonical commit `e66b6bcd2f976de0619be191970df22b5414ca2a`.
Topology projection v1 SHA-256 was
`e376c280fbd6292ed6fe03e7fa81541ad0b0b8c76a09f916f1e3898aac240ec1`.
The verified input had no built-in structural errors. The report contained 1,124
entries, with these unreviewed dispositions:

| Kind | Unique proposal | Ambiguous | Unresolved |
| --- | ---: | ---: | ---: |
| Agency | 2 | 0 | 1 |
| Route | 113 | 0 | 0 |
| Referenced stop or parent | 613 | 7 | 0 |
| Trip pattern | 208 | 148 | 32 |

CRL and JRL were absent from the provider schedule. The seven ambiguous stop
entries include grouped platform labels; they cannot be resolved from a suffix
or station name. Pattern candidates can span historical revisions or services,
and the 32 unmatched patterns need targeted topology/loop/short-working review.
These counts are proposals, not reviewed coverage. Generation remains blocked.
Generated full reports and raw inputs stay outside Git.

The subsequent evidence and drift audit below compares the verified August and
October schedules. Actual reviewed dispositions and the remaining semantic
reconciliation are still required before Phase 3.

## Calendar, platform and drift evidence

Produce proposals, detailed review evidence, a normalized two-capture comparison
and an aggregate summary in a fresh directory:

```sh
npm run build:fs
node scripts/audit-gtfs-reconciliation.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json \
  /absolute/path/gtfs_schedule /tmp/new-gtfs-reconciliation \
  --canonical-commit bad418205203dceac0002ebd0369f20c824b1538
```

The optional full canonical commit defaults to HEAD. The script requires clean
canonical data, verifies that the selected commit exists and that its complete
`data` tree equals the checkout, verifies the public ZIP/receipt, and verifies
every historical table against the recorded August manifest. It performs no
network or model calls. An older recorded commit permits byte-identical audit
reproduction from newer tooling only while the canonical data tree still matches.

`buildReconciliationEvidence` expands each calendar in UTC with inclusive GTFS
start/end dates and applies additions/removals, including exception-only service.
It compares those dates with canonical revision and station-code periods using
inclusive starts and exclusive ends. Calendars longer than 100 years and invalid
civil dates are rejected. The evidence preserves provider direction values and
ordered stop occurrences; a direction number or route-name suffix never selects
a canonical direction. Platform checks report explicit service-scope exclusions,
unspecified scope, boarding status and source pickup/drop-off rules per occurrence.
A terminal service-scope mismatch is retained for review: an arrival at a turnaround
platform does not by itself establish a canonical boarding error. Unspecified
platform scope is not evidence of service permission.

Closed canonical paths now permit a rotated single circuit or shorter cyclic
segment, labelled `cyclicSegment`. The canonical path must explicitly repeat its
first station at its end; order and repeated station occurrences are preserved.
Open paths cannot wrap and multiple circuits are not inferred. This explains 27
previously unmatched CCL patterns, without deciding their calendar applicability.

The evidence is **agent-proposed, pending human review**. It is deliberately not
a `ReconciliationReviewSchema` artifact and always records `generationEligible:
false`. A unique date-compatible sequence is a review aid. It does not resolve
an ambiguous physical platform, prove source correctness, approve a mapping or
satisfy the other publication gates. Full reports remain outside Git; the checked-in
[aggregate audit](gtfs-reconciliation-audit.json) records identities and digests.

## Evidence-backed dispositions for the October capture

The audit uses the same public capture and topology fingerprint as above, with
canonical commit `bad418205203dceac0002ebd0369f20c824b1538`. Its 1,124 entries
contain 222 unique pattern proposals, 161 ambiguous patterns and five patterns
without a sequence candidate. All seven grouped-platform stops remain ambiguous.
The following are proposed dispositions, not human-reviewed decisions:

| Scope | Evidence and proposed disposition |
| --- | --- |
| LTA agency | No route references LTA; propose an explicit ignored publisher disposition. SMRT owns 101 routes and SBST owns 12; retain their operator alias proposals. |
| `CG2_A`, `CG2_B` | Both name `A / B` at Changi Airport, and both canonical platforms list both airport services. Defer physical-platform selection. |
| `CG_A`, `CG_B` | Both name `D / E` at Tanah Merah; both canonical platforms list both airport services. Defer selection. |
| `EW24_A` | Jurong East labels `B / C` both list the same eastbound service. Defer selection. |
| `NS1_A`, `NS1_B` | Jurong East labels `A / D / E` all list both NSL services. Defer selection. |
| 242 patterns | Exactly one sequence candidate covers every active service date and has no explicit platform-scope/boarding conflict. Propose that candidate for human review; grouped platform identity remains a separate gate. |
| 119 CCL patterns | Sequence candidates exist, but none covers all 2026 calendar dates. Historical main/extension revisions end on July 12; branch/loop revisions start then. Defer date-scoped dispositions. |
| 22 patterns | A date-compatible sequence exists but platform service scope disagrees: six BP, six airport EWL, six SK and four NSL patterns. Defer reconciliation; identify the owning source before correcting either side. |
| Five unmatched patterns | Retain unresolved, as detailed below. Do not discard stops or reverse a path to manufacture a match. |

The BP disagreement includes Choa Chu Kang platforms 1/2 versus canonical
service A/B restrictions. The SK disagreement concerns east-loop platform 1/2
service restrictions. The EWL disagreement concerns Expo's changed platform labels.
The four NSL scope disagreements occur at the final `NS28_A` occurrence only;
review terminal arrival versus boarding semantics before interpreting those as errors.
These are separate from both validators' structural findings.

The five unmatched patterns represent 17 trips:

- `NSL_NS13_NS28`, weekday and Saturday: one trip each jumps directly from
  `NS13_B` to `NS18_B`, omitting intervening canonical stops.
- `NSL_NS16_NS1`, Sunday calendar: one trip begins `NS16_A, NS20_A, NS21_A,
  NS20_A` before returning along the northbound path. Preserve the repetition
  and order as supplied.
- `TEL_TE1_TE29`, Saturday and Sunday calendars: seven trips each omit `TE22_A`
  between `TE20_A` and `TE23_A`.

The October feed has only the three all-year weekday/Saturday/Sunday calendars
and no calendar exceptions. The `SERVICE_PH` name therefore cannot be interpreted
as an independently verified public-holiday calendar. The 119 CCL cases also
expose a review-format limit: one whole-pattern target cannot express different
canonical services/revisions on opposite sides of July 12. Resolve with reviewed
service-date scope or an explicitly narrowed coverage window before generation;
neither choosing the latest revision nor ignoring a historical conflict is sufficient.

## Observed August–October drift

`compareScheduleSnapshots` compares validated tables using primary/composite IDs
for agencies, routes, stops, trips, calendars, calendar exceptions and stop times.
Other tables use complete normalized row identity. Normalization sorts rows and
column keys, canonicalizes numeric `stop_sequence`, and pads GTFS hour fields;
all other cell values remain exact. Duplicate normalized identities fail rather
than overwrite a record. Reports include per-category counts, normalized content
and change-set digests, changed-field totals and at most ten changed-ID examples.
Callers of this pure helper must verify raw inputs/manifests before supplying them.

| Table | Retained unchanged | Retained changed | Added | Removed |
| --- | ---: | ---: | ---: | ---: |
| Agencies | 3 | 0 | 0 | 0 |
| Routes | 3 | 0 | 110 | 16 |
| Stops | 1,209 | 2 | 0 | 0 |
| Trips | 6,455 | 837 | 11,858 | 10,284 |
| Calendars | 3 | 0 | 0 | 8 |
| Calendar exceptions | 0 | 0 | 0 | 3 |
| Stop times (trip + sequence) | 76,744 | 0 | 273,024 | 256,518 |

The two retained stop IDs with changed content are Expo `CG1_A` (`A` to `B`)
and `CG1_B` (`B` to `A`). This directly disproves treating a stop-ID suffix as a
physical platform label. All 837 changed retained trip records change calendar
assignment. ID retention alone is insufficient for reusing their prior semantics.

Both captures retain the same `feed_info.txt`, including version `0.1`, despite
substantial differences. This pair supplies no monotonic provider-version ordering.
The comparison's before/after labels name the supplied August and October captures;
they do not establish an authoritative source lineage or approve October as its
successor. A separate reviewed lineage decision remains necessary. Two captures
also do not establish future ID stability, even for the 1,211 retained stop IDs.

## Service-date candidate scopes

The audit command now emits evidence and aggregate **version 2**, adding exact
service-date partitions. The proposal and mapping-review schemas remain version 1
and unchanged. The earlier [version-1 aggregate](gtfs-reconciliation-audit.json)
is preserved; its report digests can be reproduced with implementation commit
`b5b6a5470535ffdd2e6b27bf115fb8794b017d10` and its recorded canonical commit.
The [scoped aggregate](gtfs-scoped-reconciliation-audit.json) records version-2
report digests for the same verified inputs and canonical data. Full exact date
lists remain in external `evidence.json`, not the checked-in aggregate.

`partitionScopedCandidates(activeServiceDates, candidates)` accepts each target
and its exact candidate dates. It partitions ordered active dates whenever the
complete candidate set changes. Every scope retains all targets, authoritative
`serviceDates`, inclusive `startDate` and exclusive `endDateExclusive`. Bounds
are only an envelope: weekend gaps or removed service dates inside that envelope
must never be interpreted as service. Scope status `unique` means exactly one
candidate, `ambiguous` retains every overlapping candidate, and `gap` retains
an active date with no target. The module rejects invalid/duplicate dates,
out-of-calendar candidate dates and duplicate target identities. Reordering input
dates, candidates or target properties produces byte-identical output.

Each pattern has two independent partitions:

- `dateScopes` intersects the source's actual active calendar dates with each
  sequence candidate's canonical revision and station-code validity at every
  ordered stop occurrence. Different sides of a July boundary can retain
  different candidates. A later revision never fills a date before its start.
- `platformDiagnosticScopes` adds the **current, undated** canonical platform
  service/boarding restrictions. Validity and those diagnostics must hold on
  the same platform option at each occurrence; satisfying each condition via
  a different alternative is insufficient. This is a diagnostic lens, not
  evidence of historical platform assignments or permission. Unspecified scope
  and terminal arrival semantics still require review.

Both partitions always record `generationEligible: false`. They do not resolve
physical platform allocation, approve a mapping or act as a scoped review
artifact. Grouped GTFS platform labels may intentionally represent alternative
platforms; a future reviewed contract may need a platform set or unknown
allocation rather than choosing one physical platform. The current mapping
contract does not express that, so its existing generation gate remains closed.
See the [mapping disagreement queue](gtfs-mapping-disagreements.md) for source
traces and the limits of the available operator evidence.

For the 119 CCL patterns lacking one whole-pattern date-valid target:

| Temporal evidence after partitioning | Patterns |
| --- | ---: |
| Exactly one candidate on every active date | 26 |
| At least one active date with no candidate | 76 |
| At least one active date with multiple candidates | 30 |

The gap and ambiguity categories overlap. Their 14,757 pattern-date pairs divide
into 6,857 unique, 2,526 ambiguous and 5,374 uncovered pairs. These count calendar
dates for normalized patterns, not trips or distinct system-wide dates. Across
all 388 patterns, 290 have unique temporal coverage throughout, 81 retain a gap
and 30 retain ambiguity. This explains some apparent whole-pattern ambiguity
without masking pre-opening loop gaps or choosing between overlapping services.

Current platform diagnostics do not validate historical operation: all 119 CCL
cases still have dates without a candidate under that separate diagnostic lens.
Retain those observations without assuming today's restrictions applied before
July. Human review, a contract capable of recording date-scoped decisions,
physical-platform allocation, source lineage and all other generation gates
remain required before scheduled arrivals can be generated.
