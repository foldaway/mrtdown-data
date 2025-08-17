import { z } from 'zod';
import { ComponentIdSchema } from './Component.js';
import { StationIdSchema } from './StationId.js';

export type StationId = z.infer<typeof StationIdSchema>;

export const StationCodeSchema = z.string();
export type StationCode = z.infer<typeof StationCodeSchema>;

export const StationComponentMemberStructureTypeSchema = z.enum([
  'elevated',
  'underground',
  'at_grade',
  'in_building',
]);
export type StationComponentMemberStructureType = z.infer<
  typeof StationComponentMemberStructureTypeSchema
>;

export const StationComponentMemberSchema = z.object({
  code: StationCodeSchema,
  startedAt: z.string().date(),
  endedAt: z.string().date().optional(),
  structureType: StationComponentMemberStructureTypeSchema,
});
export type StationComponentMember = z.infer<
  typeof StationComponentMemberSchema
>;

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
  componentMembers: z
    .record(ComponentIdSchema, z.array(StationComponentMemberSchema))
    .describe('Mapping of component ID to Station codes'),
});
export type Station = z.infer<typeof StationSchema>;
