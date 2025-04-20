import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { StationTranslatedNames } from '../../schema/StationTranslatedNames';
import { StationModel } from '../../model/StationModel';

const LOCALES = ['en-SG', 'ms', 'zh-Hans', 'ta'];

export function buildStationTranslatedNames() {
  const stations = StationModel.getAll();

  for (const locale of LOCALES) {
    const filePath = join(
      import.meta.dirname,
      `../../../data/product/station_names_${locale}.json`,
    );
    const result: StationTranslatedNames = {};
    for (const station of stations) {
      result[station.id] = station.name_translations[locale] ?? station.name;
    }
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }
}
