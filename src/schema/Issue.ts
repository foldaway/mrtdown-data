import { z } from 'zod';
import { ComponentIdSchema } from './Component';
import { DateTime } from 'luxon';
import { StationIdSchema } from './StationId';

export const IssueTypeSchema = z.enum(['disruption', 'maintenance', 'infra']);
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const IssueIdSchema = z
  .string()
  .refine((val) => /^\d{4}-\d{2}-\d{2}-.+$/.test(val))
  .describe('YYYY-MM-DD followed by a lowercase blog post-like slug');
export type IssueId = z.infer<typeof IssueIdSchema>;

export const IssueStationEntrySchema = z.object({
  componentId: ComponentIdSchema,
  branchName: z.string(),
  stationIds: z.array(StationIdSchema),
});
export type IssueStationEntry = z.infer<typeof IssueStationEntrySchema>;

const IssueBase = z.object({
  id: IssueIdSchema,
  title: z
    .string()
    .describe(
      'In the style of a SaaS status page incident title. Only describe the problem, e.g. service disruption. Do not mention resolution.',
    ),
  title_translations: z
    .object({
      'zh-Hans': z.string(),
      ms: z.string(),
      ta: z.string(),
    })
    .describe('Translations of the title field'),
  componentIdsAffected: z
    .array(ComponentIdSchema)
    .describe('List of components affected'),
  stationIdsAffected: z
    .array(IssueStationEntrySchema)
    .describe('List of stations affected'),
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

/** [DISRUPTION] subtype */
export const IssueDisruptionSubtypeSchema = z.enum([
  'signal.fault',
  'track.fault',
  'train.fault',
  'power.fault',
  'station.fault',
  'security',
  'weather',
  'passenger.incident',
  'platform_door.fault',
  'delay',
]);
/** [DISRUPTION] subtype */
export type IssueDisruptionSubtype = z.infer<
  typeof IssueDisruptionSubtypeSchema
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
  subtypes: z.array(IssueDisruptionSubtypeSchema),
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

/** [MAINTENANCE] subtype */
export const IssueMaintenanceSubtypeSchema = z.enum([
  'track.work',
  'station.renovation',
  'system.upgrade',
]);
/** [MAINTENANCE] subtype */
export type IssueMaintenanceSubtype = z.infer<
  typeof IssueDisruptionSubtypeSchema
>;

/** [MAINTENANCE] */
export const IssueMaintenanceSchema = IssueBase.extend({
  type: z.literal(IssueTypeSchema.Enum.maintenance),
  rrule: z.string().optional(),
  cancelledAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .nullable()
    .describe('ISO8601 date'),
  updates: z.array(IssueMaintenanceUpdateSchema),
  subtypes: z.array(IssueMaintenanceSubtypeSchema),
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

/** [INFRA] subtype */
export const IssueInfraSubtypeSchema = z.enum([
  'elevator.outage',
  'escalator.outage',
  'air_conditioning.issue',
]);
/** [INFRA] subtype */
export type IssueInfraSubtype = z.infer<typeof IssueDisruptionSubtypeSchema>;

/** [INFRA] */
export const IssueInfraSchema = IssueBase.extend({
  type: z.literal(IssueTypeSchema.Enum.infra),
  updates: z.array(IssueInfraUpdateSchema),
  subtypes: z.array(IssueInfraSubtypeSchema),
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
