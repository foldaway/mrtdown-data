# LTA facilities maintenance ingestion

## Purpose

Poll LTA's MRT lift maintenance API in `mrtdown-data-crawler` and send meaningful
changes through the existing LLM-assisted issue pipeline in `mrtdown-data`.
Add focused evals before enabling ingestion.

First version: lift maintenance only. Proposed grouping is one `infra` issue
per station and line while maintenance remains active, with individual lift
details in evidence. Per-lift canonical entities and historical backfill can wait.

## Progress

- [x] 2026-11-22: Review API documentation and current crawler/triage boundaries.
- [x] 2026-11-22: Draft plan; revise to reuse LLM triage with focused evals.
- [ ] Inspect live responses and settle grouping and disappearance behavior.
- [ ] Add crawler polling, snapshots, change detection, and retry handling.
- [ ] Add the ingest source, prompts, deterministic guards, and eval cases.
- [ ] Run evals and shadow collection; enable ingestion after reviewing results.

## Surprises & Discoveries

- The [API guide, §2.23](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf#page=46)
  lists line, station code/name, optional lift ID, and lift description. It has
  no documented outage or recovery timestamps. Live behavior is unverified.
- The crawler currently handles linked-file DataMall feeds. This API needs a
  direct-JSON adapter, as anticipated in its `docs/datamall-architecture.md`.
- The [facility model](../../../packages/core/src/schema/issue/entity.ts)
  groups by station, line, and facility kind. It cannot distinguish individual lifts.

## Decision Log

- User direction: acquisition belongs in the crawler; draft a concise plan.
- Proposed: reuse LLM issue matching, claim extraction, titles, and translation.
  Keep parsing, snapshot comparison, identity, and delivery deduplication in code.
- Proposed: group lifts by station/line to fit the existing model. Keep source
  lift IDs and descriptions to support a later per-lift feature.
- Open: how to represent observation-based periods and disappearance. A missing
  record is not an explicit repair confirmation; automatic closure starts disabled.

## Outcomes & Retrospective

Draft only. No live API sampling, paid evals, implementation, or deployment yet.

## Context

The crawler owns acquisition, private snapshots, QStash schedules, and GitHub
dispatch. Start with `src/datamall/transport/http.ts`,
`src/datamall/snapshots/store.ts`, `src/runtime/jobs.ts`, and
`scripts/qstash-schedules.ts` in `mrtdown-data-crawler`.

This repo owns the [ingest contract](../../../packages/ingest-contracts/src/index.ts),
[triage pipeline](../../../packages/triage/src/util/ingestContent/index.ts),
and [model evals](../../../packages/triage/README.md#paid-eval).
The main prompt/eval files are under
`packages/triage/src/llm/functions/{triageNewEvidence,extractClaimsFromNewEvidence}/`.
Verify dates and facility details in `mrtdown-site` before activation.

## Plan of Work

### 1. Inspect the API

Capture authenticated responses without exposing the key. Confirm the envelope,
pagination, empty-response meaning, missing IDs, and station/line mappings.
Save representative fixtures; label synthetic cases. Record what remains unknown
about coverage and removal. Settle station/line grouping before prompt work.

### 2. Add crawler collection

Add a bounded direct-JSON adapter and a separate signed job, initially disabled.
Propose five-minute polling. Archive responses before comparing complete snapshots.
Normalize row order; emit additions and meaningful changes, not every poll.
Retain lift details, observation times, capture references, and stable event IDs.

Persist comparison state and pending dispatches across restarts. Serialize updates
and retry the same event without losing or duplicating changes. Failed, malformed,
or partial polls must never count as removals. Collect disappearance observations
for review while automatic closure is disabled.

### 3. Connect triage and add evals

Add a dedicated facilities ingest source with structured fields and a readable
evidence formatter. Preserve official LTA provenance and test
[source attribution](../../../data/rights/source-registry.json).
Publish the contract before upgrading the crawler dependency.

Use the existing LLM pipeline to match existing issues, extract facility claims,
and generate titles/translations. Update prompts for this source. Source text is
evidence, never instructions. Do not invent outage dates, repair confirmations,
train-service effects, or whole-station accessibility loss.

Keep deterministic checks around model output: valid station/line mapping,
allowed facility scope, event deduplication, and protection against older updates
overwriting newer state. Hold unsupported output for review. Use saved source
associations for follow-ups once an issue has been matched; do not ask the model
to rediscover that match on every update.

Add triage and extraction evals for new issues, matching operator reports,
unrelated issues at the same station, interchange lines, multiple lifts,
missing IDs, description changes, recurrence, and disappearance without confirmed
recovery. Include lift maintenance versus service maintenance and observation
time versus actual outage time. Replay representative sequences through impact
computation to check that removing one lift cannot clear another's impact.

### 4. Review results and roll out

Run focused paid evals and relevant existing cases; record failures and fixes.
Run collection with dispatch disabled and inspect proposed evidence against raw
responses. Agree period wording and a disappearance policy based on those results.
Keep inferred disappearance distinct from confirmed recovery in both evidence
and site output.

Deploy the consumer before enabling crawler dispatch. Verify canonical records
and published pages for the first updates. Monitor stale polling and failed
ingestion. Rollback disables dispatch and retains snapshots/pending work for replay.

## Validation and Acceptance

- Crawler: `npm run check` and `npm run build` in `mrtdown-data-crawler`.
- Data: `npm run check` and `TZ=UTC npm test` here; `npm run data:validate`
  when canonical records change. Normal tests make no model calls.
- Paid evals: with `OPENAI_API_KEY` configured, intentionally run
  `npm run test:eval -- triageNewEvidence extractClaimsFromNewEvidence` here.
  Record the revision, models, cases, and results; check current pricing first.
- Acceptance: correct `infra` classification and issue matching, preserved lift
  details, no fabricated dates/recovery/service effects, safe retries, and no
  closure from failed polling or removal of only one affected lift. Verify these
  in fixtures, evals, and a disposable-data replay before live dispatch.
