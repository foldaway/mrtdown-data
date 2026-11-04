import z from 'zod';

/** A complete Singapore civil-year holiday list, independent of transport policy. */
export const PublicHolidayCalendarSchema = z
  .object({
    id: z.string().regex(/^SG-\d{4}$/),
    countryCode: z.literal('SG'),
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    checkedOn: z.iso.date(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    source: z
      .object({
        publisher: z.string().min(1),
        datasetId: z.string().min(1),
        datasetUrl: z.url(),
        datasetUpdatedOn: z.iso.date(),
        licenceUrl: z.url(),
        retrievedUrl: z.url(),
        retrievedBytesSha256: z.string().regex(/^[a-f0-9]{64}$/),
        retrievedByteLength: z.number().int().positive(),
        retrievedRecordCount: z.number().int().positive(),
        recordCount: z.number().int().positive(),
      })
      .strict(),
    dates: z
      .array(
        z
          .object({
            date: z.iso.date(),
            name: z.string().min(1),
            observed: z.boolean(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((calendar, context) => {
    const year = calendar.id.slice(3);
    if (
      calendar.startDate !== `${year}-01-01` ||
      calendar.endDate !== `${year}-12-31` ||
      new Set(calendar.dates.map(({ date }) => date)).size !==
        calendar.dates.length ||
      calendar.source.recordCount !== calendar.dates.length ||
      calendar.source.retrievedRecordCount < calendar.source.recordCount ||
      calendar.dates.some(
        ({ date }) => date < calendar.startDate || date > calendar.endDate,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid public-holiday year or date population',
      });
    }
  })
  .transform((calendar) => ({
    ...calendar,
    dates: [...calendar.dates].sort((a, b) => a.date.localeCompare(b.date)),
  }));

export type PublicHolidayCalendar = z.infer<typeof PublicHolidayCalendarSchema>;
