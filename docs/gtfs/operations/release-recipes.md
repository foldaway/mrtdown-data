# Replayable GTFS release recipes

A compact recipe retains reviewed policies, approvals and the capture receipt.
The source ZIP, canonical data and generator source are addressed by their hashes.
Generated review and timetable JSON can be rebuilt instead of copied into every
input bundle. Exactly one saved `draft` or `draftSha256` remains required.

`prepareReleaseRecipe` verifies the approved inputs, snapshots canonical data and
the generator's dependency lock, then requires an exact historical replay before
returning a recipe and ready bundle. The release ID hashes the approved two-digest
release index, so corrected mappings of the same source remain distinct releases.

## Desired release in Git

The [publication workflow](automatic-publication.md) commits a readable compact
definition at `releases/gtfs.json`. It holds policies and approval evidence as JSON,
references the source ZIP by hash, and identifies the expected generated release.
The standard Pages builder materializes those inputs from its Git checkout.
Unlike archived retention recipes, this definition expresses the desired next
release; retention's current/previous pointers describe successful deployments.
Generated timetable rows and source ZIPs remain outside Git in both formats.

## Historical replay

Replay verifies every retained object, extracts the archived generator, installs
its locked dependencies with lifecycle install scripts disabled, builds its
packages and executes its historical exporter in a separate process. Publisher
credentials are excluded. Replay uses the current Node runtime; the recorded
Node version is provenance. A rebuild succeeds only when its release index and
output hashes match the approved release. Dependency installation may need the
package registry or a populated npm cache.

The historical exporter uses the approved release instant and terms identities,
requires the independently approved release index and evidence, and compares the
manifest, timetable and evidence hashes. It acquires no current source or terms
and does not authorize publication. Ordinary Pages export still checks fresh
terms and current publication eligibility.

## Materializing compact inputs

After `npm ci` and `npm run build:cli`, use the Node version in `.nvmrc`:

```sh
node scripts/materialize-gtfs-release-recipe.mjs /path/to/recipe.zip /tmp/new-inputs
```

Set `GTFS_SNAPSHOT_BASE_URL` to the trusted HTTPS origin serving both
`captures/schedule/<sha256>.json` and `blobs/schedule/<sha256>.zip`. Materialization
verifies the recipe and referenced source, preserves the approved receipt, and
requires a new output directory. Retain a byte-for-byte replay proof before
discarding expanded local JSON. No calendar-end rule deletes source material.
