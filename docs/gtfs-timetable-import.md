# Scheduled timetable import checks

`assessScheduledTimetableSourceChange` from `@mrtdown/core` checks whether a
candidate's source may follow an installed timetable. It keeps an unreviewed
or conflicting replacement out of the source lineage. It does not install files
or mark a timetable ready for departures.

First use `verifyScheduledTimetableArtifact` from `@mrtdown/fs` with an
independently trusted manifest digest to verify each artifact and its companion
bytes. Pass `{ manifestSha256, manifest }` as `candidate`, the already admitted
artifact as optional `incumbent`, and the consuming workflow's trusted
`importInstant`. The optional `review` must come from a trusted review workflow;
a reviewer name in downloaded JSON does not authenticate a decision.

The result contains `sourceEligible`, `action`, `blockers`, `providerVersion`,
`retrievedAt` and `importInstant`. A blocked candidate has `action: null`; the
caller preserves its incumbent. Malformed inputs throw. The helper is pure and
cannot change either artifact or the installed selection.

## Establishing source order

No monotonic LTA version semantics are configured. The helper retains the raw
`feed_version` and explains why its ordering is unproven, including when it is
absent. Neither a later retrieval nor a numerically larger version promotes a
snapshot automatically.

`ScheduledTimetableSourceReviewSchema` describes a strict review record:

- `schemaVersion: 1` and `documentKind: "scheduled-timetable-source-review"`;
- `decision`: `baseline`, `successor`, `correction` or `resolve-version-conflict`;
- `predecessor` and `successor`: each contains both `manifestSha256` and
  `snapshotSha256`, the source ZIP digest; only a baseline has a null predecessor;
- `reviewer`, `reviewedAt` and `reason`.

The first snapshot requires a baseline review. A different source ZIP requires
a successor review bound to both artifacts and both source digests. Equal,
nonempty provider versions with different ZIP digests require the explicit
`resolve-version-conflict` decision. An ordinary successor review cannot clear
that conflict. A review for another artifact cannot be reused.

For the same source ZIP, an edited artifact requires a `correction` review and a
strictly higher integer `correctionRevision`. Equal or lower revisions are
blocked. Source table hashes, raw feed fields and declared feed dates must remain
consistent with the incumbent; a correction changes MRTDown's derived result,
not the original source. The exact same manifest digest is an idempotent
`unchanged` result and needs no new source review.

The candidate must retain exactly one feed-info row with explicit start/end
fields matching its validated manifest range. Its retrieval time may be at most
300 seconds ahead of import time. Reviews must occur after acquisition and no
later than import time. There is no static capture-age cutoff. The current
capture contract has no provider publication timestamp; a future extension
requires its own validation and documented ordering semantics.

## Checking installed canonical data

`verifyScheduledTimetableForCanonicalData` from `@mrtdown/fs` verifies the
manifest, timetable and notice bytes against an independently trusted manifest
digest, then checks them against `{ dataDir }`. The canonical tree must remain
stable for the duration of the read.

```ts
const verified = await verifyScheduledTimetableForCanonicalData(
  manifestBytes,
  trustedManifestSha256,
  { timetableBytes, noticeBytes },
  { dataDir },
);
```

The result contains `manifest`, `timetable` and the installed `topology`
fingerprint. Invalid bytes, schemas, fingerprints or canonical allocations throw
before any result is returned. The helper writes no files. Matching topology is
required even when the source manifest records a different canonical commit;
unrelated canonical edits do not require rebuilding the timetable.

Every stored pattern must reference an existing line, service, revision,
station and every declared platform alternative. Each assignment must follow the service's
ordered path, use an effective revision and station codes on every assigned
service date, and respect platform boarding restrictions. All existing
reference and path validators are reused. Exact source timing, textual ids,
platform alternatives and timing precision remain unchanged.

Assignment range bounds are inclusive and must lie within the manifest's feed
range. Both endpoints must be active source dates. The importer intersects each
range with its trip's own calendar, applying added and removed dates before
validating canonical periods. An inactive day between the endpoints is not an
assigned date. Calendar expansion is cached once per source calendar; weekly
spans over 100 years are rejected, matching the existing reconciliation limit.

This is canonical compatibility checking. The compact artifact lacks the raw
source stop/route tables needed to repeat the producer's source correspondence
checks, so trusted provenance and release review remain separate requirements.
Pass the verified manifest and its trusted digest to the source-admission helper
above before considering installation. Neither helper supplies review authority
or turns a local proposal into an approved public release.

## Remaining import work

A positive source result is only one prerequisite. The consumer still needs
release/provenance checks,
complete mapping coverage for the requested scope, date eligibility, atomic
storage and retained version history. It must select from that history for each
service date and scope, including older eligible versions and explicitly scoped
rollback decisions. Calling this pairwise helper with an arbitrarily chosen
incumbent does not validate a complete lineage or authorize a rollback.

Site archive integration, departure selection and API/UI provenance remain in
[Phase 4 of the GTFS plan](plans/active/gtfs-static-realtime.md#phase-4-consume-scheduled-arrivals-in-mrtdown-site).
This check creates no real mapping, source or release approvals and does not
enable GTFS in the default Pages build.
