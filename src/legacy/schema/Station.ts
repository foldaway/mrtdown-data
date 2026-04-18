import { z } from 'zod';
import { LineIdSchema } from './Line.js';
import { StationIdSchema } from './StationId.js';

export type StationId = z.infer<typeof StationIdSchema>;

export const StationCodeSchema = z.string();
export type StationCode = z.infer<typeof StationCodeSchema>;

export const StationLineMemberStructureTypeSchema = z
  .enum(['elevated', 'underground', 'at_grade', 'in_building'])
  .meta({
    ref: 'StationLineMemberStructureType',
    description:
      'The structural type of the station line member, indicating whether it is elevated, underground, at-grade, or enclosed within a building.',
  });
export type StationLineMemberStructureType = z.infer<
  typeof StationLineMemberStructureTypeSchema
>;

export const StationLineMemberSchema = z.object({
  code: StationCodeSchema,
  startedAt: z.string().date(),
  endedAt: z.string().date().optional(),
  structureType: StationLineMemberStructureTypeSchema,
});
export type StationLineMember = z.infer<typeof StationLineMemberSchema>;

export const StationGeoSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});
export type StationGeo = z.infer<typeof StationGeoSchema>;

export const StationSchema = z.object({
  id: StationIdSchema.describe(
    '2-5 letter abbreviation of station name that is unique in the entire network and easily understood',
  ),
  name: z.string(),
  name_translations: z.record(z.string(), z.string()),
  town: z.string(),
  town_translations: z.record(z.string(), z.string()),
  landmarks: z.array(z.string()),
  landmarks_translations: z.record(z.string(), z.array(z.string())),
  geo: StationGeoSchema,
  lineMembers: z
    .record(LineIdSchema, z.array(StationLineMemberSchema))
    .describe('Mapping of line ID to Station codes'),
});
export type Station = z.infer<typeof StationSchema>;
