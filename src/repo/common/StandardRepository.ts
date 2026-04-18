import { join } from 'node:path';
import type { IStore } from './store.js';

type Item = {
  id: string;
};

/**
 * A standard repository for items represented by single JSON files that are stored in a directory.
 */
export class StandardRepository<T extends Item> {
  protected store: IStore;
  protected dirPath: string;
  protected byId = new Map<string, T>();
  protected loaded = false;

  /**
   * Create a new standard repository.
   * @param store
   */
  constructor(store: IStore, dirPath: string) {
    this.store = store;
    this.dirPath = dirPath;
  }

  /**
   * Load all items from the directory.
   */
  protected loadAll() {
    if (this.loaded) {
      return;
    }

    const dirFiles = this.store.listDir(this.dirPath);
    for (const fileName of dirFiles) {
      const filePath = join(this.dirPath, fileName);
      const json = this.store.readJson(filePath);
      try {
        const item = this.parseItem(json);
        this.byId.set(item.id, item);
      } catch (error) {
        console.error(`Error parsing ${filePath}: ${error}`);
        throw error;
      }
    }

    this.loaded = true;
  }

  protected parseItem(_json: unknown): T {
    throw new Error('Not implemented');
  }

  /**
   * Get an item by ID.
   */
  get(id: string): T | null {
    this.loadAll();
    return this.byId.get(id) ?? null;
  }

  /**
   * List all items.
   */
  list(): T[] {
    this.loadAll();
    return Array.from(this.byId.values());
  }
}
