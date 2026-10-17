import z from 'zod';

const serviceDaySeconds = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const ScheduledStopAccessSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type ScheduledStopAccess = z.infer<typeof ScheduledStopAccessSchema>;

/** A source stop occurrence's timing and access rules, without a dated allocation. */
export const ScheduledStopTimeSchema = z
  .object({
    providerTripId: z.string().min(1),
    providerStopId: z.string().min(1),
    stopSequence: z.string().regex(/^\d+$/),
    arrivalSeconds: serviceDaySeconds.nullable(),
    departureSeconds: serviceDaySeconds.nullable(),
    pickupType: ScheduledStopAccessSchema,
    dropOffType: ScheduledStopAccessSchema,
    timepoint: z.union([z.literal(0), z.literal(1)]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.timepoint === 1) {
      for (const field of ['arrivalSeconds', 'departureSeconds'] as const)
        if (value[field] === null)
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'An exact timepoint requires arrival and departure times',
          });
    }
    if (
      value.arrivalSeconds !== null &&
      value.departureSeconds !== null &&
      value.departureSeconds < value.arrivalSeconds
    )
      context.addIssue({
        code: 'custom',
        path: ['departureSeconds'],
        message: 'Departure cannot precede arrival within a service day',
      });
  });

export type ScheduledStopTime = z.infer<typeof ScheduledStopTimeSchema>;
