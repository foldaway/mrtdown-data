import { hashBytes } from './capture.js';
import { compareStrings } from './order.js';
import { auditSchedule, type ScheduleTables } from './schedule.js';

const identityColumns: Record<string, string[]> = {
  'agency.txt': ['agency_id'],
  'routes.txt': ['route_id'],
  'stops.txt': ['stop_id'],
  'trips.txt': ['trip_id'],
  'calendar.txt': ['service_id'],
  'calendar_dates.txt': ['service_id', 'date'],
  'stop_times.txt': ['trip_id', 'stop_sequence'],
};
function hash(value: unknown) {
  return hashBytes(Buffer.from(JSON.stringify(value)));
}
function normalizeRow(row: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(row)
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([column, value]) => {
        // Formatting-only equivalence, never infer calendar, route or stop identity.
        if (column === 'stop_sequence' && /^\d+$/.test(value))
          return [column, String(Number(value))];
        if (
          ['arrival_time', 'departure_time'].includes(column) &&
          /^\d+:\d{2}:\d{2}$/.test(value)
        ) {
          const [hours, minutes, seconds] = value.split(':');
          return [
            column,
            `${String(Number(hours)).padStart(2, '0')}:${minutes}:${seconds}`,
          ];
        }
        return [column, value];
      }),
  );
}
function tableIndex(name: string, rows: ScheduleTables[string]) {
  const keys = identityColumns[name];
  const index = new Map<string, Record<string, string>>();
  for (const row of rows.map(normalizeRow)) {
    const key = JSON.stringify(
      keys ? keys.map((column) => row[column] ?? '') : row,
    );
    if (index.has(key))
      throw new Error(`Duplicate normalized drift identity in ${name}`);
    index.set(key, row);
  }
  return index;
}

/** Pairwise observations only: no lineage ordering or future ID stability claim. */
export function compareScheduleSnapshots(
  before: { tables: ScheduleTables; manifest: Record<string, string> },
  after: { tables: ScheduleTables; manifest: Record<string, string> },
) {
  for (const input of [before, after])
    if (auditSchedule(input.tables).structuralErrors.length)
      throw new Error('Structurally invalid snapshot cannot be compared');
  const tables = [
    ...new Set([...Object.keys(before.tables), ...Object.keys(after.tables)]),
  ]
    .sort(compareStrings)
    .map((name) => {
      const previous = tableIndex(name, before.tables[name] ?? []);
      const next = tableIndex(name, after.tables[name] ?? []);
      const shared = [...previous.keys()]
        .filter((key) => next.has(key))
        .sort(compareStrings);
      const changed = shared.filter(
        (key) => hash(previous.get(key)) !== hash(next.get(key)),
      );
      const added = [...next.keys()]
        .filter((key) => !previous.has(key))
        .sort(compareStrings);
      const removed = [...previous.keys()]
        .filter((key) => !next.has(key))
        .sort(compareStrings);
      const fieldChanges: Record<string, number> = {};
      const changedFields = (key: string) => {
        const a = previous.get(key) ?? {};
        const b = next.get(key) ?? {};
        return [...new Set([...Object.keys(a), ...Object.keys(b)])]
          .sort(compareStrings)
          .filter((column) => a[column] !== b[column]);
      };
      for (const key of changed)
        for (const column of changedFields(key))
          fieldChanges[column] = (fieldChanges[column] ?? 0) + 1;
      const normalizedDigest = (index: Map<string, Record<string, string>>) =>
        hash([...index].sort(([a], [b]) => compareStrings(a, b)));
      return {
        name,
        identityColumns: identityColumns[name] ?? null,
        beforeCount: previous.size,
        afterCount: next.size,
        shared: shared.length,
        unchanged: shared.length - changed.length,
        changed: changed.length,
        added: added.length,
        removed: removed.length,
        fieldChanges: Object.fromEntries(
          Object.entries(fieldChanges).sort(([a], [b]) => compareStrings(a, b)),
        ),
        normalizedBeforeSha256: normalizedDigest(previous),
        normalizedAfterSha256: normalizedDigest(next),
        changeSetSha256: hash({ added, removed, changed }),
        changedExamples: changed.slice(0, 10).map((key) => ({
          key: JSON.parse(key) as unknown,
          fields: changedFields(key),
        })),
      };
    });
  const manifest = (input: typeof before) =>
    Object.fromEntries(
      Object.entries(input.manifest).sort(([a], [b]) => compareStrings(a, b)),
    );
  return {
    schemaVersion: 1,
    normalization:
      'sorted CSV rows/columns; numeric stop_sequence; padded GTFS hour field; all other cells exact',
    beforeManifest: manifest(before),
    afterManifest: manifest(after),
    tables,
  };
}
