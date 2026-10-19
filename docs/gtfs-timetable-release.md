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
enable the Pages exporter. That future integration must require `release.eligible`,
retain review and exclusion/coverage information, and provide the conspicuous
attribution required by the [publication policy](gtfs-schedule-publication.md).
Consumer import still needs the separate source-lineage and correction-revision
checks in the [GTFS plan](plans/active/gtfs-static-realtime.md#phase-4-consume-scheduled-arrivals-in-mrtdown-site).

Against the retained October capture and full version-3 draft, inspection
preserved the existing artifact digests and 1,502,097 assigned / 990,143 unassigned
trip/date pairs. Release remained blocked by incomplete mapping review, missing
current terms and a missing release review. No approval assertions were created.
