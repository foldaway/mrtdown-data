import z from 'zod';
import { hashBytes } from './capture.js';
import { compareStrings } from './order.js';
import { auditSchedule, type ScheduleTables } from './schedule.js';
import { resolveStationCandidates } from './stationMatch.js';
import type { scheduleTopologyProjection } from './topology.js';

type Topology = ReturnType<typeof scheduleTopologyProjection>;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ReconciliationIdentitySchema = z
  .object({
    sourceManifest: z.record(z.string(), digest),
    canonicalCommit: z.string().regex(/^[a-f0-9]{40}$/),
    topology: z
      .object({ projectionVersion: z.literal(1), sha256: digest })
      .strict(),
  })
  .strict();
export type ReconciliationIdentity = z.infer<
  typeof ReconciliationIdentitySchema
>;

const targetSchema = z
  .object({
    kind: z.enum([
      'operator',
      'line',
      'station',
      'platform',
      'serviceRevision',
    ]),
    id: z.string().min(1),
    stationId: z.string().min(1).optional(),
    revisionId: z.string().min(1).optional(),
    match: z.enum(['exact', 'contiguousSegment', 'cyclicSegment']).optional(),
  })
  .strict();
export type ReconciliationTarget = z.infer<typeof targetSchema>;
export const ReconciliationEntrySchema = z
  .object({
    kind: z.enum(['agency', 'route', 'stop', 'pattern']),
    providerId: z.string().min(1),
    sourceRecordSha256: digest,
    status: z.enum(['proposed', 'ambiguous', 'unresolved']),
    candidates: z.array(targetSchema),
    reason: z.string().min(1),
  })
  .strict();
export type ReconciliationEntry = z.infer<typeof ReconciliationEntrySchema>;
export const ReconciliationReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: ReconciliationIdentitySchema,
    entries: z.array(ReconciliationEntrySchema),
    canonicalLinesAbsentFromSchedule: z.array(z.string()),
    generationEligible: z.literal(false),
  })
  .strict();
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareStrings(a, b))
        .map(([key, item]) => [key, normalized(item)]),
    );
  return value;
}
function fingerprint(value: unknown) {
  return hashBytes(Buffer.from(JSON.stringify(normalized(value))));
}
function entry(
  kind: ReconciliationEntry['kind'],
  providerId: string,
  record: unknown,
  candidates: ReconciliationTarget[],
  reason: string,
): ReconciliationEntry {
  const unique = [
    ...new Map(
      candidates.map((target) => [JSON.stringify(normalized(target)), target]),
    ).values(),
  ].sort((a, b) =>
    compareStrings(
      JSON.stringify(normalized(a)),
      JSON.stringify(normalized(b)),
    ),
  );
  return {
    kind,
    providerId,
    sourceRecordSha256: fingerprint(record),
    status:
      unique.length === 1
        ? 'proposed'
        : unique.length
          ? 'ambiguous'
          : 'unresolved',
    candidates: unique,
    reason,
  };
}
const routeLines: Record<string, string> = {
  NSL: 'NSL',
  EWL: 'EWL',
  NEL: 'NEL',
  CCL: 'CCL',
  DTL: 'DTL',
  TEL: 'TEL',
  BP: 'BPLRT',
  SK: 'SKLRT',
  PG: 'PGLRT',
};

/** Read-only proposals. A unique candidate is never a reviewed mapping. */
export function proposeScheduleReconciliation(
  tables: ScheduleTables,
  identity: ReconciliationIdentity,
  topology: Topology,
): ReconciliationReport {
  ReconciliationIdentitySchema.parse(identity);
  if (
    identity.topology.sha256 !==
    hashBytes(Buffer.from(JSON.stringify(topology)))
  )
    throw new Error('Topology fingerprint does not match reconciliation input');
  const audit = auditSchedule(tables);
  if (audit.structuralErrors.length)
    throw new Error('Structurally invalid schedule cannot be reconciled');
  const entries: ReconciliationEntry[] = [];
  const lineIds = new Set(topology.lines.map(({ id }) => id));
  const operatorIds = new Set(topology.operators.map(({ id }) => id));
  for (const row of audit.agencies) {
    const id = row.agency_id ?? '';
    const canonical = (
      { SMRT: 'SMRT_TRAINS', SBST: 'SBS' } as Record<string, string>
    )[id];
    entries.push(
      entry(
        'agency',
        id,
        row,
        canonical && operatorIds.has(canonical)
          ? [{ kind: 'operator', id: canonical }]
          : [],
        'Explicit provider agency alias; publisher-only agencies require a reviewed disposition.',
      ),
    );
  }
  const routeMap = new Map<string, string>();
  for (const row of audit.routes) {
    const id = row.route_id ?? '';
    const line = routeLines[id.split('_')[0] ?? ''];
    if (line && lineIds.has(line)) routeMap.set(id, line);
    entries.push(
      entry(
        'route',
        id,
        row,
        line && lineIds.has(line) ? [{ kind: 'line', id: line }] : [],
        'Explicit route-family alias; not a service or direction mapping.',
      ),
    );
  }
  const stops = new Map(
    (tables['stops.txt'] ?? []).map((row) => [row.stop_id ?? '', row]),
  );
  const referenced = new Set(
    (tables['stop_times.txt'] ?? []).map((row) => row.stop_id ?? ''),
  );
  for (const id of [...referenced]) {
    let parent = stops.get(id)?.parent_station;
    const visited = new Set([id]);
    while (parent && !visited.has(parent)) {
      referenced.add(parent);
      visited.add(parent);
      parent = stops.get(parent)?.parent_station;
    }
  }
  const stopStations = new Map<string, string[]>();
  for (const id of [...referenced].sort()) {
    const row = stops.get(id);
    if (!row) continue; // Structural validation rejects missing references.
    const parent = row.parent_station
      ? stops.get(row.parent_station)
      : undefined;
    const stations = resolveStationCandidates(
      row,
      parent,
      topology.stations,
    ).map(({ station }) => station);
    stopStations.set(
      id,
      stations.map((station) => station.id),
    );
    const stationOnly = row.location_type === '1';
    const candidates: ReconciliationTarget[] = stationOnly
      ? stations.map(({ id: stationId }) => ({
          kind: 'station',
          id: stationId,
        }))
      : stations.flatMap((station) => {
          const labels = (row.platform_code ?? '')
            .split('/')
            .map((label) => label.trim())
            .filter(Boolean);
          const lines = station.stationCodes
            .filter((code) => code.code === row.stop_code)
            .map((code) => code.lineId);
          return station.platforms
            .filter(
              (platform) =>
                labels.includes(platform.label) &&
                lines.includes(platform.lineId),
            )
            .map((platform) => ({
              kind: 'platform' as const,
              id: platform.id,
              stationId: station.id,
            }));
        });
    entries.push(
      entry(
        'stop',
        id,
        row,
        candidates,
        stationOnly
          ? 'Station code with parent consistency; effective dates require review.'
          : 'Parent/code-consistent station and explicit platform label/line; grouped labels remain ambiguous.',
      ),
    );
  }
  for (const pattern of audit.patterns) {
    const line = routeMap.get(pattern.routeId);
    const stationIds = pattern.stopIds.map((id) => stopStations.get(id) ?? []);
    const unique = stationIds.every((ids) => ids.length === 1);
    const sequence = stationIds.map((ids) => ids[0]);
    const candidates: ReconciliationTarget[] = [];
    if (unique)
      for (const service of topology.services.filter(
        (service) => service.lineId === line,
      ))
        for (const revision of service.revisions) {
          const path = revision.stations.map(({ stationId }) => stationId);
          const matches = path.some(
            (_, start) =>
              start + sequence.length <= path.length &&
              sequence.every((id, offset) => id === path[start + offset]),
          );
          // Only an explicitly closed canonical path permits rotation. Preserve
          // repeated occurrences and permit at most the canonical single circuit.
          const cyclic =
            !matches &&
            path.length > 2 &&
            path[0] === path.at(-1) &&
            sequence.length <= path.length &&
            path
              .slice(0, -1)
              .some((_, start) =>
                sequence.every(
                  (id, offset) =>
                    id === path[(start + offset) % (path.length - 1)],
                ),
              );
          if (matches || cyclic)
            candidates.push({
              kind: 'serviceRevision',
              id: service.id,
              revisionId: revision.id,
              match: cyclic
                ? 'cyclicSegment'
                : sequence.length === path.length
                  ? 'exact'
                  : 'contiguousSegment',
            });
        }
    entries.push(
      entry(
        'pattern',
        pattern.id,
        pattern,
        candidates,
        'Ordered station sequence including repeated stops; exact, contiguous or single-circuit cyclic service-revision path. Calendar/revision validity, direction and platform service scope require review.',
      ),
    );
  }
  return ReconciliationReportSchema.parse({
    schemaVersion: 1,
    identity: {
      ...identity,
      sourceManifest: Object.fromEntries(
        Object.entries(identity.sourceManifest).sort(([a], [b]) =>
          compareStrings(a, b),
        ),
      ),
    },
    entries: entries.sort((a, b) =>
      compareStrings(`${a.kind}:${a.providerId}`, `${b.kind}:${b.providerId}`),
    ),
    canonicalLinesAbsentFromSchedule: [...lineIds]
      .filter((id) => ![...routeMap.values()].includes(id))
      .sort(),
    generationEligible: false,
  });
}

export const ReconciliationReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: ReconciliationIdentitySchema,
    decisions: z.array(
      z
        .object({
          kind: ReconciliationEntrySchema.shape.kind,
          providerId: z.string().min(1),
          sourceRecordSha256: digest,
          disposition: z.enum(['matched', 'ignored']),
          target: targetSchema.optional(),
          reviewer: z.string().min(1),
          reason: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

/** A review gate, not an arrivals generator. Only reported targets can be approved. */
export function checkReconciliationReview(
  report: ReconciliationReport,
  input: unknown,
) {
  ReconciliationReportSchema.parse(report);
  const review = ReconciliationReviewSchema.parse(input);
  const errors: string[] = [];
  if (fingerprint(review.identity) !== fingerprint(report.identity))
    errors.push('Review input identity differs from report');
  const keys = new Set<string>();
  for (const decision of review.decisions) {
    const key = `${decision.kind}:${decision.providerId}`;
    if (keys.has(key)) errors.push(`Duplicate review: ${key}`);
    keys.add(key);
    const source = report.entries.find(
      (entry) =>
        entry.kind === decision.kind &&
        entry.providerId === decision.providerId,
    );
    if (!source || source.sourceRecordSha256 !== decision.sourceRecordSha256)
      errors.push(`Unknown or changed record: ${key}`);
    if (
      decision.disposition === 'matched' &&
      (!decision.target ||
        !source?.candidates.some(
          (candidate) =>
            fingerprint(candidate) === fingerprint(decision.target),
        ))
    )
      errors.push(`Unrecognized match target: ${key}`);
    if (decision.disposition === 'ignored' && decision.target)
      errors.push(`Ignored record has match target: ${key}`);
  }
  for (const source of report.entries)
    if (!keys.has(`${source.kind}:${source.providerId}`))
      errors.push(`Missing review: ${source.kind}:${source.providerId}`);
  return { generationEligible: errors.length === 0, errors: errors.sort() };
}
