import z from 'zod';

/** Canonical occurrence identities, independent of source timing and mapping approval. */
export const ScheduledTripPatternSchema = z
  .object({
    lineId: z.string().min(1),
    serviceId: z.string().min(1),
    revisionId: z.string().min(1),
    destinationStationId: z.string().min(1),
    stops: z
      .array(
        z
          .object({
            stationId: z.string().min(1),
            platformIds: z
              .array(z.string().min(1))
              .min(1)
              .refine((ids) => new Set(ids).size === ids.length, {
                message: 'Platform alternatives must be unique',
              })
              .transform((ids) => [...ids].sort()),
          })
          .strict(),
      )
      .min(2),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.stops.at(-1)?.stationId !== value.destinationStationId) {
      context.addIssue({
        code: 'custom',
        path: ['destinationStationId'],
        message: 'Destination must be the final scheduled station occurrence',
      });
    }
  });

export type ScheduledTripPattern = z.infer<typeof ScheduledTripPatternSchema>;
