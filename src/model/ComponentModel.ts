import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Component, ComponentId } from '../schema/Component';

export const ComponentModel = {
  getAllIds(): ComponentId[] {
    const dirPathComponent = join(
      import.meta.dirname,
      '../../data/source/component',
    );
    const dirFilesComponent = readdirSync(dirPathComponent);

    const result: ComponentId[] = [];

    for (const fileName of dirFilesComponent) {
      result.push(basename(fileName, extname(fileName)));
    }

    return result;
  },

  getAll(): Component[] {
    const dirPathComponent = join(
      import.meta.dirname,
      '../../data/source/component',
    );
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
    const dirPathComponent = join(
      import.meta.dirname,
      '../../data/source/component',
    );

    const fileName = `${id}.json`;

    const filePath = join(dirPathComponent, fileName);
    const component = JSON.parse(
      readFileSync(filePath, { encoding: 'utf-8' }),
    ) as Component & { $schema: string };
    return component;
  },
};
