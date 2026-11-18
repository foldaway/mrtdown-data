# Pages exports

From the repository root, build the static export:

```bash
npm run pages:build
```

This writes `pages-dist/` with browsable JSON records, a manifest, and ZIP and
TAR archives. It validates the exported data and redacts source text and
rendered content when the source registry disallows public export. Generated
test data appears under `fixtures/` in the same bundle.

The build can also include a reviewed GTFS timetable with source attribution
and release checks. See [combined timetable packaging](../gtfs/operations/timetable-release.md#packaging-an-approved-combined-release-for-pages)
and [legacy timetable packaging](../gtfs/operations/timetable-release.md#packaging-a-release-for-pages).
Default builds omit the timetable. Local consumers can query
[retained scheduled departures](../gtfs/reference/retained-departures.md) across service
days, with source provenance and explicit missing coverage.

For relevant changes, CI builds branch and pull request previews as temporary
artifacts. The [Pages deployment workflow](../../.github/workflows/pages-deploy.yml)
publishes from `main`, then asks [mrtdown-site](https://github.com/foldaway/mrtdown-site)
to import the new archive. The site serves the runtime API. See the workflow
for the required site URL and token secrets.
