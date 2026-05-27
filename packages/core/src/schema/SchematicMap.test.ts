import { describe, expect, it } from 'vitest';
import {
  SchematicMapConstraintSetSchema,
  SchematicMapEffectiveDateSchema,
  SchematicMapGeometrySchema,
  SchematicMapRuleSetSchema,
  SchematicMapTopologyReferenceSchema,
  SchematicMapVersionSnapshotSchema,
} from './SchematicMap.js';

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
