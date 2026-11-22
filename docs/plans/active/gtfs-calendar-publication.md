# Publish checked GTFS calendar and stopping-pattern updates

## Purpose

Publish source calendar exceptions and new canonical stopping patterns without a
manual merge when deterministic checks prove dates, mappings, access and rights.
Use snapshot PR #483 as the production acceptance case. Ambiguous changes stay
in the existing review flow. Retain the approved November applicability window.

## Progress

- [x] 2026-11-22: Added backward-compatible holiday exception support,
  deterministic mapping planning and completed-review closure.
- [x] 2026-11-22: The exact #483 source passed full-size bundle verification:
  149,100 supported trip/date pairs assigned, zero gaps and exclusions. All 982
  existing tests passed; an additional regression verifies the next automatic
  successor can use the generated v2 release as its baseline.
- [ ] Merge checked implementation and observe capture-to-site publication and retention.

## Surprises & Discoveries

The timing-only policy holds #483 because CCL and DTL introduce explicit special
calendars and shorter journeys. The canonical mapping engine already validates
contiguous and shared segments; holiday policy v1 rejects all bound exceptions.
Some declared CCL routes were unused in the baseline and now have trips; unique
canonical route-family aliases can bind them without inventing a direction.
CCL's special Saturday increases some platform call counts by 15–19%, while
the daily line total rises only 16 journeys. Bound station losses separately
from additions. Count unmatched early/late calls as additions or cancellations
within 10%; do not misclassify one removed trip as a whole timetable time shift.

## Decision Log

2026-11-22: The user requested automatic end-to-end publication. Extend the
standing deterministic policy; do not delegate release authority to an LLM.
Preserve v1 policy parsing and historical bundle replay.

## Outcomes & Retrospective

Implementation and production verification pending.

## Context

The active producer is `scripts/prepare-gtfs-automatic-release.mjs`. Its source
allowlist is `scripts/gtfs-automatic-eligibility.mjs`. The core holiday and
platform association contracts live in `packages/fs/src/gtfs/`. Publication,
site completion and retention already run serially under the Pages workflow.
See [automatic publication](../../gtfs/operations/automatic-publication.md).

## Plan of Work

Add holiday policy v2 for literal nonholiday exceptions and explicit supplemental
calendars, leaving v1 unchanged. Rebind existing unusual-source assumptions only
to the same ordered physical calls. Derive unique canonical targets and complete
shared memberships; never choose between conflicting candidates. Compare daily
line counts and station timing envelopes within the approved window. Run scoped
tests, full repository checks, and the actual verified #483 source before merge.
Then dispatch capture inspection and verify exact public bytes, completed site
import and retained current/previous. Hold on any failed invariant; retain the
existing rollback and partial-publication recovery procedure.

## Validation and Acceptance

Run Node 24 with `TZ=UTC`, `npm run check`, `npm test` and package builds.
Regression cases cover nonholiday exceptions, holiday conflicts, unmapped
stopping patterns, changed access, cancellations and timing anomalies. The real
source must have zero excluded/unassigned supported trip/date pairs. Production
acceptance requires successful independent validation, bundle verification,
site `RUN_SUCCESS` for the exact index, and retention advancement.
