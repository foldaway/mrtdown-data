import z from 'zod';

export const ScheduledServiceMembershipSchema = z
  .object({ serviceId: z.string().min(1), revisionId: z.string().min(1) })
  .strict();

const occurrences = z
  .object({
    lineId: z.string().min(1),
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
  .strict();

/** One source journey, with one or several independently validated service memberships. */
export const ScheduledTripPatternSchema = z
  .union([
    z
      .object({
        lineId: occurrences.shape.lineId,
        serviceId: z.string().min(1),
        revisionId: z.string().min(1),
        destinationStationId: occurrences.shape.destinationStationId,
        stops: occurrences.shape.stops,
        serviceMemberships: z.never().optional(),
      })
      .strict(),
    occurrences.extend({
      serviceId: z.never().optional(),
      revisionId: z.never().optional(),
      serviceMemberships: z
        .array(ScheduledServiceMembershipSchema)
        .min(2)
        .refine(
          (members) =>
            new Set(members.map((member) => member.serviceId)).size ===
            members.length,
          'Service memberships must name distinct services',
        )
        .transform((members) =>
          [...members].sort((a, b) =>
            a.serviceId < b.serviceId ? -1 : a.serviceId > b.serviceId ? 1 : 0,
          ),
        ),
    }),
  ])
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

export type ScheduledServiceMembership = z.infer<
  typeof ScheduledServiceMembershipSchema
>;

export function scheduledServiceMemberships(
  pattern: Pick<
    ScheduledTripPattern,
    'serviceId' | 'revisionId' | 'serviceMemberships'
  >,
): readonly ScheduledServiceMembership[] {
  if (pattern.serviceMemberships) return pattern.serviceMemberships;
  if (!pattern.serviceId || !pattern.revisionId)
    throw new Error('Missing scheduled service membership');
  return [{ serviceId: pattern.serviceId, revisionId: pattern.revisionId }];
}
