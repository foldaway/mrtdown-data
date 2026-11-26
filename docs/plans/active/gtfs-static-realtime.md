# Prove GTFS realtime evidence ingestion

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Turn captured LTA service alerts into ordinary, attributable canonical evidence.
Establish what trip updates actually contain before designing a live arrival
runtime. The delivered static-schedule work is recorded in the
[completed implementation](../completed/gtfs-static-schedules.md); use the
[GTFS guides](../../gtfs/README.md) for timetable operations.

## Progress

- [x] (2026-10-14) Reproduce the historical schedule and realtime audit with
  hash-verified files and the pinned independent schedule validator.
- [x] (2026-11-26) Check the current realtime inspector and ingest boundaries:
  envelope inspection exists; a GTFS alert payload is not yet in the shared
  ingest contract. This is a source audit, not a live ingestion test.
- [ ] Implement and deterministically prove normalization, selector mapping,
  rights resolution, and duplicate-safe canonical service-alert ingestion.
- [ ] Record normal-service trip-update observations and obtain multiple
  nonempty disruption or planned-adjustment captures paired with static inputs.
- [ ] Use those captures to decide whether a separate runtime plan is justified.

## Surprises & Discoveries

The [August audit](../../gtfs/operations/local-inspection.md#historical-august-audit)
reproduced two service alerts and an empty trip-update feed. Exact file hashes
and report identities are in the [aggregate audit](../../gtfs/reviews/audits/gtfs-historical-audit.json).
The original download receipt and immutable remote archive are unavailable;
reproduction requires authorized access to those exact files.

One alert selects SBST route `SK`, with a bounded period describing Sengkang
West Inner Loop maintenance. The other selects `DTL`, has a whitespace-only
header and an open-ended provider period, while its description includes a human
end date. Provider periods and prose must remain independent. One rider-facing
URL uses `go.gov.sg`, which has no matching rule in the inspected source registry.

An empty trip-update sample proves only that sample was empty. It supplies no
basis for matching, cancellation, delay propagation, freshness, or cache rules.

## Decision Log

- 2026-08-13: Start with observed alert shapes. Defer trip-update runtime
  semantics until nonempty evidence exists; vehicle positions remain out of scope.
- 2026-08-14: Keep provider identities separate from canonical identities through
  reviewed static mappings. Exact schedules are the scheduled-arrival baseline.
- 2026-11-26: Separate completed static-schedule milestones from this remaining
  realtime proof. Earlier decisions and the full chronology remain in the
  [original plan](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/active/gtfs-static-realtime.md).

## Outcomes & Retrospective

Offline realtime envelope inspection is available. Canonical alert ingestion
and useful trip-update behavior remain unproved. No live capture, paid evaluation,
canonical ingestion, or runtime deployment was performed during this docs review.

## Context and Orientation

[Issue #157](https://github.com/foldaway/mrtdown-data/issues/157) covers static and
realtime support. A protobuf capture is the provider's binary feed snapshot.
A selector identifies the route, agency, stop, or trip affected by an alert;
reconciliation maps those provider identifiers to reviewed MRTDown entities.

Start from these owning sources:

- `packages/fs/src/gtfs/realtime.ts` decodes and audits complete GTFS Realtime 2.0
  feeds. It rejects differential feeds and unexpected entity shapes, preserves
  timestamps as decimal strings, and reports sorted entities.
- `packages/ingest-contracts/src` owns producer payloads;
  `packages/triage/src/util/ingestContent` owns deterministic evidence formatting.
  The [triage guide](../../../packages/triage/README.md) describes paid ingestion
  and read-only regression inspection.
- `data/rights/source-registry.json` and `packages/fs/src/rights.ts` own source
  classification. The acquisition endpoint and the alert's rider-facing URL
  are separate provenance fields.
- The [mapping review guide](../../gtfs/reviews/README.md) owns static mapping
  scope. Never guess an unmatched selector from a label.

The external crawler owns account keys, temporary URLs, polling, immutable
source retention, and ordered delivery. This repository owns offline inspection,
the trusted alert-ingest contract, canonical provenance, and deterministic
fixtures permitted by the retention policy. A live runtime owns trip-update
matching and serving. A capture handoff must identify feed kind even for an
empty feed, source digest, acquisition time, selected static inputs, archive
reference, and attribution; never persist account keys or temporary URLs.

## Plan of Work

### 1. Prove alert normalization and selector reconciliation

Inspect the retained alert bytes with Concrete Steps and the linked audit guide.
Keep raw protobuf retention and fixture rights separate from the normalized
contract. Add a fixture for both observed shapes under the confirmed terms.
Extend the shared payload schema and formatter only after specifying the
versioned GTFS provenance that canonical evidence must retain.

Preserve the envelope version, incrementality, provider and retrieval timestamps,
entity id, static snapshot identity, mapping version, populated selectors, all
active periods and open bounds, cause/effect, translations, rider URL, and exact
source text used by triage. A whitespace-only header falls back to description
for display while provenance retains the original fields. Resolve `go.gov.sg`
policy before accepting canonical evidence that uses it.

Acceptance: both shapes produce stable candidates; unknown selectors and
unclassified source URLs stop before model calls or canonical writes. Add
focused deterministic tests in the owning contract, formatter, and mapping
modules. The focused contract, filesystem, and triage checks in Concrete Steps
must pass.

### 2. Prove remapping and canonical-write idempotency

Use separate identities for processing and writing. The processing identity
contains provider, feed kind, static snapshot, mapping version, entity id, and
normalized payload digest. A changed mapping must rerun reconciliation.
The canonical-write identity contains provider, feed kind, entity id, and the
digest of normalized alert semantics plus mapped canonical scope.

Process fixtures against a temporary data root through the existing evidence
pipeline. Identical complete snapshots must not duplicate evidence. A mapping
refresh with unchanged mapped semantics references the existing evidence;
a changed canonical scope appends one update. Preserve provider periods and
prose independently. Do not infer resolution from disappearance without ordered
captures demonstrating the lifecycle, or accept differential feeds without an
audited ordering contract.

Acceptance: repeated processing and remapping leave evidence and impacts
unchanged unless mapped semantics change. Invalid input leaves the temporary
data unchanged. Document any paid end-to-end replay separately and run it only
as an intentional evaluation. Persist accepted alerts through the ordinary
canonical evidence path, not a new writer.

### 3. Build an observed trip-update corpus

Keep the valid empty August sample as the initial observation. The acquisition
producer must collect normal-service observations, including empty feeds, and
multiple nonempty disruption or planned-adjustment samples. Pair each with the
exact static source LTA used. Record field/enum combinations, timestamps, and
measured cadence without claiming unobserved behavior.

Acceptance: each nonempty sample reconciles to identified static inputs. A
later runtime plan may then specify matching, cancellation, freshness, fallback,
and caching from evidence. Until then, keep repository work to envelope validation,
capture/static provenance, and counts. Do not implement speculative live serving.

## Concrete Steps

Historical reproduction requires authorized copies matching the aggregate
audit, the pinned validator executable, and new output directories. From the
repo root, substitute the actual local paths before running:

```sh
npm run build:fs
node scripts/audit-gtfs-historical.mjs /absolute/path/gtfs_schedule /absolute/path/gtfs_realtime.pb /absolute/path/gtfs_trip_update.pb /tmp/new-historical-audit
node scripts/validate-gtfs-independent.mjs /absolute/path/gtfs-validator-8.0.1-cli.jar /tmp/new-historical-audit/schedule-repacked.zip /tmp/new-historical-independent
```

These steps write local reports/repacked data, not canonical evidence. Expect
the historical counts of two alerts and zero trip updates, with input hashes
matching the [audit guide](../../gtfs/operations/local-inspection.md#historical-august-audit).
They do not establish present-day feed behavior. After implementation, run:

```sh
npm run test:ingest-contracts
npm run test:fs
npm run test:triage
npm run check
TZ=UTC npm test
```

Expect passing contract, mapping, formatting, and idempotency cases. For changes
to canonical fixtures/source policy also run `npm run data:validate`; for export
changes run `npm run pages:build`. All commands use the repo root. A canonical
alert-ingest invocation depends on the unfinished contract and must be recorded
when it exists; no live or paid ingestion is implied by these checks.

## Validation and Acceptance

The checks in Concrete Steps must pass. Historical reproduction needs the
identified inputs; deterministic tests must not require credentials, network
downloads, or paid models.

Close this plan only after the alert path has deterministic normalization,
rights, mapping, and both idempotency proofs, and the trip-update investigation
records its evidence and next decision. Local implementation, capture inspection,
and observed production operation must be reported separately.

## Idempotence and Recovery

Implement the separate processing and canonical-write identities specified in
milestone 2. A repeat or mapping refresh with unchanged mapped semantics must
not append evidence or impacts. Invalid selectors or unresolved source rights
stop before writes; failed candidates leave temporary data unchanged.

Keep original bytes and provenance available for reinspection, and use new
report directories for historical replay. Do not turn a missing alert into a
resolution, accept a differential feed, or guess a selector to recover a failure.
Any future canonical ingestion must use the ordinary evidence path and document
partial-write recovery before live activation.

## Artifacts and Notes

The aggregate audit linked in Surprises & Discoveries is obtained historical
evidence. Still required: permitted alert fixtures, deterministic normalization
and remapping proofs, canonical-write idempotency results, and multiple nonempty
trip-update captures with exact static-source identities. Distinguish unavailable
original acquisition metadata from retained file hashes; do not fabricate receipts.

## Interfaces and Dependencies

The inspector in `packages/fs/src/gtfs/realtime.ts`, shared producer schemas,
evidence formatter, reviewed static mappings, and rights resolver form the
boundary. Specify the versioned alert payload before extending the shared
contract; required provenance is described in milestone 1. Preserve compatibility
with ordinary evidence persistence. The acquisition producer owns ordered delivery
and retained provider bytes; live trip-update behavior requires a separate runtime
contract after the capture investigation.
