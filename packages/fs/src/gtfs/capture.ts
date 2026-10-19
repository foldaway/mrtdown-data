import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { GtfsCaptureSchema as CaptureSchema } from '@mrtdown/core';

export {
  type GtfsCapture,
  GtfsCaptureSchema as CaptureSchema,
} from '@mrtdown/core';

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
