import { describe, expect, it } from 'vitest';
import {
  SchematicMapConstraintSetSchema,
  SchematicMapEffectiveDateSchema,
  SchematicMapGeometrySchema,
  SchematicMapLabelSchema,
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
    stationNodes: [],
    labels: [],
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
});
