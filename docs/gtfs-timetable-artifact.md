# Scheduled timetable artifact files

The artifact preparation helpers wrap a [compact assigned timetable](gtfs-assigned-timetable.md)
in reproducible files with source attribution and integrity checks. They prepare
bytes in memory; the publication workflow and site importer remain to be built.

## Manifest

`@mrtdown/core` exports `ScheduledTimetableArtifactMetadataSchema`,
`ScheduledTimetableArtifactManifestSchema` and their inferred types. Required
metadata includes:

- `schemaVersion: 1` and `documentKind: "scheduled-timetable-artifact"`;
- a positive integer `correctionRevision`;
- the original schedule `capture`, including attribution, rights status and
  its licence reference;
- reconciliation `identity`: source-table hashes, canonical commit and versioned
  topology fingerprint;
- `mapping`: a version label, mapping-draft hash and normalized assignment hash;
- an inclusive `feedRange` with ISO start and end dates;
- original `sourceFeedInfo` rows, retaining provider fields as strings; and
- `currentLicenceReference` from the applicable terms review and
  `mrtdownLicence: "CC-BY-4.0"` for MRTDown's contributions.

The manifest adds `timetable` and `notice` entries, each with a SHA-256 and exact
byte length. Unknown fields, other capture kinds/endpoints, unsupported format
versions, malformed hashes and reversed feed ranges fail validation.

The shared `GtfsCaptureSchema` and `GtfsReconciliationIdentitySchema` now live
in `core`. Existing `fs` names `CaptureSchema`, `GtfsCapture`,
`ReconciliationIdentitySchema` and `ReconciliationIdentity` retain their contracts.

## Preparing and verifying bytes

`@mrtdown/fs` exports:

```ts
const prepared = prepareScheduledTimetableArtifact(timetable, metadata);
const verified = verifyScheduledTimetableArtifact(
  prepared.manifestBytes,
  trustedManifestSha256,
  {
    timetableBytes: prepared.timetableBytes,
    noticeBytes: prepared.noticeBytes,
  },
);
```

Preparation validates both inputs and returns `manifest`, `manifestBytes`,
`manifestSha256`, `timetableBytes`, `noticeBytes` and `generationEligible: false`.
Manifest and timetable bytes are UTF-8 compact JSON without a trailing newline.
The notice is UTF-8 text ending in one newline. All digests cover exact file
bytes; adding whitespace changes the corresponding digest. Identical inputs
produce identical bytes, without inserting a build timestamp.

The notice carries the capture's attribution, source and access time, original
and current licence links, declared feed range and MRTDown's separate data
licence. It labels the data as an independently mapped schedule snapshot and
distinguishes scheduled times from live predictions.

Verification requires an expected manifest digest from a trusted index or
another independently trusted source. Reading that digest from the same
untrusted bundle does not establish trust. It checks the manifest hash before
decoding it, then checks both companion files' sizes and hashes. It decodes the
timetable as strict UTF-8 and validates its complete content schema before
returning `{ manifest, timetable }`. Neither helper fetches archive references
or writes files.

## Publication and import checks

Callers must first verify the original capture and assignments against the
declared source and canonical topology, as in the existing timetable preview.
These helpers check structure and file integrity; supplied provenance, mapping
labels, feed range and provider fields still need validation against those
inputs. Pending-review captures and incomplete or unapproved allocations are
permitted for local preparation and retain their original rights status.

Before public release, a generator must enforce complete reviewed mappings,
capture-specific release conditions and the [publication policy](gtfs-schedule-publication.md),
including a fresh recorded review of changed licence/API terms and conspicuous
attribution in download and consuming interfaces. These helpers do not enable release.

An importer must also verify canonical references/topology, source lineage and
revision conflicts as described in the [GTFS plan](plans/active/gtfs-static-realtime.md#phase-4-consume-scheduled-arrivals-in-mrtdown-site).
A positive revision alone does not establish that it supersedes another
artifact. Retrieval time and an opaque provider version string do not establish
source ordering. Existing previews, coverage and publication eligibility remain
unchanged.

A local check wrapped the retained October preview twice and produced identical
manifest, timetable and notice bytes. Verification preserved its
`e2fc66e75994c04f93d54dec55bd711d9cf5d170f1698b5ab730ab15e89c1d3c`
content digest and all 19,150 source trips. This used proposal metadata and
remained ineligible for generation.
