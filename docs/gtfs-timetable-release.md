# Timetable release readiness

`@mrtdown/fs` exports `inspectGtfsTimetableRelease(file, captureFile, options)`.
It rebuilds the artifact from verified source inputs and checks the review
records required for release. It performs no network calls or file writes.

```ts
const result = await inspectGtfsTimetableRelease(zip, captureFile, {
  ...preparationOptions,
  mappingApproval,
  releaseReview,
  currentTerms,
  releaseInstant,
});
```

`preparationOptions` are the inputs to
[verified artifact preparation](gtfs-timetable-artifact.md#preparing-and-verifying-bytes).
`releaseInstant` is an explicit ISO timestamp with timezone offset, supplied by
the publisher's clock for this attempt.

## Mapping and release review

`mappingApproval` uses the existing version-2 or version-3 scoped approval
contract. Its identity and draft hash must match the source, topology and exact
draft being rebuilt. A valid approval alone is insufficient: every source entry
and pattern/date cell must have a reviewed disposition, with no unresolved
decisions and at least one matched date. Deliberate reviewed exclusions remain
visible as unassigned trip/date coverage; they do not become canonical bindings.

`GtfsTimetableReleaseReviewSchema` and its inferred type are exported for the
separate release decision. The strict record requires:

- `schemaVersion: 1`, `documentKind: "gtfs-timetable-release-review"` and
  `decision: "release-permitted"`;
- `manifestSha256` for the exact artifact being released;
- `mappingApprovalSha256`, computed by
  `gtfsTimetableMappingApprovalSha256(mappingApproval)`;
- nonempty `reviewer`, `licenceVersion`, `obligations` and `captureConditions`;
- `reviewedAt`, an ISO timestamp between capture retrieval and this release; and
- `terms` and `effectiveAt`, described below.

The decision asserts that the reviewer has confirmed the capture-specific
conditions and recorded the applicable obligations. An `effectiveAt` timestamp
records a release embargo; `null` means the review confirmed no Effective Date
restriction. Release is permitted on or after that instant, regardless of the
service calendar's start. Reviewers must not use `null` for an unknown condition.

Changing the manifest invalidates its release review. Changing the mapping
approval's reviewer or reason also invalidates that release review, even when
the approval still binds the same mapping draft. The mapping-approval digest
covers its parsed record with recursively sorted object keys, preserving array
order and text. The release report uses the same normalization for its review
digest.

## Checking current terms

`GtfsTimetableTermsSchema` and its inferred type describe both `currentTerms`
and the release review's `terms`:

```ts
{
  licence: { reference: currentLicenceReference, sha256: licenceDigest },
  apiTerms: {
    reference: 'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
    sha256: apiTermsDigest,
  },
}
```

The publisher must freshly retrieve the terms from their trusted sources for
each publication attempt and compute these SHA-256 values from the retrieved
bytes. Reviewers record the same source identities when reviewing the terms.
Do not populate `currentTerms` by copying the earlier review. A changed URL or
digest blocks release until a new review records the version, obligations and
capture conditions. Updating only the artifact's licence link is insufficient.

The current licence reference must also match the rebuilt manifest. The
capture must carry `rights_status: "redistribution_permitted"`; its original
attribution and licence reference remain intact.

## Result and trust boundary

The result includes the prepared artifact, mapping `review`, complete `coverage`
and a `release` report with `eligible`, `blockers`, `mappingApprovalSha256`,
`reviewSha256` and `releaseInstant`. Missing review records or current terms
produce blockers. Malformed records, stale mapping approvals and invalid source
inputs throw before a result returns. The existing preparation API's optional
`mappingApproval` can report a checked mapping review independently of release.

These records are repository-review assertions, not authentication. A publisher
must obtain them from its trusted review workflow, and obtain current terms
independently. This offline inspector cannot authenticate a reviewer name or
prove that a supplied terms digest is fresh. Passing caller-controlled copies
of those inputs would bypass that trust boundary.

`generationEligible` remains `false`: readiness inspection does not publish or
enable Pages output. The local exporter below enforces readiness and retains
review and exclusion/coverage information. A public download interface must also
provide the conspicuous attribution required by the
[publication policy](gtfs-schedule-publication.md).
Consumer import still needs the separate source-lineage and correction-revision
checks in the [GTFS plan](plans/active/gtfs-static-realtime.md#phase-4-consume-scheduled-arrivals-in-mrtdown-site).

## Exporting a reviewed bundle

`@mrtdown/fs` exports `exportGtfsTimetableRelease` with the same trusted inputs
as the inspector and a new output directory:

```ts
const result = await exportGtfsTimetableRelease(zip, captureFile, outputDir, {
  ...preparationOptions,
  mappingApproval,
  releaseReview,
  currentTerms,
  releaseInstant,
});
```

It rebuilds the artifact and runs all release checks before writing anything.
A blocked release returns `exported: false` with its manifest digest, release
blockers, mapping review and coverage. Invalid inputs throw. Neither case creates
an output directory or changes an existing destination.

A successful export returns `exported: true`, the same report and
`outputDirectory`. The directory contains:

| File | Contents |
| --- | --- |
| `manifest.json` | Source provenance and exact timetable/notice hashes |
| `timetable.json` | Compact assigned timetable |
| `NOTICE.txt` | Attribution, licence links and schedule-snapshot notice |
| `mapping-draft.json` | Checked mapping decisions, including exclusions |
| `mapping-approval.json` | Approval bound to that draft and source identity |
| `release-review.json` | Release decision bound to the manifest and approval |
| `release.json` | Manifest digest, release checks, current terms identities, mapping review and full trip/date coverage |

The three artifact files retain the preparer's exact bytes. The review files
contain the parsed input records as readable JSON. `release.json` is written
last; its review digests use the normalization described above, rather than
hashing the pretty-printed review files.

The parent directory must exist. The exporter requires a new destination and
refuses an existing file, directory or symlink. It also refuses output inside the
canonical data directory, including through a parent symlink. A failed write
removes the directory it created; a cleanup failure is reported with the original
error. Keep the output private until the call succeeds: writing the bundle is
not an atomic public deployment, and a terminated process can leave partial files.

This is an offline file writer. The caller still obtains trusted review records
and freshly retrieved terms independently, supplies the recorded canonical tree,
and retains the original capture separately. The optional Pages build below adds
download-page attribution; a consuming site still needs its own source notice.

## Checking and exporting from the CLI

The CLI provides an online release check:

```sh
node packages/cli/dist/index.js --data-dir /path/to/canonical/data \
  gtfs release --file /path/to/schedule.zip --capture /path/to/capture.json \
  --config /path/to/review/config.json
```

Build it first with `npm run build:cli`. The configuration is strict JSON;
replace the commit placeholder with the full commit for the supplied canonical
tree and use the reviewed mapping's version and correction revision:

```json
{
  "schemaVersion": 1,
  "canonicalCommit": "<40-character canonical Git commit>",
  "mappingVersion": "review-v1",
  "correctionRevision": 1,
  "currentLicenceReference": "https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html",
  "draft": "mapping-draft.json",
  "mappingApproval": "mapping-approval.json",
  "releaseReview": "release-review.json"
}
```

Review-file paths resolve relative to the configuration file; command-line paths
resolve relative to the working directory. The approval and release-review paths
are optional for a preflight check, which reports their absence as blockers. The
command creates no approvals and does not authenticate the supplied records.
Obtain them from the trusted review workflow described above.

Each attempt downloads both terms documents from the fixed official LTA URLs,
requests cache bypass, rejects redirects, and hashes the received bytes. A
download failure, empty document, response over 2 MiB or 30-second acquisition
timeout stops the attempt. The CLI accepts only the licence reference shown
above; changed references require an explicit implementation and review update.
Configuration cannot supply `currentTerms` or `releaseInstant`: the command uses
the newly acquired identities and its clock. The JSON report includes both terms
identities for comparison with the reviewed records. Downloaded terms bodies
are not stored by this command, and matching hashes alone do not approve terms.

Without `--out`, the command writes only a JSON report to stdout. Add
`--out /path/to/new-bundle` to request the seven-file bundle described above. Both
modes exit 1 when release is blocked and exit 0 when eligible. Invalid input or
download failures exit 1 with an error on stderr. `exported` becomes `true` only
after the complete bundle is written; a successful check without `--out` reports
`exported: false`. The command rejects `--write` and never saves a report file
implicitly. Its output-directory rules are the same as the offline exporter.

Existing GTFS inspection and timetable commands remain offline. This command
provides local release tooling; it does not publish to Pages or the consuming site.

## Packaging a release for Pages

The Pages builder can include a reviewed timetable alongside the canonical
archive. Supply all three GTFS inputs explicitly, using the same configuration
as `gtfs release`:

```sh
npm run pages:build -- \
  --data-dir /path/to/canonical/data --out-dir /path/to/pages-output \
  --gtfs-file /path/to/schedule.zip --gtfs-capture /path/to/capture.json \
  --gtfs-config /path/to/review/config.json
```

Builder paths resolve relative to the repository root. Keep the ZIP, capture,
configuration and referenced review files outside the output directory. The
builder stages a copy of the canonical data, validates and applies the existing
public-export rules, then runs the release command against that exact copy.
The mapping's topology fingerprint and references must therefore match the
canonical data being archived. Current terms are fetched for this attempt;
existing bundle files or earlier readiness reports cannot authorize it.

A missing approval, mismatched topology, changed terms or invalid source blocks
the build. Failed staging is removed and the previous output is preserved. The
completed build replaces the output only after canonical and fixture exports,
timetable files and archives have been prepared. This is a local artifact build;
deployment still uses the separate Pages workflow.

The reviewed seven-file bundle appears under `scheduled-timetable/` in the
Pages output and both root archives. The root version-2 `manifest.json` gains an
optional `scheduledTimetable` entry, validated by
`ScheduledTimetablePagesEntrySchema` from `@mrtdown/core`. It contains:

- `manifestSha256`, the exact digest of `scheduled-timetable/manifest.json`;
- `releaseSha256`, the exact digest of `scheduled-timetable/release.json`;
- the verified `capture`, provider-declared `feedRange` and current licence link;
- `coverage`: source, assigned and missing trip/date counts.

The release report retains the full review and exclusion/coverage information;
the timetable manifest binds the timetable and notice bytes and records the
source, mapping and canonical topology identity. Consumers need a trusted root
index before relying on its digests. These hashes do not establish source
ordering or replace the import checks in the GTFS plan. Artifact bytes remain
deterministic; the release-attempt report records the current check time.

The download page shows LTA attribution and the current licence beside archive
and timetable links. It also shows retrieval time, declared calendar bounds,
coverage gaps and MRTDown's separate contribution licence, and labels the output
as an independently mapped schedule rather than live predictions.

Without GTFS flags, the build stays offline and omits timetable files, index
entries and links. The fixture export never receives the real timetable. A stray
`scheduled-timetable/` directory under source data is excluded from copying; only
the checked exporter creates that reserved output. Current deployment workflows
do not pass GTFS inputs, and real mapping and release approvals remain outstanding.

Against the retained October capture and full version-3 draft, inspection
preserved the existing artifact digests and 1,502,097 assigned / 990,143 unassigned
trip/date pairs. Release remained blocked by incomplete mapping review, missing
current terms and a missing release review. No approval assertions were created.
Running the exporter against those same inputs returned `exported: false`,
preserved the manifest digest and coverage counts, and created no output files.

On 2026-10-21, the CLI reacquired that same hash-verified public capture and
fetched both current terms documents. It preserved the manifest digest and
coverage counts, reported incomplete mapping review and a missing release review,
and created no bundle when invoked with `--out`. Fetching current terms did not
create a release approval.

The Pages build was also checked with these real inputs. It refused the release,
preserved the previous output and removed its temporary staging directory.
