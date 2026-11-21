# Public GTFS snapshot handoff

## Architecture

`mrtdown-data-crawler` downloads original files into private Tigris. Its opt-in
publication step copies only the three known LTA GTFS datasets into a separate
public bucket, with a licence-linked attribution page and immutable capture
records. All future non-GTFS datasets remain private unless explicitly supported.

The [Singapore Open Data Licence](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html)
allows distribution and adaptation with attribution and no implied endorsement.
[LTA API terms](https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html)
apply to acquisition, including credential confidentiality and endpoint-specific
conditions/effective release dates. This design is for the standard GTFS terms
reviewed on 2026-10-12; honor additional conditions received with API access or
source files. A service-calendar start date is not automatically a release embargo.

The [schedule publication policy](schedule-publication.md) records the
derived-schedule terms reviewed on 2026-10-18, required notices, and retention
policy. Public source delivery does not approve canonical mappings or enable
derived schedule publication.

## Public objects

- `blobs/<kind>/<sha256>.zip|pb`: original bytes.
- `captures/<kind>/<sha256>.json`: first published capture for those bytes.
- `index.html`: conspicuous LTA attribution, dataset names, licence link and
  independent/historical-snapshot notice.

Public capture records use schema v1 with `rights_status` set to
`redistribution_permitted`; private records retain their original pending-review
status. Capture records link the actual licence URL and include access date,
source, file hash and attribution. The public record is created conditionally
and not replaced by later acquisitions of identical bytes. Raw GTFS files are
not modified to insert notices.

Only schedule hashes trigger GitHub `repository_dispatch` event `gtfs_capture`:

```json
{
  "event_type": "gtfs_capture",
  "client_payload": {
    "capture_key": "captures/schedule/<sha256>.json"
  }
}
```

The crawler records notification state only in private Tigris. Failed notifications
remain pending and are retried on subsequent enabled DataMall polling runs.
A bounded batch of 20 avoids unbounded catch-up. Successful hashes are not
notified again. A crash after dispatch can cause duplicate delivery. The
receiver may repeat inspection, but opens at most one review PR per ZIP hash.
Published alerts/trip updates do not dispatch to the schedule workflow.

## Provisioning

The producer runs a Hono Node service on Fly.io at `https://crawler.mrtdown.org`.
GitHub Actions deploys it and manages signed QStash jobs: evidence and realtime
captures every five minutes, and schedule acquisition daily at 20:00 UTC
(04:00 Singapore). Only health is public. Private and public Tigris buckets
have independently configured S3 endpoints, regions, names and credentials.
Public objects are served at `https://sources.mrtdown.org`; Cloudflare execution
and builds are disabled.

The receiver repository variable `GTFS_SNAPSHOT_BASE_URL` names that trusted
origin. Schedule publication and repository dispatch are enabled. The first
verified handoff succeeded in [receiver run 38525057872](https://github.com/foldaway/mrtdown-data/actions/runs/38525057872).

## Receiver

The GitHub workflow uses a configured trusted origin, never a caller-supplied
URL. It accepts only a content-addressed schedule capture key, fetches its JSON,
validates source/kind/publication status and matching object-key identities,
then downloads the ZIP without following redirects. Transfers have byte limits
and request timeouts. Both files are hash/size verified before materialization
in a fresh temporary directory.

The read-only inspection job runs the independent validator and the offline
`@mrtdown/fs` inspector and uploads their available reports as a GitHub Actions
artifact, including findings with errors.

After the receipt and ZIP are verified, a separate job on the default branch
opens a review PR for that ZIP hash even if validation reports errors. The PR
adds `docs/gtfs/captures/<sha256>.md` and compact JSON evidence with the capture
time, source links, table changes, effective service-date coverage, validation
findings, and links to the run and full reports. The Markdown record also becomes
the PR body when it fits the size budget. The description is capped at 60,000
Unicode characters and links to the exact committed report. Large reports keep
their complete Markdown/JSON evidence; only the description omits detailed
examples or shortens the overview. Reports are generated in the read-only job;
the write job copies
only the exact hash-named Markdown and JSON files. Existing PRs,
including closed ones, are reused on replay. The job uses the repository's
GitHub Actions permission to create PRs. Canonical mapping review and timetable
release approval remain separate steps.

### Comparison baseline and review scope

[`baseline.json`](../captures/baseline.json) explicitly identifies the source
capture used for comparison. Its initial value is the source of the approved
November 9–30 timetable, verified against the public manifest and release index.
To accept another comparison baseline, change its `captureKey` and evidence in a
reviewed PR. Merging a capture record does not advance this pointer or publish a
timetable. A later public deployment also does not silently change the pointer.

The generator downloads the baseline from the same trusted origin and verifies
both receipts and ZIP hashes before comparing. It reuses
`compareScheduleSnapshots`: provider IDs identify records, row order and limited
numeric/time formatting are normalized, and all other cell changes remain exact.
Trip ID churn is not proof of added or removed train services.

The opening “What changed” section compares daily journey schedules by named
line and groups dates with identical changes. It reports changes in daily journey
counts and notable first/last origin times for exact stopping patterns. Expandable
details show named stops/platforms, stopping patterns that appear or disappear,
and examples of exact departure times. Unchanged lines and dates are identified
separately. All date groups and pattern comparisons are retained in JSON.
Origin-time highlights come from the five changed patterns with the most
origin-departure differences, rather than emphasizing rare positioning trips.

This comparison ignores trip, calendar and block IDs. A journey's identity uses
the ordered source stop IDs (including repetitions), direction, boarding rules,
arrival/departure times, timepoints, headsigns and passenger accessibility fields.
Identically named routes within the same agency/type form a line. Timetable
entries are compared as multisets, retaining duplicate journeys. Changed origin
times are listed independently rather than guessing which individual train moved.
Within-journey time examples use only an unambiguous shared origin time and exact
stopping pattern; display examples require an unambiguous shared timing sequence.

Counts include short turns and non-boarding source calls. A pattern's origin-time
window is not a station's first/last passenger train. Frequency-based schedules
and flexible pickup/drop-off windows produce an explicit unavailable result.
Source date scope, stop IDs and supplied platform labels remain observations;
the summary does not verify mapping-approval reuse or infer a reason for changes.

Service coverage includes only calendars referenced by trips, with calendar
exceptions applied. Counts and compact date ranges include internal gaps rather
than implying continuous service between the earliest and latest date. Overnight
times remain attached to their source service day. These dates do not establish
approved publication coverage or public-holiday policy.

Independent notice counts and bounded examples come from reports whose invocation
identifies the candidate ZIP hash. Missing findings, invalid candidates, and
unavailable baselines are reported explicitly. If summary generation or artifact
transfer fails, the write job still creates a receipt-only PR identifying the
missing evidence. Full Actions artifacts expire; the committed Markdown and JSON
retain the compact review evidence. Replays preserve existing PRs and their
evidence, including closed PRs, rather than replacing a review's baseline.

After building the CLI, generate the same review locally with:

```sh
GTFS_SNAPSHOT_BASE_URL=https://sources.mrtdown.org \
INDEPENDENT_OUTCOME=success INSPECTION_OUTCOME=success \
node scripts/build-gtfs-snapshot-review.mjs \
  /tmp/new-gtfs-input /tmp/gtfs-independent /tmp/gtfs-review
```

The second argument is the independent validator output directory, including
`invocation.json`, `report.json`, and `system_errors.json`. Step outcomes describe
the supplied execution; they do not replace findings. Optional `REVIEW_RUN_URL`
and `ARTIFACT_URL` preserve links when regenerating an existing capture review.
Inspect the outputs before updating that PR's record and body; do not add the
downloaded `baseline-input` directory to Git.

For a local smoke test after publication:

```sh
npm run build:cli
GTFS_SNAPSHOT_BASE_URL=https://sources.mrtdown.org \
GTFS_CAPTURE_KEY=captures/schedule/<sha256>.json \
GTFS_INPUT_DIR=/tmp/new-gtfs-input \
node scripts/acquire-gtfs-capture.mjs
node packages/cli/dist/index.js gtfs inspect \
  --file /tmp/new-gtfs-input/schedule.zip \
  --capture /tmp/new-gtfs-input/capture.json
```

Use a fresh output directory for each acquisition. Retries do not overwrite
existing local inputs. Private archives and public snapshots have separate
retention decisions; do not expire shared blobs independently from receipts.
