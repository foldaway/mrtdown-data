# Finish evidence attribution and public export coverage

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Make exported evidence rights and source attribution understandable to consumers
without relabeling third-party content as MRTDown-owned. Finish the attribution
and crowd-report gaps around the existing registry, validation, and redaction.
Current licensing policy belongs in [the data guide](../../data/overview.md#licenses-and-sources)
and [LICENSE-DATA.md](../../../LICENSE-DATA.md).

## Progress

- [x] (2026-06-29) Add separate data/code licenses and the versioned source
  registry in [PR #337](https://github.com/foldaway/mrtdown-data/pull/337).
- [x] (2026-11-26) Inspect registry matching, evidence-rights validation, Pages
  redaction, and manifest hashes in the current checkout. These already exist;
  their implementation is not future work.
- [ ] Build and inspect an export, then record the remaining attribution and
  discoverability gaps against the acceptance criteria below.
- [ ] Specify and implement the missing deterministic attribution artifacts and
  consumer pointers, if the artifact audit confirms they are absent.
- [ ] Resolve crowd-report inbound terms and verify the public text policy.

## Surprises & Discoveries

`packages/fs/src/rights.ts` resolves source rules by URL, original archive host,
path, and evidence type, using priority to select a unique highest-priority rule.
`validateEvidenceRights` in `packages/fs/src/validate.ts` rejects unresolved rows.
Do not replace this with the original proposal's simpler matching model.

`scripts/build-pages-artifact.mjs` generates schematic artifacts, redacts
nonpublic evidence, validates the staged data, copies the data license, and
builds the manifest before creating archives. `packages/fs/src/manifest.ts`
hashes the license and source registry. The inspected build does not generate
the general `attribution.json` and `ATTRIBUTION.md` proposed earlier; confirm
this in a built artifact before implementing the remaining output.

The direct crowd-report registry rule has `publicExportAllowed: false` and
identifies inbound terms as required. A valid ingest contract does not itself
grant public reuse rights.

## Decision Log

- 2026-06-29: Separate MRTDown's CC-BY-4.0 data license, MIT code license, and
  upstream rights through a versioned registry instead of repetitive per-row
  licensing fields.
- Earlier design: put shared rights and attribution schemas/types in `core`,
  file matching and export behavior in `fs`, and commands in `cli`. Generate a
  JSON attribution index and human-readable notices without network calls.
- 2026-11-26: Replace implemented scaffold phases and speculative schema examples
  with the remaining artifact audit, attribution, and inbound-terms milestones.
  The [original design](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/active/data-licensing-attribution.md)
  retains the earlier options and rationale. This cleanup changes no rights rule.

## Outcomes & Retrospective

Source classification, validation, and export redaction are implemented. General
attribution output and the crowd-report rights decision remain open. No terms
review, new reuse permission, or production export verification is claimed here.

## Context and Orientation

The registry maps an evidence source to upstream content rights, MRTDown's
separate contribution, attribution, and public-export policy. The owning schema
is `packages/core/src/schema/Rights.ts`; actual examples are in
`data/rights/source-registry.json`. Avoid copying a second schema into this plan.

Evidence provenance remains in `data/issue/YYYY/MM/<issue_id>/evidence.ndjson`.
Rights are resolved at validation/export time. Do not bulk-rewrite historical
rows unless the audit identifies a specific missing provenance record. A future
separation of quoted source text and authored claims needs its own reviewed
contract, not an assumption that the whole evidence row has one license.

This work covers repository-authored data and recurring government, platform,
publisher, archived-web, generic-web, and crowd-report sources. Source-specific
schedule obligations remain in the [GTFS publication guide](../../gtfs/operations/schedule-publication.md).
The [completed crowd-report implementation](../completed/crowdsourced-reports.md)
records ingestion, not inbound licensing approval.

## Plan of Work

### 1. Audit the actual artifact

Build the local export with Concrete Steps. Compare the staged records, root HTML,
manifest, and archives with the current license and registry. Record which
notices are already shipped, which text is redacted, and which consumer links
or attribution entries are missing. Use representative government, publisher,
platform, archive, and direct crowd-report fixtures.

Acceptance: the plan identifies concrete gaps with paths or tests, distinguishes
implemented controls from proposed output, and keeps unknown source rights
visible. Record whether missing metadata needs a small code change or a separate
source-policy decision before proceeding.

### 2. Finish deterministic attribution output

For confirmed gaps, add shared schemas in `core`, deterministic generation in
`fs`, and build/index wiring in the existing Pages pipeline. The intended outputs
are `attribution.json`, `ATTRIBUTION.md`, and the required upstream notices.
Decide whether the index groups by evidence or by source URL with evidence
back-references before freezing the contract. Prefer JSON; revisit streaming
only if measured size justifies it.

Include the MRTDown data notice, source-rule summaries, upstream notices, and
an explicit third-party boundary. Make them discoverable from root HTML and
machine-readable manifest pointers. Do not duplicate the full attribution index
in HTML. Match the published schema to what is actually emitted.

Acceptance: repeated generation from identical inputs yields identical bytes;
exported evidence can be traced to its applicable rule and source; required
notices survive archive creation; the public index links to them. Add focused
matching, redaction, generation, and manifest tests in their owning packages.
Run the focused checks in Concrete Steps and inspect emitted files and links.

### 3. Resolve crowd-report terms and remaining source gaps

Identify the producer's submitter terms and the rights they actually grant.
Record the reviewed decision in the owning license/source guide before changing
registry policy. Keep report text nonpublic under the existing rule until a
reviewed change permits reuse. A generic source URL or successful ingestion is
insufficient. Record whether wording needs further legal review as an explicit
open decision; deterministic validation must not fetch live terms.

Acceptance: crowd-report treatment is explicit, testable, and consistent between
producer provenance, registry, notices, and exported text. Add new recurring
source rules before publishing their evidence. Separate policy changes, code,
and any confirmed canonical repairs into focused changes.

## Concrete Steps

With repository dependencies installed, run from the repo root:

```sh
npm run pages:build
```

Expect ignored `pages-dist/` output containing staged records, root HTML,
manifest, and archives. This also writes fixture/build output and does not
deploy. Inspect these files before deciding which attribution outputs are missing.
After implementation, run:

```sh
npm run test:core
npm run test:fs
npm run check
TZ=UTC npm test
npm run data:validate
npm run pages:build
```

Expect passing tests/checks, valid canonical records, and the reviewed notices
and manifest pointers in the rebuilt artifact. No new attribution CLI is assumed;
settle its contract before documenting any additional command.

## Validation and Acceptance

The checks in Concrete Steps must pass and the exported notices must be
inspectable. These commands do not prove live publication or legal permission.

Regression coverage must reject invalid URLs, unmatched or equally prioritized
ambiguous rules, unknown rights ids, missing required attribution, and unresolved
public reuse. Preserve existing original-host and priority matching. Test known
but broad hosts and missing optional attribution values separately so a proposed
warning is not mistaken for implemented behavior.

Close the plan only when artifact coverage is verified and remaining rights
decisions are resolved or explicitly
scoped out with a durable follow-up.

## Idempotence and Recovery

Build into staged output and keep canonical evidence intact. If output generation
fails, fix and repeat the local build; do not relax classification or publish a
partial artifact. Any later schema or policy rollout must specify consumer
compatibility and recovery before publication.

Repeated attribution generation from identical inputs must produce identical
bytes. Policy retries retain the current nonpublic crowd-report setting until
reviewed terms justify a change; a failed audit must not rewrite source evidence.

## Artifacts and Notes

Still required: an artifact inventory, representative redaction/matching proofs,
repeat-generation comparisons, and the reviewed inbound-terms decision. Keep
small evidence with the relevant change and link exact built-file identities
where needed. The source inspection in Surprises & Discoveries is not a built
artifact or legal review receipt.

## Interfaces and Dependencies

Reuse `packages/core/src/schema/Rights.ts` and the existing registry resolver.
The attribution grouping and any new manifest pointers remain contract decisions
to settle before dependent implementation. Shared types belong in `core`,
filesystem/export logic in `fs`, and Pages wiring in the existing build. Preserve
consumer compatibility and the distinction between ingestion and reuse rights.
