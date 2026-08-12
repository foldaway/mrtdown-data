# GTFS Static And Realtime Support Plan

## Context

GitHub issue [#157](https://github.com/foldaway/mrtdown-data/issues/157) asks
for "Support GTFS Static/Realtime". The issue has no body or comments, so this
plan turns that title into an implementation path that fits the current
`mrtdown-data` repository shape.

LTA DataMall now publishes first-party train feeds in both GTFS Schedule and
GTFS Realtime formats. This removes the largest uncertainty behind the original
plan: MRTDown no longer needs to invent a public timetable before it can work
with GTFS. The official feeds should be treated as upstream observations to
inspect, reconcile, and preserve with provenance—not as a replacement for the
reviewed canonical model.

`mrtdown-data` is a canonical reviewed data repository. It owns rail entities,
service topology, issue evidence, impact events, shared schemas, file-backed
repositories, ingest contracts, and static Pages/archive publication. It does
not run a low-latency runtime API. GTFS static support can be generated and
published from this repo. GTFS Realtime support needs clearer boundaries:
schemas, id mapping, validation, and canonical issue/evidence integration can
live here, while live polling, alert fanout, freshness guarantees, and consumer
serving should remain in runtime systems or external producers.

Related references:

- `README.md`
- `docs/plans/completed/data-overhaul-split.md`
- `packages/core/src/schema/Station.ts`
- `packages/core/src/schema/Service.ts`
- `packages/fs/src/manifest.ts`
- `scripts/build-pages-artifact.mjs`
- [LTA DataMall API User Guide](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf)

## LTA Feed Investigation

As of 2026-08-12, DataMall exposes three authenticated dataset-link endpoints:

| Dataset | Endpoint | Returned download |
| --- | --- | --- |
| Train schedule | `GTFSScheduleTrain` | GTFS Schedule zip archive |
| Train trip updates | `GTFSRealtimeTrainTripUpdates` | GTFS Realtime Protocol Buffer |
| Train service alerts | `GTFSRealTimeTrainServiceAlerts` | GTFS Realtime Protocol Buffer |

Requests go to
`https://datamall2.mytransport.sg/ltaodataservice/<endpoint>` and require a
DataMall `AccountKey` header. The JSON response is a dataset-link envelope with
an optional provider publication timestamp and a temporary pre-signed download
URL. Consumers must fetch the linked object promptly rather than persisting the
URL and must use their required `retrieved_at` value when the provider omits a
timestamp. Account keys and provider-specific download/retry behavior belong in
an external producer, not this repository or its CI.

The external producer's durable snapshot handoff must record `retrieved_at`, a
provider-supplied publication timestamp only when one is present, the hash
algorithm and digest, an immutable archive id or URI, and the applicable
licence attribution. It must retain the exact hashed archive in an authorized
immutable store so the audit can be reproduced offline. The handoff record must
not contain the `AccountKey` or the temporary download URL.

The schedule endpoint is the authoritative candidate source for exact trips,
stop times, calendars, and provider GTFS ids. The trip-update feed is the
authoritative candidate for live departure changes. The service-alert feed is
the best fit for MRTDown's existing issue evidence path. Before implementation,
capture representative feed snapshots under the applicable data licence and
audit their actual files, ids, coverage, update cadence, and referential
integrity. The endpoint contract alone is not enough to assume that every MRT,
LRT, platform, calendar exception, or disruption is represented.

This changes the plan in three important ways:

1. ingest and validate an LTA static snapshot before designing an MRTDown GTFS
   exporter;
2. build an explicit, versioned mapping between LTA GTFS ids and canonical
   MRTDown ids instead of assuming MRTDown ids should become public GTFS ids;
3. use canonical frequency estimates only as a documented fallback or
   comparison dataset where the official schedule has a demonstrated gap.

## Goals

- Import, validate, and reconcile LTA's official GTFS Schedule feed against
  canonical line, station, operator, and service data.
- Decide from a measured feed audit whether publication should mirror the LTA
  feed, publish an MRTDown-derived feed, or publish only reconciliation data.
- Keep GTFS ids stable, deterministic, documented, and traceable back to
  canonical MRTDown ids.
- If the audit justifies an MRTDown feed, publish it through the existing
  Pages/archive artifact without obscuring its relationship to LTA's feed.
- Add validation that catches stale generated GTFS output and broken references.
- Define the GTFS Realtime ownership boundary before adding live-feed behavior.
- Support GTFS Realtime service-alert ingestion as canonical evidence when an
  external producer submits reviewed or trusted realtime observations.
- Keep deterministic tests separate from any live feed, network, or model calls.

## Non-Goals

- This plan does not make `mrtdown-data` a low-latency realtime feed server.
- This plan does not poll third-party live feeds from CI.
- This plan does not require canonical data to mirror every optional GTFS field
  before a useful feed can be published.
- This plan does not replace the existing issue/evidence/impact model with
  GTFS Realtime entities.
- This plan does not assume GTFS Realtime vehicle positions are canonical issue
  evidence unless a later phase proves a durable use case.

## Ownership Boundary

This repository should own:

- versioned LTA-GTFS-to-MRTDown id mapping;
- deterministic GTFS snapshot inspection and reconciliation;
- GTFS Static generation from reviewed canonical data only where it adds a
  demonstrated capability beyond the official feed;
- validation and publication of any justified MRTDown static feed;
- schemas for any GTFS-specific source metadata kept in canonical data;
- ingest contracts for trusted GTFS Realtime observations that should become
  canonical evidence;
- replayable conversion from GTFS Realtime service alerts to issue evidence and
  impact events.

Runtime systems or external producers should own:

- DataMall account keys and authenticated dataset-link requests;
- prompt download and durable snapshotting of temporary pre-signed URLs;
- live GTFS Realtime polling;
- freshness, retry, and backoff policy;
- feed credentials and provider-specific transport details;
- low-latency public feed serving;
- realtime vehicle-position fanout and trip-update caching;
- operational alerts that are not accepted into canonical history.

## Static Feed Shape

The first deliverable should be an offline inspector for a captured LTA GTFS
Schedule snapshot, not a parallel synthetic feed. It should inventory tables,
validate references, summarize calendar and rail/LRT coverage, and propose id
matches without writing canonical data. A reviewed import can then retain
source timestamps, snapshot hashes, provider ids, and explicit match decisions.

Only after that audit should MRTDown decide whether it needs to generate and
publish its own feed. The audit is a decision gate with three possible paths:

- **Mirror the LTA feed:** verify that the licence permits redistribution, then
  publish the retained, validated LTA snapshot with its provenance and
  attribution. Do not run the synthetic timetable generator phases.
- **Publish reconciliation data only:** publish the versioned id mappings,
  coverage report, and validation results without republishing a GTFS feed. Do
  not run the synthetic timetable generator phases.
- **Publish an MRTDown-derived feed:** document the capability that the derived
  feed adds beyond LTA's feed and the source gaps it must cover, then proceed to
  the frequency/stop-time design, generator, and publication work below.

The following target shape applies only to the MRTDown-derived-feed outcome.

The first generated GTFS Static feed should prioritize the tables needed for a
useful rail network feed:

- `agency.txt`
- `stops.txt`
- `routes.txt`
- `trips.txt`
- `stop_times.txt`
- `calendar.txt` or `calendar_dates.txt`
- `feed_info.txt`

Candidate follow-up tables:

- `shapes.txt`, once geometry expectations are settled;
- `transfers.txt`, once interchange and transfer rules are represented clearly;
- `frequencies.txt`, using the estimated-frequency model once reviewed relative
  stop times are available.

Generated files should be treated as artifacts. The source of truth remains the
canonical JSON data plus generator code and any reviewed GTFS mapping metadata.

### Frequency Estimation Decision

Canonical service revisions may store source-backed estimated headway ranges,
including a deterministic representative value and calendar-specific override
periods. Generator code combines those inputs with each station's canonical
first and last train times to produce non-overlapping station-level windows.
This preserves short starters and distinct weekday, Saturday, and
Sunday/public-holiday bounds that a service-wide operating window cannot
represent. A deterministic enumerator expands each window using intervals
distributed as evenly as possible around the representative headway. This
keeps frequency-window boundaries and the canonical last train aligned without
adding an implausibly short final gap. Interior estimates are quantized to 30
seconds, the smallest unit needed for the 150-second peak midpoint, rather than
implying arbitrary second-level precision. Internal window ends are exclusive,
while canonical first and last trains are retained and labelled as source
anchors. Every interior departure is explicitly labelled as a frequency
estimate. The generated schedules are artifacts and do not belong under
`data/`.

The current profiles cover the NEL, DTL, EWL main, NSL, TEL, BPLRT, PGLRT, and
SKLRT service revisions using
[LTA's system-wide rail guidance](https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/rail_network.html):
two to three minutes during the 07:00–09:00 peak and five to seven minutes
otherwise. Because LTA does not specify the applicable days, the profiles treat
the peak window as weekday-only and record that modelling assumption in the
source description. The representative values are the range midpoints, 150 and
360 seconds. These are explicitly estimates, not exact departures; a GTFS
export should therefore map them to `frequencies.txt` with `exact_times=0`.

PGLRT and SKLRT station timing anchors are calibrated estimates: SBS Transit
loop-origin first/last times are combined with MRTDown-maintainer video-traced
loop runtimes and stop offsets. The timing records retain
`loop_runtime_extrapolation` provenance; reverse directions explicitly assume
parallel tracks and their first/last anchors are exposed with medium rather than
high confidence. They must be replaced when detailed current operator timings
become available. BPLRT has complete source-backed station first/last times
for both active loop directions, so it uses the same LTA frequency profile and
retains its repeated interchange stop in full-service schedule generation. CCL
station timings still lack complete directional coverage, the EWL airport
shuttle is deferred, and future CRL/JRL services do not yet have operating
timings.

Station-level windows are not directly `frequencies.txt` rows. A GTFS export
must first group compatible windows into full-length and short-start trip
patterns. These profiles do not invent that grouping or `stop_times.txt`;
relative stop times still require reviewed segment runtime and dwell-time
inputs.

For user-facing next-train estimates, consumers should not use the enumerated
departure artifacts as if they were live predictions: frequency guidance does
not reveal a train's phase within a headway. Core therefore returns three
single, clearly labelled frequency-based arrival estimates. During service the
first estimate uses half the representative headway and the following two use
the applicable representative headway. The sourced first and last trains remain
exact anchors. These are planning estimates, not realtime predictions. LTA trip
updates should supersede them for live consumer displays after freshness, id
mapping, and coverage have been verified; stale or unmapped updates must fall
back explicitly rather than silently presenting estimates as live predictions.

The external runtime should expose one runtime-facing arrival contract as a
discriminated union rather than mislabelling realtime data as the existing
`EstimatedStationArrival` type. Its estimate variant should wrap the existing
first-train, frequency, crowd-report, and last-train result unchanged. Add a
`scheduled_arrival` variant for an exact stop time from the selected LTA static
snapshot; it must carry the scheduled time, trip-instance and stop-occurrence
identity, snapshot hash, and source timestamps. Realtime variants should
represent both a `trip_update_prediction` with a predicted time and a
`trip_update_suppression` for a cancelled or deleted trip or a skipped stop.
Both realtime variants should carry the provider entity id, matched
trip-instance identity, resolved stop occurrence when applicable, static
snapshot hash, optional
`FeedHeader.timestamp`, required `TripUpdate.timestamp`, `retrieved_at`, and
source attribution needed to audit the result. Keep the entity timestamp
separate from feed generation and retrieval timestamps.

The Phase 1 audit must set and record a reviewed
`maxTripUpdateAgeSeconds` no greater than twice the measured provider update
cadence before live trip updates can be enabled. Evaluate each entity's age
from `TripUpdate.timestamp`; a recently generated or retrieved feed must not
refresh an older entity. If that timestamp is absent, invalid, or older than
the configured maximum, the entity is ineligible for prediction or suppression
and the normal crowd-report, static-schedule, or frequency fallback applies.

Precedence is evaluated independently for each station, service, direction,
and arrival candidate. First apply a fresh mapped trip-level `CANCELED` or
`DELETED` relationship before inspecting any `StopTimeUpdate`; neither a stop
prediction nor a lower-priority fallback may override that suppression. Next
apply a fresh mapped stop-level `SKIPPED` suppression before considering a
prediction. For a remaining candidate, use a fresh mapped prediction when
present; otherwise retain an eligible fresh crowd-report result; otherwise use
the exact `scheduled_arrival` from the selected static snapshot. Use a
frequency estimate only when the static audit records a coverage gap for that
scope. `NO_DATA` explicitly permits that fallback because it supplies no
realtime prediction. A stale, unmatched, ambiguous, or only partially covering
realtime feed must not suppress the lower-priority result for an uncovered
scope or candidate. Before service, preserve the existing exact `first_train`
result; at the exact final anchor, preserve `last_train`; after the final
service window, return no estimate.

Consumers may optionally overlay fresh, station/service/direction-scoped
commuter reports on the first arrival. A single fresh, uncontradicted report is
the best available estimate and is labelled as a high-confidence `crowd_report`;
reports predicting nearby arrivals are medianed. Materially conflicting reports
favour the newest report and lower its confidence, while following arrivals
continue from the frequency model. Report scoping and trust or moderation remain
the caller's responsibility.

### Geometry And Stop Offset Estimation

[LTA DataMall's geospatial datasets](https://datamall.lta.gov.sg/content/datamall/en/static-data.html)
include rail infrastructure as ESRI shapefiles. Ordered station coordinates can
label otherwise unlabelled linework by snapping each service path to nearby
geometry. The resulting along-track distance is suitable for `shapes.txt`,
distance metadata, and anomaly checks.

Distance alone is not a sufficient timing model. Curves, acceleration,
deceleration, dwell time, and minute-rounded source timings cause materially
different effective speeds between adjacent stations. Stop offsets should be
anchored to observed first/last-train chains where possible. Geometry may fill
or flag gaps only through an explicit, calibrated estimation method whose
assumptions and provenance are retained.

## GTFS Id Policy

GTFS ids should be stable and human-inspectable:

- `agency_id`: canonical operator id, such as `SMRT_TRAINS`.
- `route_id`: canonical line id, such as `NSL`.
- `stop_id`: canonical station id for station-level stops, such as `JUR`.
- `trip_id`: deterministic service revision, direction, and schedule identity.
- `service_id`: deterministic calendar or operating-window identity.

If GTFS needs platform-level stop ids later, introduce explicit child stops
without changing existing station-level stop ids. Do not encode transient dates,
generated counters, or file ordering into public ids.

## Phases

### Phase 1: Reference Inventory And Gap Analysis

- Obtain a licensed snapshot from `GTFSScheduleTrain` through the external
  producer's durable handoff. Record `retrieved_at`, any provider-supplied
  publication timestamp, hash algorithm and digest, immutable archive id or
  URI, and licence attribution; retain the exact hashed archive for offline
  audit while keeping credentials and expiring URLs out of repository data.
- Inspect its table inventory, feed metadata, calendars, routes, stops,
  platforms, trips, stop times, shapes, transfers, and frequency rows.
- Measure MRT/LRT/operator coverage and validate internal GTFS references with
  an independent validator.
- Inventory the current canonical station, line, service, and operator fields
  against required GTFS Static fields.
- Record missing source data, including agency timezone/language, route type,
  stop wheelchair/accessibility details, platform granularity, service
  calendars, and schedule/headway assumptions.
- Choose and record one publication outcome: mirror the licensed LTA feed,
  publish reconciliation data only, or publish an MRTDown-derived feed.
- If and only if the outcome is an MRTDown-derived feed, use source-backed
  frequency estimates for the initial timetable-like approximation bounded by
  station first/last train times; document the LRT `stop_times.txt` versus
  `frequencies.txt` representation; and decide a Pages artifact path such as
  `gtfs/static.zip`.

Exit criteria:

- A dated LTA snapshot audit records actual feed coverage and validation
  results and can reproduce them from the retained immutable archive without
  committing that upstream archive to this repository.
- Required GTFS fields are mapped to canonical fields or listed as explicit
  new data requirements.
- The selected publication outcome, licence basis, and outcome-specific next
  steps are documented.
- If an MRTDown-derived feed is selected, its first feed scope is small enough
  to validate deterministically.
- Open data gaps are documented before generator work starts.

### Phase 2: Core Schemas And Mapping Metadata

- Add reviewed mappings from LTA agency, route, stop, and static trip or
  stop-pattern ids to canonical MRTDown operators, lines, stations, and
  services. Treat provider `service_id` as calendar metadata, not as the id of
  a canonical MRTDown `Service`; retain its relationship to each mapped trip
  pattern and its operating dates. Version each mapping against the exact
  static snapshot hash. Preserve unmatched and ambiguous ids for review instead
  of guessing. Realtime trip instances are derived later from each
  `TripDescriptor`; they are not static mapping records.
- Add core schemas for GTFS export metadata if canonical data needs fields that
  do not belong in existing line, service, station, or operator records.
- If and only if Phase 1 selects an MRTDown-derived feed, add typed helpers for
  outbound MRTDown-to-GTFS id generation.
- Add validation rules for duplicate ids, missing references, unsupported
  service paths, and inconsistent operating windows.
- Add fixtures that cover MRT, LRT loop, interchange, future station, and
  closed/revised service cases.

Exit criteria:

- GTFS mapping metadata is schema-validated with deterministic tests.
- Provider static ids can be reconciled to canonical records for every
  publication outcome.
- If an MRTDown-derived feed is selected, its in-scope canonical records can be
  converted to stable outbound GTFS ids.
- Validation fails on broken references before writing feed files.

### Phase 3: Static Generator (MRTDown-Derived Outcome Only)

- Proceed only when Phase 1 selects an MRTDown-derived feed. Otherwise skip
  this phase.
- Add a deterministic GTFS Static generator, likely under `packages/fs` or
  `packages/cli` depending on whether the output is considered repository I/O
  or command orchestration.
- Generate CSV tables with stable row ordering and reproducible zip output.
- Generate `agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`,
  `stop_times.txt`, calendar data, `feed_info.txt`, and `frequencies.txt` for
  services with estimated frequency profiles.
- Add CLI commands to generate, inspect, and validate GTFS output.
- Add tests that compare generated fixture output against committed snapshots
  or normalized table rows.

Exit criteria:

- A fixture feed can be generated without network access.
- The generated feed is deterministic across repeated runs.
- The CLI can explain which canonical record produced each major GTFS id.

### Phase 4: Static Publication (Outcome-Specific)

- If Phase 1 selects mirroring, publish the retained, validated LTA snapshot
  only when the licence permits redistribution, with provenance and
  attribution metadata plus the reviewed id mappings, coverage report, and
  validation results; do not generate a synthetic timetable. Add a CI handoff
  available to both preview and main workflows that downloads the immutable
  snapshot by archive id, verifies its configured hash algorithm and digest
  before use, and never exposes store credentials or temporary URLs in the
  artifact or logs. If that handoff cannot be made available, mirroring is not
  a viable outcome.
- If Phase 1 selects reconciliation-only publication, include only mappings,
  coverage, and validation reports in `npm run pages:build`; do not publish a
  GTFS archive.
- If Phase 1 selects an MRTDown-derived feed, include the generated static GTFS
  feed in `npm run pages:build`.
- Add manifest metadata that advertises the artifact path, build publication
  timestamp, source `retrieved_at`, optional provider publication timestamp,
  source snapshot hash, source repository revision, and applicable schema,
  generator, or report version. Keep source timestamps distinct from build time
  so a republished snapshot cannot appear newly retrieved. Treat the build
  timestamp as intentionally variable metadata; exclude the enclosing Pages
  manifest and archive timestamp from byte-for-byte payload parity checks.
- Keep generated GTFS artifacts out of hand-authored data unless the repository
  deliberately commits generated outputs for review.
- Update README and package docs with the supported feed path and regeneration
  commands.

Exit criteria:

- Given the same source revision and snapshot hash, preview and main Pages
  builds publish byte-identical GTFS feed or reconciliation-report payloads for
  the selected outcome. The enclosing Pages manifest may have a different
  build publication timestamp.
- Downstream consumers can discover the selected feed or reconciliation report
  through the archive/index metadata.
- CI catches stale or invalid output for the selected outcome.

### Phase 5: GTFS Realtime Contract Boundary

- Limit the initial message scope to `ServiceAlert` and `TripUpdate`.
  `VehiclePosition` remains deferred until a provider source, retained fixture,
  canonical or runtime use case, validation path, and exit criterion are all
  documented.
- Start with `ServiceAlert` because it maps most directly to canonical issue
  evidence and impact.
- Capture fixture snapshots from both LTA realtime endpoints before defining
  canonical contracts. Pin parsing and relationship behavior to
  [GTFS Realtime 2.0 proto revision `a14a8912`](https://github.com/google/transit/blob/a14a8912d653b9225b0b1f70930d19a066371e61/gtfs-realtime/proto/gtfs-realtime.proto)
  and require an explicit plan review before adopting a different revision.
- Retain multiple audited static snapshots with their hash, retrieval time,
  optional `feed_info.feed_version`, and an explicit compatibility interval.
  Select the snapshot for each realtime feed before matching any entity:
  - when `FeedHeader.feed_version` is present, require an exact retained
    `feed_info.feed_version` match;
  - when it is absent, bracket the realtime retrieval with schedule captures
    and proceed only if the before/after schedule hashes are identical;
  - otherwise quarantine the realtime fixture until the new schedule is
    retained, audited, and mapped. Never interpret a new or reused id against a
    merely time-adjacent older snapshot.
- Apply this complete `TripDescriptor.ScheduleRelationship` policy:
  - `SCHEDULED`: require a unique static trip-instance match and allow fresh
    predictions.
  - `ADDED`: reject and retain as deprecated; do not guess whether the producer
    intended `DUPLICATED` or `NEW`.
  - `UNSCHEDULED`: support only when the static trip uses `frequencies.txt`
    with `exact_times=0`, `start_date` and `start_time` establish the instance,
    and every associated stop update is also `UNSCHEDULED`.
  - `CANCELED`: require a unique schedule-backed match and emit trip-level
    suppression before processing stop updates.
  - `REPLACEMENT`: reject and retain as unsupported and experimental until a
    complete replacement-trip scoping design is reviewed.
  - `DUPLICATED`: reject and retain as unsupported and experimental until
    `TripProperties` and the new instance identity are modelled.
  - `DELETED`: require a unique schedule-backed match and suppress the trip
    without presenting it as a rider-visible cancellation; retain its
    experimental status in provenance.
  - `NEW`: reject and retain as unsupported and experimental because it has no
    static trip to reconcile.
- For each realtime entity, validate every populated `TripDescriptor` and
  `EntitySelector` field conjunctively against the exact audited static
  snapshot hash. This includes populated `agency_id`, `route_id`, `route_type`,
  `trip_id`, `stop_id`, `direction_id`, `start_date`, and `start_time` fields.
  Derive trip-instance identity at match time; `start_date` and `start_time`
  participate in frequency-based identity. Process `schedule_relationship`
  separately as realtime state, and ignore it when matching a
  `TripDescriptor` nested in an `EntitySelector`.
- Require a unique match when a `TripDescriptor` identifies one trip instance.
  For a broad service-alert `EntitySelector`, expand all canonical entities
  satisfying its populated fields as the intended affected scope. Reject an
  empty selector rather than treating it as network-wide. Retain empty or
  zero-match selectors and unmatched or ambiguous singular trip descriptors,
  together with their snapshot hash and rejection reason, instead of attaching
  them to a trip-pattern mapping.
- Require each `StopTimeUpdate` to populate `stop_sequence`, `stop_id`, or both.
  Resolve either field against the matched static trip and cross-check them when
  both are present. Require `stop_sequence` when the trip visits the same
  `stop_id` more than once; reject a missing or inconsistent occurrence as
  ambiguous. Carry the resolved `stop_sequence` and `stop_id` as the
  stop-occurrence identity in prediction and suppression results.
- If `StopTimeProperties.assigned_stop_id` is present, require `stop_sequence`,
  resolve the scheduled occurrence from that sequence, and retain the assigned
  stop separately rather than treating it as the static `stop_id`.
- Define and fixture-test the runtime-facing arrival union: preserve the
  existing `EstimatedStationArrival` result as its estimate variant, add a
  `scheduled_arrival` variant with static trip/occurrence identity, add a
  `trip_update_prediction` variant with predicted time, and add a
  `trip_update_suppression` variant for `CANCELED`, `DELETED`, and `SKIPPED`.
  Test trip-level suppression before stop predictions, stop-level suppression
  before fallback, and that `NO_DATA` falls back through crowd reports and the
  exact static schedule before frequency estimates. Retain auditable entity,
  feed, retrieval, and selected-static-snapshot provenance for each result.
- Extend the `lta-datamall` rule in `data/rights/source-registry.json` to match
  `datamall2.mytransport.sg` as well as the documentation host, and add
  deterministic rights/ingest fixtures proving that a truthful API
  `sourceUrl` validates with the expected LTA attribution.
- Add ingest-contract schemas for trusted GTFS Realtime observations only if
  they need to enter canonical history.
- Add an optional discriminated `sourceMetadata` field to the core evidence
  schema. Its GTFS service-alert variant must preserve the provider, endpoint,
  entity id, normalized payload digest, selected static snapshot hash, GTFS ids,
  optional feed version and feed timestamp, `retrieved_at`, effect/cause, and
  truthful source URL. Thread it through ingest provenance construction,
  file-backed evidence writes and reads, validation, public export, and replay
  so `evidence.ndjson` remains the canonical record rather than adding a new
  issue-bundle sidecar.
- Decide whether raw protobuf payloads are stored, summarized, or omitted from
  canonical data.

Exit criteria:

- GTFS Realtime support has a documented source-of-truth boundary.
- The supported GTFS Realtime revision, exact `maxTripUpdateAgeSeconds`, and
  disposition of every `TripDescriptor.ScheduleRelationship` value are
  documented and fixture-tested.
- Every accepted realtime fixture records the selected compatible static
  snapshot hash; ambiguous schedule-version selection is quarantined.
- A trusted `ServiceAlert` payload can be validated without importing triage
  internals.
- Unsupported live-only realtime data is rejected or ignored deliberately.

### Phase 6: Realtime Evidence Triage

- Before any model call, compute a service-alert deduplication key from the
  provider, feed type, entity id, and a digest of normalized semantic entity
  content. Exclude retrieval time and `FeedHeader.timestamp` so an unchanged
  repeated entity keeps the same key. The external producer must durably skip
  keys it has already submitted, including irrelevant outcomes; the triage
  ingester must independently skip keys already present in canonical evidence
  metadata before calling the model. A changed semantic digest for the same
  entity is a new version and may proceed.
- Teach `packages/triage` to format trusted GTFS Realtime service alerts as
  evidence text.
- Map GTFS Realtime alert effects and causes to existing issue, service effect,
  and facility effect concepts where possible.
- Persist accepted alerts as ordinary canonical evidence rather than a separate
  issue model.
- Add deterministic tests for alert formatting, provenance, time handling, and
  canonical evidence type mapping. Cover repeated identical snapshots, changed
  versions of the same entity, producer retry/reset behavior, and provenance
  round-trips through file-backed persistence and replay.
- Add paid eval fixtures only if service-alert phrasing introduces ambiguity
  that deterministic tests cannot cover.

Exit criteria:

- A GTFS Realtime service alert can create or update a canonical issue through
  the existing ingest path.
- Repeating an unchanged provider entity performs no model calls and appends no
  evidence or impact events, while a semantic entity change is processed once.
- Generated impact events remain compatible with current validation and replay
  utilities.
- Paid model evals remain opt-in.

### Phase 7: Realtime Publication Decisions

- Decide whether this repository should publish any realtime-derived artifacts
  in the static archive, such as normalized historical alert snapshots.
- If publishing snapshots, mark them as archival and not live.
- Keep live feed serving in `mrtdown-site` or a dedicated runtime service if a
  consumer needs freshness guarantees.
- Document consumer behavior for stale alerts, duplicate entity ids, cancelled
  alerts, and source-feed outages.

Exit criteria:

- There is no ambiguity between static GTFS artifacts, canonical historical
  evidence, and live realtime feed serving.
- Consumers know which repository or service to use for each need.

## Open Questions

- What are the official schedule feed's actual MRT/LRT, platform, calendar,
  short-working-trip, and future-service coverage and validation results?
- How often are the static and realtime objects updated, how long do their
  links remain usable, and what freshness threshold should consumers enforce?
- Which LTA ids are stable across feed releases, and which require a separate
  durable MRTDown mapping key?
- Does the applicable licence allow MRTDown to retain regression fixtures and
  redistribute an unchanged or derived feed, with what attribution?
- Should the first GTFS Static feed model Singapore rail as schedule-based
  trips from LTA, use frequency-based fallbacks, or avoid republishing a second
  feed entirely?
- Are platform-level stops required for the first consumer, or are
  station-level stops sufficient?
- Should `shapes.txt` be derived from station coordinates, schematic map data,
  or omitted until a reviewed geometry source exists?
- Which external producer, if any, will submit trusted GTFS Realtime
  `ServiceAlert` payloads?
- Should realtime source payloads be stored verbatim, normalized, or only
  summarized into canonical evidence?

## Progress Log

- 2026-05-27: Created initial active plan from GitHub issue #157.
- 2026-08-12: Investigated LTA's new train GTFS endpoints and revised the plan
  to begin with official-feed capture, validation, and canonical reconciliation.

## Decision Log

- 2026-05-27: Treat GTFS Static as a generated Pages/archive artifact owned by
  this repository.
- 2026-05-27: Keep live GTFS Realtime polling and low-latency serving outside
  this repository.
- 2026-05-27: Start realtime support with service-alert ingest because it maps
  to existing canonical issue/evidence/impact records.
- 2026-05-27: Do not add vehicle positions or trip updates to canonical history
  until there is a durable reviewed-data use case.
- 2026-08-12: Treat `GTFSScheduleTrain` as the authoritative candidate schedule
  source and canonical frequency schedules as explicit fallbacks pending a
  snapshot audit.
- 2026-08-12: Keep DataMall credentials, temporary download URLs, polling, and
  freshness policy in an external producer; retain only reviewed provenance,
  mappings, fixtures permitted by the licence, and canonical outcomes here.

## Validation

- `npm run build:core`
- `npm run test:core`
- `npm run build:fs`
- `npm run test:fs`
- `npm run build:cli`
- `npm run test:cli`
- `npm run build:ingest-contracts` once realtime ingest contracts are added.
- `npm run test:ingest-contracts` once realtime ingest contracts are added.
- `npm run build:triage` once realtime alert triage is added.
- `npm run test:triage` once realtime alert triage is added.
- `npm run data:validate`
- `npm run pages:build`
- `npm run check`
