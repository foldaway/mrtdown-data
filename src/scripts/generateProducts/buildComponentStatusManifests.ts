import { ComponentModel } from '../../model/ComponentModel.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StationModel } from '../../model/StationModel.js';
import type { Station } from '../../schema/Station.js';
import type { Component } from '../../schema/Component.js';
import { IssueModel } from '../../model/IssueModel.js';
import { DateTime } from 'luxon';
import type { ComponentStatusManifest } from '../../schema/ComponentStatusManifest.js';
import { isOngoingIssue } from '../../helpers/isOngoingIssue.js';
import type { Issue, IssueType } from '../../schema/Issue.js';
import { computeDateSummaries } from '../../helpers/computeDateSummaries.js';
import { assert } from '../../util/assert.js';
import type { IssueReference } from '../../schema/Overview.js';

export function buildComponentStatusManifests() {
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

  const issuesByComponent: Record<string, Issue[]> = {};
  for (const issue of issues) {
    for (const componentId of issue.componentIdsAffected) {
      const componentIssues = issuesByComponent[componentId] ?? [];
      componentIssues.push(issue);
      issuesByComponent[componentId] = componentIssues;
    }
  }

  const lastUpdatedAt = DateTime.now().setZone('Asia/Singapore').toISO();
  assert(lastUpdatedAt != null);

  for (const component of components) {
    const filePath = join(
      import.meta.dirname,
      `../../../data/product/component_status_${component.id}.json`,
    );

    const stationCodes = new Set<string>();
    for (const branch of Object.values(component.branches)) {
      for (const stationCode of branch.stationCodes) {
        stationCodes.add(stationCode);
      }
    }

    const componentIssues = issuesByComponent[component.id] ?? [];
    const issuesRecent: IssueReference[] = componentIssues
      .slice(0, 5)
      .map((issue) => {
        const { updates, ...otherProps } = issue;
        return otherProps;
      });

    const issueCountByType: Record<IssueType, number> = {
      disruption: 0,
      maintenance: 0,
      infra: 0,
    };
    let lastMajorDisruption: IssueReference | null = null;

    for (const issue of componentIssues) {
      let count = issueCountByType[issue.type] ?? 0;
      count++;
      issueCountByType[issue.type] = count;

      if (issue.type === 'disruption' && lastMajorDisruption == null) {
        const { updates, ...otherProps } = issue;
        lastMajorDisruption = otherProps;
      }
    }

    const manifest: ComponentStatusManifest = {
      componentId: component.id,
      componentsById,
      stationsByCode: Object.fromEntries(
        Object.entries(stationsByCode).filter(([code]) =>
          stationCodes.has(code),
        ),
      ),
      issuesOngoingSnapshot: componentIssues.filter((issue) =>
        isOngoingIssue(issue),
      ),
      dates: computeDateSummaries(
        componentIssues.filter((issue) => !isOngoingIssue(issue)),
      ),
      issuesRecent,
      lastUpdatedAt,
      issueCountByType,
      lastMajorDisruption,
    };

    writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  }
}
