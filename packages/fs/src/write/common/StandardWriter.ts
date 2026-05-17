import { join } from 'node:path';
import type { IWriteStore } from './store.js';

type Item = {
  id: string;
};

const SAFE_ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * A standard writer for items represented by single JSON files that are stored in a directory.
 */
export class StandardWriter<T extends Item> {
  constructor(
    private readonly store: IWriteStore,
    private readonly dirPath: string,
  ) {}

  create(item: T): void {
    if (!SAFE_ITEM_ID_PATTERN.test(item.id)) {
      throw new Error(`Invalid item id: ${item.id}`);
    }

    this.store.ensureDir(this.dirPath);
    const itemPath = join(this.dirPath, `${item.id}.json`);
    try {
      this.store.createJson(itemPath, item);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        throw new Error(`Item already exists: ${item.id}`, { cause: error });
      }
      throw error;
    }
  }
}
