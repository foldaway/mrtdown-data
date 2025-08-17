import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Component, ComponentId } from '../schema/Component.js';

const dirPathComponent = join(
  import.meta.dirname,
  '../../data/source/component',
);

export const ComponentModel = {
  getAllIds(): ComponentId[] {
    const dirFilesComponent = readdirSync(dirPathComponent);

    const result: ComponentId[] = [];

    for (const fileName of dirFilesComponent) {
      result.push(basename(fileName, extname(fileName)));
    }

    return result;
  },

  getAll(): Component[] {
    const dirFilesComponent = readdirSync(dirPathComponent);

    const result: Component[] = [];

    for (const fileName of dirFilesComponent) {
      const filePath = join(dirPathComponent, fileName);
      const component = JSON.parse(
        readFileSync(filePath, { encoding: 'utf-8' }),
      ) as Component;
      result.push(component);
    }

    return result;
  },

  getOne(id: string): Component {
    const fileName = `${id}.json`;

    const filePath = join(dirPathComponent, fileName);
    const component = JSON.parse(
      readFileSync(filePath, { encoding: 'utf-8' }),
    ) as Component & { $schema: string };
    return component;
  },

  save(component: Component) {
    const fileName = `${component.id}.json`;
    const filePath = join(dirPathComponent, fileName);
    writeFileSync(filePath, JSON.stringify(component, null, 2), {
      encoding: 'utf-8',
    });
  },
};
