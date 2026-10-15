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
  canonical service-revision paths. Exact paths and contiguous short workings
  are candidates. Historical revisions are retained for review; calendar/revision
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

## Current public capture findings

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

A second distinct schedule capture and normalized drift comparison remain open.
Reusing the same content-addressed capture establishes repeatability only;
it does not establish provider ID stability across releases. This foundation
also does not finish Phase 2: actual reviewed dispositions and the remaining
semantic comparisons are required before Phase 3.
