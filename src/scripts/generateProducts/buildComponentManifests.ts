import { ComponentModel } from '../../model/ComponentModel';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentManifest } from '../../schema/ComponentManifest';
import { StationModel } from '../../model/StationModel';
import type { Station } from '../../schema/Station';
import type { Component } from '../../schema/Component';

export function buildComponentManifests() {
  const components = ComponentModel.getAll();

  const componentsById: Record<string, Component> = {};
  for (const component of components) {
    componentsById[component.id] = component;
  }

  const stations = StationModel.getAll();

  const stationsByCode: Record<string, Station> = {};
  for (const station of stations) {
    for (const componentMemberEntries of Object.values(
      station.componentMembers,
    )) {
      for (const entry of componentMemberEntries) {
        stationsByCode[entry.code] = station;
      }
    }
  }

  for (const component of components) {
    const filePath = join(
      import.meta.dirname,
      `../../../data/product/component_${component.id}.json`,
    );

    const stationCodes = new Set<string>();
    for (const branchStationCodes of Object.values(component.branches)) {
      for (const stationCode of branchStationCodes) {
        stationCodes.add(stationCode);
      }
    }

    const manifest: ComponentManifest = {
      componentId: component.id,
      componentsById,
      stationsByCode: Object.fromEntries(
        Object.entries(stationsByCode).filter(([code]) =>
          stationCodes.has(code),
        ),
      ),
    };

    writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  }
}
