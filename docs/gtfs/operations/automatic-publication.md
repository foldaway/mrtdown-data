# Automatic timetable publication

The capture workflow prepares routine updates and proposes a reviewed desired
release in `releases/gtfs.json`. Merging that definition into `main` triggers the
standard Pages deployment, which builds the referenced timetable alongside the
other data. Preparation never deploys or imports a timetable. Exceptions remain
evidence-only PRs until the explicit release procedure supplies reviewed inputs.
No LLM makes release decisions and this workflow does not enable automatic merge.
The checked-in [policy](automatic-publication-policy.json) defines routine
qualification; generated approvals name that policy and the actual preparation
run rather than claiming a maintainer reviewed the candidate.

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

`main` describes the timetable intended for publication. The text definition
contains the original capture receipt and source ZIP hash, mapping and service-date
policies, approval evidence, source admission review and expected release index.
It contains no source ZIP or generated timetable rows. It lives outside `data/`
and is not copied into the public export. The schema and materializer are in
[gtfs-release-definition.mjs](../../../scripts/gtfs-release-definition.mjs).

Preparation uses the verified completed [retained release](release-retention.md)
for comparison and runs the qualification checks above. It stops if Git already
names a different desired release whose deployment is pending. A ready update
commits the complete compact definition in the capture PR. Actions artifacts only
transport reports and the proposed JSON between jobs of that same run; later
publication and redeployment have no dependency on those temporary artifacts.
The PR's readable report explains what changed and that merging updates the
desired timetable.

The normal Pages `push` trigger includes `releases/**`. Each deployment reads the
definition from its checked-out `main` commit, downloads the exact source by hash,
and rebuilds against the canonical data it ships. Source terms, mappings, topology,
holidays and expected release hashes must verify before upload. A new automatic
release must also follow the completed predecessor, retain its preparation policy,
be within the capture-age limit, and have an active Singapore service-date window.
Ordinary redeployments of an already completed release do not reapply its original
capture-age limit. Missing sources, invalid definitions and mismatched builds stop;
they never select a different retained timetable. A manual Pages dispatch follows
the same definition and cannot choose an arbitrary capture.

Preparation and Pages deployments serialize under the `pages` concurrency group.
After deployment the publisher verifies public bytes, requests an authenticated
site pull, and waits for the exact release's completed import receipt. Only then
does retention advance current/previous. Retention records completed deployments;
it does not override Git's desired release.

An open review can be prepared again. A held or failed attempt restores `main`'s
definition on its branch, removing a stale proposed successor without deleting an
adopted timetable. A new run after a closed or merged review creates a separate
review branch and preserves the original report. Missing source comparisons
never qualify a definition change. Merging an evidence-only PR leaves the desired
release unchanged.

### First definition and recovery

The code change does not invent a new approval or change the live timetable.
Before the first definition is merged, Pages keeps using the verified completed
retained release and records that bootstrap selection in its summary. Inspection
of the same source can propose a definition of that completed release, preserving
its approvals and output hashes; a qualifying successor can also establish the
first definition. After adoption, deleting `releases/gtfs.json` fails publication
rather than re-enabling a retained or legacy fallback.

For an explicit manual release, prepare the approved compact inputs with the
[release procedure](timetable-release.md), then write a definition using:

```sh
node scripts/gtfs-release-definition.mjs create /path/to/approved-inputs /tmp/gtfs.json
```

Review that JSON as `releases/gtfs.json` in a PR together with its source-change
report. The command verifies source bytes and expected evidence identities;
Pages still performs the full current mapping/release verification. The definition
must carry the consumer's exact source admission review. Rolling Git back alone
does not bypass the site's reviewed rollback requirements.

Status polling retries transport timeouts, connection failures, HTTP 429 and
temporary server errors for at most one hour and 360 requests. The Pages job
allows two hours for build, a full site projection build and retention.
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
   it holds without changing the desired release. Prepare the completed source
   to bootstrap `releases/gtfs.json`, or use a qualified successor. Verify the PR
   changes the definition and explains the timetable changes without deploying.
   Merge it and verify the ordinary Pages run publishes that exact release,
   completes the site import and records retention. Check an ordinary data-only
   deployment continues to build the same Git-defined timetable.

Leave both flags unset until compatible code and credentials are present. To
pause automatic preparation, set the automatic flag to `paused`. Pages continues
to honor the definition on `main`, including a previously merged successor. Stop
or repair that deployment explicitly if required. Before adoption, unsetting the
flag selects legacy mode; first bring its protected archive pin and source review
up to date. After adoption the definition remains authoritative even when
automatic preparation is disabled.
