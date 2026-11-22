# Rebuildable GTFS releases with bounded ready bundles

## Purpose

Retain compact approved inputs and exact code/data snapshots for each release.
Keep current/previous ready bundles; remove older bundles only after verified
reproduction. Preserve existing publication checks and require a separate
production activation after compatible workflows merge.

## Progress

- [x] Verified the November release, compact inputs and scoped storage permissions.
- [x] Executed its archived generator and reproduced the original manifest,
  71 MB timetable and release-evidence hashes.
- [x] Fixed timezone-dependent ZIP bytes, missing checkout history, cleanup retries
  and abandoned staged bundles; deterministic regression checks pass.
- [x] Split claim scope, compact inputs, recipe/replay, storage and Pages integration
  into focused PRs based on current main, preserving the reviewed behavior.
- [x] 2026-11-22: Prerequisites and #481 are merged. The user authorized
  activation; compact inputs and scoped retention passed production adoption.
  Exact legacy ZIP reconstruction was fixed in #490; all 971 tests pass.

## Surprises & Discoveries

- The displayed 5,344 additions included 2,442 additions already merged in #480.
  The remaining diff against current main was 2,902 additions across 22 files,
  including an unrelated claim-extraction fix and 422 dependency-lock additions.
- Historical replay must execute the retained generator and lockfile. Rebuilding
  with current code does not establish historical reproducibility.
- Cleanup must survive newer code and interrupted promotions. Stored records,
  conditional writes and a staging journal preserve current/previous bundles.

## Decision Log

- 2026-11-20: The user approved retaining original source bytes once per hash,
  compact reviewed recipes and exact revisions, with only current/previous ready
  bundles after successful cleanup. Consumer database retention is separate.
- 2026-11-20: Automatic approval review rejected production secret/flag activation
  before compatible workflows merge. No production configuration changed;
  activation still requires the post-merge approval recorded in the runbook.
- 2026-11-21: The user requested the small-PR and coding guidance be applied to
  #481. Separate independent claim extraction and layered retention concerns;
  keep #481 for the final Pages integration and split large helpers by ownership.
- 2026-11-21: Leave the parent's #482 branch and checkout untouched. Its integration
  onto the final retention prerequisites remains with the parent chat.

## Outcomes & Retrospective

The [original validation record](https://github.com/foldaway/mrtdown-data/blob/aa118599d480f190f50414c9bc6afe069ffd7ba7/docs/plans/active/gtfs-release-retention.md)
contains the exact release hashes, object sizes, scoped-key checks and staged
recipe pin. The recipe is 16,017 bytes and the ready bundle is 4,583,289 bytes.
Private history is seeded with the approved November release. Scoped retention
was activated on 2026-11-22 and verified against the deployed release index.
The [automatic publication cutover record](gtfs-automatic-publication.md#outcomes--retrospective)
links the deployment, completed site import and live exception hold. The original
legacy archive remains available for rollback.

## Context

At planning start the input pin was the legacy `a0fc771a...` archive. The active recipe SHA-256
is `54eeaf3ee7c8482be825b0f79b6a035acfa9e97f2978deb4c9a451333f23e297`.
The private bucket is `mrtdown-datamall-snapshots`; sources remain crawler-owned.

The implementation consists of compact Pages review regeneration, immutable
recipe formats and historical replay, retained-release storage/commands, and the
opt-in Pages handoff. Their contracts remain separate from mapping approval,
source admission and fresh publication eligibility.

## Plan of Work

1. Merge [claim scope #485](https://github.com/foldaway/mrtdown-data/pull/485).
2. Merge [compact Pages inputs #486](https://github.com/foldaway/mrtdown-data/pull/486).
3. Merge [recipe/replay #487](https://github.com/foldaway/mrtdown-data/pull/487).
   Input formats, replay execution and preparation have separate modules.
4. Merge [retention storage #488](https://github.com/foldaway/mrtdown-data/pull/488).
   S3 transport is separate from promotion, locking and recovery.
5. Merge [Pages integration #481](https://github.com/foldaway/mrtdown-data/pull/481)
   after its prerequisites. The integration preserves the previous review history.
6. After merges and activation approval, follow
   [Pages adoption](../../gtfs/operations/release-retention.md#pages-adoption).
   Retain the legacy archive/pin until publication, site handoff and retention
   succeed and the retained current record matches the deployed release index.

## Validation and Acceptance

Run repository checks and deterministic tests for every layer before committing.
Keep actual worker-input validation, current/archived generator divergence,
byte-identical cross-zone ZIPs, tamper rejection, concurrent promotion, stored
cleanup retry and reviewed rollback coverage. Recheck the real November replay
when refactoring module boundaries. The split passed `npm run check`, all 937
deterministic tests and the real November replay. Preserve published bytes, approvals,
input pins, environment flags and credentials throughout PR restructuring.
