import { listEntities } from '../entities.js';
import { hashBytes, readVerifiedCapture } from './capture.js';
import { proposeScheduleReconciliation } from './reconciliation.js';
import { readSchedule } from './schedule.js';
import { scheduleTopologyProjection } from './topology.js';

/** The caller must supply the exact commit containing the canonical data tree. */
export async function reconcileGtfsCapture(
  file: string,
  handoff: string,
  dataDir: string,
  canonicalCommit: string,
) {
  const { capture, bytes } = await readVerifiedCapture(file, handoff);
  if (capture.feed_kind !== 'schedule')
    throw new Error('Reconciliation requires a schedule capture');
  const { tables, manifest } = readSchedule(bytes);
  const [operators, lines, stations, services] = await Promise.all([
    listEntities(dataDir, 'operator'),
    listEntities(dataDir, 'line'),
    listEntities(dataDir, 'station'),
    listEntities(dataDir, 'service'),
  ]);
  if (
    !operators.length ||
    !lines.length ||
    !stations.length ||
    !services.length
  )
    throw new Error(
      'Canonical topology requires operators, lines, stations and services',
    );
  const topology = scheduleTopologyProjection({
    operators: operators.map(({ value }) => value),
    lines: lines.map(({ value }) => value),
    stations: stations.map(({ value }) => value),
    services: services.map(({ value }) => value),
  });
  return proposeScheduleReconciliation(
    tables,
    {
      sourceManifest: manifest,
      canonicalCommit,
      topology: {
        projectionVersion: 1,
        sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
      },
    },
    topology,
  );
}
