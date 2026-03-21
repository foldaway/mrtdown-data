import { join } from 'node:path';
import type { IWriteStore } from './store.js';

type Item = {
  id: string;
};

/**
 * A standard writer for items represented by single JSON files that are stored in a directory.
 */
export class StandardWriter<T extends Item> {
  constructor(
    private readonly store: IWriteStore,
    private readonly dirPath: string,
  ) {}

  create(item: T): void {
    this.store.ensureDir(this.dirPath);
    this.store.writeJson(join(this.dirPath, `${item.id}.json`), item);
  }
}
