# Automatic timetable publication

The capture workflow can publish routine updates without a merge. Exceptions
keep the existing readable snapshot review PR. No LLM makes release decisions.
The checked-in [policy](automatic-publication-policy.json) authorizes the
`timing-only-v1` scope; generated approvals name that policy and the actual
Actions run, rather than claiming a maintainer reviewed the candidate.

## What qualifies

Both the pinned independent validator and MRTDown inspection must pass for the
exact capture hash. The publisher runs repository checks and deterministic
tests, then requires:

- A newer capture, no more than 72 hours old, with unchanged source endpoint,
  licence reference, provider timestamp and redistribution permission.
- Identical calendars, exceptions, stops, routes, feed information and other
  source tables, ignoring row/column order.
- The same journey groups, including ordered calls, pickup/drop-off rules,
  timepoints and all other trip/call metadata. Only trip IDs and times may vary.
  Each group's trip count can change by at most 10%; every old/new journey
  must have a corresponding journey whose call times differ by at most 30 minutes.
- Unchanged current licence/API terms; an approved baseline without an embargo;
  and the existing service-date window, which must include today's Singapore date.
- Exact reconstruction of the approved baseline against current canonical
  topology and holidays. Independently reconstructed candidate memberships,
  service dates and passenger access must match the baseline. The complete
  bundle verifier must find zero unassigned supported trip/date pairs.

Calendar exceptions, new short workings, changed access, stale sources, expired
windows, changed terms and uncertain mappings require review. A duplicate source
ZIP is a no-op. The policy does not extend November's approval into December.

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
