import z from 'zod';

export const SchematicMapSchemaVersionSchema = z.literal(1);
export type SchematicMapSchemaVersion = z.infer<
  typeof SchematicMapSchemaVersionSchema
>;

export const SchematicMapEffectiveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/);
export type SchematicMapEffectiveDate = z.infer<
  typeof SchematicMapEffectiveDateSchema
>;

export const SchematicMapLayoutEngineIdSchema = z.literal(
  'lta-system-map-2011',
);
export type SchematicMapLayoutEngineId = z.infer<
  typeof SchematicMapLayoutEngineIdSchema
>;

export const SchematicMapDisplayStatusSchema = z.enum([
  'operational',
  'under_construction',
  'planned',
  'display_only',
]);
export type SchematicMapDisplayStatus = z.infer<
  typeof SchematicMapDisplayStatusSchema
>;

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

export const SchematicMapPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type SchematicMapPoint = z.infer<typeof SchematicMapPointSchema>;

export const SchematicMapFrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  coordinateMetadata: SchematicMapCoordinateMetadataSchema.optional(),
});
export type SchematicMapFrame = z.infer<typeof SchematicMapFrameSchema>;

export const SchematicMapPolylineGeometrySchema = z.object({
  type: z.literal('polyline'),
  points: z.array(SchematicMapPointSchema).min(2),
  coordinateMetadata: SchematicMapCoordinateMetadataSchema,
});
export type SchematicMapPolylineGeometry = z.infer<
  typeof SchematicMapPolylineGeometrySchema
>;

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

export const SchematicMapGeometrySchema = z.discriminatedUnion('type', [
  SchematicMapPolylineGeometrySchema,
  SchematicMapCubicBezierGeometrySchema,
]);
export type SchematicMapGeometry = z.infer<typeof SchematicMapGeometrySchema>;

export const SchematicMapLayerRoleSchema = z.enum([
  'construction',
  'line',
  'label',
  'node',
  'other',
]);
export type SchematicMapLayerRole = z.infer<typeof SchematicMapLayerRoleSchema>;

export const SchematicMapLayerSchema = z.object({
  id: z.string(),
  role: SchematicMapLayerRoleSchema,
});
export type SchematicMapLayer = z.infer<typeof SchematicMapLayerSchema>;

export const SchematicMapTopologyReferenceSchema = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('station_pair'),
      fromStationId: z.string(),
      toStationId: z.string(),
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

export const SchematicMapLineGroupSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  displayStatus: SchematicMapDisplayStatusSchema,
  layerId: z.string(),
  segmentIds: z.array(z.string()),
});
export type SchematicMapLineGroup = z.infer<typeof SchematicMapLineGroupSchema>;

export const SchematicMapSegmentSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  displayStatus: SchematicMapDisplayStatusSchema,
  layerId: z.string(),
  topology: SchematicMapTopologyReferenceSchema,
  geometry: SchematicMapGeometrySchema,
});
export type SchematicMapSegment = z.infer<typeof SchematicMapSegmentSchema>;

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

export const SchematicMapStationNodePartSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  shape: SchematicMapNodePartShapeSchema,
  coordinateMetadata: SchematicMapCoordinateMetadataSchema,
});
export type SchematicMapStationNodePart = z.infer<
  typeof SchematicMapStationNodePartSchema
>;

export const SchematicMapStationNodeSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  displayStatus: SchematicMapDisplayStatusSchema,
  layerId: z.string(),
  center: SchematicMapPointSchema,
  lineIds: z.array(z.string()).min(1),
  parts: z.array(SchematicMapStationNodePartSchema).min(1),
  coordinateMetadata: SchematicMapCoordinateMetadataSchema,
});
export type SchematicMapStationNode = z.infer<
  typeof SchematicMapStationNodeSchema
>;

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

export const SchematicMapLabelSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  displayStatus: SchematicMapDisplayStatusSchema,
  layerId: z.string(),
  anchor: SchematicMapPointSchema,
  side: SchematicMapLabelSideSchema,
  rotationDegrees: z.number().optional(),
  leaderLine: SchematicMapPolylineGeometrySchema.optional(),
  coordinateMetadata: SchematicMapCoordinateMetadataSchema,
});
export type SchematicMapLabel = z.infer<typeof SchematicMapLabelSchema>;

export const SchematicMapVersionSnapshotSchema = z.object({
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
});
export type SchematicMapVersionSnapshot = z.infer<
  typeof SchematicMapVersionSnapshotSchema
>;

export const SchematicMapManifestVersionSchema = z.object({
  effectiveDate: SchematicMapEffectiveDateSchema,
  path: z.string(),
  layoutEngineId: SchematicMapLayoutEngineIdSchema,
});
export type SchematicMapManifestVersion = z.infer<
  typeof SchematicMapManifestVersionSchema
>;

export const SchematicMapManifestSchema = z.object({
  schemaVersion: SchematicMapSchemaVersionSchema,
  mapId: z.literal('system'),
  versions: z.array(SchematicMapManifestVersionSchema),
});
export type SchematicMapManifest = z.infer<typeof SchematicMapManifestSchema>;

const SchematicMapConstraintBaseSchema = z.object({
  id: z.string(),
  reason: z.string().min(1).optional(),
});

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

export const SchematicMapConstraintSetSchema = z.object({
  schemaVersion: SchematicMapSchemaVersionSchema,
  mapId: z.literal('system'),
  effectiveDate: SchematicMapEffectiveDateSchema,
  layoutEngineId: SchematicMapLayoutEngineIdSchema,
  constraints: z.array(SchematicMapConstraintSchema),
});
export type SchematicMapConstraintSet = z.infer<
  typeof SchematicMapConstraintSetSchema
>;

export const SchematicMapRuleSetSchema = z.object({
  schemaVersion: SchematicMapSchemaVersionSchema,
  mapId: z.literal('system'),
  layoutEngineId: SchematicMapLayoutEngineIdSchema,
  lineOrder: z.array(z.string()),
});
export type SchematicMapRuleSet = z.infer<typeof SchematicMapRuleSetSchema>;
