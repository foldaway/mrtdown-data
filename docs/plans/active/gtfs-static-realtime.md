# LTA GTFS Schedule And Realtime Reconciliation Plan

## Context

GitHub issue [#157](https://github.com/foldaway/mrtdown-data/issues/157) asks
for GTFS Static and Realtime support. LTA now supplies first-party train data as
downloaded files:

- a GTFS Schedule archive;
- a GTFS Realtime Trip Updates protobuf; and
- a GTFS Realtime Service Alerts protobuf.

The supplied 2026-08-13 captures remove the need to design this work from the
endpoint documentation alone. The schedule is already a detailed timetable,
the alert feed contains useful canonical-evidence candidates, and the trip
update capture contains no entities. This plan therefore starts with offline
file inspection and reconciliation. It does not start with a synthetic
timetable generator or a live realtime runtime.

`mrtdown-data` remains the reviewed data and schema repository. It can own
snapshot inspection, stable mappings, validation, canonical alert evidence,
and static archive outputs. Account keys, temporary download URLs, polling,
freshness guarantees, and live consumer serving belong in an external producer
or runtime.

Related references:

- `README.md`
- `docs/plans/active/data-licensing-attribution.md`
- `docs/plans/completed/data-overhaul-split.md`
- `packages/core/src/schema/Station.ts`
- `packages/core/src/schema/Service.ts`
- `packages/fs/src/manifest.ts`
- `scripts/build-pages-artifact.mjs`

## Observed 2026-08-13 Captures

This is a structural audit of the supplied files, not a claim about every LTA
publication or the live endpoints' cadence.

### GTFS Schedule

`feed_info.txt` identifies LTA as the publisher, version `0.1`, with a feed
range of 2025-01-01 through 2026-12-31. The archive contains:

| Table | Data rows |
| --- | ---: |
| `agency.txt` | 3 |
| `calendar.txt` | 11 |
| `calendar_dates.txt` | 3 |
| `feed_info.txt` | 1 |
| `routes.txt` | 19 |
| `stops.txt` | 1,211 |
| `trips.txt` | 17,576 |
| `stop_times.txt` | 333,262 |

It does not contain `frequencies.txt`, `shapes.txt`, or `transfers.txt`.

The supplied data has 186 station rows, 434 platform/stop rows, and 591
entrance/exit rows. Every platform/stop and entrance/exit parent reference
resolves. Every trip references a known route and calendar, every stop time
references a known trip and stop, and stop sequences increase within each
trip. No duplicate route, stop, or trip ids were found by the initial audit.

The schedule includes exact trips beyond midnight, short workings, CCL starter
patterns, the EWL airport shuttle, BPLRT loops, and distinct PGLRT and SKLRT
loop patterns. Calendar variants encode the supplied DTL, TEL, and SKLRT
service adjustments. These observations make a frequency-derived MRTDown
timetable unnecessary for the first implementation.

The unzipped snapshot is identified by this per-file SHA-256 manifest:

```text
agency.txt          4eeb1ce0bbc2d3c6fc3236fdbff216e09de31ef3137f23b93d2a8bd144a3cb39
calendar.txt        96b3e06ca532195c11e71909f3d6c55f33437b5a10615b64742557f0b3ce972d
calendar_dates.txt  fa171ae723add6992f250a1d3aada44799d5456dbcdb9e66f2a68b6256f46ab7
feed_info.txt       a22a98f993a3a7e36db57ed63d73fb1db396c872658a27dd68cb78ffdca81199
routes.txt          1e3a56c2d8974d431b7a811ff452f5ccc62d253d4dc6f0bf9e70d44d125f8c6c
stop_times.txt      80a5ea7bae8c9311515e494ee0f21e0735c4f43dede2e7f518ff6a42a7a8169d
stops.txt           5b61242c71b3274d3c218519582c3f255fb61ffb42548a4c51394c2a136dfe73
trips.txt           9a0ba496df57fa0ca13a43690e827d7119c655c0223849cbff80fc6f38be2e54
```

### GTFS Realtime Service Alerts

The supplied `gtfs_realtime.pb` has SHA-256
`63f054a690fa6d0358487af32572d68141cb091683ab193586e55d4638915e02`.
It is a GTFS Realtime 2.0 `FULL_DATASET` generated at
2026-08-13T08:58:04Z and contains two alert entities:

- `alert_0` selects SBST route `SK`, reports `MAINTENANCE` with
  `MODIFIED_SERVICE`, and has a bounded active period. Its text describes the
  temporary Sengkang West LRT Inner Loop closure.
- `alert_1` selects SBST route `DTL`, reports `MAINTENANCE` with
  `MODIFIED_SERVICE`, and has an open-ended active period. Its header is only
  whitespace, while its description supplies the useful DTL adjustment text
  and a human-readable end date.

The first alert links to `www.lta.gov.sg`, which the current rights registry
recognizes. The second links to `go.gov.sg`, which the registry does not yet
recognize. The API transport URL and the alert's rider-facing information URL
must remain separate provenance fields.

The sample shows that provider `active_period` is a feed visibility/applicability
range, not necessarily the same range described in prose. Preserve the
provider range and source text independently; do not infer or overwrite one
from the other before triage.

### GTFS Realtime Trip Updates

The supplied `gtfs_trip_update.pb` has SHA-256
`198dbfb4d4a9cdb537d83862b940e93f549a3f3d9d7f26d5f12952537709e597`.
It is a GTFS Realtime 2.0 `FULL_DATASET` generated at
2026-08-13T09:12:00Z and contains no entities.

This proves only that this capture was empty. It does not prove that the LTA
feed is always empty, nor does it provide enough evidence to design trip
matching, delay propagation, cancellation, freshness, or caching behavior.
Those details are deferred until non-empty captures exist.

## Reconciliation Decisions

### Static schedule role

Treat the LTA schedule as the candidate source for exact scheduled trips,
calendars, platforms, and stop times. Keep canonical MRTDown entities as the
reviewed identity and topology model. Reconcile the two; do not import provider
ids as canonical ids and do not generate an approximate timetable in parallel.

The initial route mapping is many-to-one:

| LTA route ids | MRTDown line id |
| --- | --- |
| `NSL` | `NSL` |
| `EWL`, `EWL_CGL` | `EWL` |
| `NEL` | `NEL` |
| all `CCL_*` routes | `CCL` |
| `DTL` | `DTL` |
| `TEL` | `TEL` |
| `BP` | `BPLRT` |
| `SK` | `SKLRT` |
| `PG` | `PGLRT` |

CRL and JRL are canonical future lines and are absent from this capture.
Provider agencies `SMRT` and `SBST` map explicitly to canonical operators
`SMRT_TRAINS` and `SBS`.

Map station parents and platform children using reviewed station codes and
sequence context. Do not assume names alone are unique or stable. Treat LTA
`service_id` as calendar identity, not as a canonical MRTDown service id.
Derive service-pattern matches from the ordered stop sequence, route,
direction, and applicable calendar, then review ambiguous or unmatched cases.

Mappings must record both the static snapshot manifest and the exact canonical
repository commit used for reconciliation. A new snapshot may reuse provider
ids with changed content, and canonical topology may change while the same
snapshot is reused, so reports must compare normalized records and identify
both input revisions.

### Static publication role

Use a hybrid model: keep canonical MRTDown identity and topology, map the LTA
schedule back to those entities, and publish a compact scheduled-arrivals
artifact for consumers such as `mrtdown-site`. Apply source-backed corrections
to canonical data when reconciliation reveals a genuine canonical error, but
do not rename or reshape canonical entities merely to mirror provider ids.

The scheduled-arrivals artifact contains:

- the LTA snapshot manifest, exact canonical repository commit, mapping
  version, feed range, and `Asia/Singapore` timezone;
- LTA calendars and exceptions without expanding every service date;
- canonical station, line, service, platform, and destination identities;
- scheduled arrival and departure times, preserving GTFS times beyond 24:00;
  and
- provider route, trip, stop, stop-sequence, and calendar identities needed to
  reconcile later Trip Updates.

Publish it as a generated, versioned Pages/archive artifact with its own
manifest hash. It is derived from LTA data and must carry the applicable
attribution and licence notice. Confirm that the LTA terms permit this derived
publication before releasing it publicly. Unchanged-feed redistribution may be
added separately if useful and permitted, but it is not required for the first
consumer.

An MRTDown frequency-derived GTFS feed is not an initial outcome. Reconsider it
only if a later audit identifies a concrete schedule gap that neither the LTA
feed nor the scheduled-arrivals artifact can meet.

### Service alerts role

Service alerts are candidates for the existing issue/evidence/impact path. The
first contract should cover only fields observed in the supplied sample plus
the required GTFS Realtime envelope:

- feed version, incrementality, optional feed timestamp, and retrieval time;
- entity id and selected static snapshot manifest;
- all populated selectors;
- all active periods, preserving open bounds;
- cause, effect, translations, and rider-facing URL; and
- the exact normalized source text used by triage.

Whitespace-only headers fall back to the description for evidence formatting.
The original fields remain in provenance. Route and agency selectors must map
through the versioned static reconciliation; unmatched selectors are retained
for diagnosis and are not guessed.

For the first proof, process complete `FULL_DATASET` snapshots idempotently by
provider, feed type, entity id, and normalized semantic payload digest. Do not
design disappearance-as-resolution behavior until at least two ordered
captures demonstrate the provider's entity lifecycle. Do not accept
`DIFFERENTIAL` feeds until an actual sample and ordering contract are audited.

### Trip updates role

Trip updates remain a runtime concern, not canonical historical evidence. The
only repository work before a non-empty sample is:

- validate the GTFS Realtime envelope;
- record capture and selected-static-snapshot provenance; and
- report entity counts and timestamps without treating an empty feed as an
  error.

Collect non-empty captures during normal service and a disruption or planned
adjustment. Once those exist, write a separate implementation plan from the
observed combinations of trip descriptors, stop-time updates, schedule
relationships, timestamps, and static-feed references. That later plan owns
freshness, precedence, suppression, and cache semantics.

Vehicle positions are out of scope unless LTA publishes them and a consumer
need is identified.

## Ownership Boundary

This repository owns:

- deterministic offline inspection of supplied GTFS files;
- versioned LTA-to-MRTDown mappings and reconciliation reports;
- validation of references, coverage, and mapping drift;
- generation and licensed publication of the scheduled-arrivals artifact;
- the trusted service-alert ingest contract and canonical provenance; and
- deterministic fixtures derived or retained under the applicable licence.

An external producer or runtime owns:

- DataMall account keys and authenticated dataset-link requests;
- prompt download and durable storage of temporary linked files;
- retrieval cadence, retries, and freshness monitoring;
- live trip-update matching and consumer serving; and
- alert polling and ordered delivery to the canonical ingester.

The producer handoff records the LTA dataset or endpoint identity, a
discriminated feed kind (`schedule`, `trip_updates`, or `service_alerts`),
`retrieved_at`, any provider publication timestamp, the file manifest or
digest, an immutable archive reference, and licence attribution. Feed kind is
required even when a realtime file has no entities because its header does not
identify the originating dataset. The handoff never records the account key or
temporary URL.

## Phases

### Phase 1: Make the snapshot audit reproducible

- Add an offline inspector that accepts an unpacked schedule directory or
  downloaded protobuf file; it must not perform network requests.
- Emit a deterministic manifest and a concise JSON report covering feed
  metadata, table counts, reference integrity, route/operator coverage,
  station/platform/entrance counts, calendar range, trip-pattern counts, and
  realtime entity counts.
- Run the inspector against the supplied captures and store the report. Retain
  a local copy only where the licence and repository-size policy permit;
  otherwise keep the full hashes and an immutable archive reference from which
  an authorized maintainer can retrieve and hash-verify the exact input.
- Run an independent GTFS validator against the schedule and record findings
  separately from MRTDown reconciliation warnings.

Exit criteria:

- Given authorized access to either the retained local copy or immutable
  archive, another maintainer can obtain and hash-verify the identified input,
  then reproduce the recorded audit offline. The inspector itself requires no
  credentials or network access after input acquisition.
- Structural GTFS errors and MRTDown mapping gaps are reported separately.

### Phase 2: Add reviewed static reconciliation

- Define a small versioned mapping artifact for agencies, routes, stops, and
  trip patterns, keyed to the source manifest and exact canonical repository
  commit.
- Propose station matches from codes and parent relationships, but require
  review for ambiguity and unmatched records.
- Compare ordered provider trip patterns with canonical service revisions.
- Report future canonical entities absent from the schedule without treating
  them as provider errors.
- Add drift tests using a second schedule capture before claiming provider id
  stability.

Exit criteria:

- Every observed agency and route has a reviewed canonical disposition.
- Every observed station parent and trip pattern is matched, intentionally
  ignored, or listed as unresolved.
- Re-running the same snapshot against the same canonical repository commit
  produces byte-identical mappings and reports.

### Phase 3: Generate the scheduled-arrivals artifact

- Confirm the licence and attribution requirements for retaining fixtures and
  publishing data derived from the downloaded schedule.
- Define and schema-validate the compact calendar and scheduled-departure
  records described above.
- Generate them only from reviewed mappings; unresolved provider records appear
  in the reconciliation report and cannot be silently omitted.
- Include the generated artifact and its hash in the Pages/archive output with
  source provenance, coverage summary, and attribution.
- Keep the generated artifact outside canonical `data/`; canonical entities and
  reviewed mapping inputs remain the sources of MRTDown identity.

Exit criteria:

- Rebuilding from the same LTA snapshot, canonical commit, and mapping version
  produces byte-identical records.
- Every published departure retains enough provider identity to join a future
  Trip Update to one trip and stop occurrence.
- The artifact is clearly labelled as an LTA-derived schedule snapshot, not a
  live feed or an independently observed MRTDown timetable.
- Publication does not proceed until its licence and attribution treatment is
  recorded.

### Phase 4: Consume scheduled arrivals in `mrtdown-site`

- Extend the existing archive pull pipeline to import the artifact by manifest
  hash without replacing canonical station, line, or service tables.
- Select the applicable LTA calendar and service day in Singapore time,
  including after-midnight times greater than 24:00.
- Adapt scheduled records to the existing station-arrivals read model, grouped
  by canonical station, line, service, destination, and platform.
- Use exact scheduled departures where mapping coverage exists. Fall back to
  the current frequency estimates only for a recorded coverage gap; do not mix
  an approximate estimate into a covered schedule as though it were LTA data.
- Preserve an explicit departure basis and snapshot provenance through the API
  and UI. Document and test how the existing crowd-report overlay is displayed
  before allowing it to replace a scheduled time.

Exit criteria:

- A station page can return the next scheduled departures from the supplied
  LTA snapshot using MRTDown station and service ids.
- Platform, destination, service-day, calendar-exception, and after-midnight
  fixtures produce the expected departures.
- Unmapped or stale/out-of-range snapshot data degrades explicitly to the
  existing frequency behavior or no result.

### Phase 5: Prove service-alert ingestion

- Add a trusted ingest-contract fixture representing the two supplied alerts,
  subject to the confirmed fixture-retention terms.
- Map the observed agency and route selectors through the selected static
  reconciliation.
- Format whitespace-only headers, descriptions, URLs, causes, effects, and
  open/bounded active periods deterministically.
- Extend the rights registry or resolve its URL policy for `go.gov.sg` before
  a canonical evidence record uses that URL.
- Persist accepted alerts as ordinary evidence with versioned GTFS source
  metadata; keep raw protobuf retention a separate licence/storage decision.
- Prove identical complete snapshots do not create duplicate evidence.

Exit criteria:

- Both observed alert shapes validate and produce deterministic normalized
  candidates.
- Unmatched selectors and unclassified source URLs fail safely without model
  calls or canonical writes.
- The ingest path preserves provider periods and prose without conflating
  their dates.

### Phase 6: Observe trip updates before designing runtime behavior

- Record the empty supplied capture as a valid zero-entity fixture.
- Collect multiple non-empty captures paired with the exact static schedule
  version used by LTA at that time.
- Measure update cadence and enumerate the fields and enum values LTA actually
  emits.
- Open a focused implementation plan for live trip updates only after this
  corpus exists.

Exit criteria:

- At least one normal-service and one changed-service non-empty capture can be
  reconciled to an identified static snapshot.
- Freshness, matching, cancellation, and fallback rules are based on observed
  provider behavior rather than hypothetical GTFS Realtime combinations.

## Open Questions

- What LTA terms apply specifically to retaining the downloaded train files and
  publishing a mapped scheduled-arrivals artifact?
- How stable are route, stop, trip, and calendar ids across schedule releases?
- Does LTA publish a schedule version or timestamp outside `feed_info.txt` that
  should identify the static snapshot?
- Is the open-ended DTL alert period intentional provider behavior, and how do
  entities change or disappear across consecutive complete alert snapshots?
- When and under what operating conditions does the trip-update file contain
  entities?
- Should fresh crowd reports replace one scheduled departure, or remain a
  separate community estimate alongside the LTA schedule?

## Progress Log

- 2026-05-27: Created the initial plan from issue #157.
- 2026-08-12: Reoriented the plan around LTA's documented train GTFS download
  endpoints and an external credentialed producer.
- 2026-08-13: Audited supplied schedule, service-alert, and trip-update files.
  Replaced speculative synthetic-timetable and trip-update runtime design with
  measured static reconciliation, a narrow alert-ingest proof, and a non-empty
  trip-update capture gate.
- 2026-08-14: Selected a concrete first consumer: map the LTA schedule to
  canonical MRTDown identities, publish a scheduled-arrivals artifact, and use
  it as `mrtdown-site`'s exact schedule baseline.

## Decision Log

- Keep authenticated download, polling, and live serving outside this
  repository.
- Use LTA's exact schedule as the candidate timetable source; do not build an
  MRTDown frequency-derived feed in the initial scope.
- Keep provider ids separate from canonical MRTDown ids through versioned
  mappings.
- Publish a compact LTA-derived scheduled-arrivals artifact keyed by canonical
  MRTDown identities, while retaining provider trip and stop identities for
  later realtime joins.
- Start canonical realtime work with service alerts because the supplied sample
  maps to the existing evidence model.
- Defer trip-update runtime semantics until non-empty provider captures exist.
- Keep vehicle positions out of scope.

## Validation

Implementation phases must keep these deterministic checks truthful:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run data:validate`
- `npm run pages:build` when publication changes
- `npm run check`

Live downloads and paid model evals are never part of the deterministic check
suite.
