import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IssueModel } from '../../model/IssueModel.js';
import { StationModel } from '../../model/StationModel.js';
import type { IssueReference } from '../../schema/Overview.js';
import type { StationManifest } from '../../schema/StationManifest.js';
import { DateTime } from 'luxon';
import type { Component } from '../../schema/Component.js';
import { ComponentModel } from '../../model/ComponentModel.js';

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

  const components = ComponentModel.getAll();

  const stations = StationModel.getAll();
  for (const station of stations) {
    const filePath = join(
      import.meta.dirname,
      `../../../data/product/station_${station.id}.json`,
    );

    const componentsById: Record<string, Component> = {};
    for (const component of components) {
      if (!(component.id in station.componentMembers)) {
        continue;
      }
      componentsById[component.id] = component;
    }

    const manifest: StationManifest = {
      station,
      issueRefs: issuesByStation[station.id] ?? [],
      componentsById,
    };

    writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  }
}
