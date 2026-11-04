# Shared public holidays

`data/public-holiday/SG-<year>.json` is the canonical Singapore public-holiday
calendar for one complete civil year. The initial import restores 104 dates
across 2020–2027 from MOM's
[consolidated public holidays dataset](https://data.gov.sg/datasets/d_8ef23381f9417e4d4254ee8b4dcdb176/view),
updated 3 July 2026 and checked 4 November 2026. This is the same dataset used by
the site's existing public-holiday sync. The previous legacy
`data/source/public_holidays.json` is not restored.

Each year record carries its country, inclusive coverage bounds, named dates,
source and licence links, check date, revision and exact source-response hash.
`observed` means that the source explicitly labels the entry `(Observed)`; the
importer does not invent substitute dates. Coverage comes from the official
consolidated list, rather than extrapolating from other years. Years absent from
the canonical collection remain unknown. The schema rejects duplicate dates,
dates outside the year and conflicting year IDs/bounds.

## Refresh from the existing upstream source

Capture the complete official response, then inspect the proposed years before
applying them:

```sh
curl --fail --output /tmp/public-holidays.json \
  'https://data.gov.sg/api/action/datastore_search?resource_id=d_8ef23381f9417e4d4254ee8b4dcdb176&limit=500'
npm run data:import:public-holidays -- /tmp/public-holidays.json \
  --checked-on 2026-11-04 --source-updated-on 2026-07-03
npm run data:import:public-holidays -- /tmp/public-holidays.json \
  --checked-on 2026-11-04 --source-updated-on 2026-07-03 --apply
npm run data:validate
```

Use the actual access date and the dataset page's update date for each refresh.
The importer accepts only a successful complete response for the consolidated
resource ID. It rejects partial pages, invalid civil dates and duplicate dates
before writing anything. If the source grows beyond the requested page limit,
obtain a complete capture before importing. `--apply` writes the represented
years; it does not delete older canonical years absent from the response.
All year files are staged before canonical replacements begin, so a staging
failure leaves existing calendars untouched. The final replacements are per-file
renames, not one atomic transaction; a failure during that phase can leave a
partially applied import. Rerun the complete import after resolving the failure.
Review the data diff and commit it separately from implementation changes.
There is no automatic refresh or publication in this change.

The initial source response has 104 records, 8,139 bytes and SHA-256
`de9572cad1548159b805cff8086d48195a01826e399e366a0ba9cdc7db0e2d03`.
Each calendar's `source.recordCount` counts that year's dates;
`source.retrievedRecordCount` counts the full response. Each file pins the same
full response bytes. Large raw captures can remain outside Git because the
canonical year files retain the normalized records and source identity.

## Read and publish

The normal entity commands support the collection:

```sh
node packages/cli/dist/index.js list public-holiday
node packages/cli/dist/index.js show public-holiday SG-2026
node packages/cli/dist/index.js validate --scope public-holiday
```

`PublicHolidayCalendarSchema` and `PublicHolidayCalendar` are shared core
exports. `@mrtdown/fs` supports `readEntity`, `listEntities`, `writeEntity` and
`MRTDownRepository.publicHolidays`. Manifest `publicHolidays` entries hash each
complete year record, and normal Pages artifacts include the files, index links
and archives. The new manifest section is optional when reading older exports.

[GTFS holiday-date review](gtfs-nel-holiday-date-review.md) reads `SG-2026` from
this canonical collection and pins its digest in the transport policy. Changing
the holiday data requires updating that policy and regenerating the review.
The holiday dates themselves imply no rail timetable, holiday-eve extension,
extra train, engineering closure or publication approval.

The website currently still has its existing data.gov.sg-to-database sync.
Adopting the canonical export there is a separate consumer migration after the
shared package/data contract is available. This change makes the data available
for that migration without coupling offline GTFS generation to the site's
running database.
