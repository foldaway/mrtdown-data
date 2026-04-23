# MRTDown Architecture

This document describes the canonical MRTDown data model, deterministic issue state derivation, and the boundary between reviewed history in `mrtdown-data` and runtime state in `mrtdown-site`.

This repo is the canonical record for curated data and append-only logs. Runtime data may live elsewhere, but it should only become canonical here through explicit review. Crowd-sourced reporting remains a follow-up phase and is not required for the current site bring-up.

Last updated: 2026-04-21 (America/Los_Angeles)


## Goals

- Canonical, auditable, append-only history for issues and derived impacts
- Deterministic “current state” derivation from append-only logs
- Support multiple issue types: disruption, maintenance, infrastructure (facilities)
- Separate runtime ingestion/serving from canonical historical record
- Allow under-reporting tolerance: non-official sources can escalate, but de-escalation is stricter
- Keep the site bring-up unblocked by future crowd-reporting work


## Key Concepts

- Evidence: append-only facts and statements (raw, multilingual). Evidence is never overwritten.
- Impact: append-only operational interpretation derived from evidence. Impacts can evolve over time.
- Current State: derived view computed from impact events (and optionally evidence), at an as-of timestamp.
- Entity: the thing affected by an impact. Two primary kinds:
  - Service (train operation along a service path)
  - Facility (lift, escalator, platform screen doors, etc., tied to a station)


## Repository Structure

This repo is the canonical data repo.

- data/
  - station/
  - line/
  - service/
  - operator/
  - town/
  - landmark/
  - public_holidays.json
  - issue/
    - YYYY/
      - MM/
        - <issue_id>/
          - issue.json
          - evidence.ndjson
          - impact.ndjson
- packages/
  - core/
  - fs/
  - cli/
  - triage/
- docs/

The mirrored Postgres schema, import pipeline, and runtime-derived facts live in `mrtdown-site`, not here.


## Canonical Data vs Realtime Data

Canonical (this repo)
- Static network definitions (stations, lines, services, operators)
- Curated issues and evidence (official and non-official)
- Append-only impact logs
- Optional reviewed snapshots/manifests derived from runtime systems

Runtime (`mrtdown-site` / separate service)
- Canonical import into Postgres
- Rebuildable fact tables and app-facing read models
- Future public crowd reports ingestion
- Future rolling aggregations and spike detection
- Future live signal serving and promotion workflows


## Data Model Overview

Stations
- System-wide unique identifiers (Station ID), e.g. JUR
- Line-specific station codes exist for display and routing; a station may have multiple active codes simultaneously (e.g., Tanah Merah)

Services
- A service is the operational path used for impacts and scoping.
- Services can represent branches and directions. Stations can belong to multiple services.

Issues
- Issue types:
  - disruption: unplanned operational impacts (delay/no-service/reduced service)
  - maintenance: planned windows or recurring rules (early closure/late opening)
  - infrastructure: facilities (lift/escalator/PSD) repairs/outages

Evidence
- Stored as NDJSON, append-only
- Raw evidence is stored in original language, with optional derived summaries/translations
- Evidence is the only thing that should be “human-citable”

Impact
- Stored as NDJSON, append-only
- Represents operational state changes inferred from evidence and deterministic merge rules
- Impact events have basis metadata linking them back to evidence


## Impact Entities

AffectedEntity
- Service entity:
  - kind = service
  - serviceId
- Facility entity:
  - kind = facility
  - stationId
  - facilityKind
  - optional locationHint (platform A/B, concourse, etc.)

Entity identity is used for reconciliation and state derivation. There are no global “facility IDs” today; facilities are identified by stationId + facilityKind + locationHint.


## Extracted Observations vs Periods

The LLM does not output Period objects. Periods require current state (open/close) and are computed deterministically.

LLM output is an Observation describing what the evidence claims:
- entity (service or facility)
- effect signal (optional)
- service scopes (optional, for service entities)
- statusSignal:
  - ongoing
  - cleared
  - planned
  - unknown
- timeHints:
  - best-effort start/end timestamps if explicitly mentioned
  - recurrence hints for maintenance (rrule, effective range, local time window, exdates)
- advisories (optional display text)

Code then applies Observations to the current derived state to produce impact events and to open/close periods (or update maintenance rules).


## Effects and Scopes

Effects are split by entity kind to avoid invalid combinations.

ServiceEffect
- delay (optional duration metadata)
- no-service
- reduced-service
- early-closure
- late-opening

FacilityEffect
- out-of-service
- degraded

Service scopes are relative to the serviceId and do not include serviceId internally.
ServiceScope
- whole
- segment (fromStationId, toStationId, optional pathSelector for ambiguous topology)
- station (stationId)

Notes on loops and ambiguous topology:
- For services with multiple valid paths between endpoints (loops or multi-path graphs), segment selection may be ambiguous.
- If ambiguity exists, a pathSelector is required (via station, explicit station list, or other deterministic selector).
- If ambiguity cannot be resolved, prefer whole scope or leave scope unchanged rather than writing an incorrect segment.


## Impact NDJSON Event Types

This section describes the impact log schema at a high level. The exact JSON schema may evolve, but the processing model should remain stable.

Path 2 event model (split dimensions)
- service_scopes.set
  - serviceId, scopes[]
- service_effect.set
  - serviceId, effect (single or null)
- service_periods.set
  - serviceId, period operations (append-only open/close semantics)
- facility_effect.set
  - stationId, facilityKind, locationHint, effect (single or null)
- facility_periods.set
  - stationId, facilityKind, locationHint, period operations
- maintenance_rule.set
  - serviceId, effect (early-closure or late-opening), recurrence rule fields

Basis
- Every impact event includes basis metadata:
  - evidenceRefs: array of evidence ids
  - method: versioned pipeline identifier (e.g., extract+apply_v3)
  - optional confidence

Rationale:
- Scopes, effects, and periods can legitimately come from different evidence items; therefore each dimension can have its own basis.
- Current derived state may optionally expose provenance per dimension.


## Derived Current State

Current state is computed by folding (reducing) impact events in timestamp order, per entity.

Recommended current state structures:

ServiceState
- effect: ServiceEffect or null
- scopes: ServiceScope[]
- periods: Period[]
- optional provenance:
  - effect basis ref
  - scopes basis ref
  - periods basis ref

FacilityState
- effect: FacilityEffect or null
- periods: Period[]
- optional provenance:
  - effect basis ref
  - periods basis ref

IssueBundleState
- services: Record of serviceId to ServiceState
- facilities: Record of facilityKey to FacilityState

facilityKey is a deterministic composite of:
- stationId + facilityKind + locationHint (if present)

Periods
- For disruptions and facility outages, periods are derived by applying open/close operations.
- Preferred semantics are append-only:
  - open period is created when entering ongoing state with no open period
  - close operation closes the currently open period (if any)
- For maintenance, recurrence rules are preferred over enumerating many explicit periods.


## Processing Pipeline

There are two LLM calls in the current plan, with an option to simplify the second call to be purely stateless extraction.

1) Triage (LLM)
Input:
- New evidence item (and small context, e.g., list of active issues and their summaries)
Output:
- Decision: create new issue or attach to existing issue id
- Optional: issue type hint (disruption/maintenance/infrastructure)

2) Extract Observations (LLM, stateless)
Input:
- New evidence item only (plus minimal lookup hints if needed, such as known station names)
Output:
- Observation[] (entity + effect/scope signals + statusSignal + timeHints + advisories)

3) Apply Observations (code, deterministic)
Input:
- Current derived state for the issue
- Observation[]
- Evidence metadata (timestamp, publisher/source type)
Output:
- ImpactEvent[] to append to impact.ndjson
- Optional: derived translations/summaries (if stored as annotations)

4) Persist (code)
- Append evidence to evidence.ndjson
- Append impact events to impact.ndjson
- Update any derived artifacts during build (DuckDB, exports)


## Merge Rules (Deterministic)

Merging is per entity and dimension. New evidence does not blindly override; it is reconciled with current derived state using these principles:

- Escalation is easier than de-escalation
  - Non-official sources may escalate severity or expand scope
  - De-escalation (cleared, reduced severity, contraction) requires stronger signals and/or corroboration
- Recency matters
  - Prefer newer evidence; avoid contracting based on stale updates
- Dimension independence
  - scope changes do not imply effect changes and vice versa
  - each dimension has its own basis

Effects merge (service)
- empty to non-empty: set effect, open period if needed
- same: no-op
- severity increase: accept
- severity decrease: accept only with explicit cleared/improvement or corroboration

Scopes merge (service)
- expansion (segment to whole, adding segments): generally accept
- contraction (whole to segment): require specificity and stronger evidence
- shift:
  - if overlapping: treat as refinement (replace)
  - if disjoint: allow multiple scopes (union) if the system supports it, otherwise create a new issue via triage

Periods merge
- statusSignal ongoing with no open period: open
- statusSignal cleared with open period: close
- cleared without open period: no-op
- reoccurrence: open a new period after closure

Facilities
- facility effects are set/cleared on the facility entity
- periods track outage windows for the facility entity


## Realtime Crowd Reports

Crowd reports are served from a separate realtime service. Canonical history is preserved by recording aggregates or manifests in this repo.

Realtime service responsibilities
- Ingest crowd reports (rate-limited, privacy-safe)
- Store reports in a hot datastore (Redis/Postgres/ClickHouse)
- Aggregate into rolling windows (signals), with dedupe and spike scoring
- Serve signals in realtime (REST + SSE/WebSocket)

Canonical recording
- Periodically write aggregated signals into canonical storage:
  - either commit small aggregated signal files into the repo
  - or store raw windows in object storage and commit manifests with hashes into the repo

Promotion into issues
- Crowd spikes can create candidate issues or add supporting evidence to existing issues.
- Crowd reports should not be appended into issue evidence logs as raw events; aggregate first and reference the aggregate.

DuckDB integration
- DuckDB is built during CI/CD deploy as a snapshot artifact.
- It ingests canonical repo data (issues, evidence, impact logs, and optional crowd signal aggregates) for analytics and API serving.
- Realtime signals should not depend on DuckDB rebuild cadence.


## Testing and Evals

Store and repositories
- Repositories should be read-only and take a store interface for testability.
- Unit tests:
  - use a MemoryStore for pure logic and repository behavior
- Integration tests / eval fixtures:
  - use a real on-disk fixture directory that mirrors the repo layout
  - this catches path and parsing regressions

Eval focus areas
- Triage: new vs existing issue decisions, ambiguity handling
- Extraction: correct observation extraction across languages and formats
- Apply: deterministic merges, escalation vs de-escalation behavior, loop ambiguity handling
- Idempotency: processing the same evidence twice should not create duplicate state changes


## Naming Conventions

- IDs are stable and deterministic where possible.
- Evidence IDs should be dedupe-friendly (timestamp + publisher + hash).
- Impact events must reference evidence via basis.evidenceRefs.
- Station IDs are system-wide and stable. Display station codes are stored in station metadata and may have multiple active codes at once.


## Future: GTFS Static and Realtime

GTFS Static
- Export a derived GTFS feed as a build artifact; do not store GTFS zip as canonical source.
- Without schedules, focus on stops, routes, and shape/service topology as feasible.

GTFS Realtime
- Map operational impacts to GTFS-RT Alert and TripUpdates where possible.
- Keep cause/effect in operational types; advisories map to Alert texts.
- Realtime crowd signals remain separate and can be surfaced as Alerts with lower confidence if desired.
