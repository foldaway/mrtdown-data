import { StationModel } from '../../model/StationModel';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { StationIndex } from '../../schema/StationIndex';

export function buildStationIndex() {
  const filePath = join(
    import.meta.dirname,
    '../../../data/product/station_index.json',
  );

  const result: StationIndex = [];
  for (const station of StationModel.getAll()) {
    result.push(station.id);
  }
  writeFileSync(filePath, JSON.stringify(result, null, 2));
}
