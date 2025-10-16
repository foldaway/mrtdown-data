import { DateTime } from 'luxon';
import type { stationGetAllQuery } from '../queries/stationGetAll.js';

type StationRow = Awaited<ReturnType<typeof stationGetAllQuery>>[number];

/**
 * Find a station by its code on a specific line, considering the current date and time.
 *
 * @param stationRows - Array of station rows to search through.
 * @param currentDateTime - The current date and time to consider for membership validity.
 * @param lineId - The ID of the line to which the station should belong.
 * @param code - The station code to search for.
 * @returns The matching StationRow if found; otherwise, null.
 */
export function findStationByCode(
  stationRows: StationRow[],
  currentDateTime: DateTime,
  lineId: string,
  code: string,
) {
  for (const stationRow of stationRows) {
    for (const membership of stationRow.component_memberships) {
      const membershipStartAtDateTime = DateTime.fromISO(membership.started_at);

      if (membershipStartAtDateTime > currentDateTime) {
        continue;
      }

      if (membership.component_id === lineId && membership.code === code) {
        return stationRow;
      }
    }
  }

  return null;
}
