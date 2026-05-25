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
- The generated snapshot schema should treat raw SVG path geometry as an escape
  hatch. The `2025-04` reference includes 128 path-backed geometry ids.
- `2030-12` and `2032-12` each infer one more station id from line segments than
  from labels/nodes. That discrepancy should be reviewed before those future
  snapshots become canonical.

## Operational Topology Check

For `2025-04-01`, canonical service revisions derive:

- 9 operational lines.
- 26 active service revisions.
- 180 stations from active service paths.
- 182 stations from active station codes.
- 206 undirected adjacent station segments.

Compared with the `2025-04` site map, the operational graph accounts for most
station-to-station ids without storing a hand-authored segment list. The map has
184 station ids and 213 station-to-station ids, so generator coverage needs two
separate concepts:

- **Operational graph coverage**, derived from service revisions and station
  codes at the target timestamp.
- **Displayed schematic coverage**, which may include under-construction or
  future stations and their visual connector geometry.

The first comparison found these review items:

- `BDS` and `KTB` have active station codes on `2025-04-01` but are not present
  in active service paths, so service path data should be reviewed before using
  it as the sole source of station coverage.
- `SGB` and `XLN` appear in the `2025-04` map but are not operational at that
  timestamp in canonical data; they should be represented as displayed
  non-operational schematic coverage, not operational service graph coverage.
- Segment ids should be generated from adjacent service path pairs. The
  published snapshot still needs stable ids and generated geometry, but the
  authoring inputs do not need to store every station-to-station segment.
