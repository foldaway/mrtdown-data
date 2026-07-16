# Direct-to-Main Ingestion Reliability

## Goal

Remove the automated ingestion pull-request queue and allow trusted ingestion
runs to commit canonical issue data directly to `main`.

The target is unattended ingestion, not unconditional ingestion. Ambiguous,
unsupported, or failed inputs should leave canonical data unchanged and produce
an inspectable rejection record.

## Current State

`.github/workflows/ingest.yml` currently serializes ingestion runs onto an
`automated-*` branch, validates the resulting data, and opens one accumulating
pull request for review.

That review step is still catching material errors:

- [PR #301](https://github.com/foldaway/mrtdown-data/pull/301) was manually
  corrected from `no-service` to `reduced-service`.
- [PR #319](https://github.com/foldaway/mrtdown-data/pull/319) removed
  `service.whole` scope setters emitted by a generic clearance update.
- [PR #316](https://github.com/foldaway/mrtdown-data/pull/316) needed a
  translation rerun.
- Several post-migration data fixes corrected recurring service-adjustment
  periods, issue boundaries, duplicate setters, and same-timestamp state
  transitions.

The closed automated PR sample from the target-layout migration through
2026-07-16 contains:

- 12 merged automated PRs;
- 3 merged PRs with manual commits before merge;
- 7 automated PRs closed without merging.

The abandoned PRs include bus-only content, non-operational news, evidence with
no canonical impact, and future station-opening coverage incorrectly treated as
an operational maintenance issue.

The repository already has targeted re-extraction and replay utilities, but the
current detectors only cover:

- invalid period ordering or future open-ended periods;
- a known degraded-service versus future `no-service` pattern;
- issue bundles with evidence but no impact events.

All three detectors currently return zero targets. They do not detect the known
scope broadening, wrong-but-schema-valid effects, plausible-but-wrong recurring
windows, issue matching errors, or irrelevant issue creation.

A preliminary canonical-data audit also finds a large candidate class where a
clearance-like evidence item changes a previously specific service scope to
`service.whole`. These are candidates, not automatically confirmed defects, but
they show that the PR #319 pattern is broader than one recent ingestion.

## Safety Principles

1. Evidence remains append-only and attributable.
2. Operational state changes must be reproducible from evidence and explicit
   pipeline decisions.
3. Schema validation is necessary but not sufficient; semantic guards must
   reject suspicious but schema-valid output.
4. A rejected ingestion is safer than a speculative canonical commit.
5. Model uncertainty must not be hidden by deterministic post-processing.
6. Direct-to-main eligibility should expand by demonstrated reliability, not
   switch on for every source and issue type at once.
7. Human repair remains possible through ordinary focused data changes, but
   ingestion must not depend on a standing review PR.

## Non-Goals

- Guarantee that every submitted payload creates or updates an issue.
- Correct the entire historical issue dataset in the workflow-cutover change.
- Make translations authoritative for operational scope, effect, or timing.
- Run paid model evaluation as part of the normal deterministic test suite.

## Failure Taxonomy

Every observed correction or rejection should be assigned to one of these
classes:

1. **Relevance**
   - bus-only or road incidents;
   - general rail news without operational impact;
   - incidents that mention a train or station but do not state a canonical
     service or facility impact.
2. **Issue triage**
   - new issue versus existing issue;
   - separate planned windows incorrectly combined;
   - one event split into duplicate issues;
   - follow-up evidence attached to the wrong issue.
3. **Entity selection**
   - wrong service direction;
   - inactive or unrelated sibling services;
   - incorrect facility line scope.
4. **Effect**
   - `no-service` versus `reduced-service`;
   - delay versus reduced service;
   - operating-hours adjustment encoded as ordinary disruption.
5. **Scope**
   - a segment or point widened to `service.whole`;
   - directionally reversed segments;
   - a generic update changing scope without an explicit geographic claim.
6. **Period**
   - service-running hours stored instead of impact hours;
   - wrong recurrence days or overnight anchors;
   - unrelated planned windows merged;
   - future open-ended or reversed intervals.
7. **State transition**
   - duplicate setters;
   - same-timestamp evidence applied in the wrong order;
   - a clearance update overwriting unrelated state.
8. **Presentation**
   - poor translation;
   - incorrect title, slug, or issue date.
9. **Workflow integrity**
   - duplicate delivery;
   - partial multi-item persistence;
   - ingestion based on stale `main`;
   - a bot push that does not trigger required downstream publication.

## Phase 1: Build a Historical Regression Corpus

Create a checked-in corpus from real ingestion outcomes rather than synthetic
examples alone.

### Sources

- Automated PRs with manual commits, beginning with #301, #316, and #319.
- Automated PRs closed without merge, including the reason they should have
  produced no canonical change.
- Focused post-migration correction commits for effects, scopes, periods,
  issue splitting, and duplicate state setters.
- Confirmed incorrect canonical issues found by the audit selectors below.
- A representative sample of untouched automated PRs as positive controls.

### Case Format

Each case should preserve:

- the original webhook payload or normalized ingest content;
- the repository base revision used by the original run;
- the original pipeline output;
- the accepted final semantic outcome;
- the failure-taxonomy labels;
- whether the expected outcome is create, update, ignore, or quarantine.

Expected results should compare semantic state, not generated IDs or harmless
serialization differences.

### Deliverable

Add a command that lists the corpus and can replay one case or a filtered group
without writing to canonical `data/`.

## Phase 2: Add Full-Pipeline Historical Replay

The existing replay tools operate after issue triage and mostly reconstruct
claims from committed impact events. Add an end-to-end replay harness that can:

1. materialize the repository at a recorded base revision;
2. ingest the recorded payload into a temporary data root;
3. capture triage, extraction, normalization, impact computation, and
   translation outputs separately;
4. compare the resulting issue state with the accepted semantic expectation;
5. repeat model-backed cases to measure output stability;
6. emit a machine-readable report without modifying canonical data.

Keep two test layers:

- deterministic tests for normalization, state transitions, validation, and
  semantic guards;
- paid model evals for relevance, issue matching, effect, scope, and period
  extraction.

Model-backed regression cases should run on demand and when the relevant prompt,
model, tool, or normalization code changes.

## Phase 3: Fix Known Systemic Behaviors

### Preserve Scope on Generic Updates

The claim model already permits `scopes.service` to be null. Use that to
distinguish:

- an explicit whole-service claim; from
- an update that does not provide new geographic scope.

Clearance and generic status updates should normally close or change the effect
for the existing entity while preserving its current scope. Update the current
eval that expects `service.whole` for a generic cleared message.

Add a deterministic guard that rejects a changed bundle when evidence without
an explicit whole-service assertion widens a specific scope to
`service.whole`.

### Constrain Severe Effects

Require explicit suspension, closure, or no-train language before accepting
`no-service`. Degraded operation, longer waits, shuttle operation, a single
platform, or partial availability should not become `no-service`.

Keep prompt guidance, but also add a post-extraction contradiction guard for
high-confidence patterns. The guard should reject the candidate rather than
silently rewrite an uncertain claim.

### Validate Operational Period Semantics

Add deterministic checks for:

- recurring anchor time matching `timeWindow.startAt`;
- overnight windows using the correct recurrence day;
- service-hours adjustments representing the unavailable window;
- suspicious all-day periods inferred from evidence that states exact hours;
- unrelated planned windows being combined into one issue;
- recurring periods that extend outside the evidence-stated date range.

Some checks will be hard failures; others should produce a quarantine reason
until their false-positive rate is known.

### Strengthen the Operational Impact Gate

For a new issue, `claims.length > 0` is not a sufficient acceptance rule.
Define the minimum canonical impact by issue type and reject new issues that
only produce metadata, scope, or cause setters without a meaningful operational
effect and period.

Expand relevance evals with the abandoned-PR examples:

- bus-only diversion;
- pest-control or general operator news;
- station-opening coverage without a temporary operational impact;
- personal incidents reported after the fact without stated rail impact.

### Make Delivery Idempotent

Before direct commits, define a stable ingest identity using the producer
identifier and/or normalized source URL plus source timestamp. A retried
dispatch must not append duplicate evidence or create a duplicate issue.

## Phase 4: Audit and Repair Canonical Issue Data

Add dry-run audit selectors that output issue and evidence IDs for:

- clearance evidence that widens a specific scope to `service.whole`;
- effect and evidence-text contradictions;
- suspicious service-hours and recurring periods;
- duplicate source URLs or equivalent evidence;
- duplicate or immediately superseded setters;
- metadata-only issues with no meaningful operational impact;
- planned issues containing non-overlapping windows that likely need splitting.

For each selector:

1. review a sample and estimate precision;
2. refine it until it is useful as an automated guard;
3. classify all remaining matches;
4. re-extract and replay confirmed defects with the fixed pipeline;
5. inspect semantic diffs;
6. commit canonical repairs separately from pipeline code.

Do not bulk rewrite impact IDs or formatting unless required by a semantic
repair.

## Phase 5: Introduce a Candidate-and-Gate Ingest Transaction

Refactor ingestion so an entire webhook payload is processed in a temporary data
root before any canonical commit.

The transaction must:

1. start from the current `main` SHA;
2. process every payload item;
3. run data validation;
4. run semantic guards on every changed issue;
5. verify append-only evidence behavior and allowed file paths;
6. enforce idempotency;
7. produce a concise change manifest;
8. either accept the whole transaction or leave `main` unchanged.

If `main` changes while the model calls are running, discard the candidate and
rerun from the new SHA. Rebasing an old triage decision is insufficient because
the set and state of candidate issues may have changed.

Store a workflow artifact or action summary containing:

- payload identity;
- base SHA;
- model and prompt versions;
- triage result;
- normalized claims;
- guard results;
- estimated model cost;
- accepted commit SHA or quarantine reason.

Translation should not control operational acceptance. Decide and document a
safe fallback, such as retaining only verified source text and deferring failed
non-English enrichment.

## Phase 6: Shadow Direct-to-Main Decisions

Keep the current PR workflow temporarily, but run the candidate-and-gate
decision in parallel.

For each ingestion, record whether the future direct-to-main system would:

- accept;
- ignore as irrelevant or duplicate;
- quarantine for ambiguity or a failed guard.

Reviewers should record any semantic correction using the failure taxonomy.
The shadow report must make it easy to compare:

- candidate output;
- final merged output;
- fields changed manually;
- whether a guard should have caught the correction.

### Cutover Readiness

Before enabling direct commits:

- every confirmed historical regression case passes;
- repeated model evals meet an agreed stability threshold;
- all high-confidence audit defects are resolved or explicitly waived;
- no shadow-accepted ingestion requires a manual effect, scope, period, issue
  matching, or relevance correction during the observation window;
- quarantine behavior is tested and leaves canonical data unchanged;
- duplicate delivery and stale-main retries are tested;
- rollback and publication triggering are tested.

Use a minimum observation window of 20 eligible ingestions. If volume is too
low, also require enough elapsed time to include both live disruptions and
planned-work evidence.

## Phase 7: Staged Direct-to-Main Rollout

Expand eligibility in risk order:

1. official operational updates to an existing issue;
2. official reports creating a new live disruption;
3. trusted crowd-report clusters;
4. planned maintenance and service-hour adjustments;
5. media reports and infrastructure evidence.

Ineligible or ambiguous inputs should be quarantined, not routed into a
replacement review PR.

The direct workflow should:

1. check out `main`;
2. build and validate the candidate transaction;
3. confirm `main` has not changed;
4. create one focused conventional commit;
5. push directly to `main`;
6. explicitly trigger required validation/publication workflows.

The last step needs deliberate implementation. GitHub Actions events created
with the repository `GITHUB_TOKEN` may not trigger other workflows. Use an
appropriate GitHub App or scoped token, or explicitly dispatch downstream
workflows after the commit, and test the complete Pages publication path.

Keep ingestion concurrency serialized and do not cancel an in-progress
transaction.

## Rollback and Incident Response

- Keep each accepted payload in one revertible commit.
- Retain the payload and decision report long enough to reproduce the run.
- Provide a documented command to re-run one payload against a chosen revision.
- If a post-commit invariant fails, stop subsequent ingestion and alert rather
  than continuing to write.
- Repair bad canonical data with a focused revert or correction commit; do not
  resurrect the ingestion PR queue as the normal path.

## Metrics

Track at least:

- accepted, ignored, quarantined, and failed payload counts;
- manual semantic correction rate during shadow mode;
- regression pass and repeated-run stability rates;
- duplicate-delivery suppression;
- stale-main retries;
- guard failures by taxonomy;
- time from evidence receipt to canonical commit;
- model usage and cost;
- post-commit validation and publication success.

## Suggested Change Sequence

1. **Corpus and replay reporting**
   - add historical cases and semantic comparison;
   - no canonical data changes.
2. **Scope, effect, period, and relevance fixes**
   - add deterministic guards and focused evals.
3. **Canonical audit and repairs**
   - data-only changes based on confirmed findings.
4. **Transactional candidate workflow and shadow reports**
   - retain PR creation while gathering readiness metrics.
5. **Direct-to-main cutover**
   - remove automated branch and PR creation;
   - add bot credentials, explicit publication triggering, quarantine, and
     rollback documentation.

## Open Decisions

- Which source classes are eligible at each rollout stage?
- What repeated-run stability threshold is acceptable for model-backed cases?
- Which semantic warnings are hard failures versus quarantine reasons?
- What is the translation fallback when enrichment quality is unacceptable?
- Where should quarantine records and operational alerts live?
- What observation duration supplements the 20-ingestion minimum when incident
  volume is low?

## Completion Criteria

This plan is complete when:

- `.github/workflows/ingest.yml` no longer creates or updates automated PRs;
- eligible ingestion commits directly to `main`;
- rejected and quarantined inputs leave canonical data unchanged;
- the historical regression corpus and semantic guards pass;
- canonical issue audits have no unresolved high-confidence defects in the
  covered classes;
- duplicate, stale-main, rollback, validation, and publication paths are
  verified;
- repository documentation describes the direct-to-main operating model.
