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

## Reading a Pages bundle

For the optional timetable in a Pages archive, use
`readScheduledTimetablePagesBundle` from `@mrtdown/fs`. Supply the
`scheduledTimetable` entry from an independently trusted root manifest and a
callback that reads exact bytes at repository-relative archive paths:

```ts
const bundle = await readScheduledTimetablePagesBundle(
  rootManifest.scheduledTimetable,
  (path) => readArchiveBytes(path),
);
```

An absent entry returns `null` without reading files. An advertised bundle must
contain all seven published files under `scheduled-timetable/`. Missing files,
invalid UTF-8/JSON, damaged bytes or inconsistent review records throw. Keep the
archive stable while reading it; do not decode and re-encode its JSON files
before verification.

The reader checks the manifest and release report against their root-manifest
digests, verifies timetable and notice bytes, and compares capture, feed range,
licence and coverage with the advertised entry. It verifies the draft and
approval identities, normalized review digests, reviewed terms and review timing.
The authenticated release report must record eligible publication, completed
mapping review and no blockers. Both supported mapping formats are accepted.

The result includes parsed timetable, manifest and reviews, plus exact
`manifestBytes`, `timetableBytes` and `noticeBytes` for the retained importer.
It does not install anything, fetch fresh terms or repeat the original ZIP's
producer checks. Trust comes from the root manifest's authenticated publication
channel, not from reviewer names inside the archive. A deployment must still
validate installed canonical data and supply its separate source-lineage review
to `importScheduledTimetableArtifact`; release permission does not establish
source order. The site pull and database read model are not wired yet.

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
station and every declared platform alternative. Each assignment must follow
the service's ordered path, use an effective revision and station codes on every
assigned service date, and respect platform boarding restrictions. All existing
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

## Retaining imported versions

`importScheduledTimetableArtifact` from `@mrtdown/fs` combines byte verification,
canonical compatibility and reviewed source admission with an append-only local
store. Create a dedicated, private store directory first. It must already exist
and must neither contain nor sit inside the canonical data tree; real paths are
checked so aliases do not bypass this boundary.

```ts
const result = await importScheduledTimetableArtifact(
  { manifestBytes, timetableBytes, noticeBytes },
  trustedManifestSha256,
  { storeDir, dataDir, importInstant, sourceReview },
);
```

The workflow supplies the trusted manifest digest, current import time and
authenticated source review. Inputs are copied before asynchronous work. The
canonical tree must remain stable throughout the attempt. The importer chooses
the predecessor from its recorded history; callers cannot substitute an older
incumbent to bypass source ordering. A new import time cannot precede that predecessor.

A committed version is a directory named by its manifest digest, containing the
exact `manifest.json`, `timetable.json` and `NOTICE.txt` bytes plus `import.json`.
The strict `ScheduledTimetableImportRecordSchema` records the manifest digest,
predecessor digest (null for the baseline), trusted import time and source review.
It does not change capture timestamps, provider versions or correction revisions.

The importer holds an exclusive `.import-lock` while reading history and writing.
Another writer receives `EEXIST` and must retry later. All four files are written
in a unique `.pending-` directory on the same filesystem. One rename to the
manifest digest commits the version; readers ignore pending directories and see
only complete commits. There is no separate mutable head pointer. A normal write
failure removes that attempt's staging and lock while preserving older versions.
This provides atomic visibility, not a guarantee against power-loss data loss.
After a process crash, an operator must inspect leftover staging/locks before
removing them; the importer never guesses that another writer is dead. If cleanup
fails after the commit rename, inspect history to determine the committed outcome.

Successful imports return `imported: true`, the source-admission `action` and
`version`. A blocked source returns `imported: false`, `action: null` and
`blockers`; malformed input, damaged bytes, canonical mismatch, invalid stored
history and filesystem failures throw. These attempts do not replace committed
versions. Reimporting an already retained digest checks compatibility and stored
bytes, returns `action: "already-retained"`, and leaves its original receipt and
the history order unchanged. Returning to an earlier source ZIP with a different
artifact is blocked; an older timetable cannot be appended as a fresh successor.

`readScheduledTimetableHistory(storeDir)` returns metadata in reviewed lineage
order. It verifies manifest digests, import records and source decisions, rejecting
forked, cyclic, incomplete or inconsistent history. It does not load all timetable
bodies. `readRetainedScheduledTimetable(storeDir, manifestSha256)` additionally
checks that version's companion bytes and content schema before returning its
timetable. Pass a third argument `{ dataDir }` to also recheck canonical
compatibility when loading a retained version. Neither read chooses a service
date or repairs damaged files. Committed directories are never overwritten or deleted by
these helpers.

The store and its receipts are trusted local workflow state, not an authenticated
format for importing an externally supplied history. Keep the original reviewed
release bundle and its evidence separately. Retention does not establish release
permission or complete mapping coverage, and the last appended version is not
a global selection for all service dates and request scopes.

## Selecting a version for a request

`selectRetainedScheduledTimetable` from `@mrtdown/fs` chooses a version for one
Singapore service date and canonical request scope:

```ts
const result = await selectRetainedScheduledTimetable({
  storeDir,
  dataDir,
  serviceDate: "2026-01-02",
  scope: {
    stationId: "S",
    lineId: "NSL",
    serviceId: "SVC",
    destinationStationId: "D",
    platformId: "C", // Optional; grouped alternatives remain intact.
  },
});
```

The scope must reference known canonical entities and an appropriate service and
platform. Direction is expressed by the canonical service and destination.
Malformed dates, unknown references and invalid retained lineage throw; they
cannot authorize a fallback or bypass a source review.

The selector scans the validated history from newest to oldest in reviewed
lineage order. It skips versions outside the inclusive feed range or with a
fingerprint that differs from the installed canonical topology. Candidate bytes,
content and canonical references are rechecked before selection. A missing or
damaged timetable/notice skips that candidate. Damaged manifest or review history
still fails the history check rather than inventing an order.

A candidate must contain an assigned pattern for the requested station, line,
service, destination and optional platform, using a revision effective on the
service date. The requested station must precede the pattern's final occurrence.
A pattern containing a platform group may match any member; its complete
alternatives are preserved, without assigning a physical platform arbitrarily.

Coverage is deliberately conservative. Every active source trip must have an
assignment on that service date. Source calendar exceptions override weekly
rules, and an inactive trip is not a missing assignment. The compact artifact
cannot prove whether an unassigned trip belongs to another scope, so even a gap
elsewhere blocks this proof of completeness. Precise scoped coverage for partial
artifacts needs evidence from the reviewed producer; this selector does not infer
it from the presence of one matching trip. Deliberate exclusions remain gaps.

The result contains `serviceDate`, normalized `scope`, `selected`, `patternIds`
and `attempts`. `selected` is the retained manifest, import record and verified
timetable, or null when none is eligible. `patternIds` identifies the matching
canonical patterns for later departure queries. `attempts` records each inspected
manifest digest and its eligibility or rejection reason, including active and
unassigned trip counts when coverage was checked. A newer ineligible version
never hides an older eligible one, and neither retrieval time nor the requested
date changes the retained order.

An eligible timetable with zero active source trips is an explicit empty schedule
for that date. It remains distinct from `selected: null`; absence of departures
does not authorize frequency estimates. The selector itself computes no arrivals
or frequency fallback and creates no publication approval. Its history read is a
snapshot; an atomic import committed afterward is considered on the next call.
Keep canonical data stable throughout selection. Recheck eligibility on each
request or invalidate consumer caches when the canonical data or history changes.

## Remaining import work

A positive source result is only one prerequisite. The consumer still needs
release/provenance checks and precise scoped-coverage evidence for partial
artifacts. Explicitly scoped rollback decisions also remain ahead. Calling the
lower-level source-admission helper with an arbitrarily chosen incumbent does
not validate a complete lineage or authorize a rollback.

The [local departure query](gtfs-retained-departures.md) merges independently
selected service days. Site archive integration and API/UI provenance remain in
[Phase 4 of the GTFS plan](plans/active/gtfs-static-realtime.md#phase-4-consume-scheduled-arrivals-in-mrtdown-site).
These helpers create no real mapping, source or release approvals and do not
enable GTFS in the default Pages build.
