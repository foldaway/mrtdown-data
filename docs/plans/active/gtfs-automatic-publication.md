# Automatic preparation and publication of GTFS updates

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
- [ ] Merge automation code, deploy the site completion endpoint,
  then follow the ordered activation and recovery guide. Verify a held capture
  through the production workflow before allowing the first eligible successor.

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

Implementation and local validation are complete. The site completion API is
[site PR #315](https://github.com/foldaway/mrtdown-site/pull/315). Production
activation follows compatible workflow/site merges and the
[activation guide](../../gtfs/operations/automatic-publication.md#activation). No new source has been published and no live input
pin, mapping approval or production source-admission record has changed.

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
