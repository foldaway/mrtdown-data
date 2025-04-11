import { z } from 'zod';
import { ComponentIdSchema } from './Component';
import { StationIdSchema } from './StationId';

export type StationId = z.infer<typeof StationIdSchema>;

export const StationCodeSchema = z.string();
export type StationCode = z.infer<typeof StationCodeSchema>;

export const StationComponentMemberSchema = z.object({
  code: StationCodeSchema,
  startedAt: z.string().date(),
  endedAt: z.string().date().optional(),
});
export type StationComponentMember = z.infer<
  typeof StationComponentMemberSchema
>;

export const StationSchema = z.object({
  id: StationIdSchema.describe(
    '2-5 letter abbreviation of station name that is unique in the entire network and easily understood',
  ),
  name: z.string(),
  componentMembers: z
    .record(ComponentIdSchema, z.array(StationComponentMemberSchema))
    .describe('Mapping of component ID to Station codes'),
});
export type Station = z.infer<typeof StationSchema>;
