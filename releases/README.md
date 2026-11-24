# Desired releases

`gtfs.json` is the reviewed GTFS timetable to include in ordinary Pages builds.
The capture workflow proposes it in a PR. It contains the source hash and
receipt, mapping and service-date policies, approval evidence, source admission
review, and expected output hashes. Source ZIPs and generated timetable rows
remain outside Git. This directory is not copied into the public data export.

Before the first definition is merged, deployments keep the verified completed
release. Capture inspection can bootstrap a definition of that same release or
propose a qualified successor. After adoption, deleting the definition fails
publication; restore an explicit reviewed definition instead of selecting a
fallback. Retention records completed deployments and does not override Git.

See [GTFS publication](../docs/gtfs/operations/automatic-publication.md).
