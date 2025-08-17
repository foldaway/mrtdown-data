import z from 'zod';
import { IssueTypeSchema } from '../../schema/Issue.js';

export const LineSummaryStatusSchema = z
  .enum([
    'future_service',
    'closed_for_day',
    'ongoing_disruption',
    'ongoing_maintenance',
    'ongoing_infra',
    'normal',
  ])
  .meta({
    ref: 'LineSummaryStatus',
    description:
      'Status of the line summary, indicating the current operational state.',
  });
export type LineSummaryStatus = z.infer<typeof LineSummaryStatusSchema>;

export const LineSummaryDateRecordIssueTypeEntrySchema = z
  .object({
    totalDurationSeconds: z.number(),
    issueIds: z.array(z.string()).meta({
      description: 'List of issue IDs for this issue type on this date.',
    }),
  })
  .meta({
    ref: 'LineSummaryDateRecordIssueTypeEntry',
    description: 'Details of issues for a specific date and issue type.',
  });
export type LineSummaryDateRecordIssueTypeEntry = z.infer<
  typeof LineSummaryDateRecordIssueTypeEntrySchema
>;

export const LineSummaryDayTypeSchema = z
  .enum(['weekday', 'weekend', 'public_holiday'])
  .meta({
    ref: 'LineSummaryDayType',
    description: 'Type of day for the breakdown.',
  });
export type LineSummaryDayType = z.infer<typeof LineSummaryDayTypeSchema>;

export const LineSummaryDateRecordSchema = z
  .object({
    breakdownByIssueTypes: z.partialRecord(
      IssueTypeSchema,
      LineSummaryDateRecordIssueTypeEntrySchema,
    ),
    dayType: LineSummaryDayTypeSchema,
  })
  .meta({
    ref: 'LineSummaryDateRecord',
    description: 'Breakdown of issues by date for a line summary.',
  });
export type LineSummaryDateRecord = z.infer<typeof LineSummaryDateRecordSchema>;

export const LineSummarySchema = z
  .object({
    lineId: z.string(),
    status: LineSummaryStatusSchema,
    durationSecondsByIssueType: z
      .partialRecord(IssueTypeSchema, z.number())
      .meta({
        description:
          'Total duration in seconds for each issue type affecting this line.',
      }),
    durationSecondsTotalForIssues: z.number().meta({
      description:
        'Total duration in seconds for all issues affecting this line.',
    }),
    breakdownByDates: z.record(z.iso.date(), LineSummaryDateRecordSchema).meta({
      description: 'Breakdown of issues by date for this line.',
    }),
    uptimeRatio: z.number().nullable(),
    totalServiceSeconds: z.number().nullable(),
    totalDowntimeSeconds: z.number().nullable(),
    downtimeBreakdown: z
      .array(
        z.object({
          type: IssueTypeSchema,
          downtimeSeconds: z.number(),
        }),
      )
      .nullable(),
  })
  .meta({
    ref: 'LineSummary',
    description: 'Summary of the status and issues for a specific line.',
  });
export type LineSummary = z.infer<typeof LineSummarySchema>;

export const LineSummaryBasic = z
  .object({
    lineId: z.string(),
    status: LineSummaryStatusSchema,
    issueIdsOngoing: z.array(z.string()).meta({
      description: 'List of ongoing issue IDs affecting this line.',
    }),
  })
  .meta({
    ref: 'LineSummaryBasic',
    description:
      'Basic summary of a line, including its status and ongoing issues.',
  });
export type LineSummaryBasic = z.infer<typeof LineSummaryBasic>;
