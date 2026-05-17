import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { visibleDirEntries } from './dirEntries.js';
import type { IStore } from './store.js';

/**
 * A store for reading and writing files.
 */
export class FileStore implements IStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  readText(path: string): string {
    const fullPath = this.resolvePath(path);
    return readFileSync(fullPath, { encoding: 'utf-8' });
  }

  readJson<T>(path: string): T {
    try {
      return JSON.parse(this.readText(path));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${path}: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  listDir(path: string): string[] {
    const fullPath = this.resolvePath(path);
    return visibleDirEntries(readdirSync(fullPath));
  }

  exists(path: string): boolean {
    const fullPath = this.resolvePath(path);
    return existsSync(fullPath);
  }

  private resolvePath(path: string): string {
    const fullPath = resolve(this.rootDir, path);
    const relativePath = relative(this.rootDir, fullPath);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`Path escapes store root: ${path}`);
    }
    return fullPath;
  }
}
