# Public GTFS snapshot handoff

## Architecture

`mrtdown-data-crawler` downloads original files into private R2. Its opt-in
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

The crawler records notification state only in private R2. Failed notifications
remain pending and are retried on subsequent enabled DataMall polling runs.
A bounded batch of 20 avoids unbounded catch-up. Successful hashes are not
notified again. A crash after dispatch can cause duplicate delivery; the receiver
only inspects and uploads a report, so replay performs no canonical writes.
Published alerts/trip updates do not dispatch to the schedule workflow.

## Provisioning

Create **`mrtdown-gtfs-public`** as an R2 Standard bucket. Attach a custom domain,
for example **`snapshots.mrtdown.org`**, using bucket Settings → Custom Domains.
Keep `r2.dev` access disabled; the production URL is the custom domain. No R2 API
credentials are required by `mrtdown-data` for this handoff.

The crawler config declares `GTFS_PUBLIC` in both environments. After the bucket
exists and the domain is active:

1. Set the GitHub Actions repository variable `GTFS_SNAPSHOT_BASE_URL` in
   `foldaway/mrtdown-data` to the HTTPS origin, e.g.
   `https://snapshots.mrtdown.org` (no path/query).
2. Land `.github/workflows/gtfs-capture.yml` on the default branch before enabling
   notifications; repository dispatch workflows run from the default branch.
3. Enable `GTFS_PUBLICATION_ENABLED` in crawler production and deploy deliberately.
4. Confirm `/index.html` and an original blob/capture pair are accessible.
5. Enable `GTFS_NOTIFICATION_ENABLED` and deploy. Reuse the existing crawler
   `GITHUB_ACCESS_TOKEN` with repository-dispatch permission for `mrtdown-data`.
   Confirm its presence/permission in the crawler; no extra secret is invented.

Everything is implemented locally; none of these resources, repository variables,
pushes or deployments are performed by this change.

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
GTFS_SNAPSHOT_BASE_URL=https://snapshots.mrtdown.org \
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
