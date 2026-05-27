# Schematic System Map Generation Plan

## Context

`mrtdown-site` currently ships large hard-coded TSX system map snapshots and
selects among fixed effective dates at runtime. Those hard-coded maps are valid
reference material for this plan: they capture known-good visual decisions,
historical timeline versions, and renderer behavior that the generated output
should be compared against. The site-side plan is
`mrtdown-site/docs/plans/active/dynamic-system-map.md`.

The agreed direction is to make schematic system map generation canonical in
`mrtdown-data`, alongside the transit graph data it references. `mrtdown-site`
should consume generated schematic map data and remain responsible for
rendering, localized labels, disruption overlays, focused-line behavior, links,
zoom, and the public timeline UI.

The schematic map is not expected to be generated from topology alone. The end
goal is a generator that encodes the reusable rules of LTA's transit map designs
with as little hard-coded coordinate data as possible. Hard-coded geometry
should be treated as a fallback for true exceptions, not as the primary source
of the map.

## Goals

- Add a canonical schematic system map generator to this repository.
- Define shared schemas in `packages/core` for generator inputs, rule
  configuration, generated map manifests, and generated map version snapshots.
- Add file-backed read/write support in `packages/fs`.
- Add CLI generation, validation, and inspection support for schematic maps.
- Publish generated schematic map data in the Pages/archive artifact consumed by
  `mrtdown-site`.
- Encode LTA-style schematic rules: line ordering, octilinear routing,
  interchange composition, branch spacing, label placement, terminal treatment,
  and layer order.
- Minimize hard-coded coordinates by deriving geometry from canonical topology,
  station ordering, interchange constraints, and reusable design rules.
- Preserve explicit escape hatches for reviewed one-off visual exceptions.
- Use complete generated version snapshots as the published storage contract.
- Keep generated version snapshots out of source control by default; publish
  them from deterministic generator output instead.
- Support reviewed schematic edit submissions from trusted authoring clients,
  such as a protected `mrtdown-site` map designer.

## Non-Goals

- This plan does not move site rendering or interaction code into
  `mrtdown-data`.
- This plan does not require an `extends` or delta system for published
  snapshot storage.
- This plan does not require generating acceptable maps from station and service
  topology alone; rule configuration and reviewed constraints are expected.
- This plan does not aim to exactly reproduce every coordinate from the current
  `mrtdown-site` maps when a rule-derived layout is simpler and visually
  acceptable.
- This plan does not allow runtime consumers to mutate canonical schematic data
  directly without review.
- This plan does not require removing existing `mrtdown-site` map snapshots
  before the canonical schema and publication path are proven.

## Data Ownership Boundary

This repository should own:

- map manifests and effective-date versions;
- generator code and deterministic rule configuration;
- reviewed layout constraints, anchors, and exceptions;
- generated station positions and label placement;
- generated segment geometry, including raw SVG paths only where needed;
- generated interchange node composition;
- semantic style hints and layer order;
- branch/PR validation for submitted schematic map edits;
- validation that map references match canonical line, station, service, and
  station-code data.

Consumers such as `mrtdown-site` should own:

- SVG/React rendering;
- current disruption and focused-line overlays;
- station links, tooltips, localized labels, zoom controls, and timeline UI;
- route-level loading, caching, bundle strategy, and visual QA;
- any visual map designer/editor UI used to author generator constraints or
  schematic exceptions.

## Canonical Shape

Schematic map versions should be generated as complete snapshots keyed by
effective date. Large map reflows are normal, so mandatory deltas would make
reviews harder than inspecting the actual full generated version. The generator
inputs and rule configuration should also be versioned so any published snapshot
can be regenerated deterministically.

The canonical source of truth is the generator implementation plus its rule and
constraint inputs. Generated snapshots are published artifacts, not committed
authoring source. Validation should generate snapshots from source inputs and
fail when the generated output is invalid, nondeterministic, or inconsistent
with canonical references.

Coordinates in this plan have four classes:

- `generated`: derived from topology, services, station ordering, layout rules,
  and reusable constraints.
- `constraint`: reviewed anchors, corridor choices, spacing decisions, or
  alignment hints that the generator needs because they cannot be inferred
  safely from topology.
- `exception`: one-off fixed geometry that must carry an explanation because a
  rule or reusable constraint cannot produce the desired map.
- `artifact`: coordinates written into generated snapshots for consumers; these
  are not hand-authored source data.

The first layout implementation should have a stable layout engine id so future
variants can coexist or replace it deliberately. Use `lta-system-map-2011` for
the initial engine, reflecting the broad LTA map design era around the Circle
Line-era map overhaul. The initial engine should use shared general constraints
across timeline versions, with per-version generated snapshots selected from the
stations and services open at the relevant timestamp. Older or alternative
layout engines can be added later without changing the archive contract for
generated snapshots.

The initial constraint model can start conservatively with station-scoped and
line-segment-scoped constraints. Avoid per-station absolute coordinates except
for map-frame anchors and explained exceptions. Higher-level constraints such as
regions, corridors, and interchanges can be added when they remove real
duplication or clarify the generator.

The generated snapshot format should store structured map primitives, not
site-specific TSX. `mrtdown-site` should render those primitives to SVG.
Reference fixtures can be extracted by parsing the current `mrtdown-site`
`Map*.tsx` files, starting with `MapApr2025.tsx`.

There is no assumed formal LTA design specification. The `lta-system-map-2011`
rules should be documented as inferred from current reference maps and observed
LTA conventions.

Suggested target layout:

```text
data/schematic-map/system/generator/rules.json
data/schematic-map/system/generator/engine/lta-system-map-2011.json
data/schematic-map/system/generator/constraint/2012-01.json
data/schematic-map/system/generator/constraint/2017-11.json
data/schematic-map/system/manifest.json
```

Published archive output should expose generated complete snapshots, but these
version files are not source-controlled by default:

```text
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

The existing `mrtdown-site` hard-coded maps should be referenced during schema
and generator work as parity fixtures: they are useful for extracting known
timeline versions, visual review baselines, and renderer ids, but their
coordinates should not be copied wholesale unless a reviewed exception explains
why a rule cannot derive the layout.

## Phases

### Phase 1: Reference Inventory And Rule Discovery

- Inventory the current `mrtdown-site` hard-coded system map snapshots and
  record their effective dates, station ids, line ids, interaction ids, and
  renderer assumptions.
- Use `2025-04` as the first target version because it is the current site
  default, has the established `3140 x 2400` map frame, and is representative
  enough to prove the generator without taking on the larger future map frame
  first.
- Identify reusable LTA-style design rules from the existing maps and official
  map conventions where practical: octilinear directions, downtown compression,
  interchange treatment, branch spacing, loop treatment, label side preference,
  and terminal labels. Treat these rules as inferred conventions, not as an
  official specification.
- Classify existing hard-coded coordinates into rule-derived candidates,
  constraint candidates, and true exceptions.
- Parse `MapApr2025.tsx` into a reference fixture that captures existing ids,
  geometry, label positions, node composition, viewBox, and layer order.
- Define baseline visual comparison expectations against current `mrtdown-site`
  maps without making coordinate equality the success criterion.

Exit criteria:

- The plan has a concrete inventory of current `mrtdown-site` map versions and
  the ids needed to compare generated output against them.
- Each major line family has documented generation rules or known unresolved
  exceptions.

### Phase 2: Schema Draft

Start with a narrow schema before attempting layout generation. The first pass
should define the renderer-neutral data contract for published snapshots plus
minimal generator rule and constraint inputs. Do not include frontend-specific
implementation details, localized label text, generated source-controlled
version files, or layout algorithm behavior in this phase. Avoid raw SVG path
geometry support until a later generator or parity pass proves it is necessary.

- Add core schemas for generator rule configuration, per-version constraints,
  generated schematic map manifests, and generated version snapshots.
- Include a layout engine id, starting with `lta-system-map-2011`.
- Represent common geometry with structured primitives: points, polylines,
  cubic curves, labels, and node parts.
- Include escape hatches for fixed anchors and explicit layer ordering.
- Include stable semantic ids for line groups, station nodes, station labels,
  and station-to-station segments.
- Keep label text out of the schematic data where canonical station names
  already provide it; store only layout hints.

Exit criteria:

- The schema can represent one existing `mrtdown-site` map snapshot without
  losing geometry, labels, layers, or interaction ids.
- The schema distinguishes topology references from schematic layout data.
- The schema distinguishes reusable rules from per-version constraints and
  reviewed one-off exceptions.
- The initial constraint schema supports station-scoped and line-segment-scoped
  constraints without requiring per-station absolute coordinates.
- The generated snapshot schema is renderer-neutral and stores structured map
  primitives rather than TSX or site-private SVG implementation details.

### Phase 3: Generator Foundation

- Add a deterministic generator that reads canonical topology, rule
  configuration, and per-version constraints, then writes complete schematic map
  snapshots.
- Start with `2025-04` as the first baseline version.
- Select included stations and service edges from canonical data according to
  the target timestamp.
- Implement enough LTA-style rules to reduce copied coordinates materially from
  the current hard-coded snapshot.
- Keep explicit coordinates limited to map-frame anchors, unavoidable
  constraints, and reviewed exceptions.
- Preserve the current `mrtdown-site` interaction id contract for generated
  output, including line groups, station-to-station segment ids, station nodes,
  and station labels.
- Build interchange node composition as an explicit generator concern, because
  the site currently needs to fade individual line components inside station
  nodes.
- Keep label placement isolated enough that fallback constraints can be added
  later without entangling label rules with line routing.

Exit criteria:

- One current system map version can be generated deterministically from
  canonical data plus rule configuration.
- The generated output is close enough to the current `2025-04` `mrtdown-site`
  hard-coded map for renderer parity work.
- Any copied or fixed coordinates are documented as constraints or exceptions.
- Snapshot validation fails if generated output is invalid, nondeterministic, or
  inconsistent with canonical references.
- Structural validation covers ids, station coverage, service-edge coverage,
  duplicate ids, and missing labels before visual pixel comparison is required.

### Phase 4: Repository And CLI Support

- Add file-backed schematic map repositories in `packages/fs`.
- Add writer support for published generated snapshots and source-controlled
  constraint authoring.
- Add CLI generation and validation for schematic map files.
- Add CLI inspection helpers for listing versions, selecting the map version
  effective at a given date, and reporting hard-coded coordinate counts by
  coordinate class.

Exit criteria:

- `npm run data:validate` validates generated schematic maps together with the
  existing canonical data.
- The CLI can regenerate, list, validate, and inspect system map versions.
- Reviewers can see whether a change increases or reduces hard-coded layout
  constraints.
- The CLI can parse the current `mrtdown-site` `Map*.tsx` snapshots into
  reference fixtures for comparison.

### Phase 5: Authoring And Review Tooling

- Add copy-forward tooling to create a new full version from an existing full
  version's generator constraints.
- Add semantic diff tooling for reviewers: added/removed stations, moved
  stations, changed paths, changed labels, changed layers, and changed
  references.
- Add generator-diff reporting: rule changes, constraint changes, exception
  changes, and coordinate-count changes.
- Consider rendered visual diff tooling once a renderer exists in a consumer or
  local preview script.

Exit criteria:

- Reviewers can understand schematic changes without reading raw generated TSX
  or large unstructured SVG output.
- New full snapshots can be started from an existing version without making
  `extends` part of the canonical file format.
- Reviewers can tell whether a visual change came from a reusable rule, a
  version constraint, or a one-off exception.

### Phase 6: Designer Submission Contract

Define how trusted authoring clients submit schematic map edits back to this
repository. The first expected client is a protected `mrtdown-site` map designer
that uses the site renderer for visual editing and preview.

- Define an edit bundle or branch layout that contains updated generator
  constraints, generator validation output or semantic diffs, and metadata about
  the source version and intended target version.
- Validate submitted files with the same canonical schema and reference checks
  used for hand-authored changes.
- Create or document a workflow that turns designer output into a reviewed
  branch and draft pull request.
- Include semantic diff output in the PR review path: moved stations, changed
  paths, changed labels, changed layers, and changed references.
- Include generator-diff output so reviewers can reject unnecessary fixed
  coordinates when a reusable rule or constraint would be better.
- Keep all submissions review-gated; do not accept direct canonical writes from
  `mrtdown-site`.

Exit criteria:

- A trusted designer can submit a schematic map edit that becomes a normal
  reviewable `mrtdown-data` PR.
- Designer-originated changes are indistinguishable from hand-authored changes
  after validation and review.

### Phase 7: Seed Initial Map Version

- Use one current `mrtdown-site` system map snapshot as the reference baseline
  for generated canonical schematic data.
- Use `2025-04` as the first baseline.
- Validate all line, station, service, and station-code references.
- Coordinate with `mrtdown-site` to render this version through the planned
  data-driven renderer.

Exit criteria:

- At least one system map version is canonical in this repository and usable by
  `mrtdown-site` for renderer parity work.
- The initial version is generated from rule configuration, with copied
  coordinates limited to reviewed constraints and exceptions.

### Phase 8: Publish In Archive

- Include schematic map manifest and version files in the published Pages/archive
  artifact.
- Update `packages/fs` archive readers so downstream consumers can read
  schematic map data consistently.
- Keep backward compatibility expectations clear while consumers migrate.

Exit criteria:

- The published archive includes validated schematic system map data.
- `mrtdown-site` can pull the data through its existing canonical archive
  workflow.

### Phase 9: Migrate Remaining Versions

- Add generator source coverage for the remaining current timeline versions.
- Validate each version independently.
- Use semantic and visual review where practical.
- Keep generated archive output or imported artifacts out of source control
  unless a specific review requires committing a fixture.

Exit criteria:

- All existing `mrtdown-site` fixed system map timeline versions can be
  generated as canonical schematic map data.
- The data contract is stable enough for `mrtdown-site` to remove hard-coded
  map snapshots after its renderer migration is complete.
- The amount of per-version hard-coded coordinate data is small, explained, and
  trends downward as reusable rules improve.

## Progress Log

- 2026-05-24: Created cross-repo plan from the `mrtdown-site` dynamic system map
  investigation and planning discussion.
- 2026-05-24: Added reviewed designer-submission path for trusted visual editing
  clients such as a protected `mrtdown-site` map designer.
- 2026-05-25: Reframed the plan around a canonical generator that references
  current `mrtdown-site` hard-coded maps as baselines while minimizing copied
  coordinates.
- 2026-05-26: Added the Phase 1 rule-discovery handoff to
  `docs/schematic-map-reference-inventory.md`, covering renderer invariants,
  initial line-family rules, coordinate classes, and unresolved coverage review
  items for the `2025-04` baseline.
- 2026-05-27: Clarified that generated schematic snapshots are publication
  artifacts produced by the generator, not source-controlled data files by
  default.
- 2026-05-27: Began Phase 2 with a narrow `packages/core` schema draft for
  renderer-neutral snapshots, manifests, rule sets, and first-pass constraints;
  raw SVG path geometry remains unsupported until proven necessary.
- 2026-05-27: Added `packages/fs` schematic map path helpers, typed
  read/write functions, and repository/writer facades for generator rule sets,
  per-version constraints, manifests, and generated snapshot artifacts.

## Decision Log

- 2026-05-24: Store map versions as complete snapshots because schematic maps
  can reflow substantially when new lines are introduced.
- 2026-05-24: Keep raw SVG path geometry available so artistically driven line
  bends and curves are preserved.
- 2026-05-27: Prefer structured generated geometry from the first schema draft;
  raw SVG path geometry is only a reviewed last-resort exception.
- 2026-05-24: Keep rendering and interactive behavior out of canonical data;
  consumers own presentation and UI behavior.
- 2026-05-24: Accept designer-originated schematic edits only through normal
  branch, validation, and PR review paths.
- 2026-05-25: The canonical source of future schematic maps should be reusable
  generator rules plus reviewed constraints, not wholesale copied coordinates
  from existing TSX snapshots.
- 2026-05-25: Current hard-coded `mrtdown-site` maps are approved reference
  material for inventory, parity, and exception discovery.
- 2026-05-25: The generator implementation plus rule and constraint inputs are
  canonical.
- 2026-05-27: Generated snapshots are published artifacts produced by the
  deterministic generator, not committed source files by default. This
  supersedes the earlier assumption that generated snapshots would be committed.
- 2026-05-25: Coordinate review distinguishes generated coordinates, reusable
  constraints, explained exceptions, and generated artifact coordinates.
- 2026-05-25: Use `2025-04` as the first generated baseline.
- 2026-05-25: Parity means coherent LTA-style output with compatible ids,
  visible network coverage, reasonable label placement, and no major visual
  regression; it does not mean exact coordinate reproduction.
- 2026-05-25: Preserve the current `mrtdown-site` SVG id interaction contract
  until the site deliberately replaces it.
- 2026-05-25: Name the initial layout engine so future variants can coexist,
  while the first implementation uses shared general constraints across
  timeline versions.
- 2026-05-25: Use `lta-system-map-2011` as the first layout engine id.
- 2026-05-25: Start constraints at station and line-segment scope; avoid
  per-station absolute coordinates except map-frame anchors and explained
  exceptions.
- 2026-05-25: Parse current `mrtdown-site` hard-coded maps into reference
  fixtures, starting with `MapApr2025.tsx`.
- 2026-05-25: Treat LTA-style rules as inferred from reference maps and
  observed conventions because no formal spec is assumed.
- 2026-05-25: Generated snapshots store structured map primitives for
  `mrtdown-site` to render, not TSX.
- 2026-05-25: Validate structure and freshness first; defer visual pixel
  thresholds until a renderer exists.
- 2026-05-25: Model interchange node composition early because overlays depend
  on line-specific station node parts.
- 2026-05-25: Canonical station and service data is expected to be enough to
  determine which stations and service edges are open at a target timestamp.

## Validation

- Run `npm run check`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run data:validate` once schematic data is part of canonical data.
- Run `npm run pages:build` before relying on archive publication.
- Compare generated snapshots against the relevant current `mrtdown-site`
  hard-coded maps for renderer ids, visible coverage, and major visual
  regressions.
- Report the number and purpose of fixed coordinates, constraints, and
  exceptions when reviewing generator changes.
- For designer-originated changes, verify submitted map files pass the same
  validation as hand-authored changes and include semantic diff output for
  reviewers.
