import { z } from 'zod';
import { ComponentModel } from '../model/ComponentModel';
import { StationModel } from '../model/StationModel';
import {
  type ComponentId,
  ComponentIdSchema,
  type Component,
} from '../schema/Component';
import type { Station } from '../schema/Station';
import { assert } from '../util/assert';
import { DateTime } from 'luxon';

export const LineSectionSchema = z
  .object({
    stationNames: z.object({
      first: z.string(),
      last: z.string(),
    }),
    componentIdHint: ComponentIdSchema.nullable().describe(
      'Specify the component ID as a hint if confident.',
    ),
  })
  .describe('Affected section of rail line');
export type LineSection = z.infer<typeof LineSectionSchema>;

function getStationCodes(station: Station): Set<string> {
  const result = new Set<string>();
  for (const members of Object.values(station.componentMembers)) {
    for (const member of members) {
      result.add(member.code);
    }
  }
  return result;
}

interface FindComponentAndBranchResult {
  component: Component;
  branchName: string;
  sectionStationCodes: string[];
}

function findComponentAndBranch(
  stationFirst: Station,
  stationLast: Station,
  componentIdHint: ComponentId | null,
): FindComponentAndBranchResult | null {
  const stationCodesFirst = getStationCodes(stationFirst);
  const stationCodesLast = getStationCodes(stationLast);
  const results: FindComponentAndBranchResult[] = [];

  const components = ComponentModel.getAll();
  for (const component of components) {
    for (const [branchName, branchStationCodes] of Object.entries(
      component.branches,
    )) {
      const branchStationCodesSet = new Set(branchStationCodes);
      const intersectionFirst =
        branchStationCodesSet.intersection(stationCodesFirst);
      const intersectionLast =
        branchStationCodesSet.intersection(stationCodesLast);
      if (intersectionFirst.size === 1 && intersectionLast.size === 1) {
        const stationCodeFirst = Array.from(intersectionFirst)[0];
        const stationCodeLast = Array.from(intersectionLast)[0];

        const indexFirst = branchStationCodes.indexOf(stationCodeFirst);
        const indexLast = branchStationCodes.indexOf(stationCodeLast);

        results.push({
          component,
          branchName,
          sectionStationCodes: branchStationCodes.slice(
            Math.min(indexFirst, indexLast),
            Math.max(indexFirst, indexLast) + 1,
          ),
        });
      }
    }
  }

  if (componentIdHint != null) {
    results.sort((a, b) => {
      if (
        a.component.id === componentIdHint &&
        b.component.id !== componentIdHint
      ) {
        return -1;
      }
      if (
        a.component.id !== componentIdHint &&
        b.component.id === componentIdHint
      ) {
        return 1;
      }
      return 0;
    });
  }

  return results[0] ?? null;
}

export function computeAffectedStations(
  lineSections: LineSection[],
  startAt: string,
): string[] {
  const startAtDateTime = DateTime.fromISO(startAt);
  assert(startAtDateTime.isValid);

  console.log('[computeAffectedStations]', lineSections);
  const stationIds = new Set<string>();

  for (const lineSection of lineSections) {
    const { stationNames, componentIdHint } = lineSection;
    const { first, last } = stationNames;

    const stations = StationModel.getAll();
    const stationFirst = stations.find(
      (s) => s.name.toLowerCase() === first.toLowerCase(),
    );
    if (stationFirst == null) {
      console.warn(`Could not find "${first}" station`);
      continue;
    }
    const stationLast = stations.find(
      (s) => s.name.toLowerCase() === last.toLowerCase(),
    );
    if (stationLast == null) {
      console.warn(`Could not find "${first}" station`);
      continue;
    }

    const result = findComponentAndBranch(
      stationFirst,
      stationLast,
      componentIdHint,
    );

    if (result == null) {
      return [];
    }

    for (const stationCode of result.sectionStationCodes) {
      const station = stations.find((s) => {
        const componentMembers = s.componentMembers[result.component.id];
        if (componentMembers == null) {
          return false;
        }
        for (const componentMember of componentMembers) {
          const componentMemberStartAtDateTime = DateTime.fromISO(
            componentMember.startedAt,
          );
          assert(componentMemberStartAtDateTime.isValid);
          if (componentMemberStartAtDateTime > startAtDateTime) {
            return false;
          }
          if (componentMember.code === stationCode) {
            return true;
          }
        }
        return false;
      });

      if (station != null) {
        stationIds.add(station.id);
      }
    }
  }

  console.log('[computeAffectedStations]', stationIds);
  return Array.from(stationIds);
}
