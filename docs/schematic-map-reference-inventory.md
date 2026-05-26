# Schematic Map Reference Inventory

This is the Phase 1 reference inventory for
`docs/plans/active/schematic-system-map.md`.

The inventory is generated from the adjacent `mrtdown-site` checkout with:

```sh
node scripts/schematic-map-inventory.mjs --site-dir ../mrtdown-site --write docs/schematic-map-reference-inventory.json
```

Operational topology can be derived from canonical service revisions with:

```sh
node scripts/schematic-map-topology.mjs --at 2025-04-01 --inventory docs/schematic-map-reference-inventory.json --effective-date 2025-04
```

The JSON file records the renderer ids needed for generated-output parity:
line group ids, station-to-station segment ids, station label ids, station node
ids, station code ids, inferred station ids, raw path geometry ids, viewBox,
root group id, and top-level layer order.

## Snapshot Summary

| Effective date | Component | ViewBox | Line groups | Line segments | Labels | Nodes | Station ids | Raw path geometry | Layer order |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2012-01 | `MapJan2012` | `0 0 3140 2400` | 7 | 136 | 123 | 123 | 123 | 97 | `lines`, `labels`, `nodes` |
| 2017-11 | `MapNov2017` | `0 0 3140 2400` | 8 | 182 | 158 | 158 | 158 | 125 | `lines`, `labels`, `nodes`, `u/c` |
| 2019-12 | `MapDec2019` | `0 0 3140 2400` | 9 | 184 | 160 | 160 | 160 | 124 | `lines`, `labels`, `nodes`, `u/c` |
| 2024-11 | `MapNov2024` | `0 0 3140 2400` | 9 | 212 | 182 | 182 | 182 | 128 | `u/c`, `lines`, `labels`, `nodes`, `u/c_2` |
| 2025-04 | `MapApr2025` | `0 0 3140 2400` | 9 | 214 | 184 | 184 | 184 | 128 | `u/c`, `lines`, `labels`, `nodes` |
| 2027-12 | `MapDec2027` | `0 0 3596 2400` | 10 | 226 | 195 | 195 | 195 | 133 | `line_jrl`, `lines`, `labels`, `nodes` |
| 2029-12 | `MapDec2029` | `0 0 3596 2400` | 10 | 241 | 209 | 209 | 209 | 135 | `lines`, `labels`, `nodes` |
| 2030-12 | `MapDec2030` | `0 0 3596 2400` | 11 | 252 | 217 | 217 | 218 | 144 | `lines`, `labels`, `nodes` |
| 2032-12 | `MapDec2032` | `0 0 3596 2400` | 11 | 261 | 222 | 222 | 223 | 153 | `lines`, `labels`, `nodes` |

## Initial Findings

- `2025-04` is the right first generator target: it is the current planned
  baseline and still uses the established `3140 x 2400` frame.
- Future versions from `2027-12` onward use a wider `3596 x 2400` frame, so the
  first layout engine should keep map-frame dimensions version-scoped.
- Current renderer interaction ids are stable enough to preserve as generated
  snapshot ids: `line_*` for line groups and segments, `label_*` for station
  labels, and `node_*` for station nodes.
- The generated snapshot schema should prefer structured geometry. Raw SVG path
  geometry remains a last-resort escape hatch for reviewed exceptions; the
  `2025-04` reference includes 128 path-backed geometry ids that should not be
  treated as the preferred baseline representation.
- `2030-12` and `2032-12` each infer one more station id from line segments than
  from labels/nodes. That discrepancy should be reviewed before those future
  snapshots become canonical.

## Operational Topology Check

For `2025-04-01`, canonical service revisions derive:

- 9 operational lines.
- 26 active service revisions.
- 181 stations from active service paths.
- 181 stations from active station codes.
- 207 undirected adjacent station segments.

Compared with the `2025-04` site map, the operational graph accounts for most
station-to-station ids without storing a hand-authored segment list. The `214`
line segments in the summary include one non-station-to-station geometry id,
`line_loop`; excluding that leaves 213 station-to-station ids. The map has 184
station ids and those 213 station-to-station ids, so generator coverage needs
two separate concepts:

- **Operational graph coverage**, derived from service revisions and station
  codes at the target timestamp.
- **Displayed schematic coverage**, which may include under-construction or
  future stations and their visual connector geometry.

The comparison found these review items:

- `BDS`, `SGB`, and `XLN` appear in the `2025-04` map but are not operational
  at that timestamp in canonical data. Omit non-operational displayed coverage
  from the initial generator pass unless renderer parity requires it.
- Segment ids should be generated from adjacent service path pairs. The
  published snapshot still needs stable ids and generated geometry, but the
  authoring inputs do not need to store every station-to-station segment.

## Phase 1 Rule Discovery Handoff

The first generator target is `2025-04`, with the `lta-system-map-2011` layout
engine id from the active plan. These rules are inferred from the committed
reference inventory and canonical service paths, not from a formal LTA design
specification.

### Renderer Contract Invariants

- Keep map-frame dimensions version-scoped. Versions through `2025-04` use
  `0 0 3140 2400`; versions from `2027-12` onward use `0 0 3596 2400`.
- Preserve current interaction ids in generated snapshots: `line_*` for line
  groups and station-to-station segments, `label_*` for station labels, and
  `node_*` for station nodes.
- Preserve layer ordering as explicit snapshot data. The `2025-04` baseline
  uses `u/c`, `lines`, `labels`, then `nodes`.
- Prefer structured generated geometry over raw SVG paths. The `2025-04`
  baseline has 128 path-backed geometry ids, but Phase 2 should model structured
  geometry first and keep raw paths only as explained last-resort exceptions.

### Line-Family Rules For The Initial Engine

- **Trunk corridors (`NSL`, `EWL`, `NEL`, `DTL`, `TEL`)** should be generated
  from active bidirectional service paths, with one rendered station-to-station
  segment per adjacent canonical station pair. Non-operational displayed
  extensions can be omitted from the initial pass if that keeps the baseline
  generator simpler.
- **Branches and spurs** should stay attached to their service-path junctions
  rather than becoming separate author-authored segment lists. The initial
  branch cases are the `EWL` Changi branch from `TNM` to `CGA` via `XPO`, the
  `CCL` extension services between `MRB` and `HBF`, and future/under-construction
  displayed extensions.
- **Orbital and loop lines (`CCL`, `BPLRT`, `PGLRT`, `SKLRT`)** need explicit
  loop handling because adjacent service pairs alone do not encode the visual
  treatment of the loop closure, branch spacing, or direction symmetry. The
  `2025-04` map includes one non-station-to-station geometry id, `line_loop`.
- **LRT systems** should be represented as compact local loop sublayouts
  anchored to their MRT interchange stations: `BPLRT` at `CCK`, `PGLRT` at
  `PGL`, and `SKLRT` at `SKG`. Their clockwise/counter-clockwise service paths
  should collapse to the same displayed undirected segment ids.
- **Interchanges** should be generated as composed station nodes, not a single
  generic marker, because consumers need line-specific node parts for focused
  line and disruption overlay behavior.
- **Labels** should be generated as station-scoped layout hints rather than
  localized text. Canonical station names remain outside schematic data.
- **Construction and future display state** should eventually be represented
  separately from operational topology, but it is not required for the initial
  `2025-04` generator pass if non-operational displayed coverage is omitted.

### Known Phase 1 Exceptions And Review Items

- `BDS`, `SGB`, and `XLN` appear in the current `2025-04` schematic comparison
  gap. They can be omitted from the first generator baseline. If a later parity
  pass needs them, model them as displayed non-operational schematic coverage
  rather than operational topology.
- The previous `yck:yis` comparison mismatch is resolved after rebasing onto the
  latest service-path data; no operational segment keys remain outside the
  `2025-04` map inventory.
- `2030-12` and `2032-12` infer one more station id from line segments than
  from labels/nodes. Defer those future snapshots until the initial `2025-04`
  schema and generator path can flag unmatched references.
- The initial coordinate classification should use:
  - `generated` for service-path-derived segment endpoints, station ordering,
    and default label sides;
  - `constraint` for map frame anchors, line corridor ordering, interchange
    spacing, branch separation, and LRT loop anchors;
  - `exception` for last-resort raw path geometry or fixed station/segment
    placement that carries a written reason;
  - `artifact` for coordinates emitted by generated snapshots.

### Phase 2 Handoff

The Phase 2 schema draft should start with enough structure to represent the
`2025-04` reference without copying TSX: version metadata, frame, layer order,
line groups, station nodes, labels, structured segment geometry, optional
last-resort raw path exceptions, and coordinate class metadata for constraints
and exceptions. Displayed non-operational coverage can wait until the first
baseline needs it.
