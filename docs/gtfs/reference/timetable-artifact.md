# Scheduled timetable artifact files

The legacy artifact wraps a [compact assigned timetable](assigned-timetable.md)
with capture provenance and an attribution notice. Use the
[timetable release guide](../operations/timetable-release.md) for approval and
Pages packaging, including the combined format.

## Manifest

Use the [artifact schemas](../../../packages/core/src/schema/ScheduledTimetableArtifact.ts)
for field definitions. The manifest binds the source capture, canonical commit,
mapping draft, normalized assignments, and exact timetable and notice bytes.

## Preparing and verifying bytes

Use [`prepareVerifiedGtfsTimetableArtifact`](../../../packages/fs/src/gtfs/verifiedTimetableArtifact.ts)
with the ZIP, capture receipt, mapping draft, and canonical tree at the recorded
commit. It derives provenance from those inputs. The capture needs a single
`feed_info.txt` row with explicit `feed_start_date` and `feed_end_date`.

The lower-level [artifact helpers](../../../packages/fs/src/gtfs/timetableArtifact.ts)
require callers to validate supplied provenance and canonical topology first.
Manifest and timetable JSON are compact UTF-8 with no trailing newline. The
UTF-8 notice ends in one newline. Hash the exact files and preserve their bytes
through export and transport. Verification starts with an independently trusted
manifest digest.

## Publication and import checks

A local preparation result may include incomplete coverage or a mapping approval.
Public release still requires the separate release review and applicable terms
checks in the [publication policy](../operations/schedule-publication.md). Use the
[import guide](../operations/timetable-import.md) for canonical compatibility,
source lineage, and scoped rollback.

The [October reproducibility check](../reviews/timing-compatibility-2026-10.md#artifact-reproducibility)
records the digests for this format.
