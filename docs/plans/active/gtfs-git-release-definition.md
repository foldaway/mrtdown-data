# Git-defined GTFS publication

## Purpose

Make `main` describe the timetable to publish, using a compact reviewed release
definition and the standard Pages workflow. Keep source ZIPs and generated
schedule rows outside Git, and preserve mapping, import and retention checks.

## Progress

- [x] 2026-11-23: Select a text release definition instead of a separate merge
  workflow and temporary artifact handoff.
- [x] 2026-11-23: Implement definition materialization, capture PR updates,
  main-push publication, preview builds and first-definition bootstrap.
- [x] 2026-11-23: Validate with `npm run check`, `TZ=UTC npm test`
  (999 tests), and actionlint for all four affected workflows; update PR #499.
- [x] 2026-11-24: Address review findings with receipt-only comparison recovery,
  preparation-base identity checks, preview documentation and containment coverage;
  verify all 1,003 tests, repository checks and actionlint pass.
- [x] 2026-11-24: Remove the serialization-sensitive release-index comparison;
  verify compact/pretty indexes through existing pre-upload identity and
  file-hash checks.
- [ ] After code merges, prepare and review the first definition, then verify
  its ordinary Pages deployment, exact site import and retention.

## Surprises & Discoveries

- Retention already preserves compact policies and evidence; the definition can
  reuse those inputs as readable JSON without copying source or timetable rows.
- The first definition must preserve current approvals. A duplicate-source
  inspection can propose that bootstrap without changing its release hashes.

## Decision Log

- 2026-11-23: Use a reviewed `releases/gtfs.json` definition as desired state.
  Retention describes completed state. Normal Pages deployment handles both
  timetable changes and unrelated canonical changes.
- 2026-11-23: Allow the existing bootstrap reader only before first adoption;
  deleted or invalid definitions must never select a retained fallback.

## Outcomes & Retrospective

Implementation is isolated in [PR #499](https://github.com/foldaway/mrtdown-data/pull/499).
All 1,008 deterministic tests pass, including exact definition-to-timetable replay,
held-review restoration, receipt-only retry recovery, changed preparation bases,
bootstrap deletion guards, and serialization-independent release-index handoff.
Repository checks and actionlint pass. Production behavior remains unverified until the first
definition is merged.

## Context

The prior draft prepared a release in an Actions artifact and used a separate
merged-PR workflow to publish it. The revised definition contains its source
receipt/hash, policies, approvals, admission review and expected output index.
See [publication](../../gtfs/operations/automatic-publication.md),
[recipes](../../gtfs/operations/release-recipes.md), and
[retention](../../gtfs/operations/release-retention.md).

## Plan of Work

1. Validate the text definition and reconstruct the exact approved inputs from
   its retained source ZIP. Test round-trip timetable/evidence hash parity.
2. Have capture preparation propose the definition without deploying. Restore
   main's desired definition when a retry is held. Preserve closed reviews.
3. Have ordinary Pages builds use the checked-out definition and verify the
   completed predecessor. Keep import completion before retention promotion.
4. Merge the code, review the first bootstrap or successor definition, then
   observe the standard Pages run. A failed publication keeps the desired
   definition explicit; complete its exact import/retention or follow reviewed
   rollback, rather than replacing it with an implicit fallback.

## Validation and Acceptance

Run `npm run check`, `TZ=UTC npm test`, and actionlint on the capture, Pages,
preview and validation workflows. Round-trip tests must reproduce the approved
release index and evidence. Missing or corrupt sources, identity mismatches,
changed predecessor/policy and deletion after adoption must fail. Ordinary
redeploys must preserve the Git-defined release after its capture ages.
