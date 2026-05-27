import z from 'zod';

/**
 * Version of the schematic map data contract, not the generated map version.
 */
export const SchematicMapSchemaVersionSchema = z.literal(1);
export type SchematicMapSchemaVersion = z.infer<
  typeof SchematicMapSchemaVersionSchema
>;

/**
 * Month-level effective date for a published schematic system map snapshot.
 */
export const SchematicMapEffectiveDateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export type SchematicMapEffectiveDate = z.infer<
  typeof SchematicMapEffectiveDateSchema
>;

/**
 * Stable identifier for the layout engine that produced a snapshot.
 */
export const SchematicMapLayoutEngineIdSchema = z.literal(
  'lta-system-map-2011',
);
export type SchematicMapLayoutEngineId = z.infer<
  typeof SchematicMapLayoutEngineIdSchema
>;

/**
 * Whether a schematic item represents active service or displayed future
 * coverage. Display-only coverage must remain explicit so it is not mistaken
 * for canonical operational topology.
 */
export const SchematicMapDisplayStatusSchema = z.enum([
  'operational',
  'under_construction',
  'planned',
  'display_only',
]);
export type SchematicMapDisplayStatus = z.infer<
  typeof SchematicMapDisplayStatusSchema
>;

type DisplayOnlyReasonValue = {
  displayStatus: SchematicMapDisplayStatus;
  displayReason?: string;
};

type DisplayOnlyReasonContext = {
  addIssue: (issue: {
    code: 'custom';
    message: string;
    path: string[];
  }) => void;
};

function requireDisplayReasonForDisplayOnly(
  value: DisplayOnlyReasonValue,
  context: DisplayOnlyReasonContext,
): void {
  if (value.displayStatus !== 'display_only' || value.displayReason) {
    return;
  }

  context.addIssue({
    code: 'custom',
    message: 'displayReason is required when displayStatus is display_only',
    path: ['displayReason'],
  });
}

/**
 * Explains where coordinates came from. Generated snapshots may contain
 * artifact coordinates, but source inputs should prefer reusable rules and
 * constraints over one-off exceptions.
 */
export const SchematicMapCoordinateMetadataSchema = z.discriminatedUnion(
  'coordinateClass',
  [
    z.object({
      coordinateClass: z.literal('generated'),
      ruleId: z.string().optional(),
    }),
    z.object({
      coordinateClass: z.literal('constraint'),
      constraintId: z.string(),
    }),
    z.object({
      coordinateClass: z.literal('exception'),
      reason: z.string().min(1),
    }),
    z.object({
      coordinateClass: z.literal('artifact'),
      generatedFrom: z.string().optional(),
    }),
  ],
);
export type SchematicMapCoordinateMetadata = z.infer<
  typeof SchematicMapCoordinateMetadataSchema
>;

/**
 * A point in the schematic coordinate system for the map frame.
 */
export const SchematicMapPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type SchematicMapPoint = z.infer<typeof SchematicMapPointSchema>;

/**
 * Dimensions of one generated map snapshot. Frame size is version-scoped
 * because future maps can use wider layouts than current maps.
 */
export const SchematicMapFrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  coordinateMetadata: SchematicMapCoordinateMetadataSchema.optional(),
});
export type SchematicMapFrame = z.infer<typeof SchematicMapFrameSchema>;

/**
 * Structured segment or leader-line geometry made from ordered points.
 */
export const SchematicMapPolylineGeometrySchema = z.object({
  type: z.literal('polyline'),
  points: z.array(SchematicMapPointSchema).min(2),
  coordinateMetadata: SchematicMapCoordinateMetadataSchema,
});
export type SchematicMapPolylineGeometry = z.infer<
  typeof SchematicMapPolylineGeometrySchema
>;

/**
 * Structured curved geometry. Raw SVG path data is intentionally not part of
 * the narrow Phase 2 schema.
 */
export const SchematicMapCubicBezierGeometrySchema = z.object({
  type: z.literal('cubic_bezier'),
  start: SchematicMapPointSchema,
  control1: SchematicMapPointSchema,
  control2: SchematicMapPointSchema,
  end: SchematicMapPointSchema,
  coordinateMetadata: SchematicMapCoordinateMetadataSchema,
});
export type SchematicMapCubicBezierGeometry = z.infer<
  typeof SchematicMapCubicBezierGeometrySchema
>;

/**
 * Renderer-neutral geometry primitives supported by the initial data contract.
 */
export const SchematicMapGeometrySchema = z.discriminatedUnion('type', [
  SchematicMapPolylineGeometrySchema,
  SchematicMapCubicBezierGeometrySchema,
]);
export type SchematicMapGeometry = z.infer<typeof SchematicMapGeometrySchema>;

/**
 * Semantic role for a rendering layer. Consumers still choose how to render
 * each layer.
 */
export const SchematicMapLayerRoleSchema = z.enum([
  'construction',
  'line',
  'label',
  'node',
  'other',
]);
export type SchematicMapLayerRole = z.infer<typeof SchematicMapLayerRoleSchema>;

/**
 * Ordered layers in a published snapshot.
 */
export const SchematicMapLayerSchema = z.object({
  id: z.string(),
  role: SchematicMapLayerRoleSchema,
});
export type SchematicMapLayer = z.infer<typeof SchematicMapLayerSchema>;

/**
 * Link from schematic geometry back to canonical topology, operational
 * schematic support geometry, or an explicit display-only item with a written
 * reason.
 */
export const SchematicMapTopologyReferenceSchema = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('station_pair'),
      fromStationId: z.string(),
      toStationId: z.string(),
    }),
    z.object({
      type: z.literal('support'),
      supportType: z.enum(['loop', 'connector', 'other']),
      stationIds: z.array(z.string()).optional(),
      reason: z.string().min(1),
    }),
    z.object({
      type: z.literal('display_only'),
      stationIds: z.array(z.string()).optional(),
      reason: z.string().min(1),
    }),
  ],
);
export type SchematicMapTopologyReference = z.infer<
  typeof SchematicMapTopologyReferenceSchema
>;

/**
 * A line-level grouping used by consumers for styling, focus, and overlays.
 */
export const SchematicMapLineGroupSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  displayStatus: SchematicMapDisplayStatusSchema,
  layerId: z.string(),
  segmentIds: z.array(z.string()),
});
export type SchematicMapLineGroup = z.infer<typeof SchematicMapLineGroupSchema>;

/**
 * One rendered line segment in a generated snapshot.
 */
export const SchematicMapSegmentSchema = z
  .object({
    id: z.string(),
    lineId: z.string(),
    displayStatus: SchematicMapDisplayStatusSchema,
    displayReason: z.string().min(1).optional(),
    layerId: z.string(),
    topology: SchematicMapTopologyReferenceSchema,
    geometry: SchematicMapGeometrySchema,
  })
  .superRefine(requireDisplayReasonForDisplayOnly)
  .superRefine((segment, context) => {
    if (
      segment.displayStatus === 'operational' &&
      segment.topology.type === 'display_only'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'display_only topology cannot be marked operational',
        path: ['topology'],
      });
    }
  });
export type SchematicMapSegment = z.infer<typeof SchematicMapSegmentSchema>;

/**
 * Basic shapes that compose a station node. Interchanges can expose multiple
 * line-specific parts for focused-line and disruption overlays.
 */
export const SchematicMapNodePartShapeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('circle'),
    center: SchematicMapPointSchema,
    radius: z.number().positive(),
  }),
  z.object({
    type: z.literal('pill'),
    center: SchematicMapPointSchema,
    width: z.number().positive(),
    height: z.number().positive(),
    radius: z.number().nonnegative(),
  }),
]);
export type SchematicMapNodePartShape = z.infer<
  typeof SchematicMapNodePartShapeSchema
>;

/**
 * One line-specific piece of a composed station node.
 */
export const SchematicMapStationNodePartSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  shape: SchematicMapNodePartShapeSchema,
  coordinateMetadata: SchematicMapCoordinateMetadataSchema,
});
export type SchematicMapStationNodePart = z.infer<
  typeof SchematicMapStationNodePartSchema
>;

/**
 * Station marker geometry in a snapshot. Station names stay in canonical
 * station data rather than schematic map data.
 */
export const SchematicMapStationNodeSchema = z
  .object({
    id: z.string(),
    stationId: z.string(),
    displayStatus: SchematicMapDisplayStatusSchema,
    displayReason: z.string().min(1).optional(),
    layerId: z.string(),
    center: SchematicMapPointSchema,
    lineIds: z.array(z.string()).min(1),
    parts: z.array(SchematicMapStationNodePartSchema).min(1),
    coordinateMetadata: SchematicMapCoordinateMetadataSchema,
  })
  .superRefine(requireDisplayReasonForDisplayOnly)
  .superRefine((node, context) => {
    const lineIds = new Set(node.lineIds);
    const partLineIds = new Set(node.parts.map((part) => part.lineId));
    const partIds = new Set<string>();

    node.parts.forEach((part, index) => {
      if (partIds.has(part.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate station node part id: ${part.id}`,
          path: ['parts', index, 'id'],
        });
      }

      partIds.add(part.id);

      if (!lineIds.has(part.lineId)) {
        context.addIssue({
          code: 'custom',
          message: `Node part ${part.id} belongs to ${part.lineId}, which is not listed on the parent node`,
          path: ['parts', index, 'lineId'],
        });
      }
    });

    node.lineIds.forEach((lineId, index) => {
      if (!partLineIds.has(lineId)) {
        context.addIssue({
          code: 'custom',
          message: `Node line ${lineId} has no matching node part`,
          path: ['lineIds', index],
        });
      }
    });
  });
export type SchematicMapStationNode = z.infer<
  typeof SchematicMapStationNodeSchema
>;

/**
 * Relative side for label placement around a station anchor.
 */
export const SchematicMapLabelSideSchema = z.enum([
  'top',
  'right',
  'bottom',
  'left',
  'top_right',
  'bottom_right',
  'bottom_left',
  'top_left',
  'center',
]);
export type SchematicMapLabelSide = z.infer<typeof SchematicMapLabelSideSchema>;

/**
 * Label placement data. It stores layout hints only, not localized text.
 */
export const SchematicMapLabelSchema = z
  .object({
    id: z.string(),
    stationId: z.string(),
    displayStatus: SchematicMapDisplayStatusSchema,
    displayReason: z.string().min(1).optional(),
    layerId: z.string(),
    anchor: SchematicMapPointSchema,
    side: SchematicMapLabelSideSchema,
    rotationDegrees: z.number().optional(),
    leaderLine: SchematicMapPolylineGeometrySchema.optional(),
    coordinateMetadata: SchematicMapCoordinateMetadataSchema,
  })
  .superRefine(requireDisplayReasonForDisplayOnly);
export type SchematicMapLabel = z.infer<typeof SchematicMapLabelSchema>;

/**
 * Station-code badge placement data. It stores code layout records only; code
 * text still comes from canonical station data.
 */
export const SchematicMapStationCodeLabelSchema = z
  .object({
    id: z.string(),
    stationId: z.string(),
    lineId: z.string(),
    displayStatus: SchematicMapDisplayStatusSchema,
    displayReason: z.string().min(1).optional(),
    layerId: z.string(),
    anchor: SchematicMapPointSchema,
    side: SchematicMapLabelSideSchema,
    rotationDegrees: z.number().optional(),
    coordinateMetadata: SchematicMapCoordinateMetadataSchema,
  })
  .superRefine(requireDisplayReasonForDisplayOnly);
export type SchematicMapStationCodeLabel = z.infer<
  typeof SchematicMapStationCodeLabelSchema
>;

/**
 * Complete published schematic map snapshot for one effective date.
 */
export const SchematicMapVersionSnapshotSchema = z
  .object({
    schemaVersion: SchematicMapSchemaVersionSchema,
    mapId: z.literal('system'),
    effectiveDate: SchematicMapEffectiveDateSchema,
    layoutEngineId: SchematicMapLayoutEngineIdSchema,
    generatedAt: z.iso.datetime(),
    frame: SchematicMapFrameSchema,
    layers: z.array(SchematicMapLayerSchema).min(1),
    lineGroups: z.array(SchematicMapLineGroupSchema),
    segments: z.array(SchematicMapSegmentSchema),
    stationNodes: z.array(SchematicMapStationNodeSchema),
    labels: z.array(SchematicMapLabelSchema),
    stationCodeLabels: z.array(SchematicMapStationCodeLabelSchema),
  })
  .superRefine((snapshot, context) => {
    const addDuplicateIdIssues = (
      collectionName:
        | 'layers'
        | 'lineGroups'
        | 'segments'
        | 'stationNodes'
        | 'labels'
        | 'stationCodeLabels',
      entries: Array<{ id: string }>,
    ) => {
      const seenIds = new Set<string>();

      entries.forEach((entry, index) => {
        if (seenIds.has(entry.id)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate ${collectionName} id: ${entry.id}`,
            path: [collectionName, index, 'id'],
          });
          return;
        }

        seenIds.add(entry.id);
      });
    };

    addDuplicateIdIssues('layers', snapshot.layers);
    addDuplicateIdIssues('lineGroups', snapshot.lineGroups);
    addDuplicateIdIssues('segments', snapshot.segments);
    addDuplicateIdIssues('stationNodes', snapshot.stationNodes);
    addDuplicateIdIssues('labels', snapshot.labels);
    addDuplicateIdIssues('stationCodeLabels', snapshot.stationCodeLabels);

    const layerIds = new Set(snapshot.layers.map((layer) => layer.id));
    const stationNodeIds = new Set(
      snapshot.stationNodes.map((node) => node.stationId),
    );
    const segmentsById = new Map<string, SchematicMapSegment>();
    const groupedSegmentIds = new Set<string>();
    const layerReferences: Array<{
      layerId: string;
      path: Array<string | number>;
    }> = [];

    for (const segment of snapshot.segments) {
      if (!segmentsById.has(segment.id)) {
        segmentsById.set(segment.id, segment);
      }
    }

    snapshot.lineGroups.forEach((lineGroup, index) => {
      layerReferences.push({
        layerId: lineGroup.layerId,
        path: ['lineGroups', index, 'layerId'],
      });

      lineGroup.segmentIds.forEach((segmentId, segmentIndex) => {
        if (groupedSegmentIds.has(segmentId)) {
          context.addIssue({
            code: 'custom',
            message: `Segment ${segmentId} is listed in multiple line group positions`,
            path: ['lineGroups', index, 'segmentIds', segmentIndex],
          });
        }

        groupedSegmentIds.add(segmentId);
        const segment = segmentsById.get(segmentId);

        if (!segment) {
          context.addIssue({
            code: 'custom',
            message: `Unknown segment id: ${segmentId}`,
            path: ['lineGroups', index, 'segmentIds', segmentIndex],
          });
          return;
        }

        if (segment.lineId !== lineGroup.lineId) {
          context.addIssue({
            code: 'custom',
            message: `Segment ${segmentId} belongs to ${segment.lineId}, not ${lineGroup.lineId}`,
            path: ['lineGroups', index, 'segmentIds', segmentIndex],
          });
        }

        if (segment.displayStatus !== lineGroup.displayStatus) {
          context.addIssue({
            code: 'custom',
            message: `Segment ${segmentId} has displayStatus ${segment.displayStatus}, not ${lineGroup.displayStatus}`,
            path: ['lineGroups', index, 'segmentIds', segmentIndex],
          });
        }
      });
    });

    snapshot.segments.forEach((segment, index) => {
      layerReferences.push({
        layerId: segment.layerId,
        path: ['segments', index, 'layerId'],
      });

      if (!groupedSegmentIds.has(segment.id)) {
        context.addIssue({
          code: 'custom',
          message: `Segment ${segment.id} is not included in a line group`,
          path: ['segments', index, 'id'],
        });
      }
    });

    snapshot.stationNodes.forEach((node, index) => {
      layerReferences.push({
        layerId: node.layerId,
        path: ['stationNodes', index, 'layerId'],
      });
    });

    snapshot.labels.forEach((label, index) => {
      layerReferences.push({
        layerId: label.layerId,
        path: ['labels', index, 'layerId'],
      });

      if (!stationNodeIds.has(label.stationId)) {
        context.addIssue({
          code: 'custom',
          message: `Label ${label.id} references station ${label.stationId} without a station node`,
          path: ['labels', index, 'stationId'],
        });
      }
    });

    snapshot.stationCodeLabels.forEach((label, index) => {
      layerReferences.push({
        layerId: label.layerId,
        path: ['stationCodeLabels', index, 'layerId'],
      });

      if (!stationNodeIds.has(label.stationId)) {
        context.addIssue({
          code: 'custom',
          message: `Station code label ${label.id} references station ${label.stationId} without a station node`,
          path: ['stationCodeLabels', index, 'stationId'],
        });
      }
    });

    for (const reference of layerReferences) {
      if (!layerIds.has(reference.layerId)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown layer id: ${reference.layerId}`,
          path: reference.path,
        });
      }
    }
  });
export type SchematicMapVersionSnapshot = z.infer<
  typeof SchematicMapVersionSnapshotSchema
>;

/**
 * Manifest entry pointing to one generated snapshot file.
 */
export const SchematicMapManifestVersionSchema = z.object({
  effectiveDate: SchematicMapEffectiveDateSchema,
  path: z.string(),
  layoutEngineId: SchematicMapLayoutEngineIdSchema,
});
export type SchematicMapManifestVersion = z.infer<
  typeof SchematicMapManifestVersionSchema
>;

/**
 * Published manifest that lets consumers select a snapshot by effective date.
 */
export const SchematicMapManifestSchema = z
  .object({
    schemaVersion: SchematicMapSchemaVersionSchema,
    mapId: z.literal('system'),
    versions: z.array(SchematicMapManifestVersionSchema),
  })
  .superRefine((manifest, context) => {
    const effectiveDates = new Set<string>();

    manifest.versions.forEach((version, index) => {
      if (effectiveDates.has(version.effectiveDate)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate schematic map effective date: ${version.effectiveDate}`,
          path: ['versions', index, 'effectiveDate'],
        });
        return;
      }

      effectiveDates.add(version.effectiveDate);
    });
  });
export type SchematicMapManifest = z.infer<typeof SchematicMapManifestSchema>;

/**
 * Shared metadata for reviewed generator constraints.
 */
const SchematicMapConstraintBaseSchema = z.object({
  id: z.string(),
  reason: z.string().min(1).optional(),
});

/**
 * Minimal first-pass generator constraints. Higher-level corridor and region
 * constraints can be added once the generator proves they remove real
 * duplication.
 */
export const SchematicMapConstraintSchema = z.discriminatedUnion('type', [
  SchematicMapConstraintBaseSchema.extend({
    type: z.literal('map_frame'),
    frame: SchematicMapFrameSchema,
  }),
  SchematicMapConstraintBaseSchema.extend({
    type: z.literal('station_anchor'),
    stationId: z.string(),
    point: SchematicMapPointSchema,
  }),
  SchematicMapConstraintBaseSchema.extend({
    type: z.literal('segment_route_hint'),
    lineId: z.string(),
    fromStationId: z.string(),
    toStationId: z.string(),
    via: z.array(SchematicMapPointSchema).min(1),
  }),
  SchematicMapConstraintBaseSchema.extend({
    type: z.literal('line_order'),
    lineIds: z.array(z.string()).min(1),
  }),
  SchematicMapConstraintBaseSchema.extend({
    type: z.literal('label_hint'),
    stationId: z.string(),
    side: SchematicMapLabelSideSchema,
    offset: SchematicMapPointSchema.optional(),
  }),
  SchematicMapConstraintBaseSchema.extend({
    type: z.literal('interchange_hint'),
    stationId: z.string(),
    lineIds: z.array(z.string()).min(2),
    spacing: z.number().positive().optional(),
  }),
]);
export type SchematicMapConstraint = z.infer<
  typeof SchematicMapConstraintSchema
>;

/**
 * Version-scoped constraints used by the generator for one effective date.
 */
export const SchematicMapConstraintSetSchema = z
  .object({
    schemaVersion: SchematicMapSchemaVersionSchema,
    mapId: z.literal('system'),
    effectiveDate: SchematicMapEffectiveDateSchema,
    layoutEngineId: SchematicMapLayoutEngineIdSchema,
    constraints: z.array(SchematicMapConstraintSchema),
  })
  .superRefine((constraintSet, context) => {
    const constraintIds = new Set<string>();

    constraintSet.constraints.forEach((constraint, index) => {
      if (constraintIds.has(constraint.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate schematic map constraint id: ${constraint.id}`,
          path: ['constraints', index, 'id'],
        });
        return;
      }

      constraintIds.add(constraint.id);
    });
  });
export type SchematicMapConstraintSet = z.infer<
  typeof SchematicMapConstraintSetSchema
>;

/**
 * Shared layout rules for the named layout engine.
 */
export const SchematicMapRuleSetSchema = z.object({
  schemaVersion: SchematicMapSchemaVersionSchema,
  mapId: z.literal('system'),
  layoutEngineId: SchematicMapLayoutEngineIdSchema,
  lineOrder: z.array(z.string()),
});
export type SchematicMapRuleSet = z.infer<typeof SchematicMapRuleSetSchema>;
