import z from 'zod';

const scope = z
  .object({
    stationId: z.string().min(1),
    lineId: z.string().min(1),
    destinationStationId: z.string().min(1),
    platformId: z.string().min(1).optional(),
  })
  .strict();
export const ScheduledTimetableRequestScopeSchema = z.union([
  scope.extend({
    serviceId: z.string().min(1),
    serviceIds: z.never().optional(),
  }),
  scope.extend({
    serviceId: z.never().optional(),
    serviceIds: z
      .array(z.string().min(1))
      .min(1)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Requested services must be distinct',
      )
      .transform((ids) => [...ids].sort()),
  }),
]);
export type ScheduledTimetableRequestScope = z.infer<
  typeof ScheduledTimetableRequestScopeSchema
>;

/** Return an independent service list so scope comparisons cannot mutate the request. */
export function requestedServiceIds(scope: ScheduledTimetableRequestScope) {
  if (scope.serviceIds) return [...scope.serviceIds];
  if (!scope.serviceId) throw new Error('Missing requested service');
  return [scope.serviceId];
}
