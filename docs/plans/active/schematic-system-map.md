# Schematic System Map Data Plan

## Context

`mrtdown-site` currently ships large hard-coded TSX system map snapshots and
selects among fixed effective dates at runtime. The site-side plan is
`mrtdown-site/docs/plans/active/dynamic-system-map.md`.

The agreed direction is to make schematic system map data canonical in
`mrtdown-data`, alongside the transit graph data it references. `mrtdown-site`
should consume that canonical data and remain responsible for rendering,
localized labels, disruption overlays, focused-line behavior, links, zoom, and
the public timeline UI.

The schematic map is not expected to be generated from topology alone. It
contains hand-authored design decisions: station placement, line bends, bezier
curves, label positioning, interchange composition, layer order, and one-off
visual exceptions.

## Goals

- Add canonical schematic system map data to this repository.
- Define shared schemas in `packages/core` for schematic map manifests and map
  version snapshots.
- Add file-backed read/write support in `packages/fs`.
- Add CLI validation and inspection support for schematic map data.
- Publish schematic map data in the Pages/archive artifact consumed by
  `mrtdown-site`.
- Preserve arbitrary hand-authored geometry without requiring auto-layout.
- Use complete version snapshots as the canonical storage contract.
- Support reviewed schematic edit submissions from trusted authoring clients,
  such as a protected `mrtdown-site` map designer.

## Non-Goals

- This plan does not move site rendering or interaction code into
  `mrtdown-data`.
- This plan does not require an `extends` or delta system for canonical storage.
- This plan does not require deterministic schematic auto-layout from station
  and service topology.
- This plan does not allow runtime consumers to mutate canonical schematic data
  directly without review.
- This plan does not require removing existing `mrtdown-site` map snapshots
  before the canonical schema and publication path are proven.

## Data Ownership Boundary

This repository should own:

- map manifests and effective-date versions;
- station positions and label placement;
- segment geometry, including raw SVG paths where needed;
- interchange node composition;
- semantic style hints and layer order;
- branch/PR validation for submitted schematic map edits;
- validation that map references match canonical line, station, service, and
  station-code data.

Consumers such as `mrtdown-site` should own:

- SVG/React rendering;
- current disruption and focused-line overlays;
- station links, tooltips, localized labels, zoom controls, and timeline UI;
- route-level loading, caching, bundle strategy, and visual QA.
- any visual map designer/editor UI used to author schematic changes.

## Canonical Shape

Schematic map versions should be complete snapshots keyed by effective date.
Large map reflows are normal, so mandatory deltas would make reviews harder
than inspecting the actual full version.

Suggested target layout:

```text
data/schematic-map/system/manifest.json
data/schematic-map/system/version/2012-01.json
data/schematic-map/system/version/2017-11.json
data/schematic-map/system/version/2019-12.json
data/schematic-map/system/version/2024-11.json
data/schematic-map/system/version/2025-04.json
data/schematic-map/system/version/2027-12.json
data/schematic-map/system/version/2029-12.json
data/schematic-map/system/version/2030-12.json
data/schematic-map/system/version/2032-12.json
```

The exact path can change during schema work, but the archive should expose a
stable manifest plus version files that consumers can select by effective date.

## Phases

### Phase 1: Schema Draft

- Add core schemas for schematic map manifests and version snapshots.
- Represent common geometry with structured primitives: points, polylines,
  cubic curves, labels, and node parts.
- Include escape hatches for raw SVG path data and explicit layer ordering.
- Include stable semantic ids for line groups, station nodes, station labels,
  and station-to-station segments.
- Keep label text out of the schematic data where canonical station names
  already provide it; store only layout hints.

Exit criteria:

- The schema can represent one existing `mrtdown-site` map snapshot without
  losing geometry, labels, layers, or interaction ids.
- The schema distinguishes topology references from schematic layout data.

### Phase 2: Repository And CLI Support

- Add file-backed schematic map repositories in `packages/fs`.
- Add writer support only if needed for authoring or copy-forward tooling.
- Add CLI validation for schematic map files.
- Add CLI inspection helpers for listing versions and selecting the map version
  effective at a given date.

Exit criteria:

- `npm run data:validate` validates schematic maps together with the existing
  canonical data.
- The CLI can list system map versions and resolve the version for a date.

### Phase 3: Authoring And Review Tooling

- Add copy-forward tooling to create a new full version from an existing full
  version.
- Add semantic diff tooling for reviewers: added/removed stations, moved
  stations, changed paths, changed labels, changed layers, and changed
  references.
- Consider rendered visual diff tooling once a renderer exists in a consumer or
  local preview script.

Exit criteria:

- Reviewers can understand schematic changes without reading raw generated TSX
  or large unstructured SVG output.
- New full snapshots can be started from an existing version without making
  `extends` part of the canonical file format.

### Phase 4: Designer Submission Contract

Define how trusted authoring clients submit schematic map edits back to this
repository. The first expected client is a protected `mrtdown-site` map designer
that uses the site renderer for visual editing and preview.

- Define an edit bundle or branch layout that contains complete updated map
  snapshot files plus metadata about the source version and intended target
  version.
- Validate submitted files with the same canonical schema and reference checks
  used for hand-authored changes.
- Create or document a workflow that turns designer output into a reviewed
  branch and draft pull request.
- Include semantic diff output in the PR review path: moved stations, changed
  paths, changed labels, changed layers, and changed references.
- Keep all submissions review-gated; do not accept direct canonical writes from
  `mrtdown-site`.

Exit criteria:

- A trusted designer can submit a schematic map edit that becomes a normal
  reviewable `mrtdown-data` PR.
- Designer-originated changes are indistinguishable from hand-authored changes
  after validation and review.

### Phase 5: Seed Initial Map Version

- Extract one current `mrtdown-site` system map snapshot into canonical
  schematic data.
- Prefer a current baseline such as `2025-04` or `2024-11`.
- Validate all line, station, service, and station-code references.
- Coordinate with `mrtdown-site` to render this version through the planned
  data-driven renderer.

Exit criteria:

- At least one system map version is canonical in this repository and usable by
  `mrtdown-site` for renderer parity work.

### Phase 6: Publish In Archive

- Include schematic map manifest and version files in the published Pages/archive
  artifact.
- Update `packages/fs` archive readers so downstream consumers can read
  schematic map data consistently.
- Keep backward compatibility expectations clear while consumers migrate.

Exit criteria:

- The published archive includes validated schematic system map data.
- `mrtdown-site` can pull the data through its existing canonical archive
  workflow.

### Phase 7: Migrate Remaining Versions

- Add the remaining current timeline versions as complete canonical snapshots.
- Validate each version independently.
- Use semantic and visual review where practical.
- Keep generated output or imported artifacts separate from hand-authored data
  changes.

Exit criteria:

- All existing `mrtdown-site` fixed system map timeline versions exist as
  canonical schematic map data.
- The data contract is stable enough for `mrtdown-site` to remove hard-coded
  map snapshots after its renderer migration is complete.

## Progress Log

- 2026-05-24: Created cross-repo plan from the `mrtdown-site` dynamic system map
  investigation and planning discussion.
- 2026-05-24: Added reviewed designer-submission path for trusted visual editing
  clients such as a protected `mrtdown-site` map designer.

## Decision Log

- 2026-05-24: Store map versions as complete snapshots because schematic maps
  can reflow substantially when new lines are introduced.
- 2026-05-24: Keep raw SVG path geometry available so artistically driven line
  bends and curves are preserved.
- 2026-05-24: Keep rendering and interactive behavior out of canonical data;
  consumers own presentation and UI behavior.
- 2026-05-24: Accept designer-originated schematic edits only through normal
  branch, validation, and PR review paths.

## Validation

- Run `npm run check`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run data:validate` once schematic data is part of canonical data.
- Run `npm run pages:build` before relying on archive publication.
- For designer-originated changes, verify submitted map files pass the same
  validation as hand-authored changes and include semantic diff output for
  reviewers.
