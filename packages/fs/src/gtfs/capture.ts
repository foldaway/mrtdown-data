import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import z from 'zod';

export const CaptureSchema = z
  .object({
    schema_version: z.literal(1),
    capture_id: z.string().min(1),
    feed_kind: z.enum(['schedule', 'service_alerts', 'trip_updates']),
    source: z.url(),
    retrieved_at: z.iso.datetime({ offset: true }),
    provider_timestamp: z.null(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byte_length: z.number().int().positive(),
    archive_ref: z.string().min(1),
    attribution: z.string().min(1),
    rights_status: z.literal('pending_review'),
    licence_reference: z.url(),
  })
  .strict();
export type GtfsCapture = z.infer<typeof CaptureSchema>;

const endpoints = {
  schedule: 'GTFSScheduleTrain',
  service_alerts: 'GTFSRealTimeTrainServiceAlerts',
  trip_updates: 'GTFSRealtimeTrainTripUpdates',
};

export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readVerifiedCapture(file: string, handoff: string) {
  const capture = CaptureSchema.parse(
    JSON.parse(await readFile(handoff, 'utf8')),
  );
  const source = `https://datamall2.mytransport.sg/ltaodataservice/${endpoints[capture.feed_kind]}`;
  if (capture.source !== source) {
    throw new Error('Capture source does not match its GTFS feed kind');
  }
  const bytes = await readFile(file);
  if (
    bytes.byteLength !== capture.byte_length ||
    hashBytes(bytes) !== capture.sha256
  ) {
    throw new Error(
      'Capture file does not match the recorded size and SHA-256',
    );
  }
  return { capture, bytes };
}
