import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Station, StationId } from '../schema/Station';

const dirPathIssue = join(import.meta.dirname, '../../data/source/station');

export const StationModel = {
  getAll(): Station[] {
    const dirFilesIssue = readdirSync(dirPathIssue);
    const result: Station[] = [];

    for (const fileName of dirFilesIssue) {
      const filePath = join(dirPathIssue, fileName);
      const station = JSON.parse(
        readFileSync(filePath, { encoding: 'utf-8' }),
      ) as Station;
      result.push(station);
    }

    return result;
  },

  getOne(id: StationId): Station {
    const fileName = `${id}.json`;
    const filePath = join(dirPathIssue, fileName);
    const station = JSON.parse(
      readFileSync(filePath, { encoding: 'utf-8' }),
    ) as Station;
    return station;
  },

  delete(id: StationId) {
    const fileName = `${id}.json`;
    const filePath = join(dirPathIssue, fileName);
    rmSync(filePath);
  },

  save(station: Station) {
    const fileName = `${station.id}.json`;
    const filePath = join(dirPathIssue, fileName);
    writeFileSync(filePath, JSON.stringify(station, null, 2), {
      encoding: 'utf-8',
    });
  },
};
