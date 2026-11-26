# GTFS static schedule implementation

Completed static-schedule milestones from the broader GTFS programme. Remaining
realtime work lives in the [active plan](../active/gtfs-static-realtime.md);
Git-defined release adoption is tracked in its [own plan](../active/gtfs-git-release-definition.md).

## Delivered outcomes

- 2026-10-14: Hash-verified inspection, pinned independent validation, historical
  August reproduction, and August–October mapping drift evidence.
- 2026-10-15–23: Scoped mapping review, exact-date and platform decisions,
  source/assigned timetable contracts, service-day queries, checked bundle
  export, source admission, retained imports, and reviewed rollback.
- 2026-11-10: Reviewed combined timetable packaging and Pages publication in
  [PR #475](https://github.com/foldaway/mrtdown-data/pull/475).
- 2026-11-14: Review PRs for newly seen verified snapshots in
  [PR #476](https://github.com/foldaway/mrtdown-data/pull/476).

The [original plan at the reviewed repository revision](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/active/gtfs-static-realtime.md)
preserves the full chronology, early capture counts and hashes, design decisions,
and the checks and release gates known at each date. Those earlier blockers and
phase descriptions are historical observations, not current operating instructions.

## Decisions retained

Use the provider's exact schedule with reviewed canonical identity mappings.
Retain provider occurrence identity, timing precision, boarding restrictions,
service-date scope, source provenance, and deterministic topology identity.
Keep credentialed acquisition and live serving outside this repository.
Treat source evidence, mapping approval, generation, publication, consumer
admission, and observed completion as separate checks.

## Evidence and current guides

- [Historical August audit](../../gtfs/operations/local-inspection.md#historical-august-audit)
  records exact inputs, reproduction commands, and the missing original receipt.
- [Mapping reviews](../../gtfs/reviews/README.md) retain capture-specific decisions.
- [Timetable references](../../gtfs/README.md#timetable-reference) own file and query contracts.
- [Release and recovery procedures](../../gtfs/README.md#publish-or-recover-a-timetable)
  own current publication and consumer requirements.
- [Retention](gtfs-release-retention.md), [automatic publication](gtfs-automatic-publication.md),
  and [calendar publication](gtfs-calendar-publication.md) record later verified
  cutovers and exact live receipts.

This closeout separates delivered static work from the unfinished realtime
investigation. It grants no new source approval, service-date window, or release.
