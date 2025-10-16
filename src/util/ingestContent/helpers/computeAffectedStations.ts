import { z } from 'zod';
import {
  type ComponentId,
  ComponentIdSchema,
} from '../../../schema/Component.js';
import { assert } from '../../assert.js';
import { DateTime } from 'luxon';
import type { IssueStationEntry } from '../../../schema/Issue.js';
import { stationGetAllQuery } from '../queries/stationGetAll.js';
import { lineGetAllQuery } from '../queries/lineGetAll.js';
import { lineGetQuery } from '../queries/lineGet.js';
import { findStationByCode } from '../util/findStationByCode.js';

type StationRow = Awaited<ReturnType<typeof stationGetAllQuery>>[number];

export const LineSectionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('station_range'),
      stationNames: z.object({
        first: z.string(),
        last: z.string(),
      }),
      lineIdHint: ComponentIdSchema.nullable().describe(
        'Specify the line ID as a hint if confident.',
      ),
    }),
    z.object({
      type: z.literal('entire_line_branch'),
      lineId: ComponentIdSchema,
      branchId: z.string(),
    }),
    z
      .object({
        type: z.literal('entire_line'),
        lineId: ComponentIdSchema,
      })
      .meta({
        description:
          'Specify the entire line if the affected section covers the whole line.',
      }),
  ])
  .describe('Affected section of rail line');
export type LineSection = z.infer<typeof LineSectionSchema>;

function getStationCodes(station: StationRow): Set<string> {
  const result = new Set<string>();
  for (const membership of station.component_memberships) {
    result.add(membership.code);
  }
  return result;
}

interface FindLineAndBranchResult {
  lineId: string;
  branchId: string;
  sectionStationCodes: string[];
}

async function findLineAndBranch(
  stationFirst: StationRow,
  stationLast: StationRow,
  lineIdHint: ComponentId | null,
): Promise<FindLineAndBranchResult | null> {
  const stationCodesFirst = getStationCodes(stationFirst);
  const stationCodesLast = getStationCodes(stationLast);
  const results: FindLineAndBranchResult[] = [];

  const lineRows = await lineGetAllQuery();

  for (const lineRow of lineRows) {
    const stationCodesByBranchIdMap = new Map<string, string[]>();

    for (const [
      index,
      branchMembership,
    ] of lineRow.branch_memberships.entries()) {
      if (branchMembership.started_at == null) {
        continue;
      }
      if (
        branchMembership.ended_at != null &&
        DateTime.fromISO(branchMembership.ended_at).diffNow().as('days') < 0
      ) {
        continue;
      }

      const branchStationCodes =
        stationCodesByBranchIdMap.get(branchMembership.branch_id) ?? [];
      branchStationCodes.push(branchMembership.code);
      stationCodesByBranchIdMap.set(
        branchMembership.branch_id,
        branchStationCodes,
      );
    }

    for (const [
      branchId,
      stationCodes,
    ] of stationCodesByBranchIdMap.entries()) {
      const stationCodesSet = new Set(stationCodes);
      const intersectionFirst = stationCodesSet.intersection(stationCodesFirst);
      const intersectionLast = stationCodesSet.intersection(stationCodesLast);
      if (intersectionFirst.size === 1 && intersectionLast.size === 1) {
        const stationCodeFirst = Array.from(intersectionFirst)[0];
        const stationCodeLast = Array.from(intersectionLast)[0];

        const indexFirst = stationCodes.indexOf(stationCodeFirst);
        const indexLast = stationCodes.indexOf(stationCodeLast);

        results.push({
          lineId: lineRow.component_id,
          branchId,
          sectionStationCodes: stationCodes.slice(
            Math.min(indexFirst, indexLast),
            Math.max(indexFirst, indexLast) + 1,
          ),
        });
      }
    }
  }

  if (lineIdHint != null) {
    results.sort((a, b) => {
      if (a.lineId === lineIdHint && b.lineId !== lineIdHint) {
        return -1;
      }
      if (a.lineId !== lineIdHint && b.lineId === lineIdHint) {
        return 1;
      }
      return 0;
    });
  }

  return results[0] ?? null;
}

export async function computeAffectedStations(
  lineSections: LineSection[],
  startAt: string,
): Promise<IssueStationEntry[]> {
  const startAtDateTime = DateTime.fromISO(startAt);
  assert(startAtDateTime.isValid);

  console.log('[computeAffectedStations]', lineSections);

  const stationRows = await stationGetAllQuery();

  const results: IssueStationEntry[] = [];

  for (const lineSection of lineSections) {
    switch (lineSection.type) {
      case 'station_range': {
        const { stationNames, lineIdHint: componentIdHint } = lineSection;
        const { first, last } = stationNames;

        const stationRowFirst = stationRows.find(
          (s) => s.name.toLowerCase() === first.toLowerCase(),
        );
        if (stationRowFirst == null) {
          console.warn(`Could not find "${first}" station`);
          continue;
        }
        const stationRowLast = stationRows.find(
          (s) => s.name.toLowerCase() === last.toLowerCase(),
        );
        if (stationRowLast == null) {
          console.warn(`Could not find "${last}" station`);
          continue;
        }

        const result = await findLineAndBranch(
          stationRowFirst,
          stationRowLast,
          componentIdHint,
        );

        if (result == null) {
          continue;
        }

        const stationIds = new Set<string>();

        for (const stationCode of result.sectionStationCodes) {
          const station = findStationByCode(
            stationRows,
            startAtDateTime,
            result.lineId,
            stationCode,
          );

          if (station != null) {
            stationIds.add(station.id);
          }
        }

        if (stationIds.size > 0) {
          results.push({
            componentId: result.lineId,
            branchName: result.branchId,
            stationIds: Array.from(stationIds),
          });
        }
        break;
      }
      case 'entire_line': {
        const { lineId } = lineSection;
        const lines = await lineGetQuery(lineId);
        assert(lines.length === 1, `Expected one result for lineId=${lineId}`);
        const [line] = lines;

        const stationIdsByBranchId = new Map<string, string[]>();

        for (const branchMembership of line.branch_memberships) {
          const branchStationIds =
            stationIdsByBranchId.get(branchMembership.branch_id) ?? [];
          branchStationIds.push(branchMembership.station_id);
          stationIdsByBranchId.set(
            branchMembership.branch_id,
            branchStationIds,
          );
        }

        for (const [branchId, stationIds] of stationIdsByBranchId.entries()) {
          results.push({
            componentId: line.component_id,
            branchName: branchId,
            stationIds,
          });
        }

        break;
      }
      case 'entire_line_branch': {
        const { lineId, branchId } = lineSection;
        const lines = await lineGetQuery(lineId);
        assert(lines.length === 1, `Expected one result for lineId=${lineId}`);
        const [line] = lines;
        const branchMemberships = line.branch_memberships.filter(
          (branchMembership) => branchMembership.branch_id === branchId,
        );
        assert(
          branchMemberships.length > 0,
          `Could not find branch "${branchId}" in component "${line.component_id}"`,
        );

        const stationCodes = branchMemberships.map(
          (branchMembership) => branchMembership.code,
        );

        const stationIds = new Set<string>();

        for (const stationCode of stationCodes) {
          const station = findStationByCode(
            stationRows,
            startAtDateTime,
            line.component_id,
            stationCode,
          );

          if (station != null) {
            stationIds.add(station.id);
          }
        }

        if (stationIds.size > 0) {
          results.push({
            componentId: line.component_id,
            branchName: branchId,
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
