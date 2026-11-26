# Automatic preparation and publication of GTFS updates

Historical implementation and activation record through 2026-11-22. Policy,
workflow shape, flags, pins, and receipts below describe that checkpoint; use
the [current operating guide](../../gtfs/operations/automatic-publication.md) before acting.

## Purpose

Publish routine timetable successors automatically when every check passes.
Keep structural, calendar, rights and mapping exceptions in readable source-review
PRs. Reuse approved mappings only when independently reconstructed evidence proves
they still apply. Use compact private recipes and the existing Pages/site handoff;
advance the baseline only after the exact site import completes.

## Progress

- [x] 2026-11-21: Inspected the capture/release workflows and current source-bound
  mapping and release contracts after summary PR #480 merged.
- [x] 2026-11-21: Compared #479 with the approved November source. The baseline
  has 392 source patterns and the candidate has 479; 463 candidate patterns match
  an earlier ordered stop-ID sequence and direction. This is an inventory, not
  proof that their calendars, passenger access or mappings can be reused.
- [x] 2026-11-21: User selected automatic publication when all checks pass,
  with exceptions held for review. Defined the conservative timing-only policy.
- [x] 2026-11-21: Built compact candidate inputs and deterministic carry-forward
  checks. Calendar exceptions, changed access and unresolved mappings hold for
  review; the full bundle verifier remains mandatory.
- [x] 2026-11-21: Added a serialized reusable Pages publication path with exact
  capture binding, policy/run provenance, public-byte verification, site completion
  polling and retained baseline promotion. Added a paused mode that preserves
  the latest completed release for ordinary deployments.
- [x] 2026-11-21: Dry-ran #479: held changed calendars and journey metadata.
  A full-size synthetic timing-only successor verified 149,256 supported pairs
  with zero unassigned; source inputs and approvals stayed private and local.
- [x] 2026-11-21: Data checks and 949 deterministic tests passed. Site verification
  passed with 644 tests; 70 database-dependent tests skipped without a test database.
  Parsed workflow YAML and exercised active, paused and legacy mode selection.
- [x] 2026-11-22: Rebased automation onto the merged retention implementation,
  preserving archived-generator execution, cleanup retries and staged-candidate
  recovery. Corrected unversioned source admission; all 962 tests pass.
- [x] 2026-11-22: Merged #482, deployed site #315 to staging and production,
  and completed the user-authorized cutover. Compact inputs, scoped retention
  and automatic publication are enabled. The live exception run held #479 and
  skipped deployment; the published and retained baseline stayed identical.
- [x] 2026-11-22: Fixed pre-seeded ZIP timestamp compatibility in #490 before
  enabling automatic pruning. All 971 tests pass; the actual legacy ready ZIP
  reconstructs byte-for-byte without changing its immutable record.

## Surprises & Discoveries

- `resolveScheduledHolidayDates` rejects explicit source exceptions in bound
  calendars and requires every route's trips to use its three configured calendar
  IDs. #479 adds eight exceptions and two CCL special calendars, so its current
  release blockers require deterministic calendar support, not an LLM verdict.
- Sixteen candidate source patterns have no exact prior ordered stop-ID sequence
  and direction. New short workings may still match canonical paths; inventory
  matching alone must not authorize their service/platform memberships.
- Mapping approvals bind an exact draft and identity. Release approval binds an
  exact manifest. The source-admission review also binds predecessor/successor
  identities. Replacing old hashes or reusing an old approval unchanged is not
  sufficient to admit the new source.
- Activation found older ready ZIPs encoded the fixed epoch in local time.
  Raw output parity was insufficient to prove exact container recovery. #490
  restores metadata only when the complete recorded ZIP digest matches, and
  cleanup now verifies that digest before deleting a ready bundle.
- The November applicability policy expires on December 1. An automated builder
  must explicitly establish and report each candidate's service-date window;
  it must not silently extend the old assumption into December.

## Decision Log

- 2026-11-21: User requested automatic publication from GTFS updates and allowed
  an LLM if needed. User selected unattended publication for updates passing
  all checks, with exceptions held for review. The first policy permits only
  compatible timing/trip changes; an LLM is unnecessary for this scope.
- 2026-11-21: Keep source facts, proposed mappings, validation, authorization,
  generation and publication distinguishable in the PR. Preserve source boarding
  restrictions and canonical platform availability in every path.
- 2026-11-22: Retention PR #481 and its extracted prerequisites are merged.
  Preserve their reviewed implementation. Production storage adoption and
  automatic-publication activation remain separate from merging this PR.

## Outcomes & Retrospective

Automatic publication and release retention were activated on 2026-11-22 at the
user's request. The standing policy remains `timing-only-v1`; uncertain mappings,
calendar changes, terms changes and unsupported service dates require review.
No new source was promoted during the cutover.

- [Site #315](https://github.com/foldaway/mrtdown-site/pull/315) is deployed to
  both production Machines at `bc12feeb50ea28b1bf57c1fe8fe3069305b7bf4c`.
  [Production deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44998584919)
  succeeded. The fixed production release pin is cleared; authenticated status
  requests work and unauthenticated requests return 401.
- The protected `github-pages` environment has
  `MRTDOWN_GTFS_RELEASE_RETENTION_ENABLED=true` and
  `MRTDOWN_GTFS_AUTOMATIC_PUBLICATION_ENABLED=true`. A dedicated key has default
  permissions disabled and exactly the documented retention policy. Conditional
  lock write/read/delete was verified without changing release pointers.
- Inputs use `recipe-zip`, pinned to
  `54eeaf3ee7c8482be825b0f79b6a035acfa9e97f2978deb4c9a451333f23e297`.
  [Compact deployment](https://github.com/foldaway/mrtdown-data/actions/runs/44999548086)
  verified public bytes and retention. Its site pull
  `wfr_yN1g7ng3R8gPS3InV_amf` finished `RUN_SUCCESS` with the exact approved index.
  Current retained release is
  `ac2786e3a0853a8dd42c6caf45ec2259c8821f8958ca0ef15ed5d12bd8509c2e`;
  there is no previous release yet. The old private archive remains a rollback input.
- [Live exception verification](https://github.com/foldaway/mrtdown-data/actions/runs/45000028129)
  passed both inspections, retained-baseline acquisition and authenticated site
  preflight. Automatic preparation held changed calendars and journey metadata;
  Pages deployment and site pull were skipped. The existing #479 review PR now
  displays that explanation. Final checks found the same public/retained index
  and no writer lock.

The existing November 9–30 service-date window remains enforced. December
coverage and the #479 calendar/path decisions remain separate reviewed data work.
Use the [activation and recovery guide](../../gtfs/operations/automatic-publication.md)
for operations; set the automatic flag to `paused` to stop successors while
preserving the latest completed release for normal deployments.

## Context

The implementation builds on merged summary and retention changes. Capture PR #479
contains source SHA-256
`da1df9bdca14cff443a8150ee2af331031adb5291d8fb83a9d0602c1c2642795`.
The approved November baseline is
`ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe`.

`.github/workflows/gtfs-capture.yml` creates evidence-only PRs. The combined
review/assignment/release contracts live in `packages/fs/src/gtfs/`. The Pages
workflow uses a pinned private input archive and a production source review;
`scripts/prepare-pages-site-pull.mjs` verifies that the review binds the exact
published release. Use the [release guide](../../gtfs/operations/timetable-release.md)
for current publication requirements.

## Plan of Work

1. Define the selected authorization gate and candidate descriptor. Bind source,
   canonical topology, policies, service dates, terms and validation evidence to
   an exact candidate. Keep large generated JSON outside Git.
2. Rebase only decisions whose supporting source/canonical evidence is preserved.
   Hold new canonical paths and calendar exceptions for explicit review. Report
   every unresolved or ambiguous case instead of broadening the timing-only scope.
   LLM proposals, if needed, must select validated candidate targets and retain
   their evidence; they cannot edit source facts or release checks.
3. Prepare the complete candidate before the authorizing event. Record the actual
   merge actor/commit or the applicable standing publication policy, rather than
   claiming an agent made a human review. Build exact mapping, release and source
   admission records, including provider-version conflicts where required.
4. Publish the chosen candidate through serialized Pages deployment, verify the
   public bytes and follow the consumer import to completion. Advance the review
   baseline only after publication/import succeeds. Keep the previous approved
   release available for rollback and preserve failed-attempt diagnostics.

## Validation and Acceptance

Deterministic tests cover changed IDs, calendars/exceptions, changed boarding,
large cancellations/time shifts, stale/future captures, changed topology/terms,
missing mappings, expired windows, duplicate events, closed/open exception PRs,
retained-state integrity and failed/unrelated/incomplete site imports. Existing
retention tests cover concurrent promotions and conditional writes. The timing-only
policy has no LLM component. Root Vitest workers are bounded to two to prevent
full timetable reconstruction suites from exhausting CI resources.

The #479 dry run must hold its new calendars and paths; it passed this check.
A separately reviewed release must establish calendar/mapping support before
it can become the next baseline. Before any live promotion,
rebuild the candidate and require identical schedule/input identities. After
publication, verify the Pages index, completed consumer import and representative
CCL departures on ordinary and special dates. A queued pull is not completion.
