# GTFS snapshot records

The [capture workflow](../../../.github/workflows/gtfs-capture.yml) adds a small
`<sha256>.json` receipt and `<sha256>.md` summary in each snapshot review PR.
The receipt identifies the source ZIP, validation outcome, explicit comparison
baseline, table counts, workflow run and archived full reports. The summary opens
with affected lines/dates, journey counts and notable time changes. The publication
section retains the checked no-op proof or explains the publication hold.

Full journey comparisons, expanded service dates, validation findings and detailed
Markdown are stored as content-addressed assets in monthly GitHub Releases named
`gtfs-capture-reports-YYYY-MM`. The receipt binds each asset's URL, SHA-256 and byte
length. The archive verifies GitHub's stored digest and size before producing a
receipt, never replaces assets, and never marks an archive as the latest release.
These assets outlive Actions artifact retention; retain them while their capture
records are referenced. They use the existing workflow's `contents: write` permission.

JSON receipts are limited to 16 KiB, summaries to 12 KiB, and final Markdown with
publication evidence to 32 KiB. Larger evidence stays in the archive. Archive
failures produce an unavailable-comparison Markdown record and cannot qualify a
release definition or automatic no-op merge. Partial archive outputs are ignored.
Retries refresh compact receipts; earlier receipts stay in Git history and full
reports stay in the archive. Existing large records are not bulk-migrated and no
Git history is rewritten. A successful replay replaces that capture's current
record with the compact format.

A qualifying review also changes `releases/gtfs.json`; merging that definition
selects the reviewed timetable for the standard Pages deployment. An evidence-only
record leaves the desired release and comparison baseline unchanged. See the
[capture handoff](../operations/public-handoff.md) for the review procedure.
