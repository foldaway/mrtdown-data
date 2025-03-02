import { z } from 'zod';
import { ComponentIdSchema } from './Component';
import { DateTime } from 'luxon';

export const IssueTypeSchema = z.enum([
  'outage',
  'maintenance',
  'delay',
  'infra',
]);
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

/** [OUTAGE] severity */
export const IssueOutageSeveritySchema = z.enum(['minor', 'major']);
/** [OUTAGE] severity */
export type IssueOutageSeverity = z.infer<typeof IssueOutageSeveritySchema>;

/** [OUTAGE] update type */
export const IssueOutageUpdateTypeSchema = z.enum([
  'general-public.report',
  'news.report',
  'operator.investigating',
  'operator.monitoring',
  'operator.update',
  'operator.resolved',
]);
/** [OUTAGE] update type */
export type IssueOutageUpdateType = z.infer<typeof IssueOutageUpdateTypeSchema>;

/** [OUTAGE] update */
export const IssueOutageUpdateSchema = z.object({
  type: IssueOutageUpdateTypeSchema,
  createdAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 datetime'),
  text: z.string().describe('summary of the update in formal sentence(s)'),
  sourceUrl: z.string(),
});
/** [OUTAGE] update */
export type IssueOutageUpdate = z.infer<typeof IssueOutageUpdateSchema>;

/** [OUTAGE] */
export const IssueOutageSchema = IssueBase.extend({
  type: z.literal(IssueTypeSchema.Enum.outage),
  severity: IssueOutageSeveritySchema,
  updates: z.array(IssueOutageUpdateSchema),
});
/** [OUTAGE] */
export type IssueOutage = z.infer<typeof IssueOutageSchema>;

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

/** [INFRA] update */
export const IssueInfraUpdateSchema = z.object({
  type: z.literal(IssueTypeSchema.Enum.infra),
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
  type: z.literal('infra'),
  updates: z.array(IssueInfraUpdateSchema),
});
/** [INFRA] */
export type IssueInfra = z.infer<typeof IssueInfraSchema>;

/** [DELAY] update type */
export const IssueDelayUpdateTypeSchema = z.enum([
  'general-public.report',
  'news.report',
  'operator.investigating',
  'operator.monitoring',
  'operator.update',
  'operator.resolved',
]);
/** [OUTAGE] update type */
export type IssueDelayUpdateType = z.infer<typeof IssueDelayUpdateTypeSchema>;
/** [DELAY] update */
export const IssueDelayUpdateSchema = z.object({
  type: IssueDelayUpdateTypeSchema,
  createdAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 datetime'),
  text: z.string(),
  sourceUrl: z.string(),
});
/** [DELAY] update */
export type IssueDelayUpdate = z.infer<typeof IssueDelayUpdateSchema>;
/** [DELAY] */
export const IssueDelaySchema = IssueBase.extend({
  type: z.literal(IssueTypeSchema.Enum.delay),
  updates: z.array(IssueDelayUpdateSchema),
});
/** [DELAY] */
export type IssueDelay = z.infer<typeof IssueDelaySchema>;

/**
 * ISSUE
 */
export const IssueSchema = z.discriminatedUnion('type', [
  IssueOutageSchema,
  IssueMaintenanceSchema,
  IssueInfraSchema,
  IssueDelaySchema,
]);
/**
 * ISSUE
 */
export type Issue = z.infer<typeof IssueSchema>;
