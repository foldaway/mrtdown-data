import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IssueModel } from '../../model/IssueModel';
import { StationModel } from '../../model/StationModel';
import type { IssueReference } from '../../schema/Overview';
import type { StationManifest } from '../../schema/StationManifest';
import { DateTime } from 'luxon';

export function buildStationManifests() {
  const issues = IssueModel.getAll();
  issues.sort((a, b) => {
    const startAtA = DateTime.fromISO(a.startAt).setZone('Asia/Singapore');
    const startAtB = DateTime.fromISO(b.startAt).setZone('Asia/Singapore');
    const diffSeconds = startAtA.diff(startAtB).as('seconds');

    if (diffSeconds < 0) {
      return 1;
    }
    if (diffSeconds > 0) {
      return -1;
    }
    return 0;
  });

  const issuesByStation: Record<string, IssueReference[]> = {};
  for (const issue of issues) {
    const stationCodes = new Set<string>();
    for (const segment of issue.stationIdsAffected) {
      for (const stationId of segment.stationIds) {
        stationCodes.add(stationId);
      }
    }

    for (const stationCode of stationCodes) {
      const stationIssues = issuesByStation[stationCode] ?? [];
      const { updates, ...otherProps } = issue;
      stationIssues.push(otherProps);
      issuesByStation[stationCode] = stationIssues;
    }
  }

  const stations = StationModel.getAll();
  for (const station of stations) {
    const filePath = join(
      import.meta.dirname,
      `../../../data/product/station_${station.id}.json`,
    );

    const manifest: StationManifest = {
      station,
      issueRefs: issuesByStation[station.id] ?? [],
    };

    writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  }
}
