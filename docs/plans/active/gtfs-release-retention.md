# Rebuildable GTFS releases with bounded ready bundles

## Purpose

Retain the source, reviewed policies, approvals, exact code/canonical revisions,
and output hashes for each approved release. Keep compressed ready bundles for
the current and previous releases. Older generated JSON is disposable only after
an independent rebuild reproduces the recorded bytes. Preserve the current Pages
release and consumer imports throughout adoption.

## Progress

- [x] 2026-11-20: Verified the active private input archive and inventoried the
  release-input prefix: one archive, SHA-256
  `a0fc771a384555f9444f3dd828822a0d01e71a1a66bc1b187909aab5bc80690f`.
- [ ] Add digest-bound regeneration of the generated combined review and an
  offline historical replay path, separate from fresh publication checks.
- [ ] Package compact reproducible recipes with deduplicated source and revision
  inputs; verify the current November release byte for byte.
- [ ] Add current/previous bundle retention with immutable recipes and safe
  promotion/pruning, tests, and operating instructions.
- [ ] Seed and verify the private retention store without replacing active Pages
  inputs; open a separate implementation PR and record adoption steps.

## Surprises & Discoveries

- The existing 5,281,882-byte compressed input archive includes a 50,421,672-byte
  generated `combined-review.json` and the 2,996,770-byte source ZIP. Policies,
  capture receipt and approvals are much smaller. The generated draft can be
  reconstructed with `createScheduledCombinedReview`, but its exact approved
  identity must be checked before dropping it from the recipe.
- Pages currently reacquires current terms and checks the build clock. Historical
  reproducibility must use retained approval evidence and its release instant;
  this path must never replace fresh checks when publishing.
- There is only one archived input release. There is no historical ready-bundle
  backlog to delete. The live Pages digest and pinned input remain protected.

## Decision Log

- 2026-11-20: User approved keeping original source bytes once per hash, reviewed
  inputs and exact revisions, small release manifests/output hashes, and only
  current/previous compressed ready bundles. Older expanded output may be removed
  after verified reproduction. This does not authorize changing mapping approval
  or consumer database retention.
- 2026-11-20: Keep this change separate from snapshot-summary PR #480 and its
  generated dataset review #479.

## Outcomes & Retrospective

Implementation and operational verification are in progress. No source archives,
approval records, or published bundles have been deleted or repointed.

## Context

`.github/workflows/pages-deploy.yml` downloads an immutable private Tigris input
archive pinned by environment variable. `scripts/export-pages-combined-timetable.mjs`
loads a saved generated review, rebuilds the timetable, checks current release
conditions and preserves approved evidence bytes. `combinedTimetableRelease.ts`
provides the bundle/index verifier. The current public manifest digest is
`d37dd2f02e6c3057eaaa63308d5d49939357a1abd2d28751a564d3a78eceb2eb`.

The existing private bucket is `mrtdown-datamall-snapshots`. Pages credentials
can only read `pages-release-inputs/`; retention writes need a separate prefix
and scoped credentials. Do not broaden the existing read key.

## Plan of Work

1. Extend the Pages input configuration to accept an approved draft digest in
   place of a bulky saved draft. Recreate it and require an exact digest match.
   Preserve compatibility with the current archive and fresh publication checks.
2. Package a recipe from verified inputs and exact source/canonical/code
   revisions. Rebuild in a fresh directory and compare manifest, timetable and
   evidence bytes with the approved release index before recording replay proof.
3. Retain immutable content-addressed recipes and shared source/revision objects.
   Promote only verified releases, keep current and previous compressed bundles,
   and make pruning conditional on preserved inputs and replay proof. Failed
   preparation or promotion must preserve the incumbent.
4. Seed the current approved release and verify stored bytes. Retain legacy Pages
   inputs until the compatible workflow is merged and a production build passes.
   Document exact adoption and rollback steps; do not delete the active pin.

## Validation and Acceptance

Run `npm run check` and deterministic tests under Node 24 with `TZ=UTC` before
committing. Tests must reject stale draft digests, altered source/recipe/revision
bytes, and unsafe pruning; preserve fresh publication checks; and cover repeated
promotion, current/previous rotation and interrupted work. Rebuild the real
November release and require its existing manifest/release index and timetable
hashes to match. Public release digests and the Pages input pin must remain
unchanged during preparation.
