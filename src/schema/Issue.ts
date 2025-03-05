import { z } from 'zod';
import { ComponentIdSchema } from './Component';
import { DateTime } from 'luxon';

export const IssueTypeSchema = z.enum(['disruption', 'maintenance', 'infra']);
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const IssueIdSchema = z
  .string()
  .refine((val) => /^\d{4}-\d{2}-\d{2}-.+$/.test(val))
  .describe('YYYY-MM-DD followed by a lowercase blog post-like slug');
export type IssueId = z.infer<typeof IssueIdSchema>;

const IssueBase = z.object({
  id: IssueIdSchema,
  title: z
    .string()
    .describe(
      'In the style of a SaaS status page incident title. Only describe the problem, e.g. service disruption. Do not mention resolution.',
    ),
  componentIdsAffected: z
    .array(ComponentIdSchema)
    .describe('List of components affected'),
  startAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 date'),
  endAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .nullable()
    .describe('ISO8601 end timestamp of the issue, if applicable.'),
});

/** [DISRUPTION] severity */
export const IssueDisruptionSeveritySchema = z.enum(['minor', 'major']);
/** [DISRUPTION] severity */
export type IssueDisruptionSeverity = z.infer<
  typeof IssueDisruptionSeveritySchema
>;

/** [DISRUPTION] update type */
export const IssueDisruptionUpdateTypeSchema = z.enum([
  'general-public.report',
  'news.report',
  'operator.investigating',
  'operator.monitoring',
  'operator.update',
  'operator.resolved',
]);
/** [DISRUPTION] update type */
export type IssueDisruptionUpdateType = z.infer<
  typeof IssueDisruptionUpdateTypeSchema
>;

/** [DISRUPTION] update */
export const IssueDisruptionUpdateSchema = z.object({
  type: IssueDisruptionUpdateTypeSchema,
  createdAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 datetime'),
  text: z.string().describe('summary of the update in formal sentence(s)'),
  sourceUrl: z.string(),
});
/** [DISRUPTION] update */
export type IssueDisruptionUpdate = z.infer<typeof IssueDisruptionUpdateSchema>;

/** [DISRUPTION] */
export const IssueDisruptionSchema = IssueBase.extend({
  type: z.literal(IssueTypeSchema.Enum.disruption),
  severity: IssueDisruptionSeveritySchema,
  updates: z.array(IssueDisruptionUpdateSchema),
});
/** [DISRUPTION] */
export type IssueDisruption = z.infer<typeof IssueDisruptionSchema>;

/** [MAINTENANCE] update type */
export const IssueMaintenanceUpdateTypeSchema = z.enum([
  'planned',
  'operator.update',
]);
/** [MAINTENANCE] update type */
export type IssueMaintenanceUpdateType = z.infer<
  typeof IssueMaintenanceUpdateTypeSchema
>;

/** [MAINTENANCE] update */
export const IssueMaintenanceUpdateSchema = z.object({
  type: IssueMaintenanceUpdateTypeSchema,
  createdAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 datetime'),
  text: z.string(),
  sourceUrl: z.string(),
});
/** [MAINTENANCE] update */
export type IssueMaintenanceUpdate = z.infer<
  typeof IssueMaintenanceUpdateSchema
>;

/** [MAINTENANCE] */
export const IssueMaintenanceSchema = IssueBase.extend({
  type: z.literal(IssueTypeSchema.Enum.maintenance),
  cancelledAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .nullable()
    .describe('ISO8601 date'),
  updates: z.array(IssueMaintenanceUpdateSchema),
});
/** [MAINTENANCE] */
export type IssueMaintenance = z.infer<typeof IssueMaintenanceSchema>;

/** [INFRA] update type */
export const IssueInfraUpdateTypeSchema = z.enum(['operator.update']);
/** [INFRA] update type */
export type IssueInfraUpdateType = z.infer<typeof IssueInfraUpdateTypeSchema>;

/** [INFRA] update */
export const IssueInfraUpdateSchema = z.object({
  type: IssueInfraUpdateTypeSchema,
  createdAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 datetime'),
  text: z.string(),
  sourceUrl: z.string(),
});
/** [INFRA] update */
export type IssueInfraUpdate = z.infer<typeof IssueInfraUpdateSchema>;

/** [INFRA] */
export const IssueInfraSchema = IssueBase.extend({
  type: z.literal(IssueTypeSchema.Enum.infra),
  updates: z.array(IssueInfraUpdateSchema),
});
/** [INFRA] */
export type IssueInfra = z.infer<typeof IssueInfraSchema>;

/**
 * ISSUE
 */
export const IssueSchema = z.discriminatedUnion('type', [
  IssueDisruptionSchema,
  IssueMaintenanceSchema,
  IssueInfraSchema,
]);
/**
 * ISSUE
 */
export type Issue = z.infer<typeof IssueSchema>;
