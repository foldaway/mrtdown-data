import { describe, expect, it } from 'vitest';
import {
  SchematicMapConstraintSetSchema,
  SchematicMapEffectiveDateSchema,
  SchematicMapGeometrySchema,
  SchematicMapLabelSchema,
  SchematicMapManifestSchema,
  SchematicMapRuleSetSchema,
  SchematicMapSegmentSchema,
  SchematicMapStationNodeSchema,
  SchematicMapTopologyReferenceSchema,
  SchematicMapVersionSnapshotSchema,
} from './SchematicMap.js';

function minimalSnapshot() {
  return {
    schemaVersion: 1,
    mapId: 'system',
    effectiveDate: '2025-04',
    layoutEngineId: 'lta-system-map-2011',
    generatedAt: '2026-05-27T00:00:00.000Z',
    frame: { x: 0, y: 0, width: 3140, height: 2400 },
    layers: [{ id: 'lines', role: 'line' }],
    lineGroups: [
      {
        id: 'line_NSL',
        lineId: 'NSL',
        displayStatus: 'operational',
        layerId: 'lines',
        segmentIds: ['line_amk:bsh'],
      },
    ],
    segments: [
      {
        id: 'line_amk:bsh',
        lineId: 'NSL',
        displayStatus: 'operational',
        layerId: 'lines',
        topology: {
          type: 'station_pair',
          fromStationId: 'AMK',
          toStationId: 'BSH',
        },
        geometry: {
          type: 'polyline',
          points: [
            { x: 1170, y: 550 },
            { x: 1250, y: 630 },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'trunk-octilinear',
          },
        },
      },
    ],
    stationNodes: [
      {
        id: 'node_amk',
        stationId: 'AMK',
        displayStatus: 'operational',
        layerId: 'lines',
        center: { x: 1170, y: 550 },
        lineIds: ['NSL'],
        parts: [
          {
            id: 'node_amk_nsl',
            lineId: 'NSL',
            shape: {
              type: 'circle',
              center: { x: 1170, y: 550 },
              radius: 11,
            },
            coordinateMetadata: {
              coordinateClass: 'artifact',
              generatedFrom: 'node_amk',
            },
          },
        ],
        coordinateMetadata: {
          coordinateClass: 'constraint',
          constraintId: 'anchor_amk',
        },
      },
      {
        id: 'node_bsh',
        stationId: 'BSH',
        displayStatus: 'operational',
        layerId: 'lines',
        center: { x: 1250, y: 630 },
        lineIds: ['NSL'],
        parts: [
          {
            id: 'node_bsh_nsl',
            lineId: 'NSL',
            shape: {
              type: 'circle',
              center: { x: 1250, y: 630 },
              radius: 11,
            },
            coordinateMetadata: {
              coordinateClass: 'artifact',
              generatedFrom: 'node_bsh',
            },
          },
        ],
        coordinateMetadata: {
          coordinateClass: 'constraint',
          constraintId: 'anchor_bsh',
        },
      },
    ] as Array<Record<string, unknown>>,
    labels: [] as Array<Record<string, unknown>>,
    stationCodeLabels: [] as Array<Record<string, unknown>>,
  };
}

describe('SchematicMapVersionSnapshotSchema', () => {
  it('accepts a renderer-neutral system map slice without label text', () => {
    const parsed = SchematicMapVersionSnapshotSchema.parse({
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: {
        x: 0,
        y: 0,
        width: 3140,
        height: 2400,
        coordinateMetadata: {
          coordinateClass: 'constraint',
          constraintId: 'frame_2025_04',
        },
      },
      layers: [
        { id: 'u/c', role: 'construction' },
        { id: 'lines', role: 'line' },
        { id: 'labels', role: 'label' },
        { id: 'nodes', role: 'node' },
      ],
      lineGroups: [
        {
          id: 'line_NSL',
          lineId: 'NSL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_amk:bsh'],
        },
        {
          id: 'line_CCL',
          lineId: 'CCL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_bsh:lrc'],
        },
      ],
      segments: [
        {
          id: 'line_amk:bsh',
          lineId: 'NSL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'AMK',
            toStationId: 'BSH',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 1170, y: 550 },
              { x: 1250, y: 630 },
            ],
            coordinateMetadata: {
              coordinateClass: 'generated',
              ruleId: 'trunk-octilinear',
            },
          },
        },
        {
          id: 'line_bsh:lrc',
          lineId: 'CCL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'BSH',
            toStationId: 'LRC',
          },
          geometry: {
            type: 'cubic_bezier',
            start: { x: 1250, y: 630 },
            control1: { x: 1300, y: 690 },
            control2: { x: 1380, y: 720 },
            end: { x: 1450, y: 720 },
            coordinateMetadata: {
              coordinateClass: 'constraint',
              constraintId: 'ccl-bishan-curve',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_amk',
          stationId: 'AMK',
          displayStatus: 'operational',
          layerId: 'nodes',
          center: { x: 1170, y: 550 },
          lineIds: ['NSL'],
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'anchor_amk',
          },
          parts: [
            {
              id: 'node_amk_nsl',
              lineId: 'NSL',
              shape: {
                type: 'circle',
                center: { x: 1170, y: 550 },
                radius: 11,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_amk',
              },
            },
          ],
        },
        {
          id: 'node_bsh',
          stationId: 'BSH',
          displayStatus: 'operational',
          layerId: 'nodes',
          center: { x: 1250, y: 630 },
          lineIds: ['NSL', 'CCL'],
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'anchor_bsh',
          },
          parts: [
            {
              id: 'node_bsh_nsl',
              lineId: 'NSL',
              shape: {
                type: 'circle',
                center: { x: 1242, y: 630 },
                radius: 11,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_bsh',
              },
            },
            {
              id: 'node_bsh_ccl',
              lineId: 'CCL',
              shape: {
                type: 'circle',
                center: { x: 1258, y: 630 },
                radius: 11,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_bsh',
              },
            },
          ],
        },
        {
          id: 'node_lrc',
          stationId: 'LRC',
          displayStatus: 'operational',
          layerId: 'nodes',
          center: { x: 1450, y: 720 },
          lineIds: ['CCL'],
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'anchor_lrc',
          },
          parts: [
            {
              id: 'node_lrc_ccl',
              lineId: 'CCL',
              shape: {
                type: 'circle',
                center: { x: 1450, y: 720 },
                radius: 11,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_lrc',
              },
            },
          ],
        },
      ],
      labels: [
        {
          id: 'label_bsh',
          stationId: 'BSH',
          displayStatus: 'operational',
          layerId: 'labels',
          anchor: { x: 1275, y: 600 },
          side: 'top_right',
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'default-interchange-label',
          },
        },
      ],
      stationCodeLabels: [
        {
          id: 'NS 17',
          stationId: 'BSH',
          lineId: 'NSL',
          displayStatus: 'operational',
          layerId: 'labels',
          anchor: { x: 1235, y: 610 },
          side: 'left',
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'default-station-code-label',
          },
        },
      ],
    });

    expect(parsed.labels[0]).not.toHaveProperty('text');
  });

  it('allows displayed non-operational coverage only with an explicit reason', () => {
    const topology = {
      type: 'display_only',
      stationIds: ['BDS'],
      reason: 'Shown on the 2025-04 schematic before operational service.',
    };

    const result = SchematicMapTopologyReferenceSchema.parse(topology);

    expect(result).toEqual(topology);
    expect(() =>
      SchematicMapTopologyReferenceSchema.parse({
        type: 'display_only',
        stationIds: ['BDS'],
      }),
    ).toThrow(/reason/i);
  });

  it('allows operational support geometry that is not a station pair', () => {
    expect(
      SchematicMapSegmentSchema.parse({
        id: 'line_loop',
        lineId: 'CCL',
        displayStatus: 'operational',
        layerId: 'lines',
        topology: {
          type: 'support',
          supportType: 'loop',
          reason:
            'Represents operational loop geometry that is not a station-to-station segment.',
        },
        geometry: {
          type: 'polyline',
          points: [
            { x: 100, y: 100 },
            { x: 120, y: 120 },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'loop-support',
          },
        },
      }),
    ).toMatchObject({
      topology: {
        type: 'support',
        supportType: 'loop',
      },
    });
  });

  it('rejects operational segments with display-only topology', () => {
    expect(() =>
      SchematicMapSegmentSchema.parse({
        id: 'line_bds:spr',
        lineId: 'TEL',
        displayStatus: 'operational',
        layerId: 'lines',
        topology: {
          type: 'display_only',
          stationIds: ['BDS', 'SPR'],
          reason: 'Shown before operational service for renderer parity.',
        },
        geometry: {
          type: 'polyline',
          points: [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
          ],
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'display-only-segment',
          },
        },
      }),
    ).toThrow(/cannot be marked operational/);
  });

  it('does not support raw SVG path geometry in the narrow schema', () => {
    expect(() =>
      SchematicMapGeometrySchema.parse({
        type: 'raw_svg_path',
        d: 'M 0 0 L 10 10',
        coordinateMetadata: {
          coordinateClass: 'exception',
          reason: 'Legacy path copied from reference map.',
        },
      }),
    ).toThrow();
  });

  it('requires display-only station nodes and labels to explain why they are shown', () => {
    const node = {
      id: 'node_bds',
      stationId: 'BDS',
      displayStatus: 'display_only',
      layerId: 'nodes',
      center: { x: 100, y: 100 },
      lineIds: ['TEL'],
      parts: [
        {
          id: 'node_bds_tel',
          lineId: 'TEL',
          shape: {
            type: 'circle',
            center: { x: 100, y: 100 },
            radius: 11,
          },
          coordinateMetadata: {
            coordinateClass: 'artifact',
            generatedFrom: 'node_bds',
          },
        },
      ],
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'anchor_bds',
      },
    };
    const label = {
      id: 'label_bds',
      stationId: 'BDS',
      displayStatus: 'display_only',
      layerId: 'labels',
      anchor: { x: 120, y: 90 },
      side: 'top_right',
      coordinateMetadata: {
        coordinateClass: 'generated',
        ruleId: 'default-label',
      },
    };

    expect(() => SchematicMapStationNodeSchema.parse(node)).toThrow(
      /displayReason/,
    );
    expect(() => SchematicMapLabelSchema.parse(label)).toThrow(/displayReason/);
    expect(
      SchematicMapStationNodeSchema.parse({
        ...node,
        displayReason: 'Shown before operational service for renderer parity.',
      }),
    ).toMatchObject({ displayReason: expect.any(String) });
    expect(
      SchematicMapLabelSchema.parse({
        ...label,
        displayReason: 'Shown before operational service for renderer parity.',
      }),
    ).toMatchObject({ displayReason: expect.any(String) });
  });

  it('rejects station node parts that are not listed on the parent node', () => {
    const node = {
      id: 'node_bsh',
      stationId: 'BSH',
      displayStatus: 'operational',
      layerId: 'nodes',
      center: { x: 100, y: 100 },
      lineIds: ['NSL', 'CCL'],
      parts: [
        {
          id: 'node_bsh_ewl',
          lineId: 'EWL',
          shape: {
            type: 'circle',
            center: { x: 100, y: 100 },
            radius: 11,
          },
          coordinateMetadata: {
            coordinateClass: 'artifact',
            generatedFrom: 'node_bsh',
          },
        },
      ],
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'anchor_bsh',
      },
    };

    expect(() => SchematicMapStationNodeSchema.parse(node)).toThrow(
      /not listed on the parent node/,
    );
  });

  it('rejects station nodes that omit parts for listed parent lines', () => {
    const node = {
      id: 'node_bsh',
      stationId: 'BSH',
      displayStatus: 'operational',
      layerId: 'nodes',
      center: { x: 100, y: 100 },
      lineIds: ['NSL', 'CCL'],
      parts: [
        {
          id: 'node_bsh_nsl',
          lineId: 'NSL',
          shape: {
            type: 'circle',
            center: { x: 100, y: 100 },
            radius: 11,
          },
          coordinateMetadata: {
            coordinateClass: 'artifact',
            generatedFrom: 'node_bsh',
          },
        },
      ],
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'anchor_bsh',
      },
    };

    expect(() => SchematicMapStationNodeSchema.parse(node)).toThrow(
      /has no matching node part/,
    );
  });

  it('requires display-only segments to explain why they are shown', () => {
    const segment = {
      id: 'line_bds:spr',
      lineId: 'TEL',
      displayStatus: 'display_only',
      layerId: 'lines',
      topology: {
        type: 'station_pair',
        fromStationId: 'BDS',
        toStationId: 'SPR',
      },
      geometry: {
        type: 'polyline',
        points: [
          { x: 100, y: 100 },
          { x: 140, y: 100 },
        ],
        coordinateMetadata: {
          coordinateClass: 'constraint',
          constraintId: 'display-only-segment',
        },
      },
    };

    expect(() => SchematicMapSegmentSchema.parse(segment)).toThrow(
      /displayReason/,
    );
    expect(
      SchematicMapSegmentSchema.parse({
        ...segment,
        displayReason: 'Shown before operational service for renderer parity.',
      }),
    ).toMatchObject({ displayReason: expect.any(String) });
  });

  it('rejects snapshots with unknown internal layer or segment references', () => {
    const missingLayer = minimalSnapshot();
    missingLayer.segments[0].layerId = 'line';

    const missingSegment = minimalSnapshot();
    missingSegment.lineGroups[0].segmentIds = ['line_missing'];

    expect(() => SchematicMapVersionSnapshotSchema.parse(missingLayer)).toThrow(
      /Unknown layer id/,
    );
    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(missingSegment),
    ).toThrow(/Unknown segment id/);
  });

  it('rejects snapshots with duplicate stable ids', () => {
    const duplicateLayer = minimalSnapshot();
    duplicateLayer.layers.push({ id: 'lines', role: 'line' });

    const duplicateSegment = minimalSnapshot();
    duplicateSegment.segments.push({ ...duplicateSegment.segments[0] });

    const duplicateLineGroup = minimalSnapshot();
    duplicateLineGroup.lineGroups.push({ ...duplicateLineGroup.lineGroups[0] });

    const duplicateStationCodeLabel = minimalSnapshot();
    duplicateStationCodeLabel.stationNodes.push({
      id: 'node_bsh',
      stationId: 'BSH',
      displayStatus: 'operational',
      layerId: 'lines',
      center: { x: 100, y: 100 },
      lineIds: ['NSL'],
      parts: [
        {
          id: 'node_bsh_nsl',
          lineId: 'NSL',
          shape: {
            type: 'circle',
            center: { x: 100, y: 100 },
            radius: 11,
          },
          coordinateMetadata: {
            coordinateClass: 'artifact',
            generatedFrom: 'node_bsh',
          },
        },
      ],
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'anchor_bsh',
      },
    });
    duplicateStationCodeLabel.stationCodeLabels.push(
      {
        id: 'NS 17',
        stationId: 'BSH',
        lineId: 'NSL',
        displayStatus: 'operational',
        layerId: 'lines',
        anchor: { x: 100, y: 100 },
        side: 'left',
        coordinateMetadata: {
          coordinateClass: 'generated',
          ruleId: 'station-code-label',
        },
      },
      {
        id: 'NS 17',
        stationId: 'BSH',
        lineId: 'NSL',
        displayStatus: 'operational',
        layerId: 'lines',
        anchor: { x: 120, y: 100 },
        side: 'right',
        coordinateMetadata: {
          coordinateClass: 'generated',
          ruleId: 'station-code-label',
        },
      },
    );

    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(duplicateLayer),
    ).toThrow(/Duplicate layers id/);
    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(duplicateSegment),
    ).toThrow(/Duplicate segments id/);
    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(duplicateLineGroup),
    ).toThrow(/Duplicate lineGroups id/);
    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(duplicateStationCodeLabel),
    ).toThrow(/Duplicate stationCodeLabels id/);
  });

  it('rejects duplicate station node station ids', () => {
    const snapshot = minimalSnapshot();
    snapshot.stationNodes.push({
      id: 'node_bsh_copy',
      stationId: 'BSH',
      displayStatus: 'operational',
      layerId: 'lines',
      center: { x: 1260, y: 630 },
      lineIds: ['NSL'],
      parts: [
        {
          id: 'node_bsh_copy_nsl',
          lineId: 'NSL',
          shape: {
            type: 'circle',
            center: { x: 1260, y: 630 },
            radius: 11,
          },
          coordinateMetadata: {
            coordinateClass: 'artifact',
            generatedFrom: 'node_bsh_copy',
          },
        },
      ],
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'anchor_bsh_copy',
      },
    });

    expect(() => SchematicMapVersionSnapshotSchema.parse(snapshot)).toThrow(
      /Duplicate station node stationId/,
    );
  });

  it('rejects line groups that reference segments from another line', () => {
    const snapshot = minimalSnapshot();
    snapshot.segments[0].lineId = 'EWL';

    expect(() => SchematicMapVersionSnapshotSchema.parse(snapshot)).toThrow(
      /belongs to EWL, not NSL/,
    );
  });

  it('rejects line groups that reference segments with another display status', () => {
    const snapshot = minimalSnapshot();
    snapshot.segments[0].displayStatus = 'planned';

    expect(() => SchematicMapVersionSnapshotSchema.parse(snapshot)).toThrow(
      /has displayStatus planned, not operational/,
    );
  });

  it('rejects segments that are omitted from line groups', () => {
    const snapshot = minimalSnapshot();
    snapshot.segments.push({
      ...snapshot.segments[0],
      id: 'line_bsh:nov',
      topology: {
        type: 'station_pair',
        fromStationId: 'BSH',
        toStationId: 'NOV',
      },
    });

    expect(() => SchematicMapVersionSnapshotSchema.parse(snapshot)).toThrow(
      /is not included in a line group/,
    );
  });

  it('rejects station-pair segment endpoints without station nodes', () => {
    const snapshot = minimalSnapshot();
    snapshot.segments[0].topology = {
      type: 'station_pair',
      fromStationId: 'AMK',
      toStationId: 'BSHH',
    };

    expect(() => SchematicMapVersionSnapshotSchema.parse(snapshot)).toThrow(
      /references station BSHH without a station node/,
    );
  });

  it('rejects segment ids repeated in line group membership', () => {
    const repeatedWithinGroup = minimalSnapshot();
    repeatedWithinGroup.lineGroups[0].segmentIds = [
      'line_amk:bsh',
      'line_amk:bsh',
    ];

    const repeatedAcrossGroups = minimalSnapshot();
    repeatedAcrossGroups.lineGroups.push({
      ...repeatedAcrossGroups.lineGroups[0],
      id: 'line_NSL_copy',
    });

    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(repeatedWithinGroup),
    ).toThrow(/listed in multiple line group positions/);
    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(repeatedAcrossGroups),
    ).toThrow(/listed in multiple line group positions/);
  });

  it('rejects duplicate station node part ids', () => {
    const node = {
      id: 'node_bsh',
      stationId: 'BSH',
      displayStatus: 'operational',
      layerId: 'nodes',
      center: { x: 100, y: 100 },
      lineIds: ['NSL'],
      parts: [
        {
          id: 'node_bsh_nsl',
          lineId: 'NSL',
          shape: {
            type: 'circle',
            center: { x: 100, y: 100 },
            radius: 11,
          },
          coordinateMetadata: {
            coordinateClass: 'artifact',
            generatedFrom: 'node_bsh',
          },
        },
        {
          id: 'node_bsh_nsl',
          lineId: 'NSL',
          shape: {
            type: 'circle',
            center: { x: 110, y: 100 },
            radius: 11,
          },
          coordinateMetadata: {
            coordinateClass: 'artifact',
            generatedFrom: 'node_bsh',
          },
        },
      ],
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'anchor_bsh',
      },
    };

    expect(() => SchematicMapStationNodeSchema.parse(node)).toThrow(
      /Duplicate station node part id/,
    );
  });

  it('rejects labels and station-code labels without station nodes', () => {
    const orphanLabel = minimalSnapshot();
    orphanLabel.labels.push({
      id: 'label_bshh',
      stationId: 'BSHH',
      displayStatus: 'operational',
      layerId: 'lines',
      anchor: { x: 100, y: 100 },
      side: 'right',
      coordinateMetadata: {
        coordinateClass: 'generated',
        ruleId: 'default-label',
      },
    });

    const orphanStationCode = minimalSnapshot();
    orphanStationCode.stationCodeLabels.push({
      id: 'NS 17',
      stationId: 'BSHH',
      lineId: 'NSL',
      displayStatus: 'operational',
      layerId: 'lines',
      anchor: { x: 100, y: 100 },
      side: 'left',
      coordinateMetadata: {
        coordinateClass: 'generated',
        ruleId: 'station-code-label',
      },
    });

    expect(() => SchematicMapVersionSnapshotSchema.parse(orphanLabel)).toThrow(
      /without a station node/,
    );
    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(orphanStationCode),
    ).toThrow(/without a station node/);
  });

  it('rejects labels with statuses that differ from their station node', () => {
    const stationNameLabel = minimalSnapshot();
    stationNameLabel.labels.push({
      id: 'label_bsh',
      stationId: 'BSH',
      displayStatus: 'planned',
      layerId: 'lines',
      anchor: { x: 100, y: 100 },
      side: 'right',
      coordinateMetadata: {
        coordinateClass: 'generated',
        ruleId: 'default-label',
      },
    });

    const stationCodeLabel = minimalSnapshot();
    stationCodeLabel.stationCodeLabels.push({
      id: 'NS 17',
      stationId: 'BSH',
      lineId: 'NSL',
      displayStatus: 'planned',
      layerId: 'lines',
      anchor: { x: 100, y: 100 },
      side: 'left',
      coordinateMetadata: {
        coordinateClass: 'generated',
        ruleId: 'station-code-label',
      },
    });

    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(stationNameLabel),
    ).toThrow(/has displayStatus planned, not operational/);
    expect(() =>
      SchematicMapVersionSnapshotSchema.parse(stationCodeLabel),
    ).toThrow(/has displayStatus planned, not operational/);
  });

  it('rejects station-code labels for lines absent from their station node', () => {
    const snapshot = minimalSnapshot();
    snapshot.stationCodeLabels.push({
      id: 'CC 15',
      stationId: 'BSH',
      lineId: 'CCL',
      displayStatus: 'operational',
      layerId: 'lines',
      anchor: { x: 100, y: 100 },
      side: 'left',
      coordinateMetadata: {
        coordinateClass: 'generated',
        ruleId: 'station-code-label',
      },
    });

    expect(() => SchematicMapVersionSnapshotSchema.parse(snapshot)).toThrow(
      /line CCL, which is not listed on station BSH/,
    );
  });
});

describe('SchematicMapEffectiveDateSchema', () => {
  it('rejects impossible month values', () => {
    expect(SchematicMapEffectiveDateSchema.parse('2025-01')).toBe('2025-01');
    expect(SchematicMapEffectiveDateSchema.parse('2025-12')).toBe('2025-12');
    expect(() => SchematicMapEffectiveDateSchema.parse('2025-00')).toThrow();
    expect(() => SchematicMapEffectiveDateSchema.parse('2025-13')).toThrow();
    expect(() => SchematicMapEffectiveDateSchema.parse('2025-99')).toThrow();
  });
});

describe('SchematicMapManifestSchema', () => {
  it('rejects duplicate effective dates', () => {
    expect(() =>
      SchematicMapManifestSchema.parse({
        schemaVersion: 1,
        mapId: 'system',
        versions: [
          {
            effectiveDate: '2025-04',
            path: 'version/2025-04.json',
            layoutEngineId: 'lta-system-map-2011',
          },
          {
            effectiveDate: '2025-04',
            path: 'version/2025-04-copy.json',
            layoutEngineId: 'lta-system-map-2011',
          },
        ],
      }),
    ).toThrow(/Duplicate schematic map effective date/);
  });
});

describe('schematic map generator input schemas', () => {
  it('accepts minimal rules and first-pass constraints', () => {
    expect(
      SchematicMapRuleSetSchema.parse({
        schemaVersion: 1,
        mapId: 'system',
        layoutEngineId: 'lta-system-map-2011',
        lineOrder: ['NSL', 'EWL', 'NEL', 'CCL', 'DTL', 'TEL'],
      }),
    ).toMatchObject({
      layoutEngineId: 'lta-system-map-2011',
    });

    expect(
      SchematicMapConstraintSetSchema.parse({
        schemaVersion: 1,
        mapId: 'system',
        effectiveDate: '2025-04',
        layoutEngineId: 'lta-system-map-2011',
        constraints: [
          {
            id: 'frame_2025_04',
            type: 'map_frame',
            frame: { x: 0, y: 0, width: 3140, height: 2400 },
          },
          {
            id: 'anchor_bsh',
            type: 'station_anchor',
            stationId: 'BSH',
            point: { x: 1250, y: 630 },
            reason: 'Keeps NSL and CCL interchange composition stable.',
          },
          {
            id: 'label_bsh',
            type: 'label_hint',
            stationId: 'BSH',
            side: 'top_right',
          },
        ],
      }),
    ).toMatchObject({
      effectiveDate: '2025-04',
      constraints: expect.arrayContaining([
        expect.objectContaining({ type: 'station_anchor' }),
      ]),
    });
  });

  it('rejects duplicate constraint ids', () => {
    expect(() =>
      SchematicMapConstraintSetSchema.parse({
        schemaVersion: 1,
        mapId: 'system',
        effectiveDate: '2025-04',
        layoutEngineId: 'lta-system-map-2011',
        constraints: [
          {
            id: 'anchor_bsh',
            type: 'station_anchor',
            stationId: 'BSH',
            point: { x: 1250, y: 630 },
          },
          {
            id: 'anchor_bsh',
            type: 'label_hint',
            stationId: 'BSH',
            side: 'top_right',
          },
        ],
      }),
    ).toThrow(/Duplicate schematic map constraint id/);
  });
});
