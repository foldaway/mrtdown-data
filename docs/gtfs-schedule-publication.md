# GTFS schedule publication and retention

## Reviewed terms

Reviewed on 2026-10-18: LTA's [Singapore Open Data Licence v1.0](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html)
permits copying and adapting datasets and distributing derived applications.
It requires conspicuous source attribution and a link to the current licence,
and prohibits implying official status or endorsement. The grant is perpetual,
subject to its terms; the published licence sets no cache-expiry period.

The [LTA API terms](https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html)
separately govern acquisition. Clause 10(a) allows endpoint-specific conditions;
10(b) requires confidential credentials; 10(e) restricts release before an
Effective Date specified on the API page or otherwise communicated by LTA.
Honour any additional conditions supplied with access or a capture. A GTFS
service start date alone does not establish a release embargo.

These standard terms support retaining licensed schedule fixtures and publishing
derived schedules. This records the standard-terms review, not a claim that
every privately supplied file has been cleared for public release.

Before each publication, check the current licence and API terms against this
review. If their version or terms have changed, hold publication until the new
terms have been reviewed and recorded here with the review date, version and
applicable obligations. Updating the licence link alone does not satisfy this
review. The licence states that continued use accepts a new version.

## Notices in a derived schedule

The scheduled-arrivals exporter must include a human-readable notice
with the artifact and expose the same source information in its manifest:

- LTA DataMall and the dataset name `GTFSScheduleTrain`;
- the source URL and access time from the verified capture;
- the capture's attribution and licence reference, plus the current licence link
  after completing the terms review above if it has changed;
- the capture ID, SHA-256 and immutable archive reference; and
- a separate notice identifying MRTDown's mappings and export metadata under
  `CC-BY-4.0`, as described in [LICENSE-DATA.md](../LICENSE-DATA.md).

The download page and consuming site's schedule view must make the source and
licence link conspicuous. A file hidden beside the download is insufficient
for those interfaces. Label the output as an LTA-derived schedule snapshot,
show its retrieval time and calendar coverage, and identify MRTDown's independent
mapping work. Scheduled times must not be presented as live predictions.

Keep upstream schedule content under its own licence. Direct consumers to LTA's
licence for upstream reuse rights rather than offering the entire export solely
under MRTDown's `CC-BY-4.0` notice.

## Retained inputs and fixtures

Project retention policy is to keep the original bytes and capture receipt
together outside Git while a published artifact or reproducibility audit relies
on them. Record any later removal explicitly; do not silently leave a receipt
pointing to an expired shared blob. The calendar's end date does not by itself
trigger deletion. Private and public storage remain separate decisions, as
described in the [public handoff](gtfs-public-handoff.md).

Use synthetic data for ordinary deterministic tests. Add a real schedule subset
only when it exercises a provider behaviour that synthetic data cannot adequately
demonstrate. Keep it small, retain the source hash, access date, licence notice
and extraction instructions, and identify any modifications. Do not commit a
full ZIP or promote historical files without provenance into licensed fixtures.

## Release conditions

Before exporting publicly, verify the schedule bytes against the capture and
require `rights_status: redistribution_permitted`, a licence reference and
attribution. A receipt's status records the producer's rights decision; a hash
check only verifies file identity. Confirm any additional acquisition conditions
and Effective Date before release. Pending-review captures remain usable for
private inspection without becoming publication inputs.

Publication also requires complete, reviewed mappings and the matching canonical
topology described in the [GTFS plan](plans/active/gtfs-static-realtime.md#phase-3-generate-the-scheduled-arrivals-artifact).
Local departure previews and assignment proposals remain
`generationEligible: false`. The offline
[reviewed bundle exporter](gtfs-timetable-release.md#exporting-a-reviewed-bundle)
now enforces these checks for local file output and retains review and coverage
evidence. The opt-in [Pages integration](gtfs-timetable-release.md#packaging-a-release-for-pages)
adds download-page attribution and includes the reviewed files in both archives.
The consuming site's schedule view still needs its own conspicuous source notice.

The [release-readiness inspector](gtfs-timetable-release.md) now checks supplied
mapping and artifact review records, current terms identities, redistribution
status and the reviewed Effective Date. The exporter uses the same checks.
Its caller must obtain those records from the trusted review workflow and
freshly retrieve the current terms. The Pages builder uses `gtfs release` to
fetch those terms and recheck the original source against the concurrently
packaged canonical data. Default deployment remains without a timetable.
