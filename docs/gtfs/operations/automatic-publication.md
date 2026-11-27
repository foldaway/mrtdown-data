# Automatic timetable publication

The capture workflow prepares routine updates and proposes a reviewed desired
release in `releases/gtfs.json`. Merging that definition into `main` triggers the
standard Pages deployment, which builds the referenced timetable alongside the
other data. Preparation never deploys or imports a timetable. Exceptions remain
evidence-only PRs until the explicit release procedure supplies reviewed inputs.
No LLM makes release decisions. Only proved no-op capture evidence can merge
automatically; timetable proposals and held captures retain their review process.
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
  same weekly rules and bounds, or a complete ordered partition with identical
  weekday flags. Segment bounds must be contiguous and preserve the predecessor's
  full bounds; gaps, overlaps and competing exact successors require review.
  Explicit supplemental calendars remain within
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

An approved release with explicit single-service selections requires a new
mapping review for a source successor. Automatic preparation holds it rather than
turning a selected short working into a shared service membership.

Changed access, stale sources, expired windows, changed terms and uncertain
mappings require review. A duplicate source
ZIP is a no-op. The policy does not extend November's approval into December.

Holiday policies v1 and v2 retain their existing behavior for historical recipes.
New automated recipes use v2 for single primary calendars and v3 when a day type
is split into segments. In v3 the existing primary ID names the first segment;
`additionalWeekdayCalendarIds`, `additionalSaturdayCalendarIds` and
`additionalSundayCalendarIds` list any later segments in date order. Every segment
must have trips in its family, and each day type must cover the same overall bounds.
Sunday substitution uses only the Sunday segment containing each holiday; weekday
and Saturday segments suppress holiday service as before. Explicit exceptions on
holidays and supplemental holiday service still require review.

For example, splitting DTL weekdays into January 1–December 1 and December 2–31
can qualify without changing November's approved window. The original source
calendars remain literal, all mapping/count/timing checks still run, and no December
trip/date pairs are approved or published by the November release. A future-only
change is not treated as expired-service cleanup; the retained-timetable proof
below can instead establish that publication is unnecessary.

LTA's unchanged `feed_version` is handled deliberately: a qualified newer capture
gets an exact `resolve-version-conflict` admission record binding the completed
predecessor and candidate. Feeds with an absent or empty version instead use the
consumer's `successor` decision; declared source bounds remain mandatory. This does not waive any mapping or release check.
New account/capture restrictions must disable automation until reviewed.

## Expired-service cleanup

A capture can be a **no-op** when its only trip or calendar changes belong to
fully expired service dates. The publisher keeps the completed source, approvals,
release index and historical schedules unchanged; it creates no successor release
or desired-definition proposal. This is distinct from an identical-ZIP result and
cannot trigger the first-definition bootstrap.

The conservative proof requires unchanged stops, routes, feed information and
other source tables. Any changed or removed trip must belong to a fully expired
calendar; calendar bounds and all explicit exceptions count, including non-running
weekdays that a holiday substitution might still use. For unchanged trips, changed
calendar exceptions must be before today's Singapore service date. All affected
arrival/departure times, including extended-hour overnight tails, must have
finished. Missing times or a possible current/future effect use the normal review
path. Source acquisition, freshness, rights, terms and exact completed-baseline
verification still run before this decision.

The preparation report identifies the affected past dates and retained manifest.
A capture review with complete comparison evidence and an unchanged preparation
base is marked **No publication needed**. Its desired definition is restored to
main, and the PR can be closed as evidence-only. A stale base or missing comparison
still holds the review. This does not waive the 10% or 30-minute guards: a capture
that also changes current/future **approved** service follows the existing
successor checks across the approved window, including historical dates.

## Retaining published history across out-of-window changes

Policy `canonical-schedule-v3` also permits a no-op when expired differences are
combined with changes outside the existing approval window. For example, a capture
can remove November 14's special service and introduce a December 2 timetable
without replacing either the published November history or its remaining service.
This proof runs after the completed baseline verifies and candidate calendar
bindings, segment coverage and holiday rules have been checked.

The proof compares exact effective journeys on every service date after holiday
substitution. It preserves duplicate trip counts, stops and order, all arrival and
departure times, boarding rules and other trip/call metadata. Only provider trip
and calendar identifiers are disregarded. Source declarations and other tables
must remain unchanged. Every difference must either:

- Be outside the original approved service-date window, which remains fixed; or
- Belong to a prior approved service date whose last arrival/departure has finished
  in both sources, including extended-hour overnight tails in Singapore time.

Today's and future approved service must match exactly. An unfinished overnight
change or unknown expiry timing cannot qualify. If this proof fails, preparation
continues through the normal candidate mapping and full-window count/timing checks;
it does not exempt historical dates from a replacement release's guards.

A passing proof retains the completed source, manifest, release index, approvals
and timetable bytes. It creates no successor bundle, mapping approval, source
admission or release definition, and cannot bootstrap the first definition. The
report records both capture hashes, the retained manifest, the policy identity,
the unchanged approval range and exact completed/outside-window difference dates.
The proof JSON is also included in the capture Markdown so the reviewed evidence
survives Actions artifact retention.
The normal evidence-only review handling still requires complete comparison
evidence and an unchanged preparation base before marking **No publication needed**.

## Publication and failure handling

### Automatic merging of no-op evidence

The trusted capture workflow can squash-merge its own no-op review after successful
independent validation, inspection, preparation and review recording. The final
step uses code copied from the run's trusted commit before checking out the capture
branch, with the existing workflow token and no administrator override. It does
not queue a merge for later: GitHub must accept the exact checked head immediately.

The merge gate requires:

- A same-run preparation receipt binding the exact capture, completed baseline,
  approval range and complete no-op proof. Preparation must be at most one hour
  old, the source at most 72 hours old, and the approval window still active.
  The receipt is retained in the capture Markdown alongside the proof.
- The same default-branch commit and desired-definition identity as preparation,
  plus the same public release index immediately before the merge attempt.
  Current `main` is fetched and checked through Git; the PR API's `base.sha` can
  retain its original base commit and is not used as the current branch tip.
- An open, non-draft, same-repository PR created by the capture bot, with the exact
  expected head and branch. Its diff may only add or modify regular, non-executable
  Markdown/JSON files for that capture under `docs/gtfs/captures/`.
- A bounded version 2 capture receipt and prose matching the exact trusted same-run
  receipt and no-op report. The detailed JSON/Markdown must first be archived as
  hash-verified Release assets; their URLs, digests and lengths are bound in the
  receipt. Legacy full comparisons, edited findings, missing proof, failed archives
  and incomplete comparisons cannot qualify. See [snapshot records](../captures/README.md)
  for byte budgets and archive retention.
- No pending or failed head checks/statuses, requested manual review or
  changes-requested review. Required GitHub protections still apply.

Bot-created PRs may lack a completed ordinary PR validation run. The successful
trusted inspection's checks and exact evidence validation supply this gate's
validation; a missing PR check does not bypass any required GitHub check. The
workflow does not grant itself review approval or use a separate elevated token.

After the network and Git checks, the gate refreshes reviews and PR state, then
checks proof/capture age and the Singapore approval window again before requesting
the merge. GitHub can atomically guard the head SHA but cannot condition a merge on
unchanged reviewer state. We accept the remaining request/merge interval for this
generated, evidence-only scope; a review request arriving in that interval may
still miss the gate. Required GitHub review protections remain the server-enforced
way to require approval at merge time.

A stale base, changed head or baseline, unsupported proof, unexpected diff or merge
refusal leaves the review open and records the reason in the Actions summary.
Prepare the capture again after resolving it; no delayed merge can outlive its
proof. `ready`, held, disabled and failed results are never auto-merged. No-op
merges archive evidence without selecting a new comparison baseline, changing
`releases/gtfs.json` or publishing a timetable. Capture-only paths are outside the
Pages deployment trigger.

### Desired state and deployment

`main` describes the timetable intended for publication. The text definition
contains the original capture receipt and source ZIP hash, mapping and service-date
policies, approval evidence, source admission review and expected release index.
It contains no source ZIP or generated timetable rows. It lives outside `data/`
and is not copied into the public export. The schema and materializer are in
[gtfs-release-definition.mjs](../../../scripts/gtfs-release-definition.mjs).

Preparation uses the verified completed [retained release](release-retention.md)
for comparison and runs the qualification checks above. It stops if Git already
names a different desired release whose deployment is pending. Preparation records
the Git identity of its base definition (or its absence); review acceptance compares
that identity with the fetched default branch and holds a candidate if the base
changed, requiring fresh preparation. A ready update
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
review branch and preserves the closed review. A successful archive refreshes the
bounded Markdown/JSON receipt on retry before a definition can be accepted; this
also upgrades legacy full reports and unavailable-comparison branches. Earlier
receipts remain in Git history and detailed reports remain in Release assets.
Missing comparisons or failed archives never qualify a definition change. Merging
an evidence-only PR leaves the desired release unchanged.

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

A failed import or retention write leaves the baseline unchanged. When public
Pages already shows the exact reviewed desired index in `releases/gtfs.json`, a
retry can rebuild and redeploy that same release, then complete the site import
and retention. A different public index still blocks deployment. Recover by
completing the failed exact import and retention, or by a reviewed
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
