import z from 'zod';

export const ScheduledTimetableRequestScopeSchema = z
  .object({
    stationId: z.string().min(1),
    lineId: z.string().min(1),
    serviceId: z.string().min(1),
    destinationStationId: z.string().min(1),
    platformId: z.string().min(1).optional(),
  })
  .strict();
export type ScheduledTimetableRequestScope = z.infer<
  typeof ScheduledTimetableRequestScopeSchema
>;
