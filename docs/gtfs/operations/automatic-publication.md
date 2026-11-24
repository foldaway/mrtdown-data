# Automatic timetable publication

The capture workflow prepares routine updates and opens a readable review PR.
Merging a PR with a prepared publication request triggers deployment of that
exact release. Preparation never deploys to Pages or imports into the site.
Exceptions keep an evidence-only review PR and require the existing explicit
release procedure. No LLM makes release decisions.
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
  At least 90% of old calls retain distinct counterparts within 30 minutes.
  Additional station calls may exceed the old count, but at least 90% of new
  calls must also remain within 30 minutes of an old station call. This permits
  proved frequency increases without allowing wholesale redistribution of the
  old timetable. Mixed boarding/access profiles must retain their chronological
  order and counts; moving permissions between timed calls requires review.
  First/last times can therefore change when a small number of
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

The reusable Pages workflow serializes preparation and publication under the
existing `pages` concurrency group. Preparation uses the verified current
[retained recipe](release-retention.md) and runs the qualification checks above.
A ready candidate is saved as an immutable Actions artifact for 30 days. The
review PR commits a `<capture-sha256>.publication.json` request beside its source
report, binding the capture, predecessor, exact prepared content, publication
policy, preparation run and artifact ID. The PR describes merging as publication
approval. No automatic merge is enabled by this workflow.

The merged-review workflow accepts only merged, same-repository `gtfs-review/`
PRs targeting `main`. It reads the request introduced or changed by that merge,
verifies its successful capture workflow and unexpired artifact, then downloads
and checks the exact prepared inputs. A changed predecessor, changed policy or
terms, stale capture, or expired service-date window blocks deployment and
requires a fresh preparation and review. A retry of an already completed exact
release is a no-op. Pages packaging rechecks current topology and holidays and
must reproduce the reviewed release index before deployment. PR code never
supplies the generator used for preparation.

Ordinary Pages deployments keep using the latest completed retained release,
so the old environment archive pin cannot silently revert an approved update.
A manual Pages dispatch redeploys that completed release; it cannot publish a
new capture. Closing a review without merging never publishes it.

The workflow verifies public release bytes, requests an authenticated site pull,
and polls its completion receipt for the exact run and release index. Only then
does retention advance current/previous. Source admission reviews are retained
in compact recipes for future redeployments. Large generated review JSON stays
out of Git and out of recipe history; ready bundles follow the retention policy.
The merged PR remains the publication approval record; Actions records the
publication, exact import and retention outcome. Duplicate-source preparation
is a no-op and does not create a publication PR. An open review's preparation
can be rerun to refresh its artifact and request. A held or failed preparation
removes an older request from that open branch. Never merge a review whose
current preparation is held or whose source comparison is missing.

Existing evidence-only PRs do not authorize deployment. Rerun capture inspection
to prepare a request before merging. If a review was already merged or closed,
use the explicit release procedure; the capture workflow preserves closed PRs.
Expired artifacts require fresh preparation rather than rebuilding a different
release after approval.

Status polling retries transport timeouts, connection failures, HTTP 429 and
temporary server errors for at most one hour and 360 requests. The Pages job
allows two hours for preparation, a full site projection build and retention.
Authentication
errors, malformed receipts, wrong identities and terminal import failures still
stop immediately. A retry never substitutes for an exact successful receipt.

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
   it holds without deploying. For a routine candidate, verify preparation
   creates a publication request without changing live Pages; merge its PR and
   verify the exact site import and retention in the merged-review run. Manual
   Pages dispatch cannot bypass the review gate by supplying a capture key.

Leave both flags unset until compatible code and credentials are present. To
pause preparation and merged-review publication, set the automatic flag to `paused`. Ordinary Pages
deployments keep using the latest completed retained release in that mode.
Unsetting the flag selects legacy mode: first update its protected archive pin
and source review to the current approved release, since the bootstrap pin may
be stale after an automatic update.
