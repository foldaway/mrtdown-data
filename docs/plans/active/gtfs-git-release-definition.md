# Verify Git-defined GTFS release adoption

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Finish adoption of reviewed `releases/gtfs.json` desired state through the
standard Pages deployment. Verify the first exact timetable, site import, and
retention without changing approvals, source facts, or the service-date window.
The code is merged; the remaining work is an observed adoption proof.

## Progress

- [x] (2026-11-23) Select and implement a compact release definition, capture PR
  proposals, main-push publication, previews, and first-definition bootstrap.
- [x] (2026-11-24) Complete definition replay, held-review restoration,
  receipt-only recovery, preparation-base checks, deletion guards, and
  serialization-independent handoff. The implementation checkpoint passed
  repository checks, actionlint, and 1,008 deterministic tests.
- [x] (2026-11-26) Confirm [PR #499](https://github.com/foldaway/mrtdown-data/pull/499)
  is present in local history as `1b7da591`. The inspected checkout has no
  `releases/gtfs.json`; code presence does not establish live adoption.
- [x] (2026-11-27) Trace the [failed Pages run](https://github.com/foldaway/mrtdown-data/actions/runs/45976035917)
  after PR #510 to the retained shared-claim digest. The new Joo Koon service
  makes eight source patterns ambiguous across 2,709 November trip/date pairs.
- [ ] Review the [proposed single-service selections](../../gtfs/reviews/joo-koon-service-selection-2026-11-27.md)
  for those eight Joo Koon patterns, then prepare new mapping, release and
  `correction` source admission approvals with correction revision 2.
- [ ] Prepare and review the first definition of the newly approved release
  using current source evidence and approvals.
- [ ] Observe the exact ordinary Pages deployment, site completion receipt,
  and retained baseline, then verify an ordinary data-only redeployment.

## Surprises & Discoveries

Retention already holds compact policies and evidence reusable in a definition.
Bootstrap can name the same completed release without changing its hashes or
inventing a new approval. An evidence-only/no-op capture does not itself establish
the first definition; inspect the actual review result before treating it as one.
The bootstrap reader rebuilds the completed release against the canonical data
being shipped, so a canonical service change also needs a newly reviewed release.
The PR preview did not exercise this bootstrap path because no desired definition
exists yet.

## Decision Log

- 2026-11-23: Git describes desired timetable state; retention records completed
  state. Ordinary Pages deployment owns publication for both timetable and
  unrelated canonical changes.
- 2026-11-23: Permit the bootstrap retained-release reader only before adoption.
  Deleted or invalid definitions after adoption must fail rather than select
  an implicit fallback.
- 2026-11-26: Keep this plan active for adoption evidence after the implementation
  merge. Current procedures live in the runbooks, not a second design proposal.
- 2026-11-27: Keep PR #510's Joo Koon service. Resolve its source patterns through
  explicit dated single-service selections and a new reviewed GTFS release; do not
  reuse the old mapping or release approval.

## Outcomes & Retrospective

Implementation and deterministic failure-path coverage are merged. This review
has not observed first-definition publication or its production receipt. The
[original implementation record](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/active/gtfs-git-release-definition.md)
retains the earlier test milestones and design history.

## Context and Orientation

Start with [desired releases](../../../releases/README.md),
[publication and recovery](../../gtfs/operations/automatic-publication.md#first-definition-and-recovery),
[recipes](../../gtfs/operations/release-recipes.md), and
[retention](../../gtfs/operations/release-retention.md). The definition schema
and materializer are in `scripts/gtfs-release-definition.mjs`; acquisition,
validation, deployment, and import remain separately checked steps.

The JSON binds source receipt/hash, policies, mapping/release approvals, exact
consumer admission review, and expected outputs. Source ZIPs and generated
schedule rows stay outside Git. Rebuilding must use the canonical data shipped
with that deployment, and retention can advance only after exact site completion.

## Plan of Work

### 1. Prepare the reviewable definition

Recheck current `main`, the completed retained baseline, source bytes/terms,
approval scope, and whether a desired definition has appeared since this audit.
Use the first-definition procedure above for the actual completed source or a
qualified successor. Materialize explicitly approved compact inputs with the
command in Concrete Steps. Review the result as `releases/gtfs.json` with
its source-change report. Check exact output parity for a same-release bootstrap
or all successor qualification/admission checks for a new source. A held attempt
stays evidence-only; do not edit hashes, timestamps, or approval bounds to qualify it.

Acceptance: the PR names an exact reproducible release and explains the source
change or same-release adoption. Record the definition commit and bound inputs.

### 2. Observe publication and recovery behavior

After the reviewed definition lands, follow the standard Pages run through public
byte verification, authenticated site pull, exact successful completion receipt,
and retention. Check that the published and retained identities match the intended
definition. A queued pull, HTTP success alone, or old receipt is insufficient.

Verify a later ordinary data-only deployment retains the same desired timetable
without temporary Actions artifacts or a capture-age reapproval of that completed
release. Record the actual run and site import identities in Outcomes.

Acceptance: observed publication, exact import, retention, and ordinary redeploy
all match Git's intended release; failure paths retain the documented explicit state.

## Concrete Steps

Run from the repo root after obtaining the actual approved input directory:

```sh
node scripts/gtfs-release-definition.mjs create /path/to/approved-inputs /tmp/gtfs.json
```

Replace the input placeholder with the verified compact inputs. Expect a local
JSON definition matching the intended release identities; the command writes
`/tmp/gtfs.json` and does not publish. Follow the linked first-definition runbook
for review and the ordinary Pages run; record that run's exact completion.

For changes to this implementation, run from the repo root:

```sh
npm run check
TZ=UTC npm test
actionlint .github/workflows/gtfs-capture.yml .github/workflows/pages-deploy.yml .github/workflows/pages-preview.yml .github/workflows/validate.yml
```

The first two commands use installed repository dependencies; actionlint must
be installed separately. Expect no failing checks. Tests write ignored build
and fixture output, not release approvals or production state.

## Validation and Acceptance

The implementation checks in Concrete Steps must pass. Existing tests cover exact
replay, missing/corrupt sources, identity and predecessor/policy mismatches, deletion after
adoption, and aged completed-release redeployment. These tests establish local
behavior; close this plan only after the separate live acceptance above is recorded.

## Idempotence and Recovery

On partial publication, keep desired state explicit and complete the failed exact
import/retention or use the reviewed rollback procedure. Do not replace the
baseline or delete the definition to force a fallback. A changed preparation base
requires fresh preparation, and stale evidence cannot authorize a successor.

A same-release bootstrap and ordinary redeployment must preserve the completed
release identities. Recheck current desired and retained state before a retry;
retain the failed run's diagnostics until its exact recovery is recorded.

## Artifacts and Notes

The earlier implementation results are linked in Outcomes & Retrospective.
Still required: the reviewed definition commit, expected output identities,
Pages verification result, exact successful site receipt, retained baseline,
and data-only redeployment receipt. These live acceptance records have not been
obtained by this documentation work.

## Interfaces and Dependencies

The materializer in `scripts/gtfs-release-definition.mjs` owns the definition
contract. Preserve compatibility with capture preparation, standard Pages
publication, consumer source admission, and retained completed state. Source
acquisition and fresh terms checks need the authorized external services; do
not replace them with local hashes or historical approvals.
