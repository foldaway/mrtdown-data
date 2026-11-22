# Automatic timetable publication

The capture workflow can publish routine updates without a merge. Exceptions
keep the existing readable snapshot review PR. No LLM makes release decisions.
The checked-in [policy](automatic-publication-policy.json) authorizes the
`canonical-schedule-v2` scope; generated approvals name that policy and the actual
Actions run, rather than claiming a maintainer reviewed the candidate.

## What qualifies

Both the pinned independent validator and MRTDown inspection must pass for the
exact capture hash. The publisher runs repository checks and deterministic
tests, then requires:

- A newer capture, no more than 72 hours old, with unchanged source endpoint,
  licence reference, provider timestamp and redistribution permission.
- Identical stops, routes, feed information and other source tables, ignoring
  row/column order. Calendars and explicit exceptions may change. Each family's
  weekday, Saturday and Sunday calendar must have a unique successor with the
  same weekly rules and bounds. Explicit supplemental calendars remain within
  those bounds. Exceptions or supplemental service on public holidays require
  review; the standing Sunday substitution remains unchanged.
- Unique dated canonical paths, or the complete set of shared services that
  agree on every station occurrence and display code. Short workings can qualify.
  Conflicting candidates, skipped calls and new repeated journeys need review.
  Existing unusual source-order assumptions carry forward only to identical
  ordered physical stops and previously approved service dates.
- Source trip IDs, block IDs, headsigns and valid directions may change; source
  labels stay literal and never select a canonical mapping. New pickup/drop-off,
  timing-presence, timepoint and unknown metadata combinations require review.
- Each line's trip count on each supported service date changes by at most 10%.
  Each physical stop, source direction and arrival/departure kind loses at most
  10% of its calls. Additional calls from proved short workings can increase a
  station's frequency beyond that bound while the line total stays within 10%.
  Matched calls have a counterpart within 30 minutes;
  up to 10% may be unmatched additions or cancellations, checked in both
  directions. First/last times can therefore change when a small number of
  services are removed or added. Missing station coverage, larger changes and
  entire cancelled service dates require review.
- Unchanged current licence/API terms; an approved baseline without an embargo;
  and the existing service-date window, which must include today's Singapore date.
- Exact reconstruction of the approved baseline against current canonical
  topology and holidays. Candidate mappings independently verify operators,
  service revisions, all physical platforms and boarding restrictions. The
  complete bundle verifier must find zero excluded or unassigned supported
  trip/date pairs.

Changed access, stale sources, expired windows, changed terms and uncertain
mappings require review. A duplicate source
ZIP is a no-op. The policy does not extend November's approval into December.

Holiday policy v1 remains strict and unchanged for retained historical recipes.
New automated recipes use v2 and bind each supplemental calendar explicitly.

LTA's unchanged `feed_version` is handled deliberately: a qualified newer capture
gets an exact `resolve-version-conflict` admission record binding the completed
predecessor and candidate. Feeds with an absent or empty version instead use the
consumer's `successor` decision; declared source bounds remain mandatory. This does not waive any mapping or release check.
New account/capture restrictions must disable automation until reviewed.

## Publication and failure handling

The reusable Pages workflow serializes preparation, deployment, import and
retention under the existing `pages` concurrency group. Inputs come from the
verified current [retained recipe](release-retention.md), never a capture PR's
code or approvals. Ordinary Pages deployments also use that completed release,
so the old environment archive pin cannot silently revert an automatic update.

The workflow verifies public release bytes, requests an authenticated site pull,
and polls its completion receipt for the exact run and release index. Only then
does retention advance current/previous. Source admission reviews are retained
in compact recipes for future redeployments. Large generated review JSON stays
out of Git and out of recipe history; ready bundles follow the retention policy.
If that snapshot already has an open exception PR, a successful publication or
verified already-current result closes it with a receipt in the description.
Its branch and original report remain available; no evidence-only merge is needed.

A failed import or retention write leaves the baseline unchanged. If public
Pages already differs from that baseline, further automated deployments stop.
Recover by completing the failed exact import and retention, or by a reviewed
rollback using the [release](timetable-release.md) and
[import](timetable-import.md) procedures. Do not just reset a hash or rerun a
different capture over unfinished publication. Inspect Actions artifacts and
the exception PR for the reason. Missing reports never imply approval.

## Activation

Merge the retention and automation implementations and deploy the site's
authenticated completion endpoint before enabling the flag. This is an ordered
cutover, not a per-capture permission step:

1. Install the scoped retention credentials and enable
   `MRTDOWN_GTFS_RELEASE_RETENTION_ENABLED=true` in `github-pages`, following
   [retention activation](release-retention.md). Seed and verify the current
   release against the live Pages index.
2. Confirm the site accepts an exact signed successor request. Remove any fixed
   `MRTDOWN_COMBINED_RELEASE_INDEX` pin only as part of this cutover; its existing
   check intentionally rejects successors. Keep normal source admission enabled.
3. Run a normal Pages deployment and verify the current site import. Confirm the
   status endpoint returns `PENDING` for an unknown run and the correct release
   identity for a completed new run.
4. Set `MRTDOWN_GTFS_AUTOMATIC_PUBLICATION_ENABLED=true` in `github-pages`.
   Dispatch the **capture inspection** workflow for a known exception and verify
   it holds without deploying. The manual Pages workflow cannot bypass the
   independent validation gate by supplying a capture key.

Leave both flags unset until compatible code and credentials are present. To
disable successor generation, set the automatic flag to `paused`. Ordinary Pages
deployments keep using the latest completed retained release in that mode.
Unsetting the flag selects legacy mode: first update its protected archive pin
and source review to the current approved release, since the bootstrap pin may
be stale after an automatic update.
