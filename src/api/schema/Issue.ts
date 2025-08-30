import z from 'zod';
import {
  IssueDisruptionSubtypeSchema,
  IssueInfraSubtypeSchema,
  IssueMaintenanceSubtypeSchema,
  IssueTypeSchema,
} from '../../schema/Issue.js';

export const IssueIntervalStatusSchema = z
  .enum(['ongoing', 'ended', 'future'])
  .meta({
    ref: 'IssueIntervalStatus',
    description:
      'The status of the issue interval, indicating whether it is currently ongoing, has ended, or is upcoming.',
  });
export type IssueIntervalStatus = z.infer<typeof IssueIntervalStatusSchema>;

export const IssueIntervalSchema = z
  .object({
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime().nullable(),
    status: IssueIntervalStatusSchema,
  })
  .meta({
    ref: 'IssueInterval',
  });
export type IssueInterval = z.infer<typeof IssueIntervalSchema>;

export const IssueAffectedBranchSchema = z
  .object({
    lineId: z.string(),
    branchId: z.string(),
    stationIds: z.array(z.string()),
  })
  .meta({
    ref: 'IssueAffectedBranch',
    description:
      'A branch of a line affected by the issue, including the stations impacted.',
  });
export type IssueAffectedBranch = z.infer<typeof IssueAffectedBranchSchema>;

export const IssueSubtypeSchema = z
  .union([
    IssueDisruptionSubtypeSchema,
    IssueMaintenanceSubtypeSchema,
    IssueInfraSubtypeSchema,
  ])
  .meta({
    ref: 'IssueSubtype',
    description:
      'The subtype of the issue, providing more specific categorization based on the issue type.',
  });
export type IssueSubtype = z.infer<typeof IssueSubtypeSchema>;

export const IssueSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    titleTranslations: z.record(z.string(), z.string()),
    type: IssueTypeSchema,
    subtypes: z.array(IssueSubtypeSchema).meta({
      description:
        'Subtypes providing more specific categorization of the issue.',
    }),
    durationSeconds: z.number(),
    lineIds: z.array(z.string()).meta({
      description: 'IDs of lines affected by the issue.',
    }),
    branchesAffected: z.array(IssueAffectedBranchSchema).meta({
      description:
        'Branches of lines affected by the issue, including stations impacted.',
    }),
    intervals: z.array(IssueIntervalSchema),
  })
  .meta({
    ref: 'Issue',
  });
export type Issue = z.infer<typeof IssueSchema>;
