# GTFS snapshot records

The [capture workflow](../../../.github/workflows/gtfs-capture.yml) adds a
`<sha256>.md` record in the snapshot's review PR. Each record identifies the
source ZIP, capture receipt, validation results, and workflow run. See the
[capture handoff](../operations/public-handoff.md) for the review procedure.
