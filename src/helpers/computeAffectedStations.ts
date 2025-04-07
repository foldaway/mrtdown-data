import { z } from 'zod';
import { ComponentIdSchema } from '../schema/Component';
import { ComponentModel } from '../model/ComponentModel';
import { StationModel } from '../model/StationModel';
import { assert } from '../util/assert';

export const LineSectionSchema = z
  .object({
    stationNames: z.object({
      first: z.string(),
      last: z.string(),
    }),
    componentId: ComponentIdSchema,
  })
  .describe('Affected section of rail line');
export type LineSection = z.infer<typeof LineSectionSchema>;

export function computeAffectedStations(lineSections: LineSection[]): string[] {
  console.log('[computeAffectedStations]', lineSections);
  const stationIds: string[] = [];

  for (const lineSection of lineSections) {
    const { componentId, stationNames } = lineSection;
    const { first, last } = stationNames;

    const component = ComponentModel.getOne(componentId);
    const stations = StationModel.getAll();
    const stationFirst = stations.find((s) => s.name === first);
    assert(stationFirst != null);
    const stationLast = stations.find((s) => s.name === last);
    assert(stationLast != null);

    let sectionStationCodes: string[] = [];
    for (const stationCodes of Object.values(component.branches)) {
      let stationFirstIndexWithinBranch = -1;
      let stationLastIndexWithinBranch = -1;

      for (const [index, stationCode] of stationCodes.entries()) {
        if (
          stationFirst.componentMembers[componentId]?.some(
            (member) => member.code === stationCode,
          )
        ) {
          stationFirstIndexWithinBranch = index;
        }
        if (
          stationLast.componentMembers[componentId]?.some(
            (member) => member.code === stationCode,
          )
        ) {
          stationLastIndexWithinBranch = index;
        }
      }

      if (
        stationFirstIndexWithinBranch !== -1 &&
        stationLastIndexWithinBranch !== -1
      ) {
        sectionStationCodes = stationCodes.slice(
          Math.min(stationFirstIndexWithinBranch, stationLastIndexWithinBranch),
          Math.max(
            stationFirstIndexWithinBranch,
            stationLastIndexWithinBranch,
          ) + 1,
        );
        break;
      }
    }

    for (const stationCode of sectionStationCodes) {
      const station = stations.find((s) => {
        const componentMembers = s.componentMembers[componentId];
        if (componentMembers == null) {
          return false;
        }
        return componentMembers.some((member) => member.code === stationCode);
      });

      if (station != null) {
        stationIds.push(station.id);
      }
    }
  }

  return stationIds;
}
