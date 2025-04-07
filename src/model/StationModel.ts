import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Station, StationId } from '../schema/Station';
import type { ComponentId } from '../schema/Component';
import { assert } from '../util/assert';

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

  getByComponentId(componentId: ComponentId): Station[] {
    const stations = this.getAll();
    return stations.filter((s) => componentId in s.componentMembers);
  },

  searchByName(names: string[]): Station[] {
    const _names = new Set(names.map((n) => n.toLowerCase()));

    const stations = this.getAll();
    return stations.filter((s) => _names.has(s.name.toLowerCase()));
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
