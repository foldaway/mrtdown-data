# GTFS snapshot records

The [capture workflow](../../../.github/workflows/gtfs-capture.yml) adds a
`<sha256>.md` record in the snapshot's review PR. Each record identifies the
source ZIP, capture receipt, validation findings, and workflow run. New records
include compact `<sha256>.json` evidence and compare table changes and effective
service dates against the explicit [baseline](baseline.json). A plain-language
opening identifies affected lines/dates, journey counts and notable time changes;
expandable details provide named stopping patterns and exact time examples.
Merging a record
does not advance that baseline, approve mappings, or publish a timetable. See the
[capture handoff](../operations/public-handoff.md) for the review procedure.
