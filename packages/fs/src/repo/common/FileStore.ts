import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IStore } from './store.js';

/**
 * A store for reading and writing files.
 */
export class FileStore implements IStore {
  constructor(private readonly rootDir: string) {}

  readText(path: string): string {
    const fullPath = join(this.rootDir, path);
    return readFileSync(fullPath, { encoding: 'utf-8' });
  }

  readJson<T>(path: string): T {
    return JSON.parse(this.readText(path));
  }

  listDir(path: string): string[] {
    const fullPath = join(this.rootDir, path);
    return readdirSync(fullPath);
  }

  exists(path: string): boolean {
    const fullPath = join(this.rootDir, path);
    return existsSync(fullPath);
  }
}
