# Complete schematic map review and version migration

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Make generated schematic maps usable by `mrtdown-site`, starting with the
`2025-04` baseline and then the remaining timeline versions. The generator,
schemas, authoring tools, and export foundation already exist. Finish structural
and visual review before replacing the consumer's hard-coded snapshots.

## Progress

- [x] (2026-05-26) Record the [reference inventory](../../schematic-map/reference-inventory.md).
- [x] (2026-05-27) Add schemas, generator, preview, `2025-04` constraints, and
  the archive foundation in [PR #275](https://github.com/foldaway/mrtdown-data/pull/275).
- [x] (2026-05-31) Add semantic/generator diffs, copy-forward tooling, and the
  [designer submission contract](../../schematic-map/designer-submissions.md).
- [x] (2026-11-26) Recheck generator, CLI, and Pages source paths. Existing
  tooling is implementation evidence, not proof of renderer parity or migration.
- [ ] Review baseline station/edge coverage, ids, labels, geometry, and exceptions.
- [ ] Prove baseline rendering and archive import with the site consumer.
- [ ] Migrate and independently review the remaining timeline versions.

## Surprises & Discoveries

The reference inventory separates operational topology from displayed schematic
coverage. Its `2025-04` reference includes nonoperational displayed stations and
connectors; deriving only open service edges does not prove renderer parity.
Use the [coverage findings](../../schematic-map/reference-inventory.md#operational-topology-check)
to decide which differences are intended before adding coordinates.

The generator defaults `generatedAt` to the current time. Compare deterministic
output with an explicit fixed timestamp; two unpinned runs are not a byte-parity
test. Pages generates the manifest and version artifacts from source constraints
inside staged export data rather than treating checked-in snapshots as inputs.

## Decision Log

- 2026-05-24: Publish complete effective-date snapshots; substantial network
  reflows make mandatory deltas a poor review contract. Rendering and interaction
  stay with the consumer. Designer changes enter through normal branch review.
- 2026-05-25: The canonical inputs are generator code, reusable rules, and
  reviewed constraints. Use existing site maps as references, not wholesale
  copied coordinates. Begin with `2025-04` and engine `lta-system-map-2011`.
- 2026-05-25: Parity means compatible ids, visible network coverage, coherent
  geometry, and acceptable labels rather than exact coordinate reproduction.
  Preserve line-specific interchange parts and existing SVG interaction ids
  until the consumer deliberately changes them.
- 2026-05-25: Rules are inferred from reference maps and observed conventions;
  no formal LTA design specification is assumed. Start with station and segment
  constraints, adding higher-level rules when they remove real duplication.
- 2026-05-27: Generated snapshots are publication artifacts, superseding the
  original committed-snapshot proposal. Prefer structured geometry; raw path
  support needs a demonstrated exception before expanding the schema.
- 2026-11-26: Focus this plan on baseline review, consumer proof, and version
  migration. The [original plan](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/active/schematic-system-map.md)
  preserves the full early design, superseded proposals, and tool-delivery log.

## Outcomes & Retrospective

Tracked rules and constraints can generate schematic artifacts. Structural and
visual acceptance of the first map and migration of remaining versions are
still open. This review did not verify the consumer's live renderer or change
published maps.

## Context and Orientation

Owning paths in this repository are:

- `packages/core/src/schema/SchematicMap.ts`: renderer-neutral schemas.
- `packages/fs/src/schematicMapGenerator.ts`: topology-derived generation.
- `packages/fs/src/schematicMaps.ts`: source and artifact file access.
- `packages/cli/src/commands/schematicMap.ts`: generation, preview, inspection,
  semantic diff, generator diff, copy-forward, and submission validation.
- `data/schematic-map/system/generator/`: tracked rules and effective-date
  constraints, including `constraint/2025-04.json`.
- `scripts/build-pages-artifact.mjs`: staged generation and archive publication.

Keep four coordinate classes distinct: generated positions derived from rules;
reusable constraints such as anchors/corridors; explained one-off exceptions;
and coordinates in published artifacts. Start with station/segment constraints,
reserve fixed positions for frame anchors or justified exceptions, and report
counts so copied coordinates cannot silently become the primary model.

## Plan of Work

### 1. Review and correct the baseline

Generate the fixed-time baseline and preview with Concrete Steps, then compare
repeat output bytes.

Compare the result with the [reference inventory](../../schematic-map/reference-inventory.md)
and the current site's `MapApr2025.tsx` baseline. Check ids and references before
visual differences: station and service-edge coverage, repeated or missing ids,
labels, line groups, station-code labels, layer order, and line-specific node
parts. Separate intentional displayed/operational coverage differences from bugs.

Correct reusable rules first, then narrow constraints, and document exceptions.
Add focused structural regressions in the owning generator/schema tests. Define
visual acceptance with the consumer rather than inventing a pixel threshold
before a renderer comparison exists.

Acceptance: fixed-input generation is repeatable; all references and ids validate;
coverage differences and fixed geometry are explained; a reviewer accepts the
visible baseline with no major network or label regression.

### 2. Prove the publication and consumer boundary

Build the local Pages artifact using Concrete Steps. Inspect the generated
manifest and version snapshots under `pages-dist/` and inside both archives. Verify that source
inputs drive generation and that stale local generated snapshots are ignored.

Coordinate a site import/render proof for this exact artifact. Verify effective-date
selection, interaction ids, localized labels, overlays, and line-specific
interchange fading. The consumer remains responsible for loading/caching and
visual QA; retain the fallback described in Idempotence and Recovery.

Acceptance: the site can import and render one generated version through its
normal archive path with recorded structural and visual evidence. A schema or
renderer mismatch leaves the existing consumer path usable. Record the actual
consumer commit and validation; do not infer deployment from a local preview.

### 3. Migrate remaining versions through review

Use the inventory's effective dates as the migration set, rechecking it against
the consumer first. Use the copy-forward preview and diff commands in Concrete
Steps; write constraints only for the intended reviewed authoring change. Keep
published storage as complete snapshots, not an inheritance chain.

Validate structural coverage and visual layout independently, including the
wider frames in later maps. Report rule, constraint, exception, and coordinate
count changes. Use the [submission guide](../../schematic-map/designer-submissions.md)
for designer-authored changes; no client writes canonical data directly.

Acceptance: every required timeline version generates and passes review. Keep
generated snapshots outside source control unless a focused fixture is required.
Retire hard-coded site maps only after the complete consumer migration is proven.

## Concrete Steps

From the repo root with repository dependencies installed, build the CLI and
write fixed-time review output:

```sh
npm run build:cli
node packages/cli/dist/index.js --data-dir data schematic-map generate 2025-04 --generated-at 2026-11-26T00:00:00Z > /tmp/schematic-2025-04-a.json
node packages/cli/dist/index.js --data-dir data schematic-map generate 2025-04 --generated-at 2026-11-26T00:00:00Z > /tmp/schematic-2025-04-b.json
cmp /tmp/schematic-2025-04-a.json /tmp/schematic-2025-04-b.json
node packages/cli/dist/index.js --data-dir data schematic-map preview 2025-04 --out /tmp/schematic-2025-04.svg
```

Expect equal JSON files (`cmp` exits successfully without output) and an SVG
preview at the printed path. Generation without `--write` leaves source data
unchanged. For a later reviewed migration, replace `FROM` and `TO` below with
the selected effective months and run from the same directory:

```sh
node packages/cli/dist/index.js --data-dir data schematic-map copy-constraints FROM TO
node packages/cli/dist/index.js --data-dir data schematic-map generator-diff FROM TO
node packages/cli/dist/index.js --data-dir data schematic-map diff FROM TO
```

Expect a constraint preview and reviewable generator/snapshot diffs; the target
constraints must exist before diffing. Add `--write` to copy-forward only for the
intended authoring edit. Run implementation and archive checks from the repo root:

```sh
npm run check
npm run typecheck
TZ=UTC npm test
npm run data:validate
npm run pages:build
```

Expect passing checks and generated versions/manifests in ignored `pages-dist/`
and both archives. These steps build local output and do not deploy the consumer.

## Validation and Acceptance

The commands in Concrete Steps must pass. Record fixed-time generation, artifact
coverage, schema/reference checks, reviewed exceptions, and consumer rendering.
A successful build alone does not satisfy visual or migration acceptance.

## Idempotence and Recovery

Review and export files can be regenerated; source constraint changes remain
normal reviewable edits. On a bad baseline or failed consumer proof, retain the
previous authoring inputs and consumer fallback, correct the rules/constraints,
and regenerate. Do not commit stale output or bypass validation to advance a date.

Use a fixed `generatedAt` for repeatability; unpinned timestamps intentionally
vary. Preserve existing site snapshots until the baseline and all needed timeline
versions pass import/render acceptance. Revert a bad reviewed constraint edit
and regenerate from the prior source; do not patch generated artifacts by hand.

## Artifacts and Notes

The reference inventory is obtained historical evidence. During this docs work,
the fixed-time generation commands produced equal JSON bytes and the preview
command succeeded; this is local command verification, not visual acceptance.
Still required: baseline coverage/exception findings, visual sign-off, exact
archive and consumer revisions, and per-version migration proofs. Keep generated
review files outside Git and link small diffs/receipts from the relevant review.

## Interfaces and Dependencies

The site-side work was recorded in
`mrtdown-site/docs/plans/active/dynamic-system-map.md`. Recheck that repository
before coordinating consumer changes; this plan does not establish its current
status. The site owns SVG/React rendering, localized labels, disruption and
focused-line overlays, links, zoom, timeline selection, and designer UI.

This repository owns topology references, layout rules, reviewed constraints,
interchange composition, semantic ids, layers, generated snapshots, validation,
and submission review. Use structured map primitives rather than TSX. Canonical
station/service effective dates determine operational coverage; review additional
displayed future or under-construction coverage explicitly.

Preserve the existing schema and SVG interaction contract until a reviewed
consumer change replaces them. Any expanded primitive or constraint type must
prove source validation, deterministic generation, archive readability, and
consumer compatibility together.
