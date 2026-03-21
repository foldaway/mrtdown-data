import z from 'zod';
import { OperatingHoursSchema, TranslationsSchema } from './common.js';

export const ServiceRevisionSchema = z.object({
  id: z.string(),
  startAt: z.string(),
  endAt: z.string().nullable(),
  path: z.object({
    stations: z.array(
      z.object({
        stationId: z.string(),
        displayCode: z.string(),
      }),
    ),
  }),
  operatingHours: OperatingHoursSchema,
});
export type ServiceRevision = z.infer<typeof ServiceRevisionSchema>;

export const ServiceSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
  /**
   * The station IDs in the order they are visited by the service.
   */
  lineId: z.string(),
  revisions: z.array(ServiceRevisionSchema),
});
export type Service = z.infer<typeof ServiceSchema>;
