import { ComponentModel } from '../../model/ComponentModel';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentManifest } from '../../schema/ComponentManifest';
import { StationModel } from '../../model/StationModel';
import type { Station } from '../../schema/Station';
import type { Component } from '../../schema/Component';
import { IssueModel } from '../../model/IssueModel';
import { DateTime } from 'luxon';
import type { IssueReference } from '../../schema/Overview';

export function buildComponentManifests() {
  const components = ComponentModel.getAll();

  const componentsById: Record<string, Component> = {};
  for (const component of components) {
    componentsById[component.id] = component;
  }

  const stations = StationModel.getAll();

  const stationsByCode: Record<string, Station> = {};
  for (const station of stations) {
    for (const componentMemberEntries of Object.values(
      station.componentMembers,
    )) {
      for (const entry of componentMemberEntries) {
        stationsByCode[entry.code] = station;
      }
    }
  }

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

  const issuesByComponent: Record<string, IssueReference[]> = {};
  for (const issue of issues) {
    for (const componentId of issue.componentIdsAffected) {
      const componentIssues = issuesByComponent[componentId] ?? [];
      const { updates, ...otherProps } = issue;
      componentIssues.push(otherProps);
      issuesByComponent[componentId] = componentIssues;
    }
  }

  for (const component of components) {
    const filePath = join(
      import.meta.dirname,
      `../../../data/product/component_${component.id}.json`,
    );

    const stationCodes = new Set<string>();
    for (const branch of Object.values(component.branches)) {
      for (const stationCode of branch.stationCodes) {
        stationCodes.add(stationCode);
      }
    }

    const manifest: ComponentManifest = {
      componentId: component.id,
      componentsById,
      stationsByCode: Object.fromEntries(
        Object.entries(stationsByCode).filter(([code]) =>
          stationCodes.has(code),
        ),
      ),
      issueRefs: issuesByComponent[component.id] ?? [],
    };

    writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  }
}
