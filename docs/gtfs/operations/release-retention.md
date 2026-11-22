# Rebuildable GTFS release history

Retain compact reviewed inputs and exact revision snapshots for every approved
release. Keep compressed ready bundles for the current and previous releases.
Older generated review/timetable JSON can be rebuilt on demand; a failed rebuild
preserves the ready bundle. This policy covers producer artifacts, not consumer
database retention or mapping/publication approval.

## What is retained

The existing private bucket contains the original source at
`blobs/schedule/<source-sha256>.zip`. Release history references this object and
never copies, replaces or deletes it. Its capture receipt remains in the recipe.

The dedicated `gtfs-release-history/` prefix contains:

| Object | Retention |
| --- | --- |
| `recipes/<sha256>.zip` | Immutable policies, approvals, receipt, expected release index and file hashes |
| `canonical/<sha256>.tar.gz` | Deduplicated canonical topology and holiday data at the recorded Git revision |
| `generators/<sha256>.tar.gz` | Deduplicated source code and dependency lock at the recorded Git revision |
| `records/<release-id>.json` | Immutable recipe references, output hashes and replay proof |
| `bundles/<release-id>.zip` | Current and previous ready bundles only after successful cleanup |
| `index.json` | Current/previous pointers, release identities and pending cleanup |
| `staged.json` | Candidates registered before writing a ready bundle; reconciled after promotion or on retry |
| `writer-lock.json` | Exclusive writer lock during promotion and pruning |

A release ID hashes its two-digest release index. Source hashes alone cannot
identify corrected mappings of the same feed. The ready ZIP contains only
`manifest.json`, `timetable.json`, `release.json` and `release-index.json`.
Routine deployments of the same release reuse the first retained recipe and do
not archive another code snapshot or ready bundle.

See [release recipes](release-recipes.md) for compact input formats and
archived-generator replay.

## Promotion and cleanup

Before promotion, retention replays the freshly packaged recipe in a new
directory, uploads immutable objects, reads them back, and replays the stored
recipe again. Conditional writes and a writer lock preserve the incumbent during
failed preparation or promotion. Before deleting an older ready bundle, it
verifies the saved inputs and repeats the exact historical rebuild. Failed
cleanup leaves the affected bundle and a durable `prunePending` entry for retry.
Retries recheck the current pointer under the lock and use its stored recipe,
without rebuilding it with newer code. Rollbacks also reuse the original retained
recipe. A journal registers each candidate before its bundle is written. Failed
promotions therefore remain discoverable; a subsequent successful promotion or
current-release retry replay-checks and removes abandoned ready bundles while
protecting current/previous. Immutable records for those attempts remain retained.
No recipe, source, code snapshot, canonical snapshot or approval is pruned.

Use Node 24 and the recorded dependency lock. The rebuild command automatically
uses the retained generator instead of the newer running checkout. Keep a
byte-for-byte replay proof before discarding expanded
local JSON. No age or calendar-end rule deletes source material.

## Commands

After `npm ci` and `npm run build:cli`, set `GTFS_RELEASE_RETENTION_BUCKET` and
the scoped `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in the environment. Keep
credentials outside Git and command output.

```sh
node scripts/retain-gtfs-release.mjs /path/to/approved-inputs \
  /path/to/trusted-published-release-index.json /tmp/new-retention-receipt
node scripts/rebuild-gtfs-release.mjs <release-id> /tmp/new-rebuilt-release
```

The first command requires that the input approval and trusted published index
identify the same release. Its receipt directory includes the compact recipe and
retention record. The second command recreates expanded files locally without
changing the current pointer or publishing them. Output directories must be new.

The source must already exist in the crawler's private bucket. Missing or damaged
shared bytes stop retention; fix source retention through the capture pipeline.
Pruned ready bundles are restored by replay, not by editing manifests or hashes.

## Pages adoption

1. Merge the compatible exporter/workflow before changing the active input pin.
2. Provision a separate key with default permissions disabled: read
   `blobs/schedule/*` and `gtfs-release-history/*`; write only
   `gtfs-release-history/*`; delete only `gtfs-release-history/bundles/*` and
   `gtfs-release-history/writer-lock.json`. Do not broaden the existing Pages
   input-read key. Keep the bucket private and the environment restricted to main.
   The [scoped policy document](release-retention-policy.json) records these permissions.
3. Store the key in the `github-pages` environment as
   `MRTDOWN_GTFS_RELEASE_RETENTION_ACCESS_KEY_ID` and
   `MRTDOWN_GTFS_RELEASE_RETENTION_SECRET_ACCESS_KEY`. Set
   `MRTDOWN_GTFS_RELEASE_RETENTION_ENABLED=true` to archive after successful
   public-release verification and site-pull queueing. The workflow's Pages
   concurrency group and the storage writer lock serialize retention.
4. Configure the Actions variable `GTFS_SNAPSHOT_BASE_URL` as the trusted HTTPS
   origin serving both `captures/schedule/<sha256>.json` and
   `blobs/schedule/<sha256>.zip`. Recipe materialization needs both endpoints.
5. With an operator credential, upload the verified recipe ZIP to
   `pages-release-inputs/<recipe-sha256>.zip`. After the compatible workflow has
   merged, set `MRTDOWN_COMBINED_TIMETABLE_INPUT_FORMAT=recipe-zip` and pin its
   hash in `MRTDOWN_COMBINED_TIMETABLE_INPUT_SHA256`. The reader verifies the ZIP,
   materializes policies, and downloads only the referenced source ZIP from the
   configured trusted public origin. It preserves the original approved receipt.
6. Run Pages and verify acquisition, publication, public digests and the site-pull
   handoff. When retention is enabled, also require the retention step to succeed
   and verify that `gtfs-release-history/index.json` names the retained release
   whose `records/<release-id>.json` release index matches the deployed
   `combined-timetable-release-index.json`. Keep the legacy archive and its old
   pin until all these checks pass. Roll back input materialization by restoring
   the old hash and format `tar-gz`; release digests and source review stay unchanged.

An interrupted writer can leave a lock. Confirm that the owning workflow/process
has ended, inspect the lock and current index, then remove only that observed lock
with its ETag precondition and retry. Do not steal a live lock or delete historical
inputs to make cleanup pass. A retention failure after publication requires a
retention retry; it does not roll back an already published release.
