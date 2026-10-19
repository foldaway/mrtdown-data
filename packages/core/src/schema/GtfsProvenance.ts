import z from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const GtfsCaptureSchema = z
  .object({
    schema_version: z.literal(1),
    capture_id: z.string().min(1),
    feed_kind: z.enum(['schedule', 'service_alerts', 'trip_updates']),
    source: z.url(),
    retrieved_at: z.iso.datetime({ offset: true }),
    provider_timestamp: z.null(),
    sha256: digest,
    byte_length: z.number().int().positive(),
    archive_ref: z.string().min(1),
    attribution: z.string().min(1),
    rights_status: z.enum(['pending_review', 'redistribution_permitted']),
    licence_reference: z.url(),
  })
  .strict();
export type GtfsCapture = z.infer<typeof GtfsCaptureSchema>;

export const GtfsReconciliationIdentitySchema = z
  .object({
    sourceManifest: z.record(z.string(), digest),
    canonicalCommit: z.string().regex(/^[a-f0-9]{40}$/),
    topology: z
      .object({ projectionVersion: z.literal(1), sha256: digest })
      .strict(),
  })
  .strict();
export type GtfsReconciliationIdentity = z.infer<
  typeof GtfsReconciliationIdentitySchema
>;
