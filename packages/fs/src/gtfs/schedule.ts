import { parse } from 'csv-parse/sync';
import { unzipSync } from 'fflate';
import { hashBytes } from './capture.js';
import { compareStrings } from './order.js';

export type CsvRow = Record<string, string>;
export type ScheduleTables = Record<string, CsvRow[]>;
const requiredColumns: Record<string, string[]> = {
  'agency.txt': ['agency_id', 'agency_name', 'agency_url', 'agency_timezone'],
  'routes.txt': ['route_id', 'agency_id', 'route_type'],
  'stops.txt': ['stop_id', 'stop_name'],
  'trips.txt': ['route_id', 'service_id', 'trip_id'],
  'stop_times.txt': [
    'trip_id',
    'arrival_time',
    'departure_time',
    'stop_id',
    'stop_sequence',
  ],
  'calendar.txt': [
    'service_id',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'start_date',
    'end_date',
  ],
  'calendar_dates.txt': ['service_id', 'date', 'exception_type'],
};

export function readSchedule(bytes: Uint8Array) {
  let totalBytes = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (names.has(file.name))
        throw new Error(`Duplicate ZIP member: ${file.name}`);
      names.add(file.name);
      if (file.name.endsWith('/')) return false;
      if (!/^[a-z_]+\.txt$/.test(file.name)) {
        throw new Error(`Expected root-level GTFS tables: ${file.name}`);
      }
      totalBytes += file.originalSize;
      if (totalBytes > 256 * 1024 * 1024)
        throw new Error('Schedule exceeds 256 MiB expanded limit');
      return true;
    },
  });
  const tables: ScheduleTables = {};
  const manifest: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) {
    const content = files[name];
    if (!content) continue;
    // Parse headers ourselves to reject duplicates rather than silently overwrite a column.
    const records = parse(content, {
      bom: true,
      skip_empty_lines: true,
    }) as string[][];
    const columns = records.shift();
    if (
      !columns ||
      new Set(columns).size !== columns.length ||
      columns.some((column) => !column)
    ) {
      throw new Error(`Invalid or duplicate CSV columns in ${name}`);
    }
    for (const column of requiredColumns[name] ?? []) {
      if (!columns.includes(column))
        throw new Error(`${name} is missing ${column}`);
    }
    tables[name] = records.map((values) =>
      Object.fromEntries(
        columns.map((column, index) => [column, values[index] ?? '']),
      ),
    );
    manifest[name] = hashBytes(content);
  }
  for (const name of Object.keys(requiredColumns).filter(
    (name) => !name.startsWith('calendar'),
  )) {
    if (!tables[name]) throw new Error(`Missing required table: ${name}`);
  }
  if (!tables['calendar.txt'] && !tables['calendar_dates.txt']) {
    throw new Error('Schedule requires calendar.txt or calendar_dates.txt');
  }
  return { tables, manifest };
}

export function gtfsTimeSeconds(value: string): number | null {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function auditSchedule(tables: ScheduleTables) {
  const errors: string[] = [];
  function index(name: string, column: string) {
    const result = new Map<string, CsvRow>();
    for (const row of tables[name] ?? []) {
      const id = row[column];
      if (!id) errors.push(`${name}: empty ${column}`);
      else if (result.has(id))
        errors.push(`${name}: duplicate ${column} ${id}`);
      else result.set(id, row);
    }
    return result;
  }
  const agencies = index('agency.txt', 'agency_id');
  const routes = index('routes.txt', 'route_id');
  const stops = index('stops.txt', 'stop_id');
  const trips = index('trips.txt', 'trip_id');
  const calendars = index('calendar.txt', 'service_id');
  const calendarIds = new Set([
    ...calendars.keys(),
    ...(tables['calendar_dates.txt'] ?? []).map((row) => row.service_id),
  ]);
  const exceptionKeys = new Set<string>();
  for (const row of tables['calendar_dates.txt'] ?? []) {
    const key = `${row.service_id}:${row.date}`;
    if (exceptionKeys.has(key))
      errors.push(`calendar exception: duplicate ${key}`);
    exceptionKeys.add(key);
    if (!['1', '2'].includes(row.exception_type ?? ''))
      errors.push(`calendar exception ${key}: invalid exception_type`);
    if (!/^\d{8}$/.test(row.date ?? ''))
      errors.push(`calendar exception ${key}: invalid date`);
    if (!row.service_id) errors.push('calendar exception: missing service_id');
  }
  for (const [id, row] of calendars) {
    if (
      !/^\d{8}$/.test(row.start_date ?? '') ||
      !/^\d{8}$/.test(row.end_date ?? '') ||
      (row.start_date ?? '') > (row.end_date ?? '')
    )
      errors.push(`calendar ${id}: invalid date range`);
    for (const day of [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]) {
      if (!['0', '1'].includes(row[day] ?? ''))
        errors.push(`calendar ${id}: invalid ${day}`);
    }
  }
  const reference = (exists: boolean, message: string) => {
    if (!exists) errors.push(message);
  };
  for (const [id, row] of routes)
    reference(
      agencies.has(row.agency_id ?? ''),
      `route ${id}: unknown agency ${row.agency_id}`,
    );
  for (const [id, row] of stops) {
    if (row.parent_station)
      reference(
        stops.has(row.parent_station),
        `stop ${id}: unknown parent ${row.parent_station}`,
      );
    if (
      row.parent_station &&
      stops.get(row.parent_station)?.location_type !== '1'
    )
      errors.push(`stop ${id}: parent is not a station`);
    if (['0', '2'].includes(row.location_type ?? '0') && !row.parent_station) {
      // Standalone boarding stops are valid GTFS; entrances require station parents.
      if (row.location_type === '2')
        errors.push(`entrance ${id}: missing station parent`);
    }
  }
  for (const [id, row] of trips) {
    reference(
      routes.has(row.route_id ?? ''),
      `trip ${id}: unknown route ${row.route_id}`,
    );
    reference(
      calendarIds.has(row.service_id ?? ''),
      `trip ${id}: unknown calendar ${row.service_id}`,
    );
  }
  const occurrences = new Map<string, CsvRow[]>();
  for (const row of tables['stop_times.txt'] ?? []) {
    const tripId = row.trip_id ?? '';
    reference(trips.has(tripId), `stop time: unknown trip ${tripId}`);
    reference(
      stops.has(row.stop_id ?? ''),
      `trip ${tripId}: unknown stop ${row.stop_id}`,
    );
    if (!/^\d+$/.test(row.stop_sequence ?? ''))
      errors.push(`trip ${tripId}: invalid stop sequence`);
    for (const field of ['arrival_time', 'departure_time']) {
      if (row[field] && gtfsTimeSeconds(row[field]) === null)
        errors.push(`trip ${tripId}: invalid ${field} ${row[field]}`);
    }
    for (const [field, allowed] of [
      ['pickup_type', ['0', '1', '2', '3']],
      ['drop_off_type', ['0', '1', '2', '3']],
      ['timepoint', ['0', '1']],
    ] as const) {
      if (row[field] && !(allowed as readonly string[]).includes(row[field]))
        errors.push(`trip ${tripId}: invalid ${field}`);
    }
    const list = occurrences.get(tripId) ?? [];
    list.push(row);
    occurrences.set(tripId, list);
  }
  const patterns = new Map<
    string,
    {
      routeId: string;
      calendarId: string;
      direction: string;
      stopIds: string[];
      tripIds: string[];
    }
  >();
  for (const [id, trip] of trips) {
    const ordered = (occurrences.get(id) ?? []).sort(
      (a, b) => Number(a.stop_sequence) - Number(b.stop_sequence),
    );
    if (!ordered.length) errors.push(`trip ${id}: no stop times`);
    let previousSequence = -1;
    let previousDeparture = -1;
    for (const row of ordered) {
      const sequence = Number(row.stop_sequence);
      if (sequence <= previousSequence)
        errors.push(`trip ${id}: duplicate stop sequence ${sequence}`);
      previousSequence = sequence;
      const arrival = gtfsTimeSeconds(row.arrival_time ?? '');
      const departure = gtfsTimeSeconds(row.departure_time ?? '');
      if (arrival !== null && arrival < previousDeparture)
        errors.push(`trip ${id}: arrival precedes previous departure`);
      if (arrival !== null && departure !== null && departure < arrival)
        errors.push(`trip ${id}: departure precedes arrival`);
      if (departure !== null) previousDeparture = departure;
    }
    const pattern = {
      routeId: trip.route_id ?? '',
      calendarId: trip.service_id ?? '',
      direction: trip.direction_id ?? '',
      stopIds: ordered.map((row) => row.stop_id ?? ''),
    };
    const key = JSON.stringify(pattern);
    const entry = patterns.get(key) ?? { ...pattern, tripIds: [] };
    entry.tripIds.push(id);
    patterns.set(key, entry);
  }
  return {
    tableCounts: Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [name, rows.length]),
    ),
    feedInfo: tables['feed_info.txt'] ?? [],
    agencies: [...agencies.values()].sort((a, b) =>
      compareStrings(a.agency_id ?? '', b.agency_id ?? ''),
    ),
    routes: [...routes.values()].sort((a, b) =>
      compareStrings(a.route_id ?? '', b.route_id ?? ''),
    ),
    stopCounts: {
      stations: [...stops.values()].filter((row) => row.location_type === '1')
        .length,
      platforms: [...stops.values()].filter(
        (row) => !row.location_type || row.location_type === '0',
      ).length,
      entrances: [...stops.values()].filter((row) => row.location_type === '2')
        .length,
    },
    calendars: [...(tables['calendar.txt'] ?? [])].sort((a, b) =>
      compareStrings(a.service_id ?? '', b.service_id ?? ''),
    ),
    calendarExceptions: [...(tables['calendar_dates.txt'] ?? [])].sort((a, b) =>
      compareStrings(JSON.stringify(a), JSON.stringify(b)),
    ),
    patterns: [...patterns.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([key, pattern]) => ({
        id: hashBytes(Buffer.from(key)),
        ...pattern,
        tripIds: pattern.tripIds.sort(),
      })),
    structuralErrors: [...new Set(errors)].sort(),
  };
}
