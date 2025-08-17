import { ComponentModel } from '../../model/ComponentModel.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { ComponentIndex } from '../../schema/ComponentIndex.js';

export function buildComponentIndex() {
  const filePath = join(
    import.meta.dirname,
    '../../../data/product/component_index.json',
  );

  const result: ComponentIndex = [];
  for (const component of ComponentModel.getAll()) {
    result.push(component.id);
  }
  writeFileSync(filePath, JSON.stringify(result, null, 2));
}
