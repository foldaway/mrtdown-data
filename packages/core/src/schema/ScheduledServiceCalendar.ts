import z from 'zod';

export const ScheduledWeekdaysSchema = z
  .object({
    monday: z.boolean(),
    tuesday: z.boolean(),
    wednesday: z.boolean(),
    thursday: z.boolean(),
    friday: z.boolean(),
    saturday: z.boolean(),
    sunday: z.boolean(),
  })
  .strict();
export type ScheduledWeekdays = z.infer<typeof ScheduledWeekdaysSchema>;

/** Source calendar identity and compact date rules, independent of canonical services. */
export const ScheduledServiceCalendarSchema = z
  .object({
    providerCalendarId: z.string().min(1),
    weekly: z
      .object({
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        weekdays: ScheduledWeekdaysSchema,
      })
      .strict()
      .nullable(),
    exceptions: z.array(
      z.object({ date: z.iso.date(), available: z.boolean() }).strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.weekly && !value.exceptions.length)
      context.addIssue({
        code: 'custom',
        path: ['weekly'],
        message: 'A source calendar requires weekly rules or dated exceptions',
      });
    if (value.weekly && value.weekly.endDate < value.weekly.startDate)
      context.addIssue({
        code: 'custom',
        path: ['weekly', 'endDate'],
        message: 'Calendar end date cannot precede its start date',
      });
    const seen = new Set<string>();
    for (const [index, exception] of value.exceptions.entries()) {
      if (seen.has(exception.date))
        context.addIssue({
          code: 'custom',
          path: ['exceptions', index, 'date'],
          message: 'Duplicate calendar exception date',
        });
      seen.add(exception.date);
    }
  })
  .transform((value) => ({
    ...value,
    exceptions: [...value.exceptions].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    ),
  }));

export type ScheduledServiceCalendar = z.infer<
  typeof ScheduledServiceCalendarSchema
>;
