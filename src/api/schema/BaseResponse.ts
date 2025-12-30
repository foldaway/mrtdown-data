import z from 'zod';
import { IssueSchema } from './Issue.js';
import { LineSchema } from './Line.js';
import { StationSchema } from './Station.js';
import { LandmarkSchema } from './Landmark.js';
import { TownSchema } from './Town.js';
import { OperatorSchema } from '../../schema/Operator.js';

export const IncludedEntitiesSchema = z
  .object({
    lines: z.record(z.string(), LineSchema),
    stations: z.record(z.string(), StationSchema),
    issues: z.record(z.string(), IssueSchema),
    landmarks: z.record(z.string(), LandmarkSchema),
    towns: z.record(z.string(), TownSchema),
    operators: z.record(z.string(), OperatorSchema),
  })
  .meta({
    ref: 'IncludedEntities',
    description: 'Included entities that are referenced in the response.',
  });
export type IncludedEntities = z.infer<typeof IncludedEntitiesSchema>;

// Base normalized response structure
export const BaseResponseSchema = z.object({
  success: z.literal(true),
  included: IncludedEntitiesSchema,
});
