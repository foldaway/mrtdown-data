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

## Remaining import work

A positive source result is only one prerequisite. The consumer still needs
release/provenance checks, validation of canonical references and topology,
complete mapping coverage for the requested scope, date eligibility, atomic
storage and retained version history. It must select from that history for each
service date and scope, including older eligible versions and explicitly scoped
rollback decisions. Calling this pairwise helper with an arbitrarily chosen
incumbent does not validate a complete lineage or authorize a rollback.

Site archive integration, departure selection and API/UI provenance remain in
[Phase 4 of the GTFS plan](plans/active/gtfs-static-realtime.md#phase-4-consume-scheduled-arrivals-in-mrtdown-site).
This check creates no real mapping, source or release approvals and does not
enable GTFS in the default Pages build.
