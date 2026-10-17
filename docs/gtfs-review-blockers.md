# GTFS review blockers

The optional blocker report explains explicit unresolved mapping cells using
exact dates, source trips, dependencies and ordered stop occurrences. It supports
both version-2 and version-3 drafts and keeps the original mapping decisions and
approval gates intact. It is an investigation aid, not a mapping review or a
source correction.

## Generate and inspect

Materialize the [verified source and receipt](gtfs-public-handoff.md), then run:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-review-with-blockers \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba \
  --platform-groups --blockers
```

`--blockers` adds `blockers.json` and its file digest to `summary.json`. The four
mapping/evaluation files remain byte-identical. Without this flag, all five
existing version-2 or version-3 outputs remain byte-identical. The flag also works
without `--platform-groups` for a version-2 diagnosis. Large reports stay outside
Git and reproduce from the pinned inputs.

Useful queries against the generated file:

```sh
jq '.countsByCode' /tmp/new-review-with-blockers/blockers.json
jq '.entities[] | select(.providerId == "NS16_A")' \
  /tmp/new-review-with-blockers/blockers.json
jq '.patterns[] | select(.routeId | startswith("BP")) |
  {providerId, tripIds, dateScopes, candidateEvidence}' \
  /tmp/new-review-with-blockers/blockers.json
```

The public `buildScopedReviewBlockers(context, draft)` helper verifies the
version-specific draft before deriving evidence. A changed input identity,
source-record digest, forged target, overlapping date cell or stale date-set hash
fails instead of producing a plausible report. As with the scoped evaluator,
callers must supply verified source tables and canonical topology; the runner
verifies the capture and canonical data tree before calling the helper.

## What the report means

The report binds the complete input identity and normalized `draftSha256`.
Explicit unresolved entity rows retain the source-record digest, proposal reason,
reported candidates and unmatched parent/agency dependencies. Platform evidence
retains the literal source label and each label's canonical candidates within
the source-code line. Empty member lists expose missing representation; multiple
members expose ambiguity. Complete groups are represented as alternatives.

Each unresolved pattern cell retains its original date-set ID, source-record
digest, route/calendar, complete trip-ID list, ordered stop-ID list and unmatched
route/agency/recursive-stop dependencies. Its exact `dateScopes` partition only
the unresolved dates in that cell by investigation causes and candidate checks:

| Code | Meaning |
| --- | --- |
| `no-path-candidate` | The ordered source pattern has no canonical service-revision path candidate. This alone does not prove the provider is wrong. |
| `temporal-gap` | No path candidate covers these actual source dates under revision and station-code periods. A pattern with no path also has this cause. |
| `temporal-ambiguity` | Multiple candidates cover these exact dates; every candidate is retained. |
| `unmatched-dependency` | At least one required entity is missing, unresolved or explicitly ignored in this draft. |
| `outside-pilot` | The proposal pilot does not include this scope; this is not a source defect. |
| `current-platform-diagnostics` | At least one temporal candidate fails current platform/date/boarding diagnostics. Per-candidate flags retain which candidates fail. |
| `group-member-diagnostics` | A version-3 candidate fails the every-member group check even if another alternative is usable. |
| `operator-period` | The matched route/agency identity is incompatible with its line's operator period on these dates, independently of whether any temporal path candidate exists. Missing identities are reported as dependencies, not as an asserted operator-period failure. |
| `review-required` | The unresolved disposition remains despite no other reported cause. This does not approve it. |
| `empty-cell-review-required` | An explicit unresolved cell claims no dates although the source calendar is active. Its unclaimed source dates remain in `missingPatternDates`. |
| `empty-calendar-review-required` | An explicit unresolved pattern has no active dates; the report does not invent dates or silently change its disposition. |

Entity-only codes include `unused-agency`, `no-entity-candidate`,
`ambiguous-entity`, `malformed-platform-label`,
`incomplete-or-ambiguous-platform-group`, and `platform-group-requires-v3`.
The last code applies only to complete alternatives left unresolved under v2.
Absent platform codes have no literal members and are not classified as malformed
labels. Platform evidence applies only to physical platform rows (empty or zero
`location_type`), not entrances, generic nodes or boarding areas. Supplied labels
with empty slash-separated members or duplicate members remain malformed.

`candidateEvidence` retains every geometric candidate, including those with no
eligible date in this cell. Its revision periods and occurrence-level platform
options distinguish current restrictions, excluded service scopes and pickup /
drop-off behavior. `initial`, `intermediate`, `final` and single-stop `initial-and-final` roles
describe position only; they do not grant a terminal exception. Repeated stops stay separate.
A represented version-3 group is included at its occurrences. Candidate evidence
counts cover the whole source pattern's calendar; exact cell applicability comes
from `dateScopes`. Current undated platform records do not prove historical
allocations.

`countsByCode` counts each entity/cell once per code, and each unresolved
pattern-date pair once per applicable code. Causes overlap: **do not sum rows**
as independent populations. Missing entries and pattern dates are returned
separately from explicit unresolved cells, including for an incomplete focused
draft. Both `mappingReviewEligible` and `generationEligible` remain false even
when a report has no unresolved rows.

## October all-line investigation

For the [grouped-platform proposal's pinned inputs](gtfs-platform-group-review.md#october-snapshot-proposals),
the report accounts for 191 unresolved decisions: unused `LTA`, incomplete
`NS16_A` / `NS16_B`, and 188 pattern/date cells. Those pattern cells cover 157
wholly unmatched patterns and unresolved portions of 31 partial CCL patterns,
containing 22,123 unresolved pattern-date pairs. It produces 276 diagnostic date
scopes without expanding the calendars to dates the source does not enable.

| Investigation cause | Pattern cells | Pattern-date pairs |
| --- | ---: | ---: |
| No path candidate | 5 | 469 |
| Temporal gap, including the five no-path cases | 81 | 5,843 |
| Temporal ambiguity | 30 | 2,526 |
| Current platform diagnostics for at least one temporal candidate | 121 | 10,196 |
| Unmatched dependencies | 46 | 6,154 |

The two Ang Mo Kio rows retain empty C/D member lists. Every BPLRT candidate
retains conflicts at occurrences 0 and 18, so removing the final Choa Chu Kang
occurrence would still leave the initial conflict. The five no-path cells retain
all 17 source trip IDs and their original stop order. These observations make
review scope concrete; they do not resolve the
[station-specific evidence requirements](gtfs-mapping-disagreements.md).

The reproduced `blockers.json` SHA-256 is
`6fa3e51e40c58d6b4080b39e02bdb768100740dd67968f870d529194225ae816`
(4,216,093 bytes). The full draft retains normalized digest
`3811b7debc2cfe9895b218bd4ca6f04bb836b4c945edcf976d9213672caf2059`.
All six outputs reproduce byte for byte with reordered/repeated pilot IDs.
