import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LineId } from '../schema/Line.js';
import type { Service } from '../schema/Service.js';

const dirPathService = join(
  import.meta.dirname,
  '../../../legacy/data/service',
);

export const ServiceModel = {
  getAll(): Service[] {
    const dirFilesService = readdirSync(dirPathService);
    const result: Service[] = [];

    for (const fileName of dirFilesService) {
      const filePath = join(dirPathService, fileName);
      const service = JSON.parse(
        readFileSync(filePath, { encoding: 'utf-8' }),
      ) as Service;
      result.push(service);
    }

    return result;
  },

  getOne(id: string): Service {
    const filePath = join(dirPathService, `${id}.json`);
    const service = JSON.parse(
      readFileSync(filePath, { encoding: 'utf-8' }),
    ) as Service;
    return service;
  },

  search(lineIds: LineId[]): Service[] {
    const services = this.getAll();
    return services.filter((s) => lineIds.includes(s.id));
  },
};
