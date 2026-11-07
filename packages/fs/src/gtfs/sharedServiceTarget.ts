import z from 'zod';
import type { ReconciliationTarget } from './reconciliation.js';
import type { ScopedReviewContext } from './scopedReviewContract.js';
import { matchServicePath } from './servicePath.js';
import { resolveStationCandidates } from './stationMatch.js';

export const SharedServiceTargetSchema = z
  .object({
    kind: z.literal('sharedServiceRevisions'),
    members: z
      .array(
        z
          .object({
            kind: z.literal('serviceRevision'),
            id: z.string().min(1),
            revisionId: z.string().min(1),
            match: z.enum(['exact', 'contiguousSegment', 'cyclicSegment']),
          })
          .strict(),
      )
      .min(2)
      .refine(
        (members) =>
          new Set(members.map((member) => member.id)).size === members.length,
        'Shared memberships must name distinct services',
      )
      .transform((members) =>
        [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      ),
  })
  .strict();

/** All memberships must describe the same complete occurrences, including their display codes. */
export function validateSharedServiceSegment(
  context: ScopedReviewContext,
  stopIds: readonly string[],
  members: readonly ReconciliationTarget[],
) {
  const stops = new Map(
    context.tables['stops.txt'].map((stop) => [stop.stop_id, stop]),
  );
  const sequence = stopIds.map((id) => {
    const row = stops.get(id);
    if (!row) throw new Error(`Missing source stop: ${id}`);
    const matches = resolveStationCandidates(
      row,
      stops.get(row.parent_station),
      context.topology.stations,
    );
    if (matches.length !== 1)
      throw new Error(`Shared service station is not unique: ${id}`);
    return matches[0].station.id;
  });
  let common: string | undefined;
  let lineId: string | undefined;
  for (const member of members) {
    const service = context.topology.services.find(
      (service) => service.id === member.id,
    );
    const revision = service?.revisions.find(
      (revision) => revision.id === member.revisionId,
    );
    if (!service || !revision)
      throw new Error('Unknown shared service revision');
    if (lineId !== undefined && lineId !== service.lineId)
      throw new Error('Shared services must belong to the same line');
    lineId = service.lineId;
    const path = matchServicePath(revision.stations, sequence);
    if (path?.segments.length !== 1 || path.match !== member.match)
      throw new Error(
        'Shared service requires one complete matching alignment',
      );
    const segment = path.segments[0];
    if (
      segment.some(
        (stop, index) =>
          stop.displayCode !== stops.get(stopIds[index])?.stop_code,
      )
    )
      throw new Error(
        'Shared service alignment differs from literal source codes',
      );
    const identity = JSON.stringify(segment);
    if (common !== undefined && common !== identity)
      throw new Error(
        'Shared services disagree on the complete station/code segment',
      );
    common = identity;
  }
}
