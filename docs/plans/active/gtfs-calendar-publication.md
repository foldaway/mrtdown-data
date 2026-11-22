# Publish checked GTFS calendar and stopping-pattern updates

## Purpose

Publish source calendar exceptions and new canonical stopping patterns without a
manual merge when deterministic checks prove dates, mappings, access and rights.
Use snapshot PR #483 as the production acceptance case. Ambiguous changes stay
in the existing review flow. Retain the approved November applicability window.

## Progress

- [x] 2026-11-22: Added backward-compatible holiday exception support,
  deterministic mapping planning and completed-review closure.
- [x] 2026-11-22: Reverified the exact #483 source with distinct timing
  counterparts and timed boarding permissions: all 149,100 supported trip/date
  pairs assigned, zero gaps and exclusions. The [compact offline proof](../../gtfs/reviews/automatic-publication-483.json)
  binds the input identity, checked baseline, coverage and service-date window.
  All 985 tests pass, including repeated automatic successors.
- [x] 2026-11-22: Merged [#491](https://github.com/foldaway/mrtdown-data/pull/491).
  [Capture run](https://github.com/foldaway/mrtdown-data/actions/runs/45011780846)
  passed live source and rights checks, published and verified the candidate,
  and started site import `wfr_xlxwqGcECOkEui6FEclx6`.
- [ ] Complete the exact import and retention after a transient status timeout,
  then close #483 with the recovery receipt and verify ordinary redeployment.
- [ ] Land bounded status-request retries so transient failures do not interrupt
  future publications after their public bytes have changed.

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

The acceptance input is ZIP SHA-256
`0a5cf996038a088933b35d3ba81c76258b986946eed6ac628be4724d4f6e48bf`,
retrieved on 2026-11-21 at 20:00:03.469Z. Its
[receipt](https://sources.mrtdown.org/captures/schedule/0a5cf996038a088933b35d3ba81c76258b986946eed6ac628be4724d4f6e48bf.json)
binds the public source bytes. Dispatch from a fresh checkout after merge:

```sh
gh workflow run gtfs-capture.yml --ref main \
  -f capture_key=captures/schedule/0a5cf996038a088933b35d3ba81c76258b986946eed6ac628be4724d4f6e48bf.json
```

The workflow calls `scripts/prepare-gtfs-automatic-release.mjs` with its verified
retained baseline, acquired candidate, new output directory and report directory.
Its `gtfs-automatic-<run>-<attempt>` artifact retains the decision, coverage and
exact release identities. Link that production run here when observed. If the
capture becomes stale, the service window expires, or any gate holds, preserve
that decision and investigate the actual newer capture; do not alter timestamps
or skip a gate to reuse this acceptance input.
