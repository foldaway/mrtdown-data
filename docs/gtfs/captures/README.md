# GTFS snapshot records

The [capture workflow](../../../.github/workflows/gtfs-capture.yml) adds a
`<sha256>.md` record in the snapshot's review PR. Each record identifies the
source ZIP, capture receipt, validation findings, and workflow run. When report
generation and artifact transfer succeed, new records
include compact `<sha256>.json` evidence and compare table changes and effective
service dates against the explicit [baseline](baseline.json). A plain-language
opening identifies affected lines/dates, journey counts and notable time changes;
expandable details provide named stopping patterns and exact time examples.
Unavailable findings or comparisons are labelled in the report.
Failures produce a receipt-only Markdown record with an unavailable-summary
notice; no JSON evidence or baseline comparison is promised for that fallback.
Merging a record does not advance that baseline, approve mappings, or publish a
timetable. See the
[capture handoff](../operations/public-handoff.md) for the review procedure.
