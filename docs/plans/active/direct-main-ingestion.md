# Prove safe direct-to-main evidence ingestion

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Allow trusted evidence ingestion to commit canonical issue data without an
automated PR queue. Eligible payloads must pass semantic and transactional checks;
ambiguous, irrelevant, unsupported, or failed payloads leave canonical data
unchanged and produce an inspectable decision record.

## Progress

- [x] (2026-07-16) Add the historical corpus and partial replay tooling in
  [PR #349](https://github.com/foldaway/mrtdown-data/pull/349).
- [x] (2026-10-21) Serialize, rebase, and bound retries in the existing PR path.
- [x] (2026-11-26) Recheck the workflow and replay guide: ingestion still uses
  automated PRs; replay does not yet cover title generation, translation,
  persistence, or the complete workflow.
- [ ] Audit current semantic guards against confirmed historical regressions.
- [ ] Complete replay, candidate isolation, guards, and dry-run canonical audits.
- [ ] Measure candidate decisions in shadow mode and record cutover readiness.
- [ ] Prove staged direct commits, rejection, retry, rollback, and publication.

## Surprises & Discoveries

Generic clearance messages historically widened a specific scope to
`service.whole`; [PR #319](https://github.com/foldaway/mrtdown-data/pull/319)
removed such setters. Schema-valid output can still be operationally wrong.
A manual edit is not automatically ground truth: the correction in
[PR #301](https://github.com/foldaway/mrtdown-data/pull/301) was later found
incorrect because the closed and available LRT loops are separate services.

The [original baseline](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/active/direct-main-ingestion.md#original-baseline)
retains the July PR sample, detector observations, and proposed audit categories.
Those counts are historical evidence; rerun selectors before asserting current
coverage or defects. Candidate matches are not confirmed canonical errors.

## Decision Log

- 2026-10-21: Serialize and rebase the existing PR path, cap merge retries,
  and rerun deterministic validation when `main` advances without repeating paid
  ingestion. This improves the PR path without authorizing direct writes.
- 2026-11-26: Consolidate the earlier phases and repeated rollout checklist into
  the milestones below. Preserve the agreed 20-ingestion shadow minimum and
  source eligibility sequence; numeric model-stability thresholds remain open.

## Outcomes & Retrospective

Read-only corpus inspection and paid partial replay exist. Automated PRs can
merge after deterministic checks. Semantic eligibility, complete replay,
shadow results, and direct-write publication acceptance remain unfinished.
This docs review changed no ingestion behavior or credentials.

## Context and Orientation

The [triage guide](../../../packages/triage/README.md) owns current commands,
paid-call boundaries, repair tools, and automated workflow behavior. Read
`.github/workflows/ingest.yml`, `packages/triage/src/regression`,
`packages/triage/src/util/ingestContent`, and `scripts/validate-ingest.sh`
before implementation. Historical cases live in `fixtures/triage-regressions`.

A candidate is a payload's proposed changes in an isolated temporary data root.
A guard rejects a suspicious semantic result before canonical persistence.
Quarantine means retaining a diagnostic decision without changing canonical
data. Shadow mode records what direct ingestion would decide while the existing
workflow remains responsible for publication.

Evidence stays append-only and attributable. State changes must be reproducible
from evidence and explicit decisions. Do not hide uncertain model output through
silent deterministic rewrites, treat translations as scope/effect authority,
or repair the whole issue dataset inside the workflow cutover.

Use these failure classes consistently in corpus cases, guards, audits, and
shadow reports:

| Class | Examples to preserve |
| --- | --- |
| Relevance | Bus-only content, general news, no operational rail impact |
| Issue triage | Wrong existing issue, merged planned windows, duplicate issues |
| Entity selection | Wrong direction, inactive sibling service, wrong facility line |
| Effect | Suspension versus reduced service/delay, service-hours adjustment |
| Scope | Specific scope widened to whole service, reversed segment, unsupported geography |
| Period | Service hours mistaken for impact hours, recurrence/overnight errors, invalid bounds |
| State transition | Duplicate setters, same-timestamp ordering, unrelated clearance |
| Presentation | Translation, title, slug, or issue date |
| Workflow integrity | Duplicate delivery, partial persistence, stale base, missing publication |

## Plan of Work

### 1. Reconcile corpus coverage and finish end-to-end replay

Use the read-only corpus inspection in Concrete Steps. Review corrected PRs
(#301, #316, #319), rejected PRs, confirmed post-migration
repairs, and untouched positive controls. Each case must retain payload, source
base, observed output, accepted semantic expectation, failure labels, and the
expected create/update/ignore/quarantine result. Compare semantics rather than
generated ids or serialization.

Extend replay to materialize a recorded base into temporary data, capture each
pipeline stage including title, translation, persistence, and final issue state,
and compare against accepted semantics. Add explicit repeated model runs for
stability measurement. Keep model-backed replay intentional and separate from
deterministic tests; `--replay` makes paid calls. Do not write to canonical data.

Acceptance: stage-specific failures and final semantic diffs are inspectable;
replay can cover a complete payload and repeat without contaminating another case.
Record the model/prompt revision and paid-run results before claiming reliability.

### 2. Prove guards and audit confirmed canonical defects

First inspect current prompts, normalization, guards, and evals so this milestone
does not reimplement a shipped fix. Add regressions for remaining gaps:

| Invariant | Required outcome |
| --- | --- |
| Generic clearance has no new geography | Preserve specific scope; reject unsupported widening to `service.whole` |
| No explicit suspension/closure/no-train evidence | Do not accept `no-service` from delay, partial availability, shuttle or single-platform operation |
| Recurring and overnight periods | Anchor recurrence to the stated impact window and day; reject unsupported all-day or out-of-range periods |
| New issue has operational meaning | Metadata, cause, or scope setters alone do not establish an effect and period |
| Repeated source delivery | Stable producer/source identity prevents duplicate evidence or issues |

An absent service scope is distinct from an explicit whole-service claim. Reject
contradictions rather than silently choosing an effect. Measure uncertain rules
before deciding whether they are hard failures or quarantine reasons.

Add dry-run canonical selectors for unsupported widening, effect/text conflicts,
period errors, duplicate sources/setters, metadata-only issues, and unrelated
planned windows. Review samples, estimate precision, classify remaining matches,
and repair confirmed defects using the corrected pipeline and semantic diffs.
Keep data repairs separate from pipeline code; preserve unchanged impact ids and
formatting. Do not bulk-rewrite a candidate class as if it were confirmed wrong.

Acceptance: confirmed regressions pass, selector precision and guard decisions
are recorded, and high-confidence defects in the covered classes are resolved or
explicitly waived. Focused triage and canonical validation checks must pass;
paid relevance, issue-matching, scope, effect, and period evals remain separate.

### 3. Isolate and gate one complete payload

Refactor the existing ingestion entry point so every payload item is processed
in temporary data based on the current `main` SHA. Before acceptance, require:

1. Complete payload processing and canonical validation.
2. Semantic guards on every changed issue.
3. Append-only evidence and an allowed-path check.
4. Stable ingest identity and duplicate suppression.
5. A concise change manifest and all-or-nothing acceptance.
6. A final base-SHA check. If `main` changed during model work, discard and rerun
   from the new base; rebasing an old semantic decision is insufficient.

Retain the decision record specified in Artifacts and Notes.
Translation failure needs a documented fallback and must not determine whether
operational claims are accepted. Record where quarantine and alerts belong.

Acceptance: malformed, ambiguous, partial, duplicate, and stale-base attempts
have deterministic outcomes and cannot partly persist. A retry is safe; a
failed candidate leaves canonical data unchanged. Add temporary-root integration
coverage rather than relying only on schema validation.

### 4. Measure shadow readiness

Keep the PR workflow and compare each candidate's accept/ignore/quarantine
decision with the final reviewed result. Record manual semantic corrections by
failure class, including whether a guard should have caught them. Track correction
and regression rates, repeated-run stability, duplicate suppression, stale-base
retries, quarantine/guard counts, latency, model cost, and publication outcomes.

Require at least 20 eligible ingestions, plus enough elapsed time to include live
disruptions and planned work if volume is low. Before cutover, confirmed historical
regressions must pass, repeated evals must meet an explicitly agreed stability
threshold, and no shadow-accepted item may need a manual scope/effect/period,
issue-matching, or relevance correction in the observation window. Quarantine,
duplicate, stale-base, rollback, and publication tests must pass.

Acceptance: record the actual observation window, results, threshold decision,
and unresolved classes. Choose source eligibility, translation fallback, storage,
and alert destination explicitly. Insufficient evidence keeps direct writes closed.

### 5. Roll out by source class and prove recovery

Expand eligibility in the recorded order: official updates to existing issues;
new official live disruptions; trusted crowd clusters; planned maintenance/hours
changes; then media and infrastructure evidence. Hold ineligible or ambiguous
payloads in quarantine rather than creating a replacement review queue.

For eligible input, check out current `main`, build and validate the isolated
candidate, recheck the base, commit one focused conventional change, and publish.
Serialize ingestion without cancelling an active transaction. Prove the downstream
validation and Pages trigger: ordinary `GITHUB_TOKEN` pushes may not start other
workflows, so choose a suitable scoped identity or explicit dispatch and test it.

Acceptance: the eligible staged case commits directly and reaches verified
publication; rejected inputs change nothing; duplicate/stale-base retries and
rollback behave as recorded. Update the triage runbook with the implemented
operating procedure before completing the cutover.

## Concrete Steps

With repository dependencies installed, inspect the corpus from the repo root:

```sh
npm run triage:regressions -- --list
npm run triage:regressions -- --label scope --json
```

Expect validated case listings and a filtered JSON report. These commands build
ignored package output and read historical cases; they do not call models or
write canonical data. For implementation checks, run from the same directory:

```sh
npm run test:triage
npm run check
TZ=UTC npm test
npm run data:validate
```

Expect passing regressions and valid canonical records. Model replay requires
an intentional paid run using the triage guide's explicit `--replay` option.
No complete candidate/shadow/cutover CLI exists yet: record those concrete
invocations and expected receipts as their milestones implement the interfaces.

## Validation and Acceptance

The implementation checks in Concrete Steps must pass. The deterministic suite
must not require a model key. Model-dependent semantic replay and evals require an intentional
run and recorded results when prompts, models, tools, or normalization change.

Close the plan only after complete replay, measured guards and audits, the
shadow window, staged direct commits, rejection, stale-base/duplicate recovery,
and downstream publication have evidence. Current PR hardening alone does not
satisfy direct-to-main acceptance. Record remaining eligibility exclusions and
recovery instructions in the maintained triage guide.

## Idempotence and Recovery

The candidate invariants in milestone 3 govern duplicate suppression and
all-or-nothing persistence. If `main` changes during model work, discard and
reprocess the candidate from the new base; a rebase does not refresh triage.
Failed and quarantined candidates leave canonical data unchanged.

Keep each payload in one revertible commit and retain enough input/report context
to rerun it against a chosen revision. A post-commit invariant failure stops
subsequent ingestion. Repair with a focused revert/correction and document the
response; do not restore the PR queue as the normal operating path.

## Artifacts and Notes

Retain payload identity, base SHA, model/prompt revisions, triage and normalized
claims, guard results, model usage/cost, and accepted commit or quarantine reason.

The historical corpus is obtained evidence. Still required: complete replay
results, guard/audit reports, the measured shadow window and agreed thresholds,
and staged publication/recovery receipts. Label planned checks separately from
actual results; retain manual semantic corrections by failure class.

## Interfaces and Dependencies

Keep the external webhook boundary compatible with the shared `IngestPayload`
contract and the existing triage pipeline. Define the isolated candidate result,
semantic guard decisions, and quarantine storage before workflow cutover. The
transaction must cover every item, not expose partial acceptance to persistence.
The translation fallback, alert destination, source eligibility, model-stability
threshold, and GitHub publication identity remain explicit milestone decisions.
Paid model access and downstream Pages delivery are separate dependencies.
