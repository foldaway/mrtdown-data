import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentModel } from '../../model/ComponentModel';
import type { ComponentsOverview } from '../../schema/ComponentsOverview';

export function buildComponentsOverview() {
  const components = ComponentModel.getAll();
  const filePath = join(
    import.meta.dirname,
    '../../../data/product/components_overview.json',
  );

  const content: ComponentsOverview = {
    entries: [],
  };

  for (const component of components) {
    content.entries.push({
      component,
      status: 'operational',
    });
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
