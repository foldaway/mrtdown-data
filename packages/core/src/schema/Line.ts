import z from 'zod';
import { TranslationsSchema } from './common.js';

/**
 * Line operator
 */
export const LineOperatorSchema = z.object({
  operatorId: z.string(),
  startedAt: z.iso.date().nullable(),
  endedAt: z.iso.date().nullable(),
});
export type LineOperator = z.infer<typeof LineOperatorSchema>;

/**
 * Operating hours for weekday/weekend service windows.
 * Used by API uptime calculations.
 */
export const LineOperatingHoursSchema = z.object({
  weekdays: z.object({
    start: z.iso.time(),
    end: z.iso.time(),
  }),
  weekends: z.object({
    start: z.iso.time(),
    end: z.iso.time(),
  }),
});
export type LineOperatingHours = z.infer<typeof LineOperatingHoursSchema>;

export const LineTypeSchema = z.enum(['mrt.high', 'mrt.medium', 'lrt']);
export type LineType = z.infer<typeof LineTypeSchema>;

/**
 * The number of passenger door positions on either side of a train, and
 * therefore the number of matching doors or gates on each platform edge.
 * LRT platforms have no physical platform doors or gates.
 */
export const LinePlatformDoorCountSchema = z
  .number()
  .int()
  .positive()
  .nullable();
export type LinePlatformDoorCount = z.infer<typeof LinePlatformDoorCountSchema>;

/**
 * Passenger train formation lengths, in cars, operated on the line (or planned
 * for a line that has not yet opened). Multiple lengths are permitted only for
 * LRT lines, whose services can operate with one- or two-car trains.
 */
export const LineTrainCarCountsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .refine(
    (counts) => new Set(counts).size === counts.length,
    'trainCarCounts must not contain duplicates',
  );
export type LineTrainCarCounts = z.infer<typeof LineTrainCarCountsSchema>;

export const LineSchema = z
  .object({
    id: z.string(),
    name: TranslationsSchema,
    type: LineTypeSchema,
    color: z.string(),
    startedAt: z.iso.date().nullable(),
    platformDoorCount: LinePlatformDoorCountSchema,
    trainCarCounts: LineTrainCarCountsSchema,
    serviceIds: z.array(z.string()),
    operators: z.array(LineOperatorSchema),
    operatingHours: LineOperatingHoursSchema.optional(),
  })
  .superRefine((line, context) => {
    const isLrt = line.type === 'lrt';
    const hasPlatformDoors = line.platformDoorCount != null;

    if (isLrt === hasPlatformDoors) {
      context.addIssue({
        code: 'custom',
        message: isLrt
          ? 'LRT lines must set platformDoorCount to null'
          : 'MRT lines must provide a positive platformDoorCount',
        path: ['platformDoorCount'],
      });
    }

    if (!isLrt && line.trainCarCounts.length !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'MRT lines must provide exactly one train car count',
        path: ['trainCarCounts'],
      });
    }
  });
export type Line = z.infer<typeof LineSchema>;
