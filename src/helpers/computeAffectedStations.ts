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
import type { IssueStationEntry } from '../schema/Issue';

export const LineSectionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('station_range'),
      stationNames: z.object({
        first: z.string(),
        last: z.string(),
      }),
      componentIdHint: ComponentIdSchema.nullable().describe(
        'Specify the component ID as a hint if confident.',
      ),
    }),
    z.object({
      type: z.literal('entire_line'),
      componentId: ComponentIdSchema,
      branchCode: z.string(),
    }),
  ])
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
    for (const [branchName, branch] of Object.entries(component.branches)) {
      const branchStationCodesSet = new Set(branch.stationCodes);
      const intersectionFirst =
        branchStationCodesSet.intersection(stationCodesFirst);
      const intersectionLast =
        branchStationCodesSet.intersection(stationCodesLast);
      if (intersectionFirst.size === 1 && intersectionLast.size === 1) {
        const stationCodeFirst = Array.from(intersectionFirst)[0];
        const stationCodeLast = Array.from(intersectionLast)[0];

        const indexFirst = branch.stationCodes.indexOf(stationCodeFirst);
        const indexLast = branch.stationCodes.indexOf(stationCodeLast);

        results.push({
          component,
          branchName,
          sectionStationCodes: branch.stationCodes.slice(
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
): IssueStationEntry[] {
  const startAtDateTime = DateTime.fromISO(startAt);
  assert(startAtDateTime.isValid);

  console.log('[computeAffectedStations]', lineSections);
  const stations = StationModel.getAll();

  const results: IssueStationEntry[] = [];

  for (const lineSection of lineSections) {
    switch (lineSection.type) {
      case 'station_range': {
        const { stationNames, componentIdHint } = lineSection;
        const { first, last } = stationNames;

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
          console.warn(`Could not find "${last}" station`);
          continue;
        }

        const result = findComponentAndBranch(
          stationFirst,
          stationLast,
          componentIdHint,
        );

        if (result == null) {
          continue;
        }

        const stationIds = new Set<string>();

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

        if (stationIds.size > 0) {
          results.push({
            componentId: result.component.id,
            branchName: result.branchName,
            stationIds: Array.from(stationIds),
          });
        }
        break;
      }
      case 'entire_line': {
        const { componentId, branchCode } = lineSection;
        const component = ComponentModel.getOne(componentId);
        assert(
          branchCode in component.branches,
          `Could not find branch "${branchCode}" in component "${component.id}"`,
        );
        const branch = component.branches[branchCode];

        const stationIds = new Set<string>();

        for (const stationCode of branch.stationCodes) {
          const station = stations.find((s) => {
            const componentMembers = s.componentMembers[component.id];
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

        if (stationIds.size > 0) {
          results.push({
            componentId,
            branchName: branchCode,
            stationIds: Array.from(stationIds),
          });
        }

        break;
      }
    }
  }

  function isSubsetOfAnotherEntry(index: number) {
    const entry = results[index];
    const stationIdsSet = new Set(entry.stationIds);

    for (let j = results.length - 1; j >= 0; j--) {
      if (index === j) {
        continue;
      }
      const otherEntry = results[j];
      const otherStationIdsSet = new Set(otherEntry.stationIds);
      if (stationIdsSet.isSubsetOf(otherStationIdsSet)) {
        return true;
      }
    }
    return false;
  }

  // De-duplicate subsets
  for (let i = results.length - 1; i >= 0; i--) {
    const shouldDelete = isSubsetOfAnotherEntry(i);

    if (shouldDelete) {
      results.splice(i, 1);
    }
  }

  console.log('[computeAffectedStations]', results);
  return results;
}
