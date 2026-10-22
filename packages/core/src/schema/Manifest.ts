import z from 'zod';
import { ScheduledTimetableArtifactMetadataSchema } from './ScheduledTimetableArtifact.js';

export const ScheduledTimetablePagesEntrySchema =
  ScheduledTimetableArtifactMetadataSchema.pick({
    feedRange: true,
  }).extend({
    capture: ScheduledTimetableArtifactMetadataSchema.shape.capture.extend({
      rights_status: z.literal('redistribution_permitted'),
    }),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    releaseSha256: z.string().regex(/^[a-f0-9]{64}$/),
    currentLicenceReference: z
      .url()
      .refine((value) => new URL(value).protocol === 'https:'),
    coverage: z
      .object({
        sourceTripDateCount: z.number().int().nonnegative(),
        assignedTripDateCount: z.number().int().nonnegative(),
        missingTripDateCount: z.number().int().nonnegative(),
      })
      .strict()
      .refine(
        (value) =>
          value.sourceTripDateCount ===
          value.assignedTripDateCount + value.missingTripDateCount,
      ),
  });
export type ScheduledTimetablePagesEntry = z.infer<
  typeof ScheduledTimetablePagesEntrySchema
>;

export const ManifestSchema = z.object({
  manifestVersion: z.number(),
  generatedAt: z.string(),
  lines: z.record(z.string(), z.string()),
  stations: z.record(z.string(), z.string()),
  towns: z.record(z.string(), z.string()),
  landmarks: z.record(z.string(), z.string()),
  operators: z.record(z.string(), z.string()),
  services: z.record(z.string(), z.string()),
  issues: z.record(z.string(), z.string()),
  rights: z.object({
    licenseData: z.string(),
    sourceRegistry: z.string(),
  }),
  scheduledTimetable: ScheduledTimetablePagesEntrySchema.optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;
