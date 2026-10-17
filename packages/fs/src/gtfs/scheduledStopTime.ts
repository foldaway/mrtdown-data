import { ScheduledStopTimeSchema } from '@mrtdown/core';
import { gtfsTimeSeconds } from './schedule.js';

/** Parse fixed-stop timing fields only. This does not map, approve or publish a trip. */
export function scheduledStopTimeFromGtfs(row: Record<string, string>) {
  for (const field of [
    'location_group_id',
    'location_id',
    'start_pickup_drop_off_window',
    'end_pickup_drop_off_window',
  ])
    if (row[field])
      throw new Error(`Unsupported on-demand stop-time field: ${field}`);
  const seconds = (field: 'arrival_time' | 'departure_time') => {
    const value = row[field];
    if (!value) return null;
    const parsed = gtfsTimeSeconds(value);
    if (parsed === null || !Number.isSafeInteger(parsed))
      throw new Error(`Invalid GTFS ${field}: ${value}`);
    return parsed;
  };
  const enumeration = (field: string, allowed: string[], fallback: string) => {
    const value = row[field] || fallback;
    if (!allowed.includes(value))
      throw new Error(`Invalid GTFS ${field}: ${value}`);
    return Number(value);
  };
  return ScheduledStopTimeSchema.parse({
    providerTripId: row.trip_id,
    providerStopId: row.stop_id,
    stopSequence: row.stop_sequence,
    arrivalSeconds: seconds('arrival_time'),
    departureSeconds: seconds('departure_time'),
    pickupType: enumeration('pickup_type', ['0', '1', '2', '3'], '0'),
    dropOffType: enumeration('drop_off_type', ['0', '1', '2', '3'], '0'),
    timepoint: enumeration('timepoint', ['0', '1'], '1'),
  });
}
