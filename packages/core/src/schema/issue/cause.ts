import z from 'zod';

/** Cause subtype for disruption issues. */
export const CauseDisruptionSchema = z.enum([
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
export type CauseDisruption = z.infer<typeof CauseDisruptionSchema>;

/** Cause subtype for maintenance issues. */
export const CauseMaintenanceSchema = z.enum(['track.work', 'system.upgrade']);
export type CauseMaintenance = z.infer<typeof CauseMaintenanceSchema>;

/** Cause subtype for infra issues. */
export const CauseInfraSchema = z.enum([
  'elevator.outage',
  'escalator.outage',
  'air_conditioning.issue',
  'station.renovation',
]);
export type CauseInfra = z.infer<typeof CauseInfraSchema>;

/** Union of all cause subtypes for impact events. */
export const CauseSubtypeSchema = z.union([
  CauseDisruptionSchema,
  CauseMaintenanceSchema,
  CauseInfraSchema,
]);
export type CauseSubtype = z.infer<typeof CauseSubtypeSchema>;
