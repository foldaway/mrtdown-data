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
notified again. A crash after dispatch can cause duplicate delivery; the receiver
only inspects and uploads a report, so replay performs no canonical writes.
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

Acquisition is in the CLI layer, separate from the offline `@mrtdown/fs`
inspector. The workflow invokes that inspector and retains its JSON report as
a GitHub Actions artifact, including reports with structural errors. It has
read-only repository permissions. It does not commit, merge, run models or
publish a scheduled-arrivals artifact. Trusted delivery does not replace
independent GTFS validation or reviewed canonical mappings.

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
