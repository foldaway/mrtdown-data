import GtfsRealtime from 'gtfs-realtime-bindings';
import type { GtfsCapture } from './capture.js';
import { compareStrings } from './order.js';

export function auditRealtime(
  bytes: Uint8Array,
  kind: Exclude<GtfsCapture['feed_kind'], 'schedule'>,
) {
  const { FeedMessage, FeedHeader } = GtfsRealtime.transit_realtime;
  const feed = FeedMessage.decode(bytes);
  const validation = FeedMessage.verify(feed);
  if (validation) {
    throw new Error(`Invalid GTFS realtime envelope: ${validation}`);
  }
  if (feed.header.gtfsRealtimeVersion !== '2.0') {
    throw new Error('Only GTFS Realtime 2.0 is supported');
  }
  if (feed.header.incrementality !== FeedHeader.Incrementality.FULL_DATASET) {
    throw new Error(
      'DIFFERENTIAL realtime feeds require a separate audited ordering contract',
    );
  }
  const ids = new Set<string>();
  for (const entity of feed.entity) {
    if (!entity.id || ids.has(entity.id)) {
      throw new Error('Realtime entity IDs must be nonempty and unique');
    }
    ids.add(entity.id);
    if (
      kind === 'service_alerts' &&
      (!entity.alert || entity.tripUpdate || entity.vehicle || entity.isDeleted)
    ) {
      throw new Error(
        'Service-alert capture contains an unexpected entity shape',
      );
    }
    if (
      kind === 'trip_updates' &&
      (!entity.tripUpdate || entity.alert || entity.vehicle || entity.isDeleted)
    ) {
      throw new Error(
        'Trip-update capture contains an unexpected entity shape',
      );
    }
  }
  const normalized = FeedMessage.toObject(feed, {
    longs: String,
    enums: String,
  });
  const timestamp = Object.hasOwn(feed.header, 'timestamp')
    ? (feed.header.timestamp?.toString() ?? null)
    : null;
  // Keep protobuf timestamps as decimal strings to avoid loss above JS safe-integer range.
  return {
    version: feed.header.gtfsRealtimeVersion,
    incrementality: 'FULL_DATASET' as const,
    providerTimestampSeconds: timestamp,
    entityCount: feed.entity.length,
    entities: (normalized.entity ?? []).sort(
      (a: { id: string }, b: { id: string }) => compareStrings(a.id, b.id),
    ),
  };
}
