import { DateTime } from 'luxon';
import { z } from 'zod';

export const IssueIdPattern =
  /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRealCalendarDate(year: string, month: string, day: string): boolean {
  return DateTime.fromObject(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
    },
    { zone: 'UTC' },
  ).isValid;
}

export const IssueIdSchema = z
  .string()
  .superRefine((value, context) => {
    const match = IssueIdPattern.exec(value);
    if (!match) {
      context.addIssue({
        code: 'custom',
        message: 'Expected issue id format: YYYY-MM-DD-<slug>',
      });
      return;
    }

    const [, year, month, day] = match;
    if (!isRealCalendarDate(year, month, day)) {
      context.addIssue({
        code: 'custom',
        message: 'Issue id date must be a real calendar date',
      });
    }
  })
  .describe('YYYY-MM-DD followed by a lowercase blog post-like slug');
export type IssueId = z.infer<typeof IssueIdSchema>;
