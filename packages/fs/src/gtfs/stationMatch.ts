import type { CsvRow } from './schedule.js';
import type { scheduleTopologyProjection } from './topology.js';

type Station = ReturnType<
  typeof scheduleTopologyProjection
>['stations'][number];

/** Resolve station identity independently of physical platform allocation. */
export function resolveStationCandidates(
  row: CsvRow,
  parent: CsvRow | undefined,
  stations: readonly Station[],
) {
  const byCode = (code: string) =>
    stations.filter((station) =>
      station.stationCodes.some((item) => item.code === code),
    );
  const directCode = row.stop_code || row.stop_id || '';
  const parentCode = parent?.stop_code || parent?.stop_id || '';
  const direct = byCode(directCode);
  const parents = parent ? byCode(parentCode) : [];
  const matches = direct.length
    ? direct.filter(
        (station) =>
          !parent || parents.some((candidate) => candidate.id === station.id),
      )
    : parents;
  return matches.map((station) => ({
    station,
    supportingCode: direct.length ? directCode : parentCode,
  }));
}
